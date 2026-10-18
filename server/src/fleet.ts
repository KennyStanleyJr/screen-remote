import { EventEmitter } from 'node:events';
import type {
  AppState,
  DeviceItem,
  ProcessorDetail,
  ProcessorView,
  ScanState,
  Unit,
} from '@screen-remote/shared';
import { AlertTracker } from './alerts';
import { defaultScanTargets, expandTargets, scan, type Target } from './discovery';
import { env } from './env';
import { Processor } from './processor';
import type { Store } from './store';
import { TesseraError } from './tessera/client';

interface Entry {
  proc: Processor;
  timer?: NodeJS.Timeout;
  running: boolean;
  again: boolean;
  /** `deviceListAt` of the list last saved as the expected device list. */
  expectedFrom?: number;
}

const OFFLINE_RETRY_MS = 5000;
/** Minimum gap between device list reads triggered by a changing online count. */
const DEVICE_LIST_MS = 5000;
const WATCHED_INTERVAL_MS = 2000;
const SLOW_READ_MS = 15000;
const RESCAN_MS = 120_000;

/** Tracks every known processor, polls them, and builds the app state. */
export class Fleet extends EventEmitter<{ change: [] }> {
  private readonly entries = new Map<string, Entry>();
  private readonly watchers = new Map<string, number>();
  private readonly alerts = new AlertTracker();
  private scanState: ScanState = { running: false };
  private emitTimer: NodeJS.Timeout | undefined;
  private rescanTimer: NodeJS.Timeout | undefined;

  constructor(private readonly store: Store) {
    super();
    this.setMaxListeners(200);
  }

  private get settings() {
    return this.store.state.settings;
  }

  start(): void {
    for (const k of this.store.state.known) this.ensure({ host: k.host, port: k.port }, k.serial);
    for (const t of expandTargets(this.settings.manualHosts)) this.ensure(t);
    void this.scanNow();
    this.rescanTimer = setInterval(() => void this.scanNow(), RESCAN_MS);
  }

  stop(): void {
    clearInterval(this.rescanTimer);
    for (const e of this.entries.values()) clearTimeout(e.timer);
  }

  list(): Processor[] {
    return [...this.entries.values()].map((e) => e.proc);
  }

  get(id: string): Processor | undefined {
    return this.list().find((p) => p.id === id || p.address === id);
  }

  scanTargets(): string[] {
    if (this.settings.scanTargets.length) return this.settings.scanTargets;
    return env.dev ? env.devScanTargets : defaultScanTargets();
  }

  async scanNow(): Promise<void> {
    if (this.scanState.running) return;
    this.scanState = { ...this.scanState, running: true };
    this.changed();
    try {
      const all = expandTargets(this.scanTargets());
      const fresh = all.filter((t) => !this.entries.has(`${t.host}:${t.port}`));
      const found = await scan(fresh, (t, serial) => this.ensure(t, serial));
      const known = all.length - fresh.length;
      this.scanState = { running: false, lastRun: Date.now(), lastFound: found + known };
    } catch (err) {
      console.error('Scan failed', err);
      this.scanState = { ...this.scanState, running: false, lastRun: Date.now() };
    }
    this.changed();
  }

  /** Adds a processor (or moves an existing one to a new address when its serial matches). */
  ensure(target: Target, serial?: string): Processor {
    const address = `${target.host}:${target.port}`;
    const existing = this.entries.get(address);
    if (existing) {
      if (serial) existing.proc.serial = serial;
      return existing.proc;
    }
    if (serial) {
      const moved = this.list().find((p) => p.serial === serial);
      if (moved) this.remove(moved.address);
    }
    const proc = new Processor(target.host, target.port, serial);
    const entry: Entry = { proc, running: false, again: false };
    this.entries.set(address, entry);
    this.persistKnown();
    void this.poll(entry);
    return proc;
  }

  addManual(spec: string): Processor[] {
    const targets = expandTargets([spec]);
    if (targets.length === 0 || targets.length > 16)
      throw new Error('Enter an IP address, e.g. 192.168.0.50');
    if (!this.settings.manualHosts.includes(spec)) this.settings.manualHosts.push(spec);
    this.store.save();
    return targets.map((t) => this.ensure(t));
  }

