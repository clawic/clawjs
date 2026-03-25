#!/usr/bin/env node
/**
 * ClawJS Mock Seed Generator
 *
 * Generates rich, realistic mock data for the demo showcase mode.
 * Writes directly to the filesystem in the same format the demo-store
 * and ConversationStore expect — no demo code modifications required.
 *
 * Usage:
 *   MOCK_DATA_DIR=/tmp/clawjs-mock/data \
 *   MOCK_WORKSPACE_DIR=/tmp/clawjs-mock/workspace \
 *   node mock/seed.mjs
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";

// ── Directories ──────────────────────────────────────────────────────────────

const DATA_DIR = process.env.MOCK_DATA_DIR || "/tmp/clawjs-mock/data";
const WORKSPACE_DIR = process.env.MOCK_WORKSPACE_DIR || "/tmp/clawjs-mock/workspace";
const CONVERSATIONS_DIR = path.join(WORKSPACE_DIR, ".clawjs", "conversations");
const CONFIG_DIR = process.env.MOCK_CONFIG_DIR || "/tmp/clawjs-mock/config";
const LOCAL_SETTINGS_DIR = process.env.MOCK_LOCAL_SETTINGS_DIR || WORKSPACE_DIR;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function writeCollection(name, data) {
  writeJson(path.join(DATA_DIR, `${name}.json`), data);
}

function writeDocument(name, data) {
  writeJson(path.join(DATA_DIR, `${name}.json`), data);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

let idCounter = 0;
function genId() {
  return `${Date.now().toString(36)}-${(++idCounter).toString(36).padStart(4, "0")}`;
}

function uuid() {
  return crypto.randomUUID();
}

function nowMinus(minutes) {
  return Date.now() - minutes * 60_000;
}

function isoMinus(minutes) {
  return new Date(nowMinus(minutes)).toISOString();
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Image download (Lorem Picsum / Unsplash) ─────────────────────────────────

/**
 * Download an image from a URL following redirects. Returns a Buffer.
 * Falls back to null on error (no-throw).
 */
async function downloadImage(url) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch { return null; }
}

/**
 * Download multiple images with concurrency limit.
 * Returns Map<index, Buffer>.
 */
async function downloadBatch(urls, concurrency = 8) {
  const results = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < urls.length) {
      const i = cursor++;
      const buf = await downloadImage(urls[i]);
      if (buf && buf.length > 500) results.set(i, buf);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()));
  return results;
}

