import { createInterface } from 'node:readline/promises';
import { hashPin, validatePin } from '../access';
import { env } from '../env';
import { Store } from '../store';

/**
 * Sets the shared setup PIN. Usage: `npm run set-pin` or `npm run set-pin -- 123456`.
 * Stop the server first: it keeps state in memory and saves it on shutdown.
 */
const store = new Store(env.dataDir);
let pin = process.argv.slice(2).find((a) => /^\d+$/.test(a));

if (!pin) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  pin = (await rl.question('New setup PIN (4-8 digits): ')).trim();
  rl.close();
}

try {
  validatePin(pin);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

store.state.pin = hashPin(pin);
if (!store.flush()) process.exit(1);
console.log(`Setup PIN saved to ${env.dataDir}.`);
console.log('The server must be stopped while this runs, or it will write its old PIN back.');
