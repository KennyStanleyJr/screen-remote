export type Severity = 'critical' | 'warning' | 'info';

export interface FailoverState {
  enabled: boolean;
  role?: 'primary' | 'backup';
  isActive?: boolean;
  partnerPresent?: boolean;
  partnerName?: string;
  partnerSerial?: string;
  partnerAbsence?: string;
  partnerVideoAbsence?: string;
  modes: {
    onButtonPress?: boolean;
    onPartnerFail?: boolean;
    onPartnerVideoFail?: boolean;
    preferPrimary?: boolean;
  };
}

export interface InputState {
  portType?: string;
  portNumber?: number;
  width?: number;
  height?: number;
  refreshRate?: number;
  bitDepth?: number;
  hdrFormat?: string;
  /** True when the processor reports a resolution and refresh rate on the active port. */
  hasSignal: boolean;
}

export interface OverrideState {
  blackout: boolean;
  freeze: boolean;
  testPattern: boolean;
  testPatternType?: string | number;
}

/** A physical video input on the processor, e.g. HDMI 1 or SDI A. */
export interface InputPort {
  type: string;
  number: number;
  label: string;
  hasSignal: boolean;
  width?: number;
  height?: number;
  refreshRate?: number;
}

export interface Reading {
  key: string;
  label: string;
  value: number;
}

export interface FanReading {
  key: string;
  label: string;
  rpm?: number;
  ok?: boolean;
}

export interface FrameStoreItem {
  frame: number;
  name: string;
}

export interface DeviceItem {
  serial: string;
  type?: string;
  firmware?: string;
}

export interface GroupItem {
  number: number;
  name: string;
  /** True when the screen uses its own colour settings instead of the processor's. */
  override?: boolean;
  brightness?: number;
  colourTemperature?: number;
  gamma?: number;
}

export interface CableLoop {
  loop: number;
  state: string;
  ok: boolean;
}

export interface PresetItem {
  number: number;
  name: string;
  active: boolean;
}

export interface ProcessorDetail {
  updatedAt: number;
  output: {
    brightness?: number;
    colourTemperature?: number;
    gamma?: number;
    brightnessLimitEnabled?: boolean;
    brightnessLimitValue?: number;
    bitDepth?: number;
    frameRateMultiplier?: number;
    genlockSource?: string;
    genlockInternalRate?: number;
  };
  groups: GroupItem[];
  devices: DeviceItem[];
  presets: PresetItem[];
  inputs: InputPort[];
}

export interface ProcessorView {
  /** Stable id: serial when known, otherwise `host:port`. */
  id: string;
  host: string;
  port: number;
  reachable: boolean;
  lastSeen: number | null;
  error?: string;
  /** User label from Settings, falls back to the processor name. */
  label?: string;
  serial?: string;
  name?: string;
  type?: string;
  softwareVersion?: string;
  profileId: string;
  projectName?: string;
  uptime?: string;
  failover: FailoverState | null;
  input: InputState | null;
  overrides: OverrideState | null;
  devices: {
    online?: number;
    errors?: number;
    associated?: number;
    baseline?: number;
    /** Devices from the expected list that are no longer reported, when known. */
    missing?: DeviceItem[];
  };
  temperatures: Reading[];
  fans: FanReading[];
  preset: { number?: number; name?: string };
  frameStore: FrameStoreItem[];
  cableLoops: CableLoop[];
  /** Command ids this processor's profile supports. */
  capabilities: string[];
}

export type Unit =
  | {
      kind: 'pair';
      key: string;
      primaryId?: string;
      backupId?: string;
      primarySerial?: string;
      backupSerial?: string;
    }
  | { kind: 'single'; key: string; id: string };

export interface Alert {
  id: string;
  severity: Severity;
  processorId?: string;
  title: string;
  message: string;
  since: number;
}

export interface ShowModeState {
  enabled: boolean;
  changedAt: number;
  changedBy?: string;
}

export interface ScanState {
  running: boolean;
  lastRun?: number;
  lastFound?: number;
}

export interface AppState {
  serverTime: number;
  showMode: ShowModeState;
  processors: ProcessorView[];
  units: Unit[];
  alerts: Alert[];
  scan: ScanState;
  thresholds: Thresholds;
  /** Processor ids with a temporary pattern started by the app (identify / dead pixel check). */
  pendingRestores: string[];
}

export interface SessionInfo {
  deviceName: string;
  unlocked: boolean;
  unlockedUntil?: number;
  pinConfigured: boolean;
  lockedOutUntil?: number;
}

export interface Thresholds {
  tempWarnC: number;
  tempCritC: number;
}

export interface Settings {
  scanTargets: string[];
  manualHosts: string[];
  summaryIntervalMs: number;
  profileOverride: string;
  autoRelockMinutes: number;
  thresholds: Thresholds;
  labels: Record<string, string>;
}

export interface AuditEntry {
  ts: number;
  device: string;
  ip?: string;
  action: string;
  targets: { id: string; label: string }[];
  args?: unknown;
  before?: Record<string, unknown>;
  result: 'ok' | 'error' | 'blocked' | 'partial';
  error?: string;
}

export interface CommandResult {
  ok: boolean;
  results: { id: string; ok: boolean; error?: string }[];
}
