# TODO

## Make the app live

Right now it only runs locally (`npm start`). The portfolio card links to the
GitHub repo, not a live site. Decide how to host it:

- [ ] **Browser-only on Vercel (free, recommended so far)**: compile kame-tools
      and rstmcpp to WebAssembly with Emscripten, replace ffmpeg with the
      browser's audio decoding and resampling, and build the zip in the browser.
      No server, no sleeping, and uploads never leave the user's computer.
      Before switching, check the WASM output byte for byte against the native tools.
- [ ] **Docker on a free host** (Render, Hugging Face Spaces): keeps the current
      server. As of Nov 2026 the free tiers were unreliable: services sleep
      after about 15 minutes and take about a minute to wake, and free Docker
      access was being restricted.
- [ ] **Docker on a paid host** (Render ~$7/mo, Fly.io): always on, no code changes.
- [ ] **Demo-only on Vercel**: editor and preview work, but Build is disabled.

Once it's live:

- [ ] Point the portfolio card's `previewUrl` at the live site
      (`EnricoZamarripaPortfolioSite/src/app/data/projects.js`, id 12)
- [ ] Retake the card screenshot (`public/images/projects/15.png`). The current
      one predates the mascot, the step nav and the 3DS bezel controls, and it
      shows GTA VI art.
- [ ] Add the live URL to this README and the GitHub repo's website field
