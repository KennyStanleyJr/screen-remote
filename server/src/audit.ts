import { appendFileSync, existsSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AuditEntry } from '@screen-remote/shared';

const KEEP_IN_MEMORY = 500;
const ROTATE_BYTES = 5 * 1024 * 1024;

/** Append-only JSON-lines audit log of every command attempt. */
export class AuditLog {
  private readonly file: string;
  private readonly recent: AuditEntry[] = [];

  constructor(dir: string) {
    this.file = join(dir, 'audit.log');
    if (existsSync(this.file)) {
      const lines = readFileSync(this.file, 'utf8').trim().split('\n').slice(-KEEP_IN_MEMORY);
      for (const line of lines) {
        try {
          this.recent.push(JSON.parse(line) as AuditEntry);
        } catch {
          // Skip a partially written line.
        }
      }
    }
  }

  add(entry: AuditEntry): void {
    this.recent.push(entry);
    if (this.recent.length > KEEP_IN_MEMORY) this.recent.shift();
    try {
      if (existsSync(this.file) && statSync(this.file).size > ROTATE_BYTES) {
        renameSync(this.file, `${this.file}.1`);
      }
      appendFileSync(this.file, `${JSON.stringify(entry)}\n`);
    } catch (err) {
      console.error('Could not write audit log', err);
    }
  }

  list(limit: number): AuditEntry[] {
    return this.recent.slice(-limit).reverse();
  }
}
