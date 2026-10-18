import { z } from 'zod';
import type { EndpointKey } from './tessera/types';

const patternType = z.union([z.string().min(1).max(64), z.number().int().min(1).max(50)]);
const frame = z.number().int().min(1).max(50);
const presetNumber = z.number().int().min(1).max(128);
const gamma = z.number().min(0.2).max(4);
const nits = z.number().int().min(-1).max(10000);
const kelvin = z.number().int().min(2000).max(11000);
const group = z.number().int().min(1).max(1000);
const none = z.object({}).strict();

/**
 * Every command the app can send to a processor. Anything not listed here cannot be written.
 * Ranges here are a first gate; the server also checks the processor's version profile.
 */
export const commandSchema = z.discriminatedUnion('command', [
  z.object({ command: z.literal('testPattern.show'), args: z.object({ type: patternType }) }),
  z.object({ command: z.literal('testPattern.off'), args: none }),
  z.object({ command: z.literal('blackout.set'), args: z.object({ enabled: z.boolean() }) }),
  z.object({ command: z.literal('freeze.set'), args: z.object({ enabled: z.boolean() }) }),
  z.object({ command: z.literal('output.brightness'), args: z.object({ nits }) }),
  z.object({ command: z.literal('output.colourTemperature'), args: z.object({ kelvin }) }),
  z.object({ command: z.literal('output.gamma'), args: z.object({ gamma }) }),
  z.object({
    command: z.literal('input.select'),
    args: z.object({
      portType: z.string().min(1).max(16),
      portNumber: z.number().int().min(1).max(8),
    }),
  }),
  z.object({
    command: z.literal('group.override'),
    args: z.object({ group, enabled: z.boolean() }),
  }),
  z.object({
    command: z.literal('group.brightness'),
    args: z.object({ group, nits: z.number().int().min(0).max(10000) }),
  }),
  z.object({ command: z.literal('group.colourTemperature'), args: z.object({ group, kelvin }) }),
  z.object({ command: z.literal('group.gamma'), args: z.object({ group, gamma }) }),
  z.object({ command: z.literal('preset.recall'), args: z.object({ number: presetNumber }) }),
  z.object({
    command: z.literal('preset.rename'),
    args: z.object({ number: presetNumber, name: z.string().trim().min(1).max(128) }),
  }),
  z.object({ command: z.literal('frameStore.recall'), args: z.object({ frame }) }),
  z.object({
    command: z.literal('frameStore.rename'),
    args: z.object({ frame, name: z.string().trim().min(1).max(128) }),
  }),
  z.object({ command: z.literal('frameStore.capture'), args: z.object({ frame }) }),
  z.object({ command: z.literal('frameStore.delete'), args: z.object({ frame }) }),
  z.object({ command: z.literal('identify'), args: none }),
  z.object({ command: z.literal('patternCheck.begin'), args: none }),
  z.object({ command: z.literal('patternCheck.step'), args: z.object({ type: patternType }) }),
  z.object({ command: z.literal('patternCheck.end'), args: none }),
  z.object({ command: z.literal('failover.request'), args: none }),
  z.object({
    command: z.literal('system.reboot'),
    args: z.object({ password: z.string().max(128).optional() }),
  }),
]);

export type Command = z.infer<typeof commandSchema>;
export type CommandId = Command['command'];
export type CommandArgs<C extends CommandId> = Extract<Command, { command: C }>['args'];

export const commandRequestSchema = z.intersection(
  z.object({
    targets: z.array(z.string().min(1).max(128)).min(1).max(64),
    /** Must be true for destructive commands; the server rejects them otherwise. */
    confirm: z.boolean().optional(),
  }),
  commandSchema,
);
export type CommandRequest = z.infer<typeof commandRequestSchema>;

export interface CommandMeta {
  label: string;
  /** Destructive commands need an explicit confirm step in the UI. */
  destructive: boolean;
  /** Endpoint keys the processor's profile must support for this command. */
  requires: readonly EndpointKey[];
}

export const commandMeta: Record<CommandId, CommandMeta> = {
  'testPattern.show': {
    label: 'Show test pattern',
    destructive: false,
    requires: ['testPattern.type', 'testPattern.enabled'],
  },
  'testPattern.off': {
    label: 'Test pattern off',
    destructive: false,
    requires: ['testPattern.enabled'],
  },
  'blackout.set': { label: 'Blackout', destructive: false, requires: ['blackout.enabled'] },
  'freeze.set': { label: 'Freeze', destructive: false, requires: ['freeze.enabled'] },
  'output.brightness': {
    label: 'Set brightness',
    destructive: false,
    requires: ['output.brightness'],
  },
  'output.colourTemperature': {
    label: 'Set colour temperature',
    destructive: false,
    requires: ['output.colourTemperature'],
  },
  'output.gamma': { label: 'Set gamma', destructive: false, requires: ['output.gamma'] },
  'input.select': {
    label: 'Switch input',
    destructive: true,
    requires: ['input.activePortType', 'input.activePortNumber'],
  },
  'group.override': {
    label: 'Screen uses own colour settings',
    destructive: false,
    requires: ['group.globalColourOverride'],
  },
  'group.gamma': {
    label: 'Set screen gamma',
    destructive: false,
    requires: ['group.gamma'],
  },
  'group.brightness': {
    label: 'Set screen brightness',
    destructive: false,
    requires: ['group.brightness'],
  },
  'group.colourTemperature': {
    label: 'Set screen colour temperature',
    destructive: false,
    requires: ['group.colourTemperature'],
  },
  'preset.recall': {
    label: 'Recall preset',
    destructive: false,
    requires: ['presets.activeNumber'],
  },
  'preset.rename': {
    label: 'Rename preset',
    destructive: false,
    requires: ['preset.name'],
  },
  'frameStore.recall': {
    label: 'Show stored frame',
    destructive: false,
    requires: ['testPattern.type', 'testPattern.enabled'],
  },
  'frameStore.rename': {
    label: 'Rename stored frame',
    destructive: false,
    requires: ['frameStore.frameName'],
  },
  'frameStore.capture': {
    label: 'Capture frame',
    destructive: true,
    requires: ['frameStore.capture'],
  },
  'frameStore.delete': {
    label: 'Delete stored frame',
    destructive: true,
    requires: ['frameStore.delete'],
  },
  identify: {
    label: 'Identify',
    destructive: false,
    requires: ['testPattern.type', 'testPattern.enabled'],
  },
  'patternCheck.begin': {
    label: 'Start dead pixel check',
    destructive: false,
    requires: ['testPattern.type', 'testPattern.enabled'],
  },
  'patternCheck.step': {
    label: 'Dead pixel check step',
    destructive: false,
    requires: ['testPattern.type', 'testPattern.enabled'],
  },
  'patternCheck.end': {
    label: 'End dead pixel check',
    destructive: false,
    requires: ['testPattern.type', 'testPattern.enabled'],
  },
  'failover.request': {
    label: 'Request failover',
    destructive: true,
    requires: ['failover.request'],
  },
  'system.reboot': { label: 'Reboot processor', destructive: true, requires: ['system.reboot'] },
};

export const commandIds = Object.keys(commandMeta) as CommandId[];

/** Pattern sequence used by the dead pixel check. */
export const deadPixelSequence = ['white', 'red', 'green', 'blue', 'black'] as const;
