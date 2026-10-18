// Packs Screen Remote for copying to a Raspberry Pi (see docs/SETUP.md).
//
//   npm run bundle          source, for a fresh install (the installer needs internet)
//   npm run bundle:update   built server and web app, for updating a Pi without internet
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = process.argv.includes('--built');
const out = built ? 'screen-remote-update.tgz' : 'screen-remote.tgz';
const exclude = [
  'screen-remote.tgz',
  'screen-remote-update.tgz',
  '.git',
  'node_modules',
  '.svelte-kit',
  'build',
  'dist',
  'data',
  'data-dev',
  'certs',
  '*.log',
  '.env',
  '.env.*',
  '.DS_Store',
];
const builtDirs = ['server/dist', 'web/build'];

if (built) {
  const missing = builtDirs.filter((d) => !existsSync(resolve(root, d)));
  if (missing.length) {
    console.error(`Missing ${missing.join(' and ')}. Run npm run build first.`);
    process.exit(1);
  }
}

// macOS tar otherwise adds ._* files and Mac-only attributes that Linux tar warns about.
const macFlags = process.platform === 'darwin' ? ['--no-xattrs', '--no-mac-metadata'] : [];
const args = built
  ? ['-czf', out, ...macFlags, '--exclude=.DS_Store', ...builtDirs]
  : ['-czf', out, ...macFlags, ...exclude.map((p) => `--exclude=${p}`), '.'];

const result = spawnSync('tar', args, {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, COPYFILE_DISABLE: '1' },
});
if (result.status !== 0) {
  console.error('tar failed. It ships with Windows 10+, macOS and Linux.');
  process.exit(1);
}
const mb = (statSync(resolve(root, out)).size / 1024 / 1024).toFixed(1);
console.log(`Wrote ${out} (${mb} MB). Copy it to the Pi, for example:`);
console.log(`  scp ${out} <user>@<pi-address>:~`);
