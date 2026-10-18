import { Access } from './access';
import { buildApp, buildRedirectApp } from './app';
import { AuditLog } from './audit';
import { CommandRunner } from './commands';
import { env } from './env';
import { Fleet } from './fleet';
import { Store } from './store';

const store = new Store(env.dataDir);
const audit = new AuditLog(env.dataDir);
const access = new Access(store, env.initialPin);
const fleet = new Fleet(store);
const commands = new CommandRunner(fleet, access, audit);

const app = await buildApp({ store, fleet, access, commands, audit });
await app.listen({ host: env.host, port: env.port });

let redirect: Awaited<ReturnType<typeof buildRedirectApp>> | undefined;
if (env.tls) {
  redirect = await buildRedirectApp();
  await redirect.listen({ host: env.host, port: env.httpPort });
}

fleet.start();

const relockTimer = setInterval(() => {
  const minutes = store.state.settings.autoRelockMinutes;
  if (access.showMode.enabled || minutes <= 0) return;
  if (Date.now() - access.lastActivity < minutes * 60_000) return;
  access.setShowMode(true, 'Auto relock');
  audit.add({
    ts: Date.now(),
    device: 'Auto relock',
    action: 'show-mode.on',
    targets: [],
    result: 'ok',
  });
  fleet.notify();
  commands.restoreAll('Auto relock').catch((err: unknown) => console.error('Restore failed', err));
}, 15_000);

const scheme = env.tls ? 'https' : 'http';
console.log(
  `Screen Remote listening on ${scheme}://${env.host}:${env.port} (data: ${env.dataDir})`,
);
if (!store.state.pin) console.warn('No setup PIN configured. Run "npm run set-pin" to set one.');

async function shutdown(): Promise<void> {
  clearInterval(relockTimer);
  fleet.stop();
  store.flush();
  await Promise.allSettled([app.close(), redirect?.close()]);
  process.exit(0);
}
// A stray rejected promise must not take monitoring down mid-show; log it and carry on.
process.on('unhandledRejection', (err) => console.error('Unhandled rejection', err));
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception, restarting', err);
  store.flush();
  process.exit(1);
});
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