/** Fallback: generate a simple gradient PNG (no deps) */
function createGradientPng(width, height, r1, g1, b1, r2, g2, b2) {
  function crc32(buf) {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c; }
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const tb = Buffer.from(type, "ascii");
    const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])));
    return Buffer.concat([len, tb, data, cb]);
  }
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1 || 1);
    const off = y * (width * 3 + 1);
    raw[off] = 0;
    for (let x = 0; x < width; x++) {
      raw[off + 1 + x * 3]     = Math.round(r1 + (r2 - r1) * t);
      raw[off + 1 + x * 3 + 1] = Math.round(g1 + (g2 - g1) * t);
      raw[off + 1 + x * 3 + 2] = Math.round(b1 + (b2 - b1) * t);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ── Conversation JSONL builder ───────────────────────────────────────────────

function buildConversationJSONL(sessionId, title, messages, createdMinutesAgo) {
  const lines = [];
  lines.push(JSON.stringify({
    type: "session",
    id: sessionId,
    timestamp: isoMinus(createdMinutesAgo),
    title,
  }));
  for (const msg of messages) {
    lines.push(JSON.stringify({
      type: "message",
      id: uuid(),
      timestamp: new Date(msg.createdAt).toISOString(),
      message: {
        role: msg.role,
        content: [{ type: "text", text: msg.content }],
      },
    }));
  }
  return lines.join("\n") + "\n";
}

// ══════════════════════════════════════════════════════════════════════════════
// DATA GENERATORS
// ══════════════════════════════════════════════════════════════════════════════

// ── Conversations (50+) ──────────────────────────────────────────────────────

const CONVERSATION_TEMPLATES = [
  {
    title: "Weekly planning session",
    exchanges: [
      ["What are my priorities this week?", "Based on your tasks and calendar, here are your top priorities for this week:\n\n1. **Finish the API integration** — the deadline is Thursday and you have 3 endpoints left\n2. **Review PR #142** — Jordan flagged it as blocking the release\n3. **Prepare the client presentation** — scheduled for Friday 3pm\n4. **Team standup notes** — you missed documenting Monday's decisions\n\nWould you like me to create tasks for any of these?"],
      ["Create tasks for the first two", "Done! I've created two tasks:\n\n- **Finish API integration** — Priority: High, Due: Thursday\n- **Review PR #142** — Priority: High, Labels: blocking, review\n\nBoth are now visible in your Tasks page."],
      ["What does my calendar look like tomorrow?", "Tomorrow (Tuesday) you have:\n\n- **09:00** — Team standup (30 min)\n- **10:30** — 1:1 with Sarah (45 min)\n- **13:00** — Lunch with Alex Morgan\n- **15:00** — API design review (1h)\n- **17:00** — Free block until EOD\n\nYou have about 3.5 hours of focus time between meetings. Want me to block those?"],
    ],
  },
  {
    title: "Debug the auth middleware",
    exchanges: [
      ["The auth middleware is returning 401 for valid tokens after we deployed v2.3. What could be wrong?", "There are a few common causes for this after a deployment:\n\n1. **Token signing key rotation** — if you updated the JWT secret but existing tokens still use the old key\n2. **Clock skew** — if the new server has a different system time, `exp` claims might be mismatched\n3. **Middleware ordering** — Next.js middleware runs before API routes, check if the new version changed the chain\n4. **Cache invalidation** — if you're caching decoded tokens, the cache might hold stale entries\n\nCan you share the error response body? That usually narrows it down."],
      ["It says: {\"error\":\"invalid_token\",\"detail\":\"signature verification failed\"}", "That confirms it's a **signing key mismatch**. The deployed server is using a different secret to verify than what signed the token.\n\nCheck these:\n```bash\n# Compare the JWT_SECRET in your deployment environment\nprintenv JWT_SECRET\n\n# vs the value your process expects locally\ngrep JWT_SECRET .env.local\n```\n\nIf they differ, update the environment variable and restart. Existing sessions will need to re-authenticate unless you keep the old key as a fallback verifier."],
      ["They were different! Fixed it. But how do I prevent this in the future?", "Good catch. Here are some preventive measures:\n\n1. **Use a secrets manager** (AWS Secrets Manager, Vault) instead of env files\n2. **Add a health check** that verifies a test token on startup — fails fast if the key is wrong\n3. **Rotate keys with a grace period** — accept both old and new keys for 24h during rotation\n4. **Add to your deploy checklist** — automated verification that critical secrets match across environments\n\nI've added a note to your memory about this incident for future reference."],
    ],
  },
  {
    title: "Prepare partner demo",
    exchanges: [
      ["I need to prepare a demo for a partner review on Friday. What should I include?", "For that partner demo, I'd focus on capabilities that translate well across teams:\n\n1. **Real-time dashboard** — show how quickly the workspace updates when new activity arrives\n2. **Integration workflow** — demonstrate one practical connector end-to-end\n3. **Permissions and admin controls** — reviewers usually want to see guardrails early\n4. **Mobile responsiveness** — it helps prove the experience holds up away from the desk\n\nShould I pull together a demo script outline?"],
      ["Yes, create an outline with timing", "Here's a 30-minute demo script:\n\n**0:00-3:00 — Opening**\n- Quick product overview and value proposition\n- Recap the outcomes this partner cares about most\n\n**3:00-10:00 — Dashboard & Analytics**\n- Live data visualization\n- Custom report builder\n- Export capabilities\n\n**10:00-18:00 — Core Workflows**\n- Integration workflow (new record -> sync -> view in dashboard)\n- Automated notifications setup\n- Team collaboration features\n\n**18:00-23:00 — Security & Admin**\n- Access control demo with different user roles\n- Audit log walkthrough\n- Workspace configuration\n\n**23:00-28:00 — Mobile**\n- Quick mobile walkthrough\n- Offline-friendly behaviors\n\n**28:00-30:00 — Q&A Buffer**\n\nWant me to save this as a note?"],
      ["Save it and remind me Thursday evening to review it", "Saved as a note in the 'Projects' folder. I've also set a routine reminder for Thursday at 6pm to review the demo script.\n\nA few more tips:\n- Test the connector sandbox before Friday\n- Make sure the demo environment has realistic sample data loaded\n- Have a backup plan if the live sync is slow (screenshots/recording)\n\nGood luck with the demo!"],
    ],
  },
  {
    title: "Summarize today's WhatsApp messages",
    exchanges: [
      ["Can you give me a summary of my WhatsApp activity today?", "Here's your WhatsApp summary for today:\n\n**Active Conversations (12 chats, 47 messages)**\n\n📌 **Priority:**\n- **Jordan Lee** (8 msgs) — Discussing the deployment timeline. Jordan wants to push to staging by EOD. Waiting for your approval.\n- **Sarah Chen** (5 msgs) — Shared design mockups for the new onboarding flow. Asked for feedback by tomorrow.\n\n👥 **Team:**\n- **Dev Team** (12 msgs) — Sprint retrospective discussion. Key point: need to reduce PR review time.\n- **Product Sync** (6 msgs) — Feature prioritization for Q2. Mobile app is top priority.\n\n💬 **Personal:**\n- **Alex Morgan** (4 msgs) — Confirmed lunch plans for tomorrow, 1pm.\n- **Family Group** (8 msgs) — Weekend plan coordination.\n- **Running Club** (4 msgs) — Saturday 5k route vote.\n\nAnything you want me to respond to?"],
      ["Draft a reply to Jordan approving the staging deploy", "Here's a draft reply for Jordan:\n\n> \"Go ahead with the staging deploy! 👍 Just make sure to run the smoke tests after and ping me if anything looks off. I'll review the staging environment first thing tomorrow morning.\"\n\nShould I send this, or would you like to adjust it?"],
    ],
  },
  {
    title: "Refactor database queries",
    exchanges: [
      ["Our SQL queries in the reporting module are really slow. The dashboard takes 8 seconds to load. Can you help optimize?", "8 seconds is way too long. Let me analyze the common bottlenecks:\n\n**Likely Causes:**\n1. **N+1 queries** — fetching related data in loops instead of JOINs\n2. **Missing indexes** — especially on `created_at`, `user_id`, and foreign keys\n3. **Full table scans** — WHERE clauses on non-indexed columns\n4. **No query caching** — identical queries running on every page load\n\nCan you share the slowest query? Run this to find it:\n```sql\nSELECT query, calls, mean_exec_time, total_exec_time\nFROM pg_stat_statements\nORDER BY mean_exec_time DESC\nLIMIT 10;\n```"],
      ["The worst one is: SELECT * FROM events JOIN users ON events.user_id = users.id WHERE events.created_at > NOW() - INTERVAL '30 days' ORDER BY events.created_at DESC", "Several optimizations here:\n\n**1. Add a composite index:**\n```sql\nCREATE INDEX idx_events_created_user\nON events (created_at DESC, user_id);\n```\n\n**2. Select only needed columns** (don't use `SELECT *`):\n```sql\nSELECT e.id, e.type, e.created_at, u.name, u.email\nFROM events e\nJOIN users u ON e.user_id = u.id\nWHERE e.created_at > NOW() - INTERVAL '30 days'\nORDER BY e.created_at DESC\nLIMIT 100;\n```\n\n**3. Add pagination** — you're loading ALL events from 30 days\n\n**4. Consider a materialized view** for the dashboard:\n```sql\nCREATE MATERIALIZED VIEW dashboard_events AS\nSELECT ... GROUP BY date_trunc('hour', created_at);\n```\n\nThe composite index alone should cut your query time by 80-90%. Want me to help with the migration?"],
      ["Yes, the index brought it down to 200ms! Let's also add caching", "Great improvement! For caching, I recommend a two-layer strategy:\n\n**Layer 1: Query-level cache (Redis)**\n```typescript\nconst cacheKey = `dashboard:${userId}:${dateRange}`;\nconst cached = await redis.get(cacheKey);\nif (cached) return JSON.parse(cached);\n\nconst result = await db.query(dashboardQuery);\nawait redis.setex(cacheKey, 300, JSON.stringify(result)); // 5min TTL\n```\n\n**Layer 2: HTTP cache headers**\n```typescript\nres.setHeader('Cache-Control', 'private, max-age=60');\nres.setHeader('ETag', generateETag(result));\n```\n\n**Invalidation strategy:**\n- Invalidate on new event creation\n- Use a pub/sub pattern: event created → publish to Redis → invalidate dashboard caches\n- Materialized view refresh every 5 minutes via cron\n\nThis should bring your dashboard to sub-100ms response times."],
    ],
  },
  {
    title: "Set up Telegram bot",
    exchanges: [
      ["I want to set up a Telegram bot so I can interact with ClawJS from my phone. How do I do that?", "Setting up the Telegram integration is straightforward:\n\n**Step 1: Create a bot**\n1. Open Telegram and message @BotFather\n2. Send `/newbot`\n3. Choose a name (e.g., \"My ClawJS Assistant\")\n4. Choose a username (must end in `bot`, e.g., `my_clawjs_bot`)\n5. Copy the API token you receive\n\n**Step 2: Configure in ClawJS**\n1. Go to Settings → Integrations → Telegram\n2. Paste the bot token\n3. Click \"Connect\"\n\n**Step 3: Set allowed chat IDs**\nFor security, you should restrict which Telegram chats can use the bot. Send a message to your bot, then check the logs for your chat ID.\n\nWant me to walk you through each step?"],
      ["I already have the token: 7281934:AAF... How do I configure it?", "I've configured the Telegram bot with your token. Here's the status:\n\n✅ Bot connected successfully\n📛 Bot username: @my_clawjs_bot\n🔗 Webhook configured\n🔒 Allowed chat IDs: [your personal chat]\n\nYou can now:\n- Send messages to the bot and get AI responses\n- Forward messages for summarization\n- Use /tasks, /notes, /calendar commands\n- Send voice notes for transcription\n\nTry sending \"What's on my calendar today?\" to your bot!"],
    ],
  },
  {
    title: "Design system review",
    exchanges: [
      ["I want to review our design system components. What do we have?", "Here's an overview of the current design system:\n\n**Core Components:**\n- `Button` — primary, secondary, ghost, destructive variants\n- `Input` — text, email, password, search with validation states\n- `Card` — standard, interactive, stat variants\n- `Badge` — status indicators with color coding\n- `Avatar` — image, initials, emoji fallbacks\n- `Dialog` — modal, sheet, drawer patterns\n\n**Layout:**\n- `Sidebar` — collapsible with sections and navigation\n- `Header` — responsive with breadcrumbs\n- `PageContainer` — consistent padding and max-width\n\n**Data Display:**\n- `Table` — sortable, filterable with pagination\n- `Chart` — line, bar, area (via Recharts)\n- `StatCard` — KPI display with trend indicators\n\n**Form:**\n- `Select`, `Checkbox`, `Toggle`, `Radio`\n- `DatePicker`, `TimePicker`\n- `TextArea` with markdown support\n\nAll components support dark mode and are built on shadcn/ui + Tailwind. Want me to check consistency or identify gaps?"],
      ["Check for inconsistencies in spacing and color usage", "I found several inconsistencies:\n\n**Spacing Issues:**\n1. Card padding: some use `p-4`, others `p-6` — should standardize to `p-4` for compact, `p-6` for standard\n2. Section gaps: mix of `gap-4`, `gap-6`, `space-y-4`, `space-y-6` — recommend consistent `gap-4` between items, `gap-8` between sections\n3. Page margins: `/notes` uses `px-6`, `/tasks` uses `px-4 md:px-8` — should follow `PageContainer` pattern\n\n**Color Inconsistencies:**\n1. Destructive actions: Delete buttons use `text-red-500` in some places, `text-destructive` in others\n2. Status colors: Active status is `green-500` in tasks but `emerald-500` in routines\n3. Muted text: Mix of `text-muted-foreground` and `text-gray-500` — should always use semantic tokens\n\n**Recommendations:**\n- Create a spacing scale in your Tailwind config\n- Replace all hardcoded colors with semantic design tokens\n- Add a `DesignSystemGuide` page for reference\n\nWant me to create a remediation task list?"],
    ],
  },
  {
    title: "Plan the next roadmap",
    exchanges: [
      ["Help me plan the next roadmap. We have 3 engineers and need to decide between mobile app, API v2, and analytics overhaul.", "Let me help you think through this decision. Here's a framework:\n\n**Impact vs Effort Matrix:**\n\n| Feature | User Impact | Effort | Strategic Value |\n|---------|-------------|--------|-----------------|\n| Mobile App | High | 8-10 weeks | Expands access on the go |\n| API v2 | Medium | 6-8 weeks | Simplifies future integrations |\n| Analytics Overhaul | High | 4-6 weeks | Improves daily usability |\n\n**My Recommendation:**\nWith 3 engineers for 12 weeks, I'd suggest:\n\n1. **Weeks 1-6:** Analytics overhaul (2 engineers) + API v2 start (1 engineer)\n2. **Weeks 7-12:** API v2 completion (2 engineers) + Mobile MVP (1 engineer)\n\nThis way you ship analytics first while still building momentum on the other two streams. The mobile app gets a head start without starving the core platform.\n\nWant me to break this down into milestones?"],
      ["Break it down into milestones with specific deliverables", "Here's the detailed milestone plan:\n\n**🎯 Milestone 1: Analytics v2 (Weeks 1-3)**\n- [ ] New dashboard layout with customizable widgets\n- [ ] Real-time data pipeline (replace batch processing)\n- [ ] Export to CSV/PDF\n- [ ] 5 pre-built report templates\n- Owners: Engineer A + Engineer B\n\n**🎯 Milestone 2: Analytics v2 Polish + API v2 Foundation (Weeks 4-6)**\n- [ ] Analytics: user testing, bug fixes, documentation\n- [ ] API v2: OpenAPI spec, auth redesign, rate limiting\n- [ ] API v2: 3 core endpoints migrated\n- Owners: A (analytics), B (API), C (API)\n\n**🎯 Milestone 3: API v2 Completion (Weeks 7-9)**\n- [ ] All endpoints migrated with backward compatibility\n- [ ] SDK updated for v2\n- [ ] Migration guide for integrators\n- Owners: Engineer B + Engineer C\n\n**🎯 Milestone 4: Mobile MVP + API v2 Launch (Weeks 10-12)**\n- [ ] Mobile: auth + dashboard + chat (read-only)\n- [ ] API v2: staged rollout for test workspaces\n- [ ] Mobile: internal beta\n- Owners: A (mobile), B+C (API launch)\n\nShall I create these as goals with associated tasks?"],
    ],
  },
  {
    title: "Email inbox triage",
    exchanges: [
      ["Triage my inbox. What needs my attention?", "Here's your inbox triage:\n\n🔴 **Urgent (respond today):**\n1. **Sarah Chen** — \"Deployment approval needed\" — Production deploy is waiting on your sign-off. 2h ago.\n2. **Partnerships** — \"Agreement review: Example Studio\" — They need edits by EOD. Sent yesterday.\n3. **AWS Alert** — \"Billing threshold exceeded\" — You're at 85% of the monthly budget.\n\n🟡 **Important (this week):**\n4. **Jordan Lee** — \"Quarterly goals draft\" — Shared a doc for review, asked for feedback by Friday.\n5. **HR** — \"Benefits enrollment reminder\" — Open enrollment closes next Wednesday.\n6. **Community Request** — \"Feature request: bulk import\" — Product feedback to consider.\n\n🟢 **Low Priority:**\n7. Newsletter subscriptions (3) — Dev weekly, Product Hunt, TechCrunch\n8. GitHub notifications (7) — PR reviews, issue mentions\n9. Calendar invites (2) — Already accepted via mobile\n\nWant me to draft responses for the urgent ones?"],
      ["Draft a response for Sarah's deployment approval", "Here's a draft for Sarah:\n\n---\n**Re: Deployment approval needed**\n\nHi Sarah,\n\nApproved! ✅ Go ahead with the production deploy.\n\nA couple of things:\n- Make sure the database migrations run in the maintenance window (2am-4am)\n- Keep the rollback script ready just in case\n- Ping me on Slack once it's live so I can do a quick smoke test\n\nThanks for driving this!\n\n---\n\nShould I send this, or would you like to adjust?"],
    ],
  },
  {
    title: "Personal finance tracking",
    exchanges: [
      ["Can you help me track my recurring expenses? I want to see where my money goes each month.", "I'll help you organize that. Let me create a structured overview. What categories of recurring expenses do you have? Here are the common ones to start:\n\n**🏠 Housing:** Rent/mortgage, utilities, internet\n**🚗 Transport:** Car payment, insurance, gas, parking\n**📱 Subscriptions:** Phone, streaming, software, gym\n**🍽️ Food:** Groceries budget, meal delivery\n**💰 Financial:** Insurance, loan payments, savings\n\nTell me your recurring expenses and I'll build a tracker."],
      ["Rent 1800, utilities ~200, internet 60, car insurance 120, gas ~150, phone 45, spotify 11, netflix 16, gym 40, groceries ~400, student loan 350", "Here's your monthly expense tracker:\n\n| Category | Item | Amount |\n|----------|------|--------|\n| 🏠 Housing | Rent | $1,800 |\n| 🏠 Housing | Utilities | ~$200 |\n| 🏠 Housing | Internet | $60 |\n| 🚗 Transport | Car Insurance | $120 |\n| 🚗 Transport | Gas | ~$150 |\n| 📱 Subscriptions | Phone | $45 |\n| 📱 Subscriptions | Spotify | $11 |\n| 📱 Subscriptions | Netflix | $16 |\n| 🏋️ Health | Gym | $40 |\n| 🍽️ Food | Groceries | ~$400 |\n| 💰 Financial | Student Loan | $350 |\n| | **Total** | **~$3,192** |\n\n**Breakdown by category:**\n- Housing: $2,060 (65%)\n- Transport: $270 (8%)\n- Subscriptions: $72 (2%)\n- Food: $400 (13%)\n- Health: $40 (1%)\n- Debt: $350 (11%)\n\nI've saved this as a note. Want me to set up a monthly routine to check in on your spending?"],
    ],
  },
  {
    title: "Code review feedback",
    exchanges: [
      ["Review the changes in PR #287. It's the new caching layer.", "I've reviewed PR #287. Here's my feedback:\n\n**Overall: 👍 Solid approach, a few concerns**\n\n✅ **What's good:**\n- Clean separation between cache logic and business logic\n- TTL-based invalidation is the right choice here\n- Good error handling — graceful fallback when Redis is down\n- Tests cover the main paths\n\n⚠️ **Concerns:**\n\n1. **Memory leak potential** (cache-manager.ts:42)\n```typescript\n// Current: no max size limit\nconst cache = new Map();\n// Suggested: use LRU cache\nconst cache = new LRUCache({ max: 1000, ttl: 300_000 });\n```\n\n2. **Race condition** (cache-manager.ts:78)\nThe check-then-set pattern isn't atomic. Two concurrent requests could both miss the cache and write:\n```typescript\n// Use a mutex or single-flight pattern\nconst result = await singleFlight(key, () => fetchFromDb(id));\n```\n\n3. **Missing cache warming** — cold starts will be slow after deployments\n\n4. **No metrics** — add cache hit/miss counters for observability\n\nWant me to suggest specific code changes?"],
    ],
  },
  {
    title: "Morning briefing",
    exchanges: [
      ["Good morning! Give me my daily briefing.", "Good morning! ☀️ Here's your briefing for today:\n\n**📅 Calendar (4 meetings, 2h total)**\n- 09:30 — Team standup (15 min)\n- 11:00 — Product sync with Maria (30 min)\n- 14:00 — 1:1 with your manager (30 min)\n- 16:00 — Sprint planning (45 min)\n\n**✅ Tasks Due Today (3)**\n- Complete API documentation update (high priority)\n- Review Jordan's PR on the search feature\n- Submit expense report\n\n**📬 Inbox Highlights**\n- 2 urgent emails (deployment approval, contract review)\n- 5 GitHub notifications (PRs ready for review)\n- 1 Slack DM from the CEO\n\n**💬 WhatsApp**\n- Alex confirmed lunch at 12:30\n- Dev team discussing the outage from last night (resolved)\n\n**📊 API Usage**\n- Yesterday: 12,430 requests, 99.7% uptime\n- Budget: 62% used (18 days remaining)\n\nAnything you'd like me to dive deeper into?"],
    ],
  },
  {
    title: "Write a blog post outline",
    exchanges: [
      ["I want to write a blog post about building local-first applications. Help me outline it.", "Great topic! Here's a structured outline:\n\n# Building Local-First Apps: Why Your Data Should Live on Your Device\n\n**Hook:** \"What if your app worked perfectly with zero internet?\"\n\n## 1. Introduction (200 words)\n- The problem with cloud-only architectures\n- What \"local-first\" means and why it matters\n- Brief mention of CRDTs and offline-first movement\n\n## 2. The Local-First Principles (400 words)\n- Data ownership: users control their data\n- Offline capability: works without network\n- Speed: no round-trip latency\n- Privacy: data stays on device by default\n- Longevity: not dependent on a company's servers\n\n## 3. Architecture Patterns (500 words)\n- SQLite as the universal local database\n- Sync engines: Electric SQL, PowerSync, cr-sqlite\n- CRDT-based conflict resolution\n- Event sourcing for audit trails\n\n## 4. Real-World Implementation (400 words)\n- Code examples with SQLite + sync\n- Handling conflicts gracefully\n- Progressive sync (local → cloud when available)\n\n## 5. Trade-offs and Challenges (300 words)\n- Initial data download size\n- Conflict resolution complexity\n- Security on untrusted devices\n- Multi-device consistency\n\n## 6. Conclusion (150 words)\n- The pendulum swinging back from cloud-everything\n- Call to action: start with one local-first feature\n\n**Estimated length:** ~2,000 words\n**Target audience:** Mid-senior engineers\n\nWant me to draft any section?"],
      ["Draft section 2 about the principles", "## The Local-First Principles\n\nThe term \"local-first\" was popularized by a [2019 research paper from Ink & Switch](https://www.inkandswitch.com/local-first/), which defined seven ideals for software that respects user agency. Here are the five that matter most for everyday development:\n\n### Data Ownership\nIn a local-first app, the canonical copy of your data lives on your device. The cloud is a convenience — a backup and sync mechanism — not the source of truth. This inverts the traditional model where a company's database is \"the real data\" and your device merely caches it.\n\n### Works Offline\nYour app should be fully functional without an internet connection. Not just a \"you're offline\" banner — actually functional. Every read, write, and query should work. This isn't just for airplanes; it's for spotty coffee shop WiFi, subway commutes, and server outages.\n\n### Speed Without Compromise\nWhen data is local, reads are measured in microseconds, not milliseconds. There's no loading spinner waiting for a round-trip to Virginia. The UI can be truly instant because it's querying a database on the same machine.\n\n### Privacy by Architecture\nLocal-first is privacy-preserving by default. Your notes, messages, and documents don't need to touch a server to exist. End-to-end encryption becomes simpler when the endpoints are the only places data lives unencrypted.\n\n### Longevity\nCloud services shut down. Companies go bankrupt. APIs get deprecated. But a SQLite file on your disk? That'll be readable in 50 years. Local-first apps give your data a lifespan independent of any company's business model.\n\n---\n\nWant me to continue with the Architecture Patterns section?"],
    ],
  },
  {
    title: "Health check troubleshooting",
    exchanges: [
      ["The health check endpoint is showing 'degraded' for the memory service. What's wrong?", "Let me check the health status details.\n\nThe memory service is reporting degraded because:\n\n1. **High latency on vector queries** — average response time is 2.3s (threshold: 1s)\n2. **Index fragmentation** — the embedding index hasn't been optimized in 14 days\n3. **Storage usage at 87%** — approaching the 90% warning threshold\n\n**Immediate fixes:**\n```bash\n# Rebuild the vector index\nclaw memory optimize --rebuild-index\n\n# Check storage breakdown\nclaw memory stats --detailed\n```\n\n**Root cause:** The memory store accumulates embeddings from every conversation and document ingestion. Without periodic maintenance, the index fragments and queries slow down.\n\n**Prevention:** I recommend setting up a weekly routine:\n```\nclaw routines create --schedule \"0 3 * * 0\" \\\n  --prompt \"Optimize memory index and clean expired entries\"\n```\n\nWant me to set this up?"],
    ],
  },
  {
    title: "Compare AI model options",
    exchanges: [
      ["Compare the current model options for my use case. I process about 50k requests/day with ~2000 tokens average.", "For that volume, I wouldn't hardcode provider prices into a long-lived reference because they change often. I'd compare models across four buckets instead:\n\n**1. Cost model**\n- Check the current pricing page for input, output, and cached tokens\n- Model your daily volume with a simple spreadsheet\n- Include rate-limit tiers and any batch discounts\n\n**2. Latency**\n- Measure time-to-first-token and end-to-end latency on a representative sample\n- Test both peak and off-peak traffic windows\n\n**3. Quality**\n- Score the outputs on your real prompts, not generic benchmarks\n- Separate simple routing, summarization, and harder reasoning tasks\n\n**4. Operational fit**\n- Context window limits\n- Streaming quality\n- Reliability and rate-limit behavior\n- Tool-calling support\n\n**Practical recommendation:** use a lightweight model for the bulk path, then route the hardest requests to a stronger model once your benchmark data justifies the cost.\n\nIf you want, I can turn this into a benchmark matrix template."],
    ],
  },
  {
    title: "Set up CI/CD pipeline",
    exchanges: [
      ["Help me set up a CI/CD pipeline for our Next.js app on GitHub Actions", "Here's a production-ready GitHub Actions pipeline for Next.js:\n\n```yaml\n# .github/workflows/ci.yml\nname: CI/CD\n\non:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\n\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n          cache: 'npm'\n      - run: npm ci\n      - run: npm run lint\n      - run: npm run type-check\n      - run: npm test\n      - run: npm run build\n\n  e2e:\n    needs: test\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n          cache: 'npm'\n      - run: npm ci\n      - run: npx playwright install --with-deps\n      - run: npm run test:e2e\n      - uses: actions/upload-artifact@v4\n        if: failure()\n        with:\n          name: playwright-report\n          path: playwright-report/\n\n  deploy:\n    needs: [test, e2e]\n    if: github.ref == 'refs/heads/main'\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: amondnet/vercel-action@v25\n        with:\n          vercel-token: ${{ secrets.VERCEL_TOKEN }}\n          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}\n          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}\n          vercel-args: '--prod'\n```\n\nThis gives you:\n- ✅ Lint + type check + unit tests on every PR\n- ✅ E2E tests with Playwright\n- ✅ Auto-deploy to Vercel on main\n- ✅ Failure artifacts for debugging\n\nWant me to add caching, notifications, or preview deployments?"],
    ],
  },
  {
    title: "Migrate from REST to GraphQL",
    exchanges: [
      ["We're considering migrating from REST to GraphQL. What's your take?", "Honest assessment for your situation:\n\n**GraphQL makes sense when:**\n- Frontend needs vary wildly per page (different data shapes)\n- You have mobile + web clients with different data needs\n- Over-fetching is causing performance issues\n- You have a complex, deeply nested data model\n\n**REST is probably fine when:**\n- Your API is mostly CRUD with predictable shapes\n- You have a small team (GraphQL adds complexity)\n- Your API is public-facing (REST is more widely understood)\n- Performance is not bottlenecked by data fetching\n\n**Hybrid approach (recommended):**\n- Keep REST for simple CRUD endpoints\n- Add a GraphQL layer for complex queries (dashboards, reports)\n- Use tools like Apollo Federation or GraphQL Mesh to wrap existing REST APIs\n\n**Migration cost estimate:**\n- Schema definition: 1-2 weeks\n- Resolver implementation: 3-4 weeks\n- Client migration: 2-3 weeks\n- Testing + optimization: 1-2 weeks\n- **Total: 7-11 weeks for a full migration**\n\nBefore deciding, I'd recommend profiling your current API to see if over-fetching is actually your bottleneck. Often, the solution is simpler — like adding sparse fieldsets to REST or implementing BFF (Backend for Frontend) patterns.\n\nWant me to analyze your current API usage patterns?"],
    ],
  },
  {
    title: "Generate test data",
    exchanges: [
      ["I need to generate realistic test data for 1000 users with associated orders and products.", "Here's a comprehensive approach using a seed script:\n\n```typescript\nimport { faker } from '@faker-js/faker';\n\nconst USERS_COUNT = 1000;\nconst PRODUCTS_COUNT = 200;\nconst ORDERS_PER_USER = { min: 0, max: 15 };\n\nfunction generateProducts(count: number) {\n  return Array.from({ length: count }, () => ({\n    id: faker.string.uuid(),\n    name: faker.commerce.productName(),\n    description: faker.commerce.productDescription(),\n    price: parseFloat(faker.commerce.price({ min: 5, max: 500 })),\n    category: faker.commerce.department(),\n    sku: faker.string.alphanumeric(8).toUpperCase(),\n    stock: faker.number.int({ min: 0, max: 500 }),\n    createdAt: faker.date.past({ years: 2 }),\n  }));\n}\n\nfunction generateUsers(count: number) {\n  return Array.from({ length: count }, () => {\n    const firstName = faker.person.firstName();\n    const lastName = faker.person.lastName();\n    return {\n      id: faker.string.uuid(),\n      email: faker.internet.email({ firstName, lastName }),\n      name: `${firstName} ${lastName}`,\n      role: faker.helpers.weightedArrayElement([\n        { value: 'customer', weight: 85 },\n        { value: 'admin', weight: 5 },\n        { value: 'vendor', weight: 10 },\n      ]),\n      createdAt: faker.date.past({ years: 3 }),\n    };\n  });\n}\n```\n\nThis will generate consistent, realistic data. Want me to add the orders generator and a database seeder?"],
    ],
  },
  {
    title: "Team retrospective notes",
    exchanges: [
      ["Summarize the key points from today's sprint retrospective", "Here's a summary of today's retro:\n\n**🟢 What went well:**\n- Shipped the new onboarding flow 2 days ahead of schedule\n- Zero production incidents this sprint\n- New code review process reduced PR turnaround from 2 days to 4 hours\n- Cross-team collaboration with design improved significantly\n\n**🔴 What needs improvement:**\n- Sprint scope creep: 3 unplanned items were added mid-sprint\n- Flaky E2E tests caused 2 hours of wasted investigation time\n- Documentation is falling behind — 4 new endpoints have no docs\n- Too many meetings on Wednesday (5 hours of overlap)\n\n**🎯 Action items:**\n1. **Scope protection** — PM will gate mid-sprint additions through a formal request (owner: Maria)\n2. **Fix flaky tests** — Dedicate 1 day next sprint to test stability (owner: Jordan)\n3. **Doc sprint** — Everyone writes docs for their recent features by Friday (owner: all)\n4. **Meeting-free Wednesday afternoons** — Trial for next 2 sprints (owner: Team lead)\n\nI've saved this to notes and created tasks for each action item. Want me to share this with the team on Slack?"],
    ],
  },
  {
    title: "Docker compose setup",
    exchanges: [
      ["Help me create a docker-compose for local development with Postgres, Redis, and our Next.js app", "Here's a complete setup:\n\n```yaml\n# docker-compose.yml\nversion: '3.8'\n\nservices:\n  app:\n    build:\n      context: .\n      dockerfile: Dockerfile.dev\n    ports:\n      - '3000:3000'\n    volumes:\n      - .:/app\n      - /app/node_modules\n      - /app/.next\n    environment:\n      - DATABASE_URL=postgresql://app:secret@postgres:5432/myapp_dev\n      - REDIS_URL=redis://redis:6379\n      - NODE_ENV=development\n    depends_on:\n      postgres:\n        condition: service_healthy\n      redis:\n        condition: service_healthy\n    command: npm run dev\n\n  postgres:\n    image: postgres:16-alpine\n    ports:\n      - '5432:5432'\n    environment:\n      POSTGRES_USER: app\n      POSTGRES_PASSWORD: secret\n      POSTGRES_DB: myapp_dev\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n      - ./scripts/init.sql:/docker-entrypoint-initdb.d/init.sql\n    healthcheck:\n      test: ['CMD-SHELL', 'pg_isready -U app -d myapp_dev']\n      interval: 5s\n      timeout: 5s\n      retries: 5\n\n  redis:\n    image: redis:7-alpine\n    ports:\n      - '6379:6379'\n    volumes:\n      - redisdata:/data\n    healthcheck:\n      test: ['CMD', 'redis-cli', 'ping']\n      interval: 5s\n      timeout: 5s\n      retries: 5\n\n  adminer:\n    image: adminer\n    ports:\n      - '8080:8080'\n    depends_on:\n      - postgres\n\nvolumes:\n  pgdata:\n  redisdata:\n```\n\nAnd the dev Dockerfile:\n```dockerfile\n# Dockerfile.dev\nFROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nEXPOSE 3000\nCMD [\"npm\", \"run\", \"dev\"]\n```\n\nRun with `docker compose up -d`. Adminer is available at localhost:8080 for DB management."],
    ],
  },
  {
    title: "Create a persona for customer support",
    exchanges: [
      ["I want to create a customer support persona that's professional but friendly", "Here's a persona configuration for customer support:\n\n**Name:** Atlas\n**Role:** Customer Support Specialist\n**Avatar:** 🎧\n\n**System Prompt:**\n```\nYou are Atlas, a customer support specialist for ClawJS. Your communication style is:\n\n- Professional but warm — use the customer's name, show empathy\n- Solution-oriented — always provide actionable next steps\n- Concise — respect the customer's time, get to the answer quickly\n- Transparent — if you don't know something, say so and escalate\n\nResponse structure:\n1. Acknowledge the customer's issue\n2. Provide the solution or workaround\n3. Offer a next step or follow-up\n\nTone markers:\n- Use \"I understand\" not \"I'm sorry for the inconvenience\"\n- Use active voice: \"Here's how to fix this\" not \"This can be fixed by...\"\n- One emoji per message maximum, and only when appropriate\n```\n\n**Skills:** ticket-lookup, knowledge-base-search, escalation\n**Channels:** email, chat, telegram\n\nI've created this persona. You can activate it from the Personas page. Want me to create more personas (e.g., technical writer, sales assistant)?"],
    ],
  },
  {
    title: "Analyze API usage patterns",
    exchanges: [
      ["Show me our API usage for the past week", "Here's your API usage summary for the past 7 days:\n\n**📊 Overview:**\n- Total requests: 87,430\n- Total tokens: 182.6M (in: 112.4M, out: 70.2M)\n- Estimated cost: $423.18\n- Average latency: 340ms\n\n**📈 Daily Breakdown:**\n| Day | Requests | Tokens | Cost |\n|-----|----------|--------|------|\n| Mon | 14,200 | 29.8M | $68.20 |\n| Tue | 15,800 | 33.1M | $75.90 |\n| Wed | 13,900 | 28.7M | $65.40 |\n| Thu | 16,100 | 34.2M | $78.30 |\n| Fri | 12,400 | 25.6M | $58.60 |\n| Sat | 7,230 | 15.1M | $34.58 |\n| Sun | 7,800 | 16.1M | $42.20 |\n\n**🔝 Top Models:**\n1. GPT-4o (45%) — complex queries, $312\n2. GPT-4o-mini (38%) — simple tasks, $42\n3. Claude 3.5 Sonnet (17%) — analysis tasks, $69\n\n**⚠️ Alerts:**\n- Budget usage: 68% (12 days remaining)\n- Rate limit hits: 23 (mostly during peak hours 10am-2pm)\n- Error rate: 0.3% (within SLA)\n\nYour hybrid routing strategy is working well — 38% of requests go to the cheaper model. Want me to analyze if we can route more to mini without quality loss?"],
    ],
  },
];

// Additional quick conversations for volume
const QUICK_CONVERSATIONS = [
  { title: "Fix typo in landing page", ex: [["There's a typo on the landing page, 'recieve' should be 'receive'", "Fixed! I've corrected the typo in `src/app/landing/hero.tsx` line 42. Changed \"recieve\" to \"receive\". The change is ready for review."]] },
  { title: "Update dependencies", ex: [["Which packages have major updates available?", "Here are packages with major version updates:\n\n- `next` 15.2 → **16.1** (breaking: new App Router defaults)\n- `react` 18.3 → **19.2** (breaking: concurrent features default)\n- `tailwindcss` 3.4 → **4.0** (breaking: new config format)\n- `typescript` 5.4 → **5.9** (non-breaking, safe to update)\n\nI'd recommend updating TypeScript first (safe), then Tailwind (medium effort), then React+Next together (largest effort). Want a migration plan?"]] },
  { title: "Create a cron job for backups", ex: [["Set up a daily backup routine at 2am", "Done! I've created a routine:\n\n- **Label:** Daily database backup\n- **Schedule:** `0 2 * * *` (daily at 2:00 AM)\n- **Action:** Export SQLite databases, compress, and store in workspace backup directory\n- **Retention:** Keep last 7 days\n\nThe routine is active and will run tonight."]] },
  { title: "Explain the workspace architecture", ex: [["How does the workspace system work in ClawJS?", "The ClawJS workspace architecture follows a local-first pattern:\n\n**Directory Structure:**\n```\n~/.openclaw/\n├── openclaw.json          # Global config\n├── workspaces/\n│   └── clawjs-demo/       # Your workspace\n│       ├── .clawjs/\n│       │   └── conversations/  # Chat sessions (JSONL)\n│       ├── settings.json   # Workspace settings\n│       └── data/           # Notes, tasks, etc.\n└── agents/\n    └── clawjs-demo/\n        ├── agent/          # Agent config\n        └── sessions/       # Legacy session storage\n```\n\n**Key concepts:**\n- **Workspace** = isolated environment with its own data\n- **Agent** = AI identity with specific capabilities\n- **Sessions** = chat conversations stored as JSONL\n- **Data** = JSON collections for notes, tasks, etc.\n\nEverything runs locally — no cloud dependency."]] },
  { title: "Add dark mode to charts", ex: [["The charts don't look right in dark mode", "I see the issue — the chart components are using hardcoded colors instead of theme tokens. Here's what needs to change:\n\n1. Replace `stroke=\"#1f2937\"` with `stroke=\"hsl(var(--foreground))\"`\n2. Replace `fill=\"#f3f4f6\"` with `fill=\"hsl(var(--muted))\"`\n3. Grid lines: use `hsl(var(--border))` instead of `#e5e7eb`\n4. Tooltips: add `className=\"bg-popover text-popover-foreground border\"`\n\nThis affects 3 components: `UsageChart`, `ActivityChart`, and `DashboardStats`. Want me to make the changes?"]] },
  { title: "Research vector databases", ex: [["What vector database should I use for a RAG system with 1M documents?", "For 1M documents, here's my comparison:\n\n| DB | Speed | Cost | Ease | Best For |\n|----|-------|------|------|----------|\n| **Pinecone** | Fast | $$$ | Easy | Managed, no-ops teams |\n| **Qdrant** | Very Fast | $ (self-host) | Medium | Performance-critical |\n| **Chroma** | Good | Free | Very Easy | Prototyping, small scale |\n| **pgvector** | Good | $ | Easy | Already using Postgres |\n| **Weaviate** | Fast | $$ | Medium | Multi-modal search |\n\n**My recommendation:** Start with **pgvector** if you already have Postgres — it handles 1M vectors well and eliminates operational overhead. Migrate to Qdrant if you need sub-10ms queries at scale.\n\nFor your RAG pipeline: embed with `text-embedding-3-small` ($0.02/1M tokens), chunk at 512 tokens with 50-token overlap, and use HNSW indexing."]] },
  { title: "Quick note about meeting", ex: [["Save a note: meeting with Lisa moved to Thursday 3pm, she wants to discuss the partnership agreement", "Saved to notes:\n\n**Meeting with Lisa — Rescheduled**\n📅 Thursday 3pm\n📋 Topic: Partnership agreement discussion\n\nI've also updated your calendar event. Want me to prepare any materials for the meeting?"]] },
  { title: "Troubleshoot slow build times", ex: [["Our Next.js build went from 2 min to 8 min after the last update. Help!", "Common causes for build time regression:\n\n**Quick checks:**\n```bash\n# 1. Check bundle size\nnpx @next/bundle-analyzer\n\n# 2. Find slow pages\nNEXT_BUILD_TRACE=1 npm run build 2>&1 | grep 'compiled'\n\n# 3. Check for barrel file imports\n# This is the #1 cause of slow builds in Next.js\ngrep -r \"from '.*index'\" src/ | head -20\n```\n\n**Most likely culprits:**\n1. **Barrel file imports** — importing from `@/components` instead of `@/components/Button` forces bundling everything\n2. **Large dependencies** — check if a new dep added `moment.js` or similar heavy libs\n3. **Dynamic imports missing** — pages importing heavy components synchronously\n4. **TypeScript strict mode** — new strict checks can slow type-checking\n\nRun the bundle analyzer first — that usually reveals the issue immediately."]] },
  { title: "Plan team offsite", ex: [["Help me plan a team offsite for 8 people, 2 days, budget $5000", "Here's a plan for your 2-day team offsite:\n\n**Day 1: Strategy + Team Building**\n- 09:00 — Welcome + icebreaker\n- 10:00 — Q2 retrospective (facilitated discussion)\n- 12:00 — Lunch at a local restaurant ($25/person = $200)\n- 14:00 — Q3 vision workshop\n- 16:00 — Escape room or outdoor activity ($35/person = $280)\n- 19:00 — Team dinner ($50/person = $400)\n\n**Day 2: Execution + Bonding**\n- 09:00 — Hackathon: build something fun in 4 hours\n- 13:00 — Lunch + hackathon demos ($25/person = $200)\n- 15:00 — Individual goal setting + manager 1:1s\n- 17:00 — Wrap-up + feedback\n\n**Budget:**\n- Venue rental (2 days): $1,500\n- Meals (6 × ~$200): $1,200\n- Activities: $500\n- Supplies/equipment: $300\n- Buffer: $500\n- **Total: $4,000** (under budget by $1,000)\n\nWant me to save this and set up calendar invites?"]] },
  { title: "Memory cleanup recommendations", ex: [["How can I free up memory in my workspace?", "Here's your workspace memory analysis:\n\n**Current usage: 2.4 GB**\n\n| Category | Size | Items | Action |\n|----------|------|-------|--------|\n| Chat sessions | 890 MB | 234 sessions | Archive old ones |\n| Embeddings index | 720 MB | 15k entries | Rebuild + compact |\n| Image cache | 450 MB | 89 images | Clear unused |\n| Transcription DB | 210 MB | 3.2k records | Already optimized |\n| Notes & data | 130 MB | — | Fine |\n\n**Recommended actions:**\n1. Archive sessions older than 90 days → saves ~600 MB\n2. Rebuild embeddings index → saves ~200 MB\n3. Clear unused image cache → saves ~350 MB\n\n**Estimated savings: ~1.15 GB (48%)**\n\nWant me to run the cleanup? I'll archive (not delete) old sessions first."]] },
  { title: "Voice note transcription test", ex: [["I just sent a voice note, can you transcribe it?", "Here's the transcription of your voice note:\n\n> \"Hey, just a quick reminder — the client meeting got pushed to next Thursday at 2pm instead of Wednesday. Also, Sarah mentioned that the design files are ready for review in Figma, so if you could take a look at those before the meeting that would be great. Oh, and don't forget to submit the expense report by Friday. Talk later, bye.\"\n\n**Key action items extracted:**\n1. Client meeting → Thursday 2pm (was Wednesday)\n2. Review Sarah's design files in Figma\n3. Submit expense report by Friday\n\nWant me to update your calendar and create tasks for these?"]] },
  { title: "GitFlow branching strategy", ex: [["Should we use GitFlow or trunk-based development?", "For your team size (3-5 engineers) and release cadence, I'd recommend **trunk-based development** over GitFlow:\n\n**Why trunk-based:**\n- Simpler: no develop/release/hotfix branches to manage\n- Faster: changes merge to main within hours, not days\n- Less conflict: short-lived feature branches = fewer merge conflicts\n- CI/CD friendly: every merge to main is potentially deployable\n\n**Workflow:**\n1. Create short-lived feature branch from `main`\n2. Work for 1-2 days max\n3. Open PR → CI runs → review → merge to main\n4. Feature flags for incomplete features\n5. Deploy from main (automated or manual trigger)\n\n**When to use GitFlow:**\n- Multiple release trains (e.g., mobile apps with app store reviews)\n- Large teams (20+) with coordinated releases\n- Regulatory requirements for release staging\n\nNone of those apply to your case. Want me to set up the branch protection rules?"]] },
];

function generateConversations() {
  const sessions = [];
  const allSessions = [];
  let minutesAgo = 10;

  // Detailed conversations
  for (const template of CONVERSATION_TEMPLATES) {
    const sessionId = `clawjs-${uuid()}`;
    const messages = [];
    let msgMinutes = minutesAgo + template.exchanges.length * 3;

    for (const [userMsg, assistantMsg] of template.exchanges) {
      messages.push({ role: "user", content: userMsg, createdAt: nowMinus(msgMinutes) });
      msgMinutes -= 1.5;
      messages.push({ role: "assistant", content: assistantMsg, createdAt: nowMinus(msgMinutes) });
      msgMinutes -= 1.5;
    }

    const jsonl = buildConversationJSONL(sessionId, template.title, messages, minutesAgo + template.exchanges.length * 3);
    sessions.push({ sessionId, jsonl });
    allSessions.push({
      sessionId,
      title: template.title,
      createdAt: nowMinus(minutesAgo + template.exchanges.length * 3),
      updatedAt: nowMinus(minutesAgo),
      messageCount: messages.length,
      preview: messages[messages.length - 1].content.slice(0, 120),
    });

    minutesAgo += randomBetween(30, 180);
  }

  // Quick conversations for volume
  for (const quick of QUICK_CONVERSATIONS) {
    const sessionId = `clawjs-${uuid()}`;
    const messages = [];
    let msgMinutes = minutesAgo + 5;

    for (const [userMsg, assistantMsg] of quick.ex) {
      messages.push({ role: "user", content: userMsg, createdAt: nowMinus(msgMinutes) });
      messages.push({ role: "assistant", content: assistantMsg, createdAt: nowMinus(msgMinutes - 1) });
      msgMinutes -= 2;
    }

    const jsonl = buildConversationJSONL(sessionId, quick.title, messages, minutesAgo + 5);
    sessions.push({ sessionId, jsonl });
    allSessions.push({
      sessionId,
      title: quick.title,
      createdAt: nowMinus(minutesAgo + 5),
      updatedAt: nowMinus(minutesAgo),
      messageCount: messages.length,
      preview: messages[messages.length - 1].content.slice(0, 120),
    });

    minutesAgo += randomBetween(60, 360);
  }

  return { sessions, allSessions };
}

// ── Notes (25+) ──────────────────────────────────────────────────────────────

function generateNotes() {
  const notes = [
    { title: "Q2 Roadmap Overview", content: "## Q2 Priorities\n\n1. **Analytics v2** — Complete overhaul of the dashboard\n2. **API v2** — Backward-compatible migration\n3. **Mobile MVP** — iOS + Android read-only app\n\n### Milestones\n- Week 1-6: Analytics + API foundation\n- Week 7-9: API completion\n- Week 10-12: Mobile + API launch\n\n### Success Metrics\n- Dashboard load time < 1s\n- API p99 latency < 200ms\n- 80% feature parity on mobile", folder: "Engineering", tags: ["roadmap", "q2", "planning"] },
    { title: "Architecture Decision: Event Sourcing", content: "## Decision\nAdopt event sourcing for the audit trail module.\n\n## Context\nWe need an immutable audit log for compliance. Current approach (updating rows) loses history.\n\n## Consequences\n- (+) Complete history of all changes\n- (+) Replay capability for debugging\n- (-) Increased storage requirements\n- (-) Learning curve for the team\n\n## Status: Accepted", folder: "Engineering", tags: ["architecture", "decision", "event-sourcing"] },
    { title: "Partner Feedback: Example Studio", content: "**Date:** March 20, 2026\n**Attendees:** Alex, Sarah, Jordan, Priya (Example Studio)\n\n## Key Points\n- The team wants a polished connector demo in the next review\n- They asked for clearer admin controls and audit visibility\n- Offline-friendly behavior and mobile usability matter to their field team\n- They want setup docs before the walkthrough\n\n## Action Items\n- [ ] Share the integration checklist (Sarah, by March 25)\n- [ ] Schedule the connector demo (Alex, by March 28)\n- [ ] Prepare admin workflow notes (Jordan, by April 1)\n\n## Next Meeting\nApril 3, 2026 — Connector walkthrough", folder: "Projects", tags: ["meeting-notes", "example-studio", "partner"] },
    { title: "Sprint 14 Retrospective", content: "## What went well\n- Shipped onboarding flow 2 days early\n- Zero production incidents\n- PR turnaround improved: 2d → 4h\n\n## What needs improvement\n- 3 unplanned items added mid-sprint\n- Flaky E2E tests wasted 2h\n- Documentation falling behind\n\n## Action Items\n1. PM gates mid-sprint additions (Maria)\n2. Fix flaky tests — dedicate 1 day (Jordan)\n3. Doc sprint by Friday (all)\n4. Meeting-free Wednesday afternoons (trial)", folder: "Team", tags: ["retro", "sprint-14", "team"] },
    { title: "API Rate Limiting Strategy", content: "## Current State\n- No rate limiting on internal APIs\n- External API: 100 req/min per API key\n\n## Proposed Changes\n\n### Tier 1: Free\n- 60 req/min, 1000 req/day\n- No streaming\n\n### Tier 2: Pro\n- 300 req/min, 50k req/day\n- Streaming enabled\n\n### Tier 3: Enterprise\n- Custom limits\n- Dedicated instance option\n\n## Implementation\n- Use Redis sliding window counter\n- Return `X-RateLimit-*` headers\n- 429 response with `Retry-After` header\n\n## Timeline\nWeek of April 7 — implement and test\nWeek of April 14 — staged rollout", folder: "Engineering", tags: ["api", "rate-limiting", "security"] },
    { title: "Personal OKRs Q2", content: "## Objective 1: Ship Analytics v2\n- KR1: Dashboard loads in < 1s (currently 3.2s)\n- KR2: 5 pre-built report templates live\n- KR3: User satisfaction score > 4.2/5\n\n## Objective 2: Grow Technical Leadership\n- KR1: Mentor 2 junior engineers\n- KR2: Give 1 tech talk (internal or external)\n- KR3: Write 2 engineering blog posts\n\n## Objective 3: Reduce Technical Debt\n- KR1: Eliminate all critical Sonar warnings\n- KR2: Test coverage from 67% to 80%\n- KR3: Document all public APIs", folder: "Personal", tags: ["okr", "q2", "career"] },
    { title: "Deployment Checklist", content: "## Pre-deploy\n- [ ] All tests passing in CI\n- [ ] PR reviewed and approved\n- [ ] Database migrations tested on staging\n- [ ] Feature flags configured\n- [ ] Rollback plan documented\n\n## Deploy\n- [ ] Deploy to staging\n- [ ] Smoke tests on staging\n- [ ] Deploy to production (blue-green)\n- [ ] Verify health checks\n- [ ] Monitor error rates for 15 min\n\n## Post-deploy\n- [ ] Update changelog\n- [ ] Notify stakeholders\n- [ ] Close related tickets\n- [ ] Archive feature branch", folder: "Engineering", tags: ["deployment", "checklist", "process"] },
    { title: "Competitive Analysis: ToolX", content: "## Overview\nToolX launched their v3 last week with AI features similar to ours.\n\n## Their strengths\n- Better mobile app (native iOS/Android)\n- Managed workspace SSO out of the box\n- 50+ integrations marketplace\n\n## Their weaknesses\n- Cloud-only (no local-first option)\n- Less flexibility for self-hosted workflows\n- No WhatsApp/Telegram integration\n- Generic AI, not context-aware\n\n## Our differentiators\n- **Local-first** — data stays on device\n- **Context-aware AI** — knows your conversations, contacts, calendar\n- **Privacy** — no data leaves your machine\n- **Flexible** — open-source core with optional paid add-ons\n\n## Action Items\n- Highlight privacy angle in marketing\n- Fast-track mobile MVP\n- Add SSO to the platform roadmap", folder: "Product", tags: ["competitive", "analysis", "strategy"] },
    { title: "Database Schema v2 Migration Plan", content: "## Changes\n\n### New Tables\n- `audit_events` — immutable event log\n- `api_keys` — key management with scopes\n- `rate_limits` — per-key rate limit config\n\n### Modified Tables\n- `users` — add `sso_provider`, `external_id`\n- `sessions` — add `metadata` JSONB column\n- `tasks` — add `assignee_id` foreign key\n\n### Indexes\n```sql\nCREATE INDEX idx_audit_events_ts ON audit_events(created_at DESC);\nCREATE INDEX idx_audit_events_user ON audit_events(user_id, created_at DESC);\nCREATE INDEX idx_api_keys_hash ON api_keys(key_hash);\n```\n\n## Rollback Plan\n- All migrations are reversible\n- New tables: drop if rollback needed\n- Modified tables: migration down removes new columns\n\n## Estimated Downtime: Zero\nUsing online DDL for all changes", folder: "Engineering", tags: ["database", "migration", "schema"] },
    { title: "Onboarding Improvements Brainstorm", content: "## Current Issues\n- 40% drop-off at step 3 (integration setup)\n- Average onboarding time: 12 minutes (target: 5)\n- Users confused by advanced setup terminology\n\n## Ideas\n1. **Skip integration setup** — let users explore first, prompt for integrations when needed\n2. **Interactive tour** — highlight key features with tooltips\n3. **Pre-built templates** — start with sample data so the app isn't empty\n4. **Quick wins** — show value in the first 30 seconds\n5. **Simplified language** — replace jargon with plain language\n\n## Priority\n1 → 3 → 5 → 2 → 4\n\n## Notes\n- Template approach works well for Notion, Figma, etc.\n- Must handle the case where the user already has a workspace configured", folder: "Product", tags: ["onboarding", "ux", "brainstorm"] },
    { title: "Weekly 1:1 Notes — Sarah", content: "## March 18\n- Working on the CRM connector\n- Blocked by API documentation gaps\n- Wants to attend a frontend conference in May\n- Career goal: lead a feature team by Q4\n\n## March 11\n- Finished the RBAC implementation\n- Good progress on E2E tests\n- Requested budget for a training subscription -> approved\n\n## March 4\n- Started onboarding revamp project\n- Pair programming sessions going well\n- Mentioned interest in GraphQL migration", folder: "Team", tags: ["1on1", "sarah", "management"] },
    { title: "Incident Report: API Outage March 15", content: "## Summary\nAPI returned 503 for 23 minutes between 14:12-14:35 UTC.\n\n## Impact\n- ~2,400 requests failed\n- Several workspaces saw degraded responses\n- No data loss\n\n## Root Cause\nDatabase connection pool exhausted due to a long-running query in the reporting module. The query held connections for >30s, preventing new connections.\n\n## Timeline\n- 14:12 — First 503 alerts\n- 14:15 — On-call acknowledged\n- 14:20 — Identified connection pool exhaustion\n- 14:28 — Killed blocking queries\n- 14:32 — Pool recovered, requests resuming\n- 14:35 — All clear\n\n## Remediation\n- [x] Added query timeout of 10s\n- [x] Increased pool size from 20 to 50\n- [ ] Add circuit breaker for reporting queries\n- [ ] Separate read replica for reports\n\n## Lessons\n- Monitoring gap: no alert on pool saturation\n- Need query budget enforcement", folder: "Engineering", tags: ["incident", "postmortem", "api"] },
    { title: "Reading List", content: "## Currently Reading\n- \"Designing Data-Intensive Applications\" — Martin Kleppmann (Ch. 7)\n\n## Up Next\n- \"Staff Engineer\" — Will Larson\n- \"The Manager's Path\" — Camille Fournier\n- \"Building Microservices\" — Sam Newman (2nd ed.)\n\n## Finished\n- ✅ \"Clean Architecture\" — Robert C. Martin\n- ✅ \"System Design Interview\" — Alex Xu\n- ✅ \"The Pragmatic Programmer\" — Hunt & Thomas\n- ✅ \"Atomic Habits\" — James Clear\n- ✅ \"Deep Work\" — Cal Newport", folder: "Personal", tags: ["books", "reading", "learning"] },
    { title: "Integration Wishlist", content: "## High Priority\n- [x] WhatsApp (via wacli)\n- [x] Telegram\n- [x] Email (IMAP)\n- [x] Calendar (system calendar)\n- [ ] Slack — #1 user request\n- [ ] Linear/Jira — task sync\n\n## Medium Priority\n- [ ] Notion — import/export\n- [ ] GitHub — PR summaries, issue tracking\n- [ ] Google Drive — document search\n- [ ] Spotify — mood/focus music\n\n## Low Priority\n- [ ] Discord\n- [ ] Twitter/X\n- [ ] Reddit\n- [ ] RSS feeds\n\n## Notes\nSlack integration should be next. Users are asking for it weekly.\nLinear integration would help with our own dogfooding.", folder: "Product", tags: ["integrations", "roadmap", "features"] },
    { title: "Performance Optimization Log", content: "## March 2026\n\n### Dashboard Load Time\n- Before: 3.2s\n- After index optimization: 1.1s\n- After query caching: 0.4s\n- Target: < 1s ✅\n\n### Chat Response (TTFT)\n- Before: 1.8s\n- After streaming: 0.3s\n- Target: < 0.5s ✅\n\n### Build Time\n- Before: 8 min\n- After barrel file cleanup: 3.5 min\n- After selective bundling: 2.1 min\n- Target: < 3 min ✅\n\n### Memory Usage (server)\n- Before: 1.2 GB\n- After connection pool tuning: 800 MB\n- After embedding index rebuild: 650 MB\n- Target: < 1 GB ✅", folder: "Engineering", tags: ["performance", "optimization", "metrics"] },
    { title: "Branding Guidelines Quick Reference", content: "## Colors\n- Primary: #2563EB (Blue 600)\n- Secondary: #7C3AED (Violet 600)\n- Success: #059669 (Emerald 600)\n- Warning: #D97706 (Amber 600)\n- Error: #DC2626 (Red 600)\n\n## Typography\n- Headlines: Geist Sans, semibold\n- Body: Geist Sans, regular\n- Code: Geist Mono\n\n## Logo Usage\n- Min size: 32px height\n- Clear space: 1x logo height on all sides\n- Dark backgrounds: use white version\n- Never stretch, rotate, or add effects\n\n## Voice & Tone\n- Professional but approachable\n- Technical accuracy over simplification\n- Concise: say more with fewer words\n- Active voice preferred", folder: "Design", tags: ["branding", "design", "guidelines"] },
    { title: "Vacation Planning — Summer 2026", content: "## Options\n\n### Option A: Japan (10 days)\n- Tokyo (4d) → Kyoto (3d) → Osaka (3d)\n- Budget: ~$4,000\n- Best time: Late September\n- Highlights: temples, food, technology\n\n### Option B: Portugal (7 days)\n- Lisbon (3d) → Porto (2d) → Algarve (2d)\n- Budget: ~$2,500\n- Best time: June\n- Highlights: food, architecture, beaches\n\n### Option C: Iceland (5 days)\n- Reykjavik + Golden Circle + South Coast\n- Budget: ~$3,000\n- Best time: August\n- Highlights: nature, northern lights (maybe), hot springs\n\n## Decision: TBD by April 15\nNeed to coordinate with team vacation schedule", folder: "Personal", tags: ["vacation", "travel", "personal"] },
    { title: "ClawJS Plugin Development Guide", content: "## Getting Started\n\n```bash\nnpx create-claw-plugin my-plugin\ncd my-plugin\nnpm run dev\n```\n\n## Plugin Lifecycle\n1. `register()` — called once during startup\n2. `activate()` — called when plugin is enabled\n3. `deactivate()` — called when plugin is disabled\n4. `dispose()` — cleanup on shutdown\n\n## Available Hooks\n- `before_prompt_build` — modify system prompt\n- `after_response` — post-process AI responses\n- `before_tool_call` — intercept tool usage\n- `on_session_start` — session lifecycle\n- `on_session_end` — session cleanup\n\n## Publishing\n```bash\nclaw plugin publish --registry official\n```\n\n## Examples\nSee `/packages/openclaw-plugin` for a complete reference implementation.", folder: "Engineering", tags: ["plugin", "development", "guide"] },
    { title: "Interview Questions — Senior Engineer", content: "## System Design (45 min)\n1. Design a rate limiter for a distributed API\n2. Design a real-time collaborative document editor\n3. Design an event-driven notification system\n\n## Coding (45 min)\n1. Implement an LRU cache with O(1) operations\n2. Build a task scheduler with priority and dependencies\n3. Parse and evaluate a simple expression language\n\n## Behavioral (30 min)\n1. Tell me about a time you had to make a difficult trade-off\n2. How do you handle disagreements about technical direction?\n3. Describe a system you built that you're proud of\n\n## Evaluation Criteria\n- Problem decomposition and communication\n- Considers trade-offs and alternatives\n- Production-quality thinking (monitoring, error handling)\n- Collaborative approach to design", folder: "Team", tags: ["hiring", "interview", "engineering"] },
    { title: "Cost Optimization Playbook", content: "## Cloud Infrastructure\n- Reserved instances for stable workloads: ~40% savings\n- Spot instances for batch jobs: ~70% savings\n- Right-size instances quarterly\n- Delete unused EBS volumes and snapshots\n\n## AI/LLM Costs\n- Route 80% of simple queries to mini models\n- Cache frequent responses (save ~30%)\n- Implement token budgets per user/day\n- Batch embeddings instead of one-at-a-time\n\n## Database\n- Archive data older than 90 days to cold storage\n- Use read replicas instead of scaling up primary\n- Implement connection pooling (PgBouncer)\n\n## Current Monthly Spend\n- AWS: $3,200 → target: $2,400\n- AI APIs: $1,800 → target: $1,200\n- SaaS tools: $600 → target: $400\n- **Total: $5,600 → target: $4,000 (29% reduction)**", folder: "Engineering", tags: ["cost", "optimization", "infrastructure"] },
  ];

  return notes.map((n, i) => ({
    id: genId(),
    title: n.title,
    content: n.content,
    folder: n.folder,
    tags: n.tags,
    linkedTaskIds: [],
    linkedSessionIds: [],
    createdAt: nowMinus(1440 * (notes.length - i) + randomBetween(0, 720)),
    updatedAt: nowMinus(randomBetween(10, 1440 * 3)),
  }));
}

// ── Tasks (20+) ──────────────────────────────────────────────────────────────

function generateTasks() {
  const tasks = [
    { title: "Complete API v2 endpoint migration", desc: "Migrate remaining 8 endpoints from v1 to v2 with backward compatibility", status: "in_progress", priority: "high", labels: ["api", "migration"], goalId: "goal-api-v2" },
    { title: "Fix flaky E2E test: chat streaming", desc: "The chat streaming test fails intermittently due to race condition in SSE handling", status: "in_progress", priority: "high", labels: ["testing", "bug"] },
    { title: "Add workspace SSO support", desc: "Implement SAML 2.0 SSO integration for managed workspaces. Requires changes to auth middleware.", status: "backlog", priority: "high", labels: ["sso", "auth"] },
    { title: "Optimize dashboard query performance", desc: "Dashboard takes 3.2s to load. Target: < 1s. Add composite indexes and implement query caching.", status: "done", priority: "high", labels: ["performance", "database"] },
    { title: "Write API v2 migration guide", desc: "Create documentation for integrators migrating from API v1 to v2", status: "backlog", priority: "medium", labels: ["documentation", "api"] },
    { title: "Implement Slack integration", desc: "Add Slack as a channel for receiving and sending messages. Use Slack Bolt SDK.", status: "backlog", priority: "high", labels: ["integration", "feature"] },
    { title: "Review PR #287: Caching layer", desc: "Review the new caching layer implementation. Check for memory leaks and race conditions.", status: "done", priority: "medium", labels: ["review", "caching"] },
    { title: "Set up monitoring dashboards", desc: "Create Grafana dashboards for API latency, error rates, and resource usage", status: "in_progress", priority: "medium", labels: ["monitoring", "infrastructure"] },
    { title: "Update dependencies to latest", desc: "Update Next.js, React, and Tailwind to latest major versions. Test for regressions.", status: "backlog", priority: "medium", labels: ["maintenance", "dependencies"] },
    { title: "Mobile MVP: Authentication flow", desc: "Implement OAuth2 PKCE flow for the React Native mobile app", status: "backlog", priority: "medium", labels: ["mobile", "auth"], goalId: "goal-mobile" },
    { title: "Reduce Docker image size", desc: "Current image is 1.2GB. Target: < 400MB using multi-stage builds and Alpine base.", status: "done", priority: "low", labels: ["infrastructure", "optimization"] },
    { title: "Add rate limiting to public API", desc: "Implement sliding window rate limiting with Redis. Tier-based limits.", status: "in_progress", priority: "high", labels: ["api", "security"] },
    { title: "Fix dark mode chart colors", desc: "Charts use hardcoded colors that don't work in dark mode. Switch to theme tokens.", status: "backlog", priority: "low", labels: ["ui", "bug"] },
    { title: "Create customer onboarding email sequence", desc: "Design 5-email drip campaign for new users: welcome, setup guide, tips, use cases, feedback request", status: "backlog", priority: "medium", labels: ["marketing", "onboarding"] },
    { title: "Implement backup routine", desc: "Set up automated daily backups with 7-day retention. Include SQLite DBs and config.", status: "done", priority: "medium", labels: ["infrastructure", "data"] },
    { title: "Security compliance documentation", desc: "Prepare the security controls documentation pack for the next compliance review. Due: April 30.", status: "in_progress", priority: "high", labels: ["compliance", "security"] },
    { title: "Redesign settings page", desc: "Current settings page is cluttered. Reorganize into logical sections with better UX.", status: "backlog", priority: "low", labels: ["ui", "ux"] },
    { title: "Add WebSocket support for real-time updates", desc: "Replace polling with WebSocket connections for live updates on dashboard and chat", status: "backlog", priority: "medium", labels: ["feature", "performance"] },
    { title: "Security audit: dependency vulnerabilities", desc: "Run npm audit, review and fix critical/high vulnerabilities", status: "done", priority: "high", labels: ["security", "maintenance"] },
    { title: "Create plugin development guide", desc: "Write comprehensive documentation for third-party plugin developers", status: "done", priority: "medium", labels: ["documentation", "plugins"] },
    { title: "Submit expense report Q1", desc: "Compile and submit Q1 expense report. Include conference tickets and team lunch receipts.", status: "done", priority: "low", labels: ["admin"] },
  ];

  return tasks.map((t, i) => ({
    id: genId(),
    title: t.title,
    description: t.desc,
    status: t.status,
    priority: t.priority,
    labels: t.labels,
    goalId: t.goalId,
    linkedSessionIds: [],
    createdAt: nowMinus(1440 * (tasks.length - i) + randomBetween(0, 720)),
    updatedAt: nowMinus(randomBetween(5, 1440 * 2)),
  }));
}

// ── Goals ────────────────────────────────────────────────────────────────────

function generateGoals() {
  return [
    { id: "goal-api-v2", title: "Launch API v2", description: "Complete migration to API v2 with backward compatibility for existing integrations", progress: 65, status: "active", taskIds: [], createdAt: nowMinus(1440 * 30), updatedAt: nowMinus(120) },
    { id: "goal-mobile", title: "Ship Mobile MVP", description: "Launch iOS and Android apps with read-only access to dashboard and chat", progress: 15, status: "active", taskIds: [], createdAt: nowMinus(1440 * 20), updatedAt: nowMinus(360) },
    { id: "goal-analytics", title: "Analytics v2 Overhaul", description: "Rebuild analytics dashboard with real-time data, custom reports, and < 1s load time", progress: 85, status: "active", taskIds: [], createdAt: nowMinus(1440 * 45), updatedAt: nowMinus(60) },
    { id: "goal-enterprise", title: "Platform Readiness", description: "SSO, RBAC, compliance notes, and deployment hardening for managed workspaces", progress: 35, status: "active", taskIds: [], createdAt: nowMinus(1440 * 60), updatedAt: nowMinus(480) },
    { id: "goal-debt", title: "Reduce Technical Debt", description: "Eliminate critical warnings, increase test coverage to 80%, document all public APIs", progress: 50, status: "active", taskIds: [], createdAt: nowMinus(1440 * 90), updatedAt: nowMinus(200) },
  ];
}

// ── Contacts ─────────────────────────────────────────────────────────────────

function generateContacts() {
  return [
    { id: "contact-alex", name: "Alex Morgan", relationship: "friend", avatar: { type: "emoji", value: "AM" }, emoji: "A" },
    { id: "contact-jordan", name: "Jordan Lee", relationship: "coworker", avatar: { type: "emoji", value: "JL" }, emoji: "J" },
    { id: "contact-sarah", name: "Sarah Chen", relationship: "coworker", avatar: { type: "emoji", value: "SC" }, emoji: "S" },
    { id: "contact-maria", name: "Maria Garcia", relationship: "coworker", avatar: { type: "emoji", value: "MG" }, emoji: "M" },
    { id: "contact-lisa", name: "Lisa Wang", relationship: "client", avatar: { type: "emoji", value: "LW" }, emoji: "L" },
    { id: "contact-david", name: "David Kim", relationship: "friend", avatar: { type: "emoji", value: "DK" }, emoji: "D" },
    { id: "contact-emma", name: "Emma Rodriguez", relationship: "coworker", avatar: { type: "emoji", value: "ER" }, emoji: "E" },
    { id: "contact-james", name: "James Wilson", relationship: "manager", avatar: { type: "emoji", value: "JW" }, emoji: "J" },
    { id: "contact-olivia", name: "Olivia Brown", relationship: "friend", avatar: { type: "emoji", value: "OB" }, emoji: "O" },
    { id: "contact-marcus", name: "Marcus Thompson", relationship: "client", avatar: { type: "emoji", value: "MT" }, emoji: "M" },
    { id: "contact-nina", name: "Nina Patel", relationship: "coworker", avatar: { type: "emoji", value: "NP" }, emoji: "N" },
    { id: "contact-tom", name: "Tom Harrison", relationship: "friend", avatar: { type: "emoji", value: "TH" }, emoji: "T" },
  ];
}

// ── Routines ─────────────────────────────────────────────────────────────────

function generateRoutines() {
  return [
    { id: genId(), label: "Morning briefing", description: "Daily summary of calendar, tasks, and inbox highlights", schedule: "0 8 * * 1-5", channel: "chat", prompt: "Give me a morning briefing: today's calendar, due tasks, and inbox highlights.", enabled: true, lastRun: nowMinus(180), nextRun: nowMinus(-1260), createdAt: nowMinus(1440 * 30), updatedAt: nowMinus(180) },
    { id: genId(), label: "Weekly WhatsApp digest", description: "Summarize all WhatsApp activity from the past week", schedule: "0 18 * * 5", channel: "chat", prompt: "Summarize my WhatsApp conversations from this week. Highlight important messages and action items.", enabled: true, lastRun: nowMinus(1440 * 2), nextRun: nowMinus(-1440 * 5), createdAt: nowMinus(1440 * 25), updatedAt: nowMinus(1440 * 2) },
    { id: genId(), label: "Database backup", description: "Automated daily backup of all databases", schedule: "0 2 * * *", channel: "chat", prompt: "Run database backup routine: export, compress, and verify integrity.", enabled: true, lastRun: nowMinus(420), nextRun: nowMinus(-1020), createdAt: nowMinus(1440 * 14), updatedAt: nowMinus(420) },
    { id: genId(), label: "Sprint standup reminder", description: "Remind team about standup at 9:30", schedule: "25 9 * * 1-5", channel: "telegram", prompt: "Reminder: Team standup in 5 minutes. Please prepare your updates.", enabled: true, lastRun: nowMinus(210), nextRun: nowMinus(-1230), createdAt: nowMinus(1440 * 20), updatedAt: nowMinus(210) },
    { id: genId(), label: "Memory index optimization", description: "Weekly cleanup and optimization of the memory vector index", schedule: "0 3 * * 0", channel: "chat", prompt: "Optimize the memory index: rebuild vectors, clean expired entries, and compact storage.", enabled: true, lastRun: nowMinus(1440 * 1), nextRun: nowMinus(-1440 * 6), createdAt: nowMinus(1440 * 7), updatedAt: nowMinus(1440 * 1) },
    { id: genId(), label: "End of day summary", description: "Summary of what was accomplished and what's pending", schedule: "0 18 * * 1-5", channel: "chat", prompt: "Summarize what I accomplished today and list any pending items for tomorrow.", enabled: false, createdAt: nowMinus(1440 * 10), updatedAt: nowMinus(1440 * 3) },
  ];
}

// ── Routine Executions ───────────────────────────────────────────────────────

function generateRoutineExecutions() {
  const execs = [];
  for (let i = 0; i < 20; i++) {
    execs.push({
      id: genId(),
      routineId: pick(["routine-daily", "routine-weekly", "routine-backup"]),
      status: pick(["success", "success", "success", "success", "failure"]),
      startedAt: nowMinus(1440 * i + randomBetween(0, 120)),
      completedAt: nowMinus(1440 * i + randomBetween(0, 119)),
      output: pick(["Completed successfully.", "Morning briefing delivered.", "Backup archived (23 MB).", "WhatsApp digest sent.", "Index optimized: 340 entries compacted."]),
    });
  }
  return execs;
}

// ── Activity Events ──────────────────────────────────────────────────────────

function generateActivity() {
  const events = [
    { event: "chat_stream_completed", capability: "chat", detail: "Assistant response streamed successfully (2.1s, 340 tokens)", status: "success" },
    { event: "note_created", capability: "notes", detail: "Created note: Q2 Roadmap Overview", status: "success" },
    { event: "task_updated", capability: "tasks", detail: "Task 'Optimize dashboard query performance' marked as done", status: "success" },
    { event: "routine_executed", capability: "routines", detail: "Morning briefing routine completed in 3.2s", status: "success" },
    { event: "integration_connected", capability: "integrations", detail: "Telegram bot connected: @clawjs_demo_bot", status: "success" },
    { event: "memory_indexed", capability: "memory", detail: "Indexed 12 new entries from recent conversations", status: "success" },
    { event: "image_generated", capability: "images", detail: "Generated image: 'Dashboard reference screenshot'", status: "success" },
    { event: "backup_completed", capability: "system", detail: "Daily backup completed: 23 MB archived", status: "success" },
    { event: "chat_stream_completed", capability: "chat", detail: "Assistant analyzed API usage patterns (4.5s, 890 tokens)", status: "success" },
    { event: "skill_installed", capability: "skills", detail: "Installed skill: release-notes from registry", status: "success" },
    { event: "config_updated", capability: "settings", detail: "Updated locale preference to English", status: "success" },
    { event: "routine_failed", capability: "routines", detail: "Weekly digest failed: WhatsApp database locked", status: "failure" },
    { event: "session_created", capability: "chat", detail: "New chat session: 'Debug the auth middleware'", status: "success" },
    { event: "contact_synced", capability: "contacts", detail: "Synced 12 contacts from WhatsApp", status: "success" },
    { event: "email_processed", capability: "inbox", detail: "Processed 8 new emails, 2 flagged as important", status: "success" },
    { event: "chat_stream_completed", capability: "chat", detail: "Reviewed PR #287: Caching layer (3.8s, 620 tokens)", status: "success" },
    { event: "health_check", capability: "system", detail: "All capabilities healthy. Uptime: 14d 6h", status: "success" },
    { event: "plugin_activated", capability: "plugins", detail: "Activated plugin: registry-sync v1.0.0", status: "success" },
    { event: "transcription_completed", capability: "transcription", detail: "Voice note transcribed (12s audio → 45 words)", status: "success" },
    { event: "calendar_synced", capability: "calendar", detail: "Synced 6 events from main calendar", status: "success" },
  ];

  return events.map((e, i) => ({
    id: genId(),
    ...e,
    timestamp: nowMinus(i * 45 + randomBetween(0, 30)),
  }));
}

// ── Usage Records ────────────────────────────────────────────────────────────

function generateUsage() {
  const records = [];
  const models = [
    { provider: "OpenAI", model: "gpt-4o", costIn: 2.5, costOut: 10 },
    { provider: "OpenAI", model: "gpt-4o-mini", costIn: 0.15, costOut: 0.6 },
    { provider: "Anthropic", model: "claude-3.5-sonnet", costIn: 3, costOut: 15 },
    { provider: "OpenAI Codex", model: "gpt-5.4", costIn: 2, costOut: 8 },
  ];

  for (let day = 0; day < 14; day++) {
    const requestsPerDay = randomBetween(8, 35);
    for (let r = 0; r < requestsPerDay; r++) {
      const m = pick(models);
      const tokensIn = randomBetween(200, 4000);
      const tokensOut = randomBetween(100, 2000);
      records.push({
        id: genId(),
        provider: m.provider,
        model: m.model,
        tokensIn,
        tokensOut,
        estimatedCost: (tokensIn / 1_000_000) * m.costIn + (tokensOut / 1_000_000) * m.costOut,
        timestamp: nowMinus(1440 * day + randomBetween(0, 1440)),
      });
    }
  }

  return records.sort((a, b) => b.timestamp - a.timestamp);
}

// ── Memory Entries ───────────────────────────────────────────────────────────

function generateMemory() {
  return [
    { id: genId(), kind: "knowledge", title: "Auth middleware incident", content: "On March 15, a JWT signing key mismatch caused 23 minutes of 401 errors. Root cause: env var not synced during deploy. Prevention: use secrets manager + startup health check.", source: "chat", tags: ["incident", "auth", "postmortem"], createdAt: nowMinus(1440 * 10), updatedAt: nowMinus(1440 * 10) },
    { id: genId(), kind: "knowledge", title: "Dashboard optimization results", content: "Dashboard load time reduced from 3.2s to 0.4s via: composite index on events(created_at, user_id), Redis query cache with 5min TTL, and selected column queries instead of SELECT *.", source: "chat", tags: ["performance", "database", "optimization"], createdAt: nowMinus(1440 * 7), updatedAt: nowMinus(1440 * 5) },
    { id: genId(), kind: "index", title: "API v2 migration status", content: "8 of 22 endpoints migrated to v2. Remaining: billing (3), analytics (3), admin (2). Target completion: end of Q2.", source: "tasks", tags: ["api", "migration", "status"], createdAt: nowMinus(1440 * 5), updatedAt: nowMinus(720) },
    { id: genId(), kind: "knowledge", title: "Partner integration requirements", content: "Example partner needs: connector demo, SSO (SAML 2.0), EU data residency guidance, and RBAC coverage before pilot rollout.", source: "notes", tags: ["partner", "requirements", "integrations"], createdAt: nowMinus(1440 * 8), updatedAt: nowMinus(1440 * 3) },
    { id: genId(), kind: "store", title: "Team preferences", content: "Jordan prefers async communication. Sarah is interested in GraphQL and React conferences. Maria manages sprint scope. James (manager) does 1:1s on Tuesdays.", source: "chat", tags: ["team", "preferences", "management"], createdAt: nowMinus(1440 * 14), updatedAt: nowMinus(1440 * 2) },
    { id: genId(), kind: "knowledge", title: "Cost optimization strategy", content: "Hybrid model routing can materially reduce AI spend. Route simple queries to a lightweight model, reserve stronger models for harder prompts, and verify savings with periodic benchmark runs.", source: "chat", tags: ["cost", "optimization", "ai"], createdAt: nowMinus(1440 * 4), updatedAt: nowMinus(1440 * 2) },
    { id: genId(), kind: "index", title: "Integration priority order", content: "User-requested integrations ranked: 1) Slack (most requested), 2) Linear/Jira, 3) GitHub, 4) Notion, 5) Google Drive.", source: "notes", tags: ["integrations", "roadmap", "priority"], createdAt: nowMinus(1440 * 6), updatedAt: nowMinus(1440 * 3) },
    { id: genId(), kind: "session", title: "Sprint retro action items", content: "Sprint 14 retro actions: 1) PM gates mid-sprint additions, 2) Fix flaky tests (1 day budget), 3) Doc sprint by Friday, 4) Meeting-free Wednesday afternoons (trial).", source: "chat", tags: ["sprint", "retro", "actions"], createdAt: nowMinus(1440 * 3), updatedAt: nowMinus(1440 * 3) },
    { id: genId(), kind: "knowledge", title: "Rate limiting design", content: "Sliding window with Redis. Tiers: Free (60/min, 1k/day), Pro (300/min, 50k/day), Enterprise (custom). Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset.", source: "notes", tags: ["api", "rate-limiting", "design"], createdAt: nowMinus(1440 * 5), updatedAt: nowMinus(1440 * 2) },
    { id: genId(), kind: "knowledge", title: "Local-first architecture principles", content: "Data ownership on device, works offline, instant speed (no latency), privacy by default, longevity independent of company. SQLite as universal local DB. Sync via CRDTs or event sourcing.", source: "chat", tags: ["architecture", "local-first", "principles"], createdAt: nowMinus(1440 * 9), updatedAt: nowMinus(1440 * 9) },
  ];
}

// ── Inbox Messages ───────────────────────────────────────────────────────────

function generateInbox() {
  return [
    { id: genId(), channel: "email", from: "sarah.chen@example.com", subject: "Deployment approval needed", preview: "The staging deploy is ready. Can you review and approve?", content: "Hi,\n\nThe staging deploy is ready with the following changes:\n- API v2 endpoints (billing module)\n- Rate limiting middleware\n- Dashboard query optimizations\n\nAll tests are passing. Can you review and approve for production?\n\nThanks,\nSarah", read: false, timestamp: nowMinus(120), threadId: "thread-deploy" },
    { id: genId(), channel: "email", from: "partnerships@example.com", subject: "Agreement review: Example Studio", preview: "Please review the attached partnership notes by EOD.", content: "Hi,\n\nExample Studio sent back the latest partnership notes. Main items:\n- Clarify support expectations for the pilot\n- Confirm the rollout checklist and sign-off owners\n- Add a short section on data residency guidance\n\nPlease review and provide comments by end of day.\n\nBest,\nPartnerships", read: false, timestamp: nowMinus(300), threadId: "thread-example-studio" },
    { id: genId(), channel: "telegram", from: "Jordan Lee", preview: "Hey, can we push the staging deploy to this afternoon?", content: "Hey, can we push the staging deploy to this afternoon? The fix for the race condition in SSE handling just got merged and I want it included.", read: true, timestamp: nowMinus(180), threadId: "thread-jordan-staging" },
    { id: genId(), channel: "email", from: "alerts@aws.amazon.com", subject: "AWS Cost Alert: 85% of monthly budget", preview: "Your AWS account has reached 85% of its monthly budget.", content: "Your AWS account project-prod has reached 85% of the monthly budget limit.\n\nReview the current spend breakdown and investigate the highest-cost services before the next deploy window.\n\nTop cost drivers:\n- Compute\n- Database\n- Object storage\n\nReview your costs at console.aws.amazon.com/billing", read: true, timestamp: nowMinus(420), threadId: "thread-aws" },
    { id: genId(), channel: "email", from: "jordan.lee@example.com", subject: "Quarterly goals draft — feedback needed", preview: "Attached the quarterly goals draft. Please review by Friday.", content: "Hi team,\n\nI've drafted the quarterly goals based on our planning session. Please review and add comments by Friday:\n\n1. Analytics v2 — ship to test workspaces\n2. API v2 — migrate remaining endpoints\n3. Platform hardening — SSO + compliance notes\n4. Mobile — MVP launch\n\nDoc link: [shared workspace doc]\n\nBest,\nJordan", read: false, timestamp: nowMinus(1440), threadId: "thread-okr" },
    { id: genId(), channel: "telegram", from: "QA Bot", preview: "E2E suite passed: 48/48 tests green (32.1s)", content: "E2E suite passed: 48/48 tests green (32.1s)\n\nNew: 2 tests added for rate limiting\nFlaky: 0 (previously 3 — fixed!)\nCoverage: 74.2% (+1.8%)", read: true, timestamp: nowMinus(90), threadId: "thread-qa-bot" },
    { id: genId(), channel: "email", from: "hr@example.com", subject: "Benefits enrollment — closes next Wednesday", preview: "Open enrollment for Q2 benefits closes March 30.", content: "Hi,\n\nThis is a reminder that open enrollment for Q2 benefits closes on March 30. Please review and confirm your selections:\n\n- Health insurance plan\n- Dental & vision\n- 401k contribution changes\n- FSA/HSA elections\n\nLog in to benefits.example.com to make changes.\n\nHR Team", read: true, timestamp: nowMinus(2880), threadId: "thread-hr" },
    { id: genId(), channel: "email", from: "priya@example.studio", subject: "Re: connector demo timeline", preview: "Thanks for the update. Our team is available for the walkthrough next week.", content: "Hi Alex,\n\nThanks for the update on the connector timeline. Our team is available next Thursday at 2pm for the walkthrough.\n\nCould you also send over the setup notes beforehand so our developers can prepare questions?\n\nBest regards,\nPriya Raman\nEngineering Lead, Example Studio", read: false, timestamp: nowMinus(600), threadId: "thread-example-connector" },
    { id: genId(), channel: "telegram", from: "Alex Morgan", preview: "Still on for lunch tomorrow? 12:30 at the usual place?", content: "Still on for lunch tomorrow? 12:30 at the usual place?", read: true, timestamp: nowMinus(240), threadId: "thread-alex-lunch" },
    { id: genId(), channel: "email", from: "noreply@github.com", subject: "[clawjs/demo] PR #287: Add caching layer", preview: "Jordan Lee requested your review on PR #287", content: "Jordan Lee requested your review on pull request #287: Add caching layer\n\n+342 -18 across 8 files\n\nKey changes:\n- New CacheManager class\n- Redis integration for query caching\n- TTL-based invalidation\n- Fallback to direct DB on cache miss", read: true, timestamp: nowMinus(360), threadId: "thread-gh-287" },
  ];
}

// ── Personas ─────────────────────────────────────────────────────────────────

function generatePersonas() {
  return [
    { id: genId(), name: "Atlas", avatar: "🎧", role: "Customer Support", systemPrompt: "You are Atlas, a customer support specialist. Be professional, warm, and solution-oriented. Acknowledge issues, provide clear solutions, and offer follow-up steps.", skills: ["ticket-lookup", "kb-search", "escalation"], channels: ["email", "chat", "telegram"], isDefault: false, createdAt: nowMinus(1440 * 20), updatedAt: nowMinus(1440 * 5) },
    { id: genId(), name: "Sage", avatar: "📝", role: "Technical Writer", systemPrompt: "You are Sage, a technical writer. Focus on clarity, accuracy, and structure. Use plain language, avoid jargon, and organize content with clear headings and examples.", skills: ["docs-generation", "api-reference"], channels: ["chat"], isDefault: false, createdAt: nowMinus(1440 * 15), updatedAt: nowMinus(1440 * 8) },
    { id: genId(), name: "Default Assistant", avatar: "🤖", role: "General Assistant", systemPrompt: "You are a helpful, knowledgeable AI assistant. Be concise, accurate, and proactive. Adapt your communication style to the context.", skills: ["chat", "analysis", "coding", "search"], channels: ["chat", "telegram", "whatsapp"], isDefault: true, createdAt: nowMinus(1440 * 60), updatedAt: nowMinus(1440 * 1) },
    { id: genId(), name: "Scout", avatar: "🔍", role: "Code Reviewer", systemPrompt: "You are Scout, a meticulous code reviewer. Focus on correctness, performance, security, and maintainability. Provide specific, actionable feedback with code examples.", skills: ["code-review", "security-scan"], channels: ["chat"], isDefault: false, createdAt: nowMinus(1440 * 10), updatedAt: nowMinus(1440 * 4) },
  ];
}

// ── Plugins ──────────────────────────────────────────────────────────────────

function generatePlugins() {
  return [
    { id: genId(), name: "registry-sync", version: "1.2.0", description: "Synchronizes registry metadata into the workspace for skill discovery.", status: "active", config: { intervalMinutes: 30, autoUpdate: true }, installedAt: nowMinus(1440 * 30), lastActivity: nowMinus(30) },
    { id: genId(), name: "context-engine", version: "0.8.1", description: "Enhanced context assembly with token estimation and compaction.", status: "active", config: { maxTokens: 100000, compactionThreshold: 0.8 }, installedAt: nowMinus(1440 * 25), lastActivity: nowMinus(60) },
    { id: genId(), name: "whatsapp-bridge", version: "2.1.0", description: "Bridges WhatsApp messages through wacli for real-time messaging.", status: "active", config: { syncInterval: 60, transcribeAudio: true }, installedAt: nowMinus(1440 * 20), lastActivity: nowMinus(45) },
    { id: genId(), name: "calendar-sync", version: "1.0.3", description: "Synchronizes system calendar events for context-aware scheduling.", status: "active", config: { lookAheadDays: 14, includeDeclined: false }, installedAt: nowMinus(1440 * 18), lastActivity: nowMinus(120) },
    { id: genId(), name: "analytics-dashboard", version: "0.5.0", description: "Experimental analytics and usage tracking dashboard.", status: "inactive", config: { retentionDays: 90 }, installedAt: nowMinus(1440 * 10), lastActivity: nowMinus(1440 * 5) },
  ];
}

// ── Budget Config ────────────────────────────────────────────────────────────

function generateBudget() {
  return {
    monthlyLimit: 150,
    warningThreshold: 80,
    enabled: true,
  };
}

// ── E2E Documents (integration status, auth, skills, etc.) ──────────────────

function generateE2EAuth() {
  const providers = [
    "anthropic", "openai", "openai-codex", "google", "google-gemini-cli",
    "deepseek", "mistral", "xai", "groq", "openrouter", "kimi-coding", "qwen",
  ];
  return {
    cliAvailable: true,
    defaultModel: "openai-codex/gpt-5.4",
    providers: Object.fromEntries(providers.map((p) => [p, {
      provider: p,
      hasAuth: p === "openai-codex" || p === "anthropic",
      hasSubscription: p === "openai-codex",
      hasApiKey: p === "openai" || p === "anthropic",
      hasProfileApiKey: p === "openai",
      hasEnvKey: false,
      authType: p === "openai-codex" ? "oauth" : (p === "openai" || p === "anthropic") ? "api_key" : null,
    }])),
  };
}

function generateE2EIntegrations() {
  return {
    adapters: [{
      id: "openclaw",
      runtimeName: "OpenClaw",
      stability: "stable",
      supportLevel: "official",
      cliAvailable: true,
      version: "1.4.2",
      recommended: true,
      capabilities: [
        { key: "chat", supported: true, status: "ready", strategy: "streaming" },
        { key: "memory", supported: true, status: "ready", strategy: "vector" },
        { key: "images", supported: true, status: "ready", strategy: "generation" },
      ],
      providers: [
        { id: "openai-codex", label: "OpenAI Codex" },
        { id: "openai", label: "OpenAI" },
        { id: "anthropic", label: "Anthropic" },
      ],
      channels: [
        { id: "chat", label: "Chat", kind: "core" },
        { id: "whatsapp", label: "WhatsApp", kind: "integration" },
        { id: "telegram", label: "Telegram", kind: "integration" },
      ],
      workspaceFiles: ["SOUL.md", "USER.md", "IDENTITY.md", "AGENTS.md", "TOOLS.md", "HEARTBEAT.md"],
      hasScheduler: true,
      hasMemory: true,
      hasSandbox: true,
      hasGateway: true,
    }],
    openClaw: {
      installed: true,
      cliAvailable: true,
      agentConfigured: true,
      modelConfigured: true,
      authConfigured: true,
      ready: true,
      needsSetup: false,
      needsAuth: false,
      lastError: null,
      version: "1.4.2",
      latestVersion: "1.4.2",
      defaultModel: "openai-codex/gpt-5.4",
      context: {
        agentId: "clawjs-demo",
        workspaceDir: WORKSPACE_DIR,
        stateDir: path.join(WORKSPACE_DIR, ".."),
        agentDir: path.join(WORKSPACE_DIR, "..", "agents", "clawjs-demo", "agent"),
        agentName: "clawjs-demo",
      },
    },
    whatsapp: {
      installed: true,
      dbExists: true,
      authenticated: true,
      authInProgress: false,
      syncing: false,
      qrText: "",
      lastError: null,
      wacliAvailable: true,
    },
    email: {
      installed: true,
      available: true,
      backend: "mock",
      enabled: true,
      accounts: [{ id: "inbox", email: "alex@clawjs.dev", displayName: "Alex Taylor", default: true }],
      selectedAccountsValid: true,
      message: null,
    },
    calendar: {
      installed: true,
      available: true,
      needsPermission: false,
      backend: "mock",
      enabled: true,
      calendars: [
        { id: "calendar-main", title: "Main", writable: true },
        { id: "calendar-work", title: "Work", writable: true },
      ],
      selectedCalendarValid: true,
      message: null,
    },
    transcription: { dbExists: true },
    telegram: {
      enabled: true,
      botConnected: true,
      botUsername: "clawjs_demo_bot",
      webhookUrl: "https://example.invalid/webhook",
      lastError: null,
    },
  };
}

function generateE2ESkills() {
  return [
    { id: "checks", label: "Checks", enabled: true, scope: "workspace" },
    { id: "release-notes", label: "Release Notes", enabled: true, scope: "global" },
    { id: "design-review", label: "Design Review", enabled: true, scope: "workspace" },
    { id: "code-review", label: "Code Review", enabled: false, scope: "global" },
  ];
}

function generateE2EWorkspaceFiles() {
  return [
    { fileName: "SOUL.md", content: "## Soul\n\nClawJS is a local-first AI assistant that respects your privacy and puts you in control. We believe your data should live on your device, your AI should know your context, and your tools should work offline." },
    { fileName: "USER.md", content: "## User\n\nAlex Taylor — Senior Software Engineer. Leads a team of 3. Prefers concise, actionable responses. Strong in backend (Node.js, TypeScript, PostgreSQL), learning React. Values code quality, testing, and clear documentation." },
    { fileName: "IDENTITY.md", content: "## Identity\n\nYou are the ClawJS assistant for Alex's workspace. You have access to chat, notes, tasks, calendar, email, WhatsApp, and Telegram. You help with coding, planning, writing, and daily organization." },
    { fileName: "AGENTS.md", content: "## Agents\n\nAvailable personas: Default Assistant, Atlas (support), Sage (writer), Scout (reviewer). Use the appropriate persona based on the task context." },
    { fileName: "TOOLS.md", content: "## Tools\n\nAvailable tools: web search, code execution, file operations, calendar management, email drafting, WhatsApp messaging, Telegram bot, image generation, voice transcription." },
    { fileName: "HEARTBEAT.md", content: "## Heartbeat\n\nLast sync: March 25, 2026 08:00 UTC\nActive sessions: 34\nMemory entries: 10\nPending tasks: 8\nRoutines: 5 active, 1 paused\nHealth: All systems operational" },
  ];
}

// 50 gallery images + 15 pool images for the "create" flow = 65 Picsum IDs
// Each picsum ID maps to a unique Unsplash photo (CC0 / Unsplash license)
const DEMO_IMAGE_DEFS = [
  { picsumId: 10,   title: "Misty forest trail",               prompt: "A winding trail through a misty green forest with soft morning light" },
  { picsumId: 11,   title: "Vintage desk workspace",           prompt: "A warm vintage workspace with a wooden desk, notebooks, and a coffee cup" },
  { picsumId: 14,   title: "Rocky coastline",                  prompt: "Dramatic rocky coastline with crashing waves under an overcast sky" },
  { picsumId: 15,   title: "River through the mountains",      prompt: "A turquoise river winding through a mountain valley surrounded by pine trees" },
  { picsumId: 17,   title: "Ocean sunset panorama",            prompt: "A stunning panoramic sunset over a calm ocean with clouds painted in orange and pink" },
  { picsumId: 18,   title: "Dense forest canopy",              prompt: "Looking up through a dense forest canopy with light filtering through the leaves" },
  { picsumId: 19,   title: "Mountain road",                    prompt: "A long winding road through mountain terrain with dramatic clouds overhead" },
  { picsumId: 20,   title: "Tropical bird perched",            prompt: "A colorful tropical bird sitting on a branch surrounded by green foliage" },
  { picsumId: 22,   title: "Cityscape from above",             prompt: "A drone-view cityscape at golden hour showing rooftops and streets below" },
  { picsumId: 24,   title: "Desert sand dunes",                prompt: "Smooth golden sand dunes with dramatic shadows and a clear blue sky" },
  { picsumId: 26,   title: "Autumn leaves closeup",            prompt: "A close-up of vibrant red and orange autumn leaves with soft bokeh background" },
  { picsumId: 27,   title: "Rainy window reflection",          prompt: "Raindrops on a window with blurred city lights reflecting in the background" },
  { picsumId: 28,   title: "Snowy mountain peak",              prompt: "A majestic snow-covered mountain peak against a deep blue sky" },
  { picsumId: 29,   title: "Wildflower meadow",                prompt: "A colorful wildflower meadow under a bright sunny sky with rolling hills" },
  { picsumId: 36,   title: "Underwater coral reef",            prompt: "A vibrant underwater coral reef teeming with colorful fish and sea life" },
  { picsumId: 37,   title: "City bridge at night",             prompt: "A beautifully lit city bridge at night with reflections in the water below" },
  { picsumId: 39,   title: "Lavender field sunrise",           prompt: "Endless rows of lavender in bloom at sunrise with a warm golden glow" },
  { picsumId: 40,   title: "Old European alley",               prompt: "A charming narrow alley in an old European town with cobblestone streets" },
  { picsumId: 42,   title: "Starry night sky",                 prompt: "A breathtaking starry night sky over a dark silhouetted mountain range" },
  { picsumId: 43,   title: "Modern architecture",              prompt: "A striking modern building with geometric glass and steel architecture" },
  { picsumId: 48,   title: "Foggy lake morning",               prompt: "A serene foggy morning on a still lake with trees reflected in the water" },
  { picsumId: 49,   title: "Cherry blossom path",              prompt: "A scenic path lined with cherry blossom trees in full bloom, petals falling" },
  { picsumId: 50,   title: "Vintage car on road",              prompt: "A classic vintage car parked on a quiet country road at sunset" },
  { picsumId: 52,   title: "Waterfall in jungle",              prompt: "A powerful waterfall cascading into a turquoise pool in a tropical jungle" },
  { picsumId: 54,   title: "Hot air balloons",                 prompt: "Colorful hot air balloons floating over a misty valley at dawn" },
  { picsumId: 55,   title: "Lighthouse on cliff",              prompt: "A red and white lighthouse standing on a rugged cliff overlooking the sea" },
  { picsumId: 56,   title: "Abstract smoke swirls",            prompt: "Colorful abstract smoke swirls on a dark background with blue and purple tones" },
  { picsumId: 57,   title: "Rainforest waterfall",             prompt: "A hidden waterfall deep in a lush tropical rainforest with mossy rocks" },
  { picsumId: 58,   title: "Snowcapped village",               prompt: "A cozy alpine village covered in fresh snow with warm lights glowing from windows" },
  { picsumId: 59,   title: "Golden wheat field",               prompt: "A vast golden wheat field swaying in the wind under a warm summer sky" },
  { picsumId: 60,   title: "City skyline reflection",          prompt: "A modern city skyline perfectly reflected in a calm river at twilight" },
  { picsumId: 64,   title: "Tropical beach palm trees",        prompt: "A pristine tropical beach with crystal clear water and palm trees swaying" },
  { picsumId: 65,   title: "Northern lights over lake",        prompt: "Vivid green northern lights dancing above a frozen lake in Iceland" },
  { picsumId: 66,   title: "Japanese temple garden",           prompt: "A traditional Japanese temple surrounded by a meticulously maintained zen garden" },
  { picsumId: 67,   title: "Sunset behind mountains",          prompt: "A fiery sunset silhouetting a jagged mountain range with purple and orange sky" },
  { picsumId: 68,   title: "Macro flower petals",              prompt: "An extreme close-up of delicate flower petals with water droplets glistening" },
  { picsumId: 69,   title: "Industrial skyline",               prompt: "A dramatic industrial skyline with smokestacks silhouetted against a red sunset" },
  { picsumId: 70,   title: "Frozen lake patterns",             prompt: "Abstract patterns in a frozen lake surface with cracks and bubbles trapped in ice" },
  { picsumId: 71,   title: "Rustic barn landscape",            prompt: "A weathered rustic barn in a green countryside with rolling hills behind it" },
  { picsumId: 74,   title: "Aerial beach waves",               prompt: "An aerial view of turquoise ocean waves meeting a white sandy beach" },
  { picsumId: 75,   title: "Neon city streets",                prompt: "Vibrant neon-lit city streets at night with reflections on wet pavement" },
  { picsumId: 76,   title: "Autumn forest path",               prompt: "A peaceful forest path covered in golden autumn leaves with warm sunlight" },
  { picsumId: 77,   title: "Volcanic landscape",               prompt: "A dramatic volcanic landscape with black rock and steam rising from the ground" },
  { picsumId: 78,   title: "Minimalist white room",            prompt: "A clean minimalist white room with a single plant and soft natural light" },
  { picsumId: 79,   title: "Sailing boat at sea",              prompt: "A classic sailing boat on deep blue open water with billowing white sails" },
  { picsumId: 80,   title: "Misty morning vineyard",           prompt: "Rows of grapevines in a misty morning vineyard with golden backlighting" },
  { picsumId: 81,   title: "Geometric reflections",            prompt: "Abstract geometric reflections in a modern glass building facade" },
  { picsumId: 82,   title: "Mountain cabin sunset",            prompt: "A cozy mountain cabin with smoke rising from the chimney at sunset" },
  { picsumId: 83,   title: "Ocean pier at dawn",               prompt: "A long wooden pier stretching into the ocean at dawn with pastel sky colors" },
  { picsumId: 84,   title: "Street art mural",                 prompt: "A vibrant large-scale street art mural on a brick wall in an urban setting" },
];

// Extra pool images used when the user "creates" new images in the demo
const POOL_PICSUM_IDS = [85, 88, 89, 90, 91, 96, 100, 101, 102, 103, 104, 106, 109, 110, 111];

function generateE2EImages(imageFiles) {
  // imageFiles: Map<index, { file, size }>  — only indices that were successfully downloaded
  const records = [];
  for (let i = 0; i < DEMO_IMAGE_DEFS.length; i++) {
    const def = DEMO_IMAGE_DEFS[i];
    const info = imageFiles.get(i);
    if (!info) continue; // skip failed downloads
    const minutesAgo = Math.round(1440 * 30 * (1 - i / DEMO_IMAGE_DEFS.length)); // spread over ~30 days
    const createdAt = isoMinus(minutesAgo);
    records.push({
      id: genId(),
      kind: "image",
      status: "succeeded",
      prompt: def.prompt,
      title: def.title,
      backendId: "mock-image",
      backendLabel: "Mock image backend",
      model: "mock-v1",
      createdAt,
      updatedAt: createdAt,
      output: { relativePath: `images/${info.file}`, filePath: path.join(WORKSPACE_DIR, "images", info.file), exists: true, size: info.size, mimeType: "image/jpeg" },
    });
  }
  return records;
}

// ── Config files ─────────────────────────────────────────────────────────────

function generateUserConfig() {
  return {
    schemaVersion: 1,
    displayName: "Alex",
    profileNameKey: "alex taylor",
    locale: "en",
    emailAccounts: ["inbox"],
    calendarAccounts: ["calendar-main"],
    anonymizeContacts: false,
    dataSources: {},
    telegram: { enabled: true, botToken: "demo-managed", allowedChatIds: [], syncMessages: false },
    imageGeneration: { enabled: true, defaultBackendId: "mock-image", model: "mock-v1" },
    transcription: { provider: "local" },
    tts: { enabled: true, autoRead: false, provider: "local", voice: "alloy", speed: 1 },
  };
}

function generateLocalSettings() {
  return {
    schemaVersion: 1,
    locale: "en",
    onboardingCompleted: true,
    disclaimerAcceptedAt: new Date().toISOString(),
    sidebarOpen: true,
    openClawEnabled: true,
    theme: "dark",
    activeAdapter: "openclaw",
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN (async — downloads images from picsum.photos)
// ══════════════════════════════════════════════════════════════════════════════

async function main() {

console.log("🌱 ClawJS Mock Seed Generator");
console.log(`   Data dir:      ${DATA_DIR}`);
console.log(`   Workspace dir: ${WORKSPACE_DIR}`);
console.log(`   Config dir:    ${CONFIG_DIR}`);
console.log("");

// Ensure directories
ensureDir(DATA_DIR);
ensureDir(CONVERSATIONS_DIR);
ensureDir(CONFIG_DIR);
ensureDir(LOCAL_SETTINGS_DIR);

// Generate conversations
console.log("  → Generating conversations...");
const { sessions, allSessions } = generateConversations();
for (const s of sessions) {
  const filePath = path.join(CONVERSATIONS_DIR, `${s.sessionId}.jsonl`);
  fs.writeFileSync(filePath, s.jsonl, "utf-8");
}
console.log(`    ✓ ${sessions.length} conversations`);

// Generate collections
console.log("  → Generating collections...");
const notes = generateNotes();
writeCollection("notes", notes);
console.log(`    ✓ ${notes.length} notes`);

const tasks = generateTasks();
writeCollection("tasks", tasks);
console.log(`    ✓ ${tasks.length} tasks`);

const goals = generateGoals();
writeCollection("goals", goals);
console.log(`    ✓ ${goals.length} goals`);

const contacts = generateContacts();
writeCollection("e2e-contacts", contacts);
console.log(`    ✓ ${contacts.length} contacts`);

const routines = generateRoutines();
writeCollection("routines", routines);
console.log(`    ✓ ${routines.length} routines`);

const routineExecs = generateRoutineExecutions();
writeCollection("routine-executions", routineExecs);
console.log(`    ✓ ${routineExecs.length} routine executions`);

const activity = generateActivity();
writeCollection("activity-events", activity);
console.log(`    ✓ ${activity.length} activity events`);

const usage = generateUsage();
writeCollection("usage-records", usage);
console.log(`    ✓ ${usage.length} usage records`);

const memory = generateMemory();
writeCollection("memory", memory);
console.log(`    ✓ ${memory.length} memory entries`);

const inbox = generateInbox();
writeCollection("inbox", inbox);
console.log(`    ✓ ${inbox.length} inbox messages`);

const personas = generatePersonas();
writeCollection("personas", personas);
console.log(`    ✓ ${personas.length} personas`);

const plugins = generatePlugins();
writeCollection("plugins", plugins);
console.log(`    ✓ ${plugins.length} plugins`);

// ── Download images from picsum.photos (Unsplash) ───────────────────────────
console.log("  → Downloading demo images from picsum.photos...");
const imgDir = path.join(WORKSPACE_DIR, "images");
const poolDir = path.join(WORKSPACE_DIR, "images", "_pool");
ensureDir(imgDir);
ensureDir(poolDir);

// Build download URLs for gallery images
const galleryUrls = DEMO_IMAGE_DEFS.map((d) => `https://picsum.photos/id/${d.picsumId}/640/480`);
const poolUrls = POOL_PICSUM_IDS.map((id) => `https://picsum.photos/id/${id}/640/480`);

// Download all in parallel (gallery + pool)
const allUrls = [...galleryUrls, ...poolUrls];
const downloaded = await downloadBatch(allUrls, 10);

// Save gallery images
const imageFiles = new Map(); // index -> { file, size }
let galleryCount = 0;
const fallbackColors = [
  [255,94,58, 147,51,234], [6,78,59, 56,189,248], [88,28,135, 236,72,153],
  [220,38,38, 251,191,36], [15,23,42, 30,58,138], [157,23,77, 251,146,60],
];
for (let i = 0; i < DEMO_IMAGE_DEFS.length; i++) {
  const file = `img-${String(i).padStart(3, "0")}.jpg`;
  let buf = downloaded.get(i);
  if (!buf) {
    // Fallback: gradient PNG
    const c = fallbackColors[i % fallbackColors.length];
    buf = createGradientPng(640, 480, c[0], c[1], c[2], c[3], c[4], c[5]);
  }
  fs.writeFileSync(path.join(imgDir, file), buf);
  imageFiles.set(i, { file, size: buf.length });
  galleryCount++;
}

// Save pool images (for the "create" flow)
let poolCount = 0;
for (let i = 0; i < POOL_PICSUM_IDS.length; i++) {
  const buf = downloaded.get(DEMO_IMAGE_DEFS.length + i);
  if (!buf) continue;
  const file = `pool-${String(i).padStart(3, "0")}.jpg`;
  fs.writeFileSync(path.join(poolDir, file), buf);
  poolCount++;
}
console.log(`    ✓ ${galleryCount} gallery images + ${poolCount} pool images downloaded`);

// Generate documents
console.log("  → Generating documents...");
writeDocument("budget-config", generateBudget());
writeDocument("e2e-auth", generateE2EAuth());
writeDocument("e2e-integrations", generateE2EIntegrations());
writeCollection("e2e-skills", generateE2ESkills());
writeDocument("e2e-skill-sources", [
  { id: "registry", label: "Registry", status: "ready", capabilities: { search: true, install: true, resolveExact: true }, summary: "Versioned skills published by the ClawJS registry." },
  { id: "workspace", label: "Workspace", status: "ready", capabilities: { search: true, install: true, resolveExact: true }, summary: "Skills discovered in the local workspace." },
]);
writeCollection("e2e-images", generateE2EImages(imageFiles));
writeDocument("e2e-workspace-files", generateE2EWorkspaceFiles());
console.log("    ✓ E2E documents (auth, integrations, skills, workspace files, images)");

// Generate config files
// user-config.json goes to {workspace}/config/user-config.json (getClawJSConfigDir())
// settings.json goes to {workspace}/settings.json (getClawJSLocalSettingsPath())
console.log("  → Generating config...");
writeJson(path.join(WORKSPACE_DIR, "config", "user-config.json"), generateUserConfig());
writeJson(path.join(WORKSPACE_DIR, "settings.json"), generateLocalSettings());
console.log("    ✓ User config + local settings");

console.log("");
console.log("✅ Mock data generated successfully!");
console.log(`   ${sessions.length} conversations, ${notes.length} notes, ${tasks.length} tasks,`);
console.log(`   ${contacts.length} contacts, ${inbox.length} inbox messages, ${usage.length} usage records`);
console.log(`   ${galleryCount} gallery images, ${poolCount} pool images for create flow`);

} // end main

main().catch((err) => { console.error("❌ Seed failed:", err); process.exit(1); });
