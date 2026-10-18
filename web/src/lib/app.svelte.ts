import {
  commandMeta,
  type AppState,
  type CommandArgs,
  type CommandId,
  type CommandRequest,
  type CommandResult,
  type ProcessorDetail,
  type SessionInfo,
} from '@screen-remote/shared';
import { displayName, hasOverride, setServerTime } from './format';
import { predict, type Prediction } from './optimistic';
import { errorCode, errorMessage, trpc } from './trpc';
import { ui, type ConfirmOptions } from './ui.svelte';

interface RunOptions {
  /** Custom confirm for destructive commands. */
  confirm?: ConfirmOptions;
}

interface Patch extends Prediction {
  ids: Set<string>;
  until: number;
}

/** How long a predicted value is held while the processor catches up. */
const PATCH_MS = 4000;

class AppStore {
  state = $state<AppState | null>(null);
  /** Detail data for processors someone has open, keyed by processor id. */
  details = $state<Record<string, ProcessorDetail | null>>({});
  session = $state<SessionInfo | null>(null);
  connected = $state(false);
  busy = $state(false);
  private started = false;
  private patches: Patch[] = [];
  private seenCritical: Set<string> | null = null;

  get showMode(): boolean {
    return this.state?.showMode.enabled ?? true;
  }

  get canCommand(): boolean {
    return !this.showMode && Boolean(this.session?.unlocked);
  }

  processor(id: string | undefined) {
    return this.state?.processors.find((p) => p.id === id);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.refreshSession();
    trpc.state.live.subscribe(undefined, {
      onData: (data) => {
        setServerTime(data.serverTime);
        if (data.showMode.enabled && this.state && !this.state.showMode.enabled) {
          void this.refreshSession();
        }
        this.state = this.patchState(data);
        this.connected = true;
        this.toastNewCritical(data);
      },
      onError: () => {
        this.connected = false;
      },
      onConnectionStateChange: (s) => {
        if (s.state !== 'pending') this.connected = false;
      },
    });
  }

  setDetail(id: string, detail: ProcessorDetail | null): void {
    this.details[id] = detail ? this.patchDetail(id, detail) : null;
  }

  private livePatches(): Patch[] {
    const now = Date.now();
    this.patches = this.patches.filter((p) => p.until > now && p.ids.size > 0);
    return this.patches;
  }

  private patchState(s: AppState): AppState {
    for (const patch of this.livePatches()) {
      if (!patch.view) continue;
      for (const p of s.processors) if (patch.ids.has(p.id)) patch.view(p);
    }
    return s;
  }

  private patchDetail(id: string, d: ProcessorDetail): ProcessorDetail {
    for (const patch of this.livePatches()) if (patch.ids.has(id)) patch.detail?.(d);
    return d;
  }

  private predict(targets: string[], prediction: Prediction): Patch {
    const patch: Patch = { ...prediction, ids: new Set(targets), until: Date.now() + PATCH_MS };
    this.patches.push(patch);
    for (const id of targets) {
      const p = this.processor(id);
      if (p) patch.view?.(p);
      const d = this.details[id];
      if (d) patch.detail?.(d);
    }
    return patch;
  }

  private toastNewCritical(s: AppState): void {
    const critical = s.alerts.filter((a) => a.severity === 'critical');
    const first = this.seenCritical === null;
    const seen = new Set(critical.map((a) => a.id));
    if (!first) {
      for (const a of critical) if (!this.seenCritical!.has(a.id)) ui.toast('error', a.message);
    }
    this.seenCritical = seen;
  }

  async refreshSession(): Promise<void> {
    try {
      this.session = await trpc.session.get.query();
    } catch {
      // Shown via the connection banner.
    }
  }

