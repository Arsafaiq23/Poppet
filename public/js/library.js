/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Poppet Video Folder / Library & First-Screen Picker.
 * Supports built-in HLS streams plus local video files / folders via File API.
 */

import { activeMuxPlaybackId, muxHls, muxPoster, POPPET } from "./poppet.config.js";

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogg|ogv|mkv)$/i;

function buildDefaultItems() {
  const items = [];
  if (POPPET.fallbackMp4) {
    items.push({
      id: "config-mp4",
      title: "Featured Video",
      meta: "MP4",
      src: POPPET.fallbackMp4,
      poster: POPPET.poster || "",
      local: false,
    });
  }
  const muxId = activeMuxPlaybackId();
  if (muxId) {
    items.push({
      id: "mux-sintel",
      title: "Sintel Trailer",
      meta: "CC BY 3.0",
      src: muxHls(muxId),
      poster: POPPET.poster || muxPoster(muxId),
      local: false,
    });
  }
  items.push(
    {
      id: "cc0-flower",
      title: "Flower Blossom",
      meta: "CC0 · Free",
      src: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      poster: "",
      local: false,
    },
    {
      id: "mux-bbb",
      title: "Big Buck Bunny",
      meta: "CC BY 3.0",
      src: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      poster: "",
      local: false,
    },
    {
      id: "mux-tos",
      title: "Tears of Steel",
      meta: "CC BY 3.0",
      src: "https://test-streams.mux.dev/tos_ismc/main.m3u8",
      poster: "",
      local: false,
    }
  );
  return items;
}

function isVideoFile(file) {
  return Boolean(file && (file.type?.startsWith("video/") || VIDEO_EXT_RE.test(file.name)));
}

function cleanFileTitle(name) {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || name;
}

