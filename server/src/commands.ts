import {
  commandMeta,
  type Command,
  type CommandRequest,
  type CommandResult,
  type EndpointKey,
  type EndpointSpec,
  type TesseraProfile,
} from '@screen-remote/shared';
import { AccessError, type Access, type Session } from './access';
import type { AuditLog } from './audit';
import { displayName, type Fleet } from './fleet';
import type { Processor } from './processor';
import { TesseraError } from './tessera/client';
import { asBool, fillPath } from './tessera/tree';

type Params = Record<string, string | number>;

interface Step {
  key: EndpointKey;
  params?: Params;
  value: unknown;
}

interface SavedPattern {
  enabled: boolean;
  type: unknown;
  reason: 'identify' | 'check';
  timer?: NodeJS.Timeout;
}

const IDENTIFY_PATTERN = 'grid';
const IDENTIFY_MS = 6000;

class StepError extends Error {}

function validate(
  spec: EndpointSpec | undefined,
  value: unknown,
  profile: TesseraProfile,
): EndpointSpec {
  if (!spec) throw new StepError('Not supported on this processor version');
  if (spec.access === 'R') throw new StepError('That setting is read-only');
  const range = (n: number) => {
    if (spec.min !== undefined && n < spec.min) throw new StepError(`Must be at least ${spec.min}`);
    if (spec.max !== undefined && n > spec.max) throw new StepError(`Must be at most ${spec.max}`);
  };
  switch (spec.type) {
    case 'bool':
      if (typeof value !== 'boolean') throw new StepError('Expected on/off');
      break;
    case 'int':
      if (!Number.isInteger(value)) throw new StepError('Expected a whole number');
      range(value as number);
      break;
    case 'float':
      if (typeof value !== 'number' || !Number.isFinite(value))
        throw new StepError('Expected a number');
      range(value);
      break;
    case 'string':
      if (typeof value !== 'string' || value.length > 128)
        throw new StepError('Expected short text');
      break;
    case 'enum':
      if (typeof value !== 'string' || !spec.values?.includes(value)) {
        throw new StepError('Unsupported value');
      }
      break;
    case 'testpattern':
      if (typeof value === 'number') {
        if (!Number.isInteger(value)) throw new StepError('Bad frame number');
        range(value);
      } else if (typeof value !== 'string' || !profile.testPatterns.includes(value)) {
        throw new StepError('Unknown test pattern');
      }
      break;
    default:
      throw new StepError('That setting cannot be written');
  }
  return spec;
}

function showPattern(type: unknown): Step[] {
  return [
    { key: 'testPattern.type', value: type },
    { key: 'testPattern.enabled', value: true },
  ];
}

