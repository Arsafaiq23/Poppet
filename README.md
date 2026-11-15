# Poppet

**A pocket pal for your playback** — a retro-inspired **Video.js v10.4.0** skin housed inside an interactive 3D-glossy digital-pet egg shell with a 1-bit pixel LCD screen, walking pet playhead, and tactile 3-button navigation.

**Live Demo:** https://poppet-player.vercel.app

## Features

- **Drop-In Intro Animation (~1.4s)**: The Poppet wordmark pops in, gets squashed and shattered by the falling egg, and the LCD boots up with a scanline wipe before your pet hatches. Replay anytime from **Help (`?`) → Replay intro**.
- **Pet Playhead State Machine**: Walks (`walk-a` / `walk-b`) along the progress bar while playing, sleeps (`sleep-a` / `sleep-b`) when paused, cheers at video end, covers its ears when muted, and eats a berry (`F`, `+10s`) when fed.
- **3-Button Handheld & Keyboard Control**: Navigate the 1-bit LCD icon row with **NEXT / OK / BACK** (or `Q` / `W` / `E`), including full **Speed (`0.5x`–`2x`) & HLS Resolution** selection directly from the physical buttons, plus `Space`/`K` (Play/Pause), `←`/`→` (`±5s`), `↑`/`↓` (Volume), `M` (Mute), `Z` (Zoom/Lean-in), `S` (Steady), and `?` (Keys).
- **Video Folder & Local Playback**: Browse built-in streams (MP4 + multi-bitrate HLS) or load your own local video files and folders directly in the browser.
- **Video-Only Fullscreen**: Dedicated fullscreen player with auto-hiding controls, walking `40px` pet seekbar playhead, HLS quality switcher, playback speed, volume, captions (`CC`), and Picture-in-Picture (`PiP`).
- **Four Themes, Mascots & Backgrounds**: Switch between `mint` (default), `candy`, `midnight`, and `mono` shells; `pip`, `miso`, `wisp`, or `none` mascots; and `default`, `urban`, or `landscape` backgrounds.
- **Mobile-Ready Bottom Sheets**: Compact touch-friendly layout on small screens (`<= 600px`) with bottom/top LCD sheets for Folder, Volume, Speed/Resolution, and Shortcuts.

## Quick Start

```bash
bun install
bun run dev
```

Build and typecheck:

```bash
bun run lint
bun run build
```

## Customize

Edit `public/js/poppet.config.js` to configure defaults for `POPPET.theme`, `POPPET.pet`, `POPPET.colors`, `POPPET.shortcuts`, `POPPET.motion`, or `POPPET.muxPlaybackId`.

## Credits & License

- Licensed under the **Apache License 2.0** (`LICENSE`).
- Video playback powered by **Video.js v10.4.0** and HLS streams.
- Sintel trailer © Blender Foundation, CC BY 3.0 (`durian.blender.org`); Tears of Steel © Blender Foundation, CC BY 3.0.
