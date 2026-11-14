# 3DS Theme Studio

A web app for making custom Nintendo 3DS Home Menu themes. Upload pictures for
the top and bottom screens, crop them with a pixel-exact live 3DS preview,
recolour the Home Menu, and add looping music (from a file or recorded from
another browser tab) and sound effects. You get a theme `.zip` that Anemone3DS
installs, and in Chrome/Edge the app can save it straight into your SD card's
`/Themes/` folder.

Built with Next.js, React, Tailwind CSS and [Aceternity UI](https://ui.aceternity.com/) components.

## Run it

```bash
npm install
scripts/setup-tools.sh   # first time only: builds kame-tools + rstmcpp into bin/
npm run build
npm start                # http://localhost:4300
```

For development with hot reload, use `npm run dev`.

Requires `ffmpeg` and `zip` on the PATH. The theme is packed by two native tools
in `bin/` (not committed):

- `kame-tools` builds `body_lz.bin` and `info.smdh` and packs the zip
- `rstmcpp` converts audio to `.bcstm`/`.bcwav` (DSP-ADPCM)

## Features

- **Screens**: pan/zoom cropper for the top (400×240) and bottom (320×240)
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

## Project layout

- `src/components/`: the UI (`Studio.jsx` holds the state, with one panel per step).
  `ui/` contains the Aceternity components: file upload, glowing cards,
  background beams, spotlight, hover-border button and floating dock.
- `src/lib/`: browser logic. `imaging.js` handles downscaling, RGB565 and
  palettes; `crop.js` the crop maths; `colors.js` the colour groups;
  `recorder.js` tab capture to WAV; `limits.js` the size estimates.
- `src/app/api/build/route.js` with `src/lib/server/build-theme.js`: converts
  music and SFX with ffmpeg and rstmcpp, validates every colour key and value
  against a whitelist, writes the kame-tools config, and returns the zip. Each
  build runs in its own temp folder that is deleted afterwards.

## Installing a theme on the 3DS

1. Power off the 3DS and plug its SD/microSD card into your computer (SD slot or
   USB card reader). Then use **Save to SD card**, or copy the zip into `/Themes/`
   on the card yourself. Eject the card safely before unplugging it.
2. Open Anemone3DS (needs custom firmware), select the theme and apply it with BGM.
3. In Home Menu → Theme Settings, make sure shuffle is off.

Not affiliated with Nintendo.

## Credits

- [kame-tools](https://gitlab.com/beelzy/kame-tools) and [rstmcpp](https://gitlab.com/beelzy/rstmcpp) by beelzy
- UI components from [Aceternity UI](https://ui.aceternity.com/)
