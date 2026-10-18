import type { CommandArgs, CommandId, ProcessorDetail, ProcessorView } from '@screen-remote/shared';

export interface Prediction {
  view?: (p: ProcessorView) => void;
  detail?: (d: ProcessorDetail) => void;
}

function showing(type: string | number): Prediction {
  return {
    view: (p) => {
      if (!p.overrides) return;
      p.overrides.testPattern = true;
      p.overrides.testPatternType = type;
    },
  };
}

/** What a command is expected to change, so the UI can show it before the processor confirms. */
export function predict<C extends CommandId>(command: C, rawArgs: CommandArgs<C>): Prediction {
  const args = rawArgs as Record<string, unknown>;
  const group = (d: ProcessorDetail) => d.groups.find((g) => g.number === args.group);
  switch (command as CommandId) {
    case 'testPattern.show':
    case 'patternCheck.step':
      return showing(args.type as string | number);
    case 'frameStore.recall':
      return showing(args.frame as number);
    case 'identify':
      return showing('grid');
    case 'testPattern.off':
      return { view: (p) => p.overrides && (p.overrides.testPattern = false) };
    case 'blackout.set':
      return { view: (p) => p.overrides && (p.overrides.blackout = args.enabled as boolean) };
    case 'freeze.set':
      return { view: (p) => p.overrides && (p.overrides.freeze = args.enabled as boolean) };
    case 'frameStore.rename':
      return {
        view: (p) => {
          const f = p.frameStore.find((x) => x.frame === args.frame);
          if (f) f.name = args.name as string;
        },
      };
    case 'input.select':
      return {
        view: (p) => {
          if (!p.input) return;
          p.input.portType = args.portType as string;
          p.input.portNumber = args.portNumber as number;
        },
      };
    case 'preset.recall':
      return {
        view: (p) => (p.preset.number = args.number as number),
        detail: (d) => {
          for (const x of d.presets) x.active = x.number === args.number;
        },
      };
    case 'preset.rename':
      return {
        detail: (d) => {
          const x = d.presets.find((y) => y.number === args.number);
          if (x) x.name = args.name as string;
        },
      };
    case 'output.brightness':
      return { detail: (d) => (d.output.brightness = args.nits as number) };
    case 'output.colourTemperature':
      return { detail: (d) => (d.output.colourTemperature = args.kelvin as number) };
    case 'output.gamma':
      return { detail: (d) => (d.output.gamma = args.gamma as number) };
    case 'group.override':
      return { detail: (d) => void (group(d) && (group(d)!.override = args.enabled as boolean)) };
    case 'group.brightness':
      return { detail: (d) => void (group(d) && (group(d)!.brightness = args.nits as number)) };
    case 'group.colourTemperature':
      return {
        detail: (d) => void (group(d) && (group(d)!.colourTemperature = args.kelvin as number)),
      };
    case 'group.gamma':
      return { detail: (d) => void (group(d) && (group(d)!.gamma = args.gamma as number)) };
    default:
      return {};
  }
}
