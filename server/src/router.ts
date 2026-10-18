import type {} from '@fastify/cookie';
import { randomBytes } from 'node:crypto';
import { on } from 'node:events';
import { commandRequestSchema, profiles, type AppState } from '@screen-remote/shared';
import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { z } from 'zod';
import { AccessError, type Access, type Session } from './access';
import type { AuditLog } from './audit';
import type { CommandRunner } from './commands';
import { env } from './env';
import type { Fleet } from './fleet';
import type { Store } from './store';

export interface Services {
  store: Store;
  fleet: Fleet;
  access: Access;
  commands: CommandRunner;
  audit: AuditLog;
}

export interface Context {
  session: Session;
  ip: string;
}

const COOKIE = 'sr_sid';

export function contextFactory(access: Access) {
  return ({ req, res }: CreateFastifyContextOptions): Context => {
    let sid = req.cookies[COOKIE];
    if (!sid || !/^[a-f0-9]{32}$/.test(sid)) {
      sid = randomBytes(16).toString('hex');
      void res.setCookie(COOKIE, sid, {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: env.tls,
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return { session: access.session(sid), ip: req.ip };
  };
}

const t = initTRPC.context<Context>().create({
  isDev: env.dev,
  sse: {
    ping: { enabled: true, intervalMs: 15_000 },
    client: { reconnectAfterInactivityMs: 40_000 },
  },
});

/** Converts our AccessError into tRPC errors with the right HTTP status. */
const publicProcedure = t.procedure.use(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.cause instanceof AccessError) {
    throw new TRPCError({ code: result.error.cause.code, message: result.error.cause.message });
  }
  return result;
});

const settingsPatch = z
  .object({
    scanTargets: z.array(z.string().trim().min(1).max(64)).max(32),
    summaryIntervalMs: z.number().int().min(1000).max(30_000),
    profileOverride: z.string().max(16),
    autoRelockMinutes: z.number().int().min(0).max(480),
    thresholds: z.object({
      tempWarnC: z.number().int().min(30).max(120),
      tempCritC: z.number().int().min(30).max(120),
    }),
  })
  .partial();

export function createRouter(s: Services) {
  const state = (): AppState =>
    s.fleet.state({ showMode: s.access.showMode, pendingRestores: s.commands.pendingRestores() });
  const unlocked = (ctx: Context) => s.access.requireUnlocked(ctx.session);

  return t.router({
    session: t.router({
      get: publicProcedure.query(({ ctx }) => s.access.info(ctx.session, ctx.ip)),
      setDeviceName: publicProcedure
        .input(z.object({ name: z.string().trim().min(1).max(40) }))
        .mutation(({ ctx, input }) => {
          s.access.setDeviceName(ctx.session, input.name);
          return s.access.info(ctx.session, ctx.ip);
        }),
      unlock: publicProcedure
        .input(z.object({ pin: z.string().max(16) }))
        .mutation(({ ctx, input }) => {
          s.access.unlock(ctx.session, input.pin, ctx.ip);
          return s.access.info(ctx.session, ctx.ip);
        }),
      lock: publicProcedure.mutation(({ ctx }) => {
        s.access.lock(ctx.session);
        return s.access.info(ctx.session, ctx.ip);
      }),
    }),

    state: t.router({
      get: publicProcedure.query(state),
      live: publicProcedure.subscription(async function* ({ signal }) {
        yield state();
        for await (const _ of on(s.fleet, 'change', { signal })) yield state();
      }),
    }),

    processors: t.router({
      detail: publicProcedure
        .input(z.object({ id: z.string().min(1).max(128) }))
        .subscription(async function* ({ input, signal }) {
          const unwatch = s.fleet.watch(input.id);
          try {
            let last = -1;
            const first = s.fleet.detail(input.id);
            if (first) last = first.updatedAt;
            yield first;
            for await (const _ of on(s.fleet, 'change', { signal })) {
              const detail = s.fleet.detail(input.id);
              if (detail && detail.updatedAt !== last) {
                last = detail.updatedAt;
                yield detail;
              }
            }
          } finally {
            unwatch();
          }
        }),
      rename: publicProcedure
        .input(z.object({ id: z.string().max(128), label: z.string().trim().max(40) }))
        .mutation(({ ctx, input }) => {
          unlocked(ctx);
          const proc = s.fleet.get(input.id);
          const key = proc?.serial ?? input.id;
          if (input.label) s.store.state.settings.labels[key] = input.label;
          else delete s.store.state.settings.labels[key];
          s.store.save();
          s.fleet.notify();
        }),
      add: publicProcedure
        .input(z.object({ host: z.string().trim().min(3).max(64) }))
        .mutation(({ ctx, input }) => {
          unlocked(ctx);
          try {
            s.fleet.addManual(input.host);
          } catch (err) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: (err as Error).message });
          }
          s.fleet.notify();
        }),
      forget: publicProcedure
        .input(z.object({ id: z.string().max(128) }))
        .mutation(({ ctx, input }) => {
          unlocked(ctx);
          s.fleet.forget(input.id);
        }),
      resetBaseline: publicProcedure
        .input(z.object({ id: z.string().max(128) }))
        .mutation(({ ctx, input }) => {
          unlocked(ctx);
          s.fleet.resetBaseline(input.id);
        }),
      rescan: publicProcedure.mutation(() => {
        void s.fleet.scanNow();
      }),
    }),

    showMode: t.router({
      enable: publicProcedure.mutation(async ({ ctx }) => {
        const by = s.access.deviceName(ctx.session);
        s.access.setShowMode(true, by);
        s.audit.add({
          ts: Date.now(),
          device: by,
          ip: ctx.ip,
          action: 'show-mode.on',
          targets: [],
          result: 'ok',
        });
        s.fleet.notify();
        return s.commands.restoreAll(by);
      }),
      disable: publicProcedure
        .input(z.object({ pin: z.string().max(16) }))
        .mutation(({ ctx, input }) => {
          const by = s.access.deviceName(ctx.session);
          s.access.setShowMode(false, by, { session: ctx.session, pin: input.pin, ip: ctx.ip });
          s.audit.add({
            ts: Date.now(),
            device: by,
            ip: ctx.ip,
            action: 'show-mode.off',
            targets: [],
            result: 'ok',
          });
          s.fleet.notify();
          return s.access.info(ctx.session, ctx.ip);
        }),
    }),

    commands: t.router({
      run: publicProcedure
        .input(commandRequestSchema)
        .mutation(({ ctx, input }) => s.commands.run(input, ctx.session, ctx.ip)),
    }),

    settings: t.router({
      get: publicProcedure.query(() => ({
        settings: s.store.state.settings,
        effectiveScanTargets: s.fleet.scanTargets(),
        profiles: profiles.map((p) => ({ id: p.id, label: p.label, minVersion: p.minVersion })),
      })),
      update: publicProcedure.input(settingsPatch).mutation(({ ctx, input }) => {
        unlocked(ctx);
        const settings = s.store.state.settings;
        if (input.profileOverride && input.profileOverride !== 'auto') {
          if (!profiles.some((p) => p.id === input.profileOverride)) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown Tessera profile' });
          }
        }
        Object.assign(settings, input);
        if (settings.thresholds.tempCritC < settings.thresholds.tempWarnC) {
          settings.thresholds.tempCritC = settings.thresholds.tempWarnC;
        }
        s.store.save();
        s.fleet.notify();
        if (input.scanTargets) void s.fleet.scanNow();
        return settings;
      }),
      changePin: publicProcedure
        .input(z.object({ current: z.string().max(16), next: z.string().max(16) }))
        .mutation(({ ctx, input }) => {
          unlocked(ctx);
          s.access.changePin(ctx.session, input.current, input.next, ctx.ip);
          s.audit.add({
            ts: Date.now(),
            device: s.access.deviceName(ctx.session),
            ip: ctx.ip,
            action: 'pin.change',
            targets: [],
            result: 'ok',
          });
        }),
    }),

    audit: t.router({
      list: publicProcedure
        .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }))
        .query(({ input }) => s.audit.list(input.limit)),
    }),
  });
}

export type AppRouter = ReturnType<typeof createRouter>;
