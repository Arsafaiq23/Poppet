# Poppet

A pocket pal for your playback — a custom **Video.js v10.4.0** skin where a tiny pixel pet acts as the seek-bar playhead inside a translucent candy-plastic control shell.

## Features

- **Pet Playhead State Machine**: Walks (`walk-a` / `walk-b`) while playing, sleeps (`sleep-a` / `sleep-b`) when paused, cheers at video end, looks sad while buffering, covers its ears when muted, holds steady while dragging, and plays a `nom` frame when fed (`F` or berry button, `+10s`).
- **Four Contrast-Safe Themes**: `candy` (default pink + lime), `mint`, `midnight`, and `mono` — all driven by semantic CSS custom properties in `public/css/tokens.css`.
- **Four Mascot Modes**: `pip` (default lime-sprout egg), `miso` (cream-and-ginger cat), `wisp` (pixel ghost), and `none` (classic rounded thumb with a 44×44px touch target).
- **Accessible by Default**: Full keyboard navigation (`Space`/`K`, `Left`/`J`, `Right`/`L`, `Home`/`End`, `Up`/`Down`, `M`, `F` Feed, `Shift+F` Fullscreen, `?` shortcuts tooltip, `Esc`), live-region announcements, ≥ 44px touch targets, scrim + translucent shell contrast, and `prefers-reduced-motion` support.

## Customize

Edit `public/js/poppet.config.js` to change `POPPET.theme`, `POPPET.pet`, `POPPET.colors`, `POPPET.shortcuts`, `POPPET.motion`, or `POPPET.muxPlaybackId`.

## Credits & License

- Licensed under the **Apache License 2.0** (`LICENSE`).
- Video playback powered by Video.js v10.4.0 and Mux demo HLS stream (`BV3YZtogl89mg9VcNBhhnHm02Y34zI1nlMuMQfAbl3dM`).
- Sintel trailer © Blender Foundation, CC BY 3.0, `durian.blender.org`.
