// ai-excited-01 entry: the artwork lives in this repository as entry.png,
// a rich painterly image of a nine-tailed fox under a blood-red moon.
// This program only carries it to the harness output directory, so the
// bytes the judge sees are exactly the bytes in the repository.
// Run: MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, 'entry.png');
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The artwork file is JPEG bytes kept under the .png name (same pattern as
// the v1 Sky Koi entry): the harness reads the bytes as-is, so only the
// content matters, not the extension.
if (!existsSync(source)) {
  throw new Error('entry.png is missing from the repository');
}

mkdirSync(outDir, { recursive: true });
copyFileSync(source, join(outDir, 'entry.png'));
