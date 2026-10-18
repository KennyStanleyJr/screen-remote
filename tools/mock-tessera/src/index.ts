import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  createTree,
  isReadOnly,
  isTree,
  presetEffects,
  type Leaf,
  type MockOptions,
  type Tree,
} from './tree';

/**
 * Fake Brompton Tessera processors for development. Each listens on its own port on 127.0.0.1 and
 * speaks a subset of the Tessera HTTP API (GET subtrees, PUT {"data": ...}, ?set=).
 */

const basePort = Number(process.env.MOCK_BASE_PORT ?? 9001);

interface MockProcessor {
  port: number;
  opts: MockOptions;
  tree: Tree;
  startedAt: number;
  partner?: MockProcessor;
  online: boolean;
}

const scenario: MockOptions[] = [
  pair('Main L', 'SX4-100101', 'SX4-100102', 'Main Stage'),
  pair('Main L', 'SX4-100102', 'SX4-100101', 'Main Stage', 'backup'),
  pair('Main R', 'SX4-100201', 'SX4-100202', 'Main Stage'),
  pair('Main R', 'SX4-100202', 'SX4-100201', 'Main Stage', 'backup'),
  pair('IMAG', 'SX4-100301', 'SX4-100302', 'IMAG'),
  {
    name: 'Floor',
    serial: 'SX4-100401',
    type: 'sx40',
    version: '3.5.2',
    project: 'Floor',
    xdCount: 2,
    panelsPerXd: 10,
    hasInput: false,
  },
  {
    name: 'Upstage',
    serial: 'SX4-100501',
    type: 'sx40',
    version: '3.5.2',
    project: 'Upstage',
    xdCount: 3,
    panelsPerXd: 12,
    errorCount: 1,
    groups: ['Centre wall', 'Left wing', 'Right wing'],
    hasInput: true,
  },
  {
    name: 'Side fill',
    serial: 'S8-200101',
    type: 's8',
    version: '3.4.2',
    project: 'Side fill',
    xdCount: 1,
    panelsPerXd: 8,
    hasInput: true,
  },
];

function pair(
  wall: string,
  serial: string,
  partnerSerial: string,
  project: string,
  role: 'primary' | 'backup' = 'primary',
): MockOptions {
  const label = role === 'primary' ? 'A' : 'B';
  return {
    name: `${wall} ${label}`,
    serial,
    type: 'sx40',
    version: '3.5.2',
    project,
    failover: {
      role,
      partnerSerial,
      partnerName: `${wall} ${role === 'primary' ? 'B' : 'A'}`,
    },
    xdCount: 4,
    panelsPerXd: 16,
    groups: wall === 'Main L' ? ['Left upper', 'Left lower'] : undefined,
    hasInput: true,
  };
}

const processors: MockProcessor[] = scenario.map((opts, i) => ({
  port: basePort + i,
  opts,
  tree: createTree(opts),
  startedAt: Date.now() - Math.round(Math.random() * 3_600_000),
  online: true,
}));

for (const p of processors) {
  const partnerSerial = p.opts.failover?.partnerSerial;
  p.partner = processors.find((q) => q.opts.serial === partnerSerial);
}

// The IMAG backup is "missing": its primary sees no partner.
const imagPrimary = processors.find((p) => p.opts.serial === 'SX4-100301');
if (imagPrimary)
  setLeaf(imagPrimary.tree, 'output/network/failover/state/is-partner-present', false);

function splitPath(path: string): string[] {
  return path
    .toLowerCase()
    .split('/')
    .map((s) => decodeURIComponent(s))
    .filter(Boolean);
}

function getNode(tree: Tree, path: string): Leaf | Tree | undefined {
  let node: Leaf | Tree | undefined = tree;
  for (const seg of splitPath(path)) {
    if (!isTree(node)) return undefined;
    node = node[seg];
  }
  return node;
}

