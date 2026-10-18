// Packs the source into screen-remote.tgz for copying to a Raspberry Pi (see docs/SETUP.md).
// Usage: npm run bundle
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = 'screen-remote.tgz';
const exclude = [
  out,
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
];

const result = spawnSync('tar', ['-czf', out, ...exclude.map((p) => `--exclude=${p}`), '.'], {
  cwd: root,
  stdio: 'inherit',
});
if (result.status !== 0) {
  console.error('tar failed. It ships with Windows 10+, macOS and Linux.');
  process.exit(1);
}
const mb = (statSync(resolve(root, out)).size / 1024 / 1024).toFixed(1);
console.log(`Wrote ${out} (${mb} MB). Copy it to the Pi, for example:`);
console.log(`  scp ${out} <user>@<pi-address>:~`);
