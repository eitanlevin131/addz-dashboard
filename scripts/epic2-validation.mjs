import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { neon } from '@neondatabase/serverless';
const isolated = JSON.parse(fs.readFileSync('.tmp/epic2/environment.json', 'utf8'));
const url = new URL(isolated.E2E_DATABASE_URL);
if (url.hostname !== 'ep-summer-waterfall-aprx73rb.c-7.us-east-1.aws.neon.tech' || url.pathname !== '/addz_epic2_validation') throw Error('Unsafe validation target');
// Fresh synthetic OTP state per test run; retain the real application's limits.
await neon(isolated.E2E_DATABASE_URL).query('delete from login_codes');
const env = { ...process.env, ...isolated, DATABASE_URL: 'postgresql://unused:unused@build.invalid/build_only', AUTH_SECRET: 'epic2-synthetic-test-secret-not-production', FLASHY_API_KEY_ENCRYPTION_SECRET: 'epic2-synthetic-encryption-key', BLOB_READ_WRITE_TOKEN: '', CRON_SECRET: 'epic2-disabled-cron', AUTH_DEV_BYPASS: 'false' };
const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], { env, stdio: 'inherit' });
child.on('exit', code => process.exit(code || 0));
child.on('error', () => process.exit(1));
