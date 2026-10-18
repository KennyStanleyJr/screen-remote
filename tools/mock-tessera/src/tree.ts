export type Leaf = string | number | boolean | number[] | null;
export interface Tree {
  [key: string]: Leaf | Tree;
}

export interface MockOptions {
  name: string;
  serial: string;
  type: 'sx40' | 's8' | 's4' | 'm2';
  version: string;
  project: string;
  failover?: { role: 'primary' | 'backup'; partnerSerial: string; partnerName: string };
  xdCount: number;
  panelsPerXd: number;
  errorCount?: number;
  groups?: string[];
  hasInput: boolean;
}

export function isTree(v: unknown): v is Tree {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function createTree(o: MockOptions): Tree {
  const devices: Tree = {};
  for (let x = 1; x <= o.xdCount; x++) {
    devices[`${o.serial}-XD${x}`] = { firmware: o.version, type: 'XD' };
    for (let p = 1; p <= o.panelsPerXd; p++) {
      devices[`${o.serial}-R${x}${String(p).padStart(2, '0')}`] = {
        firmware: '3.4.1',
        type: 'R2',
      };
    }
  }
  const deviceCount = Object.keys(devices).length;

  const groups: Tree = {};
  (o.groups ?? []).forEach((name, i) => {
    groups[String(i + 1)] = {
      name,
      'global-colour-override': i === 0,
      brightness: 1200,
      'colour-temperature': 6500,
      gains: { red: 100, green: 100, blue: 100, intensity: 100 },
      gamma: 2.2,
      'dark-magic': { enabled: false },
    };
  });

  const isSx40 = o.type === 'sx40' || o.type === 's8';
  const port = (signal: boolean, width: number, height: number, rate: number): Tree => ({
    'meta-data': {
      'bit-depth': signal ? 10 : 0,
      hdr: { format: 'standard-dynamic-range' },
      'refresh-rate': signal ? rate : 0,
      resolution: { height: signal ? height : 0, width: signal ? width : 0 },
      sampling: 'rgb',
    },
  });
  const ports: Tree = isSx40
    ? {
        hdmi: { '1': port(o.hasInput, 3840, 2160, 59.94) },
        sdi: { '1': port(o.hasInput, 1920, 1080, 59.94) },
      }
    : {
        dvi: { '1': port(false, 0, 0, 0) },
        hdmi: { '1': port(o.hasInput, 1920, 1080, 60) },
      };

  return {
    devices: {
      items: devices,
      statistics: {
        'associated-count': deviceCount,
        'online-count': deviceCount,
        'error-count': o.errorCount ?? 0,
      },
    },
    groups: { items: groups },
    input: {
      active: { source: { 'port-type': 'hdmi', 'port-number': 1 } },
      ports,
    },
    output: {
      'global-colour': {
        brightness: 1500,
        'brightness-limit': { enabled: false, value: 0 },
        'colour-temperature': 6500,
        'dark-magic': { enabled: false },
        gains: { red: 100, green: 100, blue: 100, intensity: 100 },
        gamma: 2.2,
        puretone: { enabled: true },
      },
      network: {
        'bit-depth': 10,
        'cable-redundancy': {
          loops: Object.fromEntries(
            Array.from({ length: o.xdCount }, (_, i) => [
              String(i + 1),
              { state: `loop-found: A${i + 1}->B${i + 1}` },
            ]),
          ),
        },
        failover: {
          settings: {
            enabled: Boolean(o.failover),
            modes: {
              'on-button-press': false,
              'on-partner-fail': true,
              'on-partner-video-fail': true,
              'prefer-primary': true,
            },
            role: o.failover?.role ?? 'primary',
          },
          state: {
            'is-active': o.failover ? o.failover.role === 'primary' : true,
            'is-partner-present': Boolean(o.failover),
            'partner-absence-duration': '0s',
            'partner-name': o.failover?.partnerName ?? '',
            'partner-serial': o.failover?.partnerSerial ?? '',
            'partner-video-absence-duration': '0s',
          },
        },
        'frame-rate-multiplier': 1,
        genlock: { 'internal-rate': 60, source: 'active-input' },
      },
    },
    override: {
      blackout: { enabled: false, 'fade-time': 0 },
      freeze: { enabled: false },
      'test-pattern': {
        'custom-colour': { red: 4095, green: 2048, blue: 0 },
        enabled: false,
        format: 'from-input',
        'frame-store': {
          frames: {
            '1': { name: 'Wall map', 'enable-alpha': false },
            '2': { name: 'Pixel map', 'enable-alpha': false },
            '3': { name: 'Logo hold', 'enable-alpha': false },
          },
        },
        'restrict-to-achievable-colours': false,
        type: 'smpte-bars',
      },
    },
    presets: {
      active: { name: 'Rehearsal', number: 2 },
      items: {
        '1': { name: 'Default', status: false },
        '2': { name: 'Rehearsal', status: true },
        '3': { name: 'Show', status: false },
      },
    },
    project: { name: o.project },
    system: {
      'current-date-time': '',
      fan: isSx40
        ? {
            case: { one: { speed: 2100, status: true }, two: { speed: 2080, status: true } },
            fpga: { speed: 3200, status: true },
          }
        : { case: { one: { speed: 1900, status: true }, two: { speed: 1900, status: true } } },
      'processor-name': o.name,
      'processor-type': o.type,
      'serial-number': o.serial,
      'software-version': o.version,
      temperature: isSx40
        ? {
            ambient: 27,
            cpu: 48,
            ethernet: {
              copper: { a: 44, b: 44 },
              sfp: { a: 41, b: 42, c: 40, d: 41 },
            },
            fpga: 55,
            gpu: 50,
            main: 46,
            psu: 39,
          }
        : { dsp: 50, fpga: 52, front: 30, rear: 35 },
      uptime: '00d 00h 00m 00s',
    },
  };
}

/** What each mock preset changes when recalled, so recalls are visible in development. */
export const presetEffects: Record<string, { brightness: number; colourTemperature: number }> = {
  '1': { brightness: 1500, colourTemperature: 6500 },
  '2': { brightness: 1200, colourTemperature: 6500 },
  '3': { brightness: 1800, colourTemperature: 5600 },
};

/** Paths (prefixes) that are read-only in the real API. */
export const readOnlyPrefixes = [
  'devices',
  'project',
  'system',
  'presets/active/name',
  'presets/items/*/status',
  'input/ports',
  'output/network/failover/state',
  'output/network/failover/settings/role',
  'output/network/cable-redundancy',
  'output/global-colour/brightness-limit',
];

/** True when `path` is at or under a read-only prefix (`*` matches one segment). */
export function isReadOnly(path: string): boolean {
  const segs = path.split('/');
  return readOnlyPrefixes.some((pre) => {
    const p = pre.split('/');
    return p.length <= segs.length && p.every((s, i) => s === '*' || s === segs[i]);
  });
}
