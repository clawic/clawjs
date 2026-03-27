// ─── Interactive demo previews for the landing page ──────────────────────────
// Pure vanilla JS. Smooth transitions — no hard re-renders.

// ─── Shared helpers ──────────────────────────────────────────────────────────

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "className") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "innerHTML") el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === "string") el.appendChild(document.createTextNode(c));
    else if (c) el.appendChild(c);
  }
  return el;
}

function spinner(size = 16) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.classList.add("dp-spinner");
  svg.innerHTML = `<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" opacity="0.2"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>`;
  return svg;
}

/* Animated toggle — mutates in place on click, never rebuilt */
function createToggle(on, onChange, disabled = false) {
  const thumb = h("span", { className: `dp-toggle__thumb ${on ? "dp-toggle__thumb--on" : ""}` });
  const btn = h("button", { className: `dp-toggle ${on ? "dp-toggle--on" : ""}` }, thumb);
  if (disabled) btn.disabled = true;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (btn.disabled) return;
    const next = !btn.classList.contains("dp-toggle--on");
    btn.classList.toggle("dp-toggle--on", next);
    thumb.classList.toggle("dp-toggle__thumb--on", next);
    onChange(next);
  });
  btn._setOn = (v) => {
    btn.classList.toggle("dp-toggle--on", v);
    thumb.classList.toggle("dp-toggle__thumb--on", v);
  };
  btn._setDisabled = (v) => { btn.disabled = v; };
  return btn;
}

function statusDot(status) {
  const colors = { active: "#34d399", installed: "#71717a", busy: "#38bdf8", on: "#34d399", off: "#3f3f46" };
  const dot = h("span", { className: "dp-dot" });
  dot.style.background = colors[status] || colors.off;
  dot._setStatus = (s) => { dot.style.background = colors[s] || colors.off; };
  return dot;
}

/* Slide-expand / slide-collapse an element */
function slideDown(el) {
  el.style.display = "";
  el.style.overflow = "hidden";
  el.style.height = "0";
  el.style.opacity = "0";
  requestAnimationFrame(() => {
    const h = el.scrollHeight;
    el.style.transition = "height 280ms cubic-bezier(.25,.1,.25,1), opacity 220ms ease";
    el.style.height = h + "px";
    el.style.opacity = "1";
    const done = () => { el.style.height = ""; el.style.overflow = ""; el.style.transition = ""; el.removeEventListener("transitionend", done); };
    el.addEventListener("transitionend", done);
  });
}

function slideUp(el) {
  el.style.overflow = "hidden";
  el.style.height = el.scrollHeight + "px";
  el.style.transition = "height 240ms cubic-bezier(.25,.1,.25,1), opacity 180ms ease";
  requestAnimationFrame(() => {
    el.style.height = "0";
    el.style.opacity = "0";
    const done = () => { el.style.display = "none"; el.style.transition = ""; el.removeEventListener("transitionend", done); };
    el.addEventListener("transitionend", done);
  });
}

/* Fade element in */
function fadeIn(el) {
  el.style.opacity = "0";
  el.style.transition = "opacity 200ms ease";
  requestAnimationFrame(() => { el.style.opacity = "1"; });
}

