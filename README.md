# 3DS Theme Studio

A web app for making custom Nintendo 3DS Home Menu themes: upload pictures for
the top and bottom screens, crop them with a live 3DS preview, add a looping
song, and get a theme `.zip` that Anemone3DS can install. In Chrome/Edge it can
save the theme straight into the SD card's `/Themes/` folder.

## Run it

```bash
npm install
npm start            # http://localhost:4300  (PORT=… to change)
```

Requires `ffmpeg` and `zip` on the PATH, plus the two theme tools in `bin/`:

- `bin/kame-tools` builds `body_lz.bin` and `info.smdh` and packs the zip
- `bin/rstmcpp` converts music to `.bcstm` (DSP-ADPCM)

If `bin/` is empty (new machine), build them with `scripts/setup-tools.sh`.

## Features

- **Screens**: crop/zoom editor for the top (400×240) and bottom (320×240)
  screens, or 1008×240 scrolling backgrounds (slow, fast, page-by-page, bounce).
- **Image quality**: mipmapped high-quality downscaling, plus RGB565
  quantization with Floyd–Steinberg dithering done in the browser. kame-tools
  runs with `-nd` so those exact pixels reach the console. The preview shows
  the same pixels. Warns when an image has to be enlarged.
- **Music**: upload a file, or record audio playing in another Chrome tab
  (silence at both ends is trimmed). Trim, fade out and mono, with a live size meter.
- **Colours**: all 13 Home Menu colour groups that kame-tools supports (tiles,
  cursor, folders, bars, buttons, text…). Each derives its shades from one base
  colour, with per-shade fine-tuning, plus a "Match my images" auto-palette and
  an option to hide the app-name bubble.
- **Sound effects**: 8 Home Menu SFX slots, converted to mono BCWAV, with a
  budget meter for the 183 KB SFX limit.
- **Textures (experimental)**: custom tile and folder textures. If you supply
  only one of a pair, the other uses the same picture, because kame-tools would
  otherwise leave it black.
- **Install**: saves straight into the SD card's `/Themes/` folder (Chrome/Edge).

## How it works

- **Browser (`public/`)**: `app.js` handles the UI; `imaging.js` handles
  downscaling, RGB565 and palettes; `colors.js` the colour groups; `recorder.js`
  tab capture to WAV.
- **Server (`server.js`)**: `POST /api/build` converts music and SFX with
  ffmpeg and rstmcpp, validates every colour key and value against a whitelist,
  writes the kame-tools config, and returns the zip. Each build runs in its own
  temp folder that is deleted afterwards.

## Installing a theme on the 3DS

1. Copy the zip into `/Themes/` on the SD card (or use **Save to SD card**).
2. Open Anemone3DS (needs custom firmware), select the theme and apply it with BGM.
3. In Home Menu → Theme Settings, make sure shuffle is off.
