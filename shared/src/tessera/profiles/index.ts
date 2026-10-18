import { compareVersions } from '../../version';
import type { TesseraProfile } from '../types';
import { tessera3_5 } from './v3_5';

/** Register new Tessera profiles here. Order does not matter. */
export const profiles: readonly TesseraProfile[] = [tessera3_5];

export const defaultProfile = tessera3_5;

export function getProfile(id: string): TesseraProfile | undefined {
  return profiles.find((p) => p.id === id);
}

/**
 * Picks the newest profile whose `minVersion` is at or below the processor's software version.
 * Falls back to the oldest profile for older software, or the default if the version is unknown.
 */
export function selectProfile(softwareVersion: string | undefined): TesseraProfile {
  if (!softwareVersion) return defaultProfile;
  const sorted = [...profiles].sort((a, b) => compareVersions(b.minVersion, a.minVersion));
  return sorted.find((p) => compareVersions(softwareVersion, p.minVersion) >= 0) ?? sorted.at(-1)!;
}
