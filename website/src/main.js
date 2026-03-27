// ClawJS Website — Main JS

// ── Hero Light Trails ──
(function heroTrails() {
  const canvas = document.getElementById('heroCanvas');
  const heroSection = canvas && canvas.closest('.hero');
  const hubEl = document.getElementById('heroHub');
  if (!canvas || !heroSection || !hubEl) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  let W, H, cx, cy;

  function resize() {
    const r = heroSection.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Hub center relative to the hero section
    const hr = hubEl.getBoundingClientRect();
    cx = hr.left + hr.width / 2 - r.left;
    cy = hr.top + hr.height / 2 - r.top;
  }
  resize();
  window.addEventListener('resize', resize);

  // A trail is a dot that travels along a quadratic bezier from hub to a random edge point (or reverse).
  // It leaves a fading trace behind it.
  const trails = [];
  const MAX_TRAILS = 6;

  function randEdge() {
    // Heavily bias horizontal (80% left/right, 20% top/bottom)
    const side = Math.random();
    const far = 500;
    if (side < 0.4) return { x: -far, y: cy + (Math.random() - 0.5) * H * 0.8 };
    if (side < 0.8) return { x: W + far, y: cy + (Math.random() - 0.5) * H * 0.8 };
    if (side < 0.9) return { x: Math.random() * W, y: -far * 0.5 };
    return { x: Math.random() * W, y: H + far * 0.5 };
  }

  function createTrail() {
    const edge = randEdge();
    const outbound = Math.random() > 0.4;
    const from = outbound ? { x: cx, y: cy } : edge;
    const to = outbound ? edge : { x: cx, y: cy };

    const mx = (from.x + to.x) / 2 + (Math.random() - 0.5) * 180;
    const my = (from.y + to.y) / 2 + (Math.random() - 0.5) * 120;

    const speed = 4 + Math.random() * 4; // 4-8 seconds, much slower
    return {
      from, to, mx, my,
      t: 0,
      duration: speed,
      trailPts: [],
      alive: true,
    };
  }

  // Quadratic bezier point
  function qBez(p0, cp, p1, t) {
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * cp.x + t * t * p1.x,
      y: u * u * p0.y + 2 * u * t * cp.y + t * t * p1.y,
    };
  }

  // Easing: smooth in-out
  function ease(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  let lastTime = 0;

  function frame(time) {
    const dt = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;

    ctx.clearRect(0, 0, W, H);

    // Spawn new trails to maintain count
    while (trails.length < MAX_TRAILS) {
      trails.push(createTrail());
    }

    for (let i = trails.length - 1; i >= 0; i--) {
      const tr = trails[i];
      tr.t += dt / tr.duration;

      if (tr.t >= 1) {
        trails.splice(i, 1);
        continue;
      }

      const et = ease(tr.t);
      const pos = qBez(tr.from, { x: tr.mx, y: tr.my }, tr.to, et);
      const maxDist = Math.max(W, H) * 1.4;

      // Store trail history
      tr.trailPts.push({ x: pos.x, y: pos.y, age: 0 });

      // Age trail points
      for (let j = tr.trailPts.length - 1; j >= 0; j--) {
        tr.trailPts[j].age += dt;
        if (tr.trailPts[j].age > 2.5) {
          tr.trailPts.splice(j, 1);
        }
      }

      // Draw trail (fading line segments, also fade with distance from center)
      if (tr.trailPts.length > 1) {
        for (let j = 1; j < tr.trailPts.length; j++) {
          const p0 = tr.trailPts[j - 1];
          const p1 = tr.trailPts[j];
          const ageFade = Math.max(0, 1 - p1.age / 2.5);
          const pdx = p1.x - cx, pdy = p1.y - cy;
          const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
          const pDistFade = Math.max(0, 1 - pDist / maxDist);
          const alpha = 0.09 * ageFade * pDistFade;
          if (alpha < 0.002) continue;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.strokeStyle = `rgba(227, 61, 85, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // Dot opacity: fade based on distance from center (further = dimmer)
      const dx = pos.x - cx, dy = pos.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const distFade = Math.max(0, 1 - dist / maxDist);
      const edgeFade = tr.t < 0.1 ? tr.t / 0.1 : tr.t > 0.85 ? (1 - tr.t) / 0.15 : 1;
      const dotAlpha = distFade * edgeFade;

      // Draw dot
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(227, 61, 85, ${0.45 * dotAlpha})`;
      ctx.fill();

      // Glow
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(227, 61, 85, ${0.07 * dotAlpha})`;
      ctx.fill();
    }

    requestAnimationFrame(frame);
  }

  // Start after page load
  window.addEventListener('load', () => {
    setTimeout(() => {
      lastTime = performance.now();
      requestAnimationFrame(frame);
    }, 600);
  });
})();

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", (e) => {
    e.preventDefault();
    const target = document.querySelector(anchor.getAttribute("href"));
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
    }
  });
});

// Nav floating pill: glass effect on scroll
const nav = document.querySelector(".nav");
if (nav) {
  window.addEventListener("scroll", () => {
    nav.classList.toggle("scrolled", window.scrollY > 20);
  });
}

// Copy button feedback
document.querySelectorAll(".install-bar__copy").forEach((btn) => {
  btn.addEventListener("click", () => {
    const original = btn.innerHTML;
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pink-400)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
    setTimeout(() => {
      btn.innerHTML = original;
    }, 2000);
  });
});

// ── Scroll reveal for sections ──
(function scrollReveal() {
  const targets = document.querySelectorAll(
    '.section__header, .capabilities, .features-grid, .cli-section__window, .chat-preview, .kanban-board, .cta'
  );
  if (!targets.length) return;

  targets.forEach(el => el.classList.add('sr'));

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('sr--visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  targets.forEach(el => observer.observe(el));
})();
