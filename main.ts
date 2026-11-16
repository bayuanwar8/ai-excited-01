// ai-excited-01 entry — THE WAR OF SUN AND DRAGON.
//
// The artwork is a single rich painterly image held in this repository as
// entry.png: the three-legged sun crow Yatagarasu diving from a blazing sun
// disc that fills the frame, clashing with a cosmic dragon coiling out of
// the darkness, while tiny humans flee in terror below. This program does
// nothing but carry that file to the harness output directory, so the bytes
// the judge sees are exactly the bytes in the repository.
// Run: MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = dirname(fileURLToPath(import.meta.url));
const artwork = join(repoDir, 'entry.png');
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The artwork file is JPEG bytes kept under the .png name (same pattern as
// the v1 Sky Koi entry): the harness reads the bytes as-is, so only the
// content matters, not the extension.
if (!existsSync(artwork)) {
  throw new Error('entry.png is missing from the repository');
}

mkdirSync(outputDir, { recursive: true });
copyFileSync(artwork, join(outputDir, 'entry.png'));
