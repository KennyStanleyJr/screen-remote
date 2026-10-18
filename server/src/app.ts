import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './env';
import { contextFactory, createRouter, type AppRouter, type Services } from './router';

function securityHeaders(app: FastifyInstance): void {
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
  });
}

function serveCaCert(app: FastifyInstance): void {
  app.get('/certs/rootCA.pem', async (_req, reply) => {
    if (!env.caCert || !existsSync(env.caCert))
      return reply.code(404).send('No CA certificate configured');
    return reply
      .header('Content-Type', 'application/x-x509-ca-cert')
      .header('Content-Disposition', 'attachment; filename="screenremote-rootCA.pem"')
      .send(readFileSync(env.caCert));
  });
}

export async function buildApp(services: Services): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'warn' },
    routerOptions: { maxParamLength: 5000 },
    ...(env.tls
      ? { https: { key: readFileSync(env.tlsKey!), cert: readFileSync(env.tlsCert!) } }
      : {}),
  }) as unknown as FastifyInstance;

  securityHeaders(app);
  await app.register(fastifyCookie);
  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: createRouter(services),
      createContext: contextFactory(services.access),
      onError: ({ path, error }) => {
        if (error.code === 'INTERNAL_SERVER_ERROR')
          app.log.error({ path, err: error }, 'tRPC error');
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
  });
  serveCaCert(app);
  app.get('/healthz', async () => ({ ok: true }));

  if (existsSync(join(env.webDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: env.webDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/trpc')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'Not found' });
    });
  } else if (!env.dev) {
    app.log.warn(`Web app not found at ${env.webDir}. Run "npm run build" first.`);
  }

  return app;
}

/** Plain HTTP helper used with TLS: certificate download + redirect everything else to HTTPS. */
export async function buildRedirectApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  securityHeaders(app);
  serveCaCert(app);
  app.get('/certs', async (_req, reply) =>
    reply.type('text/html').send(
      `<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;background:#0e1013;color:#e8eaed;padding:24px">
<h2>Screen Remote certificate</h2><p>Install this certificate once per phone so it trusts Screen Remote.</p>
<p><a style="color:#7cb7ff" href="/certs/rootCA.pem">Download certificate</a></p>
<p>Then open <a style="color:#7cb7ff" href="https://screenremote.local/">https://screenremote.local</a></p></body>`,
    ),
  );
  app.setNotFoundHandler((req, reply) => {
    const host = (req.headers.host ?? 'screenremote.local').replace(/:\d+$/, '');
    const port = env.port === 443 ? '' : `:${env.port}`;
    return reply.redirect(`https://${host}${port}${req.url}`, 301);
  });
  return app;
}