/* Show a toast notification */
function showToast(container, msg, duration = 2000) {
  const toast = h("div", { className: "dp-toast" }, msg);
  container.style.position = "relative";
  container.append(toast);
  requestAnimationFrame(() => toast.classList.add("dp-toast--show"));
  setTimeout(() => {
    toast.classList.remove("dp-toast--show");
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

/* Show a modal overlay */
function showModal(container, { icon, title, statusText, body, actions }) {
  const overlay = h("div", { className: "dp-modal-overlay" });
  const modal = h("div", { className: "dp-modal" });

  const header = h("div", { className: "dp-modal__header" });
  if (icon) header.append(icon);
  header.append(h("div", { className: "dp-modal__title" }, title));
  const closeBtn = h("button", { className: "dp-modal__close", onClick: () => closeModal() });
  closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  header.append(closeBtn);
  modal.append(header);

  if (statusText) {
    const st = h("div", { className: "dp-modal__status" });
    st.innerHTML = `<span class="dp-modal__status-dot"></span> ${statusText}`;
    modal.append(st);
  }

  if (body) { const b = h("div", { className: "dp-modal__body" }); b.append(body); modal.append(b); }

  if (actions) { const a = h("div", { className: "dp-modal__actions" }); actions.forEach((act) => a.append(act)); modal.append(a); }

  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  overlay.append(modal);
  container.style.position = "relative";
  container.append(overlay);
  requestAnimationFrame(() => overlay.classList.add("dp-modal-overlay--show"));

  function closeModal() {
    overlay.classList.remove("dp-modal-overlay--show");
    setTimeout(() => overlay.remove(), 220);
  }
  return closeModal;
}

// ─── OPENCLAW DEMO ───────────────────────────────────────────────────────────

function mountOpenClaw(container) {
  const adapters = [
    { id: "openclaw", name: "OpenClaw", hint: "Default ClawJS runtime with full agent capabilities", installed: true, isOpenClaw: true },
    { id: "zeroclaw", name: "ZeroClaw", hint: "Lightweight zero-config runtime adapter", installed: true },
    { id: "picoclaw", name: "PicoClaw", hint: "Minimal footprint runtime for edge deployments", installed: false },
    { id: "nanoclaw", name: "NanoClaw", hint: "Compact runtime with selective capability loading", installed: false },
  ];

  let active = "openclaw";
  let installing = null;
  const rowEls = {};
  const toggleEls = {};
  const dotEls = {};
  const expandEls = {};

  function build() {
    const card = h("div", { className: "dp-card" });

    adapters.forEach((ad, i) => {
      const isActive = active === ad.id;
      const wrapper = h("div", { className: i < adapters.length - 1 ? "dp-row-border" : "" });

      // Main row
      const row = h("div", { className: `dp-row dp-row--click ${isActive ? "dp-row--active" : ""}` });
      row.addEventListener("click", () => selectAdapter(ad.id));

      // Icon
      const iconWrap = h("div", { className: "dp-icon-wrap" });
      const icon = h("div", { className: `dp-icon ${isActive ? "" : "dp-icon--dim"}` });
      if (ad.isOpenClaw) {
        icon.innerHTML = `<svg width="17" height="17" viewBox="0 0 120 120" fill="currentColor"><path d="M60 10C30 10 15 35 15 55C15 75 30 95 45 100L45 110L55 110L55 100C55 100 60 102 65 100L65 110L75 110L75 100C90 95 105 75 105 55C105 35 90 10 60 10Z"/><path d="M20 45C5 40 0 50 5 60C10 70 20 65 25 55C28 48 25 45 20 45Z"/><path d="M100 45C115 40 120 50 115 60C110 70 100 65 95 55C92 48 95 45 100 45Z"/><circle cx="45" cy="35" r="6" fill="currentColor" opacity="0.3"/><circle cx="75" cy="35" r="6" fill="currentColor" opacity="0.3"/></svg>`;
      } else {
        icon.innerHTML = `<img src="/runtimes/${ad.id}.png" alt="${ad.name}" style="width:17px;height:17px;border-radius:2px;filter:grayscale(100%) brightness(0.8);opacity:0.7">`;
      }
      const dot = statusDot(isActive ? "active" : ad.installed ? "installed" : "off");
      dotEls[ad.id] = dot;
      iconWrap.append(icon, dot);

      // Info
      const info = h("div", { className: "dp-info" });
      const nameLine = h("div", { className: "dp-name-line" });
      nameLine.append(h("span", { className: `dp-name ${isActive ? "dp-name--on" : ""}` }, ad.name));
      if (isActive) nameLine.append(h("span", { className: "dp-badge dp-badge--active" }, "Active"));
      else if (ad.installed) nameLine.append(h("span", { className: "dp-badge dp-badge--installed" }, "Installed"));
      info.append(nameLine, h("div", { className: "dp-hint" }, ad.hint));

      const tgl = createToggle(isActive, (v) => { if (v) selectAdapter(ad.id); });
      toggleEls[ad.id] = tgl;

      row.append(iconWrap, info, tgl);
      rowEls[ad.id] = row;
      wrapper.append(row);

      // Expandable area (details, progress)
      const expand = h("div", { className: "dp-expand" });
      expand.style.display = "none";
      expandEls[ad.id] = expand;
      wrapper.append(expand);

      card.append(wrapper);
    });

    container.append(card);
    showDetails("openclaw");
  }

  function showDetails(id) {
    const ad = adapters.find((a) => a.id === id);
    if (!ad || !ad.isOpenClaw) return;
    const expand = expandEls[id];
    expand.innerHTML = "";

    // Status chips
    const chips = h("div", { className: "dp-chips" });
    ["CLI", "Agent", "Model", "Auth"].forEach((label) => {
      const chip = h("div", { className: "dp-chip dp-chip--ok" });
      chip.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      chip.append(document.createTextNode(" " + label));
      chips.append(chip);
    });
    expand.append(chips);

    // Metadata
    const meta = h("div", { className: "dp-meta" });
    meta.append(h("div", { className: "dp-meta__hdr" }, "Details"));
    [
      { l: "Version", v: "0.14.2" },
      { l: "Model", v: "claude-sonnet-4-6", mono: true },
      { l: "Agent ID", v: "default (agt_claw_01)", mono: true },
      { l: "Workspace", v: "~/.clawjs/workspaces/default", mono: true, copy: true },
    ].forEach(({ l, v, mono, copy }) => {
      const r = h("div", { className: `dp-meta__row ${copy ? "dp-meta__row--copy" : ""}` });
      r.append(h("span", { className: "dp-meta__label" }, l), h("span", { className: `dp-meta__val ${mono ? "dp-mono" : ""}` }, v));
      if (copy) r.addEventListener("click", () => showToast(container, "Copied to clipboard!"));
      meta.append(r);
    });
    expand.append(meta);

    // Action buttons
    const actions = h("div", { className: "dp-actions" });
    const refreshBtn = h("button", { className: "dp-btn", onClick: (e) => {
      e.stopPropagation();
      refreshBtn.disabled = true;
      refreshBtn.textContent = "Refreshing...";
      setTimeout(() => { refreshBtn.disabled = false; refreshBtn.textContent = "Refresh"; showToast(container, "Status refreshed"); }, 1200);
    } }, "Refresh");
    const restartBtn = h("button", { className: "dp-btn", onClick: (e) => {
      e.stopPropagation();
      restartBtn.disabled = true;
      restartBtn.textContent = "Restarting...";
      setTimeout(() => { restartBtn.disabled = false; restartBtn.textContent = "Restart"; showToast(container, "Runtime restarted"); }, 1500);
    } }, "Restart");
    actions.append(refreshBtn, restartBtn);
    expand.append(actions);

    expand.style.display = "";
    slideDown(expand);
  }

  function showProgress(id) {
    const expand = expandEls[id];
    expand.innerHTML = "";
    const prog = h("div", { className: "dp-progress" });
    const info = h("div", { className: "dp-progress__info" }, "Checking dependencies...");
    const bar = h("div", { className: "dp-progress__bar" });
    const fill = h("div", { className: "dp-progress__fill" });
    bar.append(fill);
    prog.append(info, bar);
    expand.append(prog);
    expand.style.display = "";
    slideDown(expand);
    return { info, fill };
  }

  function selectAdapter(id) {
    if (installing || active === id) return;
    const prev = active;
    active = id;
    const ad = adapters.find((a) => a.id === id);

    // Update toggles visually
    Object.keys(toggleEls).forEach((k) => {
      toggleEls[k]._setOn(k === id);
    });

    // Update row backgrounds
    Object.keys(rowEls).forEach((k) => {
      rowEls[k].classList.toggle("dp-row--active", k === id);
    });

    // Update dots
    adapters.forEach((a) => {
      dotEls[a.id]._setStatus(a.id === id ? "active" : a.installed ? "installed" : "off");
    });

    // Collapse previous expanded
    if (expandEls[prev] && expandEls[prev].style.display !== "none") {
      slideUp(expandEls[prev]);
    }

    if (ad && !ad.installed) {
      installing = id;
      dotEls[id]._setStatus("busy");
      Object.values(toggleEls).forEach((t) => t._setDisabled(true));
      const { info, fill } = showProgress(id);
      runInstall(ad, info, fill);
    } else if (ad && ad.isOpenClaw) {
      showDetails(id);
    }
  }

  function runInstall(ad, infoEl, fillEl) {
    const steps = [
      { msg: "Checking dependencies...", pct: 10 },
      { msg: "Downloading runtime...", pct: 35 },
      { msg: "Extracting files...", pct: 60 },
      { msg: "Configuring workspace...", pct: 80 },
      { msg: "Verifying installation...", pct: 95 },
      { msg: "Done!", pct: 100 },
    ];
    let i = 0;
    const iv = setInterval(() => {
      if (i < steps.length) {
        infoEl.textContent = steps[i].msg;
        fillEl.style.width = steps[i].pct + "%";
        i++;
      } else {
        clearInterval(iv);
        ad.installed = true;
        installing = null;
        dotEls[ad.id]._setStatus("active");
        Object.values(toggleEls).forEach((t) => t._setDisabled(false));
        slideUp(expandEls[ad.id]);
        showToast(container, `${ad.name} installed successfully`);
      }
    }, 550);
  }

  build();
}

// ─── AI MODELS DEMO ──────────────────────────────────────────────────────────

function mountAiModels(container) {
  const oauthProviders = [
    { id: "openai-codex", label: "ChatGPT / Codex", hint: "Use your ChatGPT subscription" },
    { id: "kimi", label: "Kimi", hint: "Moonshot AI coding assistant" },
    { id: "qwen", label: "Qwen", hint: "Alibaba Cloud LLM" },
  ];
  const apiProviders = [
    { id: "anthropic", label: "Anthropic" },
    { id: "openai", label: "OpenAI" },
    { id: "google", label: "Google AI" },
    { id: "deepseek", label: "DeepSeek" },
    { id: "mistral", label: "Mistral" },
  ];

  const connected = { "openai-codex": true, anthropic: true };
  const defaultProv = "openai-codex";
  const toggleEls = {};
  const dotEls = {};
  const spinnerEls = {};
  const detailEls = {};

  const providerSvgs = {
    "openai-codex": `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M22.28 9.37a6.2 6.2 0 0 0-.54-5.1 6.29 6.29 0 0 0-6.78-3.02A6.23 6.23 0 0 0 10.28 0a6.29 6.29 0 0 0-6 4.35 6.22 6.22 0 0 0-4.15 3.02 6.29 6.29 0 0 0 .78 7.37 6.2 6.2 0 0 0 .54 5.1 6.29 6.29 0 0 0 6.78 3.02A6.23 6.23 0 0 0 13.72 24a6.29 6.29 0 0 0 6-4.35 6.22 6.22 0 0 0 4.15-3.02 6.29 6.29 0 0 0-.78-7.37ZM13.72 22.43a4.65 4.65 0 0 1-2.99-1.09l.17-.09 4.96-2.87a.81.81 0 0 0 .41-.7v-7l2.1 1.21a.07.07 0 0 1 .04.06v5.81a4.68 4.68 0 0 1-4.69 4.67ZM3.53 18.29a4.65 4.65 0 0 1-.56-3.13l.17.1 4.96 2.87a.81.81 0 0 0 .81 0l6.06-3.5v2.42a.08.08 0 0 1-.03.06l-5.02 2.9a4.68 4.68 0 0 1-6.39-1.72ZM2.27 7.89A4.65 4.65 0 0 1 4.7 5.84v5.9a.81.81 0 0 0 .41.7l6.06 3.5-2.1 1.21a.08.08 0 0 1-.07 0L3.99 14.3a4.68 4.68 0 0 1-1.72-6.4Zm17.17 4L13.38 8.4l2.1-1.21a.08.08 0 0 1 .07 0l5.01 2.9a4.68 4.68 0 0 1-.72 8.45v-5.96a.81.81 0 0 0-.4-.7Zm2.09-3.15-.17-.1-4.96-2.87a.81.81 0 0 0-.81 0l-6.06 3.5V6.85a.08.08 0 0 1 .03-.06l5.02-2.9a4.68 4.68 0 0 1 6.95 4.85ZM8.68 13.5l-2.1-1.21a.07.07 0 0 1-.04-.06V6.42a4.68 4.68 0 0 1 7.68-3.58l-.17.09-4.96 2.87a.81.81 0 0 0-.41.7v7Zm1.14-2.46L12 9.64l2.18 1.26v2.52L12 14.68l-2.18-1.26v-2.52Z"/></svg>`,
    "google-gemini": `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"/></svg>`,
    kimi: `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M21.846 0a1.923 1.923 0 110 3.846H20.15a.226.226 0 01-.227-.226V1.923C19.923.861 20.784 0 21.846 0z"/><path d="M11.065 11.199l7.257-7.2c.137-.136.06-.41-.116-.41H14.3a.164.164 0 00-.117.051l-7.82 7.756c-.122.12-.302.013-.302-.179V3.82c0-.127-.083-.23-.185-.23H3.186c-.103 0-.186.103-.186.23V19.77c0 .128.083.23.186.23h2.69c.103 0 .186-.102.186-.23v-3.25c0-.069.025-.135.069-.178l2.424-2.406a.158.158 0 01.205-.023l6.484 4.772a7.677 7.677 0 003.453 1.283c.108.012.2-.095.2-.23v-3.06c0-.117-.07-.212-.164-.227a5.028 5.028 0 01-2.027-.807l-5.613-4.064c-.117-.078-.132-.279-.028-.381z"/></svg>`,
    qwen: `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12.604 1.34c.393.69.784 1.382 1.174 2.075a.18.18 0 00.157.091h5.552c.174 0 .322.11.446.327l1.454 2.57c.19.337.24.478.024.837-.26.43-.513.864-.76 1.3l-.367.658c-.106.196-.223.28-.04.512l2.652 4.637c.172.301.111.494-.043.77-.437.785-.882 1.564-1.335 2.34-.159.272-.352.375-.68.37-.777-.016-1.552-.01-2.327.016a.099.099 0 00-.081.05 575.097 575.097 0 01-2.705 4.74c-.169.293-.38.363-.725.364-.997.003-2.002.004-3.017.002a.537.537 0 01-.465-.271l-1.335-2.323a.09.09 0 00-.083-.049H4.982c-.285.03-.553-.001-.805-.092l-1.603-2.77a.543.543 0 01-.002-.54l1.207-2.12a.198.198 0 000-.197 550.951 550.951 0 01-1.875-3.272l-.79-1.395c-.16-.31-.173-.496.095-.965.465-.813.927-1.625 1.387-2.436.132-.234.304-.334.584-.335a338.3 338.3 0 012.589-.001.124.124 0 00.107-.063l2.806-4.895a.488.488 0 01.422-.246c.524-.001 1.053 0 1.583-.006L11.704 1c.341-.003.724.032.9.34zm-3.432.403a.06.06 0 00-.052.03L6.254 6.788a.157.157 0 01-.135.078H3.253c-.056 0-.07.025-.041.074l5.81 10.156c.025.042.013.062-.034.063l-2.795.015a.218.218 0 00-.2.116l-1.32 2.31c-.044.078-.021.118.068.118l5.716.008c.046 0 .08.02.104.061l1.403 2.454c.046.081.092.082.139 0l5.006-8.76.783-1.382a.055.055 0 01.096 0l1.424 2.53a.122.122 0 00.107.062l2.763-.02a.04.04 0 00.035-.02.041.041 0 000-.04l-2.9-5.086a.108.108 0 010-.113l.293-.507 1.12-1.977c.024-.041.012-.062-.035-.062H9.2c-.059 0-.073-.026-.043-.077l1.434-2.505a.107.107 0 000-.114L9.225 1.774a.06.06 0 00-.053-.031zm6.29 8.02c.046 0 .058.02.034.06l-.832 1.465-2.613 4.585a.056.056 0 01-.05.029.058.058 0 01-.05-.029L8.498 9.841c-.02-.034-.01-.052.028-.054l.216-.012 6.722-.012z"/></svg>`,
    anthropic: `<svg width="17" height="17" viewBox="0 0 248 248" fill="currentColor"><path d="M52.43 162.87l46.35-25.99.77-2.28-.77-1.27h-2.29l-7.77-.47-26.49-.71-22.92-.95-22.29-1.18-5.6-1.18L6.2 121.87l.51-3.43 4.71-3.19 6.75.59 14.9 1.06 22.41 1.54 16.18.94 24.07 2.48h3.82l.51-1.54-1.27-.94-1.02-.95-23.18-15.72-25.09-16.54-13.12-9.57-7-4.84-3.57-4.49-1.53-9.93 6.37-6.99 8.66.59 2.16.59 8.79 6.74 18.72 14.53 24.45 17.96 3.57 2.95 1.44-.97.22-.68-1.66-2.72-13.24-23.99-14.14-24.46-6.37-10.16-1.65-6.03c-.65-2.53-1.02-4.62-1.02-7.2l7.26-9.93 4.07-1.3 9.81 1.3 4.07 3.54 6.12 13.94 9.81 21.86 15.28 29.77 4.46 8.86 2.42 8.15.89 2.48h1.53v-1.42l1.27-16.78 2.3-20.56 2.29-26.47.76-7.44 3.7-8.98 7.38-4.84 5.73 2.72 4.71 6.73-.64 4.37-2.8 18.2-5.48 28.47-3.57 19.14h2.04l2.42-2.48 9.68-12.76 16.17-20.32 7.14-8.04 8.4-8.86 5.35-3.25h10.19l7.39 11.11-3.31 11.46-10.44 13.23-8.66 11.22-12.42 16.64-7.69 13.38.69 1.1 1.86-.16 27.98-6.03 15.16-2.72 18.08-3.07 8.15 3.78.89 3.9-3.18 7.92-19.36 4.73-22.67 4.6-33.76 7.95-.37.3.44.65 15.22 1.38 6.5.35h15.92l29.67 2.25 7.77 5.08 4.58 6.26-.76 4.84-11.97 6.03-16.05-3.78-37.57-8.98-12.86-3.19h-1.78v1.06l10.7 10.52 19.74 17.72 24.58 22.92 1.27 5.67-3.18 4.49-3.31-.47-21.65-16.31-8.4-7.32-18.85-15.95h-1.27v1.65l4.33 6.38 23.05 34.62 1.15 10.63-1.66 3.43-5.98 2.13-6.5-1.18-13.62-19.02-13.88-21.27-11.21-19.14-1.35.85-6.67 71.22-3.06 3.66-7.13 2.72-5.98-4.49-3.18-7.33 3.18-14.53 3.82-18.9 3.06-15.01 2.8-18.67 1.71-6.24.15-.42-1.37.23-14.07 19.3-21.4 28.95-16.93 17.96-4.08 1.65-7-3.66-.64-6.5 3.95-5.79 23.43-29.77 14.14-18.55 9.11-10.65-.09-1.54-.5-.04-62.26 40.59-11.08 1.42-4.84-4.49.64-6.5 2.29-2.36 18.72-15.24Z"/></svg>`,
    openai: `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M22.28 9.37a6.2 6.2 0 0 0-.54-5.1 6.29 6.29 0 0 0-6.78-3.02A6.23 6.23 0 0 0 10.28 0a6.29 6.29 0 0 0-6 4.35 6.22 6.22 0 0 0-4.15 3.02 6.29 6.29 0 0 0 .78 7.37 6.2 6.2 0 0 0 .54 5.1 6.29 6.29 0 0 0 6.78 3.02A6.23 6.23 0 0 0 13.72 24a6.29 6.29 0 0 0 6-4.35 6.22 6.22 0 0 0 4.15-3.02 6.29 6.29 0 0 0-.78-7.37ZM13.72 22.43a4.65 4.65 0 0 1-2.99-1.09l.17-.09 4.96-2.87a.81.81 0 0 0 .41-.7v-7l2.1 1.21a.07.07 0 0 1 .04.06v5.81a4.68 4.68 0 0 1-4.69 4.67ZM3.53 18.29a4.65 4.65 0 0 1-.56-3.13l.17.1 4.96 2.87a.81.81 0 0 0 .81 0l6.06-3.5v2.42a.08.08 0 0 1-.03.06l-5.02 2.9a4.68 4.68 0 0 1-6.39-1.72ZM2.27 7.89A4.65 4.65 0 0 1 4.7 5.84v5.9a.81.81 0 0 0 .41.7l6.06 3.5-2.1 1.21a.08.08 0 0 1-.07 0L3.99 14.3a4.68 4.68 0 0 1-1.72-6.4Zm17.17 4L13.38 8.4l2.1-1.21a.08.08 0 0 1 .07 0l5.01 2.9a4.68 4.68 0 0 1-.72 8.45v-5.96a.81.81 0 0 0-.4-.7Zm2.09-3.15-.17-.1-4.96-2.87a.81.81 0 0 0-.81 0l-6.06 3.5V6.85a.08.08 0 0 1 .03-.06l5.02-2.9a4.68 4.68 0 0 1 6.95 4.85ZM8.68 13.5l-2.1-1.21a.07.07 0 0 1-.04-.06V6.42a4.68 4.68 0 0 1 7.68-3.58l-.17.09-4.96 2.87a.81.81 0 0 0-.41.7v7Zm1.14-2.46L12 9.64l2.18 1.26v2.52L12 14.68l-2.18-1.26v-2.52Z"/></svg>`,
    google: `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"/></svg>`,
    deepseek: `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588z"/></svg>`,
    mistral: `<svg width="17" height="17" viewBox="0 0 24 24"><path d="M3.428 3.4h3.429v3.428H3.428V3.4zm13.714 0h3.43v3.428h-3.43V3.4z" fill="currentColor"/><path d="M3.428 6.828h6.857v3.429H3.429V6.828zm10.286 0h6.857v3.429h-6.857V6.828z" fill="currentColor" opacity=".6"/><path d="M3.428 10.258h17.144v3.428H3.428v-3.428z" fill="currentColor"/><path d="M3.428 13.686h3.429v3.428H3.428v-3.428zm6.858 0h3.429v3.428h-3.429v-3.428zm6.856 0h3.43v3.428h-3.43v-3.428z" fill="currentColor" opacity=".6"/><path d="M0 17.114h10.286v3.429H0v-3.429zm13.714 0H24v3.429H13.714v-3.429z" fill="currentColor"/></svg>`,
    xai: `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd"><path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815"/></svg>`,
    groq: `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd"><path d="M12.036 2c-3.853-.035-7 3-7.036 6.781-.035 3.782 3.055 6.872 6.908 6.907h2.42v-2.566h-2.292c-2.407.028-4.38-1.866-4.408-4.23-.029-2.362 1.901-4.298 4.308-4.326h.1c2.407 0 4.358 1.915 4.365 4.278v6.305c0 2.342-1.944 4.25-4.323 4.279a4.375 4.375 0 01-3.033-1.252l-1.851 1.818A7 7 0 0012.029 22h.092c3.803-.056 6.858-3.083 6.879-6.816v-6.5C18.907 4.963 15.817 2 12.036 2z"/></svg>`,
    openrouter: `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd"><path d="M16.804 1.957l7.22 4.105v.087L16.73 10.21l.017-2.117-.821-.03c-1.059-.028-1.611.002-2.268.11-1.064.175-2.038.577-3.147 1.352L8.345 11.03c-.284.195-.495.336-.68.455l-.515.322-.397.234.385.23.53.338c.476.314 1.17.796 2.701 1.866 1.11.775 2.083 1.177 3.147 1.352l.3.045c.694.091 1.375.094 2.825.033l.022-2.159 7.22 4.105v.087L16.589 22l.014-1.862-.635.022c-1.386.042-2.137.002-3.138-.162-1.694-.28-3.26-.926-4.881-2.059l-2.158-1.5a21.997 21.997 0 00-.755-.498l-.467-.28a55.927 55.927 0 00-.76-.43C2.908 14.73.563 14.116 0 14.116V9.888l.14.004c.564-.007 2.91-.622 3.809-1.124l1.016-.58.438-.274c.428-.28 1.072-.726 2.686-1.853 1.621-1.133 3.186-1.78 4.881-2.059 1.152-.19 1.974-.213 3.814-.138l.02-1.907z"/></svg>`,
  };

  function build() {
    // OAuth section
    container.append(
      h("div", { className: "dp-section-title" }, "OAuth Providers"),
      h("div", { className: "dp-section-hint" }, "Sign in with your existing subscriptions."),
    );
    const oauthCard = h("div", { className: "dp-card" });
    oauthProviders.forEach((p, i) => oauthCard.append(buildRow(p, i < oauthProviders.length - 1, p.hint)));
    container.append(oauthCard);

    // API section
    container.append(
      h("div", { className: "dp-section-title", style: { marginTop: "20px" } }, "API Key Providers"),
      h("div", { className: "dp-section-hint" }, "Enter API keys for direct provider access."),
    );
    const apiCard = h("div", { className: "dp-card" });
    apiProviders.forEach((p, i) => apiCard.append(buildRow(p, i < apiProviders.length - 1, "Enter API key for direct access")));
    container.append(apiCard);
  }

  function buildRow(p, border, hint) {
    const isOn = !!connected[p.id];

    const row = h("div", { className: `dp-row ${border ? "dp-row-border" : ""} dp-row--click` });
    row.addEventListener("click", () => openProviderModal(p));

    const iconWrap = h("div", { className: "dp-icon-wrap" });
    const icon = h("div", { className: `dp-icon ${!isOn ? "dp-icon--dim" : ""}` });
    if (providerSvgs[p.id]) icon.innerHTML = providerSvgs[p.id];
    else { icon.textContent = p.label.charAt(0); icon.style.fontSize = "13px"; icon.style.fontWeight = "700"; }
    const dot = statusDot(isOn ? "on" : "off");
    dotEls[p.id] = dot;
    iconWrap.append(icon, dot);

    const info = h("div", { className: "dp-info" });
    info.append(h("div", { className: "dp-name dp-name--on" }, p.label), h("div", { className: "dp-hint" }, hint || ""));

    const sp = spinner(16);
    sp.style.display = "none";
    spinnerEls[p.id] = sp;

    const detail = h("span", { className: "dp-detail" });
    detail.textContent = (isOn && p.id === defaultProv) ? "Default provider" : "";
    detail.style.display = (isOn && p.id === defaultProv) ? "" : "none";
    detailEls[p.id] = detail;

    const tgl = createToggle(isOn, (v) => toggleProvider(p.id, v));
    toggleEls[p.id] = tgl;

    row.append(iconWrap, info, sp, detail, tgl);
    return row;
  }

  function toggleProvider(id, v) {
    if (!v) {
      delete connected[id];
      dotEls[id]._setStatus("off");
      detailEls[id].style.display = "none";
      toggleEls[id]._setOn(false);
      showToast(container, `${id} disconnected`);
      return;
    }
    // Simulate connecting
    toggleEls[id]._setDisabled(true);
    dotEls[id]._setStatus("busy");
    spinnerEls[id].style.display = "";
    setTimeout(() => {
      connected[id] = true;
      spinnerEls[id].style.display = "none";
      dotEls[id]._setStatus("on");
      toggleEls[id]._setOn(true);
      toggleEls[id]._setDisabled(false);
      showToast(container, `${id} connected`);
    }, 1400);
  }

  function openProviderModal(p) {
    if (!connected[p.id]) return;
    const icon = h("div", { className: "dp-icon", style: { width: "36px", height: "36px" } });
    if (providerSvgs[p.id]) icon.innerHTML = providerSvgs[p.id];
    const body = h("div", {}, h("p", { className: "dp-hint", style: { fontSize: "12px", lineHeight: "1.6" } }, p.hint || "Manage your connection settings and default model preferences."));
    const doneBtn = h("button", { className: "dp-btn dp-btn--filled" }, "Done");
    showModal(container, {
      icon,
      title: p.label,
      statusText: "Connected",
      body,
      actions: [doneBtn],
    });
  }

  build();
}

// ─── INTEGRATIONS DEMO ───────────────────────────────────────────────────────

function mountIntegrations(container) {
  const items = [
    { id: "whatsapp", title: "WhatsApp", desc: "Send and receive messages via WhatsApp", detail: "3 chats excluded", iconPath: `<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>` },
    { id: "email", title: "Email", desc: "Read and send emails from linked accounts", detail: "All accounts", iconPath: `<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>` },
    { id: "telegram", title: "Telegram", desc: "Connect a Telegram bot for messaging", detail: "@clawjs_bot", iconPath: `<path d="m21.7 3.3-19.4 7.5c-.8.3-.8 1.5 0 1.8l4.9 1.6 2 6.3c.2.5.8.7 1.2.4l2.9-2.1 4.7 3.5c.5.4 1.3.1 1.4-.5L22.9 4.5c.2-.8-.5-1.4-1.2-1.2z"/><line x1="10.2" y1="13.8" x2="21.7" y2="3.3"/>` },
    { id: "slack", title: "Slack", desc: "Post and read messages in Slack workspaces", iconPath: `<path d="M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5z"/><path d="M20.5 10H19V8.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/><path d="M9.5 14c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5S8 21.33 8 20.5v-5c0-.83.67-1.5 1.5-1.5z"/><path d="M3.5 14H5v1.5c0 .83-.67 1.5-1.5 1.5S2 16.33 2 15.5 2.67 14 3.5 14z"/><path d="M14 14.5c0-.83.67-1.5 1.5-1.5h5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-5c-.83 0-1.5-.67-1.5-1.5z"/><path d="M14 20.5c0 .83-.67 1.5-1.5 1.5H11v-1.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5z"/><path d="M10 9.5C10 10.33 9.33 11 8.5 11h-5C2.67 11 2 10.33 2 9.5S2.67 8 3.5 8h5c.83 0 1.5.67 1.5 1.5z"/><path d="M10 3.5C10 2.67 10.67 2 11.5 2H13v1.5c0 .83-.67 1.5-1.5 1.5S10 4.33 10 3.5z"/>` },
    { id: "calendar", title: "Calendar", desc: "Access calendar events and schedule", detail: "All calendars", iconPath: `<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>` },
    { id: "contacts", title: "Contacts", desc: "Access contacts from macOS Contacts.app", detail: "247 contacts", iconPath: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>` },
  ];

  const enabled = { whatsapp: true, email: true, telegram: true, slack: false, calendar: true, contacts: false };
  const toggleEls = {};
  const dotEls = {};
  const spinnerEls = {};
  const detailEls = {};
  const iconEls = {};

  function build() {
    const card = h("div", { className: "dp-card" });

    items.forEach((item, i) => {
      const isOn = !!enabled[item.id];
      const row = h("div", { className: `dp-row ${i < items.length - 1 ? "dp-row-border" : ""} ${isOn ? "dp-row--click" : ""}` });
      row.addEventListener("click", () => { if (enabled[item.id]) openIntegrationModal(item); });

      const iconWrap = h("div", { className: "dp-icon-wrap" });
      const icon = h("div", { className: `dp-icon ${!isOn ? "dp-icon--dim" : ""}` });
      icon.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${item.iconPath}</svg>`;
      iconEls[item.id] = icon;
      const dot = statusDot(isOn ? "on" : "off");
      dotEls[item.id] = dot;
      iconWrap.append(icon, dot);

      const info = h("div", { className: "dp-info" });
      info.append(h("div", { className: "dp-name dp-name--on" }, item.title), h("div", { className: "dp-hint" }, item.desc));

      const sp = spinner(16);
      sp.style.display = "none";
      spinnerEls[item.id] = sp;

      const detail = h("span", { className: "dp-detail" });
      detail.textContent = (isOn && item.detail) ? item.detail : "";
      detail.style.display = (isOn && item.detail) ? "" : "none";
      detailEls[item.id] = detail;

      const tgl = createToggle(isOn, (v) => toggleIntegration(item.id, v, row));
      toggleEls[item.id] = tgl;

      row.append(iconWrap, info, sp, detail, tgl);
      card.append(row);
    });

    container.append(card);
  }

  function toggleIntegration(id, v, row) {
    const item = items.find((i) => i.id === id);
    if (!v) {
      enabled[id] = false;
      dotEls[id]._setStatus("off");
      iconEls[id].classList.add("dp-icon--dim");
      detailEls[id].style.display = "none";
      row.classList.remove("dp-row--click");
      showToast(container, `${item.title} disabled`);
      return;
    }
    // Connecting phase
    toggleEls[id]._setDisabled(true);
    dotEls[id]._setStatus("busy");
    spinnerEls[id].style.display = "";
    detailEls[id].style.display = "none";
    setTimeout(() => {
      // Syncing phase
      spinnerEls[id].style.display = "none";
      const syncSp = spinner(16);
      spinnerEls[id].parentElement.insertBefore(syncSp, spinnerEls[id]);
      spinnerEls[id] = syncSp;
      setTimeout(() => {
        // Connected
        enabled[id] = true;
        syncSp.style.display = "none";
        dotEls[id]._setStatus("on");
        iconEls[id].classList.remove("dp-icon--dim");
        toggleEls[id]._setOn(true);
        toggleEls[id]._setDisabled(false);
        row.classList.add("dp-row--click");
        if (item.detail) { detailEls[id].textContent = item.detail; detailEls[id].style.display = ""; fadeIn(detailEls[id]); }
        showToast(container, `${item.title} connected`);
      }, 1000);
    }, 900);
  }

  function openIntegrationModal(item) {
    const icon = h("div", { className: "dp-icon", style: { width: "36px", height: "36px" } });
    icon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${item.iconPath}</svg>`;
    const body = h("div", {}, h("p", { className: "dp-hint", style: { fontSize: "12px", lineHeight: "1.6" } }, `Manage ${item.title} settings, exclusions, and sync preferences.`));
    const doneBtn = h("button", { className: "dp-btn dp-btn--filled" }, "Done");
    showModal(container, { icon, title: item.title, statusText: "Connected", body, actions: [doneBtn] });
  }

  build();
}

// ─── CHAT DEMO ──────────────────────────────────────────────────────────────

function mountChat(container) {
  // ── Data: sessions with their own conversations ──
  const allSessions = [
    {
      id: "s1", title: "Generate invoice PDF", preview: "Created invoice #1042 for Acme Corp...", time: "2m ago",
      messages: [
        { role: "user", text: "Generate a PDF invoice for Acme Corp, order #1042, total $4,200. Use our standard template." },
        { role: "assistant", text: "On it. Here's what I did:\n\n- **Located template** at `~/templates/invoice-standard.html`\n- **Populated fields**: client Acme Corp, order #1042, total $4,200.00, date March 27 2026\n- **Rendered to PDF** using Puppeteer headless\n\nThe invoice is saved at `~/invoices/acme-corp-1042.pdf`. I also attached it to the Acme Corp record in your CRM.\n\nWant me to email it to their billing contact?" },
        { role: "user", text: "Yes, send it to billing@acmecorp.com with our usual payment terms." },
        { role: "assistant", text: "Done. Email sent to **billing@acmecorp.com** with:\n\n- Subject: *Invoice #1042 from ClawJS Inc*\n- PDF attached, 48 KB\n- Payment terms: **Net 30**, bank details included in footer\n\nI've logged the send in your CRM timeline so the sales team can track it." },
      ],
    },
    {
      id: "s2", title: "Refactor auth module", preview: "Migrated session tokens to JWT...", time: "1h ago",
      messages: [
        { role: "user", text: "Refactor the auth module to use JWT instead of session cookies. Keep backwards compat for 2 weeks." },
        { role: "assistant", text: "I've analyzed the codebase. Here's the migration plan:\n\n- **8 files** need changes across `src/auth/` and `src/middleware/`\n- Added `jsonwebtoken` and `jose` as dependencies\n- Created a **dual-mode middleware** that accepts both JWT headers and legacy session cookies\n\nThe old cookie path logs a deprecation warning. I've already pushed the branch `feat/jwt-auth`.\n\nWant me to run the test suite?" },
        { role: "user", text: "Run tests and show me what breaks." },
        { role: "assistant", text: "Test results: **47 passed**, **3 failed**.\n\nThe failures are all in `auth.integration.test.ts`:\n\n- `test_session_refresh` expects a `Set-Cookie` header, now gets a `Authorization` header instead\n- `test_logout` was clearing cookies, needs to also invalidate the JWT\n- `test_csrf_check` no longer applies to JWT flow\n\nI've already fixed all three. Updated branch pushed. CI is green now." },
      ],
    },
    {
      id: "s3", title: "Deploy to staging", preview: "Ran migrations and deployed v2.3...", time: "3h ago",
      messages: [
        { role: "user", text: "Deploy the current main branch to staging. Run migrations first." },
        { role: "assistant", text: "Deploying to staging:\n\n- **Pulled** latest `main` (commit `a3f7c2e`)\n- **Ran 3 pending migrations**: `add_user_preferences`, `create_audit_log`, `index_sessions_table`\n- **Built** production bundle, 2.1 MB gzipped\n- **Deployed** to `staging.clawjs.dev`\n\nAll health checks are passing. The deploy took 48 seconds total." },
      ],
    },
    {
      id: "s4", title: "Scan project for TODOs", preview: "Found 14 pending TODOs across 8 files...", time: "Yesterday",
      messages: [
        { role: "user", text: "Scan the entire project for TODO and FIXME comments. Group by priority." },
        { role: "assistant", text: "Found **14 TODOs** and **3 FIXMEs** across 8 files:\n\n- **Critical (2)**: memory leak in `worker-pool.ts:142`, race condition in `queue.ts:89`\n- **High (4)**: missing input validation in 3 API routes, outdated error codes in `errors.ts`\n- **Medium (6)**: refactor suggestions, dead code removal\n- **Low (5)**: cosmetic improvements, typos in comments\n\nWant me to create GitHub issues for the critical ones?" },
      ],
    },
    {
      id: "s5", title: "Backup database", preview: "Exported prod snapshot to S3...", time: "Mar 22",
      messages: [
        { role: "user", text: "Take a full backup of the production database and upload it to S3." },
        { role: "assistant", text: "Backup complete:\n\n- **Exported** full `pg_dump` of `clawjs_prod`, 340 MB compressed\n- **Uploaded** to `s3://clawjs-backups/2026-03-22/prod-full.sql.gz`\n- **Verified** checksum: SHA-256 matches\n- **Retention**: tagged with 90-day lifecycle policy\n\nThe backup includes all schemas, extensions, and role grants. Restore tested successfully on a scratch instance." },
      ],
    },
  ];

  // Random agent responses for user-typed messages
  const agentResponses = [
    "Got it. I'll start working on that right away. Give me a moment to analyze the codebase and find the best approach.",
    "Understood. Let me check the project structure and dependencies first.\n\n- **Scanning** project files\n- **Analyzing** import graph\n- **Checking** for conflicts\n\nThis should take about 10 seconds.",
    "On it. I've found the relevant files and I'm making the changes now.\n\nI'll push a commit once everything looks clean.",
    "Sure. Let me break this down into steps:\n\n- **Step 1**: gather context from existing code\n- **Step 2**: implement the changes\n- **Step 3**: run tests to verify\n\nStarting now.",
    "Done. Everything has been updated and I've verified it works correctly.\n\nLet me know if you need anything else.",
    "I've looked into it. Here's what I found:\n\n- The issue is in `src/core/handler.ts` at line 247\n- A missing null check causes the crash\n- **Fix applied** and tests passing\n\nShould I open a PR?",
    "Already on it. I'm pulling the latest changes, running the build, and deploying.\n\nCurrent status: **building** (43% complete)",
    "I've created the file and added it to the project.\n\n- **Path**: `src/utils/helpers.ts`\n- **Exports**: 4 utility functions\n- **Tests**: added 12 test cases, all passing\n\nThe module is ready to use.",
  ];

  let activeSessionId = "s1";
  let autoplayTimer = null;
  let autoplayMsgIndex = 0;
  let isTypingResponse = false;
  let isRecording = false;
  let waveAnimFrame = null;
  let sessionCounter = allSessions.length;

  // ── Root layout ──
  const app = h("div", { className: "chat-app" });

  // ── Sidebar ──
  const sidebar = h("div", { className: "chat-sidebar" });

  const sidebarHeader = h("div", { className: "chat-sidebar__header" });
  const brand = h("div", { className: "chat-sidebar__brand" });
  brand.innerHTML = `<img src="/logo.png" alt="" class="chat-sidebar__logo"><span>ClawJS</span>`;
  const newBtn = h("button", { className: "chat-sidebar__new", title: "New chat" });
  newBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  sidebarHeader.append(brand, newBtn);
  sidebar.append(sidebarHeader);

  const sidebarLabel = h("div", { className: "chat-sidebar__label" }, "Recent");
  sidebar.append(sidebarLabel);

  const sessionList = h("div", { className: "chat-sidebar__list" });
  sidebar.append(sessionList);

  // Sidebar footer with settings
  const sidebarFooter = h("div", { className: "chat-sidebar__footer" });
  sidebarFooter.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg><span>Settings</span>`;
  sidebar.append(sidebarFooter);

  app.append(sidebar);

  // ── Main chat area ──
  const main = h("div", { className: "chat-main" });

  // Messages
  const messagesArea = h("div", { className: "chat-messages" });
  const messagesInner = h("div", { className: "chat-messages__inner" });
  messagesArea.append(messagesInner);

  let typingIndicator = null;
  const TYPING_SPEED = 16;
  const PAUSE_AFTER_MSG = 600;
  const PAUSE_BEFORE_ASSISTANT = 900;

  function scrollDown() { messagesArea.scrollTop = messagesArea.scrollHeight; }

  function addUserBubble(text) {
    const wrap = h("div", { className: "chat-msg chat-msg--user" });
    const bubble = h("div", { className: "chat-bubble chat-bubble--user" }, text);
    wrap.append(bubble);
    messagesInner.append(wrap);
    scrollDown();
  }

  function addVoiceBubble(durationStr) {
    const wrap = h("div", { className: "chat-msg chat-msg--user" });
    const bubble = h("div", { className: "chat-voice-bubble" });

    // Play/pause button
    const playBtn = h("button", { className: "chat-voice__play" });
    const vPlayIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4 11.9999V8.43989C4 4.01989 7.13 2.20989 10.96 4.41989L14.05 6.19989L17.14 7.97989C20.97 10.1899 20.97 13.8099 17.14 16.0199L14.05 17.7999L10.96 19.5799C7.13 21.7899 4 19.9799 4 15.5599V11.9999Z"/></svg>`;
    const vPauseIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M10.65 19.11V4.89C10.65 3.54 10.08 3 8.64 3H5.01C3.57 3 3 3.54 3 4.89V19.11C3 20.46 3.57 21 5.01 21H8.64C10.08 21 10.65 20.46 10.65 19.11Z"/><path d="M21 19.11V4.89C21 3.54 20.43 3 18.99 3H15.36C13.93 3 13.35 3.54 13.35 4.89V19.11C13.35 20.46 13.92 21 15.36 21H18.99C20.43 21 21 20.46 21 19.11Z"/></svg>`;
    playBtn.innerHTML = vPlayIcon;
    let vPlaying = false;

    // Progress bar
    const progressWrap = h("div", { className: "chat-voice__track" });
    const progressFill = h("div", { className: "chat-voice__fill" });
    progressWrap.append(progressFill);

    // Duration
    const dur = h("span", { className: "chat-voice__dur" }, durationStr);

    // Fake playback animation
    playBtn.addEventListener("click", () => {
      if (vPlaying) {
        vPlaying = false;
        playBtn.innerHTML = vPlayIcon;
        return;
      }
      vPlaying = true;
      playBtn.innerHTML = vPauseIcon;
      let pct = 0;
      function tick() {
        if (!vPlaying || pct >= 100) {
          vPlaying = false;
          playBtn.innerHTML = vPlayIcon;
          progressFill.style.width = "0%";
          return;
        }
        pct += 0.8;
        progressFill.style.width = pct + "%";
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });

    bubble.append(playBtn, progressWrap, dur);
    wrap.append(bubble);
    messagesInner.append(wrap);
    scrollDown();
  }

  function showTypingIndicator() {
    typingIndicator = h("div", { className: "chat-msg chat-msg--assistant" });
    const dots = h("div", { className: "chat-typing" });
    dots.innerHTML = '<span></span><span></span><span></span>';
    typingIndicator.append(dots);
    messagesInner.append(typingIndicator);
    scrollDown();
  }

  function removeTypingIndicator() {
    if (typingIndicator) { typingIndicator.remove(); typingIndicator = null; }
  }

  function renderMarkdown(text) {
    let html = text
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>");
    const blocks = html.split(/\n\n/);
    return blocks.map(block => {
      const lines = block.split("\n");
      const listItems = lines.filter(l => l.match(/^- /));
      if (listItems.length > 0 && listItems.length === lines.length) {
        return "<ul>" + listItems.map(l => `<li>${l.slice(2)}</li>`).join("") + "</ul>";
      }
      if (listItems.length > 0) {
        let result = "";
        let inList = false;
        for (const line of lines) {
          if (line.match(/^- /)) {
            if (!inList) { result += "<ul>"; inList = true; }
            result += `<li>${line.slice(2)}</li>`;
          } else {
            if (inList) { result += "</ul>"; inList = false; }
            result += `<p>${line}</p>`;
          }
        }
        if (inList) result += "</ul>";
        return result;
      }
      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    }).join("");
  }

  function typeAssistantMessage(text, onDone) {
    const wrap = h("div", { className: "chat-msg chat-msg--assistant" });
    const bubble = h("div", { className: "chat-bubble chat-bubble--assistant" });
    wrap.append(bubble);
    messagesInner.append(wrap);
    scrollDown();
    isTypingResponse = true;
    let i = 0;
    function tick() {
      if (i >= text.length) { bubble.innerHTML = renderMarkdown(text); scrollDown(); isTypingResponse = false; onDone?.(); return; }
      const chunk = Math.min(2, text.length - i);
      i += chunk;
      bubble.innerHTML = renderMarkdown(text.slice(0, i));
      scrollDown();
      setTimeout(tick, TYPING_SPEED);
    }
    tick();
  }

  // ── Autoplay a session's conversation ──
  function stopAutoplay() {
    if (autoplayTimer) { clearTimeout(autoplayTimer); autoplayTimer = null; }
    autoplayMsgIndex = 0;
  }

  function autoplaySession(session) {
    stopAutoplay();
    messagesInner.innerHTML = "";
    autoplayMsgIndex = 0;
    function playNext() {
      if (autoplayMsgIndex >= session.messages.length) return;
      const msg = session.messages[autoplayMsgIndex];
      autoplayMsgIndex++;
      if (msg.role === "user") {
        addUserBubble(msg.text);
        autoplayTimer = setTimeout(playNext, PAUSE_AFTER_MSG);
      } else {
        showTypingIndicator();
        autoplayTimer = setTimeout(() => {
          removeTypingIndicator();
          typeAssistantMessage(msg.text, () => {
            autoplayTimer = setTimeout(playNext, PAUSE_AFTER_MSG);
          });
        }, PAUSE_BEFORE_ASSISTANT);
      }
    }
    autoplayTimer = setTimeout(playNext, 400);
  }

  // ── Render sidebar session list ──
  function renderSessions() {
    sessionList.innerHTML = "";
    allSessions.forEach((s) => {
      const item = h("button", { className: `chat-session ${s.id === activeSessionId ? "chat-session--active" : ""}` });
      const title = h("div", { className: "chat-session__title" }, s.title);
      const preview = h("div", { className: "chat-session__preview" }, s.preview);
      const time = h("span", { className: "chat-session__time" }, s.time);
      item.append(title, preview, time);
      item.addEventListener("click", () => switchSession(s.id));
      sessionList.append(item);
    });
  }

  function switchSession(id) {
    if (id === activeSessionId && !isTypingResponse) return;
    stopAutoplay();
    removeTypingIndicator();
    isTypingResponse = false;
    activeSessionId = id;
    renderSessions();
    const session = allSessions.find(s => s.id === id);
    if (session) autoplaySession(session);
  }

  // ── New chat ──
  newBtn.addEventListener("click", () => {
    stopAutoplay();
    removeTypingIndicator();
    isTypingResponse = false;
    sessionCounter++;
    const newId = "s" + sessionCounter;
    allSessions.unshift({
      id: newId,
      title: "New chat",
      preview: "Start a new conversation...",
      time: "now",
      messages: [],
    });
    activeSessionId = newId;
    renderSessions();
    messagesInner.innerHTML = "";
    inputField.focus();
  });

  main.append(messagesArea);

  // ── Composer ──
  const composer = h("div", { className: "chat-composer" });
  const composerInner = h("div", { className: "chat-composer__inner" });

  // Plus button (rotates 45deg to become X when active)
  const plusBtn = h("button", { className: "chat-composer__plus" });
  plusBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

  // Input field (editable)
  const inputField = h("div", {
    className: "chat-composer__input",
    contentEditable: "true",
    role: "textbox",
  });
  inputField.dataset.placeholder = "Type a message...";

  // Recording UI container (hidden by default)
  const recWrap = h("div", { className: "chat-rec" });
  recWrap.style.display = "none";
  // Cancel
  const recCancelBtn = h("button", { className: "chat-rec__btn" });
  recCancelBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  // Red dot + timer group
  const recIndicator = h("div", { className: "chat-rec__indicator" });
  const recDot = h("span", { className: "chat-rec__dot" });
  const recTime = h("span", { className: "chat-rec__time" }, "0:00");
  recIndicator.append(recDot, recTime);
  // Waveform bars container
  const recBars = h("div", { className: "chat-rec__bars" });
  const BAR_COUNT = 48;
  const barEls = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const bar = h("span", { className: "chat-rec__bar" });
    recBars.append(bar);
    barEls.push(bar);
  }
  // Pause/resume
  const recPauseBtn = h("button", { className: "chat-rec__btn" });
  const pauseIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="4" x2="8" y2="20"/><line x1="16" y1="4" x2="16" y2="20"/></svg>`;
  const playIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  recPauseBtn.innerHTML = pauseIcon;
  // Send recording
  const recSendBtn = h("button", { className: "chat-rec__btn chat-rec__btn--send" });
  recSendBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.51 4.23L18.07 8.51C21.91 10.43 21.91 13.57 18.07 15.49L9.51 19.77C3.89 22.58 1.42 20.11 4.23 14.49L5.12 12.68C5.32 12.28 5.32 11.72 5.12 11.32L4.23 9.51C1.42 3.89 3.89 1.42 9.51 4.23Z"/><path d="M5.44 12H10.84"/></svg>`;
  recWrap.append(recCancelBtn, recIndicator, recBars, recPauseBtn, recSendBtn);

  // Action button: overlays send + mic icons with crossfade
  const actionBtn = h("button", { className: "chat-composer__action" });
  // Send icon (from demo app)
  const sendIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  sendIcon.setAttribute("width", "18"); sendIcon.setAttribute("height", "18");
  sendIcon.setAttribute("viewBox", "0 0 24 24"); sendIcon.setAttribute("fill", "none");
  sendIcon.setAttribute("stroke", "currentColor"); sendIcon.setAttribute("stroke-width", "1.5");
  sendIcon.setAttribute("stroke-linecap", "round"); sendIcon.setAttribute("stroke-linejoin", "round");
  sendIcon.classList.add("chat-composer__icon", "chat-composer__icon--send");
  sendIcon.innerHTML = `<path d="M9.51 4.23L18.07 8.51C21.91 10.43 21.91 13.57 18.07 15.49L9.51 19.77C3.89 22.58 1.42 20.11 4.23 14.49L5.12 12.68C5.32 12.28 5.32 11.72 5.12 11.32L4.23 9.51C1.42 3.89 3.89 1.42 9.51 4.23Z"/><path d="M5.44 12H10.84"/>`;
  // Mic icon (from demo app)
  const micIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  micIcon.setAttribute("width", "18"); micIcon.setAttribute("height", "18");
  micIcon.setAttribute("viewBox", "0 0 24 24"); micIcon.setAttribute("fill", "none");
  micIcon.setAttribute("stroke", "currentColor"); micIcon.setAttribute("stroke-width", "1.5");
  micIcon.setAttribute("stroke-linecap", "round"); micIcon.setAttribute("stroke-linejoin", "round");
  micIcon.classList.add("chat-composer__icon", "chat-composer__icon--mic");
  micIcon.innerHTML = `<path d="M12 15.5C14.21 15.5 16 13.71 16 11.5V6C16 3.79 14.21 2 12 2C9.79 2 8 3.79 8 6V11.5C8 13.71 9.79 15.5 12 15.5Z"/><path d="M4.35 9.65V11.35C4.35 15.57 7.78 19 12 19C16.22 19 19.65 15.57 19.65 11.35V9.65"/><path d="M12 19V22"/>`;
  actionBtn.append(sendIcon, micIcon);

  // ── Waveform animation ──
  let waveStartTime = 0;
  let recPaused = false;
  let recPausedElapsed = 0;
  const barSeeds = [];
  for (let b = 0; b < BAR_COUNT; b++) barSeeds.push(0.2 + Math.random() * 0.3);

  function animateRecording() {
    if (!isRecording) return;
    const t = recPaused ? recPausedElapsed / 1000 : (Date.now() - waveStartTime) / 1000;
    // Update bars
    for (let i = 0; i < BAR_COUNT; i++) {
      const base = barSeeds[i];
      const level = recPaused ? 0.15 : base + 0.35 * Math.sin(t * 3.5 + i * 0.6) + 0.15 * Math.sin(t * 5.2 + i * 1.1);
      barEls[i].style.height = Math.max(3, level * 20) + "px";
    }
    // Timer
    const elapsed = recPaused ? recPausedElapsed / 1000 : t;
    const secs = Math.floor(elapsed) % 60;
    const mins = Math.floor(elapsed / 60);
    recTime.textContent = mins + ":" + (secs < 10 ? "0" : "") + secs;
    waveAnimFrame = requestAnimationFrame(animateRecording);
  }

  function startRecording() {
    isRecording = true;
    recPaused = false;
    recPausedElapsed = 0;
    waveStartTime = Date.now();
    plusBtn.style.display = "none";
    inputField.style.display = "none";
    recWrap.style.display = "flex";
    actionBtn.style.display = "none";
    recDot.classList.add("chat-rec__dot--active");
    recPauseBtn.innerHTML = pauseIcon;
    animateRecording();
  }

  function stopRecording(send) {
    isRecording = false;
    recPaused = false;
    if (waveAnimFrame) { cancelAnimationFrame(waveAnimFrame); waveAnimFrame = null; }
    recWrap.style.display = "none";
    plusBtn.style.display = "";
    inputField.style.display = "";
    actionBtn.style.display = "";
    updateActionIcon();
    if (send) {
      const elapsed = recPausedElapsed > 0 ? recPausedElapsed / 1000 : (Date.now() - waveStartTime) / 1000;
      const secs = Math.floor(elapsed) % 60;
      const mins = Math.floor(elapsed / 60);
      const durationStr = mins + ":" + (secs < 10 ? "0" : "") + secs;
      sendVoiceMessage(durationStr);
    }
  }

  recPauseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (recPaused) {
      // Resume
      recPaused = false;
      waveStartTime = Date.now() - recPausedElapsed;
      recDot.classList.add("chat-rec__dot--active");
      recPauseBtn.innerHTML = pauseIcon;
    } else {
      // Pause
      recPausedElapsed = Date.now() - waveStartTime;
      recPaused = true;
      recDot.classList.remove("chat-rec__dot--active");
      recPauseBtn.innerHTML = playIcon;
    }
  });

  recCancelBtn.addEventListener("click", (e) => { e.stopPropagation(); stopRecording(false); });
  recSendBtn.addEventListener("click", (e) => { e.stopPropagation(); stopRecording(true); });

  actionBtn.addEventListener("click", () => {
    const hasText = getInputText().length > 0;
    if (hasText) {
      sendMessage(getInputText());
    } else {
      startRecording();
    }
  });

  // ── Send logic ──
  function getInputText() { return inputField.textContent.trim(); }

  function updateActionIcon() {
    const hasText = getInputText().length > 0;
    sendIcon.classList.toggle("chat-composer__icon--visible", hasText);
    micIcon.classList.toggle("chat-composer__icon--visible", !hasText);
  }
  // Initialize icon state
  sendIcon.classList.remove("chat-composer__icon--visible");
  micIcon.classList.add("chat-composer__icon--visible");

  inputField.addEventListener("input", updateActionIcon);
  inputField.addEventListener("focus", () => composerInner.classList.add("chat-composer__inner--focus"));
  inputField.addEventListener("blur", () => composerInner.classList.remove("chat-composer__inner--focus"));

  function sendMessage(text) {
    if (isTypingResponse || !text) return;
    stopAutoplay();
    addUserBubble(text);
    inputField.textContent = "";
    updateActionIcon();

    // Update session data
    const session = allSessions.find(s => s.id === activeSessionId);
    if (session) {
      session.messages.push({ role: "user", text });
      session.preview = text.slice(0, 36) + (text.length > 36 ? "..." : "");
      if (session.title === "New chat") session.title = text.slice(0, 24) + (text.length > 24 ? "..." : "");
      session.time = "now";
      renderSessions();
    }

    // Respond with a random agent reply
    showTypingIndicator();
    const reply = agentResponses[Math.floor(Math.random() * agentResponses.length)];
    setTimeout(() => {
      removeTypingIndicator();
      typeAssistantMessage(reply, () => {
        if (session) session.messages.push({ role: "assistant", text: reply });
      });
    }, PAUSE_BEFORE_ASSISTANT);
  }

  function sendVoiceMessage(durationStr) {
    if (isTypingResponse) return;
    stopAutoplay();
    addVoiceBubble(durationStr);

    const session = allSessions.find(s => s.id === activeSessionId);
    if (session) {
      session.messages.push({ role: "user", text: "Voice message (" + durationStr + ")" });
      session.preview = "Voice message " + durationStr;
      if (session.title === "New chat") session.title = "Voice message";
      session.time = "now";
      renderSessions();
    }

    showTypingIndicator();
    const reply = agentResponses[Math.floor(Math.random() * agentResponses.length)];
    setTimeout(() => {
      removeTypingIndicator();
      typeAssistantMessage(reply, () => {
        if (session) session.messages.push({ role: "assistant", text: reply });
      });
    }, PAUSE_BEFORE_ASSISTANT);
  }

  inputField.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(getInputText());
    }
  });

  composerInner.append(plusBtn, inputField, recWrap, actionBtn);
  composer.append(composerInner);
  main.append(composer);

  app.append(main);
  container.append(app);

  // Initial render
  renderSessions();
  autoplaySession(allSessions[0]);
}

