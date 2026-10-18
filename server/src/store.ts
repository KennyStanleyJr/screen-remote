import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { DeviceItem, Settings } from '@screen-remote/shared';

export interface KnownProcessor {
  host: string;
  port: number;
  serial?: string;
}

export interface PinHash {
  salt: string;
  hash: string;
}

export interface PersistedState {
  settings: Settings;
  pin?: PinHash;
  known: KnownProcessor[];
  /** Highest device online-count seen per processor serial, used for "devices dropped" alerts. */
  baselines: Record<string, number>;
  /** Device list (serial and type) seen at the baseline count, used to name dropped devices. */
  expectedDevices: Record<string, DeviceItem[]>;
  /** Device nicknames by session id. */
  deviceNames: Record<string, string>;
}

export const defaultSettings: Settings = {
  scanTargets: [],
  manualHosts: [],
  summaryIntervalMs: 3000,
  profileOverride: 'auto',
  autoRelockMinutes: 0,
  thresholds: { tempWarnC: 70, tempCritC: 85 },
  labels: {},
};

/** Small JSON file store with atomic writes. Writes are debounced. */
export class Store {
  readonly state: PersistedState;
  private readonly file: string;
  private readonly backup: string;
  private timer: NodeJS.Timeout | undefined;

  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'state.json');
    this.backup = join(dir, 'state.json.bak');
    this.state = this.load();
  }

  private load(): PersistedState {
    const empty: PersistedState = {
      settings: structuredClone(defaultSettings),
      known: [],
      baselines: {},
      expectedDevices: {},
      deviceNames: {},
    };
    for (const file of [this.file, this.backup]) {
      if (!existsSync(file)) continue;
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<PersistedState>;
        if (file === this.backup) console.warn(`Recovered state from ${file}`);
        return {
          ...empty,
          ...parsed,
          settings: {
            ...empty.settings,
            ...parsed.settings,
            thresholds: { ...empty.settings.thresholds, ...parsed.settings?.thresholds },
          },
        };
      } catch (err) {
        console.error(`Could not read ${file}:`, err);
      }
    }
    if (existsSync(this.file)) console.error('No readable state file, starting fresh');
    return empty;
  }

  save(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 250);
  }

  /** Writes durably (fsync before rename) and keeps the previous good copy as a backup. */
  flush(): boolean {
    clearTimeout(this.timer);
    const tmp = `${this.file}.tmp`;
    try {
      const fd = openSync(tmp, 'w');
      try {
        writeFileSync(fd, JSON.stringify(this.state, null, 2));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      if (existsSync(this.file)) copyFileSync(this.file, this.backup);
      renameSync(tmp, this.file);
      return true;
    } catch (err) {
      console.error(`Could not save ${this.file}`, err);
      return false;
    }
  }
}
