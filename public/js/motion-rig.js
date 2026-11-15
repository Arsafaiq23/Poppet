/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Poppet motion rig: a tiny spring integrator + helpers.
 * No physics library. Writes only compositor-friendly properties
 * (individual `translate` / `rotate` / `scale`), never layout.
 */

const SUBSTEP = 1 / 240;
const MAX_DT = 1 / 30;

/** Damped spring (unit mass). Semi-implicit Euler with fixed substeps → stable at 30–144Hz. */
export function createSpring({ stiffness, damping, x = 0, v = 0 }) {
  return {
    stiffness,
    damping,
    x,
    v,
    step(dt) {
      let remaining = Math.min(MAX_DT, Math.max(0, dt));
      while (remaining > 0) {
        const h = Math.min(remaining, SUBSTEP);
        this.v += (-this.stiffness * this.x - this.damping * this.v) * h;
        this.x += this.v * h;
        remaining -= h;
      }
      return this.x;
    },
    atRest(eps) {
      return Math.abs(this.x) < eps && Math.abs(this.v) < eps * 4;
    },
  };
}

/**
 * CSS-style cubic-bezier easing. Returns { ease(p), slope(p) } where slope is
 * d(progress_out)/d(progress_in), used to hand off velocity to the spring.
 */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dsx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  const dsy = (t) => (3 * ay * t + 2 * by) * t + cy;

  function solveT(p) {
    let t = p;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - p;
      if (Math.abs(err) < 1e-6) return t;
      const d = dsx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    // Bisection fallback
    let lo = 0;
    let hi = 1;
    t = p;
    for (let i = 0; i < 24; i++) {
      const x = sx(t);
      if (Math.abs(x - p) < 1e-6) break;
      if (x < p) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  }

  return {
    ease(p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      return sy(solveT(p));
    },
    slope(p) {
      const t = solveT(Math.min(1, Math.max(0, p)));
      const d = dsx(t);
      return Math.abs(d) < 1e-6 ? 0 : dsy(t) / d;
    },
  };
}

/** Current 2D rotation (deg) of an element, including running CSS animations. One style read. */
export function readCurrentRotation(el) {
  if (!el) return 0;
  const cs = getComputedStyle(el);
  let deg = 0;
  const t = cs.transform;
  if (t && t !== "none") {
    const m = t.match(/matrix\(([^)]+)\)/);
    if (m) {
      const [a, b] = m[1].split(",").map(Number);
      deg += (Math.atan2(b, a) * 180) / Math.PI;
    }
  }
  const r = cs.rotate;
  if (r && r !== "none") {
    const n = parseFloat(r);
    if (Number.isFinite(n)) deg += n;
  }
  return deg;
}

/**
 * Spring an element's inline `rotate` from `from` degrees to 0.
 * Defaults are critically damped (k=600, c≈49) → settles in ~300ms.
 * Returns a cancel function.
 */
export function settleRotation(el, { from = 0, stiffness = 600, damping = 49, onDone } = {}) {
  if (!el) return () => {};
  const spring = createSpring({ stiffness, damping, x: from });
  let raf = 0;
  let last = performance.now();
  const frame = (now) => {
    spring.step((now - last) / 1000);
    last = now;
    if (spring.atRest(0.02)) {
      el.style.rotate = "0deg";
      raf = 0;
      onDone?.();
      return;
    }
    el.style.rotate = `${spring.x.toFixed(3)}deg`;
    raf = requestAnimationFrame(frame);
  };
  el.style.rotate = `${from.toFixed(3)}deg`;
  raf = requestAnimationFrame(frame);
  return () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
}

const INTERACTIVE_SELECTOR =
  "button, a, input, select, textarea, [role='button'], [role='slider'], .poppet-lcd-bezel, .poppet-abc-row, .poppet-ok-hint, .poppet-steady-pin, .poppet-lcd-panel, .poppet-customize-popover";

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Interactive 2D pendulum + vertical chain spring for the egg toy.
 * Active only when unlocked (not steady, not lean-in, not fullscreen, not reduced motion).
 */
