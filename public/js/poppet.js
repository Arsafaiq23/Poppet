import {
  POPPET,
  PETS,
  THEMES,
  activeMuxPlaybackId,
  colorOverridesToStyle,
  muxHls,
  muxPoster,
} from "./poppet.config.js";
import { formatAriaTime } from "./pet.js";
import { createIntro, hasSeenIntro } from "./intro.js";
import { createSteady } from "./steady.js";
import { createPhysicsRig } from "./motion-rig.js";
import { createVideoLibrary } from "./library.js";

const VOL_STEPS = 5;
const STORAGE_KEY = "poppet:appearance";
const OK_HINT_STORAGE_KEY = "poppet:ok-hint-dismissed";
const LCD_IDLE_CLOSE_MS = 2000;
const LONG_PRESS_MS = 500;
const SPEED_STEPS = [0.5, 1, 1.5, 2];

const ACCENT_PRESETS = {
  default: null,
  berry: {
    "--poppet-accent": "#d42674",
    "--poppet-accent-deep": "#9e1553",
    "--poppet-on-accent": "#ffffff",
    "--poppet-track-fill": "#d42674",
    "--poppet-wordmark-fill": "#e03c84",
  },
  sun: {
    "--poppet-accent": "#f5b400",
    "--poppet-accent-deep": "#b88400",
    "--poppet-on-accent": "#2c1e00",
    "--poppet-track-fill": "#f5b400",
    "--poppet-wordmark-fill": "#f5b400",
  },
  sky: {
    "--poppet-accent": "#23b0d4",
    "--poppet-accent-deep": "#0e7d9b",
    "--poppet-on-accent": "#05222b",
    "--poppet-track-fill": "#23b0d4",
    "--poppet-wordmark-fill": "#23b0d4",
  },
};

const ACCENT_OVERRIDE_PROPS = [
  "--poppet-accent",
  "--poppet-accent-deep",
  "--poppet-on-accent",
  "--poppet-track-fill",
  "--poppet-wordmark-fill",
];

let sharedAudioCtx = null;

function play8BitBlip(step = 3) {
  if (!POPPET.sounds) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === "suspended") {
      sharedAudioCtx.resume().catch(() => {});
    }
    const now = sharedAudioCtx.currentTime;
    const osc = sharedAudioCtx.createOscillator();
    const gain = sharedAudioCtx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(240 + Math.max(0, step) * 85, now);
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(sharedAudioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.042);
  } catch {
    // Ignore audio context restrictions
  }
}

function playImpactClack() {
  if (!POPPET.sounds) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state !== "running") return;
    const now = sharedAudioCtx.currentTime;
    const osc = sharedAudioCtx.createOscillator();
    const gain = sharedAudioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.04);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(gain);
    gain.connect(sharedAudioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  } catch {
    // Ignore audio context restrictions
  }
}

const BG_PRESETS = ["default", "urban", "landscape"];

function loadSavedAppearance() {
  const defaults = {
    pet: PETS[POPPET.pet] ? POPPET.pet : "pip",
    theme: THEMES.includes(POPPET.theme) ? POPPET.theme : "candy",
    accent: "default",
    bg: "default",
  };
  let result = { ...defaults };
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const parsedAccent =
        parsed?.accent && Object.prototype.hasOwnProperty.call(ACCENT_PRESETS, parsed.accent)
          ? parsed.accent
          : defaults.accent;
      result = {
        pet: parsed?.pet && PETS[parsed.pet] ? parsed.pet : defaults.pet,
        theme:
          parsed?.theme && THEMES.includes(parsed.theme)
            ? parsed.theme
            : defaults.theme,
        accent: parsedAccent,
        bg: parsed?.bg && BG_PRESETS.includes(parsed.bg) ? parsed.bg : defaults.bg,
      };
    }
  } catch {
    // Ignore storage read errors
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const qTheme = params.get("theme");
    const qPet = params.get("pet");
    if (qTheme && THEMES.includes(qTheme)) {
      result.theme = qTheme;
    }
    if (qPet && PETS[qPet]) {
      result.pet = qPet;
    }
  } catch {
    // Ignore URLSearchParams errors
  }

  return result;
}

function saveAppearance(appearance) {
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    // Ignore storage quota/privacy-mode errors
  }
}

function applyAccentOverride(targets, accentKey) {
  const baseOverrides = colorOverridesToStyle(POPPET.colors);
  const preset = ACCENT_PRESETS[accentKey] || null;

  for (const el of targets) {
    for (const prop of ACCENT_OVERRIDE_PROPS) {
      el.style.removeProperty(prop);
    }
    for (const [prop, value] of Object.entries(baseOverrides)) {
      el.style.setProperty(prop, value);
    }
    if (preset) {
      for (const [prop, value] of Object.entries(preset)) {
        el.style.setProperty(prop, value);
      }
    }
  }
}

function applyPoppetConfig(player) {
  const targets = [document.documentElement, player].filter(Boolean);
  const initial = loadSavedAppearance();
  let motion = POPPET.motion;
  try {
    const qMotion = new URLSearchParams(window.location.search).get("motion");
    if (qMotion === "reduced" || qMotion === "off" || qMotion === "full" || qMotion === "system") {
      motion = qMotion;
    }
  } catch {
    // Ignore
  }

  for (const el of targets) {
    el.setAttribute("data-theme", initial.theme);
    el.setAttribute("data-pet", initial.pet);
    el.setAttribute("data-motion", motion);
  }
  const pageEl = document.querySelector(".poppet-page");
  if (pageEl) {
    pageEl.setAttribute("data-bg", initial.bg || "default");
  }
  applyAccentOverride(targets, initial.accent);
  return initial;
}

function configureMediaSource(player) {
  const container = player.querySelector("media-container");
  if (!container) return;

  const existingMedia = container.querySelector("mux-video, video");
  const playbackId = activeMuxPlaybackId();

  if (playbackId) {
    let muxEl =
      existingMedia?.tagName.toLowerCase() === "mux-video"
        ? existingMedia
        : null;
    if (!muxEl) {
      muxEl = document.createElement("mux-video");
      if (existingMedia) {
        existingMedia.replaceWith(muxEl);
      } else {
        container.prepend(muxEl);
      }
    }
    const targetSrc = muxHls(playbackId);
    const targetPoster = POPPET.poster || muxPoster(playbackId);
    if (muxEl.getAttribute("src") !== targetSrc) {
      muxEl.setAttribute("src", targetSrc);
    }
    if (muxEl.getAttribute("poster") !== targetPoster) {
      muxEl.setAttribute("poster", targetPoster);
    }
    if (!muxEl.hasAttribute("playsinline")) muxEl.setAttribute("playsinline", "");
    if (!muxEl.hasAttribute("crossorigin")) muxEl.setAttribute("crossorigin", "anonymous");
    if (!muxEl.hasAttribute("preload")) muxEl.setAttribute("preload", "metadata");
  } else if (POPPET.fallbackMp4) {
    let videoEl =
      existingMedia?.tagName.toLowerCase() === "video" ? existingMedia : null;
    if (!videoEl) {
      videoEl = document.createElement("video");
      if (existingMedia) {
        existingMedia.replaceWith(videoEl);
      } else {
        container.prepend(videoEl);
      }
    }
    videoEl.setAttribute("src", POPPET.fallbackMp4);
    if (POPPET.poster) {
      videoEl.setAttribute("poster", POPPET.poster);
    }
    videoEl.setAttribute("playsinline", "");
    videoEl.setAttribute("preload", "metadata");
  }
}

function isEditableElement(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, [contenteditable]")) return true;
  return false;
}

