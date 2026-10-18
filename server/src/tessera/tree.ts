export type Tree = { [key: string]: unknown };

export function isTree(v: unknown): v is Tree {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function segments(path: string): string[] {
  return path
    .split('/')
    .filter(Boolean)
    .map((s) => decodeURIComponent(s));
}

/** The API is case-insensitive, so match keys ignoring case while keeping the original casing. */
function findKey(node: Tree, seg: string): string | undefined {
  if (seg in node) return seg;
  const lower = seg.toLowerCase();
  return Object.keys(node).find((k) => k.toLowerCase() === lower);
}

/** Replaces `{name}` placeholders in an endpoint path. */
export function fillPath(path: string, params: Record<string, string | number> = {}): string {
  return path.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing path parameter "${name}" for ${path}`);
    return encodeURIComponent(String(value));
  });
}

export function valueAt(root: Tree, path: string): unknown {
  let node: unknown = root;
  for (const seg of segments(path)) {
    if (!isTree(node)) return undefined;
    const key = findKey(node, seg);
    if (key === undefined) return undefined;
    node = node[key];
  }
  return node;
}

export function setAt(root: Tree, path: string, value: unknown): void {
  const segs = segments(path);
  const last = segs.pop();
  if (last === undefined) return;
  let node = root;
  for (const seg of segs) {
    const key = findKey(node, seg) ?? seg;
    const next = node[key];
    if (isTree(next)) {
      node = next;
    } else {
      const created: Tree = {};
      node[key] = created;
      node = created;
    }
  }
  node[findKey(node, last) ?? last] = value;
}

export function asBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  return undefined;
}

export function asNum(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function asStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}
