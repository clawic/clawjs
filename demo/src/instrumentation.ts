export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      require("better-sqlite3");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("NODE_MODULE_VERSION") || msg.includes("was compiled against") || msg.includes("dlopen")) {
        console.error("\n[ClawJS] better-sqlite3 was compiled for a different Node version.");
        console.error("[ClawJS] Run: npm rebuild better-sqlite3\n");
        process.exit(1);
      }
    }
  }
}
