/** Single config for Poppet.
 *  This is the only file a host needs to touch to change the pet,
 *  theme, colors, media, or options.
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
    src: "/assets/pets/pip.png",
    frames: 8,
    size: 24,
  },
  miso: {
    id: "miso",
    name: "Miso",
    src: "/assets/pets/miso.png",
    frames: 8,
    size: 24,
  },
  wisp: {
    id: "wisp",
    name: "Wisp",
    src: "/assets/pets/wisp.png",
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
  // Default product: Mint shell + Pip. Change these two to reskin.
  pet: "pip", // "pip" | "miso" | "wisp" | "none"
  theme: "mint", // "candy" | "mint" | "midnight" | "mono"

  // Optional CSS variable overrides. Keys may be camelCase (mapped below)
  // or a full "--poppet-*" name. Leave empty to use the theme as-is.
  colors: {},

  // When false, hide the shortcuts tooltip and the "?" control.
  // Essential keyboard (Space, arrows, M, F, Shift+F) still works.
  shortcuts: true,

  // Kit ships silent. Gate optional chirps with this flag. Default is off.
  sounds: false,

  // "system" follows the OS. "reduced" (or "off") always quiets motion
  // (intro becomes a 250ms fade, toy stays steady).
  // "full" uses the toy motion, but still honors prefers-reduced-motion as a floor.
  motion: "system", // "full" | "reduced" | "off" | "system"

  // Mux public playback ID (empty uses muxDemoPlaybackId below).
  muxPlaybackId: "",

  // Official Video.js / Mux demo asset for streaming playback.
  muxDemoPlaybackId: "BV3YZtogl89mg9VcNBhhnHm02Y34zI1nlMuMQfAbl3dM",

  fallbackMp4: "",
  poster: "",
};

export function activeMuxPlaybackId() {
  return POPPET.muxPlaybackId || POPPET.muxDemoPlaybackId;
}

export function muxHls(id) {
  return `https://stream.mux.com/${id}.m3u8`;
}

export function muxPoster(id) {
  return `https://image.mux.com/${id}/thumbnail.jpg`;
}

export function useMux() {
  return Boolean(activeMuxPlaybackId());
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
