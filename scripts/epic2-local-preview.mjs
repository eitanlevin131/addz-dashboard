import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const isolated = JSON.parse(fs.readFileSync('.tmp/epic2/environment.json', 'utf8'));
const target = new URL(isolated.E2E_DATABASE_URL);
if (process.env.VERCEL || target.hostname !== 'ep-summer-waterfall-aprx73rb.c-7.us-east-1.aws.neon.tech' || target.pathname !== '/addz_epic2_validation') throw Error('Unsafe local preview target');
const base = 'http://127.0.0.1:3070';
const mock = 'http://127.0.0.1:3071';
const env = {
  ...process.env,
  DATABASE_URL: target.href, E2E_DATABASE_URL: target.href,
  AUTH_URL: base, NEXTAUTH_URL: base, AUTH_SECRET: 'epic2-isolated-local-preview',
  AUTH_DEV_BYPASS: 'true', AUTH_PASSWORD_FALLBACK: 'false',
  OWNER_EMAIL: 'e2e-owner@example.test', ADMIN_EMAILS: '', ADMIN_PASSWORD: '', ADMIN_LOGIN_CODE: '',
  FLASHY_API_KEY_ENCRYPTION_SECRET: 'epic2-synthetic-encryption-key',
  FLASHY_API_BASE_URL: mock, RESEND_API_BASE_URL: mock, OPENAI_API_BASE_URL: mock,
  OPENAI_API_KEY: 'e2e-openai-key', RESEND_API_KEY: 'e2e-resend-key',
  EMAIL_FROM: 'ADDZ Test <login@example.test>', SYNC_ALERT_EMAILS: '',
  BLOB_READ_WRITE_TOKEN: '', AI_DOCUMENTS_READ_WRITE_TOKEN: '',
  CRON_SECRET: 'epic2-disabled-cron', WEBSITE_SCAN_E2E: '1', E2E_MOCK_PORT: '3071',
};
fs.mkdirSync('output/playwright/epic2', { recursive: true });
const root = process.cwd();
const snapshot = path.join(root, 'output/playwright/epic2/local-app');
fs.mkdirSync(snapshot, { recursive: true });
// A generated source snapshot avoids sharing Next's dev lock or any .env file.
for (const name of ['src', 'public', 'package.json', 'tsconfig.json', 'next.config.ts', 'postcss.config.mjs', 'next-env.d.ts']) {
  fs.cpSync(path.join(root, name), path.join(snapshot, name), { recursive: true });
}
if (!fs.existsSync(path.join(snapshot, 'node_modules'))) fs.symlinkSync(path.join(root, 'node_modules'), path.join(snapshot, 'node_modules'), 'dir');
const launch = (args, name, cwd = root) => {
  const log = fs.openSync(`output/playwright/epic2/${name}.log`, 'a');
  const child = spawn(process.execPath, args, { env, cwd, detached: true, stdio: ['ignore', log, log] });
  child.unref(); fs.closeSync(log); return child.pid;
};
const pids = {
  mock: launch(['e2e/mock-services.mjs'], 'local-mock'),
  app: launch(['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '-p', '3070'], 'local-app', snapshot),
};
fs.writeFileSync('output/playwright/epic2/local-preview-pids.json', JSON.stringify(pids));
console.log(JSON.stringify({ url: base, isolated: true, providers: 'mocked', ...pids }));
