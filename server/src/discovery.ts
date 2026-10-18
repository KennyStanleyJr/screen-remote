import { networkInterfaces } from 'node:os';
import { TesseraClient } from './tessera/client';
import { asStr } from './tessera/tree';

export interface Target {
  host: string;
  port: number;
}

const MAX_HOSTS = 4096;

function ipToInt(ip: string): number | undefined {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return;
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function intToIp(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

function parsePorts(spec: string | undefined): number[] {
  if (!spec) return [80];
  const [a, b] = spec.split('-').map(Number);
  if (!a || a < 1 || a > 65535) return [];
  if (!b) return [a];
  const out: number[] = [];
  for (let p = a; p <= Math.min(b, a + 64); p++) out.push(p);
  return out;
}

/**
 * Expands scan targets. Supported forms (optional `:port` or `:port-port` suffix):
 * - `192.168.0.50`
 * - `192.168.0.0/24`
 * - `192.168.0.10-60` (last-octet range)
 */
export function expandTargets(targets: string[]): Target[] {
  const out = new Map<string, Target>();
  for (const raw of targets) {
    const [addr = '', portSpec] = raw.trim().split(':');
    const ports = parsePorts(portSpec);
    const hosts: string[] = [];

    if (addr.includes('/')) {
      const [base = '', bitsStr] = addr.split('/');
      const bits = Number(bitsStr);
      const start = ipToInt(base);
      if (start === undefined || !Number.isInteger(bits) || bits < 20 || bits > 32) continue;
      const size = 2 ** (32 - bits);
      const network = start & ~(size - 1) & 0xffffffff;
      const first = size > 2 ? 1 : 0;
      const last = size > 2 ? size - 2 : size - 1;
      for (let i = first; i <= last; i++) hosts.push(intToIp((network + i) >>> 0));
    } else if (/^\d+\.\d+\.\d+\.\d+-\d+$/.test(addr)) {
      const [ip = '', endStr] = addr.split('-');
      const start = ipToInt(ip);
      const end = Number(endStr);
      if (start === undefined) continue;
      for (let o = start & 255; o <= Math.min(end, 255); o++)
        hosts.push(intToIp((start & ~255) + o));
    } else if (ipToInt(addr) !== undefined || /^[a-z0-9.-]+$/i.test(addr)) {
      hosts.push(addr);
    }

    for (const host of hosts) {
      for (const port of ports) {
        out.set(`${host}:${port}`, { host, port });
        if (out.size >= MAX_HOSTS) return [...out.values()];
      }
    }
  }
  return [...out.values()];
}

/** Networks processors are commonly set up on (Brompton's factory default is 192.168.0.50). */
export const commonSubnets = ['192.168.0.0/24', '192.168.1.0/24'];

/**
 * Scanned when no scan targets are configured: the /24 networks of this machine's IPv4
 * interfaces plus the common processor networks.
 */
export function defaultScanTargets(): string[] {
  const subnets = new Set<string>(commonSubnets);
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      subnets.add(`${a.address.split('.').slice(0, 3).join('.')}.0/24`);
    }
  }
  return [...subnets];
}

/** Returns the processor serial if a Tessera API answers at the target. */
export async function probe(target: Target): Promise<string | undefined> {
  const client = new TesseraClient(target.host, target.port);
  try {
    return asStr(await client.get('system/serial-number', 800));
  } catch {
    return undefined;
  }
}

export async function scan(
  targets: Target[],
  onFound: (target: Target, serial: string) => void,
  concurrency = 48,
): Promise<number> {
  let found = 0;
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const target = targets[next++]!;
      const serial = await probe(target);
      if (serial) {
        found++;
        onFound(target, serial);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  return found;
}
