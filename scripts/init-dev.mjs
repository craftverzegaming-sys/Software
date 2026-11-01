import { randomBytes } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const envPath = resolve('.env');

try {
  await access(envPath);
} catch {
  const adminPassword = randomBytes(24).toString('base64url');
  const sessionSecret = randomBytes(48).toString('base64url');
  await writeFile(
    envPath,
    `ADMIN_PASSWORD=${adminPassword}\nSESSION_SECRET=${sessionSecret}\nPORT=8787\n`,
    { mode: 0o600, flag: 'wx' },
  );
  console.log('Created private local credentials in .env. Open that file to view your admin password.');
}
