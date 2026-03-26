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

// ─── Mount all demos ─────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  const oc = document.getElementById("demo-openclaw");
  const ai = document.getElementById("demo-ai");
  const ig = document.getElementById("demo-integrations");
  if (oc) mountOpenClaw(oc);
  if (ai) mountAiModels(ai);
  if (ig) mountIntegrations(ig);
});
