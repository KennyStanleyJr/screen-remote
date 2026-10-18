import {
  commandIds,
  commandMeta,
  defaultProfile,
  getProfile,
  selectProfile,
  type CableLoop,
  type DeviceItem,
  type EndpointKey,
  type ProcessorDetail,
  type ProcessorView,
  type TesseraProfile,
} from '@screen-remote/shared';
import { TesseraClient, TesseraError } from './tessera/client';
import { asBool, asNum, asStr, fillPath, isTree, setAt, valueAt, type Tree } from './tessera/tree';

type Params = Record<string, string | number>;

/** Input metadata reads -1 or 0 when there is no signal. */
function positive(v: unknown): number | undefined {
  const n = asNum(v);
  return n !== undefined && n > 0 ? n : undefined;
}

/** One processor on the network: its client, last raw API data, and derived view. */
export class Processor {
  readonly client: TesseraClient;
  /** Raw API data, merged into one tree rooted at `/api/`. */
  raw: Tree = {};
  profile: TesseraProfile = defaultProfile;
  serial: string | undefined;
  reachable = false;
  lastSeen: number | null = null;
  error: string | undefined;
  failures = 0;
  detailAt = 0;
  slowAt = 0;
  /** Last time anything in `raw` changed because of a poll or a write. */
  changedAt = 0;
  /** Subtrees the processor refused as a whole; read leaf by leaf instead. */
  private readonly leafOnly = new Set<string>();
  /**
   * Values written recently. A poll that started before a write can return the old value, so
   * these are re-applied over any read that began before them.
   */
  private readonly writes = new Map<string, { value: unknown; at: number }>();
  private portsLoaded = false;
  /** When `devices/items` was last read, and the online count at that moment. */
  deviceListAt = 0;
  deviceListOnline: number | undefined;
  /** Cable loops seen healthy this session; losing one raises an alert. */
  readonly loopsSeenOk = new Set<number>();

  constructor(
    readonly host: string,
    readonly port: number,
    serial?: string,
  ) {
    this.client = new TesseraClient(host, port);
    this.serial = serial;
  }

  get address(): string {
    return `${this.host}:${this.port}`;
  }

  get id(): string {
    return this.serial ?? this.address;
  }

  spec(key: EndpointKey) {
    return this.profile.endpoints[key];
  }

  read(key: EndpointKey, params?: Params): unknown {
    const spec = this.spec(key);
    if (!spec) return undefined;
    try {
      return valueAt(this.raw, fillPath(spec.path, params));
    } catch {
      return undefined;
    }
  }

  /** Keys of a dynamic collection, e.g. group numbers under `groups/items`. */
  itemKeys(key: EndpointKey): string[] {
    const node = this.read(key);
    return isTree(node) ? Object.keys(node) : [];
  }

  applyProfile(override: string): void {
    const version = asStr(this.read('system.softwareVersion'));
    this.profile =
      override !== 'auto'
        ? (getProfile(override) ?? selectProfile(version))
        : selectProfile(version);
  }

  /** Records a value the processor accepted, so the UI shows it before the next poll. */
  noteWrite(path: string, value: unknown): void {
    const at = Date.now();
    setAt(this.raw, path, value);
    this.writes.set(path, { value, at });
    this.changedAt = at;
    for (const [p, w] of this.writes) if (at - w.at > 10_000) this.writes.delete(p);
  }

  private store(path: string, value: unknown, startedAt: number): void {
    setAt(this.raw, path, value);
    for (const [p, w] of this.writes) {
      if (w.at >= startedAt && (p === path || p.startsWith(`${path}/`)))
        setAt(this.raw, p, w.value);
    }
    this.changedAt = Date.now();
  }

