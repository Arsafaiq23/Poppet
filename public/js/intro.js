/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Poppet first-load "drop-in" intro (~1.8s).
 *
 * One requestAnimationFrame clock drives everything:
 *   - springs (vertical bounce + pendulum) via motion-rig.js
 *   - every WAAPI overlay track is created paused and *seeked* by the same clock,
 *     so the intro can be skipped (jump to end) or frozen (?poppet-intro-freeze=ms)
 *     deterministically.
 * Only `translate` / `rotate` / `scale` / `opacity` are written (no layout).
 */

import { createSpring, cubicBezier } from "./motion-rig.js";

export const INTRO_SEEN_KEY = "poppet-intro-seen";

// Timeline (ms) — ~1.4s total: Poppet logo pops in → egg falls & smashes logo → LCD boots & pet hatches
const T_FALL_START = 320;
const T_TAUT = 640;
const FALL_MS = T_TAUT - T_FALL_START;
const T_SMASH = 520;
const SQUASH_MS = 80;
const T_BOOT = 680;
const T_WIPE = 750;
const WIPE_MS = 200;
const T_ICONS = T_WIPE + WIPE_MS; // 950
const ICON_STAGGER = 30;
const T_CRACK = 1080;
const T_HATCH = 1200;
const T_HINT = 1320;
const GREET_MS = 1100;

const SHARD_VECTORS = [
  { x: -96, y: 46, r: -42, s: 0.72 },
  { x: -54, y: 74, r: -24, s: 0.78 },
  { x: -18, y: 92, r: 22, s: 0.68 },
  { x: 20, y: 94, r: -26, s: 0.68 },
  { x: 56, y: 72, r: 28, s: 0.78 },
  { x: 98, y: 44, r: 44, s: 0.72 },
];

// Physics (see scratch/spring_sim.py): k=180,c=12 → peaks 1, −0.20, +0.04
const VERT = { stiffness: 180, damping: 12 };
const VERT_PEAK_PER_VELOCITY = 0.0409; // first overshoot per unit of initial velocity
const CHAIN_STRETCH = 0.04; // chain scaleY 1.04 at the taut moment
const PEND = { stiffness: 80, damping: 7, kick: 91 }; // → +6°, −1.6°, +0.4°, settles ~1.2s

const FALL_EASE = cubicBezier(0.55, 0, 1, 0.45);

