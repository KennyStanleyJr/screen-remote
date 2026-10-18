/** `tree` marks a directory (e.g. a dynamic list of items) rather than a single value. */
export type DataType =
  'bool' | 'int' | 'float' | 'string' | 'enum' | 'testpattern' | 'array' | 'tree';

export type Access = 'R' | 'RW' | 'W';

export interface EndpointSpec {
  /** Path below `/api/`. Dynamic segments use `{name}` placeholders, e.g. `groups/items/{group}/name`. */
  path: string;
  type: DataType;
  access: Access;
  min?: number;
  max?: number;
  values?: readonly string[];
  units?: string;
}

/**
 * Logical endpoint keys used everywhere outside the profiles. A profile maps each key it supports
 * to the real API path for that Tessera version.
 */
export type EndpointKey =
  // system
  | 'system.processorName'
  | 'system.processorType'
  | 'system.serial'
  | 'system.softwareVersion'
  | 'system.uptime'
  | 'system.dateTime'
  | 'system.reboot'
  | 'project.name'
  // devices
  | 'devices.items'
  | 'device.type'
  | 'device.firmware'
  | 'devices.onlineCount'
  | 'devices.errorCount'
  | 'devices.associatedCount'
  // groups
  | 'groups.items'
  | 'group.name'
  | 'group.brightness'
  | 'group.colourTemperature'
  | 'group.gamma'
  | 'group.globalColourOverride'
  // input
  | 'input.activePortType'
  | 'input.activePortNumber'
  | 'input.ports'
  | 'input.portMetaData'
  | 'input.refreshRate'
  | 'input.width'
  | 'input.height'
  | 'input.bitDepth'
  | 'input.hdrFormat'
  // output
  | 'output.brightness'
  | 'output.colourTemperature'
  | 'output.gamma'
  | 'output.brightnessLimitEnabled'
  | 'output.brightnessLimitValue'
  | 'output.bitDepth'
  | 'output.frameRateMultiplier'
  | 'output.genlockSource'
  | 'output.genlockInternalRate'
  | 'output.cableLoops'
  | 'cableLoop.state'
  // failover
  | 'failover.enabled'
  | 'failover.role'
  | 'failover.isActive'
  | 'failover.partnerPresent'
  | 'failover.partnerName'
  | 'failover.partnerSerial'
  | 'failover.partnerAbsence'
  | 'failover.partnerVideoAbsence'
  | 'failover.modeOnButtonPress'
  | 'failover.modeOnPartnerFail'
  | 'failover.modeOnPartnerVideoFail'
  | 'failover.modePreferPrimary'
  | 'failover.request'
  // overrides
  | 'blackout.enabled'
  | 'freeze.enabled'
  | 'testPattern.enabled'
  | 'testPattern.type'
  | 'frameStore.frames'
  | 'frameStore.frameName'
  | 'frameStore.capture'
  | 'frameStore.delete'
  // presets
  | 'presets.activeNumber'
  | 'presets.activeName'
  | 'presets.items'
  | 'preset.name'
  | 'preset.status';

export interface SensorSpec {
  key: string;
  label: string;
  path: string;
}

export interface FanSpec {
  key: string;
  label: string;
  speedPath: string;
  statusPath: string;
}

export interface TesseraProfile {
  /** Profile id, e.g. `3.5`. */
  id: string;
  label: string;
  /** Lowest Tessera software version this profile is meant for (inclusive), `x.y.z`. */
  minVersion: string;
  endpoints: Partial<Record<EndpointKey, EndpointSpec>>;
  /** Subtrees fetched for every processor on every summary poll. */
  summaryReads: readonly string[];
  /** Subtrees fetched only while someone is viewing the processor. */
  detailReads: readonly string[];
  /** Larger subtrees fetched occasionally while someone is viewing the processor. */
  slowReads: readonly string[];
  testPatterns: readonly string[];
  temperatures: readonly SensorSpec[];
  fans: readonly FanSpec[];
}