  forget(id: string): void {
    const proc = this.get(id);
    if (!proc) return;
    this.remove(proc.address);
    this.settings.manualHosts = this.settings.manualHosts.filter(
      (h) => h !== proc.host && h !== proc.address,
    );
    this.store.save();
    this.changed();
  }

  private remove(address: string): void {
    const entry = this.entries.get(address);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.entries.delete(address);
    this.persistKnown();
  }

  private persistKnown(): void {
    this.store.state.known = this.list().map((p) => ({
      host: p.host,
      port: p.port,
      serial: p.serial,
    }));
    this.store.save();
  }

  resetBaseline(id: string): void {
    const proc = this.get(id);
    const online = proc?.onlineDevices();
    if (!proc?.serial || online === undefined) return;
    this.store.state.baselines[proc.serial] = online;
    if (proc.deviceListCurrent()) this.saveExpectedDevices(proc);
    else delete this.store.state.expectedDevices[proc.serial];
    this.store.save();
    this.changed();
  }

  private saveExpectedDevices(proc: Processor): void {
    if (!proc.serial) return;
    const list = proc.deviceList().map(({ serial, type }) => ({ serial, type }));
    const prev = this.store.state.expectedDevices[proc.serial];
    if (prev?.length === list.length && prev.every((d, i) => d.serial === list[i]?.serial)) return;
    this.store.state.expectedDevices[proc.serial] = list;
    this.store.save();
  }

  /** Devices from the expected list the processor no longer reports. */
  private missingDevices(proc: Processor): DeviceItem[] | undefined {
    const expected = proc.serial ? this.store.state.expectedDevices[proc.serial] : undefined;
    if (!expected || !proc.deviceListCurrent()) return undefined;
    const present = new Set(proc.itemKeys('devices.items'));
    return expected.filter((d) => !present.has(d.serial));
  }

  /** Registers interest in a processor's detail data. Returns an unsubscribe function. */
  watch(id: string): () => void {
    this.watchers.set(id, (this.watchers.get(id) ?? 0) + 1);
    const proc = this.get(id);
    if (proc && Date.now() - proc.detailAt > WATCHED_INTERVAL_MS) this.refreshSoon(proc);
    return () => {
      const n = (this.watchers.get(id) ?? 1) - 1;
      if (n <= 0) this.watchers.delete(id);
      else this.watchers.set(id, n);
    };
  }

  private isWatched(proc: Processor): boolean {
    return this.watchers.has(proc.id) || this.watchers.has(proc.address);
  }