export function createVideoLibrary({ player, onSelectVideo, announce }) {
  const folderBtn = player.querySelector("[data-poppet-folder-btn]");
  const panel = player.querySelector("[data-poppet-folder-panel]");
  const closeBtn = player.querySelector("[data-poppet-folder-close]");
  const listEl = player.querySelector("[data-poppet-folder-list]");
  const openFolderBtn = player.querySelector("[data-poppet-open-folder]");
  const openFileBtn = player.querySelector("[data-poppet-open-file]");
  const folderInput = player.querySelector("[data-poppet-folder-input]");
  const fileInput = player.querySelector("[data-poppet-file-input]");

  const items = buildDefaultItems();
  let activeId = items[0]?.id || "";
  let isOpen = false;
  const objectUrls = [];
  const homeParent = panel?.parentElement || null;
  const homeNextSibling = panel?.nextSibling || null;

  function render() {
    if (!listEl) return;
    listEl.innerHTML = "";
    for (const item of items) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "poppet-folder-item";
      btn.setAttribute("data-video-id", item.id);
      if (item.id === activeId) {
        btn.setAttribute("aria-current", "true");
      }

      const nameSpan = document.createElement("span");
      nameSpan.className = "poppet-folder-item-title";
      nameSpan.textContent = item.title;

      const metaSpan = document.createElement("span");
      metaSpan.className = "poppet-folder-item-meta";
      metaSpan.textContent = item.meta;

      btn.append(nameSpan, metaSpan);
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        selectItem(item);
      });
      li.appendChild(btn);
      listEl.appendChild(li);
    }
  }

  function isHlsSource(src) {
    return /\.m3u8(\?|$)/i.test(src) || src.includes("stream.mux.com");
  }

  function ensureMediaElement(desiredTag, currentEl, src) {
    if (currentEl && currentEl.tagName.toLowerCase() === desiredTag) {
      return currentEl;
    }

    const nextEl = document.createElement(desiredTag);
    nextEl.setAttribute("playsinline", "");
    nextEl.setAttribute("preload", "metadata");
    if (!src.startsWith("blob:")) {
      nextEl.setAttribute("crossorigin", "anonymous");
    }

    if (currentEl) {
      if (typeof currentEl.muted === "boolean") nextEl.muted = currentEl.muted;
      if (typeof currentEl.volume === "number") nextEl.volume = currentEl.volume;
      if (typeof currentEl.playbackRate === "number") nextEl.playbackRate = currentEl.playbackRate;
      try {
        currentEl.pause?.();
        currentEl.removeAttribute("src");
        currentEl.load?.();
      } catch {
        // ignore
      }
      currentEl.replaceWith(nextEl);
    } else {
      const stage = player.querySelector(".poppet-stage, media-container");
      stage?.prepend(nextEl);
    }

    return nextEl;
  }

  function selectItem(item) {
    if (!item) return;
    activeId = item.id;
    render();

    const desiredTag = isHlsSource(item.src) ? "mux-video" : "video";
    const currentEl = player.querySelector("mux-video, video, audio");
    const mediaEl = ensureMediaElement(desiredTag, currentEl, item.src);

    if (mediaEl) {
      try {
        mediaEl.pause?.();
      } catch {
        // ignore
      }
      if (item.poster) {
        mediaEl.setAttribute("poster", item.poster);
      } else {
        mediaEl.removeAttribute("poster");
      }
      if (item.src.startsWith("blob:")) {
        mediaEl.removeAttribute("crossorigin");
      } else {
        mediaEl.setAttribute("crossorigin", "anonymous");
      }
      mediaEl.setAttribute("src", item.src);
      mediaEl.src = item.src;
      mediaEl.load?.();
      mediaEl.play?.().catch(() => {});
    }

    close({ returnFocus: false });
    onSelectVideo?.(item, mediaEl);
    announce?.(`Playing ${item.title}.`);
  }

  function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter(isVideoFile);
    if (!files.length) {
      announce?.("No video files found in selection.");
      return;
    }
    files.sort((a, b) => a.name.localeCompare(b.name));
    const added = [];
    for (const file of files) {
      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      const entry = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: cleanFileTitle(file.name),
        meta: file.webkitRelativePath ? "Folder" : "Local",
        src: url,
        poster: "",
        local: true,
      };
      added.push(entry);
    }
    // Put newly picked local videos at the top of the list
    items.unshift(...added);
    render();
    announce?.(`Added ${added.length} video${added.length > 1 ? "s" : ""}.`);
    if (added.length === 1) {
      selectItem(added[0]);
    }
  }

  function open({ focusInside = false } = {}) {
    if (!panel) return;
    isOpen = true;
    if (window.innerWidth <= 600 && panel.parentElement !== document.body) {
      document.body.appendChild(panel);
      panel.setAttribute("data-mobile-sheet", "true");
    } else if (window.innerWidth > 600 && homeParent && panel.parentElement !== homeParent) {
      homeParent.insertBefore(panel, homeNextSibling);
      panel.removeAttribute("data-mobile-sheet");
    }
    panel.hidden = false;
    folderBtn?.setAttribute("aria-expanded", "true");
    render();
    if (focusInside) {
      requestAnimationFrame(() => {
        const current = panel.querySelector("[aria-current='true']") || panel.querySelector("button");
        current?.focus({ preventScroll: true });
      });
    }
  }

  function close({ returnFocus = false } = {}) {
    if (!panel) return;
    isOpen = false;
    panel.hidden = true;
    panel.removeAttribute("data-mobile-sheet");
    if (homeParent && panel.parentElement !== homeParent) {
      homeParent.insertBefore(panel, homeNextSibling);
    }
    folderBtn?.setAttribute("aria-expanded", "false");
    if (returnFocus) {
      folderBtn?.focus({ preventScroll: true });
    }
  }

  function toggle() {
    if (isOpen) close({ returnFocus: true });
    else open({ focusInside: true });
  }

  folderBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggle();
  });

  closeBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    close({ returnFocus: true });
  });

  openFolderBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    folderInput?.click();
  });

  openFileBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    fileInput?.click();
  });

  folderInput?.addEventListener("change", (event) => {
    handleFiles(event.target.files);
    event.target.value = "";
  });

  fileInput?.addEventListener("change", (event) => {
    handleFiles(event.target.files);
    event.target.value = "";
  });

  // Prevent clicks inside the folder panel from bubbling to video play/pause
  panel?.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  render();

  return {
    open,
    close,
    toggle,
    isOpen: () => isOpen,
    dispose() {
      for (const u of objectUrls) URL.revokeObjectURL(u);
    },
  };
}
