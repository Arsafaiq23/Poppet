# Build Poppet — a Video.js v10 skin

Paste this whole file into Antigravity and implement it. Do not invent a new concept. Do not use the names or logos Tamagotchi or Bandai, and do not copy any official Bandai character. The skin is called **Poppet**.

The default product is a candy-plastic pocket-pet player: theme **Candy** (pink + lime) and mascot **Pip** (a lime-sprout egg). That is the main idea and the demo default. The architecture must also let a host switch the pet and the theme without rewriting the skin. Three original pets plus a no-pet thumb, and four contrast-safe themes, all driven by CSS custom properties and a single config file.

This is a Contra Video.js Skins Challenge entry. Deadline: **Tuesday 17 November 2026, 14:59 Asia/Jakarta (WIB)** (16 November 2026, 11:59 PM PST). Prize pool $10,000. Judges: Sam Potts (Plyr) and Steve Heffernan (Video.js, co-founder of Mux). They will inspect the code.

## What you are building

A custom Video.js v10 skin whose one idea is: **a tiny pixel pet is the seek-bar playhead** (or, if the host turns the pet off, a plain classic thumb on the same shell).

- The video stays full-size (16:9). Do not shrink the picture inside a toy egg or device bezel.
- The “pocket pet” feeling lives in a rounded, translucent candy-plastic **control shell** over the bottom of the video, with a scrim so controls stay readable on bright and dark footage.
- The active pet walks along the seek bar while the video plays, sleeps (Zzz) when paused, cheers at the end, looks sad while buffering, and is draggable to scrub. On mute, it covers its ears. Press **F** to “feed” it: seek +10 seconds and play the nom frame. If `pet` is `none`, the same states exist but the thumb is a plain rounded handle; Feed still skips +10s without a nom sprite.
- Default vibe: fun, playful, 1990s virtual-pet nostalgia, translucent candy plastic in pink + lime, pixel accents. Not a children’s-content player. Stay distinct from the Nubi entry (https://nubi-player.vercel.app/). Poppet is a nostalgic candy-toy metaphor for any video — and a host who wants a quieter or darker taste can switch theme and pet from config.

Material kit (this folder):

- `tokens.css` — drop into `css/tokens.css`. Semantic custom properties plus four `data-theme` presets.
- `poppet.config.js` — drop into `js/poppet.config.js`. Single config for pet, theme, color overrides, shortcuts, sounds, motion, and media.
- `assets/pets/pip.svg` (and `.png`) — default mascot, 8 frames × 24×24, sheet 192×24
- `assets/pets/miso.svg` — original pixel cat
- `assets/pets/wisp.svg` — original pixel ghost/blob
- `assets/pets/preview.png` — labeled strip of all three pets plus a none thumb
- `assets/icons.svg` — play, pause, volume, muted, fullscreen, exit-fullscreen, heart, heart-empty, feed, shortcuts, gear
- `assets/sintel-trailer.mp4` and `assets/poster.png` — local fallback (CC BY Blender Foundation; keep the credit)
- `fonts/` — Fredoka (UI, and Mono theme time) and Silkscreen (pixel time), both OFL, with their OFL.txt files
- `mood/tamagotchi.jpg` — visual reference only; do not copy the “Tamagotchi” wordmark from it
- `mood/style-sheet.png` — four themes, three pets, and the no-pet option
- `LICENSE` — Apache License 2.0

## Stack (locked)

Plain HTML, CSS, and JavaScript. No React, no Vue, no bundler required. A tiny static Vite or vanilla folder is fine if you want a local server; the shipped site must be static files.

Use **Video.js v10.4.0** web components, pinned on the official jsDelivr CDN. Do not use `@latest`. Do not use Video.js 8 (`video.js` on npm is still v8). Confirm against the official docs if a newer 10.x patch exists, but start on 10.4.0 and keep every bundle on the same version.

Package / CDN:

- npm package (docs / packaged path): `@videojs/cdn@10.4.0` and `@videojs/html@10.4.0`
- CSS: `https://cdn.jsdelivr.net/npm/@videojs/cdn@10.4.0/global.css`
- Player: `https://cdn.jsdelivr.net/npm/@videojs/cdn@10.4.0/video-player.js`
- Mux media (when a playback ID is set): `https://cdn.jsdelivr.net/npm/@videojs/cdn@10.4.0/media/mux-video.js`
- Optional Mux Data: `https://cdn.jsdelivr.net/npm/@videojs/cdn@10.4.0/extensions/mux-data.js`
- Custom skin UI (import only what you use), all from the same `@10.4.0` origin:

```
ui/container.js
ui/controls.js
ui/controls-content.js
ui/controls-group.js
ui/play-button.js
ui/time-slider.js
ui/slider-track.js
ui/slider-buffer.js
ui/slider-fill.js
ui/slider-thumb.js
ui/time.js
ui/mute-button.js
ui/volume-slider.js
ui/fullscreen-button.js
ui/hotkey.js
ui/status-announcer.js
ui/error-dialog.js
ui/dialog-popup.js
ui/dialog-title.js
ui/dialog-description.js
ui/dialog-close.js
```

Official docs (read these, do not guess the architecture):

- https://videojs.org/
- https://videojs.org/docs/guides/installation/cdn
- https://videojs.org/docs/framework/html/guides/cdn
- https://videojs.org/docs/framework/html/guides/architecture
- https://videojs.org/docs/framework/html/guides/build-your-own-skin
- https://videojs.org/docs/framework/html/guides/build-your-own-component
- https://videojs.org/docs/framework/html/guides/customize-skins
- https://videojs.org/docs/framework/html/reference/components/mux-video
- HTML docs index: https://videojs.org/docs/framework/html/llms.txt

Compose the skin from official UI elements inside `<video-player>` + `<media-container>`. Read player state through Video.js features (`PlayerController` / built-in media-* controls). Do not wrap a hidden native player in a fake overlay. Do not use fragile CSS hacks that depend on undocumented internal class names of a packaged skin. Restyle official elements (`media-play-button`, `media-time-slider`, `media-slider-thumb`, `media-mute-button`, `media-volume-slider`, `media-fullscreen-button`, `media-time`) and add small custom elements only where you need new behavior (pet pose, feed, heart meter, shortcuts tooltip). Custom elements must live inside `<video-player>`, extend `UIElement` when they subscribe to state, and clean up in `disconnectedCallback`.

## File structure

```
poppet/
  index.html              # demo page: title, player, shortcuts hint, Sintel credit
  css/tokens.css          # copied from the kit
  css/poppet.css          # shell, slider, buttons, typography, states, reduced motion
  js/poppet.config.js     # copied from the kit; this is the only file hosts should edit
  js/pet.js               # pose state machine + sprite frame + feed
  js/poppet.js            # wiring, apply config, hotkeys, tooltip
  assets/                 # copied from the kit (pets/, icons, video, poster)
  fonts/                  # copied from the kit, keep the OFL.txt files
  LICENSE                 # Apache-2.0 from the kit
  README.md               # short paragraph, credit, how to run, how to customize
```

## Theming architecture

Every color, radius, translucency, and type style is a CSS custom property on `:root` / `[data-theme]`. The skin CSS must use only the **semantic** tokens, never a hard-coded hex (except inside `tokens.css` itself):

| Token | Role |
|-------|------|
| `--poppet-page` | Page background around the player |
| `--poppet-surface` | Cream / panel |
| `--poppet-ink` | Primary text and icons on the shell |
| `--poppet-ink-soft` | Secondary text, **only** on surface or page (not on saturated buttons) |
| `--poppet-shell-top` / `--poppet-shell-top-hi` | Upper shell |
| `--poppet-shell-bottom` / `--poppet-shell-bottom-hi` | Lower shell |
| `--poppet-accent` / `--poppet-accent-deep` | Seek fill, highlights |
| `--poppet-on-accent` | Text/icons on the accent (must stay ≥ 4.5:1) |
| `--poppet-button` / `--poppet-button-alt` | Circular (or mono-square) control fills |
| `--poppet-heart` | Filled hearts |
| `--poppet-shell-alpha` | Shell translucency, 0–1 |
| `--poppet-gloss` | Gloss highlight strength, 0–1 |
| `--poppet-radius-shell` / `--poppet-radius-button` | Shape |
| `--poppet-font-ui` / `--poppet-font-time` | UI vs time/numbers (pixel or rounded) |
| `--poppet-scrim` / `--poppet-scrim-soft` | Contrast over video |
| `--poppet-focus` | Visible focus ring |

Set `data-theme` on `<video-player>` so the page and the skin inherit it. Four presets ship in `tokens.css`:

- `candy` (default) — pink + lime, candy radius, Silkscreen time
- `mint` — seafoam, same candy radius, Silkscreen time
- `midnight` — dark shell, light ink, mint accent, Silkscreen time
- `mono` — greyscale, tighter radius (16px), Fredoka (rounded) time, low gloss

Each preset is already contrast-checked at ≥ 4.5:1 for ink on its surfaces and for on-accent on its accent. If you accept custom `colors` overrides, do not try to auto-fix contrast, but keep the default four themes passing. Recolor icon *backs* with `var(--poppet-button)` / `var(--poppet-button-alt)` in CSS rather than relying on the hardcoded candy fills in `icons.svg`.

## Pet sprite contract

Every mascot is a horizontal sheet of **8 frames**, each **24×24**, sheet **192×24**, in this exact order. A new pet is valid if it matches this contract and is referenced in `PETS`.

| Index | `--frame` | id             | When                                      |
|------:|----------:|----------------|-------------------------------------------|
|     0 |         0 | `walk-a`       | playing, even step                        |
|     1 |         1 | `walk-b`       | playing, odd step                         |
|     2 |         2 | `sleep-a`      | paused, even step                         |
|     3 |         3 | `sleep-b`      | paused, odd step (Zzz shifts)             |
|     4 |         4 | `cheer`        | ended                                     |
|     5 |         5 | `sad`          | buffering / waiting                       |
|     6 |         6 | `ears-covered` | muted (and not in a higher-priority pose) |
|     7 |         7 | `nom`          | temporary pose after Feed                 |

Shipped pets (all original, not copyrighted characters):

- `pip` — lime-sprout egg (default)
- `miso` — a small cream-and-ginger cat
- `wisp` — a tiny round ghost/blob
- `none` — no sprite; a plain classic rounded thumb (`--poppet-thumb-size`, filled with `--poppet-accent`, still a ≥ 44×44 hit area)

Set `data-pet` on `<video-player>` to the pet id. Style the official `media-slider-thumb` as the playhead (the thumb *is* the pet, so dragging it already seeks):

```css
media-slider-thumb {
  width: var(--poppet-pet-size);
  height: var(--poppet-pet-size);
  background: no-repeat;
  background-size: 800% 100%;
  background-position: calc(var(--frame, 0) * -100%) 0;
  image-rendering: pixelated;
  border: 0;
  box-shadow: var(--poppet-shadow-pet);
}
[data-pet="pip"]  media-slider-thumb { background-image: url("../assets/pets/pip.svg"); }
[data-pet="miso"] media-slider-thumb { background-image: url("../assets/pets/miso.svg"); }
[data-pet="wisp"] media-slider-thumb { background-image: url("../assets/pets/wisp.svg"); }
[data-pet="none"] media-slider-thumb {
  width: var(--poppet-thumb-size);
  height: var(--poppet-thumb-size);
  padding: 14px;            /* keep a 44px hit area */
  background-image: none;
  background-color: var(--poppet-accent);
  border-radius: 50%;
  box-sizing: content-box;
  image-rendering: auto;
}
```

`--frame` is set from JS. Use the pet’s `name` from `PETS` in aria-labels and announcements (“Fed Pip, skipped 10 seconds.” / “Fed Miso, …” / for `none`, “Skipped 10 seconds.”).

## Config (`poppet.config.js`)

Copy the kit file and apply it on boot (see the comment at the top of the file). Hosts should only need to edit this one file.

```js
POPPET.pet = "pip";       // "pip" | "miso" | "wisp" | "none"
POPPET.theme = "candy";   // "candy" | "mint" | "midnight" | "mono"
POPPET.colors = {};       // optional overrides, e.g. { accent: "#ff7a00", ink: "#1a1020" }
POPPET.shortcuts = true;  // false hides the "?" tooltip; keys still work
POPPET.sounds = false;    // kit is silent; gate any later chirps with this
POPPET.motion = "system"; // "full" | "reduced" | "system"
POPPET.muxPlaybackId = "";
```

Examples (also at the bottom of `poppet.config.js`):

```js
// Dark, no pet
POPPET.theme = "midnight";
POPPET.pet = "none";

// Mint shell, Miso the cat
POPPET.theme = "mint";
POPPET.pet = "miso";

// Candy, custom accent
POPPET.theme = "candy";
POPPET.colors = { accent: "#ff7a00", onAccent: "#1a1020" };

// Quiet greyscale
POPPET.theme = "mono";
POPPET.pet = "none";
POPPET.motion = "reduced";
POPPET.shortcuts = false;
```

`colorOverridesToStyle()` maps camelCase keys onto `--poppet-*` and is applied as `element.style.setProperty`. `motion: "system"` follows the OS; `"reduced"` always quiets motion; `"full"` uses the toy motion but still honors `prefers-reduced-motion` as a floor. Set `data-motion` from this value.

Do not build the in-player customize popover in the first pass. It is follow-up prompt 5, after the player already works.

## Pet state machine

Single source of pose truth in `js/pet.js`. Inputs come from Video.js state: `paused`, `ended`, `currentTime`, `duration`, `volume`, `muted`, plus seeking (pointer down on the slider) and a waiting / `stalled` signal for buffering.

Priority, highest first:

1. `nom` — temporary, `--poppet-nom-ms` (600 ms) after Feed. Then return to the pose that the current state requires. Skip the sprite change when `pet` is `none`.
2. `seeking` — while the pointer is down on the slider/pet. Use a frozen `walk-a` (or a slight CSS scale) so the pet looks “held”. Do not keep walking mid-drag.
3. `ended` — `cheer`
4. `buffering` — `sad` (only while actually waiting for data, not on every pause)
5. `muted` — `ears-covered` (covers both playing and paused; mute wins over walk/sleep)
6. `paused` — `sleep-a` / `sleep-b` at `--poppet-walk-ms` (180 ms)
7. `playing` — `walk-a` / `walk-b` at 180 ms

Feed (`F`, or a small berry button in the shell): `seek(min(currentTime + 10, duration))`, flash `nom`, and show a brief “+10s” pip. If already within 10 seconds of the end, seek to the end (and cheer). Announce: “Fed {name}, skipped 10 seconds.” (or “Skipped 10 seconds.” when pet is `none`).

Walk and sleep cycles run on an interval. If motion is reduced (config or OS), skip the interval and use the first frame of that pose. Pause must be instant: never wait for a walk or nom animation to finish before the video pauses.

Set `data-pet-state` on `media-container` to `playing | paused | ended | buffering | seeking | muted` so CSS can react.

## Layout and interactions

- Page uses `var(--poppet-page)` and `var(--poppet-ink)`. Wordmark **Poppet** in Fredoka, tagline “A pocket pal for your playback.”
- Player: 16:9, full width of a centered column (~1120 px max). Poster from the kit. `playsinline` and `preload="metadata"`.
- Over the video, a bottom scrim plus a candy-plastic shell: upper deck from `--poppet-shell-top-fill`, lower deck from `--poppet-shell-bottom-fill`, opacity from `--poppet-shell-alpha`, gloss from `--poppet-shell-gloss`, radius from `--poppet-radius-shell`. Opaque enough to read (the default alpha is ~0.94).
- Shell contents, desktop:
  - Left: play/pause (44 px min, fill `--poppet-button`).
  - Center: seek track (accent fill, surface/shell track, buffer visible) with the pet (or classic thumb) as the handle.
  - Time in `--poppet-font-time`, `current / duration`, `01:24 / 03:45` format.
  - Heart meter for volume (`--poppet-heart`) + mute button.
  - Fullscreen button.
  - If `shortcuts` is true, a small `?` control that opens a tooltip. Hide it when `shortcuts` is false.
- Volume: **5 hearts**. Filled hearts follow volume; muted shows all empty and the pet covers its ears (when a pet is active). Click or drag the hearts to set volume; Up/Down still change volume. Keep a real `media-volume-slider` (visually restyled as the hearts, or visually hidden but accessible if you build a custom heart widget that dispatches `setVolume` / `setMuted`). Mute toggles `muted`.
- Show controls before start (`--media-controls-before-start: visible`) and a large play button over the poster.
- Autohide the shell while playing and idle; show on hover, focus, pause, or touch. Autohide must not trap keyboard focus. On reduced motion, snap rather than slide.
- Micro-interactions should feel like a toy, not a cartoon overload. Nothing blocks a control action.
- Seek must stay smooth while dragging.
- Do not add extra chrome. One idea, tidy. The optional customize gear is only in follow-up 5.

## Keyboard map

Standard player keys, plus the signature Feed key. **F is Feed, not fullscreen.** Document this in the tooltip so it is discoverable.

| Key | Action |
|-----|--------|
| `Space` or `K` | Play / pause |
| `Left` / `J` | Seek −5 seconds |
| `Right` / `L` | Seek +5 seconds |
| `Home` | Seek to start |
| `End` | Seek to end |
| `Up` / `Down` | Volume up / down |
| `M` | Mute / unmute |
| `F` | **Feed** (+10 s, nom pose) |
| `Shift+F` | Fullscreen toggle |
| `Enter` | Activate the focused control (including fullscreen button) |
| `?` | Open / close the shortcuts tooltip (omit when `shortcuts` is false) |
| `Esc` | Close tooltip or dialog; exit fullscreen if no dialog is open |

Tab order follows the visual layout. Every control is reachable and operable from the keyboard. Focus uses `--poppet-focus`. Never `outline: none` without that replacement. I-beam / arrow keys on the slider should move the thumb in steps and move the pet with it.

## Accessibility checklist

- Essential controls present and working: play/pause, seek, time, volume/mute, fullscreen.
- Accessible names on every control (“Play”, “Pause”, “Seek”, “Mute”, “Unmute”, “Volume”, “Enter fullscreen”, “Feed {name}, skip 10 seconds”, “Keyboard shortcuts”).
- `media-status-announcer` (or equivalent live region) announces play, pause, mute, feed, and errors.
- Text and icons meet WCAG 2.2 AA contrast (4.5:1 text, 3:1 large UI) **on top of bright white footage and dark footage**, in **all four themes**. Rely on the scrim + shell, not on hope. Use `--poppet-ink` on buttons; use `--poppet-on-accent` on accent fills. Do not use white icons on Candy pink or lime (those fail contrast).
- Visible focus ring at 3:1 against the shell.
- Touch targets ≥ 44×44 px, including the pet, the none-thumb hit area, hearts, and mobile buttons.
- Captions/error/dialog if you include them: escapable, focus-trapped, labeled.
- Support reduced motion as specified below.
- Do not ship `user-scalable=no` or a maximum-scale of 1.

## Reduced motion

When motion is reduced (OS `prefers-reduced-motion` **or** `POPPET.motion === "reduced"`):

- No walk/sleep frame cycling; hold the first frame of the pose.
- No nom bounce or scale; show `nom` instantly for one static beat or skip to the next pose immediately after the seek.
- No Zzz bob, no shell shine animation, no sliding autohide (snap).
- The playhead still jumps to the correct seek position (the position change is not decorative).
- Buttons may keep a 0 ms state change; no squash.

Honor the OS setting as a floor even when `motion` is `"full"`. Token durations in `tokens.css` already collapse under the media query and `[data-motion="reduced"]`.

## Responsive

- **≥ 900 px:** full shell in one row, 5 hearts visible, time visible, shortcuts tooltip on the side or above the icon.
- **600–899 px:** tighten gaps; keep play, seek+thumb, time, mute, fullscreen. Hearts may shrink to 4–5 smaller hearts but stay ≥ 44 px tall as a group, or open from the mute button.
- **< 600 px / mobile:** video still 16:9 full width. Shell is a shorter candy bar, not a framed device. Play, seek+thumb, time, mute, fullscreen always on screen. Volume: mute button; hearts or a vertical slider expand on tap and dismiss on second tap or outside tap. No hover-only affordances. Shortcuts tooltip must work on tap. Respect `safe-area-inset-bottom`. Test at 320, 375, 390, and 430 px widths, and a desktop hover path.

## Mux config

`muxPlaybackId` lives in `js/poppet.config.js`. If it is set, render `<mux-video>` with `src="https://stream.mux.com/${id}.m3u8"` (or `source = { playbackId }`), `playsinline`, `crossorigin="anonymous"`, and the kit poster (or a Mux poster). If it is empty, render a plain `<video src="./assets/sintel-trailer.mp4" poster="./assets/poster.png" playsinline>`. Do not use the official demo playback ID `BV3YZtogl89mg9VcNBhhnHm02Y34zI1nlMuMQfAbl3dM` as the submitted bonus ID. That ID is only a documented Video.js/Mux demo for optional local streaming tests.

Keep a visible Sintel credit on the demo page whenever that footage (or a Mux upload of it) is what plays: “Sintel trailer © Blender Foundation, CC BY 3.0, durian.blender.org.”

## Demo page and license

- `index.html` is a complete, public-looking demo, not a dev scaffold: wordmark, short sentence of design thinking, the player, shortcuts legend (if enabled), license and credit line. Default the demo to Candy + Pip.
- License the work under **Apache License 2.0**. Keep the kit `LICENSE` at the project root. Do not add a conflicting license.
- No passwords, no private keys, no “all rights reserved” footer.

## Acceptance criteria

The skin is done when all of the following are true:

1. A Video.js v10.4.x player loads and plays video with play/pause, seek, time, volume/mute, and fullscreen, on desktop and mobile widths.
2. The playhead follows the pet contract: walks while playing, sleeps when paused, cheers at the end, looks sad while buffering, covers ears when muted, and can be dragged to scrub. `none` uses a plain classic thumb with the same hit area.
3. Switching `POPPET.theme` and `POPPET.pet` (and applying `data-theme` / `data-pet`) restyles the shell and the playhead without other code changes. All four themes remain contrast-safe. Custom `colors` overrides apply as CSS variables.
4. `F` feeds the pet (+10 s + nom, or +10 s only when `none`). `Shift+F` is fullscreen. A shortcuts tooltip documents the map, including Feed, unless `shortcuts` is false.
5. Keyboard use is complete; focus is always visible; contrast holds over white and black footage in every theme; targets are ≥ 44 px; reduced motion is honored (OS as a floor); pause is never delayed by animation.
6. Code uses Video.js v10 state and official UI elements as specified; CDN URLs are pinned; no React.
7. The name Poppet is used throughout. Tamagotchi / Bandai names and logos do not appear in the UI, source, README, or submission text.
8. `LICENSE` is Apache-2.0. Sintel is credited if used. The demo is a static page ready to deploy to Vercel, defaulting to Candy + Pip.

---

## Follow-up prompts (paste one at a time after the first working build)

### 1. Polish

Tighten micro-interactions only. Button press squash should be 80–100 ms and cancel instantly on release. The pet’s walk should be even and loop on the 180 ms interval, with no jitter on the thumb’s x-position other than the true seek position. Nom lasts 600 ms, can be retriggered, and never blocks pause, seek, or mute. Ended cheer holds until the user replays. Autohide is smooth, returns immediately on mouse, focus, or touch, and does not hide while the shortcuts tooltip is open. Recheck contrast, alignment, and idle/hover/active/disabled/ended/error states in all four themes. Do not add new features or decorations.

### 2. Accessibility audit

Audit and fix accessibility against WCAG 2.2 AA. Verify names, roles, and tab order; the focus ring; live-region announcements for play, pause, mute, feed, and errors; slider keyboard steps; contrast of every label and icon over a forced white frame and a forced black frame, in all four themes; 44 px targets; tooltip and dialog focus management; and `prefers-reduced-motion`. Remove any `outline: none` that lacks a replacement. Report what you changed.

### 3. Mobile pass

Pass a mobile QA at 320, 375, 390, and 430 px widths, plus a landscape phone width. Controls must not wrap badly or overflow. Volume must work with a thumb (mute + expandable hearts or slider, no hover requirement). Drag-to-seek must work on touch without scrolling the page, including the none thumb. Fullscreen must work with `playsinline` on iOS Safari assumptions. Respect safe-area insets. Shortcuts tooltip must open and close on tap. Then recheck a desktop hover path still works.

### 4. Deploy to Vercel

Prepare the project as a static site and deploy it to Vercel (`npx vercel`, or the Vercel Git integration). The public URL must load without a login and play video. If `muxPlaybackId` is set in `js/poppet.config.js`, the live player should use that Mux HLS source and still fall back to the local MP4 if the stream fails. Confirm Apache-2.0 and the Sintel credit are visible. Give me the live URL when it is done. Do not put secrets in the repo.

### 5. Customize popover (optional, not required for the first build)

Add a small gear button (use `#gear` in `assets/icons.svg`) at the end of the control shell that opens an in-player “Customize” popover. The popover lets a viewer switch **pet** (Pip, Miso, Wisp, None) and **theme** (Candy, Mint, Midnight, Mono) live. Changing a control updates `data-pet` / `data-theme` immediately and writes `{ theme, pet }` to `localStorage` under the key `poppet.prefs`. On boot, if that key exists it wins over `poppet.config.js`; otherwise the config is the default. Hosts should still be able to force a look by editing the config (document that clearing the key restores the config).

The popover must be keyboard accessible: the gear is in the tab order, has a name (“Customize player”), opens on Enter/Space, traps focus while open, supports arrow keys inside the two radio groups, and closes on Esc or a click/tap outside, returning focus to the gear. It must not hide essential controls or the autohide-safe tooltip rule. Keep the visual language of the current theme (tokens only, no new palette). Do not add a full color-picker; theme + pet is enough. Recheck contrast, 44 px targets, and reduced motion.
