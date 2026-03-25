import { defineConfig } from "vitepress";

export default defineConfig({
  title: "ClawJS",
  description: "The public ClawJS docs site, sourced from Markdown in docs/.",
  cleanUrls: true,
  outDir: "../website/dist",
  head: [
    ["link", { rel: "icon", href: "/favicon.ico" }],
    ["link", { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" }],
    ["link", { rel: "apple-touch-icon", href: "/apple-touch-icon.png" }],
  ],
  themeConfig: {
    logo: "/logo.png",
    nav: [
      { text: "Getting Started", link: "/getting-started" },
      { text: "CLI", link: "/cli" },
      { text: "API", link: "/api" },
      { text: "GitHub", link: "https://github.com/clawic/clawjs" },
    ],
    search: {
      provider: "local",
    },
    outline: {
      level: [2, 3],
      label: "On This Page",
    },
    sidebar: [
      {
        text: "Overview",
        items: [
          { text: "Introduction", link: "/" },
          { text: "Getting Started", link: "/getting-started" },
          { text: "Terminology", link: "/terminology" },
          { text: "Support Matrix", link: "/support-matrix" },
        ],
      },
      {
        text: "Core Concepts",
        items: [
          { text: "Runtime", link: "/runtime" },
          { text: "Workspace", link: "/workspace" },
          { text: "Authentication", link: "/authentication" },
          { text: "Models", link: "/models" },
          { text: "Conversations", link: "/conversations" },
          { text: "Files & Templates", link: "/files" },
          { text: "Watchers & Events", link: "/watchers" },
          { text: "Diagnostics & Repair", link: "/diagnostics" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "CLI", link: "/cli" },
          { text: "API Reference", link: "/api" },
          { text: "Public Surface", link: "/surface" },
        ],
      },
      {
        text: "Deep Dives",
        items: [
          { text: "Template Packs and Bindings", link: "/template-packs-and-bindings" },
          { text: "Runtime Migration Notes", link: "/runtime-migration-notes" },
          { text: "Chat Streaming Example", link: "/chat-streaming-example" },
          { text: "Onboarding Basic Example", link: "/onboarding-basic-example" },
          { text: "Provider and Channel Onboarding", link: "/provider-channel-onboarding-example" },
          { text: "Settings Channels Example", link: "/settings-channels-example" },
          { text: "Settings Runtime Agents Example", link: "/settings-runtime-agents-example" },
        ],
      },
      {
        text: "Repository",
        items: [
          { text: "Git Workflow", link: "/git-workflow" },
          { text: "Demo Terminology Note", link: "/demo-terminology-note" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/clawic/clawjs" },
    ],
    footer: {
      message: "ClawJS documentation site sourced from docs/ Markdown.",
      copyright: "ClawJS",
    },
  },
});
