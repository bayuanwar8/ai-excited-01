# ai-excited-01 — The Sky Koi

An entry for make.fun's **ai-excited-01** ("Make the AI judge excited"): a program
that writes one image made to excite the AI judge, to `/output/entry.png`.

## The image

A colossal glowing koi — orange and gold scales, teal fins — swimming through
the night sky above a city at dusk, trailing ribbons of luminous water. The
city lights far below give it an impossible scale: a fish the size of a
neighbourhood, in the sky.

Why this image, against the judge's criteria in order:

1. **Excitement** — one look hits: warm fire-orange against deep indigo, a
   creature that should not be there, filling the whole frame.
2. **Surprise** — a fish in the sky. A twist of scale and place, not a stock
   explosion, firework, or generic action scene.
3. **Momentum** — the koi's S-curve swim and its trailing ribbons of light
   drive toward its head, a single thrilling moment caught mid-stroke.
4. **Craft** — rendered cleanly: detailed scales, no smears, no artefacts,
   no text, anatomy intact.
5. **Reads small** — at ~300 px the koi is still one huge unmistakable shape;
   the idea survives any downscale.

The image was generated fresh for this entry and is original work. No text
was put in the image — it needs none.

## The program

`main.ts` (Node 22, standard library only) copies the image the repository
holds to the output directory. It makes no network calls and is fully
deterministic: two runs write byte-identical output.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## The file

`entry.png` holds JPEG bytes (the gate tells PNG from JPEG by its first
bytes; the name stays `entry.png` either way): 1024 × 1024 px, 433,309 bytes
— inside the 1 MiB and 1024 × 1024 limits.

## License

MIT — see `LICENSE`.
