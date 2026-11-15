/** Single config for Poppet.
 *  Copy to js/poppet.config.js and edit. This is the only file a host
 *  should need to touch to change the pet, theme, colors, media, or options.
 *
 *  Apply it on boot:
 *    el.setAttribute("data-theme", POPPET.theme);
 *    el.setAttribute("data-pet", POPPET.pet);
 *    el.setAttribute("data-motion", POPPET.motion);
 *    for (const [prop, value] of Object.entries(colorOverridesToStyle(POPPET.colors))) {
 *      el.style.setProperty(prop, value);
 *    }
 *  Put those attributes on <video-player> so the page and the skin inherit them.
 */

export const PETS = {
  pip: {
    id: "pip",
    name: "Pip",
    src: "./assets/pets/pip.svg",
    frames: 8,
    size: 24,
  },
  miso: {
    id: "miso",
    name: "Miso",
    src: "./assets/pets/miso.svg",
    frames: 8,
    size: 24,
  },
  wisp: {
    id: "wisp",
    name: "Wisp",
    src: "./assets/pets/wisp.svg",
    frames: 8,
    size: 24,
  },
  none: {
    id: "none",
    name: "None",
    src: null,
    frames: 0,
    size: 24,
  },
};

export const THEMES = ["candy", "mint", "midnight", "mono"];

export const POPPET = {
  // Default product: Candy shell + Pip. Change these two to reskin.
  pet: "pip", // "pip" | "miso" | "wisp" | "none"
  theme: "candy", // "candy" | "mint" | "midnight" | "mono"

  // Optional CSS variable overrides. Keys may be camelCase (mapped below)
  // or a full "--poppet-*" name. Leave empty to use the theme as-is.
  // Example:
  //   colors: { accent: "#ff7a00", ink: "#1a1020", shellTop: "#ffd0a8" }
  colors: {},

  // When false, hide the shortcuts tooltip and the "?" control.
  // Essential keyboard (Space, arrows, M, F, Shift+F) still works.
  shortcuts: true,

  // Kit ships silent. If you later add optional chirps (feed, mute),
  // gate them with this flag. Default is off.
  sounds: false,

  // "system" follows the OS. "reduced" always quiets motion.
  // "full" uses the toy motion, but still honors prefers-reduced-motion
  // as a floor (never fight the OS).
  motion: "system", // "full" | "reduced" | "system"

  // Mux public playback ID. Required for the +1 Mux bonus.
  // Leave empty to play the local MP4 fallback.
  muxPlaybackId: "",

  // Official Video.js / Mux demo asset — local/dev only.
  // Do not submit this ID as your bonus playback ID.
  muxDemoPlaybackId: "BV3YZtogl89mg9VcNBhhnHm02Y34zI1nlMuMQfAbl3dM",

  fallbackMp4: "./assets/sintel-trailer.mp4",
  poster: "./assets/poster.png",
};

export function muxHls(id) {
  return `https://stream.mux.com/${id}.m3u8`;
}

export function useMux() {
  return Boolean(POPPET.muxPlaybackId);
}

const COLOR_MAP = {
  accent: "--poppet-accent",
  accentDeep: "--poppet-accent-deep",
  ink: "--poppet-ink",
  inkSoft: "--poppet-ink-soft",
  surface: "--poppet-surface",
  page: "--poppet-page",
  shellTop: "--poppet-shell-top",
  shellTopHi: "--poppet-shell-top-hi",
  shellBottom: "--poppet-shell-bottom",
  shellBottomHi: "--poppet-shell-bottom-hi",
  button: "--poppet-button",
  buttonAlt: "--poppet-button-alt",
  onAccent: "--poppet-on-accent",
  heart: "--poppet-heart",
  radiusShell: "--poppet-radius-shell",
  shellAlpha: "--poppet-shell-alpha",
  gloss: "--poppet-gloss",
};

/** Map a colors object onto CSS custom properties. */
export function colorOverridesToStyle(colors = {}) {
  const style = {};
  for (const [key, value] of Object.entries(colors)) {
    const prop = key.startsWith("--") ? key : COLOR_MAP[key] || `--poppet-${key}`;
    style[prop] = String(value);
  }
  return style;
}

export function currentPet() {
  return PETS[POPPET.pet] || PETS.pip;
}

/* --- Copy-paste examples -----------------------------------------------

// Minimal (dark, no pet):
POPPET.theme = "midnight";
POPPET.pet = "none";

// Mint shell, Miso the cat:
POPPET.theme = "mint";
POPPET.pet = "miso";

// Candy, but a custom accent:
POPPET.theme = "candy";
POPPET.pet = "pip";
POPPET.colors = { accent: "#ff7a00", onAccent: "#1a1020", heart: "#c0143c" };

// Quiet, rounded, greyscale:
POPPET.theme = "mono";
POPPET.pet = "none";
POPPET.motion = "reduced";
POPPET.shortcuts = false;

------------------------------------------------------------------------ */
