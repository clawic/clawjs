/**
 * Live WhatsApp data computation. Reads directly from wacli.db
 * Bypasses the Python module's stale sync payloads and timezone bugs
 */
import Database from "better-sqlite3";
import { getUserConfig, resolvePath } from "./user-config";
// Fallback filters when contact metadata helpers are unavailable.
function isNoiseChat(_name: string): boolean { return false; }
function shouldExcludeGroup(): boolean { return false; }
function categorize(_name: string): "family" | "work" | "friends" { return "friends"; }

// Local scope helpers for standalone live-data queries.
type LiveScope = "day" | "week" | "month" | "all";
function normalizeLiveScope(scope?: string | null): LiveScope {
  if (scope === "day" || scope === "week" || scope === "month" || scope === "all") return scope;
  return "day";
}
function scopeWindowDays(scope: LiveScope): number {
  switch (scope) { case "day": return 1; case "week": return 7; case "month": return 30; default: return 1; }
}
import { openDb } from "./safe-db";

// Simple sentiment via word/emoji lists
const POS_WORDS = new Set([
  "thanks", "thank", "great", "good", "love", "awesome", "perfect",
  "amazing", "excellent", "happy", "glad", "nice", "wonderful",
  "beautiful", "best", "appreciate", "congrats", "congratulations",
  "haha", "lol", "brilliant", "fantastic", "solid", "excellent",
  "perfectly", "incredible", "superb", "yay", "yep", "absolutely",
  "👍", "🙏", "❤️", "😊", "😂", "💪", "🎉", "💯", "✅", "😍",
]);
const NEG_WORDS = new Set([
  "bad", "terrible", "awful", "hate", "angry", "upset", "frustrated",
  "annoyed", "disappointed", "worried", "unfortunately", "problem",
  "issue", "wrong", "fail", "failed", "sorry", "error", "concerned",
  "damn", "hell",
]);

function simpleTone(texts: string[]): number {
  let pos = 0, neg = 0;
  for (const text of texts) {
    for (const w of text.toLowerCase().split(/\s+/)) {
      if (POS_WORDS.has(w)) pos++;
      if (NEG_WORDS.has(w)) neg++;
    }
  }
  if (pos + neg === 0) return 0.5;
  return Math.max(0.15, Math.min(0.85, 0.5 + ((pos - neg) / (pos + neg)) * 0.4));
}

// ---- Contact merging ----

function buildMergeMap(chatNames: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const unique = [...new Set(chatNames)];

  for (const name of unique) {
    const words = name.trim().split(/\s+/);
    const isShort = words.length === 1 && name.length >= 2;
    const isAbbrev = words.length === 2 && words[1].length <= 2;
    if (!isShort && !isAbbrev) continue;

    const firstName = words[0].toLowerCase();
    const matches = unique.filter((other) => {
      if (other === name || map.has(other)) return false;
      const ow = other.trim().split(/\s+/);
      if (ow[0].toLowerCase() !== firstName) return false;
      if (ow.length <= words.length) return false;
      if (isAbbrev && ow.length >= 2) {
        return ow[1].toLowerCase().startsWith(words[1].toLowerCase());
      }
      return true;
    });

    if (matches.length === 1) {
      map.set(name, matches[0]);
    }
  }
  return map;
}

// ---- Types ----

export interface LiveContact {
  id: string;
  label: string;
  messages_sent: number;
  messages_received: number;
  total: number;
  tone_score: number;
  category: "family" | "work" | "friends";
  is_group: boolean;
}

export interface LivePeriodStats {
  scope: LiveScope;
  date: string;
  period_start: string;
  period_end: string;
  days_covered: number;
  active_days: number;
  avg_messages_per_day: number;
  total_messages: number;
  contacts_active: number;
  first_active: string; // "08:30"
  last_active: string;  // "02:15"
  allocation: { family: number; work: number; friends: number };
  hourly: number[];     // 24 elements, messages per hour
}

export interface LiveObservation {
  type: "high_volume" | "one_sided" | "work_heavy" | "long_day" | "quiet_contact" | "negative_tone" | "positive_tone" | "surge";
  title: string;
  description: string;
  confidence: number;
  target?: string;
}

// ---- Raw message row ----