function readFreezeParam() {
  try {
    const raw = new URLSearchParams(window.location.search).get("poppet-intro-freeze");
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

export function hasSeenIntro() {
  try {
    return window.sessionStorage?.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    window.sessionStorage?.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    // ignore
  }
}

function clearGate() {
  document.documentElement.removeAttribute("data-poppet-intro");
}

/**
 * @param {object} o
 * @param {HTMLElement} o.player
 * @param {() => boolean} o.isMotionOff
 * @param {{clack?: () => void, blip?: () => void}} [o.sounds]
 * @param {(opts: {pulse: boolean}) => void} [o.revealOkHint]
 * @param {() => void} [o.onStart]
 * @param {(info: {skipped: boolean}) => void} [o.onSettled]
 */
export function createIntro({ player, isMotionOff, sounds = {}, revealOkHint, onStart, onSettled }) {
  const deviceEl = player.querySelector("[data-poppet-device]");
  const chainEl = player.querySelector(".poppet-ball-chain");
  const shadowEl = player.querySelector(".poppet-egg-shadow");
  const tiltStageEl = player.querySelector("[data-poppet-tilt-stage]");
  const sparkles = Array.from(player.querySelectorAll(".poppet-intro-sparkles > i"));
  const bootEl = player.querySelector("[data-poppet-lcd-boot]");
  const bootCover = bootEl?.querySelector(".poppet-lcd-boot-cover") || null;
  const scanline = bootEl?.querySelector(".poppet-lcd-scanline") || null;
  const iconBtns = Array.from(player.querySelectorAll(".poppet-lcd-icon-btn"));
  const petEl = player.querySelector("poppet-pet");
  const petSprite = player.querySelector("[data-poppet-pet-sprite]");
  const hatchEl = player.querySelector("[data-poppet-hatch]");
  const hatchTop = hatchEl?.querySelector(".poppet-hatch-top") || null;
  const hatchBottom = hatchEl?.querySelector(".poppet-hatch-bottom") || null;
  const hatchCrack = hatchEl?.querySelector(".poppet-hatch-crack") || null;
  const introLogoEl = player.querySelector("[data-poppet-intro-logo]");
  const introLogoWrap = player.querySelector("[data-poppet-intro-logo-wrap]");
  const introShards = Array.from(player.querySelectorAll(".poppet-intro-shard"));
  const introDebris = Array.from(player.querySelectorAll(".poppet-intro-debris > i"));
  const btnB = player.querySelector("[data-poppet-btn-b]");

  const freezeAt = readFreezeParam();

  let state = "idle"; // idle | running | done
  let raf = 0;
  let startAt = 0;
  let lastNow = 0;
  let tracks = [];
  let events = [];
  let vert = null;
  let pend = null;
  let y0 = 0;
  let chainH = 1;
  let lastTrackEnd = 0;
  let pulseTimer = null;
  let fadeAnim = null;

  /* ------------------------------ helpers ------------------------------ */

  function track(el, keyframes, start, duration, easing = "linear") {
    if (!el || typeof el.animate !== "function") return;
    const anim = el.animate(keyframes, { duration, easing, fill: "both" });
    anim.pause();
    anim.currentTime = 0;
    tracks.push({ anim, start, duration });
    lastTrackEnd = Math.max(lastTrackEnd, start + duration);
  }

  function at(time, fn) {
    events.push({ time, fn, fired: false });
  }

  function clearInline() {
    if (deviceEl) {
      deviceEl.style.translate = "";
      deviceEl.style.rotate = "";
    }
    if (chainEl) {
      chainEl.style.translate = "";
      chainEl.style.scale = "";
    }
    if (tiltStageEl) tiltStageEl.style.scale = "";
  }

  function addSkipListeners() {
    for (const type of ["pointerdown", "keydown", "wheel", "touchstart"]) {
      document.addEventListener(type, onUserInput, { capture: true, passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);
  }

  function removeSkipListeners() {
    for (const type of ["pointerdown", "keydown", "wheel", "touchstart"]) {
      document.removeEventListener(type, onUserInput, { capture: true });
    }
    document.removeEventListener("visibilitychange", onVisibility);
  }

  function onUserInput(event) {
    if (event.type === "keydown" && ["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
    // Skip to the final state; do NOT preventDefault so the input still does its job.
    skip();
  }

  function onVisibility() {
    if (document.hidden) skip();
  }

  /* ------------------------------ building ----------------------------- */

  function buildTracks() {
    tracks = [];
    events = [];
    lastTrackEnd = 0;

    // Intro Logo: pops in, then gets squashed and shattered when the egg lands on it
    if (introLogoEl) {
      introLogoEl.hidden = false;
      track(
        introLogoWrap,
        [
          { opacity: 0, scale: "0.72" },
          { opacity: 1, scale: "1.06", offset: 0.65 },
          { opacity: 1, scale: "1" },
        ],
        0,
        200,
        "ease-out"
      );
      track(
        introLogoWrap,
        [
          { scale: "1 1" },
          { scale: "1.26 0.56", offset: 0.65 },
          { scale: "1.18 0.62" },
        ],
        T_SMASH,
        55,
        "ease-in"
      );
      introShards.forEach((shardEl, i) => {
        const v = SHARD_VECTORS[i] || { x: 0, y: 80, r: 0, s: 0.7 };
        track(
          shardEl,
          [
            { opacity: 1, translate: "0 0", rotate: "0deg", scale: "1" },
            {
              opacity: 1,
              translate: `${(v.x * 0.45).toFixed(1)}px ${(v.y * 0.3).toFixed(1)}px`,
              rotate: `${(v.r * 0.5).toFixed(1)}deg`,
              scale: "0.9",
              offset: 0.42,
            },
            {
              opacity: 0,
              translate: `${v.x}px ${v.y}px`,
              rotate: `${v.r}deg`,
              scale: String(v.s),
            },
          ],
          T_SMASH + 35,
          320,
          "cubic-bezier(0.22, 0.8, 0.36, 1)"
        );
      });
      introDebris.forEach((el, i) => {
        const angle = (i / Math.max(1, introDebris.length)) * Math.PI * 2 + 0.25;
        const dist = 54 + (i % 3) * 26;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist * 0.75 + 16;
        track(
          el,
          [
            { opacity: 0, translate: "0 0", scale: "0.5" },
            {
              opacity: 1,
              translate: `${(dx * 0.45).toFixed(1)}px ${(dy * 0.45).toFixed(1)}px`,
              scale: "1.1",
              offset: 0.28,
            },
            { opacity: 0, translate: `${dx.toFixed(1)}px ${dy.toFixed(1)}px`, scale: "0.4" },
          ],
          T_SMASH + (i % 2) * 18,
          340,
          "steps(7, end)"
        );
      });
    }

    // Impact: shadow pop under the egg
    track(
      shadowEl,
      [
        { opacity: 0, scale: "0.6" },
        { opacity: 1, scale: "1.12", offset: 0.35 },
        { opacity: 1, scale: "1" },
      ],
      T_TAUT,
      300,
      "ease-out"
    );

    // Impact: 6–8 accent pixel sparkles bursting from the keyring loop
    const n = sparkles.length;
    sparkles.forEach((el, i) => {
      // Evenly around the loop, offset so none fire straight up the chain
      const a = (i / Math.max(1, n)) * Math.PI * 2 + Math.PI / 8;
      const dist = 22 + (i % 3) * 8;
      const dx = Math.cos(a) * dist;
      const dy = Math.sin(a) * dist * 0.75;
      track(
        el,
        [
          { opacity: 0, translate: "0 0", scale: "0.4" },
          { opacity: 1, translate: `${(dx * 0.55).toFixed(1)}px ${(dy * 0.55).toFixed(1)}px`, scale: "1", offset: 0.3 },
          { opacity: 0, translate: `${dx.toFixed(1)}px ${dy.toFixed(1)}px`, scale: "0.6" },
        ],
        T_TAUT + (i % 2) * 20,
        380,
        "steps(6, end)"
      );
    });

    // LCD boot: screen is "off" until T_BOOT, flickers on in 2 quick steps, then a scanline wipe
    if (bootEl) {
      bootEl.hidden = false;
      track(
        bootCover,
        [
          { opacity: 1, offset: 0 },
          { opacity: 1, offset: 0.24 },
          { opacity: 0.25, offset: 0.25 },
          { opacity: 0.25, offset: 0.49 },
          { opacity: 0.95, offset: 0.5 },
          { opacity: 0.95, offset: 0.74 },
          { opacity: 0.55, offset: 0.75 },
          { opacity: 0.55, offset: 1 },
        ],
        T_BOOT,
        T_WIPE - T_BOOT
      );
      // Wipe: cover collapses toward the bottom (top revealed first)
      track(bootCover, [{ transform: "scaleY(1)" }, { transform: "scaleY(0)" }], T_WIPE, WIPE_MS, "steps(12, end)");
      const h = bootEl.clientHeight || 200;
      track(
        scanline,
        [
          { opacity: 0, transform: "translateY(0px)", offset: 0 },
          { opacity: 1, transform: "translateY(0px)", offset: 0.01 },
          { opacity: 1, transform: `translateY(${h}px)`, offset: 0.99 },
          { opacity: 0, transform: `translateY(${h}px)`, offset: 1 },
        ],
        T_WIPE,
        WIPE_MS,
        "steps(12, end)"
      );
    }

    // Icons appear one by one (40ms stagger)
    iconBtns.forEach((btn, i) => {
      track(
        btn,
        [
          { opacity: 0, translate: "0 2px" },
          { opacity: 1, translate: "0 0" },
        ],
        T_ICONS + i * ICON_STAGGER,
        120,
        "steps(3, end)"
      );
    });

    // Pet hatch
    const hasPet = player.getAttribute("data-pet") !== "none";
    if (hatchEl && hasPet) {
      hatchEl.hidden = false;
      track(hatchEl, [{ opacity: 0 }, { opacity: 1 }], T_ICONS, 120, "steps(2, end)");
      track(
        hatchEl,
        [
          { rotate: "0deg" },
          { rotate: "-9deg", offset: 0.25 },
          { rotate: "8deg", offset: 0.6 },
          { rotate: "0deg" },
        ],
        T_CRACK,
        150,
        "steps(4, end)"
      );
      track(
        hatchCrack,
        [
          { opacity: 0, offset: 0 },
          { opacity: 1, offset: 0.2 },
          { opacity: 1, offset: 0.74 },
          { opacity: 0, offset: 0.75 },
          { opacity: 0, offset: 1 },
        ],
        T_CRACK,
        T_HATCH - T_CRACK + 50
      );
      track(
        hatchTop,
        [
          { opacity: 1, translate: "0 0", rotate: "0deg" },
          { opacity: 1, translate: "-3px -9px", rotate: "-28deg", offset: 0.6 },
          { opacity: 0, translate: "-5px -12px", rotate: "-40deg" },
        ],
        T_HATCH,
        280,
        "steps(7, end)"
      );
      track(
        hatchBottom,
        [
          { opacity: 1, translate: "0 0" },
          { opacity: 1, translate: "0 1px", offset: 0.5 },
          { opacity: 0, translate: "0 3px" },
        ],
        T_HATCH,
        280,
        "steps(7, end)"
      );
    }
    track(
      petSprite,
      [
        { opacity: 0, scale: "0.35" },
        { opacity: 1, scale: "1.15", offset: 0.6 },
        { opacity: 1, scale: "1" },
      ],
      T_HATCH,
      280,
      "steps(7, end)"
    );

    // Events
    at(T_TAUT, () => sounds.clack?.());
    at(T_HATCH, () => {
      if (!hasPet) return;
      sounds.blip?.();
      petEl?.triggerHop?.();
      petEl?.greet?.("hi!", GREET_MS);
    });
    at(T_HINT, () => {
      if (btnB) {
        btnB.setAttribute("data-b-pulse", "once");
        clearTimeout(pulseTimer);
        pulseTimer = setTimeout(() => btnB.removeAttribute("data-b-pulse"), 1250);
      }
      revealOkHint?.({ pulse: true });
    });
  }

  /* ------------------------------- clock ------------------------------- */

  function render(t, dt) {
    // Vertical: hold → gravity fall → spring
    let y;
    if (t < T_FALL_START) {
      y = y0;
    } else if (t < T_TAUT) {
      y = y0 * (1 - FALL_EASE.ease((t - T_FALL_START) / FALL_MS));
    } else {
      if (!vert) {
        const overshoot = CHAIN_STRETCH * chainH;
        vert = createSpring({ ...VERT, x: 0, v: overshoot / VERT_PEAK_PER_VELOCITY });
        pend = createSpring({ stiffness: PEND.stiffness, damping: PEND.damping, x: 0, v: PEND.kick });
        // Integrate the time already past the taut moment (frame granularity)
        const lag = (t - T_TAUT) / 1000;
        vert.step(lag);
        pend.step(lag);
      } else {
        vert.step(dt);
        pend.step(dt);
      }
      y = vert.x;
    }

    const rot = pend ? pend.x : 0;
    if (deviceEl) {
      deviceEl.style.translate = `0 ${y.toFixed(2)}px`;
      deviceEl.style.rotate = `${rot.toFixed(3)}deg`;
    }

    // Chain falls attached to the egg (no cut-off floating chain), then stretches when taut
    if (chainEl) {
      const stretch = t >= T_TAUT ? Math.max(1, (chainH + y) / chainH) : 1;
      chainEl.style.translate = "";
      chainEl.style.scale = `1 ${stretch.toFixed(4)}`;
    }

    // Squash & stretch on impact
    if (tiltStageEl) {
      if (t >= T_TAUT && t < T_TAUT + SQUASH_MS) {
        const w = Math.sin(((t - T_TAUT) / SQUASH_MS) * Math.PI);
        tiltStageEl.style.scale = `${(1 + 0.03 * w).toFixed(4)} ${(1 - 0.04 * w).toFixed(4)}`;
      } else {
        tiltStageEl.style.scale = "";
      }
    }

    for (const tr of tracks) {
      tr.anim.currentTime = Math.min(tr.duration, Math.max(0, t - tr.start));
    }
    for (const ev of events) {
      if (!ev.fired && t >= ev.time) {
        ev.fired = true;
        try {
          ev.fn();
        } catch {
          // never let an effect break the intro
        }
      }
    }
  }

  function frame(now) {
    raf = 0;
    if (state !== "running") return;
    let t = now - startAt;
    const dt = Math.max(0, (now - lastNow) / 1000);
    lastNow = now;
    if (freezeAt !== null && t >= freezeAt) {
      t = freezeAt;
      render(t, dt);
      player.setAttribute("data-intro-frozen", String(freezeAt));
      return; // hold this frame for capture
    }
    render(t, dt);

    const settled =
      t >= lastTrackEnd &&
      t >= T_HINT &&
      vert &&
      pend &&
      vert.atRest(0.3) &&
      pend.atRest(0.15);
    if (settled) {
      finish({ skipped: false });
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  /* ------------------------------ lifecycle ---------------------------- */

  function finish({ skipped }) {
    if (state !== "running") return;
    state = "done";
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    removeSkipListeners();

    if (skipped) {
      // Fire nothing noisy; just land the final state.
      for (const ev of events) ev.fired = true;
    }
    for (const tr of tracks) tr.anim.cancel();
    tracks = [];
    clearInline();
    if (bootEl) bootEl.hidden = true;
    if (hatchEl) hatchEl.hidden = true;
    if (introLogoEl) introLogoEl.hidden = true;
    player.removeAttribute("data-intro");
    player.removeAttribute("data-intro-frozen");
    clearGate();
    if (skipped) revealOkHint?.({ pulse: false });
    onSettled?.({ skipped });
  }

  function playFade() {
    clearGate();
    state = "done";
    if (deviceEl && typeof deviceEl.animate === "function") {
      fadeAnim?.cancel();
      fadeAnim = deviceEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: "ease-out" });
    }
    revealOkHint?.({ pulse: false });
    onSettled?.({ skipped: false });
  }

  function play({ replay = false } = {}) {
    if (state === "running") return;
    markSeen();
    onStart?.();

    if (isMotionOff()) {
      playFade();
      return;
    }
    if (!deviceEl) {
      clearGate();
      onSettled?.({ skipped: true });
      return;
    }

    state = "running";
    vert = null;
    pend = null;
    player.setAttribute("data-intro", "running");

    // Measure the resting layout (subtract the gate's / any inline translate).
    const cs = getComputedStyle(deviceEl);
    const parts = (cs.translate && cs.translate !== "none" ? cs.translate : "0px 0px").split(" ");
    const currentTy = parseFloat(parts[1] || "0") || 0;
    const rect = deviceEl.getBoundingClientRect();
    const layoutBottom = rect.bottom - currentTy;
    y0 = -(Math.max(layoutBottom, 0) + 24);
    chainH = chainEl?.offsetHeight || window.innerHeight || 800;

    // Hold the egg above the viewport *before* the gate is lifted → no flash.
    deviceEl.style.translate = `0 ${y0.toFixed(1)}px`;
    deviceEl.style.rotate = "0deg";
    clearGate();

    buildTracks();
    render(0, 0);
    addSkipListeners();

    startAt = performance.now();
    lastNow = startAt;
    raf = requestAnimationFrame(frame);
    if (replay) player.setAttribute("data-intro-replay", "");
    else player.removeAttribute("data-intro-replay");
  }

  function skip() {
    if (state === "running") finish({ skipped: true });
  }

  return {
    play,
    skip,
    isRunning: () => state === "running",
  };
}