/** Turns a command into endpoint writes for one processor. Throws StepError when not allowed. */
function plan(cmd: Command, proc: Processor): Step[] {
  const view = proc.view(undefined, undefined);
  switch (cmd.command) {
    case 'testPattern.show':
    case 'patternCheck.step':
      if (
        typeof cmd.args.type === 'number' &&
        !view.frameStore.some((f) => f.frame === cmd.args.type)
      ) {
        throw new StepError(`No stored frame ${cmd.args.type}`);
      }
      return showPattern(cmd.args.type);
    case 'testPattern.off':
      return [{ key: 'testPattern.enabled', value: false }];
    case 'blackout.set':
      return [{ key: 'blackout.enabled', value: cmd.args.enabled }];
    case 'freeze.set':
      return [{ key: 'freeze.enabled', value: cmd.args.enabled }];
    case 'output.brightness':
      return [{ key: 'output.brightness', value: cmd.args.nits }];
    case 'output.colourTemperature':
      return [{ key: 'output.colourTemperature', value: cmd.args.kelvin }];
    case 'output.gamma':
      return [{ key: 'output.gamma', value: Math.round(cmd.args.gamma * 100) / 100 }];
    case 'input.select': {
      const { portType, portNumber } = cmd.args;
      const ports = proc.inputPorts();
      if (ports.length && !ports.some((p) => p.type === portType && p.number === portNumber)) {
        throw new StepError(`This processor has no ${portType.toUpperCase()} ${portNumber} input`);
      }
      return [
        { key: 'input.activePortType', value: portType },
        { key: 'input.activePortNumber', value: portNumber },
      ];
    }
    case 'group.override':
    case 'group.brightness':
    case 'group.colourTemperature':
    case 'group.gamma': {
      const params = { group: cmd.args.group };
      if (!proc.itemKeys('groups.items').includes(String(cmd.args.group))) {
        throw new StepError(`No screen group ${cmd.args.group}`);
      }
      if (cmd.command === 'group.override') {
        return [{ key: 'group.globalColourOverride', params, value: cmd.args.enabled }];
      }
      if (cmd.command === 'group.brightness') {
        return [{ key: 'group.brightness', params, value: cmd.args.nits }];
      }
      if (cmd.command === 'group.colourTemperature') {
        return [{ key: 'group.colourTemperature', params, value: cmd.args.kelvin }];
      }
      return [{ key: 'group.gamma', params, value: Math.round(cmd.args.gamma * 100) / 100 }];
    }
    case 'preset.recall':
    case 'preset.rename': {
      const known = proc.itemKeys('presets.items');
      if (known.length && !known.includes(String(cmd.args.number))) {
        throw new StepError(`No preset ${cmd.args.number}`);
      }
      return cmd.command === 'preset.recall'
        ? [{ key: 'presets.activeNumber', value: cmd.args.number }]
        : [{ key: 'preset.name', params: { number: cmd.args.number }, value: cmd.args.name }];
    }
    case 'frameStore.recall':
      if (!view.frameStore.some((f) => f.frame === cmd.args.frame)) {
        throw new StepError(`No stored frame ${cmd.args.frame}`);
      }
      return showPattern(cmd.args.frame);
    case 'frameStore.rename':
      return [
        { key: 'frameStore.frameName', params: { frame: cmd.args.frame }, value: cmd.args.name },
      ];
    case 'frameStore.capture':
      return [{ key: 'frameStore.capture', value: cmd.args.frame }];
    case 'frameStore.delete':
      return [{ key: 'frameStore.delete', value: cmd.args.frame }];
    case 'identify':
      return showPattern(IDENTIFY_PATTERN);
    case 'patternCheck.begin':
    case 'patternCheck.end':
      return [];
    case 'failover.request':
      if (!view.failover?.enabled) throw new StepError('Failover is not enabled');
      if (!view.failover.partnerPresent) throw new StepError('Partner is not present');
      return [{ key: 'failover.request', value: '' }];
    case 'system.reboot':
      return [{ key: 'system.reboot', value: cmd.args.password ?? '' }];
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** The only path by which the app writes to processors. */
export class CommandRunner {
  private readonly saved = new Map<string, SavedPattern>();

  constructor(
    private readonly fleet: Fleet,
    private readonly access: Access,
    private readonly audit: AuditLog,
  ) {}

  pendingRestores(): string[] {
    return [...this.saved.keys()];
  }

  async run(req: CommandRequest, session: Session, ip: string): Promise<CommandResult> {
    const { targets: ids, confirm, ...cmd } = req;
    const device = this.access.deviceName(session);
    const procs = ids.map((id) => this.fleet.get(id));
    const targets = ids.map((id, i) => ({
      id,
      label: procs[i] ? displayName(procs[i].view(undefined, undefined)) : id,
    }));
    const base = { ts: Date.now(), device, ip, action: cmd.command, targets, args: cmd.args };

    try {
      this.access.requireCommandAccess(session);
      if (commandMeta[cmd.command].destructive && !confirm) {
        throw new AccessError('BAD_REQUEST', 'This command needs confirmation');
      }
    } catch (err) {
      this.audit.add({ ...base, result: 'blocked', error: (err as Error).message });
      throw err;
    }

    const before: Record<string, unknown> = {};
    const results = await mapLimit(ids, 8, async (id) => {
      const proc = this.fleet.get(id);
      if (!proc) return { id, ok: false, error: 'Unknown processor' };
      if (!proc.reachable) return { id, ok: false, error: 'Processor is not responding' };
      try {
        await this.execute(cmd, proc, before);
        return { id, ok: true };
      } catch (err) {
        const error =
          err instanceof StepError || err instanceof TesseraError ? err.message : String(err);
        return { id, ok: false, error };
      } finally {
        this.fleet.refreshSoon(proc);
      }
    });

    const okCount = results.filter((r) => r.ok).length;
    const result = okCount === results.length ? 'ok' : okCount === 0 ? 'error' : 'partial';
    const firstError = results.find((r) => !r.ok)?.error;
    this.audit.add({ ...base, before, result, error: firstError });
    this.fleet.notify();
    return { ok: result === 'ok', results };
  }

  private async execute(
    cmd: Command,
    proc: Processor,
    before: Record<string, unknown>,
  ): Promise<void> {
    if (cmd.command === 'patternCheck.end') {
      await this.restore(proc);
      return;
    }
    if (
      cmd.command === 'identify' ||
      cmd.command === 'patternCheck.begin' ||
      cmd.command === 'patternCheck.step'
    ) {
      this.save(proc, cmd.command === 'identify' ? 'identify' : 'check');
    }
    if (cmd.command === 'patternCheck.begin') return;

    const steps = plan(cmd, proc);
    for (const step of steps) validate(proc.spec(step.key), step.value, proc.profile);
    for (const step of steps) {
      if (this.access.showMode.enabled) throw new StepError('Show Mode turned on');
      const path = fillPath(proc.spec(step.key)!.path, step.params);
      if (proc.spec(step.key)!.access !== 'W')
        before[`${proc.id} ${path}`] = proc.read(step.key, step.params);
      await proc.client.put(path, step.value);
      if (proc.spec(step.key)!.access !== 'W') proc.noteWrite(path, step.value);
    }
    if (cmd.command === 'preset.recall') this.markPresetActive(proc, cmd.args.number);

    if (cmd.command === 'identify') {
      const saved = this.saved.get(proc.id)!;
      clearTimeout(saved.timer);
      saved.timer = setTimeout(() => {
        if (this.access.showMode.enabled) return;
        this.restore(proc)
          .catch((err: unknown) => console.error(`Identify restore failed on ${proc.address}`, err))
          .finally(() => this.fleet.refreshSoon(proc));
      }, IDENTIFY_MS);
    }
  }

  /** The preset list is only re-read every few seconds; reflect the recall straight away. */
  private markPresetActive(proc: Processor, number: number): void {
    const name = proc.read('preset.name', { number });
    if (typeof name === 'string') {
      proc.noteWrite(fillPath(proc.spec('presets.activeName')!.path), name);
    }
    for (const key of proc.itemKeys('presets.items')) {
      const spec = proc.spec('preset.status');
      if (spec) proc.noteWrite(fillPath(spec.path, { number: key }), key === String(number));
    }
  }

  private save(proc: Processor, reason: SavedPattern['reason']): void {
    if (this.saved.has(proc.id)) return;
    this.saved.set(proc.id, {
      enabled: asBool(proc.read('testPattern.enabled')) ?? false,
      type: proc.read('testPattern.type'),
      reason,
    });
    this.fleet.notify();
  }

  /** Puts the test pattern back to how it was before identify / dead pixel check. */
  private async restore(proc: Processor): Promise<void> {
    const saved = this.saved.get(proc.id);
    if (!saved) return;
    clearTimeout(saved.timer);
    this.saved.delete(proc.id);
    this.fleet.notify();
    const typeSpec = proc.spec('testPattern.type');
    const enabledSpec = proc.spec('testPattern.enabled');
    if (typeSpec && (typeof saved.type === 'string' || typeof saved.type === 'number')) {
      await proc.client.put(typeSpec.path, saved.type).catch(() => undefined);
      proc.noteWrite(typeSpec.path, saved.type);
    }
    if (enabledSpec) {
      await proc.client.put(enabledSpec.path, saved.enabled);
      proc.noteWrite(enabledSpec.path, saved.enabled);
    }
  }

  /**
   * Restores every temporary pattern the app started. Called as Show Mode turns on, so nothing
   * the app put on screen is left behind. Returns the processors that could not be restored.
   */
  async restoreAll(by: string): Promise<{ restored: number; failed: string[] }> {
    const ids = [...this.saved.keys()];
    if (ids.length === 0) return { restored: 0, failed: [] };
    const results = await Promise.all(
      ids.map(async (id) => {
        const proc = this.fleet.get(id);
        if (!proc) {
          this.saved.delete(id);
          return false;
        }
        try {
          await this.restore(proc);
          this.fleet.refreshSoon(proc);
          return true;
        } catch {
          return false;
        }
      }),
    );
    const failed = ids.filter((_, i) => !results[i]);
    this.audit.add({
      ts: Date.now(),
      device: by,
      action: 'restore-before-show-mode',
      targets: ids.map((id) => {
        const proc = this.fleet.get(id);
        return { id, label: proc ? displayName(proc.view(undefined, undefined)) : id };
      }),
      result: failed.length === 0 ? 'ok' : failed.length === ids.length ? 'error' : 'partial',
      error: failed.length ? 'Could not put the previous pattern back' : undefined,
    });
    return { restored: ids.length - failed.length, failed };
  }
}