  /** Fetches a subtree into `raw`. Falls back to individual leaves if the processor refuses it. */
  async fetchSubtree(path: string): Promise<void> {
    if (!this.leafOnly.has(path)) {
      const startedAt = Date.now();
      try {
        this.store(path, await this.client.get(path), startedAt);
        return;
      } catch (err) {
        if (!(err instanceof TesseraError) || err.kind === 'network') throw err;
        this.leafOnly.add(path);
      }
    }
    const leaves = Object.values(this.profile.endpoints).filter(
      (s) =>
        s.access !== 'W' &&
        s.type !== 'tree' &&
        !s.path.includes('{') &&
        s.path.startsWith(`${path}/`),
    );
    for (const leaf of leaves) {
      const startedAt = Date.now();
      try {
        this.store(leaf.path, await this.client.get(leaf.path), startedAt);
      } catch (err) {
        if (err instanceof TesseraError && err.kind === 'network') throw err;
      }
    }
  }

  private async tryFetch(path: string): Promise<void> {
    try {
      await this.fetchSubtree(path);
    } catch (err) {
      if (err instanceof TesseraError && err.kind === 'network') throw err;
    }
  }

  /**
   * Input ports the processor has. `number` is the 1-based value `input.activePortNumber` uses
   * (SDI A = 1); `key` is the port's key under `input/ports/{type}/`, which SX40s number from 0.
   */
  inputPorts(): { type: string; number: number; key: string }[] {
    return this.itemKeys('input.ports').flatMap((type) => {
      const node = valueAt(this.raw, `input/ports/${type}`);
      if (!isTree(node)) return [];
      const keys = Object.keys(node).filter((k) => /^\d+$/.test(k));
      const offset = keys.includes('0') ? 1 : 0;
      return keys
        .map((key) => ({ type: type.toLowerCase(), number: Number(key) + offset, key }))
        .sort((a, b) => a.number - b.number);
    });
  }

  /** Path parameters for an input port's meta-data, or undefined if the processor lacks it. */
  private portParams(type: string | undefined, number: number | undefined): Params | undefined {
    if (!type || number === undefined) return undefined;
    const ports = this.inputPorts();
    if (!ports.length) return { portType: type, portNumber: number };
    const port = ports.find((p) => p.type === type.toLowerCase() && p.number === number);
    return port && { portType: port.type, portNumber: port.key };
  }

  private async loadPorts(): Promise<void> {
    const ports = this.spec('input.ports');
    if (!ports || this.portsLoaded) return;
    await this.tryFetch(ports.path);
    this.portsLoaded = true;
  }

  async pollSummary(profileOverride: string): Promise<void> {
    for (const path of this.profile.summaryReads) await this.fetchSubtree(path);
    this.serial = asStr(this.read('system.serial')) ?? this.serial;
    this.applyProfile(profileOverride);
    await this.loadPorts();

    const params = this.portParams(
      asStr(this.read('input.activePortType')),
      asNum(this.read('input.activePortNumber')),
    );
    const meta = this.spec('input.portMetaData');
    if (meta && params) await this.tryFetch(fillPath(meta.path, params));
  }

  onlineDevices(): number | undefined {
    return asNum(this.read('devices.onlineCount'));
  }

  /** Devices the processor currently reports. */
  deviceList(): DeviceItem[] {
    return this.itemKeys('devices.items').map((serial) => ({
      serial,
      type: asStr(this.read('device.type', { serial })),
      firmware: asStr(this.read('device.firmware', { serial })),
    }));
  }

  /** True when the device list was read at the current online count. */
  deviceListCurrent(): boolean {
    return this.deviceListAt > 0 && this.deviceListOnline === this.onlineDevices();
  }

  /** Reads the device list. Only called when the online count changes, so it stays rare. */
  async refreshDeviceList(): Promise<void> {
    const spec = this.spec('devices.items');
    if (!spec) return;
    await this.tryFetch(spec.path);
    this.deviceListAt = Date.now();
    this.deviceListOnline = this.onlineDevices();
  }

