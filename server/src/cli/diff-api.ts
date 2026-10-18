import { profiles, selectProfile, getProfile } from '@screen-remote/shared';
import { TesseraClient } from '../tessera/client';
import { isTree } from '../tessera/tree';

/**
 * Compares a live processor's API (via `?help=1`) against a version profile.
 * Usage: `npm run diff-api -- 192.168.0.50 [profileId]`
 */
const [hostArg, profileArg] = process.argv.slice(2);
if (!hostArg) {
  console.log('Usage: npm run diff-api -- <host[:port]> [profileId]');
  console.log(`Profiles: ${profiles.map((p) => p.id).join(', ')}`);
  process.exit(1);
}

const [host = '', portStr] = hostArg.split(':');
const client = new TesseraClient(host, Number(portStr ?? 80), 10_000);

const version = String(await client.get('system/software-version'));
const profile = profileArg ? getProfile(profileArg) : selectProfile(version);
if (!profile) {
  console.error(`Unknown profile ${profileArg}`);
  process.exit(1);
}
console.log(`Processor software ${version}; comparing against profile ${profile.id}\n`);

const help = await client.help('');
const live = new Map<string, string>();

/** Leaves in help output have an "Access Specifier" key. Dynamic segments come back as examples. */
function walk(node: unknown, path: string[]): void {
  if (!isTree(node)) return;
  if ('Access Specifier' in node) {
    live.set(path.join('/'), String(node['Access Specifier']));
    return;
  }
  for (const [k, v] of Object.entries(node)) walk(v, [...path, k.toLowerCase()]);
}
walk(isTree(help) && 'api' in help ? help.api : help, []);

const profilePaths = [
  ...Object.values(profile.endpoints)
    .filter((s) => s.type !== 'tree')
    .map((s) => s.path),
  ...profile.temperatures.map((t) => t.path),
  ...profile.fans.flatMap((f) => [f.speedPath, f.statusPath]),
];
const matchers = profilePaths.map((p) => ({
  path: p,
  re: new RegExp(`^${p.toLowerCase().replace(/\{[^}]+\}/g, '[^/]+')}$`),
}));
const livePaths = [...live.keys()];

const missing = matchers.filter((m) => !livePaths.some((l) => m.re.test(l))).map((m) => m.path);
const added = [
  ...new Set(
    livePaths
      .filter((l) => !matchers.some((m) => m.re.test(l)))
      .map((l) => l.replace(/\/\d+(?=\/|$)/g, '/*')),
  ),
];

console.log(`In profile but not on processor (${missing.length}):`);
for (const p of missing) console.log(`  - ${p}`);
console.log(`\nOn processor but not in profile (${added.length}):`);
for (const p of added) console.log(`  + ${p}`);