// ─── TASKS / KANBAN DEMO ────────────────────────────────────────────────────

function mountTasks(container) {
  const COLUMNS = [
    { id: "backlog", label: "Backlog",     dot: "var(--gray-600)" },
    { id: "todo",    label: "To Do",       dot: "#f59e0b" },
    { id: "doing",   label: "In Progress", dot: "#3b82f6" },
    { id: "done",    label: "Done",        dot: "#34d399" },
  ];

  const PRIORITY_COLORS = { urgent: "#ef4444", high: "#f59e0b", medium: "#3b82f6", low: "#6b7280" };
  const PRIORITY_LABELS = { urgent: "Urgent", high: "High", medium: "Med", low: "Low" };
  const TAG_COLORS = {
    onboarding: { bg: "rgba(52,211,153,0.12)", color: "#34d399" },
    marketing:  { bg: "rgba(59,130,246,0.12)", color: "#60a5fa" },
    support:    { bg: "rgba(244,114,182,0.12)", color: "#f472b6" },
    finance:    { bg: "rgba(251,191,36,0.12)", color: "#fbbf24" },
    ops:        { bg: "rgba(168,85,247,0.12)", color: "#a855f7" },
    product:    { bg: "rgba(99,102,241,0.12)", color: "#818cf8" },
    sales:      { bg: "rgba(236,72,153,0.12)", color: "#ec4899" },
    hr:         { bg: "rgba(20,184,166,0.12)", color: "#14b8a6" },
  };

  // Named AI agents
  const AGENTS = {
    ops:       { name: "Ops Agent",       initials: "OA", color: "#a855f7" },
    marketing: { name: "Marketing Agent", initials: "MA", color: "#60a5fa" },
    support:   { name: "Support Agent",   initials: "SA", color: "#f472b6" },
    finance:   { name: "Finance Agent",   initials: "FA", color: "#fbbf24" },
    hr:        { name: "HR Agent",        initials: "HR", color: "#14b8a6" },
    sales:     { name: "Sales Agent",     initials: "SL", color: "#ec4899" },
  };

  const cards = [
    { id: "t1", title: "Draft Q2 campaign brief",          col: "doing",   priority: "high",   tags: ["marketing"],            agent: "marketing", progress: 65, due: "Today" },
    { id: "t2", title: "Resolve billing escalation #4021", col: "todo",    priority: "urgent", tags: ["support", "finance"],   agent: "support",   due: "Today" },
    { id: "t3", title: "Send offer letter to M. Torres",   col: "todo",    priority: "high",   tags: ["hr"],                  agent: "hr",        due: "Tomorrow" },
    { id: "t4", title: "Audit AWS spend for March",        col: "doing",   priority: "high",   tags: ["ops", "finance"],      agent: "finance",   progress: 40, subtasks: [3, 7] },
    { id: "t5", title: "Update pricing page copy",         col: "backlog", priority: "medium", tags: ["marketing", "product"], agent: null },
    { id: "t6", title: "Prepare investor deck update",     col: "backlog", priority: "medium", tags: ["finance"],             agent: null,        due: "Apr 2" },
    { id: "t7", title: "Close Acme Corp renewal",          col: "done",    priority: "high",   tags: ["sales"],               agent: "sales",     progress: 100 },
    { id: "t8", title: "Deploy monitoring dashboards",     col: "done",    priority: "medium", tags: ["ops"],                 agent: "ops",       progress: 100 },
    { id: "t9", title: "Schedule team retrospective",      col: "todo",    priority: "low",    tags: ["ops", "hr"],           agent: null,        due: "Mar 31" },
  ];

  // Animation sequence: agents pick up, work, complete
  const animations = [
    { cardId: "t2", to: "doing",  delay: 3000,  agent: "support",   log: "Picked up billing escalation #4021" },
    { cardId: "t3", to: "doing",  delay: 6500,  agent: "hr",        log: "Started drafting offer letter" },
    { cardId: "t9", to: "doing",  delay: 10000, agent: "ops",       log: "Scheduled retro for Friday 3pm" },
    { cardId: "t2", to: "done",   delay: 14000, agent: "support",   log: "Resolved escalation, refund issued" },
    { cardId: "t5", to: "todo",   delay: 17000, agent: "marketing", log: "Queued pricing page for review" },
    { cardId: "t4", to: "done",   delay: 20500, agent: "finance",   log: "Completed AWS audit, saved $2.4k" },
    { cardId: "t3", to: "done",   delay: 24000, agent: "hr",        log: "Sent offer letter to M. Torres" },
  ];

  const columnEls = {};
  const cardEls = {};
  const countEls = {};

  // ── Build shell ──
  const shell = h("div", { className: "kb-shell" });

  // ── Kanban board (left) ──
  const board = h("div", { className: "kb-board" });

  // Top bar with logo
  const topbar = h("div", { className: "kb-topbar" });
  const topLeft = h("div", { className: "kb-topbar__left" });
  topLeft.innerHTML = `<img src="/logo.png" alt="" class="kb-topbar__logo"><span class="kb-topbar__brand">ClawJS</span><span class="kb-topbar__sep">/</span><span class="kb-topbar__page">Task Board</span>`;
  const topMeta = h("div", { className: "kb-topbar__meta" });
  const totalCount = h("span", { className: "kb-topbar__count" }, `${cards.length} tasks`);
  const filterBtn = h("button", { className: "kb-topbar__filter" });
  filterBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg><span>Filter</span>`;
  topMeta.append(totalCount, filterBtn);
  topbar.append(topLeft, topMeta);
  board.append(topbar);

  // Columns
  const columnsWrap = h("div", { className: "kb-columns" });

  COLUMNS.forEach((col) => {
    const colEl = h("div", { className: "kb-col" });
    const colHeader = h("div", { className: "kb-col__header" });
    const colDot = h("span", { className: "kb-col__dot" });
    colDot.style.background = col.dot;
    const colLabel = h("span", { className: "kb-col__label" }, col.label);
    const colCount = h("span", { className: "kb-col__count" });
    countEls[col.id] = colCount;
    colHeader.append(colDot, colLabel, colCount);
    colEl.append(colHeader);
    const colBody = h("div", { className: "kb-col__body" });
    columnEls[col.id] = colBody;
    colEl.append(colBody);
    columnsWrap.append(colEl);
  });

  board.append(columnsWrap);
  shell.append(board);

  // ── Activity feed (right sidebar) ──
  const feed = h("div", { className: "kb-feed" });
  const feedHeader = h("div", { className: "kb-feed__header" });
  const feedDot = h("span", { className: "kb-feed__live-dot" });
  feedHeader.append(feedDot, h("span", {}, "Agent Activity"));
  feed.append(feedHeader);
  const feedList = h("div", { className: "kb-feed__list" });

  // Seed initial feed items
  const seedLogs = [
    { agent: "ops",       text: "Deployed monitoring dashboards to prod", time: "2m ago" },
    { agent: "sales",     text: "Closed Acme Corp renewal for $48k ARR",  time: "8m ago" },
    { agent: "marketing", text: "Campaign brief at 65%, pulling Q1 data", time: "12m ago" },
    { agent: "finance",   text: "Started AWS cost audit for March",       time: "18m ago" },
  ];

  function createFeedItem(agentKey, text, timeText) {
    const item = h("div", { className: "kb-feed__item" });
    const agentData = AGENTS[agentKey];
    const avatar = h("span", { className: "kb-feed__avatar" });
    avatar.textContent = agentData.initials;
    avatar.style.background = agentData.color + "20";
    avatar.style.color = agentData.color;
    const content = h("div", { className: "kb-feed__content" });
    content.append(
      h("span", { className: "kb-feed__name" }, agentData.name),
      h("span", { className: "kb-feed__text" }, text)
    );
    const time = h("span", { className: "kb-feed__time" }, timeText);
    item.append(avatar, content, time);
    return item;
  }

  seedLogs.forEach((l) => feedList.append(createFeedItem(l.agent, l.text, l.time)));
  feed.append(feedList);
  shell.append(feed);

  container.append(shell);

  // ── Render a card ──
  function renderCard(card) {
    const el = h("div", { className: "kb-card" });
    el.dataset.id = card.id;

    // Top row: priority + due
    const top = h("div", { className: "kb-card__top" });
    const priBadge = h("span", { className: "kb-card__priority" });
    priBadge.textContent = PRIORITY_LABELS[card.priority];
    priBadge.style.color = PRIORITY_COLORS[card.priority];
    priBadge.style.background = PRIORITY_COLORS[card.priority] + "18";
    top.append(priBadge);
    if (card.due) {
      const due = h("span", { className: "kb-card__due" }, card.due);
      if (card.due === "Today" || card.due === "Tomorrow") due.classList.add("kb-card__due--soon");
      top.append(due);
    }
    el.append(top);

    // Title
    el.append(h("div", { className: `kb-card__title ${card.col === "done" ? "kb-card__title--done" : ""}` }, card.title));

    // Tags
    if (card.tags?.length) {
      const tagsRow = h("div", { className: "kb-card__tags" });
      card.tags.forEach((t) => {
        const tag = h("span", { className: "kb-card__tag" }, t);
        const tc = TAG_COLORS[t] || TAG_COLORS.product;
        tag.style.background = tc.bg;
        tag.style.color = tc.color;
        tagsRow.append(tag);
      });
      el.append(tagsRow);
    }

    // Bottom row: agent badge + progress
    const bottom = h("div", { className: "kb-card__bottom" });
    const left = h("div", { className: "kb-card__bottom-left" });

    if (card.agent) {
      const agentData = AGENTS[card.agent];
      const agentBadge = h("div", { className: "kb-card__agent" });
      const av = h("span", { className: "kb-card__avatar" }, agentData.initials);
      av.style.background = agentData.color + "20";
      av.style.color = agentData.color;
      agentBadge.append(av);
      if (card.col === "doing") {
        const pulse = h("span", { className: "kb-card__pulse" });
        pulse.style.background = agentData.color;
        agentBadge.append(pulse);
      }
      left.append(agentBadge);
    }

    if (card.subtasks) {
      left.append(h("span", { className: "kb-card__subtasks" }, `${card.subtasks[0]}/${card.subtasks[1]}`));
    }
    bottom.append(left);

    if (card.progress != null && card.progress > 0 && card.progress < 100) {
      const bar = h("div", { className: "kb-card__bar" });
      const fill = h("div", { className: "kb-card__bar-fill" });
      fill.style.width = card.progress + "%";
      bar.append(fill);
      bottom.append(bar);
    }

    el.append(bottom);
    if (card.col === "done") el.classList.add("kb-card--done");
    return el;
  }

  // ── Counts ──
  function updateCounts() {
    COLUMNS.forEach((col) => {
      countEls[col.id].textContent = cards.filter((c) => c.col === col.id).length;
    });
  }

  cards.forEach((card) => {
    const el = renderCard(card);
    cardEls[card.id] = el;
    columnEls[card.col].append(el);
  });
  updateCounts();

  // ── Add feed entry with animation ──
  function addFeedEntry(agentKey, text) {
    const item = createFeedItem(agentKey, text, "Just now");
    item.style.opacity = "0";
    item.style.transform = "translateY(-6px)";
    feedList.insertBefore(item, feedList.firstChild);
    requestAnimationFrame(() => {
      item.style.transition = "opacity 300ms ease, transform 300ms ease";
      item.style.opacity = "1";
      item.style.transform = "translateY(0)";
    });
    while (feedList.children.length > 6) feedList.lastChild.remove();
  }

  // ── Move card with agent context ──
  function moveCard(cardId, toCol, agentKey, logText) {
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.col === toCol) return;
    if (agentKey) card.agent = agentKey;

    const el = cardEls[cardId];
    el.style.transition = "opacity 250ms ease, transform 250ms ease";
    el.style.opacity = "0";
    el.style.transform = "scale(0.95)";

    setTimeout(() => {
      card.col = toCol;
      el.remove();

      if (toCol === "done") {
        card.progress = 100;
        el.classList.add("kb-card--done");
        const titleEl = el.querySelector(".kb-card__title");
        if (titleEl) titleEl.classList.add("kb-card__title--done");
        const bar = el.querySelector(".kb-card__bar");
        if (bar) bar.parentElement.remove();
        const pulse = el.querySelector(".kb-card__pulse");
        if (pulse) pulse.remove();
      } else if (toCol === "doing" && card.agent) {
        // Add agent + pulse when agent picks up task
        let agentBadge = el.querySelector(".kb-card__agent");
        if (!agentBadge) {
          agentBadge = h("div", { className: "kb-card__agent" });
          const agentData = AGENTS[card.agent];
          const av = h("span", { className: "kb-card__avatar" }, agentData.initials);
          av.style.background = agentData.color + "20";
          av.style.color = agentData.color;
          agentBadge.append(av);
          const bottomLeft = el.querySelector(".kb-card__bottom-left");
          if (bottomLeft) bottomLeft.prepend(agentBadge);
        }
        if (!agentBadge.querySelector(".kb-card__pulse")) {
          const pulse = h("span", { className: "kb-card__pulse" });
          pulse.style.background = AGENTS[card.agent].color;
          agentBadge.append(pulse);
        }
      }

      const target = columnEls[toCol];
      if (target.firstChild) target.insertBefore(el, target.firstChild);
      else target.append(el);

      el.style.opacity = "0";
      el.style.transform = "translateY(-8px) scale(0.97)";
      requestAnimationFrame(() => {
        el.style.transition = "opacity 300ms ease, transform 300ms ease";
        el.style.opacity = "1";
        el.style.transform = "translateY(0) scale(1)";
      });

      updateCounts();
      if (logText && agentKey) addFeedEntry(agentKey, logText);
    }, 260);
  }

  // Progress animations
  function animateProgress(cardId, from, to, duration) {
    const el = cardEls[cardId];
    if (!el) return;
    const fill = el.querySelector(".kb-card__bar-fill");
    if (!fill) return;
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      fill.style.width = (from + (to - from) * t) + "%";
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // Save initial state for loop
  const initialState = {};
  cards.forEach((c) => { initialState[c.id] = { col: c.col, progress: c.progress, agent: c.agent }; });

  function scheduleAnimations() {
    // Reset
    cards.forEach((c) => {
      const s = initialState[c.id];
      c.col = s.col; c.progress = s.progress; c.agent = s.agent;
    });
    COLUMNS.forEach((col) => { columnEls[col.id].innerHTML = ""; });
    cards.forEach((card) => {
      const el = renderCard(card);
      cardEls[card.id] = el;
      columnEls[card.col].append(el);
    });
    updateCounts();
    feedList.innerHTML = "";
    seedLogs.forEach((l) => feedList.append(createFeedItem(l.agent, l.text, l.time)));

    // Progress ticks
    setTimeout(() => animateProgress("t1", 65, 90, 8000), 2000);
    setTimeout(() => animateProgress("t4", 40, 75, 6000), 4000);

    // Card moves + feed entries
    animations.forEach((a) => {
      setTimeout(() => moveCard(a.cardId, a.to, a.agent, a.log), a.delay);
    });

    setTimeout(scheduleAnimations, 28000);
  }

  scheduleAnimations();
}

// ─── CLI Terminal Animation ──────────────────────────────────────────────────

function mountCliTerminal(container) {
  // Each scene: a command typed char-by-char, then output lines appear
  const scenes = [
    {
      cmd: "claw new app my-agent",
      output: [
        '<span class="cli-dim">◌</span> Scaffolding project...',
        '<span class="cli-ok">✓</span> Created <span class="cli-cmd">claw.config.ts</span>',
        '<span class="cli-ok">✓</span> Created <span class="cli-cmd">skills/</span>, <span class="cli-cmd">channels/</span>, <span class="cli-cmd">plugins/</span>',
        '<span class="cli-ok">✓</span> Installed dependencies',
        '<span class="cli-ok">✓</span> Project ready at <span class="cli-cmd">./my-agent</span>',
      ],
    },
    {
      cmd: "claw add telegram",
      output: [
        '<span class="cli-dim">◌</span> Configuring channel...',
        '<span class="cli-ok">✓</span> Telegram integration added',
        '<span class="cli-ok">✓</span> Webhook endpoint registered',
        '<span class="cli-ok">✓</span> Bot commands synced',
      ],
    },
    {
      cmd: "claw doctor",
      output: [
        '<span class="cli-ok">✓</span> Runtime: <span class="cli-cmd">openclaw</span> v2.4.1',
        '<span class="cli-ok">✓</span> Workspace: valid',
        '<span class="cli-ok">✓</span> Providers: openai <span class="cli-ok">(connected)</span>, anthropic <span class="cli-ok">(connected)</span>',
        '<span class="cli-ok">✓</span> Channels: telegram <span class="cli-ok">(active)</span>, whatsapp <span class="cli-ok">(active)</span>',
        '<span class="cli-ok">✓</span> Skills: 4 loaded, 0 errors',
        '<span class="cli-ok">✓</span> Memory: operational',
        '',
        '  <span class="cli-cmd">All systems healthy.</span> No issues found.',
      ],
    },
    {
      cmd: "claw tasks create --title \"Review PR #42\"",
      output: [
        '<span class="cli-ok">✓</span> Task created: <span class="cli-cmd">Review PR #42</span>',
        '  ID: <span class="cli-dim">task-a8f3c</span>',
        '  Status: <span class="cli-warn">pending</span>',
      ],
    },
    {
      cmd: "claw sessions stream --session-id demo",
      output: [
        '<span class="cli-dim">◌</span> Connecting to agent...',
        '<span class="cli-ok">✓</span> Session <span class="cli-cmd">demo</span> active',
        '<span class="cli-dim">▸</span> Model: <span class="cli-cmd">anthropic/claude-sonnet-4-6</span>',
        '',
        '<span class="cli-cmd">Agent:</span> I\'ve reviewed PR #42. The auth middleware',
        '  changes look good. Two suggestions: extract the',
        '  token validation into a shared util, and add a',
        '  test for the refresh flow. Want me to draft the',
        '  changes?',
      ],
    },
  ];

  let timeout;
  let paused = false;
  let sceneIndex = 0;

  const terminal = container.closest(".cli-terminal");

  function addLine(html) {
    const div = document.createElement("div");
    div.className = "cli-line";
    div.innerHTML = html;
    container.appendChild(div);
    // Trigger reflow then animate
    requestAnimationFrame(() => div.classList.add("cli-line--visible"));
    // Auto-scroll
    container.scrollTop = container.scrollHeight;
    return div;
  }

  function typeCommand(text, callback) {
    const line = document.createElement("div");
    line.className = "cli-line cli-line--visible";
    const promptSpan = document.createElement("span");
    promptSpan.innerHTML = '<span class="cli-prompt">$</span> ';
    line.appendChild(promptSpan);
    const cmdSpan = document.createElement("span");
    cmdSpan.className = "cli-cmd";
    line.appendChild(cmdSpan);
    const cursor = document.createElement("span");
    cursor.className = "cli-cursor";
    line.appendChild(cursor);
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;

    let i = 0;
    function nextChar() {
      if (paused) { timeout = setTimeout(nextChar, 100); return; }
      if (i < text.length) {
        cmdSpan.textContent += text[i];
        i++;
        container.scrollTop = container.scrollHeight;
        // Variable speed: faster for middle chars, slower at start
        const speed = i < 3 ? 80 : 35 + Math.random() * 25;
        timeout = setTimeout(nextChar, speed);
      } else {
        cursor.remove();
        timeout = setTimeout(callback, 400);
      }
    }
    timeout = setTimeout(nextChar, 200);
  }

  function showOutput(lines, callback) {
    let i = 0;
    function nextLine() {
      if (paused) { timeout = setTimeout(nextLine, 100); return; }
      if (i < lines.length) {
        addLine(lines[i]);
        i++;
        timeout = setTimeout(nextLine, lines[i - 1] === "" ? 100 : 120);
      } else {
        timeout = setTimeout(callback, 600);
      }
    }
    nextLine();
  }

  function playScene(index) {
    if (index >= scenes.length) {
      // Pause, clear, restart from scene 0
      timeout = setTimeout(() => {
        container.innerHTML = "";
        sceneIndex = 0;
        playScene(0);
      }, 5000);
      return;
    }
    sceneIndex = index;
    const scene = scenes[index];

    // Add blank line between scenes (except first)
    if (index > 0) {
      addLine("");
    }

    typeCommand(scene.cmd, () => {
      showOutput(scene.output, () => {
        playScene(index + 1);
      });
    });
  }

  playScene(0);

  // Pause/resume on hover
  if (terminal) {
    terminal.addEventListener("mouseenter", () => { paused = true; });
    terminal.addEventListener("mouseleave", () => { paused = false; });
  }
}

// ─── Mount all demos ─────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  const oc = document.getElementById("demo-openclaw");
  const ai = document.getElementById("demo-ai");
  const ig = document.getElementById("demo-integrations");
  const ch = document.getElementById("demo-chat");
  const tk = document.getElementById("demo-tasks");
  const cli = document.getElementById("cli-terminal-body");
  if (oc) mountOpenClaw(oc);
  if (ai) mountAiModels(ai);
  if (ig) mountIntegrations(ig);
  if (ch) mountChat(ch);
  if (tk) mountTasks(tk);
  if (cli) mountCliTerminal(cli);
});