  async pollDetail(includeSlow: boolean): Promise<void> {
    for (const path of this.profile.detailReads) await this.fetchSubtree(path);
    if (includeSlow) {
      for (const path of this.profile.slowReads) await this.fetchSubtree(path);
      if (this.spec('devices.items')) {
        this.deviceListAt = Date.now();
        this.deviceListOnline = this.onlineDevices();
      }
    }
    const meta = this.spec('input.portMetaData');
    if (meta && includeSlow) {
      for (const p of this.inputPorts()) {
        await this.tryFetch(fillPath(meta.path, { portType: p.type, portNumber: p.key }));
      }
    }
    this.detailAt = Date.now();
    if (includeSlow) this.slowAt = this.detailAt;
  }

  capabilities(): string[] {
    return commandIds.filter((id) => commandMeta[id].requires.every((k) => this.spec(k)));
  }

  cableLoops(): CableLoop[] {
    return this.itemKeys('output.cableLoops')
      .map((key) => {
        const loop = Number(key);
        const state = asStr(this.read('cableLoop.state', { loop: key })) ?? 'unknown';
        return { loop, state, ok: /^loop-found/i.test(state) };
      })
      .filter((l) => Number.isFinite(l.loop))
      .sort((a, b) => a.loop - b.loop);
  }

  view(
    label: string | undefined,
    baseline: number | undefined,
    missing?: DeviceItem[],
  ): ProcessorView {
    const r = (k: EndpointKey, p?: Params) => this.read(k, p);
    const hasData = this.lastSeen !== null;

    const portType = asStr(r('input.activePortType'));
    const portNumber = asNum(r('input.activePortNumber'));
    const portParams = this.portParams(portType, portNumber);
    const width = portParams ? positive(r('input.width', portParams)) : undefined;
    const height = portParams ? positive(r('input.height', portParams)) : undefined;
    const refreshRate = portParams ? positive(r('input.refreshRate', portParams)) : undefined;

    const role = asStr(r('failover.role'));
    const type = r('testPattern.type');

    return {
      id: this.id,
      host: this.host,
      port: this.port,
      reachable: this.reachable,
      lastSeen: this.lastSeen,
      error: this.error,
      label,
      serial: this.serial,
      name: asStr(r('system.processorName')),
      type: asStr(r('system.processorType')),
      softwareVersion: asStr(r('system.softwareVersion')),
      profileId: this.profile.id,
      projectName: asStr(r('project.name')),
      uptime: asStr(r('system.uptime')),
      failover: hasData
        ? {
            enabled: asBool(r('failover.enabled')) ?? false,
            role: role === 'primary' || role === 'backup' ? role : undefined,
            isActive: asBool(r('failover.isActive')),
            partnerPresent: asBool(r('failover.partnerPresent')),
            partnerName: asStr(r('failover.partnerName')) || undefined,
            partnerSerial: asStr(r('failover.partnerSerial')) || undefined,
            partnerAbsence: asStr(r('failover.partnerAbsence')),
            partnerVideoAbsence: asStr(r('failover.partnerVideoAbsence')),
            modes: {
              onButtonPress: asBool(r('failover.modeOnButtonPress')),
              onPartnerFail: asBool(r('failover.modeOnPartnerFail')),
              onPartnerVideoFail: asBool(r('failover.modeOnPartnerVideoFail')),
              preferPrimary: asBool(r('failover.modePreferPrimary')),
            },
          }
        : null,
      input: hasData
        ? {
            portType,
            portNumber,
            width,
            height,
            refreshRate,
            bitDepth: portParams ? positive(r('input.bitDepth', portParams)) : undefined,
            hdrFormat: portParams ? asStr(r('input.hdrFormat', portParams)) : undefined,
            hasSignal: Boolean(width && height && refreshRate),
          }
        : null,
      overrides: hasData
        ? {
            blackout: asBool(r('blackout.enabled')) ?? false,
            freeze: asBool(r('freeze.enabled')) ?? false,
            testPattern: asBool(r('testPattern.enabled')) ?? false,
            testPatternType: typeof type === 'number' ? type : asStr(type),
          }
        : null,
      devices: {
        online: asNum(r('devices.onlineCount')),
        errors: asNum(r('devices.errorCount')),
        associated: asNum(r('devices.associatedCount')),
        baseline,
        missing,
      },
      temperatures: this.profile.temperatures.flatMap((t) => {
        const value = asNum(valueAt(this.raw, t.path));
        return value === undefined ? [] : [{ key: t.key, label: t.label, value }];
      }),
      fans: this.profile.fans.flatMap((f) => {
        const rpm = asNum(valueAt(this.raw, f.speedPath));
        const ok = asBool(valueAt(this.raw, f.statusPath));
        return rpm === undefined && ok === undefined
          ? []
          : [{ key: f.key, label: f.label, rpm, ok }];
      }),
      preset: {
        number: asNum(r('presets.activeNumber')),
        name: asStr(r('presets.activeName')),
      },
      frameStore: this.itemKeys('frameStore.frames')
        .map((key) => ({
          frame: Number(key),
          name: asStr(r('frameStore.frameName', { frame: key })) ?? `Frame ${key}`,
        }))
        .filter((f) => Number.isInteger(f.frame))
        .sort((a, b) => a.frame - b.frame),
      cableLoops: this.cableLoops(),
      capabilities: this.capabilities(),
    };
  }

