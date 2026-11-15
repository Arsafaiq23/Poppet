import { PETS } from "./poppet.config.js";

export const PET_FRAMES = {
  "walk-a": 0,
  "walk-b": 1,
  "sleep-a": 2,
  "sleep-b": 3,
  cheer: 4,
  sad: 5,
  "ears-covered": 6,
  nom: 7,
};

const NOM_MS = 700;
const WALK_MS = 180;
const IDLE_BLINK_INTERVAL_MS = 4000;
const IDLE_BLINK_HOLD_MS = 260;

export function formatAriaTime(rawSeconds) {
  if (!Number.isFinite(rawSeconds) || rawSeconds < 0) return "0:00";
  const total = Math.floor(rawSeconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export class PoppetPetElement extends HTMLElement {
  #player = null;
  #device = null;
  #container = null;
  #strip = null;
  #slider = null;
  #actor = null;
  #sprite = null;
  #pip = null;
  #hearts = null;
  #shrugMark = null;
  #liveRegion = null;
  #moodBubble = null;
  #moodText = null;
  #unsubscribe = null;
  #walkTimer = null;
  #blinkInterval = null;
  #blinkTimeout = null;
  #nomTimer = null;
  #pipTimer = null;
  #hopTimer = null;
  #lookTimer = null;
  #shrugTimer = null;
  #reducedMotionQuery = null;
  #onMotionChange = null;
  #abortController = null;

  #petId = "pip";
  #motionSetting = "system";
  #step = 0;
  #isBlinking = false;
  #isSeeking = false;
  #isBuffering = false;
  #isNomming = false;
  #isHopping = false;
  #isShrugging = false;
  #optimisticTime = null;
  #currentPose = "sleep-a";
  #lastState = {
    paused: true,
    ended: false,
    muted: false,
    volume: 1,
    currentTime: 0,
    duration: 0,
    waiting: false,
  };

  connectedCallback() {
    this.#abortController = new AbortController();
    const { signal } = this.#abortController;

    this.#player = this.closest("video-player");
    this.#device = this.#player?.querySelector("[data-poppet-device]") || this.#player;
    this.#container = this.#player?.querySelector("media-container") || null;
    this.#strip = this.#player?.querySelector("[data-poppet-pet-strip]") || null;
    this.#slider = this.#player?.querySelector("[data-poppet-pet-slider]") || null;
    this.#actor = this.#player?.querySelector("[data-poppet-pet-actor]") || null;
    this.#sprite = this.#player?.querySelector("[data-poppet-pet-sprite]") || null;
    this.#pip = this.#player?.querySelector("[data-poppet-pip]") || null;
    this.#hearts = this.#player?.querySelector("[data-poppet-hearts]") || null;
    this.#shrugMark = this.#player?.querySelector("[data-poppet-shrug-mark]") || null;
    this.#liveRegion = this.#player?.querySelector("[data-poppet-live]") || null;
    this.#moodBubble = this.#player?.querySelector("[data-poppet-mood-bubble]") || null;
    this.#moodText = this.#player?.querySelector("[data-poppet-mood-text]") || null;

    this.#petId = this.#player?.getAttribute("data-pet") || "pip";
    this.#motionSetting = this.#player?.getAttribute("data-motion") || "system";

    this.#reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.#onMotionChange = () => this.#syncState();
    this.#reducedMotionQuery.addEventListener("change", this.#onMotionChange, { signal });

    const mediaEl = this.#player?.querySelector("mux-video, video, audio");
    if (mediaEl) {
      const setBuffering = (flag) => {
        if (this.#isBuffering !== flag) {
          this.#isBuffering = flag;
          this.#syncState();
        }
      };
      mediaEl.addEventListener("waiting", () => setBuffering(true), { signal });
      mediaEl.addEventListener(
        "stalled",
        () => {
          if (!mediaEl.paused && !mediaEl.ended) {
            setBuffering(true);
          }
        },
        { signal }
      );
      mediaEl.addEventListener("playing", () => setBuffering(false), { signal });
      mediaEl.addEventListener("canplay", () => setBuffering(false), { signal });
      mediaEl.addEventListener("pause", () => setBuffering(false), { signal });
      mediaEl.addEventListener("ended", () => setBuffering(false), { signal });
      mediaEl.addEventListener("seeked", () => setBuffering(false), { signal });
      mediaEl.addEventListener(
        "loadedmetadata",
        () => {
          if (Number.isFinite(mediaEl.duration) && mediaEl.duration > 0) {
            this.#lastState.duration = mediaEl.duration;
            this.#syncState();
          }
        },
        { signal }
      );
      mediaEl.addEventListener(
        "timeupdate",
        () => {
          if (Number.isFinite(mediaEl.currentTime)) {
            this.#lastState.currentTime = mediaEl.currentTime;
          }
          if (Number.isFinite(mediaEl.duration) && mediaEl.duration > 0) {
            this.#lastState.duration = mediaEl.duration;
          }
          this.#syncProgressBar();
        },
        { signal }
      );
    }

    this.#bindStore();
    this.#syncState();
  }

  disconnectedCallback() {
    this.#stopWalkTimer();
    this.#stopBlinkTimer();
    this.#clearNomTimer();
    if (this.#pipTimer) clearTimeout(this.#pipTimer);
    if (this.#hopTimer) clearTimeout(this.#hopTimer);
    if (this.#lookTimer) clearTimeout(this.#lookTimer);
    if (this.#shrugTimer) clearTimeout(this.#shrugTimer);
    this.#pipTimer = null;
    this.#hopTimer = null;
    this.#lookTimer = null;
    this.#shrugTimer = null;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#abortController?.abort();
    this.#abortController = null;
  }

  refreshConfig() {
    this.#petId = this.#player?.getAttribute("data-pet") || "pip";
    this.#motionSetting = this.#player?.getAttribute("data-motion") || "system";
    this.#syncState();
  }

  setSeeking(flag) {
    const next = Boolean(flag);
    if (this.#isSeeking !== next) {
      this.#isSeeking = next;
      this.#syncState();
    }
  }

  isReducedMotion() {
    if (this.#reducedMotionQuery?.matches) return true;
    return this.#motionSetting === "reduced";
  }

  #bindStore() {
    const store = this.#player?.store;
    if (!store) {
      queueMicrotask(() => {
        if (this.isConnected && !this.#unsubscribe) {
          this.#bindStore();
        }
      });
      return;
    }

    const readFromStore = () => {
      const s = store.state || {};
      const mediaEl = this.#player?.querySelector("mux-video, video, audio");
      const dur =
        typeof s.duration === "number" && Number.isFinite(s.duration) && s.duration > 0
          ? s.duration
          : typeof mediaEl?.duration === "number" && Number.isFinite(mediaEl.duration) && mediaEl.duration > 0
          ? mediaEl.duration
          : 0;
      const rawCur =
        typeof s.currentTime === "number" && Number.isFinite(s.currentTime)
          ? s.currentTime
          : typeof mediaEl?.currentTime === "number" && Number.isFinite(mediaEl.currentTime)
          ? mediaEl.currentTime
          : 0;
      const cur =
        this.#optimisticTime !== null && Math.abs(rawCur - this.#optimisticTime) > 0.5
          ? this.#optimisticTime
          : rawCur;
      if (this.#optimisticTime !== null && Math.abs(rawCur - this.#optimisticTime) <= 0.5) {
        this.#optimisticTime = null;
      }

      this.#lastState = {
        paused: Boolean(s.paused ?? true),
        ended: Boolean(s.ended ?? false),
        muted: Boolean(s.muted || s.volume === 0),
        volume: typeof s.volume === "number" ? s.volume : 1,
        currentTime: cur,
        duration: dur,
        waiting: Boolean(s.waiting ?? false),
      };
      if (typeof s.waiting === "boolean") {
        this.#isBuffering = s.waiting;
      }
      this.#syncState();
    };

    readFromStore();
    this.#unsubscribe = store.subscribe(readFromStore);
  }

  feed() {
    const store = this.#player?.store;
    const mediaEl = this.#player?.querySelector("mux-video, video, audio");
    const state = store?.state;

    const currentTime =
      this.#optimisticTime !== null
        ? this.#optimisticTime
        : typeof state?.currentTime === "number"
        ? state.currentTime
        : mediaEl?.currentTime || 0;
    const duration =
      typeof state?.duration === "number" && Number.isFinite(state.duration) && state.duration > 0
        ? state.duration
        : Number.isFinite(mediaEl?.duration) && mediaEl.duration > 0
        ? mediaEl.duration
        : 0;

    const targetTime =
      duration > 0 ? Math.min(currentTime + 10, duration) : currentTime + 10;

    this.setOptimisticTime(targetTime);
    if (typeof state?.seek === "function") {
      state.seek(targetTime);
    } else if (mediaEl) {
      mediaEl.currentTime = targetTime;
    }

    const pet = PETS[this.#petId] || PETS.pip;
    const isNone = this.#petId === "none";
    const reduced = this.isReducedMotion();

    this.#clearNomTimer();
    if (!isNone) {
      this.#isNomming = true;
      this.#container?.setAttribute("data-pet-nom", "");
      this.#strip?.setAttribute("data-pet-nom", "");
      if (this.#hearts) {
        this.#hearts.hidden = false;
        this.#hearts.removeAttribute("data-active");
        void this.#hearts.offsetWidth;
        this.#hearts.setAttribute("data-active", "");
      }
      this.#nomTimer = setTimeout(() => {
        this.#isNomming = false;
        this.#nomTimer = null;
        this.#container?.removeAttribute("data-pet-nom");
        this.#strip?.removeAttribute("data-pet-nom");
        if (this.#hearts) {
          this.#hearts.removeAttribute("data-active");
          this.#hearts.hidden = true;
        }
        this.#syncState();
      }, reduced ? 450 : NOM_MS);
    }

    this.#showFeedPip();
    this.#announce(
      isNone ? "Skipped 10 seconds." : `Fed ${pet.name}, skipped 10 seconds.`
    );
    this.#syncState();
  }

  setOptimisticTime(seconds) {
    if (typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0) {
      this.#optimisticTime = seconds;
      this.#lastState.currentTime = seconds;
      this.#syncProgressBar();
    }
  }

  triggerHop() {
    if (this.#petId === "none") return;
    if (this.#hopTimer) {
      clearTimeout(this.#hopTimer);
      this.#hopTimer = null;
    }
    if (this.isReducedMotion()) {
      this.#isHopping = true;
      this.#renderPose();
      this.#hopTimer = setTimeout(() => {
        this.#isHopping = false;
        this.#hopTimer = null;
        this.#renderPose();
      }, 260);
      return;
    }
    this.#isHopping = true;
    this.#device?.removeAttribute("data-pet-hop");
    this.#strip?.removeAttribute("data-pet-hop");
    this.#actor?.removeAttribute("data-pet-hop");
    void this.#actor?.offsetWidth;
    this.#device?.setAttribute("data-pet-hop", "");
    this.#strip?.setAttribute("data-pet-hop", "");
    this.#actor?.setAttribute("data-pet-hop", "");
    this.#renderPose();
    this.#hopTimer = setTimeout(() => {
      this.#isHopping = false;
      this.#device?.removeAttribute("data-pet-hop");
      this.#strip?.removeAttribute("data-pet-hop");
      this.#actor?.removeAttribute("data-pet-hop");
      this.#hopTimer = null;
      this.#renderPose();
    }, 380);
  }

  /**
   * Button A reaction: the pet turns/glances toward the selected icon (0..3 top row, 4..7 bottom row).
   */
  triggerLook(iconIndex = 2) {
    if (this.#petId === "none" || !this.#actor) return;
    if (this.#lookTimer) {
      clearTimeout(this.#lookTimer);
      this.#lookTimer = null;
    }
    const row = iconIndex < 4 ? "up" : "down";
    const col = iconIndex % 4;
    const horiz = col <= 1 ? "left" : "right";
    const lookToken = `${row}-${horiz}`;

    this.#strip?.setAttribute("data-pet-look", lookToken);
    this.#strip?.setAttribute("data-look-dir", horiz);
    this.#actor.setAttribute("data-pet-look", lookToken);
    this.#actor.setAttribute("data-look-dir", horiz);
    this.#lookTimer = setTimeout(() => {
      this.#strip?.removeAttribute("data-pet-look");
      this.#strip?.removeAttribute("data-look-dir");
      this.#actor?.removeAttribute("data-pet-look");
      this.#actor?.removeAttribute("data-look-dir");
      this.#lookTimer = null;
    }, 650);
  }

  /**
   * Button C reaction: the pet shrugs briefly with a pixel '?' mark.
   */
  triggerShrug() {
    if (this.#petId === "none" || !this.#actor) return;
    if (this.#shrugTimer) {
      clearTimeout(this.#shrugTimer);
      this.#shrugTimer = null;
    }
    this.#isShrugging = true;
    this.#strip?.removeAttribute("data-pet-shrug");
    this.#actor.removeAttribute("data-pet-shrug");
    void this.#actor.offsetWidth;
    this.#strip?.setAttribute("data-pet-shrug", "");
    this.#actor.setAttribute("data-pet-shrug", "");
    if (this.#shrugMark) {
      this.#shrugMark.hidden = false;
    }
    this.#renderPose();
    this.#shrugTimer = setTimeout(() => {
      this.#isShrugging = false;
      this.#strip?.removeAttribute("data-pet-shrug");
      this.#actor?.removeAttribute("data-pet-shrug");
      if (this.#shrugMark) {
        this.#shrugMark.hidden = true;
      }
      this.#shrugTimer = null;
      this.#renderPose();
    }, 480);
  }

  #showFeedPip() {
    if (!this.#pip) return;
    if (this.#pipTimer) {
      clearTimeout(this.#pipTimer);
      this.#pipTimer = null;
    }
    this.#pip.hidden = false;
    this.#pip.removeAttribute("data-active");
    void this.#pip.offsetWidth;
    this.#pip.setAttribute("data-active", "");
    this.#pipTimer = setTimeout(() => {
      if (this.#pip) {
        this.#pip.removeAttribute("data-active");
        this.#pip.hidden = true;
      }
      this.#pipTimer = null;
    }, this.isReducedMotion() ? 450 : NOM_MS);
  }

  #announce(message) {
    if (!this.#liveRegion) return;
    this.#liveRegion.textContent = "";
    requestAnimationFrame(() => {
      if (this.#liveRegion) {
        this.#liveRegion.textContent = message;
      }
    });
  }

  #resolvePlaybackState() {
    const { paused, ended } = this.#lastState;
    if (ended) return "ended";
    if (this.#isBuffering && !paused) return "buffering";
    if (paused) return "paused";
    return "playing";
  }

  #resolveContainerState() {
    const { paused, ended, muted } = this.#lastState;
    if (this.#isSeeking) return "seeking";
    if (ended) return "ended";
    if (this.#isBuffering && !paused) return "buffering";
    if (muted) return "muted";
    if (paused) return "paused";
    return "playing";
  }

  #resolvePose(containerState) {
    const isNone = this.#petId === "none";
    if (this.#isNomming && !isNone) return "nom";
    if (this.#isHopping && !isNone) return "cheer";
    if (this.#isShrugging && !isNone) return "sad";

    switch (containerState) {
      case "seeking":
        return "walk-a";
      case "ended":
        return "cheer";
      case "buffering":
        return "sad";
      case "muted":
        return "ears-covered";
      case "paused":
        if (this.isReducedMotion()) return "sleep-a";
        return this.#isBlinking ? "sleep-b" : "sleep-a";
      case "playing":
      default:
        return this.isReducedMotion() || this.#step % 2 === 0
          ? "walk-a"
          : "walk-b";
    }
  }

  #resolveMoodLabel(playbackState) {
    if (this.#isNomming && this.#petId !== "none") return "Nom!";
    if (this.#lastState.muted) return "Shh";
    switch (playbackState) {
      case "buffering":
        return "Hungry !";
      case "ended":
        return "Yay!";
      case "playing":
        return "Playing";
      case "paused":
      default:
        return "zzz";
    }
  }

  #shouldAnimateWalk(containerState) {
    if (this.#petId === "none") return false;
    if (this.isReducedMotion()) return false;
    if (this.#isNomming) return false;
    return containerState === "playing";
  }

  #shouldIdleBlink(containerState) {
    if (this.#petId === "none") return false;
    if (this.isReducedMotion()) return false;
    return containerState === "paused";
  }

  #syncProgressBar() {
    const { currentTime, duration } = this.#lastState;
    const ratio =
      duration > 0 && Number.isFinite(currentTime)
        ? Math.min(1, Math.max(0, currentTime / duration))
        : 0;
    const pct = `${(ratio * 100).toFixed(2)}%`;

    this.#strip?.style.setProperty("--pet-progress", pct);
    this.#slider?.style.setProperty("--pet-progress", pct);

    if (this.#slider) {
      const nowVal = String(Math.round(ratio * 100));
      const valueText = `${formatAriaTime(currentTime)} of ${formatAriaTime(duration)}`;
      if (this.#slider.getAttribute("aria-valuenow") !== nowVal) {
        this.#slider.setAttribute("aria-valuenow", nowVal);
      }
      if (this.#slider.getAttribute("aria-valuetext") !== valueText) {
        this.#slider.setAttribute("aria-valuetext", valueText);
      }
    }
  }

  #syncState() {
    const playbackState = this.#resolvePlaybackState();
    const containerState = this.#resolveContainerState();
    const shouldWalk = this.#shouldAnimateWalk(containerState);
    const shouldBlink = this.#shouldIdleBlink(containerState);

    if (shouldWalk && !this.#walkTimer) {
      this.#walkTimer = setInterval(() => {
        this.#step = (this.#step + 1) % 2;
        this.#renderPose();
      }, WALK_MS);
    } else if (!shouldWalk && this.#walkTimer) {
      this.#stopWalkTimer();
      this.#step = 0;
    }

    if (shouldBlink && !this.#blinkInterval) {
      this.#blinkInterval = setInterval(() => {
        if (this.isReducedMotion()) return;
        this.#isBlinking = true;
        this.#renderPose();
        if (this.#blinkTimeout) clearTimeout(this.#blinkTimeout);
        this.#blinkTimeout = setTimeout(() => {
          this.#isBlinking = false;
          this.#blinkTimeout = null;
          this.#renderPose();
        }, IDLE_BLINK_HOLD_MS);
      }, IDLE_BLINK_INTERVAL_MS);
    } else if (!shouldBlink && this.#blinkInterval) {
      this.#stopBlinkTimer();
    }

    if (this.#container) {
      this.#container.setAttribute("data-pet-state", containerState);
      this.#container.setAttribute("data-playback", playbackState);
    }
    if (this.#strip) {
      this.#strip.setAttribute("data-pet-state", containerState);
      this.#strip.setAttribute("data-playback", playbackState);
    }

    this.#syncProgressBar();
    this.#renderPose(containerState);
  }

  #renderPose(containerState = this.#resolveContainerState()) {
    const playbackState = this.#resolvePlaybackState();
    const pose = this.#resolvePose(containerState);
    this.#currentPose = pose;
    const frame = PET_FRAMES[pose] ?? 0;

    if (this.#sprite) {
      this.#sprite.style.setProperty("--frame", String(frame));
      this.#sprite.setAttribute("data-pose", pose);
    }

    if (this.#moodText) {
      this.#moodText.textContent = this.#resolveMoodLabel(playbackState);
    }
    if (this.#moodBubble) {
      const hideBubble =
        this.#petId === "none" ||
        (playbackState === "playing" && !this.#lastState.muted && !this.#isNomming);
      this.#moodBubble.hidden = hideBubble;
    }
  }

  #stopWalkTimer() {
    if (this.#walkTimer) {
      clearInterval(this.#walkTimer);
      this.#walkTimer = null;
    }
  }

  #stopBlinkTimer() {
    if (this.#blinkInterval) {
      clearInterval(this.#blinkInterval);
      this.#blinkInterval = null;
    }
    if (this.#blinkTimeout) {
      clearTimeout(this.#blinkTimeout);
      this.#blinkTimeout = null;
    }
    this.#isBlinking = false;
  }

  #clearNomTimer() {
    if (this.#nomTimer) {
      clearTimeout(this.#nomTimer);
      this.#nomTimer = null;
    }
  }

  get pose() {
    return this.#currentPose;
  }
}

if (!customElements.get("poppet-pet")) {
  customElements.define("poppet-pet", PoppetPetElement);
}
