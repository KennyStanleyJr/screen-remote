import type { Alert, DeviceItem, ProcessorView, Severity, Thresholds } from '@screen-remote/shared';

type Draft = Omit<Alert, 'since'>;

function name(p: ProcessorView): string {
  return p.label ?? p.name ?? p.host;
}

/** e.g. "XD SX4-1-XD3 and 16 R2 panels" or "R2 SX4-1-R101, R2 SX4-1-R102". */
export function describeMissing(missing: DeviceItem[]): string {
  const xds = missing.filter((d) => d.type === 'XD');
  const others = missing.filter((d) => d.type !== 'XD');
  const parts = xds.slice(0, 4).map((d) => `XD ${d.serial}`);
  if (xds.length > 4) parts.push(`${xds.length - 4} more XDs`);
  if (others.length && others.length <= 3 && xds.length === 0) {
    parts.push(...others.map((d) => `${d.type ?? 'device'} ${d.serial}`));
  } else if (others.length) {
    const byType = new Map<string, number>();
    for (const d of others) byType.set(d.type ?? 'other', (byType.get(d.type ?? 'other') ?? 0) + 1);
    for (const [type, n] of byType) parts.push(`${n} ${type} ${n === 1 ? 'device' : 'devices'}`);
  }
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]!;
}

function processorAlerts(p: ProcessorView, t: Thresholds, lostLoops: number[]): Draft[] {
  const out: Draft[] = [];
  const add = (key: string, severity: Severity, title: string, message: string) =>
    out.push({ id: `${p.id}:${key}`, severity, processorId: p.id, title, message });

  if (!p.reachable) {
    add('offline', 'critical', 'Not responding', `${name(p)} (${p.host}) is not answering.`);
    return out;
  }

  const f = p.failover;
  if (f?.enabled && f.partnerPresent === false) {
    add(
      'partner',
      'critical',
      'Failover partner missing',
      `${name(p)} cannot see ${f.partnerName || f.partnerSerial || 'its partner'}.`,
    );
  }

  const { online, errors, baseline, missing } = p.devices;
  if (online !== undefined && baseline !== undefined && online < baseline) {
    const which = missing?.length ? ` Missing: ${describeMissing(missing)}.` : '';
    add(
      'devices',
      'critical',
      'Devices dropped',
      `${baseline - online} of ${baseline} devices offline on ${name(p)}.${which}`,
    );
  }
  if (errors) {
    add(
      'errors',
      'warning',
      'Device errors',
      `${errors} ${errors === 1 ? 'device is' : 'devices are'} reporting an error on ${name(p)}. ` +
        "Tessera's API doesn't say which one; check the Devices view in Tessera.",
    );
  }

  if (p.input && !p.input.hasSignal) {
    const port = p.input.portType
      ? ` on ${p.input.portType.toUpperCase()} ${p.input.portNumber ?? ''}`
      : '';
    add('input', 'warning', 'No input signal', `${name(p)} has no video${port}.`);
  }

  const hottest = [...p.temperatures].sort((a, b) => b.value - a.value)[0];
  if (hottest && hottest.value >= t.tempCritC) {
    add('temp', 'critical', 'Overheating', `${hottest.label} at ${hottest.value}°C on ${name(p)}.`);
  } else if (hottest && hottest.value >= t.tempWarnC) {
    add('temp', 'warning', 'Running hot', `${hottest.label} at ${hottest.value}°C on ${name(p)}.`);
  }

  const badFans = p.fans.filter((fan) => fan.ok === false);
  if (badFans.length) {
    add('fan', 'warning', 'Fan fault', `${badFans.map((x) => x.label).join(', ')} on ${name(p)}.`);
  }

  const badLoops = p.cableLoops.filter(
    (l) => /incorrect|one-to-many/i.test(l.state) || lostLoops.includes(l.loop),
  );
  if (badLoops.length) {
    add(
      'loops',
      'warning',
      'Cable loop problem',
      `Loop ${badLoops.map((l) => l.loop).join(', ')} on ${name(p)}: ${badLoops[0]!.state}`,
    );
  }

  return out;
}

export class AlertTracker {
  private since = new Map<string, number>();

  compute(
    processors: ProcessorView[],
    thresholds: Thresholds,
    lostLoops: (id: string) => number[],
  ): Alert[] {
    const drafts = processors.flatMap((p) => processorAlerts(p, thresholds, lostLoops(p.id)));

    const versions = new Set(
      processors.filter((p) => p.reachable && p.softwareVersion).map((p) => p.softwareVersion),
    );
    if (versions.size > 1) {
      drafts.push({
        id: 'fleet:versions',
        severity: 'warning',
        title: 'Mixed Tessera versions',
        message: `Processors are running ${[...versions].sort().join(', ')}.`,
      });
    }

    const now = Date.now();
    const next = new Map<string, number>();
    const alerts = drafts.map((d) => {
      const since = this.since.get(d.id) ?? now;
      next.set(d.id, since);
      return { ...d, since };
    });
    this.since = next;

    const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
    return alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || a.since - b.since);
  }
}
