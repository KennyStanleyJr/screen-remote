import type { Alert, AppState, ProcessorView, Severity, Unit } from '@screen-remote/shared';

export type Status = 'ok' | 'warn' | 'fault' | 'offline';

export function displayName(p: Pick<ProcessorView, 'label' | 'name' | 'host'> | undefined): string {
  if (!p) return 'Unknown';
  return p.label ?? p.name ?? p.host;
}

export function modelName(type: string | undefined): string {
  return type ? type.toUpperCase() : 'Tessera';
}

export function resolution(p: ProcessorView): string {
  const i = p.input;
  if (!i?.hasSignal) return 'No signal';
  return `${i.width}×${i.height} @ ${i.refreshRate}`;
}

export function hottest(p: ProcessorView): number | undefined {
  return p.temperatures.reduce<number | undefined>(
    (m, t) => (m === undefined || t.value > m ? t.value : m),
    undefined,
  );
}

export function alertsFor(state: AppState | null, id: string | undefined): Alert[] {
  if (!state || !id) return [];
  return state.alerts.filter((a) => a.processorId === id);
}

export function worstSeverity(alerts: Alert[]): Severity | undefined {
  if (alerts.some((a) => a.severity === 'critical')) return 'critical';
  if (alerts.some((a) => a.severity === 'warning')) return 'warning';
  return alerts.length ? 'info' : undefined;
}

export function statusOf(p: ProcessorView | undefined, alerts: Alert[]): Status {
  if (!p || !p.reachable) return 'offline';
  const worst = worstSeverity(alerts);
  if (worst === 'critical') return 'fault';
  if (worst === 'warning') return 'warn';
  return 'ok';
}

export function hasOverride(p: ProcessorView | undefined): boolean {
  const o = p?.overrides;
  return Boolean(o && (o.blackout || o.freeze || o.testPattern));
}

export function unitIds(u: Unit): string[] {
  if (u.kind === 'single') return [u.id];
  return [u.primaryId, u.backupId].filter((x): x is string => Boolean(x));
}

/** The pair a processor belongs to, if any. */
export function unitOf(state: AppState | null, id: string): Unit | undefined {
  return state?.units.find((u) => unitIds(u).includes(id));
}

/** Pi clock minus phone clock. The Pi has no battery clock, so it can be off on site. */
let serverOffset = 0;

export function setServerTime(serverTime: number): void {
  serverOffset = serverTime - Date.now();
}

/** Age of a server timestamp, measured on the server's clock. */
export function ago(ts: number | undefined | null, now = Date.now()): string {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round((now + serverOffset - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Clock time of a server timestamp, shown in the phone's time. */
export function time(ts: number): string {
  return new Date(ts - serverOffset).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