  /** Prompts for the PIN until it is accepted or the user cancels. */
  async unlock(title = 'Enter setup PIN'): Promise<boolean> {
    if (this.session?.unlocked) return true;
    let error: string | undefined;
    for (;;) {
      const pin = await ui.askPin(title, 'Unlocks this device for setup commands.', error);
      if (pin === null) return false;
      try {
        this.session = await trpc.session.unlock.mutate({ pin });
        return true;
      } catch (err) {
        error = errorMessage(err);
      }
    }
  }

  async lock(): Promise<void> {
    this.session = await trpc.session.lock.mutate();
  }

  async leaveShowMode(): Promise<boolean> {
    let error: string | undefined;
    for (;;) {
      const pin = await ui.askPin(
        'Enter Setup Mode',
        'Commands will be able to reach the processors.',
        error,
      );
      if (pin === null) return false;
      try {
        this.session = await trpc.showMode.disable.mutate({ pin });
        return true;
      } catch (err) {
        error = errorMessage(err);
      }
    }
  }

  async enterShowMode(): Promise<void> {
    const active = (this.state?.processors ?? []).filter(hasOverride);
    if (active.length) {
      const names = active.map((p) => displayName(p)).join(', ');
      const ok = await ui.askConfirm({
        title: 'Overrides still active',
        message: `Test pattern, blackout, or freeze is still on for: ${names}. Temporary patterns from Identify or Pixel check will be restored automatically. Turn on Show Mode anyway?`,
        confirmLabel: 'Turn on Show Mode',
      });
      if (!ok) return;
    }
    try {
      const { failed } = await trpc.showMode.enable.mutate();
      await this.refreshSession();
      if (failed.length) {
        const names = failed.map((id) => displayName(this.processor(id))).join(', ');
        ui.toast(
          'error',
          `Show Mode is on, but the previous pattern could not be put back on ${names}. Check those screens.`,
        );
      }
    } catch (err) {
      ui.toast('error', errorMessage(err));
    }
  }

  async toggleShowMode(): Promise<void> {
    if (this.showMode) await this.leaveShowMode();
    else await this.enterShowMode();
  }

  /**
   * Runs a processor command, prompting for PIN / confirmation as needed. The expected result is
   * shown straight away; only failures raise a notification.
   */
  async run<C extends CommandId>(
    targets: string[],
    command: C,
    args: CommandArgs<C>,
    options: RunOptions = {},
  ): Promise<CommandResult | null> {
    if (targets.length === 0) return null;
    if (this.showMode) {
      const ok = await ui.askConfirm({
        title: 'Show Mode is on',
        message: 'Commands are blocked during Show Mode. Leave Show Mode to make changes?',
        confirmLabel: 'Leave Show Mode',
      });
      if (!ok || !(await this.leaveShowMode())) return null;
    }
    if (!(await this.unlock())) return null;

    const meta = commandMeta[command];
    let confirm = false;
    if (meta.destructive) {
      const names = targets.map((id) => displayName(this.processor(id))).join(', ');
      confirm = await ui.askConfirm(
        options.confirm ?? {
          title: meta.label,
          message: `${meta.label} on ${names}?`,
          confirmLabel: meta.label,
          danger: true,
        },
      );
      if (!confirm) return null;
    }

    const patch = this.predict(targets, predict(command, args));
    this.busy = true;
    try {
      const request = { targets, command, args, confirm } as CommandRequest;
      const result = await trpc.commands.run.mutate(request);
      const failed = result.results.filter((r) => !r.ok);
      for (const f of failed) patch.ids.delete(f.id);
      if (failed.length) {
        const detail = failed
          .map((f) => `${displayName(this.processor(f.id))}: ${f.error ?? 'failed'}`)
          .join('; ');
        ui.toast('error', detail);
      }
      return result;
    } catch (err) {
      patch.ids.clear();
      if (errorCode(err) === 'UNAUTHORIZED') await this.refreshSession();
      ui.toast('error', errorMessage(err));
      return null;
    } finally {
      this.busy = false;
    }
  }
}

export const app = new AppStore();