  detail(): ProcessorDetail {
    const r = (k: EndpointKey, p?: Params) => this.read(k, p);
    const ports = this.inputPorts();
    return {
      updatedAt: Math.max(this.detailAt, this.changedAt),
      output: {
        brightness: asNum(r('output.brightness')),
        colourTemperature: asNum(r('output.colourTemperature')),
        gamma: asNum(r('output.gamma')),
        brightnessLimitEnabled: asBool(r('output.brightnessLimitEnabled')),
        brightnessLimitValue: asNum(r('output.brightnessLimitValue')),
        bitDepth: asNum(r('output.bitDepth')),
        frameRateMultiplier: asNum(r('output.frameRateMultiplier')),
        genlockSource: asStr(r('output.genlockSource')),
        genlockInternalRate: asNum(r('output.genlockInternalRate')),
      },
      groups: this.itemKeys('groups.items')
        .map((key) => ({
          number: Number(key),
          name: asStr(r('group.name', { group: key })) ?? `Group ${key}`,
          override: asBool(r('group.globalColourOverride', { group: key })),
          brightness: asNum(r('group.brightness', { group: key })),
          colourTemperature: asNum(r('group.colourTemperature', { group: key })),
          gamma: asNum(r('group.gamma', { group: key })),
        }))
        .filter((g) => Number.isInteger(g.number))
        .sort((a, b) => a.number - b.number),
      devices: this.deviceList().sort(
        (a, b) => (a.type ?? '').localeCompare(b.type ?? '') || a.serial.localeCompare(b.serial),
      ),
      presets: this.itemKeys('presets.items')
        .map((key) => ({
          number: Number(key),
          name: asStr(r('preset.name', { number: key })) ?? `Preset ${key}`,
          active: asBool(r('preset.status', { number: key })) ?? false,
        }))
        .filter((p) => Number.isInteger(p.number))
        .sort((a, b) => a.number - b.number),
      inputs: ports.map((p) => {
        const params = { portType: p.type, portNumber: p.key };
        const width = positive(r('input.width', params));
        const height = positive(r('input.height', params));
        const refreshRate = positive(r('input.refreshRate', params));
        const many = ports.filter((q) => q.type === p.type).length > 1;
        const suffix = !many
          ? ''
          : p.type === 'sdi'
            ? ` ${String.fromCharCode(64 + p.number)}`
            : ` ${p.number}`;
        return {
          type: p.type,
          number: p.number,
          label: `${p.type.toUpperCase()}${suffix}`,
          hasSignal: Boolean(width && height && refreshRate),
          width,
          height,
          refreshRate,
        };
      }),
    };
  }
}
