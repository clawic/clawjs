// ClawJS Website — Main JS

const DEMO_URL = import.meta.env.VITE_DEMO_URL?.trim() || "";

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

if (DEMO_URL) {
  // Ensure the top navigation exposes the demo link on every page.
  document.querySelectorAll(".nav__links").forEach((links) => {
    const hasDemo = Array.from(links.querySelectorAll("a")).some((link) => link.textContent.trim() === "Demo");
    if (hasDemo) return;

    const item = document.createElement("li");
    const anchor = document.createElement("a");
    anchor.href = DEMO_URL;
    anchor.textContent = "Demo";
    item.appendChild(anchor);

    const githubItem = links.querySelector(".nav__github")?.closest("li");
    if (githubItem?.parentElement === links) {
      links.insertBefore(item, githubItem);
      return;
    }
    links.appendChild(item);
  });

  document.querySelectorAll("[data-demo-link]").forEach((link) => {
    link.href = DEMO_URL;
  });
} else {
  document.querySelectorAll("[data-demo-link]").forEach((link) => {
    const container = link.closest("li, .feature-card");
    if (container) {
      container.remove();
      return;
    }
    link.remove();
  });
}

// Nav background on scroll
const nav = document.querySelector(".nav");
if (nav) {
  window.addEventListener("scroll", () => {
    nav.style.borderBottomColor =
      window.scrollY > 10
        ? "rgba(63, 63, 70, 0.5)"
        : "rgba(39, 39, 42, 1)";
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