  /** Re-polls soon, e.g. right after a command so the UI reflects the result. */
  refreshSoon(proc: Processor): void {
    const entry = this.entries.get(proc.address);
    if (!entry) return;
    if (entry.running) {
      entry.again = true;
      return;
    }
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => void this.poll(entry), 150);
  }

  private async poll(entry: Entry): Promise<void> {
    const { proc } = entry;
    if (this.entries.get(proc.address) !== entry) return;
    entry.running = true;
    const watched = this.isWatched(proc);
    try {
      await proc.pollSummary(this.settings.profileOverride);
      if (watched) await proc.pollDetail(Date.now() - proc.slowAt > SLOW_READ_MS);
      const online = proc.onlineDevices();
      if (
        online !== undefined &&
        online !== proc.deviceListOnline &&
        Date.now() - proc.deviceListAt > DEVICE_LIST_MS
      ) {
        await proc.refreshDeviceList();
      }
      proc.reachable = true;
      proc.failures = 0;
      proc.error = undefined;
      proc.lastSeen = Date.now();
      this.afterPoll(entry);
    } catch (err) {
      proc.failures++;
      proc.error = err instanceof TesseraError ? err.message : String(err);
      if (proc.failures >= 2 || proc.lastSeen === null) proc.reachable = false;
    }
    entry.running = false;
    this.changed();

    if (this.entries.get(proc.address) !== entry) return;
    const delay = entry.again
      ? 150
      : !proc.reachable
        ? OFFLINE_RETRY_MS
        : watched
          ? WATCHED_INTERVAL_MS
          : this.settings.summaryIntervalMs;
    entry.again = false;
    entry.timer = setTimeout(() => void this.poll(entry), delay);
  }

  private afterPoll(entry: Entry): void {
    const { proc } = entry;
    if (proc.serial) {
      const online = proc.onlineDevices();
      const prev = this.store.state.baselines[proc.serial];
      if (online !== undefined && (prev === undefined || online > prev)) {
        this.store.state.baselines[proc.serial] = online;
        this.store.save();
      }
      if (
        online === this.store.state.baselines[proc.serial] &&
        proc.deviceListCurrent() &&
        entry.expectedFrom !== proc.deviceListAt
      ) {
        this.saveExpectedDevices(proc);
        entry.expectedFrom = proc.deviceListAt;
      }
      const known = this.store.state.known.find(
        (k) => k.host === proc.host && k.port === proc.port,
      );
      if (known && known.serial !== proc.serial) this.persistKnown();
    }
    for (const loop of proc.cableLoops()) if (loop.ok) proc.loopsSeenOk.add(loop.loop);
  }

  private changed(): void {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = undefined;
      this.emit('change');
    }, 300);
  }

  /** Pushes state now, e.g. right after a command, Show Mode or settings change. */
  notify(): void {
    clearTimeout(this.emitTimer);
    this.emitTimer = undefined;
    this.emit('change');
  }

  views(): ProcessorView[] {
    const { labels } = this.settings;
    return this.list()
      .map((p) => {
        const label = labels[p.id] ?? (p.serial ? labels[p.serial] : undefined);
        const baseline = p.serial ? this.store.state.baselines[p.serial] : undefined;
        return p.view(label, baseline, this.missingDevices(p));
      })
      .sort((a, b) => displayName(a).localeCompare(displayName(b), undefined, { numeric: true }));
  }

  detail(id: string): ProcessorDetail | null {
    const proc = this.get(id);
    return proc && proc.detailAt > 0 ? proc.detail() : null;
  }

  state(extra: Pick<AppState, 'showMode' | 'pendingRestores'>): AppState {
    const processors = this.views();
    const lostLoops = (id: string) => {
      const proc = this.get(id);
      if (!proc) return [];
      return proc
        .cableLoops()
        .filter((l) => !l.ok && proc.loopsSeenOk.has(l.loop))
        .map((l) => l.loop);
    };
    return {
      serverTime: Date.now(),
      ...extra,
      processors,
      units: buildUnits(processors),
      alerts: this.alerts.compute(processors, this.settings.thresholds, lostLoops),
      scan: this.scanState,
      thresholds: this.settings.thresholds,
    };
  }
}

export function displayName(p: Pick<ProcessorView, 'label' | 'name' | 'host'>): string {
  return p.label ?? p.name ?? p.host;
}

/** Groups processors into failover pairs (matched by partner serial) and standalone units. */
export function buildUnits(processors: ProcessorView[]): Unit[] {
  const pairs = new Map<string, Extract<Unit, { kind: 'pair' }>>();
  const units: Unit[] = [];

  for (const p of processors) {
    const f = p.failover;
    if (!f?.enabled || !p.serial || !f.partnerSerial) {
      units.push({ kind: 'single', key: p.id, id: p.id });
      continue;
    }
    const key = [p.serial, f.partnerSerial].sort().join('|');
    let pair = pairs.get(key);
    if (!pair) {
      pair = { kind: 'pair', key };
      pairs.set(key, pair);
      units.push(pair);
    }
    if (f.role === 'backup') {
      pair.backupId = p.id;
      pair.backupSerial = p.serial;
      pair.primarySerial ??= f.partnerSerial;
    } else {
      pair.primaryId = p.id;
      pair.primarySerial = p.serial;
      pair.backupSerial ??= f.partnerSerial;
    }
  }
  return units;
}
