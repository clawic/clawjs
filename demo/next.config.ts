import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["better-sqlite3"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; " +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: blob:; " +
              "media-src 'self' data: blob:; " +
              "font-src 'self' data:; " +
              "connect-src 'self' https://api.groq.com https://api.openai.com https://api.anthropic.com; " +
              "frame-ancestors 'none';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
