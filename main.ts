// ai-excited-01 entry: copies the image the repository holds to /output/entry.png.
// The image is a giant glowing koi swimming through the dusk sky above a city —
// one look, one impossible scale, one clear shape even at 300 pixels across.
// The file is JPEG bytes under the name entry.png; the gate tells PNG from JPEG
// by the first bytes, so the name stays entry.png either way.
// Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync } from 'node:fs';
import { join } from 'node:path';

copyFileSync(
  new URL('./entry.png', import.meta.url),
  join(process.env.MAKEFUN_OUTPUT_DIR ?? '/output', 'entry.png'),
);
