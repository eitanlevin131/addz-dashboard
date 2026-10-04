import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
fs.mkdirSync('output/playwright/epic2', { recursive: true });
await build({ entryPoints: ['scripts/epic2-pilot.ts'], outfile: 'output/playwright/epic2/pilot.cjs', bundle: true, platform: 'node', target: 'node22', format: 'cjs', packages: 'external' });
const child = spawn(process.execPath, ['output/playwright/epic2/pilot.cjs'], { stdio: 'inherit' });
child.on('exit', code => process.exit(code || 0));