function setLeaf(tree: Tree, path: string, value: Leaf): void {
  const segs = splitPath(path);
  const last = segs.pop();
  if (!last) return;
  let node: Tree = tree;
  for (const seg of segs) {
    const next = node[seg];
    if (!isTree(next)) {
      const created: Tree = {};
      node[seg] = created;
      node = created;
    } else {
      node = next;
    }
  }
  node[last] = value;
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

function coerce(existing: Leaf | Tree | undefined, value: unknown, path: string): Leaf {
  if (path.endsWith('test-pattern/type')) {
    if (typeof value === 'number' || /^\d+$/.test(String(value))) return Number(value);
    return String(value);
  }
  if (typeof existing === 'boolean') {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw new ApiError(400, 'Bad input parameter type');
  }
  if (typeof existing === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new ApiError(400, 'Bad input parameter type');
    return n;
  }
  if (Array.isArray(value)) return value.map(Number);
  return String(value);
}

function write(p: MockProcessor, path: string, value: unknown): Leaf | Tree {
  const norm = splitPath(path).join('/');

  // Write-only actions.
  if (norm === 'output/network/failover/actions/request-failover') {
    if (!p.partner) throw new ApiError(400, 'Operation failed');
    swapActive(p);
    return '';
  }
  if (norm === 'override/test-pattern/frame-store/capture-frame') {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 50)
      throw new ApiError(400, 'Bad input parameter value');
    setLeaf(p.tree, `override/test-pattern/frame-store/frames/${n}/name`, `Capture ${n}`);
    setLeaf(p.tree, `override/test-pattern/frame-store/frames/${n}/enable-alpha`, false);
    return n;
  }
  if (norm === 'override/test-pattern/frame-store/delete-frame') {
    const frames = getNode(p.tree, 'override/test-pattern/frame-store/frames');
    if (isTree(frames)) delete frames[String(value)];
    return Number(value);
  }
  if (norm === 'system/actions/reboot') {
    p.online = false;
    setTimeout(() => {
      p.online = true;
      p.startedAt = Date.now();
    }, 8000);
    return '';
  }

  if (isReadOnly(norm)) {
    throw new ApiError(400, 'Bad operation');
  }

  const existing = getNode(p.tree, norm);
  if (isTree(existing) && isTree(value)) {
    for (const [k, v] of Object.entries(value)) write(p, `${norm}/${k}`, v);
    return getNode(p.tree, norm) as Tree;
  }
  if (existing === undefined && !norm.includes('frame-store/frames/')) {
    throw new ApiError(404, 'Path not found');
  }
  if (norm === 'presets/active/number') {
    const items = getNode(p.tree, 'presets/items');
    const item = isTree(items) ? items[String(value)] : undefined;
    if (!isTree(item)) throw new ApiError(400, 'Object not found');
    for (const v of Object.values(items as Tree)) if (isTree(v)) v.status = false;
    item.status = true;
    setLeaf(p.tree, 'presets/active/name', String(item.name));
    const effect = presetEffects[String(value)];
    if (effect) {
      setLeaf(p.tree, 'output/global-colour/brightness', effect.brightness);
      setLeaf(p.tree, 'output/global-colour/colour-temperature', effect.colourTemperature);
    }
  }
  const next = coerce(existing, value, norm);
  setLeaf(p.tree, norm, next);
  return next;
}

const writeOnlyActions = [
  'output/network/failover/actions/request-failover',
  'override/test-pattern/frame-store/capture-frame',
  'override/test-pattern/frame-store/delete-frame',
  'system/actions/reboot',
];

/** `?help=1` output: the same tree shape, with each leaf replaced by its description. */
function help(p: MockProcessor, path: string): Tree | undefined {
  const describe = (node: Leaf | Tree, at: string): Tree => {
    if (isTree(node)) {
      return Object.fromEntries(
        Object.entries(node).map(([k, v]) => [k, describe(v, at ? `${at}/${k}` : k)]),
      );
    }
    return { Summary: `Mock ${at}`, 'Access Specifier': isReadOnly(at) ? 'R' : 'R/W' };
  };
  const base = splitPath(path).join('/');
  const node = getNode(p.tree, base);
  if (node === undefined) return undefined;
  const out = describe(node, base);
  for (const action of writeOnlyActions) {
    if (base && !action.startsWith(`${base}/`)) continue;
    const rel = splitPath(base ? action.slice(base.length + 1) : action);
    let cur = out;
    for (const seg of rel.slice(0, -1)) cur = (cur[seg] ??= {}) as Tree;
    cur[rel.at(-1)!] = { Summary: `Mock ${action}`, 'Access Specifier': 'W' };
  }
  return out;
}