export function createPhysicsRig({
  deviceEl,
  chainEl,
  tiltStageEl,
  isLocked,
  isBlocked,
  getEggController,
}) {
  if (!deviceEl) {
    return { stopAndHandOff: () => 0, isActive: () => false };
  }

  // Pendulum (deg) and vertical chain bounce (px)
  const ang = createSpring({ stiffness: 52, damping: 4.2, x: 0, v: 0 });
  const vert = createSpring({ stiffness: 180, damping: 12, x: 0, v: 0 });

  let raf = 0;
  let lastNow = 0;
  let active = false;
  let dragging = false;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let lastSampleTime = 0;
  let velX = 0;
  let velY = 0;
  let maxMoveSq = 0;
  let squashUntil = 0;

  function applyPose() {
    const chainH = chainEl?.offsetHeight || window.innerHeight || 800;
    const stretch = Math.max(1, (chainH + vert.x) / chainH);
    deviceEl.style.rotate = `${ang.x.toFixed(3)}deg`;
    deviceEl.style.translate = `0 ${vert.x.toFixed(2)}px`;
    if (chainEl) {
      chainEl.style.scale = `1 ${stretch.toFixed(4)}`;
    }
    if (tiltStageEl && squashUntil > performance.now()) {
      const rem = (squashUntil - performance.now()) / 120;
      const w = Math.sin(clamp(rem, 0, 1) * Math.PI);
      tiltStageEl.style.scale = `${(1 + 0.03 * w).toFixed(4)} ${(1 - 0.035 * w).toFixed(4)}`;
    } else if (tiltStageEl && squashUntil) {
      squashUntil = 0;
      tiltStageEl.style.scale = "";
    }
  }

  function clearPose() {
    active = false;
    deviceEl.removeAttribute("data-physics-active");
    deviceEl.removeAttribute("data-dragging");
    deviceEl.style.rotate = "";
    deviceEl.style.translate = "";
    if (chainEl) chainEl.style.scale = "";
    if (tiltStageEl) tiltStageEl.style.scale = "";
  }

  function wake() {
    if (!active) {
      ang.x = readCurrentRotation(deviceEl);
      active = true;
      deviceEl.setAttribute("data-physics-active", "");
    }
    if (!raf) {
      lastNow = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  function tick(now) {
    raf = 0;
    if (isBlocked() || isLocked()) {
      if (dragging) {
        dragging = false;
        pointerId = null;
        deviceEl.removeAttribute("data-dragging");
      }
      clearPose();
      return;
    }

    const dt = Math.min(MAX_DT, Math.max(0.001, (now - lastNow) / 1000));
    lastNow = now;

    if (!dragging) {
      ang.step(dt);
      vert.step(dt);
      // Soft clamp to keep egg comfortably inside viewport
      if (ang.x > 42) {
        ang.x = 42;
        if (ang.v > 0) ang.v *= -0.4;
      } else if (ang.x < -42) {
        ang.x = -42;
        if (ang.v < 0) ang.v *= -0.4;
      }
      if (vert.x > 48) {
        vert.x = 48;
        if (vert.v > 0) vert.v *= -0.4;
      } else if (vert.x < -36) {
        vert.x = -36;
        if (vert.v < 0) vert.v *= -0.4;
      }
    }

    applyPose();

    const settled =
      !dragging &&
      squashUntil <= now &&
      ang.atRest(0.08) &&
      vert.atRest(0.25);

    if (settled) {
      ang.x = 0;
      ang.v = 0;
      vert.x = 0;
      vert.v = 0;
      clearPose();
      return;
    }

    raf = requestAnimationFrame(tick);
  }

  deviceEl.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || isBlocked() || isLocked()) return;
    if (event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR)) return;

    dragging = true;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    lastX = event.clientX;
    lastY = event.clientY;
    lastSampleTime = performance.now();
    velX = 0;
    velY = 0;
    maxMoveSq = 0;
    deviceEl.setAttribute("data-dragging", "");
    try {
      deviceEl.setPointerCapture(pointerId);
    } catch {
      // ignore
    }
    wake();
  });

  deviceEl.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== pointerId || isBlocked() || isLocked()) return;
    const now = performance.now();

    const dt = Math.max(0.004, (now - lastSampleTime) / 1000);
    const instVx = (event.clientX - lastX) / dt;
    const instVy = (event.clientY - lastY) / dt;
    velX = velX * 0.55 + instVx * 0.45;
    velY = velY * 0.55 + instVy * 0.45;
    lastX = event.clientX;
    lastY = event.clientY;
    lastSampleTime = now;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    maxMoveSq = Math.max(maxMoveSq, dx * dx + dy * dy);

    const pivotDist = Math.max(220, window.innerHeight * 0.45);
    // Dragging right tilts counter-clockwise around top anchor; negative sign matches natural pendulum pull
    const targetDeg = clamp((-Math.atan2(dx, pivotDist) * 180) / Math.PI * 1.45, -36, 36);
    const targetY = dy >= 0 ? clamp(dy * 0.28, 0, 28) : clamp(dy * 0.14, -14, 0);

    ang.x = targetDeg;
    ang.v = 0;
    vert.x = targetY;
    vert.v = 0;
  });

  function releaseDrag(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    dragging = false;
    deviceEl.removeAttribute("data-dragging");
    try {
      deviceEl.releasePointerCapture(pointerId);
    } catch {
      // ignore
    }
    pointerId = null;

    if (maxMoveSq < 36) {
      // Quick click/tap on the shell → playful nudge + squash/boop
      const rect = deviceEl.getBoundingClientRect();
      const side = event.clientX < rect.left + rect.width / 2 ? 1 : -1;
      ang.v = clamp(ang.v + side * 68, -320, 320);
      vert.v = clamp(vert.v + 130, -320, 320);
      squashUntil = performance.now() + 120;
      getEggController()?.boop?.();
    } else {
      // Flick / throw release velocity
      const pivotDist = Math.max(220, window.innerHeight * 0.45);
      const throwDegPerSec = ((-velX / pivotDist) * 180) / Math.PI * 1.35;
      ang.v = clamp(throwDegPerSec, -420, 420);
      vert.v = clamp(velY * 0.45, -420, 420);
      if (Math.abs(velX) > 400 || Math.abs(velY) > 400) {
        squashUntil = performance.now() + 120;
        getEggController()?.boop?.();
      }
    }
    wake();
  }

  deviceEl.addEventListener("pointerup", releaseDrag);
  deviceEl.addEventListener("pointercancel", releaseDrag);

  return {
    isActive: () => active || dragging,
    stopAndHandOff() {
      const currentDeg = active ? ang.x : readCurrentRotation(deviceEl);
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      dragging = false;
      pointerId = null;
      ang.x = 0;
      ang.v = 0;
      vert.x = 0;
      vert.v = 0;
      squashUntil = 0;
      clearPose();
      return currentDeg;
    },
  };
}
