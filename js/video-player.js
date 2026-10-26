// video-player.js — TikTok-style vertical short-form video player for lessons
// Exports: VideoPlayer class, renderLessonVideo, renderVideoLibrary

const STYLE_ID = "vp-styles";
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
  .vp { position:relative; width:100%; max-width:420px; margin:0 auto; outline:none; font-family:inherit; }
  .vp-stage { position:relative; width:100%; aspect-ratio:9/16; background:#000; border-radius:12px; overflow:hidden; }
  @media (min-width:768px) { .vp-stage { aspect-ratio:16/9; max-width:720px; } .vp { max-width:720px; } }
  .vp-video { width:100%; height:100%; object-fit:contain; display:block; background:#000; }
  .vp-skeleton { position:absolute; inset:0; z-index:1; }
  .vp-offline { position:absolute; top:8px; right:8px; background:rgba(0,0,0,.7); color:#fff; padding:4px 8px; border-radius:8px; font-size:12px; font-weight:700; z-index:5; }
  .vp-bigplay { position:absolute; inset:0; margin:auto; width:64px; height:64px; border-radius:50%; border:none; background:rgba(0,0,0,.55); color:#fff; font-size:28px; cursor:pointer; z-index:4; display:flex; align-items:center; justify-content:center; }
  .vp-bigplay.hidden { display:none; }
  .vp-controls { position:absolute; left:0; right:0; bottom:0; padding:8px; background:linear-gradient(transparent, rgba(0,0,0,.75)); display:flex; flex-wrap:wrap; gap:6px; align-items:center; z-index:6; }
  .vp-btn { background:rgba(255,255,255,.15); border:none; color:#fff; border-radius:8px; padding:6px 8px; cursor:pointer; font-size:14px; }
  .vp-btn:hover { background:rgba(255,255,255,.28); }
  .vp-seek { flex:1 1 100%; width:100%; }
  .vp-time { color:#fff; font-size:12px; font-variant-numeric:tabular-nums; min-width:90px; }
  .vp-vol { width:80px; }
  .vp-rate { background:rgba(255,255,255,.15); color:#fff; border:none; border-radius:8px; padding:6px; }
  .vp-cc.active { background:var(--green,#58cc02); color:#000; }
  .vp-sr { position:absolute; left:-10000px; width:1px; height:1px; overflow:hidden; }
  .vp-lib-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:12px; padding:0 16px; }
  .vp-lib-card { background:var(--card,#1c2a36); border-radius:12px; overflow:hidden; cursor:pointer; border:1px solid var(--border,#2a3a4a); transition:transform .15s; }
  .vp-lib-card:hover { transform:translateY(-2px); }
  .vp-lib-thumb { position:relative; aspect-ratio:9/16; background:#000; overflow:hidden; }
  .vp-lib-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
  .vp-lib-dur { position:absolute; bottom:6px; right:6px; background:rgba(0,0,0,.75); color:#fff; font-size:11px; padding:2px 6px; border-radius:6px; }
  .vp-lib-play { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#fff; font-size:36px; opacity:.85; pointer-events:none; }
  .vp-lib-info { padding:8px; }
  .vp-lib-title { font-weight:800; font-size:14px; }
  .vp-lib-desc { color:var(--muted,#94a3b8); font-size:12px; margin-top:2px; }
  .vp-lib-lesson { color:var(--muted-2,#64748b); font-size:11px; margin-top:2px; }
  .vp-modal { position:fixed; inset:0; background:rgba(0,0,0,.85); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px; }
  .vp-modal-body { background:var(--card,#1c2a36); border-radius:16px; padding:16px; max-width:480px; width:100%; max-height:90vh; overflow:auto; position:relative; }
  .vp-modal-close { position:absolute; top:8px; right:8px; background:rgba(255,255,255,.15); border:none; color:#fff; border-radius:8px; width:32px; height:32px; cursor:pointer; }
  .vp-err { color:var(--red,#ff4b4b); padding:12px; text-align:center; }
  `;
  document.head.appendChild(style);
}

function resolveContainer(container) {
  if (typeof container === "string") return document.querySelector(container);
  return container;
}
function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmtTime(sec) {
  if (!isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}
function fmtDur(sec) {
  if (!sec) return "0:00";
  return fmtTime(sec);
}
function announceMsg(msg) {
  try {
    const r = document.getElementById("sr-announcer");
    if (r) r.textContent = msg;
  } catch (e) {}
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5];

function saveProgress(url, pct) {
  try {
    const key = "strumio_video_progress";
    const data = JSON.parse(localStorage.getItem(key) || "{}");
    data[url] = { pct, ts: Date.now() };
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {}
}
function saveWatched(url) {
  try {
    const key = "strumio_video_watched";
    const data = JSON.parse(localStorage.getItem(key) || "{}");
    data[url] = true;
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {}
}

export class VideoPlayer {
  constructor(container, options = {}) {
    injectStyles();
    this.container = resolveContainer(container);
    if (!this.container) throw new Error("VideoPlayer: container not found");
    this.opts = {
      src: options.src || options.url || "",
      poster: options.poster || "",
      captions: options.captions || options.captionsUrl || "",
      loop: !!options.loop,
      autoplay: options.autoplay !== false,
      autoplayVisible: options.autoplayVisible !== false,
      muted: !!options.muted,
      volume: (options.volume == null ? 1 : options.volume),
      rate: (options.rate == null ? 1 : options.rate),
      onProgress: options.onProgress,
      onWatched: options.onWatched,
      title: options.title || ""
    };
    this.watched = false;
    this.io = null;
    this.destroyed = false;
    this.build();
    if (this.opts.src) this.load(this.opts.src);
    this.setupIO();
    this.setupKeyboard();
    this.setupNetwork();
  }

  build() {
    this.container.innerHTML = "";
    this.container.classList.add("vp");
    this.container.tabIndex = 0;
    this.root = document.createElement("div");
    this.root.className = "vp-stage";
    this.container.appendChild(this.root);

    this.skeleton = document.createElement("div");
    this.skeleton.className = "skeleton vp-skeleton";
    this.root.appendChild(this.skeleton);

    this.video = document.createElement("video");
    this.video.className = "vp-video";
    this.video.playsInline = true;
    this.video.preload = "metadata";
    this.video.loop = this.opts.loop;
    this.video.muted = this.opts.muted;
    this.video.volume = this.opts.volume;
    this.video.playbackRate = this.opts.rate;
    if (this.opts.poster) this.video.poster = this.opts.poster;
    this.root.appendChild(this.video);

    this.offlineEl = document.createElement("div");
    this.offlineEl.className = "vp-offline";
    this.offlineEl.hidden = true;
    this.offlineEl.textContent = "Sin conexión";
    this.root.appendChild(this.offlineEl);

    this.bigPlay = document.createElement("button");
    this.bigPlay.className = "vp-bigplay";
    this.bigPlay.type = "button";
    this.bigPlay.setAttribute("aria-label", "Reproducir");
    this.bigPlay.textContent = "▶";
    this.root.appendChild(this.bigPlay);

    this.controls = document.createElement("div");
    this.controls.className = "vp-controls";
    this.root.appendChild(this.controls);

    this.playBtn = document.createElement("button");
    this.playBtn.className = "vp-btn vp-play";
    this.playBtn.type = "button";
    this.playBtn.setAttribute("aria-label", "Reproducir o pausar");
    this.playBtn.textContent = "▶";
    this.controls.appendChild(this.playBtn);

    this.seekBar = document.createElement("input");
    this.seekBar.type = "range";
    this.seekBar.className = "vp-seek";
    this.seekBar.min = "0";
    this.seekBar.max = "100";
    this.seekBar.step = "0.1";
    this.seekBar.value = "0";
    this.seekBar.setAttribute("aria-label", "Progreso del video");
    this.controls.appendChild(this.seekBar);

    this.timeLabel = document.createElement("span");
    this.timeLabel.className = "vp-time";
    this.timeLabel.textContent = "0:00 / 0:00";
    this.controls.appendChild(this.timeLabel);

    this.volBar = document.createElement("input");
    this.volBar.type = "range";
    this.volBar.className = "vp-vol";
    this.volBar.min = "0";
    this.volBar.max = "1";
    this.volBar.step = "0.05";
    this.volBar.value = String(this.opts.volume);
    this.volBar.setAttribute("aria-label", "Volumen");
    this.controls.appendChild(this.volBar);

    this.rateSel = document.createElement("select");
    this.rateSel.className = "vp-rate";
    this.rateSel.setAttribute("aria-label", "Velocidad de reproducción");
    for (const r of RATES) {
      const o = document.createElement("option");
      o.value = String(r);
      o.textContent = r + "x";
      if (r === this.opts.rate) o.selected = true;
      this.rateSel.appendChild(o);
    }
    this.controls.appendChild(this.rateSel);

    this.loopBtn = document.createElement("button");
    this.loopBtn.className = "vp-btn vp-loop";
    this.loopBtn.type = "button";
    this.loopBtn.setAttribute("aria-pressed", String(this.opts.loop));
    this.loopBtn.setAttribute("aria-label", "Repetir");
    this.loopBtn.textContent = "🔁";
    this.controls.appendChild(this.loopBtn);

    this.pipBtn = document.createElement("button");
    this.pipBtn.className = "vp-btn vp-pip";
    this.pipBtn.type = "button";
    this.pipBtn.setAttribute("aria-label", "Picture in Picture");
    this.pipBtn.textContent = "📌";
    this.controls.appendChild(this.pipBtn);

    this.fsBtn = document.createElement("button");
    this.fsBtn.className = "vp-btn vp-fs";
    this.fsBtn.type = "button";
    this.fsBtn.setAttribute("aria-label", "Pantalla completa");
    this.fsBtn.textContent = "⛶";
    this.controls.appendChild(this.fsBtn);

    this.ccBtn = document.createElement("button");
    this.ccBtn.className = "vp-btn vp-cc";
    this.ccBtn.type = "button";
    this.ccBtn.setAttribute("aria-label", "Subtítulos");
    this.ccBtn.textContent = "CC";
    this.controls.appendChild(this.ccBtn);

    this.sr = document.createElement("div");
    this.sr.className = "vp-sr";
    this.sr.setAttribute("aria-live", "polite");
    this.container.appendChild(this.sr);

    // events
    this.playBtn.onclick = () => this.togglePlay();
    this.bigPlay.onclick = () => this.togglePlay();
    this.video.addEventListener("click", () => this.togglePlay());
    this.seekBar.addEventListener("input", () => {
      const pct = parseFloat(this.seekBar.value) / 100;
      this.seek((this.video.duration || 0) * pct);
    });
    this.volBar.addEventListener("input", () => this.setVolume(parseFloat(this.volBar.value)));
    this.rateSel.addEventListener("change", () => this.setRate(parseFloat(this.rateSel.value)));
    this.loopBtn.onclick = () => this.toggleLoop();
    this.pipBtn.onclick = () => this.togglePiP();
    this.fsBtn.onclick = () => this.toggleFullscreen();
    this.ccBtn.onclick = () => this.toggleCaptions();

    this.video.addEventListener("loadedmetadata", () => this.onLoadedMetadata());
    this.video.addEventListener("canplay", () => this.showSkeleton(false));
    this.video.addEventListener("timeupdate", () => this.onTimeUpdate());
    this.video.addEventListener("play", () => this.onPlay());
    this.video.addEventListener("pause", () => this.onPause());
    this.video.addEventListener("ended", () => this.onEnded());
    this.video.addEventListener("error", () => this.onError());
    this.video.addEventListener("volumechange", () => {
      this.volBar.value = String(this.video.volume);
    });

    // fullscreen change
    document.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement === this.container) {
        this.container.style.maxWidth = "100%";
      } else {
        this.container.style.maxWidth = "";
      }
    });
  }

  load(src) {
    this.opts.src = src;
    this.video.src = src;
    if (this.opts.captions) {
      // remove existing tracks
      [...this.video.querySelectorAll("track")].forEach((t) => t.remove());
      const track = document.createElement("track");
      track.kind = "captions";
      track.label = "Español";
      track.srclang = "es";
      track.src = this.opts.captions;
      track.default = true;
      this.video.appendChild(track);
    }
    this.showSkeleton(true);
    this.cacheVideo();
  }

  showSkeleton(show) {
    if (this.skeleton) this.skeleton.style.display = show ? "block" : "none";
  }

  onLoadedMetadata() {
    this.timeLabel.textContent = "0:00 / " + fmtTime(this.video.duration);
  }

  onTimeUpdate() {
    const dur = this.video.duration;
    if (!dur) return;
    const pct = this.video.currentTime / dur;
    if (!this.seekBar.matches(":active")) {
      this.seekBar.value = String(pct * 100);
    }
    this.timeLabel.textContent = fmtTime(this.video.currentTime) + " / " + fmtTime(dur);
    if (this.opts.onProgress) {
      try { this.opts.onProgress(pct); } catch (e) {}
    }
    saveProgress(this.opts.src, pct);
    if (!this.watched && pct > 0.8) {
      this.watched = true;
      if (this.opts.onWatched) {
        try { this.opts.onWatched(pct); } catch (e) {}
      }
      this.announce("Video visto");
      saveWatched(this.opts.src);
    }
  }

  onPlay() {
    this.playBtn.textContent = "⏸";
    this.bigPlay.classList.add("hidden");
    this.announce("Reproduciendo");
  }
  onPause() {
    this.playBtn.textContent = "▶";
    this.bigPlay.classList.remove("hidden");
    this.announce("Pausado");
  }
  onEnded() {
    this.playBtn.textContent = "▶";
    this.bigPlay.classList.remove("hidden");
    this.announce("Video finalizado");
    if (!this.watched) {
      this.watched = true;
      if (this.opts.onWatched) {
        try { this.opts.onWatched(1); } catch (e) {}
      }
      saveWatched(this.opts.src);
    }
  }
  onError() {
    this.showSkeleton(false);
    const msg = document.createElement("div");
    msg.className = "vp-err";
    msg.textContent = "No se pudo cargar el video.";
    this.root.appendChild(msg);
  }

  togglePlay() {
    if (this.video.paused) {
      this.play();
    } else {
      this.pause();
    }
  }
  play() {
    const p = this.video.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
    return p;
  }
  pause() {
    this.video.pause();
  }
  seek(t) {
    const dur = this.video.duration || 0;
    this.video.currentTime = Math.max(0, Math.min(dur, t));
  }
  setVolume(v) {
    const nv = Math.max(0, Math.min(1, v));
    this.video.volume = nv;
    this.video.muted = nv === 0;
    this.volBar.value = String(nv);
  }
  setRate(r) {
    this.video.playbackRate = r;
    this.rateSel.value = String(r);
  }
  toggleLoop() {
    this.video.loop = !this.video.loop;
    this.loopBtn.setAttribute("aria-pressed", String(this.video.loop));
    this.announce(this.video.loop ? "Repetir activado" : "Repetir desactivado");
  }
  async togglePiP() {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (this.video.requestPictureInPicture) {
        await this.video.requestPictureInPicture();
      }
    } catch (e) {}
  }
  toggleFullscreen() {
    try {
      if (document.fullscreenElement === this.container) {
        document.exitFullscreen();
      } else if (this.container.requestFullscreen) {
        this.container.requestFullscreen();
      }
    } catch (e) {}
  }
  toggleCaptions() {
    const tracks = this.video.textTracks;
    if (!tracks || tracks.length === 0) {
      this.announce("Sin subtítulos disponibles");
      return;
    }
    let anyOn = false;
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].mode === "showing") { anyOn = true; break; }
    }
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = anyOn ? "hidden" : "showing";
    }
    this.ccBtn.classList.toggle("active", !anyOn);
    this.announce(anyOn ? "Subtítulos desactivados" : "Subtítulos activados");
  }

  setupIO() {
    if (!this.opts.autoplayVisible) return;
    if (!("IntersectionObserver" in window)) return;
    this.io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            if (this.opts.autoplay) this.play();
          } else {
            this.pause();
          }
        }
      },
      { threshold: 0.5 }
    );
    this.io.observe(this.container);
  }

  setupKeyboard() {
    this.container.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
        // allow space on buttons? inputs handle themselves; but seek bar uses arrows. For global shortcuts, skip.
        if (e.key !== " " || tag === "INPUT") {
          // let inputs handle arrows/space natively
          if (tag === "INPUT" && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === " ")) return;
        }
      }
      switch (e.key) {
        case " ":
          e.preventDefault();
          this.togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          this.seek(this.video.currentTime - 5);
          break;
        case "ArrowRight":
          e.preventDefault();
          this.seek(this.video.currentTime + 5);
          break;
        case "ArrowUp":
          e.preventDefault();
          this.setVolume(this.video.volume + 0.1);
          break;
        case "ArrowDown":
          e.preventDefault();
          this.setVolume(this.video.volume - 0.1);
          break;
        case "f":
        case "F":
          e.preventDefault();
          this.toggleFullscreen();
          break;
        case "m":
        case "M":
          e.preventDefault();
          this.video.muted = !this.video.muted;
          this.announce(this.video.muted ? "Silenciado" : "Sonido activado");
          break;
        default:
          break;
      }
    });
  }

  setupNetwork() {
    this.updateOffline();
    window.addEventListener("online", () => this.updateOffline());
    window.addEventListener("offline", () => this.updateOffline());
  }
  updateOffline() {
    const offline = !navigator.onLine;
    this.offlineEl.hidden = !offline;
    if (offline) this.announce("Sin conexión");
  }

  cacheVideo() {
    if (!this.opts.src) return;
    if ("caches" in window) {
      caches.open("strumio-videos").then((c) => c.add(this.opts.src)).catch(() => {});
    }
  }

  announce(msg) {
    if (this.sr) this.sr.textContent = msg;
    announceMsg(msg);
  }

  destroy() {
    this.destroyed = true;
    if (this.io) { try { this.io.disconnect(); } catch (e) {} }
    try { this.video.pause(); } catch (e) {}
    this.video.removeAttribute("src");
    try { this.video.load(); } catch (e) {}
    this.container.innerHTML = "";
    this.container.classList.remove("vp");
  }

  static async generateThumbnail(url) {
    return new Promise((resolve) => {
      if (!url) { resolve(""); return; }
      const v = document.createElement("video");
      v.src = url;
      v.crossOrigin = "anonymous";
      v.muted = true;
      v.preload = "metadata";
      let done = false;
      const finish = (dataUrl) => {
        if (done) return;
        done = true;
        try { v.removeAttribute("src"); v.load(); } catch (e) {}
        resolve(dataUrl || "");
      };
      v.addEventListener("loadeddata", () => {
        try { v.currentTime = Math.min(0.5, (v.duration || 1) * 0.05); } catch (e) { finish(""); }
      }, { once: true });
      v.addEventListener("seeked", () => {
        try {
          const w = v.videoWidth || 360;
          const h = v.videoHeight || 640;
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          const ctx = c.getContext("2d");
          ctx.drawImage(v, 0, 0, w, h);
          finish(c.toDataURL("image/jpeg", 0.72));
        } catch (e) {
          finish("");
        }
      }, { once: true });
      v.addEventListener("error", () => finish(""), { once: true });
      setTimeout(() => finish(""), 8000);
    });
  }
}

export function renderLessonVideo(container, videoUrl, options = {}) {
  const c = resolveContainer(container);
  if (!c) return null;
  c.innerHTML = "";
  const sk = document.createElement("div");
  sk.className = "skeleton";
  sk.style.cssText = "width:100%;aspect-ratio:9/16;border-radius:12px;";
  c.appendChild(sk);
  // slight delay to paint skeleton
  setTimeout(() => {
    c.innerHTML = "";
    const player = new VideoPlayer(c, {
      src: videoUrl,
      captions: options.captions || options.captionsUrl,
      title: options.title,
      loop: options.loop,
      autoplay: options.autoplay !== false,
      autoplayVisible: options.autoplayVisible !== false,
      onProgress: options.onProgress,
      onWatched: options.onWatched
    });
    c._vp = player;
  }, 60);
  return null;
}

export async function renderVideoLibrary(container) {
  const c = resolveContainer(container);
  if (!c) return;
  injectStyles();
  c.innerHTML = `<div class="section-title" style="margin-left:0">🎬 Biblioteca de videos</div><div class="vp-lib-grid" id="vpLibGrid"></div>`;
  const grid = c.querySelector("#vpLibGrid");
  // skeleton placeholders
  for (let i = 0; i < 6; i++) {
    const ph = document.createElement("div");
    ph.className = "vp-lib-card";
    ph.innerHTML = `<div class="vp-lib-thumb"><div class="skeleton" style="position:absolute;inset:0"></div></div><div class="vp-lib-info"><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text"></div></div>`;
    grid.appendChild(ph);
  }
  let videos = [];
  try {
    const r = await fetch("data/videos.json");
    const data = await r.json();
    videos = Array.isArray(data) ? data : (data.videos || data.items || []);
  } catch (e) {
    videos = [];
  }
  grid.innerHTML = "";
  if (!videos.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;color:var(--muted);padding:12px">No hay videos disponibles.</div>`;
    return;
  }
  for (const v of videos) {
    const card = document.createElement("div");
    card.className = "vp-lib-card";
    card.innerHTML = `
      <div class="vp-lib-thumb">
        <div class="skeleton" style="position:absolute;inset:0"></div>
        <img alt="${escapeHtml(v.title)}" loading="lazy" />
        <span class="vp-lib-dur">${fmtDur(v.duration)}</span>
        <span class="vp-lib-play">▶</span>
      </div>
      <div class="vp-lib-info">
        <div class="vp-lib-title">${escapeHtml(v.title)}</div>
        <div class="vp-lib-desc">${escapeHtml(v.description || "")}</div>
        <div class="vp-lib-lesson">${escapeHtml(v.lesson || "")}</div>
      </div>`;
    grid.appendChild(card);
    const img = card.querySelector("img");
    const sk = card.querySelector(".skeleton");
    const setThumb = (src) => {
      if (src) img.src = src;
      if (sk) sk.remove();
    };
    if (v.thumbnail) {
      img.onload = () => setThumb(v.thumbnail);
      img.onerror = () => setThumb("");
      img.src = v.thumbnail;
      setTimeout(() => { if (sk && sk.parentNode) sk.remove(); }, 1500);
    } else {
      // Check if video exists before trying to generate thumbnail
      fetch(v.url, { method: 'HEAD' }).then(resp => {
        if (resp.ok) {
          return VideoPlayer.generateThumbnail(v.url).then((dataUrl) => setThumb(dataUrl)).catch(() => setThumb(""));
        } else {
          // Video not available - show placeholder
          if (sk) sk.remove();
          img.style.display = 'none';
          const placeholder = document.createElement('div');
          placeholder.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--card2,#1c2a36);color:var(--muted,#94a3b8);font-size:32px;';
          placeholder.textContent = '🎬';
          card.querySelector('.vp-lib-thumb').appendChild(placeholder);
        }
      }).catch(() => {
        if (sk) sk.remove();
        img.style.display = 'none';
      });
    }
    card.addEventListener("click", () => openVideoModal(v));
  }
}

function openVideoModal(v) {
  const backdrop = document.createElement("div");
  backdrop.className = "vp-modal";
  backdrop.innerHTML = `
    <div class="vp-modal-body">
      <button class="vp-modal-close" aria-label="Cerrar">✕</button>
      <div class="vp-modal-player"></div>
      <h3 style="margin:12px 0 4px">${escapeHtml(v.title)}</h3>
      <p style="color:var(--muted);font-size:13px;margin:0">${escapeHtml(v.description || "")}</p>
    </div>`;
  document.body.appendChild(backdrop);
  const pc = backdrop.querySelector(".vp-modal-player");
  const player = new VideoPlayer(pc, {
    src: v.url,
    captions: v.captions,
    title: v.title,
    autoplay: true,
    autoplayVisible: false
  });
  const close = () => { try { player.destroy(); } catch (e) {} backdrop.remove(); };
  backdrop.querySelector(".vp-modal-close").onclick = close;
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);
}
