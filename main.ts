// ai-excited-01 entry: THE WAR OF SUN AND DRAGON.
// The artwork lives in this repository as entry.png: a three-legged crow
// (Yatagarasu, the sun crow) diving from a blazing sun disc, clashing with
// a cosmic dragon coiling out of the darkness, tiny humans fleeing in
// terror below. This program only carries that file to the harness output
// directory, so the bytes the judge sees are exactly the bytes in the repo.
// Run: MAKEFUN_OUTPUT_DIR=out node main.ts

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

const bytes = readFileSync(source);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), bytes);
