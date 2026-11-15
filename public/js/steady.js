/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Poppet "Steady" toggle — hold the toy still.
 *
 *   forced = motionOff || lean-in || fullscreen
 *   pref   = localStorage["poppet-steady"]  ("1" | "0" | null)
 *   auto   = playing && ≥3s since the intro settled
 *   steady = forced || (pref !== null ? pref === "1" : auto)
 */

import { readCurrentRotation, settleRotation } from "./motion-rig.js";

export const STEADY_STORAGE_KEY = "poppet-steady";
const AUTO_STEADY_DELAY_MS = 3000;

function readPref() {
  try {
    const v = window.localStorage?.getItem(STEADY_STORAGE_KEY);
    return v === "1" || v === "0" ? v : null;
  } catch {
    return null;
  }
}

function writePref(v) {
  try {
    window.localStorage?.setItem(STEADY_STORAGE_KEY, v);
  } catch {
    // ignore
  }
}

/**
 * @param {object} o
 * @param {HTMLElement} o.player
 * @param {() => boolean} o.isMotionOff
 * @param {() => string} o.getViewMode
 * @param {() => boolean} o.isFullscreen
 * @param {() => boolean} o.isPlaying
 * @param {() => boolean} o.isIntroRunning
 * @param {() => any} o.getEggController
 * @param {(msg: string) => void} [o.announce]
 */
export function createSteady({
  player,
  isMotionOff,
  getViewMode,
  isFullscreen,
  isPlaying,
  isIntroRunning,
  getEggController,
  onBeforeLock,
  announce,
}) {
  const deviceEl = player.querySelector("[data-poppet-device]");
  const tiltStageEl = player.querySelector("[data-poppet-tilt-stage]");
  const pinBtn = player.querySelector("[data-poppet-steady-pin]");

  let pref = readPref();
  let applied = false;
  let introSettledAt = null;
  let autoTimer = null;
  let cancelSettle = () => {};

  function isForced() {
    return isMotionOff() || getViewMode() === "lean-in" || isFullscreen();
  }

  function compute() {
    if (isForced()) return true;
    if (pref !== null) return pref === "1";
    if (introSettledAt === null) return false;
    const elapsed = performance.now() - introSettledAt;
    return isPlaying() && elapsed >= AUTO_STEADY_DELAY_MS;
  }

  function syncPin(steady) {
    if (!pinBtn) return;
    pinBtn.hidden = isMotionOff();
    pinBtn.setAttribute("aria-pressed", steady ? "true" : "false");
    pinBtn.setAttribute("data-tip", steady ? "Let it swing" : "Hold steady");
  }

  function resetTilt() {
    if (tiltStageEl) {
      tiltStageEl.style.setProperty("--egg-tilt-x", "0deg");
      tiltStageEl.style.setProperty("--egg-tilt-y", "0deg");
    }
    getEggController()?.setTilt?.(0, 0);
  }

  function apply(steady) {
    syncPin(steady);
    if (!deviceEl || isIntroRunning()) return;
    if (steady === applied) return;
    applied = steady;
    cancelSettle();
    cancelSettle = () => {};

    if (steady) {
      // Read the live sway angle *before* stopping the keyframes, then spring it to 0.
      // Lean-in / fullscreen / motion-off snap instantly; user + auto steady spring in ~300ms.
      const instant = isForced();
      const handoff = onBeforeLock?.();
      const from = instant ? 0 : (Number.isFinite(handoff) ? handoff : readCurrentRotation(deviceEl));
      deviceEl.setAttribute("data-steady", "");
      resetTilt();
      if (instant || Math.abs(from) < 0.01) {
        deviceEl.style.rotate = "";
      } else {
        cancelSettle = settleRotation(deviceEl, {
          from,
          onDone: () => {
            deviceEl.style.rotate = "";
          },
        });
      }
    } else {
      deviceEl.style.rotate = "";
      // Sway keyframes start at 0° → resumes seamlessly from the steady pose.
      deviceEl.removeAttribute("data-steady");
    }
  }

  function refresh() {
    apply(compute());
  }

  function scheduleAuto() {
    clearTimeout(autoTimer);
    if (introSettledAt === null) return;
    const remaining = AUTO_STEADY_DELAY_MS - (performance.now() - introSettledAt);
    if (remaining > 0) {
      autoTimer = setTimeout(() => {
        autoTimer = null;
        refresh();
      }, remaining + 16);
    }
  }

  function toggle() {
    if (isMotionOff() || getViewMode() === "lean-in" || isFullscreen()) return;
    const next = !compute();
    pref = next ? "1" : "0";
    writePref(pref);
    refresh();
    announce?.(next ? "Holding steady." : "Swinging.");
  }

  /** Called when the intro (re)starts: release the device to the intro rig. */
  function suspend() {
    cancelSettle();
    cancelSettle = () => {};
    applied = false;
    if (deviceEl) {
      deviceEl.removeAttribute("data-steady");
      deviceEl.style.rotate = "";
    }
    clearTimeout(autoTimer);
  }

  function onIntroSettled() {
    introSettledAt = performance.now();
    scheduleAuto();
    refresh();
  }

  pinBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggle();
  });

  syncPin(compute());

  return {
    toggle,
    refresh,
    suspend,
    onIntroSettled,
    isSteady: () => applied || compute(),
  };
}
