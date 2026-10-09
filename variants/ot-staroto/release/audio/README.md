# Audio files

The game uses these files from its own server. There is no player upload, file picker, browser audio database, external music service or runtime synthesizer.

To use your sounds:

1. Replace the corresponding file here, preserving its filename, or change `file` in [`src/audio-config.ts`](../../src/audio-config.ts).
2. Set that cue's `gain`, `rate` and `duration`. `gain` is relative to the player's volume; `rate: 1` is the original speed; `duration` limits long recordings used as effects. Keep gain between 0 and 1 and rate/duration greater than zero.
3. Run `npm start` to listen, or `npm run build` to produce the updated deployment. The build copies this directory into `dist/audio`. If you distribute the separate test ZIP, regenerate it too.

Paths are relative to `public/audio`; for example, `shot.wav` becomes `./audio/shot.wav` under Vite's configured base path. Keep the files alongside the game when deploying it below a subdirectory. WAV is the safest replacement format for both the browser and the supplied local test server.

| Cue | File | Bundled duration | Purpose |
| --- | --- | ---: | --- |
| `drop` | `drop.wav` | 0.23 s | Paper/wood landing |
| `cascade` | `cascade.wav` | 0.38 s | Staggered falling impacts |
| `reveal` | `reveal.wav` | 0.42 s | Coin or feature flip |
| `coin` | `coin.wav` | 0.58 s | Metallic coin hit/collection |
| `shot` | `shot.wav` | 0.42 s | Short pistol report and room tail |
| `feature` | `feature.wav` | 1.20 s | Character entrance |
| `bonus` | `bonus.wav` | 2.60 s | Bonus opening fanfare |
| `win` | `win.wav` | 2.00 s | Win count opening |
| `max` | `max.wav` | 3.60 s | MAX celebration |
| `scatter` | `scatter.wav` | 0.80 s | Scatter landing |
| `music` | `yard-loop.wav` | 12.00 s | Four-bar background loop |

`fallback` in the manifest names another bundled cue used if a file cannot be fetched or decoded. The effect cooldown and voice limits keep dense symbol flips and shot volleys from stacking into an excessively loud wall of sound. Music has its own loop and is not subject to the effect duration limit. The music checkbox stops this loop; it does not select another soundtrack.

`initialize()` prefetches files without creating an audio context or playing anything. `unlock()` creates/resumes the context only after a player gesture. A cue requested during unlocking waits for decoding instead of losing the first shot. Mute stops current effects and music and prevents pending effects from starting; volume and music settings remain normal player controls.

The supplied 24 kHz, 16-bit mono WAVs are original procedural recordings created for this repository from oscillators, filtered noise, envelopes and short room echoes. The loop is an original four-bar instrumental motif. They contain no sampled commercial game audio or outside recordings. Replace them with files you have permission to distribute.
