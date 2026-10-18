import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { SessionInfo, ShowModeState } from '@screen-remote/shared';
import type { PinHash, Store } from './store';

export interface Session {
  id: string;
  unlockedUntil?: number;
}

const UNLOCK_MS = 12 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
/** Locked sessions are dropped (oldest first) past this many; phones just get a new one. */
const MAX_SESSIONS = 2000;
const PIN_PATTERN = /^\d{4,8}$/;

export class AccessError extends Error {
  constructor(
    readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'TOO_MANY_REQUESTS' | 'BAD_REQUEST',
    message: string,
  ) {
    super(message);
  }
}

export function hashPin(pin: string): PinHash {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: scryptSync(pin, salt, 32).toString('hex') };
}

function verifyPin(pin: string, stored: PinHash): boolean {
  const actual = scryptSync(pin, stored.salt, 32);
  const expected = Buffer.from(stored.hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validatePin(pin: string): void {
  if (!PIN_PATTERN.test(pin)) throw new AccessError('BAD_REQUEST', 'PIN must be 4 to 8 digits');
}

/**
 * No accounts: anyone on the network can view. A shared setup PIN unlocks a device session.
 * Show Mode is global, ON at boot, and blocks every processor write.
 */
export class Access {
  showMode: ShowModeState = { enabled: true, changedAt: Date.now(), changedBy: 'Startup' };
  lastActivity = Date.now();
  private readonly sessions = new Map<string, Session>();
  private readonly failures = new Map<string, { count: number; lockedUntil: number }>();

  constructor(
    private readonly store: Store,
    initialPin: string | undefined,
  ) {
    if (!store.state.pin && initialPin) {
      validatePin(initialPin);
      store.state.pin = hashPin(initialPin);
      store.save();
    }
  }

  session(id: string): Session {
    let s = this.sessions.get(id);
    if (!s) {
      if (this.sessions.size >= MAX_SESSIONS) {
        for (const [key, old] of this.sessions) {
          if (this.sessions.size < MAX_SESSIONS / 2) break;
          if (!this.isUnlocked(old)) this.sessions.delete(key);
        }
      }
      s = { id };
      this.sessions.set(id, s);
    }
    return s;
  }

  deviceName(s: Session): string {
    return this.store.state.deviceNames[s.id] ?? 'Unnamed device';
  }

  setDeviceName(s: Session, name: string): void {
    this.store.state.deviceNames[s.id] = name.trim().slice(0, 40) || 'Unnamed device';
    this.store.save();
  }

  isUnlocked(s: Session): boolean {
    return Boolean(s.unlockedUntil && s.unlockedUntil > Date.now());
  }

  info(s: Session, ip: string): SessionInfo {
    const lock = this.failures.get(ip);
    return {
      deviceName: this.deviceName(s),
      unlocked: this.isUnlocked(s),
      unlockedUntil: this.isUnlocked(s) ? s.unlockedUntil : undefined,
      pinConfigured: Boolean(this.store.state.pin),
      lockedOutUntil: lock && lock.lockedUntil > Date.now() ? lock.lockedUntil : undefined,
    };
  }

  unlock(s: Session, pin: string, ip: string): void {
    const stored = this.store.state.pin;
    if (!stored) {
      throw new AccessError(
        'FORBIDDEN',
        'No setup PIN is configured. Run "npm run set-pin" on the Pi.',
      );
    }
    const f = this.failures.get(ip) ?? { count: 0, lockedUntil: 0 };
    if (f.lockedUntil > Date.now()) {
      const secs = Math.ceil((f.lockedUntil - Date.now()) / 1000);
      throw new AccessError('TOO_MANY_REQUESTS', `Too many wrong PINs. Try again in ${secs}s.`);
    }
    if (!verifyPin(pin, stored)) {
      f.count++;
      if (f.count >= MAX_FAILURES) {
        f.lockedUntil = Date.now() + 30_000 * 2 ** Math.min(f.count - MAX_FAILURES, 5);
      }
      this.failures.set(ip, f);
      throw new AccessError('UNAUTHORIZED', 'Wrong PIN');
    }
    this.failures.delete(ip);
    s.unlockedUntil = Date.now() + UNLOCK_MS;
  }

  lock(s: Session): void {
    s.unlockedUntil = undefined;
  }

  requireUnlocked(s: Session): void {
    if (!this.isUnlocked(s)) throw new AccessError('UNAUTHORIZED', 'Enter the setup PIN first');
  }

  changePin(s: Session, current: string, next: string, ip: string): void {
    this.unlock(s, current, ip);
    validatePin(next);
    this.store.state.pin = hashPin(next);
    this.store.save();
  }

  /**
   * Leaving Show Mode always takes the PIN, even if this device is still unlocked. Entering it
   * locks every device, so the next setup session needs the PIN again.
   */
  setShowMode(enabled: boolean, by: string, auth?: { session: Session; pin: string; ip: string }) {
    if (!enabled) {
      if (!auth) throw new AccessError('UNAUTHORIZED', 'Enter the setup PIN');
      this.unlock(auth.session, auth.pin, auth.ip);
    } else {
      for (const s of this.sessions.values()) s.unlockedUntil = undefined;
    }
    this.showMode = { enabled, changedAt: Date.now(), changedBy: by };
    this.lastActivity = Date.now();
  }

  /** Throws unless this device may send processor commands right now. */
  requireCommandAccess(s: Session): void {
    if (this.showMode.enabled) {
      throw new AccessError('FORBIDDEN', 'Show Mode is on. Commands are blocked.');
    }
    this.requireUnlocked(s);
    this.lastActivity = Date.now();
  }
}