interface MsgRow {
  chat_jid: string;
  chat_name: string;
  sender_name: string;
  from_me: number;
  ts: number;
  msg_text: string;
}

interface WindowedMsgRow extends MsgRow {
  msg_date: string;
}

interface LiveWindow {
  scope: LiveScope;
  anchorDate: string;
  periodStart: string;
  periodEnd: string;
  daysCovered: number;
  baselineStart: string | null;
  baselineEndExclusive: string | null;
  baselineDaysCovered: number;
}

function addDays(date: string, delta: number): string {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + delta);
  return value.toISOString().slice(0, 10);
}

function inclusiveDayDiff(start: string, end: string): number {
  const startTs = new Date(`${start}T00:00:00`).getTime();
  const endTs = new Date(`${end}T00:00:00`).getTime();
  return Math.max(1, Math.round((endTs - startTs) / 86_400_000) + 1);
}

function minutesSinceMidnight(ts: number): number {
  const value = new Date(ts * 1000);
  return value.getHours() * 60 + value.getMinutes();
}

function formatMinutes(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = String(Math.floor(normalized / 60)).padStart(2, "0");
  const mins = String(normalized % 60).padStart(2, "0");
  return `${hours}:${mins}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function resolveLiveWindow(anchorDate: string, scope: LiveScope, availableDates: string[]): LiveWindow {
  if (scope === "all") {
    const periodStart = availableDates[availableDates.length - 1] || anchorDate;
    const periodEnd = anchorDate;
    return {
      scope,
      anchorDate,
      periodStart,
      periodEnd,
      daysCovered: inclusiveDayDiff(periodStart, periodEnd),
      baselineStart: null,
      baselineEndExclusive: null,
      baselineDaysCovered: 0,
    };
  }

  const daysCovered = scopeWindowDays(scope);
  const periodStart = addDays(anchorDate, -(daysCovered - 1));
  const baselineStart = addDays(periodStart, -daysCovered);

  return {
    scope,
    anchorDate,
    periodStart,
    periodEnd: anchorDate,
    daysCovered,
    baselineStart,
    baselineEndExclusive: periodStart,
    baselineDaysCovered: daysCovered,
  };
}

// ---- Core data function ----

export function getLiveData(targetDate?: string, requestedScope?: LiveScope | string): {
  contacts: LiveContact[];
  stats: LivePeriodStats | null;
  observations: LiveObservation[];
  availableDates: string[];
} {
  const config = getUserConfig();
  const rawPath = config.dataSources.wacliDbPath;
  if (!rawPath) return { contacts: [], stats: null, observations: [], availableDates: [] };
  const dbPath = resolvePath(rawPath);
  let db: Database.Database;
  try {
    db = openDb(dbPath);
  } catch {
    return { contacts: [], stats: null, observations: [], availableDates: [] };
  }

  try {
    // Available dates
    const dateRows = db.prepare(`
      SELECT DISTINCT date(ts, 'unixepoch', 'localtime') as d
      FROM messages
      WHERE COALESCE(text, media_caption, '') != ''
      ORDER BY d DESC
      LIMIT 60
    `).all() as { d: string }[];
    const availableDates = dateRows.map((r) => r.d);

    const anchorDate = targetDate || availableDates[0] || new Date().toISOString().slice(0, 10);
    const scope = normalizeLiveScope(requestedScope);
    const window = resolveLiveWindow(anchorDate, scope, availableDates);

    const rangeRows = db.prepare(`
      SELECT chat_jid, chat_name, sender_name, from_me, ts,
             COALESCE(text, media_caption, '') as msg_text,
             date(ts, 'unixepoch', 'localtime') as msg_date
      FROM messages
      WHERE date(ts, 'unixepoch', 'localtime') >= ?
        AND date(ts, 'unixepoch', 'localtime') <= ?
        AND COALESCE(text, media_caption, '') != ''
      ORDER BY ts ASC
    `).all(window.periodStart, window.periodEnd) as WindowedMsgRow[];

    const baselineRows = window.baselineStart && window.baselineEndExclusive
      ? db.prepare(`
        SELECT chat_jid, chat_name, sender_name, from_me, ts,
               COALESCE(text, media_caption, '') as msg_text,
               date(ts, 'unixepoch', 'localtime') as msg_date
        FROM messages
        WHERE date(ts, 'unixepoch', 'localtime') >= ?
          AND date(ts, 'unixepoch', 'localtime') < ?
          AND COALESCE(text, media_caption, '') != ''
      `).all(window.baselineStart, window.baselineEndExclusive) as WindowedMsgRow[]
      : [];

    if (rangeRows.length === 0) {
      return { contacts: [], stats: null, observations: [], availableDates };
    }

    // Collect all chat names for merge map
    const excludeGroups = shouldExcludeGroup();
    const allChatNames = [...new Set(rangeRows
      .filter((r) => r.chat_name && !isNoiseChat(r.chat_name) && !(excludeGroups && r.chat_jid.endsWith("@g.us")))
      .map((r) => r.chat_name)
    )];
    const mergeMap = buildMergeMap(allChatNames);

    // Group messages by normalized contact
    const contactMap = new Map<
      string,
      { label: string; sent: number; rcvd: number; texts: string[]; senders: Set<string>; ts: number[]; isGroup: boolean }
    >();

    for (const r of rangeRows) {
      if (!r.chat_name || isNoiseChat(r.chat_name)) continue;
      if (excludeGroups && r.chat_jid.endsWith("@g.us")) continue;
      if (!r.msg_text.trim() || r.msg_text.length <= 2) continue;

      const canonical = mergeMap.get(r.chat_name) || r.chat_name;
      const entry = contactMap.get(canonical) || {
        label: canonical,
        sent: 0,
        rcvd: 0,
        texts: [],
        senders: new Set<string>(),
        ts: [],
        isGroup: r.chat_jid.endsWith("@g.us"),
      };

      if (r.from_me) entry.sent++;
      else {
        entry.rcvd++;
        if (r.sender_name) entry.senders.add(r.sender_name);
      }
      entry.texts.push(r.msg_text);
      entry.ts.push(r.ts);
      contactMap.set(canonical, entry);
    }

    // Build contact list
    const contacts: LiveContact[] = [];
    for (const [canonical, data] of contactMap) {
      const total = data.sent + data.rcvd;
      // Skip contacts the user never replied to (broadcasts, lurker groups)
      // unless it's a close relationship, it still matters even without a reply yet
      const cat = categorize(canonical);
      if (data.sent === 0 && cat !== "family") continue;

      const isGroup = data.isGroup;
      // Pick display label: use shorter of the aliases if merged
      const aliases = [canonical, ...allChatNames.filter((n) => mergeMap.get(n) === canonical)];
      const label = aliases.sort((a, b) => a.length - b.length)[0];
      // Re-categorize with all aliases for better matching
      const fullCat = categorize(aliases.join(" "));

      contacts.push({
        id: canonical.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase(),
        label,
        messages_sent: data.sent,
        messages_received: data.rcvd,
        total,
        tone_score: simpleTone(data.texts),
        category: fullCat,
        is_group: isGroup,
      });
    }
    // Remove groups and contacts without a real person name (WhatsApp IDs, phone numbers)
    const isPersonName = (label: string) => {
      const trimmed = label.trim();
      if (/@/.test(trimmed)) return false;
      if (/^\+?\d[\d\s\-()]{4,}$/.test(trimmed)) return false;
      const words = trimmed.split(/\s+/).filter((w) => /^\p{L}+$/u.test(w));
      return words.length >= 2;
    };
    const filtered = contacts.filter((c) => !c.is_group && isPersonName(c.label));
    filtered.sort((a, b) => b.total - a.total);

    const allTs = rangeRows.map((r) => r.ts);
    const firstTs = Math.min(...allTs);
    const lastTs = Math.max(...allTs);

    const hourly = new Array(24).fill(0);
    for (const ts of allTs) {
      hourly[new Date(ts * 1000).getHours()]++;
    }

    const dayWindows = new Map<string, { first: number; last: number }>();
    for (const row of rangeRows) {
      const minute = minutesSinceMidnight(row.ts);
      const current = dayWindows.get(row.msg_date);
      if (!current) {
        dayWindows.set(row.msg_date, { first: minute, last: minute });
        continue;
      }
      current.first = Math.min(current.first, minute);
      current.last = Math.max(current.last, minute);
    }

    const alloc = { family: 0, work: 0, friends: 0 };
    for (const c of filtered) {
      alloc[c.category] += c.total;
    }
    const allocTotal = alloc.family + alloc.work + alloc.friends;
    if (allocTotal > 0) {
      alloc.family = Math.round((alloc.family / allocTotal) * 100);
      alloc.work = Math.round((alloc.work / allocTotal) * 100);
      alloc.friends = 100 - alloc.family - alloc.work; // ensure they sum to 100
    }

    const fmt = (ts: number) =>
      new Date(ts * 1000).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

    const stats: LivePeriodStats = {
      scope,
      date: anchorDate,
      period_start: window.periodStart,
      period_end: window.periodEnd,
      days_covered: window.daysCovered,
      active_days: dayWindows.size,
      avg_messages_per_day: Number((rangeRows.length / window.daysCovered).toFixed(1)),
      total_messages: rangeRows.length,
      contacts_active: filtered.length,
      first_active: scope === "day" ? fmt(firstTs) : formatMinutes(median([...dayWindows.values()].map((entry) => entry.first))),
      last_active: scope === "day" ? fmt(lastTs) : formatMinutes(median([...dayWindows.values()].map((entry) => entry.last))),
      allocation: alloc,
      hourly,
    };

    // ---- Compute observations ----
    const observations = computeObservations(filtered, stats, baselineRows, window.baselineDaysCovered, excludeGroups);

    return { contacts: filtered, stats, observations, availableDates };
  } finally {
    db.close();
  }
}

// ---- Observations engine ----

function computeObservations(
  contacts: LiveContact[],
  stats: LivePeriodStats,
  baselineRows: WindowedMsgRow[],
  baselineDaysCovered: number,
  excludeGroups = false,
): LiveObservation[] {
  const obs: LiveObservation[] = [];

  // Compute baseline averages
  const baselineWindowDays = Math.max(baselineDaysCovered, 1);
  const baselineAvgMsgs = baselineRows.length / baselineWindowDays;
  const scopeLabel = stats.scope === "day"
    ? "today"
    : stats.scope === "all"
      ? "across your full history"
      : `across this ${stats.days_covered}-day window`;
  const baselineLabel = stats.scope === "day"
    ? "your previous 7 days"
    : `the previous ${baselineWindowDays}-day window`;
  const currentAvgMsgs = stats.total_messages / Math.max(stats.days_covered, 1);

  // Per-contact baseline
  const baselineByContact = new Map<string, number>();
  for (const r of baselineRows) {
    if (!r.chat_name || isNoiseChat(r.chat_name)) continue;
    if (excludeGroups && r.chat_jid.endsWith("@g.us")) continue;
    const key = r.chat_name.toLowerCase();
    baselineByContact.set(key, (baselineByContact.get(key) || 0) + 1);
  }
  for (const [k, v] of baselineByContact) {
    baselineByContact.set(k, v / baselineWindowDays);
  }

  // Baseline allocation
  const baselineAlloc = { family: 0, work: 0, friends: 0 };
  for (const r of baselineRows) {
    if (!r.chat_name || isNoiseChat(r.chat_name)) continue;
    if (excludeGroups && r.chat_jid.endsWith("@g.us")) continue;
    baselineAlloc[categorize(r.chat_name)] += 1;
  }
  const baselineAllocTotal = baselineAlloc.family + baselineAlloc.work + baselineAlloc.friends;

  // 1. Overall volume vs baseline
  if (baselineAvgMsgs > 0 && currentAvgMsgs > baselineAvgMsgs * 1.35) {
    const ratio = (currentAvgMsgs / baselineAvgMsgs).toFixed(1);
    obs.push({
      type: "surge",
      title: "High Communication Day",
      description: `${stats.total_messages} messages ${scopeLabel}, averaging ${currentAvgMsgs.toFixed(1)}/day vs ${baselineAvgMsgs.toFixed(1)}/day in ${baselineLabel}. That's ${ratio}x your normal pace.`,
      confidence: Math.min(0.95, (currentAvgMsgs / baselineAvgMsgs - 1) * 0.5),
    });
  }

  // 2. Top contacts with high volume vs baseline
  for (const c of contacts.slice(0, 10)) {
    const baselineKey = c.label.toLowerCase();
    const baselineAvg = baselineByContact.get(baselineKey) || 0;
    const expectedTotal = baselineAvg * stats.days_covered;
    if (expectedTotal > 2 && c.total > expectedTotal * 1.8) {
      obs.push({
        type: "high_volume",
        title: `Intense Exchange with ${c.label}`,
        description: `${c.total} messages ${scopeLabel} vs an expected ${Math.round(expectedTotal)} based on ${baselineLabel}. ${c.messages_sent} sent, ${c.messages_received} received.`,
        confidence: Math.min(0.9, (c.total / expectedTotal - 1) * 0.3),
        target: c.label,
      });
    }
  }

  // 3. One-sided conversations
  for (const c of contacts) {
    if (c.total < 8) continue;
    const ratio = c.messages_sent / Math.max(c.messages_received, 1);
    if (ratio > 3 && c.messages_sent >= 10) {
      obs.push({
        type: "one_sided",
        title: `One-Sided with ${c.label}`,
        description: `You sent ${c.messages_sent} messages but received only ${c.messages_received}. ${ratio.toFixed(1)}:1 send ratio.`,
        confidence: Math.min(0.85, ratio * 0.15),
        target: c.label,
      });
    }
    const inverseRatio = c.messages_received / Math.max(c.messages_sent, 1);
    if (inverseRatio > 4 && c.messages_received >= 15 && c.messages_sent === 0) {
      obs.push({
        type: "one_sided",
        title: `Unread Stream from ${c.label}`,
        description: `${c.messages_received} messages received but you haven't replied.`,
        confidence: 0.6,
        target: c.label,
      });
    }
  }

  // 4. Work-heavy day
  if (baselineAllocTotal > 0) {
    const baselineWorkPct = Math.round((baselineAlloc.work / baselineAllocTotal) * 100);
    if (stats.allocation.work > 70 && stats.allocation.work > baselineWorkPct + 15) {
      obs.push({
        type: "work_heavy",
        title: "Work-Heavy Day",
        description: `${stats.allocation.work}% of your conversations are work-related ${scopeLabel}, up from ${baselineWorkPct}% in ${baselineLabel}. Family is at ${stats.allocation.family}%.`,
        confidence: Math.min(0.85, (stats.allocation.work - baselineWorkPct) * 0.02),
      });
    }
  }

  // 5. Negative tone contacts
  for (const c of contacts) {
    if (c.total < 5) continue;
    if (c.tone_score < 0.35) {
      obs.push({
        type: "negative_tone",
        title: `Tense Exchange with ${c.label}`,
        description: `Conversation tone is notably negative (${(c.tone_score * 100).toFixed(0)}% positive). Worth reflecting on.`,
        confidence: Math.min(0.8, (0.5 - c.tone_score) * 2),
        target: c.label,
      });
    }
  }

  // 6. Long active window
  const firstH = parseInt(stats.first_active.split(":")[0]);
  const lastH = parseInt(stats.last_active.split(":")[0]);
  const span = lastH >= firstH ? lastH - firstH : 24 - firstH + lastH;
  if (stats.scope === "day" && span >= 16) {
    obs.push({
      type: "long_day",
      title: "Extended Active Window",
      description: `Active from ${stats.first_active} to ${stats.last_active}, a ${span}-hour communication window.`,
      confidence: Math.min(0.85, (span - 14) * 0.15),
    });
  }

  // Sort by confidence
  obs.sort((a, b) => b.confidence - a.confidence);
  return obs;
}

// ---- Standalone date list ----

export function getAvailableDatesLive(): string[] {
  const config = getUserConfig();
  const rawPath = config.dataSources.wacliDbPath;
  if (!rawPath) return [];
  const dbPath = resolvePath(rawPath);
  try {
    const db = openDb(dbPath, {});
    const rows = db.prepare(`
      SELECT DISTINCT date(ts, 'unixepoch', 'localtime') as d
      FROM messages ORDER BY d DESC LIMIT 60
    `).all() as { d: string }[];
    db.close();
    return rows.map((r) => r.d);
  } catch {
    return [];
  }
}