function swapActive(p: MockProcessor): void {
  const partner = p.partner;
  if (!partner) return;
  const path = 'output/network/failover/state/is-active';
  const mine = getNode(p.tree, path) === true;
  setLeaf(p.tree, path, !mine);
  setLeaf(partner.tree, path, mine);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, 'Missing input parameter');
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handle(p: MockProcessor, req: IncomingMessage, res: ServerResponse): Promise<void> {
  await new Promise((r) => setTimeout(r, 15 + Math.random() * 45));
  if (!p.online) {
    req.socket.destroy();
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.toLowerCase().startsWith('/api')) {
    send(res, 404, { 'response-code': 'Path not found' });
    return;
  }
  const path = url.pathname.slice(4);
  const last = splitPath(path).at(-1) ?? 'api';

  try {
    if (req.method === 'PUT') {
      const body = (await readBody(req)) as { data?: unknown } | undefined;
      if (!body || !('data' in body)) throw new ApiError(400, 'Missing input parameter');
      send(res, 200, { [last]: write(p, path, body.data) });
      return;
    }
    if (req.method === 'GET') {
      if (url.searchParams.has('help')) {
        const node = help(p, path);
        if (node === undefined) throw new ApiError(404, 'Path not found');
        send(res, 200, { [last]: node });
        return;
      }
      if (url.searchParams.has('set')) {
        send(res, 200, { [last]: write(p, path, url.searchParams.get('set')) });
        return;
      }
      const node = getNode(p.tree, path);
      if (node === undefined) throw new ApiError(404, 'Path not found');
      send(res, 200, { [last]: node });
      return;
    }
    throw new ApiError(405, 'Bad operation');
  } catch (err) {
    if (err instanceof ApiError) send(res, err.status, { 'response-code': err.code });
    else send(res, 500, { 'response-code': 'Operation failed' });
  }
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 86400))}d ${pad(Math.floor(s / 3600) % 24)}h ${pad(Math.floor(s / 60) % 60)}m ${pad(s % 60)}s`;
}

function jitter(tree: Tree, path: string, base: number, spread: number): void {
  const v = getNode(tree, path);
  if (typeof v === 'number')
    setLeaf(tree, path, Math.round((base + (Math.random() - 0.5) * spread) * 10) / 10);
}

const baseTemps = new Map<string, number>();

let tick = 0;
let allDevices: Tree | undefined;
setInterval(() => {
  tick++;
  for (const p of processors) {
    const t = p.tree;
    setLeaf(t, 'system/uptime', formatUptime(Date.now() - p.startedAt));
    setLeaf(t, 'system/current-date-time', new Date().toISOString().replace('T', ' ').slice(0, 19));
    for (const key of ['cpu', 'fpga', 'gpu', 'main', 'psu', 'ambient', 'dsp']) {
      const path = `system/temperature/${key}`;
      const current = getNode(t, path);
      if (typeof current !== 'number') continue;
      const id = `${p.opts.serial}:${key}`;
      if (!baseTemps.has(id)) baseTemps.set(id, current);
      jitter(t, path, baseTemps.get(id)!, 2);
    }
  }

  // Upstage: one SFP runs hot.
  const upstage = processors.find((p) => p.opts.serial === 'SX4-100501');
  if (upstage) jitter(upstage.tree, 'system/temperature/ethernet/sfp/c', 74, 3);

  // Main R A: XD 3 and its panels drop out for 20 s every minute.
  const mainR = processors.find((p) => p.opts.serial === 'SX4-100201');
  if (mainR) {
    const dropped = tick % 60 >= 40;
    const devices = getNode(mainR.tree, 'devices') as Tree;
    allDevices ??= structuredClone(devices.items as Tree);
    const lost = new RegExp(`^${mainR.opts.serial}-(XD3|R3\\d\\d)$`);
    devices.items = dropped
      ? Object.fromEntries(Object.entries(allDevices).filter(([serial]) => !lost.test(serial)))
      : structuredClone(allDevices);
    setLeaf(
      mainR.tree,
      'devices/statistics/online-count',
      Object.keys(devices.items as Tree).length,
    );
    setLeaf(
      mainR.tree,
      'output/network/cable-redundancy/loops/3/state',
      dropped ? 'no-loop-found: No connection' : 'loop-found: A3->B3',
    );
  }
}, 1000);

for (const p of processors) {
  createServer((req, res) => {
    handle(p, req, res).catch(() => send(res, 500, { 'response-code': 'Operation failed' }));
  }).listen(p.port, '127.0.0.1', () => {
    console.log(
      `mock ${p.opts.name.padEnd(10)} ${p.opts.serial} -> http://127.0.0.1:${p.port}/api/`,
    );
  });
}
