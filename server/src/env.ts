import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');

const tlsCert = process.env.TLS_CERT;
const tlsKey = process.env.TLS_KEY;
const tls = Boolean(tlsCert && tlsKey && existsSync(tlsCert) && existsSync(tlsKey));

export const env = {
  dev,
  /** JSON state, audit log. */
  dataDir: resolve(process.env.DATA_DIR ?? (dev ? 'data-dev' : resolve(here, '../data'))),
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? (tls ? 443 : 8080)),
  /** Plain HTTP port used for the certificate download page and HTTPS redirect when TLS is on. */
  httpPort: Number(process.env.HTTP_PORT ?? 80),
  tls,
  tlsCert,
  tlsKey,
  /** Root CA certificate that phones install so they trust the HTTPS certificate. */
  caCert: process.env.CA_CERT,
  webDir: resolve(process.env.WEB_DIR ?? resolve(here, '../../web/build')),
  /** First-boot PIN when none has been set yet. */
  initialPin: process.env.SETUP_PIN ?? (dev ? '1234' : undefined),
  devScanTargets: ['127.0.0.1:9001-9012'],
};
