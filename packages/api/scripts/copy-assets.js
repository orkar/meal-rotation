import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Placeholder for future (e.g., OpenAPI docs). Keeps build script stable.
const outDir = join(process.cwd(), 'dist');
mkdirSync(outDir, { recursive: true });
copyFileSync(new URL('../package.json', import.meta.url), join(outDir, 'package.json'));