function setupPoppetInteractions(player, initialAppearance) {
  const container = player.querySelector("media-container");
  const petEl = player.querySelector("poppet-pet");
  const liveRegion = player.querySelector("[data-poppet-live]");
  const replayBtn = player.querySelector("[data-poppet-replay]");

  const dollyAnchor = player.querySelector("[data-poppet-dolly-anchor]");
  const deviceEl = player.querySelector("[data-poppet-device]");
  const tiltStageEl = player.querySelector("[data-poppet-tilt-stage]");
  const eggCanvas = player.querySelector("[data-poppet-egg-canvas]");
  const bezelEl = player.querySelector("[data-poppet-screen-bezel]");

  const btnA = player.querySelector("[data-poppet-btn-a]");
  const btnB = player.querySelector("[data-poppet-btn-b]");
  const btnC = player.querySelector("[data-poppet-btn-c]");
  const gearBtn = document.querySelector("[data-poppet-gear-btn]");
  const zoomOutBtn = player.querySelector("[data-poppet-zoom-out]");
  const videoFsBtn = player.querySelector("[data-poppet-video-fs-btn]");
  const chainEl = player.querySelector(".poppet-ball-chain");

  const lcdFeedBtn = player.querySelector("[data-lcd-action='feed']");
  const lcdLightBtn = player.querySelector("[data-lcd-action='light']");
  const lcdPlayBtn = player.querySelector("[data-lcd-action='play']");
  const lcdHealBtn = player.querySelector("[data-lcd-action='heal']");
  const lcdSoundBtn = player.querySelector("[data-lcd-action='sound']");
  const lcdSpeedBtn = player.querySelector("[data-lcd-action='speed']");
  const lcdSpeedBadge = player.querySelector("[data-lcd-speed-badge]");
  const lcdLeanBtn = player.querySelector("[data-lcd-action='lean']");
  const lcdInfoBtn = player.querySelector("[data-lcd-action='info']");

  const customizePopover = player.querySelector("[data-poppet-customize-popover]");

  // In-screen nostalgic 1-bit LCD overlays
  const lcdVolPanel = player.querySelector("[data-lcd-panel='volume']");
  const lcdVolSlider = player.querySelector("[data-lcd-volume-slider]");
  const lcdVolLabel = player.querySelector("[data-lcd-vol-label]");
  const lcdVolBars = Array.from(player.querySelectorAll("[data-vol-step]"));

  const lcdSpeedPanel = player.querySelector("[data-lcd-panel='speed']");
  const lcdSpeedGroup = player.querySelector("[data-lcd-speed-group]");
  const lcdRateBtns = Array.from(player.querySelectorAll("[data-speed-rate]"));

  const lcdHelpPanel = player.querySelector("[data-lcd-panel='help']");
  const lcdHelpCloseBtn = player.querySelector("[data-lcd-help-close]");
  const replayIntroBtn = player.querySelector("[data-poppet-replay-intro]");

  const okHintEl = player.querySelector("[data-poppet-ok-hint]");
  const okHintCloseBtn = player.querySelector("[data-poppet-ok-hint-close]");

  const leftRipple = player.querySelector("[data-poppet-ripple='left']");
  const rightRipple = player.querySelector("[data-poppet-ripple='right']");
  let mediaEl = player.querySelector("mux-video, video, audio");
  let mediaEventsController = null;
  const fsControlsEl = player.querySelector("[data-poppet-fs-controls]");
  const fsPetEl = player.querySelector("[data-poppet-fs-pet]");
  const fsPlayBtn = player.querySelector("[data-poppet-fs-play]");
  const fsMuteBtn = player.querySelector("[data-poppet-fs-mute]");
  const fsVolInput = player.querySelector("[data-poppet-fs-vol]");
  const fsSeekInput = player.querySelector("[data-poppet-fs-seek]");
  const fsTimeEl = player.querySelector("[data-poppet-fs-time]");
  const fsCcBtn = player.querySelector("[data-poppet-fs-cc]");
  const fsQualityBtn = player.querySelector("[data-poppet-fs-quality]");
  const fsQualityMenu = player.querySelector("[data-poppet-fs-quality-menu]");
  const fsSpeedBtn = player.querySelector("[data-poppet-fs-speed]");
  const fsPipBtn = player.querySelector("[data-poppet-fs-pip]");
  const fsExitBtn = player.querySelector("[data-poppet-fs-exit]");
  const lcdQualityGroup = player.querySelector("[data-lcd-quality-group]");
  let fsSeeking = false;
  let fsActivityTimer = null;
  let selectedQualityLevel = -1;

  // Hero Pet Stage Seek Slider
  const petStripEl = player.querySelector("[data-poppet-pet-strip]");
  const petSliderEl = player.querySelector("[data-poppet-pet-slider]");
  const seekTooltip = player.querySelector("[data-poppet-seek-tooltip]");

  const LCD_MENU_ITEMS = [
    { index: 0, action: "feed", name: "Feed", el: lcdFeedBtn },
    { index: 1, action: "light", name: "Theme", el: lcdLightBtn },
    { index: 2, action: "play", name: "Play", el: lcdPlayBtn },
    { index: 3, action: "heal", name: "Heal", el: lcdHealBtn },
    { index: 4, action: "sound", name: "Volume", el: lcdSoundBtn },
    { index: 5, action: "speed", name: "Speed", el: lcdSpeedBtn },
    { index: 6, action: "lean", name: "Lean in", el: lcdLeanBtn },
    { index: 7, action: "info", name: "Help", el: lcdInfoBtn },
  ];

  let cursorIndex = 2; // Default sits on Play icon
  let lcdPanelIdleTimer = null;
  let leanVerifyTimer = null;
  let resizeDebounceTimer = null;
  let mouseClickTimer = null;
  let leanFadeTimer = null;
  let lcdBezelFlashTimer = null;
  let btnALongPressTimer = null;
  let btnALongPressFired = false;
  let keyQLongPressTimer = null;
  let keyQLongPressFired = false;
  let lastTouchPointerUpAt = 0;
  let lastTouchTap = { time: 0, zone: "" };
  let rippleTimers = { left: null, right: null };
  let lcdFlashTimers = new WeakMap();
  let btnPressTimers = new WeakMap();

  let isSliderDragging = false;
  let isSliderHovered = false;
  let isVolDragging = false;
  let activeLcdPanel = null; // "volume" | "speed" | "help" | null
  let activeLcdTrigger = null;
  let speedPanelCursorIdx = 0;
  let customizeTrigger = gearBtn;
  let eggController = null;
  let lastPausedState = null;
  let hasMediaError = false;
  let viewMode = "toy";
  let currentRate = 1;
  let appearance = { ...initialAppearance };

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  function isReducedMotion() {
    const attr = player.getAttribute("data-motion");
    return (
      POPPET.motion === "reduced" ||
      POPPET.motion === "off" ||
      attr === "reduced" ||
      attr === "off" ||
      reducedMotionQuery.matches
    );
  }

  function announceStatus(message) {
    if (!liveRegion || !message) return;
    liveRegion.textContent = "";
    requestAnimationFrame(() => {
      if (liveRegion) liveRegion.textContent = message;
    });
  }

  function getMediaDuration() {
    const storeDur = player.store?.state?.duration;
    if (typeof storeDur === "number" && Number.isFinite(storeDur) && storeDur > 0) {
      return storeDur;
    }
    const elDur = mediaEl?.duration;
    if (typeof elDur === "number" && Number.isFinite(elDur) && elDur > 0) {
      return elDur;
    }
    return 0;
  }

  function getMediaCurrentTime() {
    const storeCur = player.store?.state?.currentTime;
    if (typeof storeCur === "number" && Number.isFinite(storeCur)) {
      return storeCur;
    }
    const elCur = mediaEl?.currentTime;
    if (typeof elCur === "number" && Number.isFinite(elCur)) {
      return elCur;
    }
    return 0;
  }

  function seekToSeconds(targetSeconds) {
    const dur = getMediaDuration();
    const clamped =
      dur > 0
        ? Math.min(dur, Math.max(0, targetSeconds))
        : Math.max(0, targetSeconds);
    petEl?.setOptimisticTime?.(clamped);
    const s = player.store?.state;
    if (typeof s?.seek === "function") {
      s.seek(clamped);
    } else if (mediaEl) {
      mediaEl.currentTime = clamped;
    }
  }

  let seekTooltipAutoHideTimer = null;

  function clearSeekTooltipAutoHide() {
    if (seekTooltipAutoHideTimer) {
      clearTimeout(seekTooltipAutoHideTimer);
      seekTooltipAutoHideTimer = null;
    }
  }

  function showSeekTooltipAt(ratio, { autoHideMs = 0 } = {}) {
    if (!seekTooltip || !petSliderEl) return;
    clearSeekTooltipAutoHide();
    const clamped = Math.min(1, Math.max(0, ratio));
    const duration = getMediaDuration();
    seekTooltip.textContent = formatAriaTime(duration * clamped);
    seekTooltip.style.setProperty("--seek-tooltip-x", `${(clamped * 100).toFixed(2)}%`);
    seekTooltip.hidden = false;
    seekTooltip.setAttribute("data-active", "");
    petStripEl?.setAttribute("data-tooltip-active", "");
    if (autoHideMs > 0) {
      seekTooltipAutoHideTimer = setTimeout(() => {
        seekTooltipAutoHideTimer = null;
        if (!isSliderHovered && !isSliderDragging) {
          hideSeekTooltip();
        }
      }, autoHideMs);
    }
  }

  function hideSeekTooltip() {
    clearSeekTooltipAutoHide();
    if (!seekTooltip) return;
    seekTooltip.removeAttribute("data-active");
    seekTooltip.hidden = true;
    petStripEl?.removeAttribute("data-tooltip-active");
  }

  function pointerRatioOnPetSlider(event) {
    if (!petSliderEl) return 0;
    const rect = petSliderEl.getBoundingClientRect();
    if (!rect.width) return 0;
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  }

  function flashLcdActive(btn, durationMs = 220) {
    if (!btn) return;
    const existing = lcdFlashTimers.get(btn);
    if (existing) clearTimeout(existing);
    btn.setAttribute("data-active", "true");
    const timer = setTimeout(() => {
      if (btn.getAttribute("data-lcd-action") !== "heal" || !hasMediaError) {
        btn.removeAttribute("data-active");
      }
      lcdFlashTimers.delete(btn);
    }, durationMs);
    lcdFlashTimers.set(btn, timer);
  }

  function flashLcdBezel() {
    if (!bezelEl || isReducedMotion()) return;
    if (lcdBezelFlashTimer) clearTimeout(lcdBezelFlashTimer);
    bezelEl.setAttribute("data-lcd-flash", "");
    lcdBezelFlashTimer = setTimeout(() => {
      bezelEl.removeAttribute("data-lcd-flash");
      lcdBezelFlashTimer = null;
    }, 110);
  }

  function flashButtonPressed(btn) {
    if (!btn) return;
    const prev = btnPressTimers.get(btn);
    if (prev) clearTimeout(prev);
    btn.setAttribute("data-pressed", "");
    const timer = setTimeout(() => {
      btn.removeAttribute("data-pressed");
      btnPressTimers.delete(btn);
    }, 150);
    btnPressTimers.set(btn, timer);
  }

  /* ------------------------------------------------------------------ */
  /* First-visit OK hint ("press OK to play", 2x pulse on B button)     */
  /* ------------------------------------------------------------------ */

  function isOkHintDismissed() {
    try {
      return window.localStorage?.getItem(OK_HINT_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function dismissOkHint() {
    if (okHintEl) {
      okHintEl.hidden = true;
    }
    btnB?.removeAttribute("data-b-pulse");
    try {
      window.localStorage?.setItem(OK_HINT_STORAGE_KEY, "1");
    } catch {
      // Ignore storage errors
    }
  }

  let freezeIntroParam = false;
  try {
    freezeIntroParam = new URLSearchParams(window.location.search).has("poppet-intro-freeze");
  } catch {
    // Ignore
  }
  const willPlayIntro = !hasSeenIntro() || freezeIntroParam;

  function revealOkHint({ pulse = false } = {}) {
    const dismissed = isOkHintDismissed();
    if (okHintEl) {
      okHintEl.hidden = dismissed;
    }
    if (dismissed) {
      btnB?.removeAttribute("data-b-pulse");
    } else if (pulse) {
      btnB?.setAttribute("data-b-pulse", "once");
    }
  }

  if (okHintEl) {
    if (willPlayIntro) {
      okHintEl.hidden = true;
      btnB?.removeAttribute("data-b-pulse");
    } else {
      revealOkHint({ pulse: false });
    }
  }
  okHintCloseBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    dismissOkHint();
  });

  let physicsRig = null;

  const steady = createSteady({
    player,
    isMotionOff: isReducedMotion,
    getViewMode: () => viewMode,
    isFullscreen: () =>
      Boolean(
        document.fullscreenElement ||
          player.store?.state?.isFullscreen ||
          container?.hasAttribute("data-video-fullscreen")
      ),
    isPlaying: () => {
      const s = player.store?.state;
      const paused = Boolean(s?.paused ?? mediaEl?.paused ?? true);
      const ended = Boolean(s?.ended ?? mediaEl?.ended ?? false);
      return !paused && !ended;
    },
    isIntroRunning: () => intro?.isRunning?.() ?? false,
    getEggController: () => eggController,
    onBeforeLock: () => physicsRig?.stopAndHandOff?.(),
    announce: announceStatus,
  });

  physicsRig = createPhysicsRig({
    deviceEl,
    chainEl,
    tiltStageEl,
    isLocked: () => steady.isSteady(),
    isBlocked: () =>
      intro.isRunning() ||
      viewMode !== "toy" ||
      isReducedMotion() ||
      Boolean(document.fullscreenElement || player.store?.state?.isFullscreen),
    getEggController: () => eggController,
  });

  const videoLibrary = createVideoLibrary({
    player,
    onSelectVideo: (_item, nextMediaEl) => {
      mediaEl = nextMediaEl || player.querySelector("mux-video, video, audio");
      bindMediaEvents();
      petEl?.rebindMedia?.();
      syncHealUi(false);
      syncSpeedUi(mediaEl?.playbackRate || 1);
      syncControlTriggers();
    },
    announce: announceStatus,
  });

  const intro = createIntro({
    player,
    isMotionOff: isReducedMotion,
    sounds: {
      clack: playImpactClack,
      blip: () => play8BitBlip(5),
    },
    revealOkHint,
    onStart: () => {
      physicsRig.stopAndHandOff();
      steady.suspend();
      if (okHintEl) okHintEl.hidden = true;
      btnB?.removeAttribute("data-b-pulse");
    },
    onSettled: () => {
      steady.onIntroSettled();
    },
  });

  reducedMotionQuery.addEventListener("change", () => {
    steady.refresh();
  });

  /* ------------------------------------------------------------------ */
  /* Unscaled Fixed Customize Popover (Header Customize button)         */
  /* ------------------------------------------------------------------ */

  function positionPopoverNear(popover, triggerEl) {
    if (!popover || popover.hidden) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 12;
    const pRect = popover.getBoundingClientRect();
    const pw = pRect.width || 240;
    const ph = pRect.height || 180;

    let left = (vw - pw) / 2;
    let top = Math.max(pad, (vh - ph) / 2);

    if (triggerEl && triggerEl.isConnected) {
      const tRect = triggerEl.getBoundingClientRect();
      if (tRect.width > 0 && tRect.height > 0) {
        left = tRect.left + tRect.width / 2 - pw / 2;
        const belowTop = tRect.bottom + 8;
        const aboveTop = tRect.top - ph - 8;
        if (belowTop + ph <= vh - pad) {
          top = belowTop;
        } else if (aboveTop >= pad) {
          top = aboveTop;
        } else {
          top = belowTop;
        }
      }
    }

    const maxLeft = Math.max(pad, vw - pw - pad);
    const maxTop = Math.max(pad, vh - ph - pad);
    left = Math.min(Math.max(pad, left), maxLeft);
    top = Math.min(Math.max(pad, top), maxTop);

    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  }

  function openCustomize(trigger = gearBtn) {
    if (!customizePopover) return;
    customizeTrigger = trigger || gearBtn;
    closeLcdPanels({ returnFocus: false });
    customizePopover.hidden = false;
    gearBtn?.setAttribute("aria-expanded", "true");
    positionPopoverNear(customizePopover, customizeTrigger);
  }

  function closeCustomize({ returnFocus = false } = {}) {
    if (!customizePopover || customizePopover.hidden) return;
    customizePopover.hidden = true;
    gearBtn?.setAttribute("aria-expanded", "false");
    if (returnFocus) {
      customizeTrigger?.focus({ preventScroll: true });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Nostalgic 1-Bit LCD Overlays Manager (Volume, Speed, Help)         */
  /* ------------------------------------------------------------------ */

  function clearLcdPanelIdleTimer() {
    if (lcdPanelIdleTimer) {
      clearTimeout(lcdPanelIdleTimer);
      lcdPanelIdleTimer = null;
    }
  }

  function scheduleLcdPanelIdleClose() {
    clearLcdPanelIdleTimer();
    if (activeLcdPanel !== "volume" && activeLcdPanel !== "speed") return;
    lcdPanelIdleTimer = setTimeout(() => {
      lcdPanelIdleTimer = null;
      closeLcdPanels({ returnFocus: false });
    }, LCD_IDLE_CLOSE_MS);
  }

  function syncLcdPanelAriaExpanded() {
    const isVol = activeLcdPanel === "volume";
    const isSpd = activeLcdPanel === "speed";
    const isHelp = activeLcdPanel === "help";

    lcdSoundBtn?.setAttribute("aria-expanded", String(isVol));
    lcdSpeedBtn?.setAttribute("aria-expanded", String(isSpd));
    lcdInfoBtn?.setAttribute("aria-expanded", String(isHelp));
  }

  const lcdPanelHomes = new Map();
  for (const panelEl of [lcdVolPanel, lcdSpeedPanel, lcdHelpPanel]) {
    if (panelEl) {
      lcdPanelHomes.set(panelEl, {
        parent: panelEl.parentElement,
        nextSibling: panelEl.nextSibling,
      });
    }
  }

  function syncLcdPanelPlacement(panelEl, isOpen) {
    if (!panelEl) return;
    const home = lcdPanelHomes.get(panelEl);
    if (isOpen && window.innerWidth <= 600) {
      if (panelEl.parentElement !== document.body) {
        document.body.appendChild(panelEl);
      }
      panelEl.setAttribute("data-mobile-sheet", "true");
    } else {
      panelEl.removeAttribute("data-mobile-sheet");
      if (home?.parent && panelEl.parentElement !== home.parent) {
        home.parent.insertBefore(panelEl, home.nextSibling);
      }
    }
  }

  function getSpeedPanelButtons() {
    if (!lcdSpeedPanel) return [];
    return Array.from(lcdSpeedPanel.querySelectorAll(".poppet-lcd-rate-btn"));
  }

  function syncSpeedPanelCursor(idx) {
    const btns = getSpeedPanelButtons();
    if (!btns.length) {
      speedPanelCursorIdx = 0;
      return;
    }
    speedPanelCursorIdx = ((idx % btns.length) + btns.length) % btns.length;
    btns.forEach((btn, i) => {
      if (i === speedPanelCursorIdx) {
        btn.setAttribute("data-panel-cursor", "true");
      } else {
        btn.removeAttribute("data-panel-cursor");
      }
    });
  }

  function closeLcdPanels({ returnFocus = false } = {}) {
    clearLcdPanelIdleTimer();
    if (!activeLcdPanel) return;
    const prevTrigger = activeLcdTrigger;
    activeLcdPanel = null;
    activeLcdTrigger = null;

    for (const btn of getSpeedPanelButtons()) {
      btn.removeAttribute("data-panel-cursor");
    }

    for (const panelEl of [lcdVolPanel, lcdSpeedPanel, lcdHelpPanel]) {
      if (panelEl) panelEl.hidden = true;
      syncLcdPanelPlacement(panelEl, false);
    }

    syncLcdPanelAriaExpanded();

    if (returnFocus && prevTrigger) {
      prevTrigger.focus({ preventScroll: true });
    }
  }

  function openLcdPanel(kind, triggerEl, { focusInside = false } = {}) {
    if (kind === "help" && !POPPET.shortcuts) return;
    closeCustomize({ returnFocus: false });
    clearLcdPanelIdleTimer();

    syncLcdPanelPlacement(lcdVolPanel, kind === "volume");
    syncLcdPanelPlacement(lcdSpeedPanel, kind === "speed");
    syncLcdPanelPlacement(lcdHelpPanel, kind === "help");

    if (lcdVolPanel) lcdVolPanel.hidden = kind !== "volume";
    if (lcdSpeedPanel) lcdSpeedPanel.hidden = kind !== "speed";
    if (lcdHelpPanel) lcdHelpPanel.hidden = kind !== "help";

    activeLcdPanel = kind;
    activeLcdTrigger = triggerEl || null;
    syncLcdPanelAriaExpanded();

    if (kind === "volume") {
      renderLcdVolume();
      scheduleLcdPanelIdleClose();
      if (focusInside) {
        lcdVolSlider?.focus({ preventScroll: true });
      }
    } else if (kind === "speed") {
      syncSpeedUi(currentRate);
      const btns = getSpeedPanelButtons();
      const checkedIdx = btns.findIndex((b) => b.getAttribute("aria-checked") === "true");
      syncSpeedPanelCursor(checkedIdx >= 0 ? checkedIdx : 0);
      scheduleLcdPanelIdleClose();
      if (focusInside) {
        const checkedBtn =
          lcdSpeedGroup?.querySelector("[role='radio'][aria-checked='true']") || lcdRateBtns[1];
        checkedBtn?.focus({ preventScroll: true });
      }
    } else if (kind === "help") {
      if (focusInside) {
        lcdHelpCloseBtn?.focus({ preventScroll: true });
      }
    }
  }

  function getVolumeSnapshot() {
    const s = player.store?.state;
    const vol =
      typeof s?.volume === "number"
        ? s.volume
        : typeof mediaEl?.volume === "number"
        ? mediaEl.volume
        : 1;
    const muted = Boolean(s?.muted ?? mediaEl?.muted ?? vol === 0) || vol === 0;
    const effective = muted ? 0 : vol;
    const filledSteps =
      effective <= 0 ? 0 : Math.min(VOL_STEPS, Math.max(1, Math.round(effective * VOL_STEPS)));
    return { vol, muted, filledSteps };
  }

  function commitVolumeValue(nextValue, { beep = true } = {}) {
    const clamped = Math.min(1, Math.max(0, Math.round(nextValue * VOL_STEPS) / VOL_STEPS));
    const store = player.store;
    if (store?.state) {
      if (clamped === 0) {
        store.state.setVolume?.(0);
        store.state.setMuted?.(true);
      } else {
        if (store.state.muted) store.state.setMuted?.(false);
        store.state.setVolume?.(clamped);
      }
    } else if (mediaEl) {
      mediaEl.volume = clamped;
      mediaEl.muted = clamped === 0;
    }
    const step = Math.round(clamped * VOL_STEPS);
    if (beep) play8BitBlip(step);
    renderLcdVolume();
    scheduleLcdPanelIdleClose();
  }

  function renderLcdVolume() {
    const { muted, filledSteps } = getVolumeSnapshot();
    const percent = Math.round((filledSteps / VOL_STEPS) * 100);

    if (lcdVolSlider) {
      lcdVolSlider.toggleAttribute("data-muted", muted);
      lcdVolSlider.setAttribute("aria-valuenow", String(percent));
      lcdVolSlider.setAttribute(
        "aria-valuetext",
        muted ? "Muted, Volume 0 of 5" : `Volume ${filledSteps} of ${VOL_STEPS}`
      );
    }
    if (lcdVolLabel) {
      lcdVolLabel.textContent = muted ? "MUTE" : "VOL";
    }
    for (const bar of lcdVolBars) {
      const step = Number(bar.getAttribute("data-vol-step") || 0);
      bar.toggleAttribute("data-filled", !muted && step <= filledSteps);
    }
  }

  function stepFromVolPointer(event) {
    if (event.target instanceof Element) {
      const bar = event.target.closest("[data-vol-step]");
      if (bar) {
        const s = Number(bar.getAttribute("data-vol-step"));
        if (s >= 1 && s <= VOL_STEPS) return s;
      }
    }
    const barsWrap = lcdVolPanel?.querySelector(".poppet-lcd-vol-bars");
    if (!barsWrap) return VOL_STEPS;
    const r = barsWrap.getBoundingClientRect();
    if (!r.width) return VOL_STEPS;
    const ratio = Math.min(1, Math.max(0, (event.clientX - r.left) / r.width));
    return ratio <= 0.04 ? 0 : Math.min(VOL_STEPS, Math.max(1, Math.ceil(ratio * VOL_STEPS)));
  }

  lcdVolSlider?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.stopPropagation();
    isVolDragging = true;
    lcdVolSlider.setPointerCapture?.(event.pointerId);
    lcdVolSlider.focus({ preventScroll: true });
    const step = stepFromVolPointer(event);
    commitVolumeValue(step / VOL_STEPS, { beep: true });
  });

  lcdVolSlider?.addEventListener("pointermove", (event) => {
    if (!isVolDragging) {
      scheduleLcdPanelIdleClose();
      return;
    }
    const step = stepFromVolPointer(event);
    commitVolumeValue(step / VOL_STEPS, { beep: false });
  });

  const endVolDrag = () => {
    isVolDragging = false;
  };
  lcdVolSlider?.addEventListener("pointerup", endVolDrag);
  lcdVolSlider?.addEventListener("pointercancel", endVolDrag);

  lcdVolSlider?.addEventListener("keydown", (event) => {
    const { filledSteps } = getVolumeSnapshot();
    let nextStep = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      nextStep = Math.min(VOL_STEPS, filledSteps + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      nextStep = Math.max(0, filledSteps - 1);
    } else if (event.key === "Home") {
      nextStep = 0;
    } else if (event.key === "End") {
      nextStep = VOL_STEPS;
    } else if (event.key.toLowerCase() === "m") {
      event.preventDefault();
      event.stopPropagation();
      toggleMuteState();
      return;
    }

    if (nextStep !== null) {
      event.preventDefault();
      event.stopPropagation();
      commitVolumeValue(nextStep / VOL_STEPS, { beep: true });
    }
  });

  lcdVolPanel?.addEventListener("pointerenter", scheduleLcdPanelIdleClose);
  lcdVolPanel?.addEventListener("focusin", scheduleLcdPanelIdleClose);
  lcdSpeedPanel?.addEventListener("pointerenter", scheduleLcdPanelIdleClose);
  lcdSpeedPanel?.addEventListener("focusin", scheduleLcdPanelIdleClose);

  function toggleMuteState() {
    const store = player.store;
    if (store?.state) {
      const nextMuted = !(store.state.muted || store.state.volume === 0);
      store.state.setMuted?.(nextMuted);
      if (!nextMuted && store.state.volume === 0) {
        store.state.setVolume?.(0.6);
      }
    } else if (mediaEl) {
      mediaEl.muted = !mediaEl.muted;
      if (!mediaEl.muted && mediaEl.volume === 0) mediaEl.volume = 0.6;
    }
    const { filledSteps } = getVolumeSnapshot();
    play8BitBlip(filledSteps);
    renderLcdVolume();
    scheduleLcdPanelIdleClose();
  }

  /* ------------------------------------------------------------------ */
  /* PART 1: 8-Icon LCD Cursor & Classic A / B / C Navigation           */
  /* ------------------------------------------------------------------ */

  function syncButtonBLabelAndGlyph() {
    if (!btnB) return;
    const item = LCD_MENU_ITEMS[cursorIndex] || LCD_MENU_ITEMS[2];
    const s = player.store?.state;
    const paused = Boolean(s?.paused ?? mediaEl?.paused ?? true);
    const ended = Boolean(s?.ended ?? mediaEl?.ended ?? false);
    const onPlay = cursorIndex === 2;

    btnB.setAttribute("data-cursor-on-play", String(onPlay));
    btnB.toggleAttribute("data-paused", paused);
    btnB.toggleAttribute("data-ended", ended);

    let actionLabel = item.name;
    if (onPlay) {
      actionLabel = ended ? "Replay" : paused ? "Play" : "Pause";
    }
    btnB.setAttribute("aria-label", `Select (${actionLabel})`);
  }

  function setCursorIndex(nextIdx, { announce = false, petLook = false } = {}) {
    const total = LCD_MENU_ITEMS.length;
    cursorIndex = ((nextIdx % total) + total) % total;

    for (const item of LCD_MENU_ITEMS) {
      if (!item.el) continue;
      if (item.index === cursorIndex) {
        item.el.setAttribute("data-cursor-selected", "true");
      } else {
        item.el.removeAttribute("data-cursor-selected");
      }
    }

    syncButtonBLabelAndGlyph();

    const selectedItem = LCD_MENU_ITEMS[cursorIndex];
    if (petLook) {
      petEl?.triggerLook?.(cursorIndex);
    }
    if (announce && selectedItem) {
      announceStatus(`${selectedItem.name} selected`);
    }
  }

  function stepCursor(delta) {
    if (activeLcdPanel === "speed") {
      flashLcdBezel();
      play8BitBlip(delta > 0 ? 3 : 2);
      syncSpeedPanelCursor(speedPanelCursorIdx + delta);
      scheduleLcdPanelIdleClose();
      const activeBtn = getSpeedPanelButtons()[speedPanelCursorIdx];
      if (activeBtn) {
        announceStatus(`Option ${activeBtn.textContent?.trim() || ""}`);
      }
      return;
    }
    flashLcdBezel();
    play8BitBlip(delta > 0 ? 3 : 2);
    setCursorIndex(cursorIndex + delta, { announce: true, petLook: true });
  }

  function executeMenuAction(index, { triggerEl = null, focusInside = true } = {}) {
    const item = LCD_MENU_ITEMS[index];
    if (!item) return;

    switch (item.action) {
      case "feed":
        petEl?.feed?.();
        flashLcdActive(lcdFeedBtn);
        eggController?.boop?.();
        break;

      case "light": {
        const curIdx = Math.max(0, THEMES.indexOf(appearance.theme));
        const nextTheme = THEMES[(curIdx + 1) % THEMES.length];
        setAppearance({ theme: nextTheme }, { announce: true });
        flashLcdActive(lcdLightBtn);
        break;
      }

      case "play":
        dismissOkHint();
        togglePlayback();
        eggController?.boop?.();
        break;

      case "heal":
        if (hasMediaError) {
          syncHealUi(false);
          try {
            mediaEl?.load?.();
            mediaEl?.play?.();
          } catch {
            // Ignore play rejection
          }
          announceStatus("Reloading stream.");
        } else {
          flashLcdActive(lcdHealBtn);
          announceStatus("Stream healthy.");
        }
        break;

      case "sound":
        if (activeLcdPanel === "volume") {
          closeLcdPanels({ returnFocus: false });
        } else {
          openLcdPanel("volume", triggerEl || lcdSoundBtn, { focusInside });
        }
        break;

      case "speed":
        if (activeLcdPanel === "speed") {
          const curIdx = SPEED_STEPS.indexOf(currentRate);
          const nextRate = SPEED_STEPS[(curIdx + 1) % SPEED_STEPS.length];
          commitPlaybackRate(nextRate);
        } else {
          openLcdPanel("speed", triggerEl || lcdSpeedBtn, { focusInside });
        }
        break;

      case "lean":
        toggleLeanIn({ manageFocus: false });
        break;

      case "info":
        if (activeLcdPanel === "help") {
          closeLcdPanels({ returnFocus: false });
        } else {
          openLcdPanel("help", triggerEl || lcdInfoBtn, { focusInside });
        }
        break;
    }
  }

  function handleConfirmB(trigger = btnB) {
    if (activeLcdPanel === "speed") {
      dismissOkHint();
      flashLcdBezel();
      play8BitBlip(4);
      petEl?.triggerHop?.();
      const targetBtn = getSpeedPanelButtons()[speedPanelCursorIdx];
      if (targetBtn) {
        targetBtn.click();
        syncSpeedPanelCursor(speedPanelCursorIdx);
      }
      scheduleLcdPanelIdleClose();
      return;
    }
    dismissOkHint();
    flashLcdBezel();
    play8BitBlip(4);
    petEl?.triggerHop?.();
    executeMenuAction(cursorIndex, { triggerEl: trigger, focusInside: true });
  }

  function handleBackC({ returnFocusToC = false } = {}) {
    flashLcdBezel();
    play8BitBlip(1);
    petEl?.triggerShrug?.();

    const hadCustomize = customizePopover && !customizePopover.hidden;
    const hadLcdPanel = activeLcdPanel !== null;

    if (hadCustomize) {
      closeCustomize({ returnFocus: false });
    }
    if (hadLcdPanel) {
      closeLcdPanels({ returnFocus: false });
    }

    if (hadCustomize || hadLcdPanel) {
      setCursorIndex(2, { announce: false, petLook: false });
      announceStatus("Closed panel, Play selected");
      if (returnFocusToC) btnC?.focus({ preventScroll: true });
      return;
    }

    if (viewMode === "lean-in") {
      setViewMode("toy", { manageFocus: false });
      setCursorIndex(2, { announce: false, petLook: false });
      if (returnFocusToC) btnC?.focus({ preventScroll: true });
      return;
    }

    setCursorIndex(2, { announce: true, petLook: false });
  }

  // Button A (NEXT: short press = +1, 500ms long press = -1)
  function clearBtnALongPress() {
    if (btnALongPressTimer) {
      clearTimeout(btnALongPressTimer);
      btnALongPressTimer = null;
    }
  }

  btnA?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    btnALongPressFired = false;
    clearBtnALongPress();
    btnALongPressTimer = setTimeout(() => {
      btnALongPressTimer = null;
      btnALongPressFired = true;
      stepCursor(-1);
    }, LONG_PRESS_MS);
  });

  btnA?.addEventListener("pointerup", clearBtnALongPress);
  btnA?.addEventListener("pointercancel", clearBtnALongPress);
  btnA?.addEventListener("pointerleave", clearBtnALongPress);

  btnA?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (btnALongPressFired) {
      btnALongPressFired = false;
      return;
    }
    stepCursor(1);
  });

  // Button B (OK / Confirm)
  btnB?.addEventListener("click", (event) => {
    event.stopPropagation();
    handleConfirmB(btnB);
  });

  // Button C (BACK / Cancel)
  btnC?.addEventListener("click", (event) => {
    event.stopPropagation();
    handleBackC({ returnFocusToC: event.detail === 0 });
  });

  /* ------------------------------------------------------------------ */
  /* PART 2: Dedicated Hero Pet Stage Strip Seek Slider                 */
  /* ------------------------------------------------------------------ */

  petSliderEl?.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "touch") return;
    isSliderHovered = true;
    showSeekTooltipAt(pointerRatioOnPetSlider(event));
  });

  petSliderEl?.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" && !isSliderDragging) return;
    isSliderHovered = true;
    const ratio = pointerRatioOnPetSlider(event);
    showSeekTooltipAt(ratio);
    if (isSliderDragging) {
      const dur = getMediaDuration();
      if (dur > 0) {
        seekToSeconds(dur * ratio);
      }
    }
  });

  const handleSliderLeave = () => {
    isSliderHovered = false;
    if (!isSliderDragging) hideSeekTooltip();
  };

  petSliderEl?.addEventListener("pointerleave", handleSliderLeave);
  petSliderEl?.addEventListener("mouseleave", handleSliderLeave);

  window.addEventListener(
    "pointermove",
    (event) => {
      if (!isSliderHovered || isSliderDragging || !petSliderEl) return;
      const rect = petSliderEl.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!inside) {
        isSliderHovered = false;
        hideSeekTooltip();
      }
    },
    { passive: true }
  );

  petSliderEl?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.stopPropagation();
    isSliderDragging = true;
    petEl?.setSeeking?.(true);
    petSliderEl.setPointerCapture?.(event.pointerId);
    const ratio = pointerRatioOnPetSlider(event);
    showSeekTooltipAt(ratio);
    const dur = getMediaDuration();
    if (dur > 0) {
      seekToSeconds(dur * ratio);
    }
  });

  const endPetSliderDrag = (event) => {
    if (!isSliderDragging) return;
    isSliderDragging = false;
    if (event?.pointerId !== undefined) {
      try {
        petSliderEl?.releasePointerCapture?.(event.pointerId);
      } catch {
        // Ignore if not captured
      }
    }
    petEl?.setSeeking?.(false);
    hideSeekTooltip();
  };

  petSliderEl?.addEventListener("pointerup", endPetSliderDrag);
  petSliderEl?.addEventListener("pointercancel", endPetSliderDrag);
  window.addEventListener("pointerup", endPetSliderDrag);
  window.addEventListener("pointercancel", endPetSliderDrag);

  petSliderEl?.addEventListener("keydown", (event) => {
    const cur = getMediaCurrentTime();
    const dur = getMediaDuration();
    let nextTime = null;

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      nextTime = Math.max(0, cur - 5);
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      nextTime = dur > 0 ? Math.min(dur, cur + 5) : cur + 5;
    } else if (event.key === "Home") {
      nextTime = 0;
    } else if (event.key === "End" && dur > 0) {
      nextTime = dur;
    }

    if (nextTime !== null) {
      event.preventDefault();
      event.stopPropagation();
      seekToSeconds(nextTime);
      if (dur > 0) {
        showSeekTooltipAt(nextTime / dur, { autoHideMs: 900 });
      }
    }
  });

  petSliderEl?.addEventListener("blur", () => {
    if (!isSliderHovered && !isSliderDragging) hideSeekTooltip();
  });

  /* ------------------------------------------------------------------ */
  /* Hover 3D Tilt (max 4° on Toy View only)                            */
  /* ------------------------------------------------------------------ */

  function resetDeviceTilt() {
    if (tiltStageEl) {
      tiltStageEl.style.setProperty("--egg-tilt-x", "0deg");
      tiltStageEl.style.setProperty("--egg-tilt-y", "0deg");
    }
    eggController?.setTilt?.(0, 0);
  }

  deviceEl?.addEventListener("pointermove", (event) => {
    if (
      event.pointerType !== "mouse" ||
      viewMode !== "toy" ||
      isReducedMotion() ||
      steady.isSteady() ||
      intro.isRunning() ||
      deviceEl.hasAttribute("data-fullscreen")
    ) {
      return;
    }
    const rect = deviceEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
    if (tiltStageEl) {
      tiltStageEl.style.setProperty("--egg-tilt-x", `${(-ny * 3.5).toFixed(2)}deg`);
      tiltStageEl.style.setProperty("--egg-tilt-y", `${(nx * 3.5).toFixed(2)}deg`);
    }
    eggController?.setTilt?.(nx, ny);
  });

  deviceEl?.addEventListener("pointerleave", () => {
    resetDeviceTilt();
  });

  /* ------------------------------------------------------------------ */
  /* Deterministic Lean-in View Math (< 2px Center Accuracy)            */
  /* ------------------------------------------------------------------ */

  function computeLeanMetrics() {
    if (!dollyAnchor || !deviceEl || !bezelEl) {
      return { originX: 0, originY: 0, dx: 0, dy: 0, s: 1 };
    }

    player.setAttribute("data-measuring-lean", "");
    player.style.setProperty("--lean-origin-x", "50%");
    player.style.setProperty("--lean-origin-y", "50%");
    player.style.setProperty("--lean-tx", "0px");
    player.style.setProperty("--lean-ty", "0px");
    player.style.setProperty("--lean-scale", "1");
    void dollyAnchor.offsetWidth;

    const wrapperRect = dollyAnchor.getBoundingClientRect();
    const screenRect = bezelEl.getBoundingClientRect();

    player.removeAttribute("data-measuring-lean");

    if (!screenRect.width || !screenRect.height) {
      return { originX: 0, originY: 0, dx: 0, dy: 0, s: 1 };
    }

    const screenCenterX = screenRect.left + screenRect.width / 2;
    const screenCenterY = screenRect.top + screenRect.height / 2;

    const originX = screenCenterX - wrapperRect.left;
    const originY = screenCenterY - wrapperRect.top;

    const s = Math.min(
      (window.innerWidth * 0.88) / screenRect.width,
      (window.innerHeight * 0.88) / screenRect.height
    );
    const dx = window.innerWidth / 2 - screenCenterX;
    const dy = window.innerHeight / 2 - screenCenterY;

    return {
      originX,
      originY,
      dx,
      dy,
      s: Math.max(1.1, Math.min(5.0, s)),
    };
  }

  function applyDollyVars({ originX, originY, dx, dy, s }, { instant = false } = {}) {
    if (instant && dollyAnchor) {
      dollyAnchor.style.transition = "none";
    }
    player.style.setProperty("--lean-origin-x", `${originX.toFixed(2)}px`);
    player.style.setProperty("--lean-origin-y", `${originY.toFixed(2)}px`);
    player.style.setProperty("--lean-tx", `${dx.toFixed(2)}px`);
    player.style.setProperty("--lean-ty", `${dy.toFixed(2)}px`);
    player.style.setProperty("--lean-scale", String(Number(s.toFixed(4))));
    player.style.setProperty("--lean-inv", String(Number((1 / s).toFixed(5))));
    if (instant && dollyAnchor) {
      void dollyAnchor.offsetWidth;
      dollyAnchor.style.transition = "";
    }
  }

  function verifyLeanInCentering() {
    if (viewMode !== "lean-in" || !bezelEl) return;
    const r = bezelEl.getBoundingClientRect();
    const bezelCenterX = r.left + r.width / 2;
    const bezelCenterY = r.top + r.height / 2;
    const viewCenterX = window.innerWidth / 2;
    const viewCenterY = window.innerHeight / 2;
    const deltaX = Math.abs(bezelCenterX - viewCenterX);
    const deltaY = Math.abs(bezelCenterY - viewCenterY);

    console.info(
      `[Poppet lean-in check] bezelCenter=(${bezelCenterX.toFixed(1)}, ${bezelCenterY.toFixed(
        1
      )}) viewportCenter=(${viewCenterX.toFixed(1)}, ${viewCenterY.toFixed(
        1
      )}) delta=(${deltaX.toFixed(2)}px, ${deltaY.toFixed(2)}px)`
    );

    if (deltaX >= 2 || deltaY >= 2) {
      const metrics = computeLeanMetrics();
      applyDollyVars(metrics, { instant: true });
    }
  }

  function scheduleLeanVerification(delayMs = 700) {
    if (leanVerifyTimer) {
      clearTimeout(leanVerifyTimer);
      leanVerifyTimer = null;
    }
    leanVerifyTimer = setTimeout(() => {
      leanVerifyTimer = null;
      verifyLeanInCentering();
    }, delayMs);
  }

  dollyAnchor?.addEventListener("transitionend", (event) => {
    if (event.target === dollyAnchor && event.propertyName === "transform" && viewMode === "lean-in") {
      if (leanVerifyTimer) {
        clearTimeout(leanVerifyTimer);
        leanVerifyTimer = null;
      }
      verifyLeanInCentering();
    }
  });

  function setViewMode(nextMode, { manageFocus = true } = {}) {
    if (intro.isRunning()) return;
    if (nextMode !== "toy" && nextMode !== "lean-in") return;
    if (viewMode === nextMode) return;
    if (deviceEl?.hasAttribute("data-fullscreen") && nextMode === "lean-in") return;

    viewMode = nextMode;
    if (leanFadeTimer) {
      clearTimeout(leanFadeTimer);
      leanFadeTimer = null;
      player.removeAttribute("data-view-fading");
    }
    if (leanVerifyTimer) {
      clearTimeout(leanVerifyTimer);
      leanVerifyTimer = null;
    }

    const reduced = isReducedMotion();
    const applyState = () => {
      if (nextMode === "lean-in") {
        resetDeviceTilt();
        const metrics = computeLeanMetrics();
        document.documentElement.classList.add("poppet-is-lean-in");
        document.body.classList.add("poppet-is-lean-in");
        player.setAttribute("data-view", "lean-in");
        deviceEl?.setAttribute("data-view", "lean-in");
        applyDollyVars(metrics, { instant: reduced });

        lcdLeanBtn?.setAttribute("aria-pressed", "true");
        lcdLeanBtn?.setAttribute("aria-label", "Exit close-up view");
        zoomOutBtn?.setAttribute("aria-label", "Exit close-up view");
        eggController?.setLeanIn?.(true);
        announceStatus("Close-up view.");

        scheduleLeanVerification(reduced ? 60 : 700);
        if (manageFocus) {
          requestAnimationFrame(() => {
            zoomOutBtn?.focus({ preventScroll: true });
          });
        }
      } else {
        document.documentElement.classList.remove("poppet-is-lean-in");
        document.body.classList.remove("poppet-is-lean-in");
        player.setAttribute("data-view", "toy");
        deviceEl?.setAttribute("data-view", "toy");
        player.style.setProperty("--lean-tx", "0px");
        player.style.setProperty("--lean-ty", "0px");
        player.style.setProperty("--lean-scale", "1");
        player.style.setProperty("--lean-inv", "1");
        lcdLeanBtn?.setAttribute("aria-pressed", "false");
        lcdLeanBtn?.setAttribute("aria-label", "Lean in close-up view");
        zoomOutBtn?.setAttribute("aria-label", "Lean in close-up view");
        eggController?.setLeanIn?.(false);
        announceStatus("Toy view.");
        if (manageFocus) {
          requestAnimationFrame(() => {
            lcdLeanBtn?.focus({ preventScroll: true });
          });
        }
      }

      if (customizePopover && !customizePopover.hidden) {
        requestAnimationFrame(() => positionPopoverNear(customizePopover, customizeTrigger));
      }
      steady.refresh();
    };

    if (reduced) {
      player.setAttribute("data-view-fading", "");
      leanFadeTimer = setTimeout(() => {
        leanFadeTimer = null;
        applyState();
        requestAnimationFrame(() => {
          player.removeAttribute("data-view-fading");
        });
      }, 100);
    } else {
      applyState();
    }
  }

  function toggleLeanIn({ manageFocus = true } = {}) {
    setViewMode(viewMode === "lean-in" ? "toy" : "lean-in", { manageFocus });
  }

  /* ------------------------------------------------------------------ */
  /* Appearance Radiogroups: Pet, Theme, Accent Color Swatches          */
  /* ------------------------------------------------------------------ */

  function syncAppearanceUi() {
    syncFsPet(!(player.store?.state?.paused ?? mediaEl?.paused ?? true));
    for (const btn of document.querySelectorAll("[data-choice-pet]")) {
      const checked = btn.getAttribute("data-choice-pet") === appearance.pet;
      btn.setAttribute("aria-checked", String(checked));
      btn.setAttribute("tabindex", checked ? "0" : "-1");
    }

    for (const btn of document.querySelectorAll("[data-choice-theme]")) {
      const checked = btn.getAttribute("data-choice-theme") === appearance.theme;
      btn.setAttribute("aria-checked", String(checked));
      btn.setAttribute("tabindex", checked ? "0" : "-1");
    }

    for (const btn of document.querySelectorAll("[data-choice-accent]")) {
      const checked = btn.getAttribute("data-choice-accent") === appearance.accent;
      btn.setAttribute("aria-checked", String(checked));
      btn.setAttribute("tabindex", checked ? "0" : "-1");
    }

    for (const btn of document.querySelectorAll("[data-choice-bg]")) {
      const checked = btn.getAttribute("data-choice-bg") === appearance.bg;
      btn.setAttribute("aria-checked", String(checked));
      btn.setAttribute("tabindex", checked ? "0" : "-1");
    }

    if (lcdLightBtn) {
      const themeLabel =
        appearance.theme.charAt(0).toUpperCase() + appearance.theme.slice(1);
      lcdLightBtn.setAttribute("aria-pressed", String(appearance.theme === "midnight"));
      lcdLightBtn.setAttribute("aria-label", `Cycle theme (${themeLabel})`);
    }

    const pet = PETS[appearance.pet] || PETS.pip;
    if (container) {
      container.setAttribute(
        "aria-label",
        appearance.pet === "none"
          ? "Poppet video player"
          : `Poppet video player featuring ${pet.name}`
      );
    }
  }

  const pageEl = document.querySelector(".poppet-page");
  const bgFileInput = document.querySelector("[data-poppet-bg-file]");
  let customBgUrl = "";

  bgFileInput?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !pageEl) return;
    if (customBgUrl) URL.revokeObjectURL(customBgUrl);
    customBgUrl = URL.createObjectURL(file);
    pageEl.style.setProperty("--poppet-custom-bg", `url("${customBgUrl}")`);
    setAppearance({ bg: "custom" }, { announce: true });
  });

  function setAppearance(next, { announce = true } = {}) {
    const nextPet = next.pet && PETS[next.pet] ? next.pet : appearance.pet;
    const nextTheme =
      next.theme && THEMES.includes(next.theme) ? next.theme : appearance.theme;
    const nextAccent =
      next.accent && Object.prototype.hasOwnProperty.call(ACCENT_PRESETS, next.accent)
        ? next.accent
        : appearance.accent;
    const nextBg =
      next.bg && (BG_PRESETS.includes(next.bg) || (next.bg === "custom" && customBgUrl))
        ? next.bg
        : appearance.bg;

    const petChanged = nextPet !== appearance.pet;
    const themeChanged = nextTheme !== appearance.theme;
    const accentChanged = nextAccent !== appearance.accent;
    const bgChanged = nextBg !== appearance.bg;

    appearance = { pet: nextPet, theme: nextTheme, accent: nextAccent, bg: nextBg };
    const targets = [document.documentElement, player].filter(Boolean);
    for (const el of targets) {
      el.setAttribute("data-pet", nextPet);
      el.setAttribute("data-theme", nextTheme);
    }
    if (pageEl) {
      pageEl.setAttribute("data-bg", nextBg);
    }
    applyAccentOverride(targets, nextAccent);

    petEl?.refreshConfig?.();
    syncAppearanceUi();
    saveAppearance({ ...appearance, bg: nextBg === "custom" ? "default" : nextBg });
    eggController?.syncThemeColors?.();

    if (announce) {
      if (petChanged) {
        const pet = PETS[nextPet] || PETS.pip;
        announceStatus(
          nextPet === "none" ? "Pet hidden, pixel dot active." : `Pet changed to ${pet.name}.`
        );
      } else if (themeChanged) {
        const label = nextTheme.charAt(0).toUpperCase() + nextTheme.slice(1);
        announceStatus(`Theme changed to ${label}.`);
      } else if (accentChanged) {
        const label = nextAccent.charAt(0).toUpperCase() + nextAccent.slice(1);
        announceStatus(`Accent color changed to ${label}.`);
      } else if (bgChanged) {
        announceStatus(`Background changed to ${nextBg}.`);
      }
    }
  }

  for (const group of document.querySelectorAll("[role='radiogroup'][data-poppet-group]")) {
    const kind = group.getAttribute("data-poppet-group");
    const radios = Array.from(group.querySelectorAll("[role='radio']"));

    const activateRadio = (radio) => {
      let val = null;
      if (kind === "pet") val = radio.getAttribute("data-choice-pet");
      else if (kind === "theme") val = radio.getAttribute("data-choice-theme");
      else if (kind === "accent") val = radio.getAttribute("data-choice-accent");
      else if (kind === "bg") val = radio.getAttribute("data-choice-bg");
      if (!val) return;

      if (kind === "pet") setAppearance({ pet: val }, { announce: true });
      else if (kind === "theme") setAppearance({ theme: val }, { announce: true });
      else if (kind === "accent") setAppearance({ accent: val }, { announce: true });
      else if (kind === "bg") {
        if (val === "custom") {
          bgFileInput?.click();
        } else {
          setAppearance({ bg: val }, { announce: true });
        }
      }
    };

    group.addEventListener("click", (event) => {
      const radio = event.target instanceof Element ? event.target.closest("[role='radio']") : null;
      if (!radio || !group.contains(radio)) return;
      activateRadio(radio);
    });

    group.addEventListener("keydown", (event) => {
      const current = event.target instanceof Element ? event.target.closest("[role='radio']") : null;
      if (!current || !radios.length) return;
      const idx = radios.indexOf(current);
      if (idx < 0) return;

      let nextIdx = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIdx = (idx + 1) % radios.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIdx = (idx - 1 + radios.length) % radios.length;
      } else if (event.key === "Home") {
        nextIdx = 0;
      } else if (event.key === "End") {
        nextIdx = radios.length - 1;
      } else if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        activateRadio(current);
        return;
      }

      if (nextIdx !== null) {
        event.preventDefault();
        event.stopPropagation();
        const nextRadio = radios[nextIdx];
        activateRadio(nextRadio);
        nextRadio.focus({ preventScroll: true });
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Speed Radio Group Inside 1-Bit LCD Speed Panel                     */
  /* ------------------------------------------------------------------ */

  function commitPlaybackRate(rate) {
    const clean = SPEED_STEPS.includes(rate) ? rate : 1;
    currentRate = clean;
    if (mediaEl) {
      mediaEl.playbackRate = clean;
    }
    player.store?.state?.setPlaybackRate?.(clean);
    syncSpeedUi(clean);
    play8BitBlip(SPEED_STEPS.indexOf(clean) + 1);
    announceStatus(`Playback speed ${clean}x.`);
    scheduleLcdPanelIdleClose();
  }

  function syncSpeedUi(rate) {
    const clean = Number.isFinite(rate) ? rate : 1;
    currentRate = clean;
    const label = `${clean}x`;

    if (lcdSpeedBadge) {
      lcdSpeedBadge.textContent = label;
      lcdSpeedBadge.hidden = clean === 1;
    }
    if (lcdSpeedBtn) {
      lcdSpeedBtn.setAttribute("aria-label", `Playback speed ${label}`);
      lcdSpeedBtn.setAttribute("title", `Speed: ${label}`);
    }
    for (const btn of lcdRateBtns) {
      const r = Number.parseFloat(btn.getAttribute("data-speed-rate") || "1");
      const checked = Math.abs(r - clean) < 0.01;
      btn.setAttribute("aria-checked", String(checked));
      btn.setAttribute("tabindex", checked ? "0" : "-1");
    }
  }

  lcdSpeedGroup?.addEventListener("click", (event) => {
    event.stopPropagation();
    const btn = event.target instanceof Element ? event.target.closest("[data-speed-rate]") : null;
    if (!btn) return;
    const rate = Number.parseFloat(btn.getAttribute("data-speed-rate") || "1");
    commitPlaybackRate(rate);
  });

  lcdSpeedGroup?.addEventListener("keydown", (event) => {
    const current = event.target instanceof Element ? event.target.closest("[data-speed-rate]") : null;
    if (!current || !lcdRateBtns.length) return;
    const idx = lcdRateBtns.indexOf(current);
    if (idx < 0) return;

    let nextIdx = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIdx = (idx + 1) % lcdRateBtns.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIdx = (idx - 1 + lcdRateBtns.length) % lcdRateBtns.length;
    } else if (event.key === "Home") {
      nextIdx = 0;
    } else if (event.key === "End") {
      nextIdx = lcdRateBtns.length - 1;
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      commitPlaybackRate(Number.parseFloat(current.getAttribute("data-speed-rate") || "1"));
      return;
    }

    if (nextIdx !== null) {
      event.preventDefault();
      event.stopPropagation();
      const nextBtn = lcdRateBtns[nextIdx];
      commitPlaybackRate(Number.parseFloat(nextBtn.getAttribute("data-speed-rate") || "1"));
      nextBtn.focus({ preventScroll: true });
    }
  });

  /* ------------------------------------------------------------------ */
  /* Playback & Direct LCD Icon Clicks                                  */
  /* ------------------------------------------------------------------ */

  syncAppearanceUi();
  if (lcdInfoBtn) lcdInfoBtn.hidden = !POPPET.shortcuts;

  function togglePlayback() {
    dismissOkHint();
    const s = player.store?.state;
    if (s) {
      if (s.ended) {
        s.seek?.(0);
        s.play?.();
      } else if (s.paused) {
        s.play?.();
      } else {
        s.pause?.();
      }
    } else if (mediaEl) {
      if (mediaEl.ended) {
        mediaEl.currentTime = 0;
        mediaEl.play?.();
      } else if (mediaEl.paused) {
        mediaEl.play?.();
      } else {
        mediaEl.pause?.();
      }
    }
  }

  function syncHealUi(errored) {
    hasMediaError = Boolean(errored);
    if (!lcdHealBtn) return;
    lcdHealBtn.disabled = !hasMediaError;
    lcdHealBtn.setAttribute("aria-disabled", String(!hasMediaError));
    if (hasMediaError) {
      lcdHealBtn.setAttribute("data-active", "true");
    } else {
      lcdHealBtn.removeAttribute("data-active");
    }
  }

  replayBtn?.addEventListener("click", () => {
    const s = player.store?.state;
    if (s?.seek) {
      s.seek(0);
      s.play?.();
    } else if (mediaEl) {
      mediaEl.currentTime = 0;
      mediaEl.play?.();
    }
  });

  // Direct clicks on the 8 LCD icons also move the cursor to that icon and run its action
  for (const item of LCD_MENU_ITEMS) {
    item.el?.addEventListener("click", (event) => {
      event.stopPropagation();
      setCursorIndex(item.index, { announce: false, petLook: false });
      if (item.action === "play") {
        petEl?.triggerHop?.();
      }
      executeMenuAction(item.index, {
        triggerEl: item.el,
        focusInside: event.detail === 0,
      });
    });
  }

  function bindMediaEvents() {
    mediaEventsController?.abort();
    mediaEventsController = new AbortController();
    const { signal } = mediaEventsController;
    const currentMedia = mediaEl || player.querySelector("mux-video, video, audio");
    if (!currentMedia) return;

    currentMedia.addEventListener(
      "ratechange",
      () => {
        syncSpeedUi(currentMedia.playbackRate || 1);
      },
      { signal }
    );
    currentMedia.addEventListener("error", () => syncHealUi(true), { signal });
    currentMedia.addEventListener("playing", () => syncHealUi(false), { signal });
    currentMedia.addEventListener("canplay", () => syncHealUi(false), { signal });
    currentMedia.addEventListener("timeupdate", syncFsProgress, { signal });
    currentMedia.addEventListener(
      "loadedmetadata",
      () => {
        syncFsProgress();
        syncQualityOptions();
        syncCcControl();
      },
      { signal }
    );
    currentMedia.addEventListener("hlsManifestParsed", syncQualityOptions, { signal });
    currentMedia.addEventListener("hlsLevelsUpdated", syncQualityOptions, { signal });
    if (currentMedia.hls?.on) {
      const onHlsLevels = () => syncQualityOptions();
      currentMedia.hls.on("hlsManifestParsed", onHlsLevels);
      currentMedia.hls.on("hlsLevelsUpdated", onHlsLevels);
      currentMedia.hls.on("hlsLevelSwitched", onHlsLevels);
    }
    if (currentMedia.textTracks?.addEventListener) {
      currentMedia.textTracks.addEventListener("addtrack", syncCcControl, { signal });
      currentMedia.textTracks.addEventListener("change", syncCcControl, { signal });
    }
    selectedQualityLevel = -1;
    syncQualityOptions();
    syncCcControl();
  }

  bindMediaEvents();

  zoomOutBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleLeanIn({ manageFocus: true });
  });

  lcdHelpCloseBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    closeLcdPanels({ returnFocus: true });
  });

  // Header Customize button
  gearBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (customizePopover?.hidden) {
      openCustomize(gearBtn);
      const firstChecked = customizePopover.querySelector("[role='radio'][aria-checked='true']");
      firstChecked?.focus({ preventScroll: true });
    } else {
      closeCustomize({ returnFocus: true });
    }
  });

  // Outside click closes customize popover and in-screen LCD overlays
  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;

    if (
      customizePopover &&
      !customizePopover.hidden &&
      !customizePopover.contains(target) &&
      !gearBtn?.contains(target)
    ) {
      closeCustomize();
    }

    if (activeLcdPanel) {
      const panelEl =
        activeLcdPanel === "volume"
          ? lcdVolPanel
          : activeLcdPanel === "speed"
          ? lcdSpeedPanel
          : lcdHelpPanel;
      const inPanel = panelEl?.contains(target);
      const inTrigger =
        lcdSoundBtn?.contains(target) ||
        lcdSpeedBtn?.contains(target) ||
        lcdInfoBtn?.contains(target) ||
        btnA?.contains(target) ||
        btnB?.contains(target) ||
        btnC?.contains(target);
      if (!inPanel && !inTrigger) {
        closeLcdPanels({ returnFocus: false });
      }
    }
  });

  const syncControlTriggers = () => {
    const s = player.store?.state;
    const paused = Boolean(s?.paused ?? mediaEl?.paused ?? true);
    const ended = Boolean(s?.ended ?? mediaEl?.ended ?? false);
    const muted = Boolean(s?.muted || s?.volume === 0);
    const playing = !paused && !ended;

    if (playing) {
      dismissOkHint();
    }

    if (s?.error) {
      syncHealUi(true);
    }

    if (lcdPlayBtn) {
      lcdPlayBtn.setAttribute("aria-pressed", String(playing));
      lcdPlayBtn.setAttribute(
        "aria-label",
        ended ? "Replay video" : paused ? "Play video" : "Pause video"
      );
    }

    if (lcdSoundBtn) {
      lcdSoundBtn.toggleAttribute("data-muted", muted);
      lcdSoundBtn.setAttribute(
        "aria-label",
        muted
          ? "Volume and mute (muted)"
          : `Volume and mute (${Math.round((s?.volume ?? 1) * 100)}%)`
      );
    }

    syncButtonBLabelAndGlyph();
    renderLcdVolume();
    syncFsControls();
  };

  let lastFsTimeText = "";

  function syncFsProgress() {
    const inVideoFs =
      Boolean(container?.hasAttribute("data-video-fullscreen")) ||
      Boolean(container && document.fullscreenElement === container);
    if (!inVideoFs) return;

    const dur = getMediaDuration();
    const cur = getMediaCurrentTime();
    if (fsTimeEl) {
      const nextText = `${formatAriaTime(cur)} / ${formatAriaTime(dur)}`;
      if (nextText !== lastFsTimeText) {
        lastFsTimeText = nextText;
        fsTimeEl.textContent = nextText;
      }
    }
    if (fsSeekInput && !fsSeeking) {
      const ratio = dur > 0 ? Math.min(1, Math.max(0, cur / dur)) : 0;
      const pct = `${(ratio * 100).toFixed(2)}%`;
      fsSeekInput.value = String(Math.round(ratio * 1000));
      fsSeekInput.style.setProperty("--poppet-fs-progress", pct);
      fsControlsEl?.style.setProperty("--poppet-fs-progress", pct);
    }
  }

  function syncFsPet(playing) {
    if (!fsPetEl) return;
    const petId = player.getAttribute("data-pet") || POPPET.pet || "pip";
    const petCfg = PETS[petId];
    if (!petCfg || !petCfg.src) {
      fsPetEl.hidden = true;
      return;
    }
    fsPetEl.hidden = false;
    fsPetEl.style.backgroundImage = `url("${petCfg.src}")`;
    fsPetEl.setAttribute("data-playing", String(Boolean(playing)));
  }

  function getQualityOptions() {
    const hls = mediaEl?.hls;
    const levels = Array.isArray(hls?.levels) ? hls.levels : [];
    if (!levels.length) {
      return [{ level: -1, label: "Source" }];
    }
    const seenHeights = new Set();
    const rows = [];
    levels.forEach((lvl, idx) => {
      const h = Number(lvl?.height) || 0;
      if (h > 0 && !seenHeights.has(h)) {
        seenHeights.add(h);
        rows.push({ level: idx, height: h, label: `${h}p` });
      }
    });
    rows.sort((a, b) => b.height - a.height);
    return [{ level: -1, label: "Auto" }, ...rows];
  }

  function setQualityLevel(level) {
    selectedQualityLevel = level;
    const hls = mediaEl?.hls;
    if (hls) {
      hls.currentLevel = level;
    }
    syncQualityOptions();
  }

  function syncQualityOptions() {
    const options = getQualityOptions();
    const hasLevels = options.length > 1;
    if (!hasLevels) selectedQualityLevel = -1;
    const active = options.find((opt) => opt.level === selectedQualityLevel) || options[0];

    if (fsQualityBtn) {
      fsQualityBtn.textContent = active.label;
      fsQualityBtn.disabled = !hasLevels;
      fsQualityBtn.title = hasLevels ? `Video quality: ${active.label}` : "Original source quality";
    }

    if (fsQualityMenu) {
      fsQualityMenu.innerHTML = "";
      for (const opt of options) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "poppet-fs-quality-item";
        btn.setAttribute("role", "menuitemradio");
        btn.setAttribute("aria-checked", String(opt.level === active.level));
        btn.textContent = opt.label;
        btn.addEventListener("click", (event) => {
          event.stopPropagation();
          setQualityLevel(opt.level);
          fsQualityMenu.hidden = true;
          fsQualityBtn?.setAttribute("aria-expanded", "false");
          bumpFsActivity();
        });
        fsQualityMenu.appendChild(btn);
      }
    }

    if (lcdQualityGroup) {
      lcdQualityGroup.innerHTML = "";
      for (const opt of options.slice(0, 4)) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "poppet-lcd-rate-btn";
        btn.setAttribute("role", "radio");
        btn.setAttribute("aria-checked", String(opt.level === active.level));
        btn.setAttribute("data-quality-level", String(opt.level));
        btn.tabIndex = opt.level === active.level ? 0 : -1;
        btn.textContent = opt.label;
        btn.addEventListener("click", (event) => {
          event.stopPropagation();
          setQualityLevel(opt.level);
        });
        lcdQualityGroup.appendChild(btn);
      }
    }
  }

  function syncCcControl() {
    if (!fsCcBtn) return;
    const tracks = Array.from(mediaEl?.textTracks || []).filter(
      (t) => t.kind === "subtitles" || t.kind === "captions"
    );
    if (!tracks.length) {
      fsCcBtn.hidden = true;
      return;
    }
    fsCcBtn.hidden = false;
    const active = tracks.some((t) => t.mode === "showing");
    fsCcBtn.setAttribute("aria-pressed", String(active));
  }

  function syncFsControls() {
    if (!fsControlsEl) return;
    const s = player.store?.state;
    const paused = Boolean(s?.paused ?? mediaEl?.paused ?? true);
    const ended = Boolean(s?.ended ?? mediaEl?.ended ?? false);
    const muted = Boolean(s?.muted ?? mediaEl?.muted ?? s?.volume === 0);
    const playing = !paused && !ended;
    const rawVol = typeof s?.volume === "number" ? s.volume : mediaEl?.volume ?? 1;
    const effectiveVol = muted ? 0 : Math.min(1, Math.max(0, rawVol));

    if (fsPlayBtn) {
      fsPlayBtn.setAttribute("aria-pressed", String(playing));
      fsPlayBtn.setAttribute(
        "aria-label",
        ended ? "Replay video" : paused ? "Play video" : "Pause video"
      );
    }
    if (fsMuteBtn) {
      fsMuteBtn.setAttribute("aria-pressed", String(muted));
      fsMuteBtn.setAttribute("aria-label", muted ? "Unmute audio" : "Mute audio");
    }
    if (fsVolInput) {
      const pct = Math.round(effectiveVol * 100);
      fsVolInput.value = String(pct);
      fsVolInput.style.setProperty("--poppet-fs-vol", `${pct}%`);
    }
    if (fsSpeedBtn) {
      const rate = mediaEl?.playbackRate || currentRate || 1;
      fsSpeedBtn.textContent = `${rate}x`;
    }
    if (fsPipBtn) {
      fsPipBtn.hidden = !document.pictureInPictureEnabled;
    }
    syncFsPet(playing);
    syncCcControl();
    syncFsProgress();

    const inVideoFs =
      Boolean(container && document.fullscreenElement === container) ||
      Boolean(container?.hasAttribute("data-video-fullscreen"));
    if (inVideoFs && !playing) {
      if (fsActivityTimer) clearTimeout(fsActivityTimer);
      container?.setAttribute("data-fs-active", "");
    }
  }

  function bumpFsActivity() {
    const inVideoFs =
      Boolean(container && document.fullscreenElement === container) ||
      Boolean(container?.hasAttribute("data-video-fullscreen"));
    if (!inVideoFs || !container) return;
    container.setAttribute("data-fs-active", "");
    if (fsActivityTimer) clearTimeout(fsActivityTimer);
    const s = player.store?.state;
    const paused = Boolean(s?.paused ?? mediaEl?.paused ?? true);
    if (!paused) {
      fsActivityTimer = setTimeout(() => {
        container.removeAttribute("data-fs-active");
      }, 2200);
    }
  }

  fsControlsEl?.addEventListener("pointerdown", (event) => event.stopPropagation());
  fsControlsEl?.addEventListener("click", (event) => event.stopPropagation());

  fsPlayBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    togglePlayback();
    bumpFsActivity();
  });

  fsMuteBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMuteState();
    bumpFsActivity();
  });

  fsSpeedBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    const rate = mediaEl?.playbackRate || currentRate || 1;
    const idx = SPEED_STEPS.indexOf(rate);
    const nextRate = SPEED_STEPS[(idx + 1) % SPEED_STEPS.length];
    commitPlaybackRate(nextRate);
    syncFsControls();
    bumpFsActivity();
  });

  fsExitBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    videoFsBtn?.click();
  });

  fsVolInput?.addEventListener("input", (event) => {
    event.stopPropagation();
    const vol = Math.min(1, Math.max(0, Number(fsVolInput.value) / 100));
    fsVolInput.style.setProperty("--poppet-fs-vol", `${Math.round(vol * 100)}%`);
    const s = player.store?.state;
    if (typeof s?.setVolume === "function") {
      s.setVolume(vol);
      if (vol > 0 && s.muted && typeof s.setMuted === "function") {
        s.setMuted(false);
      }
    } else if (mediaEl) {
      mediaEl.volume = vol;
      mediaEl.muted = vol === 0;
    }
    bumpFsActivity();
  });

  fsQualityBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!fsQualityMenu) return;
    const nextHidden = !fsQualityMenu.hidden;
    fsQualityMenu.hidden = nextHidden;
    fsQualityBtn.setAttribute("aria-expanded", String(!nextHidden));
    bumpFsActivity();
  });

  fsCcBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    const tracks = Array.from(mediaEl?.textTracks || []).filter(
      (t) => t.kind === "subtitles" || t.kind === "captions"
    );
    if (!tracks.length) return;
    const currentlyShowing = tracks.some((t) => t.mode === "showing");
    tracks.forEach((t, idx) => {
      t.mode = !currentlyShowing && idx === 0 ? "showing" : "hidden";
    });
    syncCcControl();
    bumpFsActivity();
  });

  fsPipBtn?.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (!mediaEl || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await mediaEl.requestPictureInPicture?.();
      }
    } catch {
      // ignore PiP errors
    }
    bumpFsActivity();
  });

  fsSeekInput?.addEventListener("input", () => {
    fsSeeking = true;
    const dur = getMediaDuration();
    const ratio = Number(fsSeekInput.value) / 1000;
    const pct = `${(ratio * 100).toFixed(2)}%`;
    fsSeekInput.style.setProperty("--poppet-fs-progress", pct);
    fsControlsEl?.style.setProperty("--poppet-fs-progress", pct);
    if (dur > 0) {
      seekToSeconds(ratio * dur);
      if (fsTimeEl) {
        fsTimeEl.textContent = `${formatAriaTime(ratio * dur)} / ${formatAriaTime(dur)}`;
      }
    }
    bumpFsActivity();
  });

  fsSeekInput?.addEventListener("change", () => {
    fsSeeking = false;
    syncFsProgress();
  });

  container?.addEventListener("pointermove", bumpFsActivity);
  container?.addEventListener("pointerleave", () => {
    if (fsActivityTimer) clearTimeout(fsActivityTimer);
    const s = player.store?.state;
    const paused = Boolean(s?.paused ?? mediaEl?.paused ?? true);
    if (!paused) {
      container?.removeAttribute("data-fs-active");
    }
  });

  const syncFullscreenEgg = () => {
    const s = player.store?.state;
    const isVideoFs = Boolean(container && document.fullscreenElement === container);
    const isFs = Boolean((document.fullscreenElement && !isVideoFs) || s?.isFullscreen);
    if (container && !isVideoFs && !document.fullscreenElement) {
      // Keep fallback data-video-fullscreen only if explicitly toggled without native fullscreen
    }
    if (isFs && viewMode === "lean-in") {
      setViewMode("toy", { manageFocus: false });
    }
    videoFsBtn?.setAttribute(
      "aria-pressed",
      isVideoFs || container?.hasAttribute("data-video-fullscreen") ? "true" : "false"
    );
    deviceEl?.toggleAttribute("data-fullscreen", isFs);
    eggController?.setFullscreen?.(isFs || isVideoFs);
    steady.refresh();
  };

  videoFsBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    const inVideoFs =
      Boolean(container && document.fullscreenElement === container) ||
      Boolean(container?.hasAttribute("data-video-fullscreen"));
    if (inVideoFs) {
      container?.removeAttribute("data-video-fullscreen");
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      syncFullscreenEgg();
      return;
    }
    if (container?.requestFullscreen) {
      container
        .requestFullscreen()
        .then(() => {
          container.setAttribute("data-video-fullscreen", "");
          syncFullscreenEgg();
        })
        .catch(() => {
          container.setAttribute("data-video-fullscreen", "");
          syncFullscreenEgg();
        });
    } else if (container) {
      container.setAttribute("data-video-fullscreen", "");
      syncFullscreenEgg();
    }
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && container?.hasAttribute("data-video-fullscreen")) {
      container.removeAttribute("data-video-fullscreen");
    }
    syncFullscreenEgg();
  });

  if (player.store?.subscribe) {
    lastPausedState = Boolean(player.store.state?.paused ?? true);
    syncControlTriggers();
    syncFullscreenEgg();
    player.store.subscribe(() => {
      const nextPaused = Boolean(player.store?.state?.paused ?? true);
      if (lastPausedState !== null && nextPaused !== lastPausedState) {
        eggController?.boop?.();
      }
      lastPausedState = nextPaused;

      syncControlTriggers();
      syncFullscreenEgg();
      steady.refresh();
      if (isSliderDragging) {
        const duration = getMediaDuration();
        const cur = getMediaCurrentTime();
        showSeekTooltipAt(duration > 0 ? cur / duration : 0);
      }
    });
  } else {
    syncControlTriggers();
    syncFullscreenEgg();
  }

  setCursorIndex(2, { announce: false, petLook: false });
  syncSpeedUi(mediaEl?.playbackRate || 1);
  syncHealUi(false);
  renderLcdVolume();

  // Lazy-load Three.js egg shell AFTER player and media elements are ready
  const startLazyEgg = () => {
    if (!deviceEl || !eggCanvas) return;
    import("./egg-scene.js")
      .then(({ mountPoppetEggScene }) =>
        mountPoppetEggScene({
          player,
          deviceEl,
          canvas: eggCanvas,
        })
      )
      .then((ctrl) => {
        if (ctrl) {
          eggController = ctrl;
          eggController.setLeanIn?.(viewMode === "lean-in");
          syncFullscreenEgg();
        }
      })
      .catch(() => {
        // Keep CSS fallback egg silently
      });
  };

  const scheduleLazyEgg = () => {
    const trigger = () => {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => startLazyEgg(), { timeout: 300 });
      } else {
        setTimeout(startLazyEgg, 120);
      }
    };
    if (player.store) {
      requestAnimationFrame(trigger);
    } else {
      setTimeout(() => requestAnimationFrame(trigger), 150);
    }
  };
  scheduleLazyEgg();

  // Tap ripples & touch double-tap seek / lean-in
  function showTapRipple(side) {
    const el = side === "left" ? leftRipple : rightRipple;
    if (!el) return;
    if (rippleTimers[side]) {
      clearTimeout(rippleTimers[side]);
      rippleTimers[side] = null;
    }
    el.hidden = false;
    el.removeAttribute("data-active");
    void el.offsetWidth;
    el.setAttribute("data-active", "");
    rippleTimers[side] = setTimeout(() => {
      el.removeAttribute("data-active");
      el.hidden = true;
      rippleTimers[side] = null;
    }, 480);
  }

  container?.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(".poppet-lcd-panel, .poppet-screen-top-actions, .poppet-zoom-out-btn, .poppet-center-btn, media-error-dialog")
    ) {
      return;
    }

    lastTouchPointerUpAt = performance.now();
    const rect = container.getBoundingClientRect();
    if (!rect.width) return;
    const relX = (event.clientX - rect.left) / rect.width;
    const zone = relX < 1 / 3 ? "left" : relX > 2 / 3 ? "right" : "center";
    const now = performance.now();

    if (now - lastTouchTap.time < 320) {
      if (viewMode === "toy") {
        lastTouchTap = { time: 0, zone: "" };
        toggleLeanIn({ manageFocus: false });
        return;
      }

      if (lastTouchTap.zone === zone && (zone === "left" || zone === "right")) {
        lastTouchTap = { time: 0, zone: "" };
        if (zone === "left") {
          const cur = getMediaCurrentTime();
          seekToSeconds(Math.max(0, cur - 10));
          showTapRipple("left");
          announceStatus("Rewound 10 seconds.");
        } else {
          petEl?.feed?.();
          showTapRipple("right");
        }
        return;
      }

      lastTouchTap = { time: 0, zone: "" };
      toggleLeanIn({ manageFocus: false });
      return;
    }

    lastTouchTap = { time: now, zone };
  });

  // Mouse click on video toggles play/pause (debounced cleanly against dblclick Lean-in toggle)
  container?.addEventListener("click", (event) => {
    if (performance.now() - lastTouchPointerUpAt < 500) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(".poppet-lcd-panel, .poppet-screen-top-actions, .poppet-zoom-out-btn, .poppet-center-btn, media-error-dialog")
    ) {
      return;
    }
    if (event.detail > 1) {
      if (mouseClickTimer) {
        clearTimeout(mouseClickTimer);
        mouseClickTimer = null;
      }
      return;
    }
    if (mouseClickTimer) clearTimeout(mouseClickTimer);
    mouseClickTimer = setTimeout(() => {
      mouseClickTimer = null;
      togglePlayback();
    }, 210);
  });

  container?.addEventListener("dblclick", (event) => {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(".poppet-lcd-panel, .poppet-screen-top-actions, .poppet-zoom-out-btn, .poppet-center-btn, media-error-dialog")
    ) {
      return;
    }
    if (mouseClickTimer) {
      clearTimeout(mouseClickTimer);
      mouseClickTimer = null;
    }
    event.preventDefault();
    toggleLeanIn({ manageFocus: false });
  });

  // Debounced Lean-in recompute on resize / orientationchange
  const handleViewportChange = () => {
    if (customizePopover && !customizePopover.hidden) {
      positionPopoverNear(customizePopover, customizeTrigger);
    }
    if (viewMode !== "lean-in") return;
    if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(() => {
      resizeDebounceTimer = null;
      if (viewMode !== "lean-in") return;
      const metrics = computeLeanMetrics();
      applyDollyVars(metrics, { instant: true });
      requestAnimationFrame(verifyLeanInCentering);
    }, 80);
  };

  window.addEventListener("resize", handleViewportChange);
  window.addEventListener("orientationchange", handleViewportChange);

  // Keyboard map: Q = A (Next, hold 500ms = prev), W = B (OK), E = C (Back), Z = Lean-in, F = Feed, Shift+F = Fullscreen, ? = Help, Esc = Back/Close
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    if (isEditableElement(event.target)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key;
    const lower = key.toLowerCase();

    if (key === " ") {
      const hasOpenMenu =
        videoLibrary.isOpen() ||
        Boolean(customizePopover && !customizePopover.hidden) ||
        Boolean(activeLcdPanel) ||
        Boolean(fsQualityMenu && !fsQualityMenu.hidden);
      if (!hasOpenMenu) {
        event.preventDefault();
        if (!event.repeat) togglePlayback();
        return;
      }
    }

    if (lower === "q") {
      event.preventDefault();
      if (event.repeat) return;
      keyQLongPressFired = false;
      if (keyQLongPressTimer) clearTimeout(keyQLongPressTimer);
      flashButtonPressed(btnA);
      keyQLongPressTimer = setTimeout(() => {
        keyQLongPressTimer = null;
        keyQLongPressFired = true;
        stepCursor(-1);
      }, LONG_PRESS_MS);
      return;
    }

    if (lower === "w") {
      event.preventDefault();
      if (event.repeat) return;
      flashButtonPressed(btnB);
      handleConfirmB(btnB);
      return;
    }

    if (lower === "e") {
      event.preventDefault();
      if (event.repeat) return;
      flashButtonPressed(btnC);
      handleBackC({ returnFocusToC: false });
      return;
    }

    if (key === "Escape") {
      if (container?.hasAttribute("data-video-fullscreen")) {
        event.preventDefault();
        container.removeAttribute("data-video-fullscreen");
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
        syncFullscreenEgg();
        return;
      }
      if (videoLibrary.isOpen()) {
        event.preventDefault();
        videoLibrary.close({ returnFocus: true });
        return;
      }
      if (customizePopover && !customizePopover.hidden) {
        event.preventDefault();
        closeCustomize({ returnFocus: true });
        return;
      }
      if (activeLcdPanel) {
        event.preventDefault();
        closeLcdPanels({ returnFocus: true });
        return;
      }
      if (viewMode === "lean-in") {
        event.preventDefault();
        setViewMode("toy", { manageFocus: true });
        return;
      }
      const fs = player.store?.state;
      if (fs?.isFullscreen) {
        event.preventDefault();
        fs.exitFullscreen?.();
      }
      return;
    }

    if (key === "?" && POPPET.shortcuts) {
      event.preventDefault();
      if (activeLcdPanel === "help") {
        closeLcdPanels({ returnFocus: true });
      } else {
        openLcdPanel("help", lcdInfoBtn || btnC, { focusInside: true });
      }
      return;
    }

    if (lower === "z") {
      event.preventDefault();
      toggleLeanIn({ manageFocus: true });
      return;
    }

    if (lower === "s") {
      event.preventDefault();
      if (!event.repeat) steady.toggle();
      return;
    }

    if (lower === "f") {
      event.preventDefault();
      if (event.shiftKey) {
        const s = player.store?.state;
        if (s?.isFullscreen) {
          s.exitFullscreen?.();
        } else {
          s?.requestFullscreen?.();
        }
      } else {
        petEl?.feed();
        flashLcdActive(lcdFeedBtn);
      }
    }
  });

  document.addEventListener("keyup", (event) => {
    if (event.key.toLowerCase() === "q") {
      if (keyQLongPressTimer) {
        clearTimeout(keyQLongPressTimer);
        keyQLongPressTimer = null;
      }
      if (!keyQLongPressFired && !isEditableElement(event.target)) {
        stepCursor(1);
      }
      keyQLongPressFired = false;
    }
  });

  replayIntroBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (deviceEl?.hasAttribute("data-fullscreen")) return;
    closeLcdPanels({ returnFocus: false });
    if (viewMode === "lean-in") {
      setViewMode("toy", { manageFocus: false });
    }
    intro.play({ replay: true });
  });

  if (willPlayIntro) {
    intro.play();
  } else {
    document.documentElement.removeAttribute("data-poppet-intro");
    steady.onIntroSettled();
  }
}

function boot() {
  const player = document.querySelector("video-player");
  if (!player) return;

  const initialAppearance = applyPoppetConfig(player);
  configureMediaSource(player);
  setupPoppetInteractions(player, initialAppearance);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
