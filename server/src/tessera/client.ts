import { isTree } from './tree';

export class TesseraError extends Error {
  constructor(
    message: string,
    /** `network`: unreachable / timeout. `api`: the processor answered with an error. */
    readonly kind: 'network' | 'api',
  ) {
    super(message);
  }
}

/** Minimal HTTP client for the Tessera IP control API (`http://host/api/...`). */
export class TesseraClient {
  readonly base: string;

  constructor(
    readonly host: string,
    readonly port: number,
    private readonly timeoutMs = 2500,
  ) {
    this.base = port === 80 ? `http://${host}/api/` : `http://${host}:${port}/api/`;
  }

  get(path: string, timeoutMs?: number): Promise<unknown> {
    return this.request('GET', path, undefined, timeoutMs);
  }

  put(path: string, data: unknown): Promise<unknown> {
    return this.request('PUT', path, { data });
  }

  /** Raw `?help=1` output, used by the API diff tool. */
  async help(path = ''): Promise<unknown> {
    const res = await this.fetch('GET', `${path}?help=1`);
    return res;
  }

  private async request(
    method: 'GET' | 'PUT',
    path: string,
    body?: unknown,
    timeoutMs?: number,
  ): Promise<unknown> {
    const json = await this.fetch(method, path, body, timeoutMs);
    return unwrap(json, path);
  }

  private async fetch(
    method: 'GET' | 'PUT',
    path: string,
    body?: unknown,
    timeoutMs = this.timeoutMs,
  ): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(this.base + path.replace(/^\/+/, ''), {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const reason =
        err instanceof Error && err.name === 'TimeoutError' ? 'Timed out' : 'Unreachable';
      throw new TesseraError(reason, 'network');
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new TesseraError(`Unexpected response (${res.status})`, 'api');
    }
    const code = isTree(json) ? json['response-code'] : undefined;
    if (typeof code === 'string' && !/^ok/i.test(code)) throw new TesseraError(code, 'api');
    if (!res.ok) throw new TesseraError(`HTTP ${res.status}`, 'api');
    return json;
  }
}

/** Responses look like `{ "<last path segment>": value }`; return just the value. */
function unwrap(json: unknown, path: string): unknown {
  if (!isTree(json)) return json;
  const last = path.split('?')[0]!.split('/').filter(Boolean).at(-1)?.toLowerCase();
  if (last) {
    for (const [k, v] of Object.entries(json)) if (k.toLowerCase() === last) return v;
  }
  const keys = Object.keys(json);
  if (keys.length === 1) return json[keys[0]!];
  return json;
}
