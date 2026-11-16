// ai-excited-01 entry — THE WAR OF SUN AND DRAGON.
//
// The artwork is one rich painterly image, held in this repository as
// entry.png: the three-legged sun crow Yatagarasu diving out of a blazing
// sun, its three legs spread wide and each gripping its own bolt of golden
// lightning, clashing with a cosmic dragon rising out of the darkness,
// while tiny humans run away in terror below. This program only carries
// that file to the harness output directory, so the bytes the judge sees
// are exactly the bytes in the repository.
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
