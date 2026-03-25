// Shared sidebar navigation for all doc pages
const DOCS_NAV = [
  {
    label: "Overview",
    links: [
      { href: "/docs/", text: "Introduction" },
      { href: "/docs/getting-started.html", text: "First Steps" },
    ],
  },
  {
    label: "Fundamentals",
    links: [
      { href: "/docs/terminology.html", text: "Terminology" },
      { href: "/docs/runtime.html", text: "Runtime" },
      { href: "/docs/workspace.html", text: "Workspace" },
      { href: "/docs/authentication.html", text: "Authentication" },
      { href: "/docs/models.html", text: "Models" },
      { href: "/docs/conversations.html", text: "Conversations" },
    ],
  },
  {
    label: "Techniques",
    links: [
      { href: "/docs/files.html", text: "Files & Templates" },
      { href: "/docs/watchers.html", text: "Watchers & Events" },
      { href: "/docs/diagnostics.html", text: "Diagnostics & Repair" },
    ],
  },
  {
    label: "Reference",
    links: [
      { href: "/docs/cli.html", text: "CLI" },
      { href: "/docs/api.html", text: "API Reference" },
      { href: "/docs/surface.html", text: "Public Surface" },
    ],
  },
  {
    label: "Resources",
    links: [
      { href: "https://github.com/clawic/clawjs", text: "GitHub", external: true },
      { href: "https://github.com/clawic/clawjs/issues", text: "Issues", external: true },
    ],
  },
];

function renderDocsSidebar() {
  const sidebar = document.querySelector(".docs-sidebar");
  if (!sidebar) return;

  const currentPath = window.location.pathname;

  sidebar.innerHTML = DOCS_NAV.map(
    (section) => `
    <div class="docs-sidebar__section">
      <p class="docs-sidebar__label">${section.label}</p>
      <ul class="docs-sidebar__links">
        ${section.links
          .map(
            (link) => `
          <li><a href="${link.href}"${link.external ? ' target="_blank"' : ""}
            class="${currentPath === link.href || (link.href !== "/docs/" && currentPath.startsWith(link.href)) ? "active" : ""}"
          >${link.text}</a></li>`
          )
          .join("")}
      </ul>
    </div>`
  ).join("");
}

document.addEventListener("DOMContentLoaded", renderDocsSidebar);
