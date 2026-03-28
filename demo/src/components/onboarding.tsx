"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useLocale } from "@/components/locale-provider";
import { useAppBootstrap } from "@/components/app-bootstrap-provider";
import type { IntegrationStatus } from "@/lib/app-bootstrap";
import { hasConfirmedOAuthSubscription, type AiAuthSummary } from "@/lib/ai-auth";
import { localeMetadata, locales, type Locale, type Messages } from "@/lib/i18n/messages";
import { Check, ChevronRight, ChevronLeft, ChevronDown, MessageCircle, Calendar, Mail, Loader2, AlertCircle, RotateCcw, Bug, HeartPulse, Code2, Database, Users, Mic, Volume2, Brain, Sparkles, Briefcase, Activity } from "lucide-react";

/* ── QR helper ──────────────────────────────────────────────────── */

function terminalQrToDataUri(qrText: string): string {
  if (!qrText.trim()) return "";
  const lines = qrText.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return "";
  const glyphs = lines.map((line) => Array.from(line));
  const width = Math.max(...glyphs.map((line) => line.length));
  const rows: boolean[][] = [];
  for (const line of glyphs) {
    const top = new Array<boolean>(width).fill(false);
    const bottom = new Array<boolean>(width).fill(false);
    for (let x = 0; x < width; x += 1) {
      const char = line[x] || " ";
      if (char === "█") { top[x] = true; bottom[x] = true; }
      else if (char === "▀") { top[x] = true; }
      else if (char === "▄") { bottom[x] = true; }
    }
    rows.push(top, bottom);
  }
  let path = "";
  for (let y = 0; y < rows.length; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rows[y][x]) path += `M${x} ${y}h1v1H${x}Z`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${rows.length}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="black"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ── Concern area definitions ────────────────────────────────────── */

type ConcernCategory = "emotional" | "relationships" | "growth" | "work" | "health";
type ConcernKey = keyof Messages["onboarding"]["concerns"]["items"];
type AuthState = "idle" | "launching" | "polling" | "done";
type AuthLaunchMode = "browser" | "terminal" | null;

const CONCERN_CATEGORIES: Array<{ id: ConcernCategory; items: ConcernKey[] }> = [
  { id: "emotional", items: ["anxiety", "overthinking", "stress", "moodSwings", "loneliness"] },
  { id: "relationships", items: ["family", "partner", "communication", "boundaries", "socialLife"] },
  { id: "growth", items: ["selfEsteem", "lifeBalance", "purpose", "confidence", "decisionMaking"] },
  { id: "work", items: ["burnout", "workStress", "careerDirection", "productivity", "workRelationships"] },
  { id: "health", items: ["sleep", "exercise", "nutrition", "habits", "energy"] },
];

/* ── Animated step transition ────────────────────────────────────── */

const FADE_OUT_MS = 250;
const FADE_IN_MS = 350;

function StepContainer({ children, visible }: { children: React.ReactNode; visible: boolean }) {
  const [phase, setPhase] = useState<"hidden" | "entering" | "visible" | "exiting">(visible ? "visible" : "hidden");
  const [shouldRender, setShouldRender] = useState(visible);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      const t = window.setTimeout(() => setPhase("entering"), FADE_OUT_MS);
      return () => window.clearTimeout(t);
    }
    setPhase("exiting");
    const t = window.setTimeout(() => {
      setShouldRender(false);
      setPhase("hidden");
    }, FADE_OUT_MS);
    return () => window.clearTimeout(t);
  }, [visible]);

  useEffect(() => {
    if (phase === "entering") {
      const t = window.setTimeout(() => setPhase("visible"), FADE_IN_MS);
      return () => window.clearTimeout(t);
    }
  }, [phase]);

  if (!shouldRender) return null;

  const isVisible = phase === "entering" || phase === "visible";

  return (
    <div
      className="w-full px-6"
      style={{
        position: phase === "exiting" ? "absolute" : "relative",
        ...(phase === "exiting" && { left: 0, right: 0 }),
        opacity: isVisible ? 1 : 0,
        transition: `opacity ${isVisible ? FADE_IN_MS : FADE_OUT_MS}ms cubic-bezier(0.25, 0.1, 0.25, 1)`,
      }}
    >
      {children}
    </div>
  );
}

/* ── Navigation buttons ───────────────────────────────────────────── */

function NavButtons({
  messages,
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
}: {
  messages: Messages;
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-3 mt-10">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] rounded-xl transition-colors duration-200"
        >
          <ChevronLeft className="w-4 h-4" />
          {messages.onboarding.back}
        </button>
      )}
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="flex items-center gap-2 px-6 py-2.5 bg-foreground text-background rounded-xl text-sm font-medium hover:bg-foreground-intense transition-colors duration-200 disabled:opacity-20 disabled:cursor-not-allowed"
      >
        {nextLabel}
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

/* ── Small action button for integration cards ────────────────────── */

function CardAction({
  label,
  onClick,
  loading,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  loading?: boolean;
  variant?: "default" | "primary";
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200 disabled:opacity-50 ${
        variant === "primary"
          ? "bg-foreground text-background hover:bg-foreground-intense"
          : "bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.12]"
      }`}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
      {label}
    </button>
  );
}

/* ── Toggle switch (matching settings design) ────────────────────── */

function Toggle({ enabled, onChange, disabled = false, testId }: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      disabled={disabled}
      data-testid={testId}
      className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0 ${
        enabled ? "bg-foreground" : "bg-border-hover"
      }`}
      aria-pressed={enabled}
    >
      <span className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-card transition-transform shadow-sm ${
        enabled ? "translate-x-[18px]" : ""
      }`} />
    </button>
  );
}

/* ── Status badge ─────────────────────────────────────────────────── */

function StatusBadge({
  label,
  variant,
  testId,
}: {
  label: string;
  variant: "success" | "muted" | "warning";
  testId?: string;
}) {
  const colors = {
    success: "text-emerald-600",
    muted: "text-muted-foreground",
    warning: "text-amber-600",
  };
  return (
    <div data-testid={testId} className={`shrink-0 flex items-center gap-1 text-xs ${colors[variant]}`}>
      {variant === "success" && <Check className="w-3.5 h-3.5" />}
      {variant === "warning" && <AlertCircle className="w-3.5 h-3.5" />}
      {label}
    </div>
  );
}

/* ── Progress ring with elapsed time ──────────────────────────────── */

function ProgressRing({ label, startedAt }: { label: string; startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const radius = 10;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="shrink-0 flex items-center gap-2 text-xs text-muted-foreground">
      <svg width="28" height="28" viewBox="0 0 28 28" className="animate-spin" style={{ animationDuration: "1.8s" }}>
        <circle
          cx="14" cy="14" r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          opacity="0.2"
        />
        <circle
          cx="14" cy="14" r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * 0.7}
          strokeLinecap="round"
        />
      </svg>
      <div className="flex flex-col">
        <span>{label}</span>
        {elapsed > 2 && (
          <span className="text-[10px] text-muted-foreground/70">{elapsed}s</span>
        )}
      </div>
    </div>
  );
}

/* ── Error badge with retry ──────────────────────────────────────── */

function ErrorBadge({ label, detail, onRetry }: { label: string; detail?: string; onRetry?: () => void }) {
  return (
    <div className="shrink-0 flex flex-col items-end gap-1">
      <div className="flex items-center gap-1 text-xs text-amber-600">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>{label}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="ml-1 p-0.5 rounded hover:bg-amber-50 dark:hover:bg-amber-950 transition-colors"
            title="Retry"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
      </div>
      {detail && (
        <span className="text-[10px] text-muted-foreground max-w-[180px] text-right truncate" title={detail}>
          {detail}
        </span>
      )}
    </div>
  );
}

function defaultToolStatus(): IntegrationStatus {
  return {
    openClaw: {
      installed: false,
      cliAvailable: false,
      agentConfigured: false,
      modelConfigured: false,
      authConfigured: false,
      ready: false,
      needsSetup: false,
      needsAuth: false,
      lastError: null,
      version: null,
      latestVersion: null,
      defaultModel: null,
    },
    whatsapp: { installed: false, dbExists: false },
    calendar: {
      installed: false,
      available: false,
      needsPermission: false,
      calendars: [],
      selectedCalendarValid: false,
      message: null,
    },
    email: {
      installed: false,
      available: false,
      accounts: [],
      selectedAccountsValid: false,
      message: null,
    },
    contacts: {
      installed: false,
      available: false,
      needsPermission: false,
      contactCount: 0,
      message: null,
    },
    transcription: { dbExists: false },
    telegram: { enabled: false, botConnected: false },
    slack: { enabled: false, botConnected: false },
  };
}

function isOpenClawEngineConfigured(status: IntegrationStatus["openClaw"] | undefined): boolean {
  return !!status?.agentConfigured && !status?.needsSetup;
}

/* ── Main onboarding flow ────────────────────────────────────────── */
/*
 * Steps:
 *   0 - Welcome
 *   1 - Language
 *   2 - Disclaimer & terms acceptance
 *   3 - Name
 *   4 - OpenClaw engine setup
 *   5 - AI provider auth
 *   6 - Data integrations (WhatsApp, calendar, email)
 *   7 - Tools (TTS, transcription)
 *   8 - Areas of concern & specific topics
 */

export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const { messages, locale, setLocale } = useLocale();
  const { bootstrapData, updateBootstrapData } = useAppBootstrap();

  const [step, setStep] = useState(0);
  const [name, setName] = useState(bootstrapData?.config.displayName || "");
  const [selectedAreas, setSelectedAreas] = useState<Set<ConcernCategory>>(new Set());
  const [selectedConcerns, setSelectedConcerns] = useState<Set<ConcernKey>>(new Set());
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [dataConsentAccepted, setDataConsentAccepted] = useState(false);
  const [openClawAccepted, setOpenClawAccepted] = useState(false);
  const [disclaimerPhase, setDisclaimerPhase] = useState<"info" | "accept">("info");
  // ageBlocked removed – no age verification step
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Engine (OpenClaw) states
  const [openClawInstalling, setOpenClawInstalling] = useState(false);
  const [openClawSetupState, setOpenClawSetupState] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [openClawPhase, setOpenClawPhase] = useState<"downloading" | "verifying" | "configuring">("downloading");
  const [openClawError, setOpenClawError] = useState<string | null>(null);
  const [openClawProgressStart, setOpenClawProgressStart] = useState(0);
  const setupTriggeredRef = useRef(false);

  // AI provider auth states (generic for all providers)
  const [oauthStates, setOauthStates] = useState<Record<string, AuthState>>({});
  const [oauthLaunchModes, setOauthLaunchModes] = useState<Record<string, AuthLaunchMode>>({});
  const [apiKeyValues, setApiKeyValues] = useState<Record<string, string>>({});
  const [apiKeySaved, setApiKeySaved] = useState<Record<string, boolean>>({});
  const [apiKeyModalProvider, setApiKeyModalProvider] = useState<string | null>(null);
  const [hasAnyBackendAuth, setHasAnyBackendAuth] = useState(false);
  const [authCheckLoading, setAuthCheckLoading] = useState(true);
  const [authLaunchError, setAuthLaunchError] = useState<string | null>(null);
  const authPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Data integration states
  const [wacliInstalling, setWacliInstalling] = useState(false);
  const [whatsappConnecting, setWhatsappConnecting] = useState(false);
  const [whatsappQr, setWhatsappQr] = useState("");
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const whatsappPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tools states
  const [ttsEnabled, setTtsEnabled] = useState(bootstrapData?.config.tts?.enabled ?? false);
  const [transcriptionEnabled, setTranscriptionEnabled] = useState(!!bootstrapData?.config.transcription?.provider);

  const applyLocale = useCallback(async (nextLocale: Locale) => {
    if (nextLocale === locale) return;
    setLocale(nextLocale);
    updateBootstrapData((current) => ({
      ...current,
      config: { ...current.config, locale: nextLocale },
    }));
    try {
      await fetch("/api/config/local", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });
    } catch { /* non-blocking */ }
  }, [locale, setLocale, updateBootstrapData]);

  useEffect(() => {
    if (step === 3) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 600);
      return () => window.clearTimeout(t);
    }
  }, [step]);

  // When reaching engine step, check if already ready (no auto-setup)
  useEffect(() => {
    if (step !== 4 || setupTriggeredRef.current) return;
    const toolStatus = bootstrapData?.toolStatus;
    if (!toolStatus) return;

    const engineReady = isOpenClawEngineConfigured(toolStatus.openClaw);
    if (engineReady) {
      setOpenClawSetupState("done");
      setupTriggeredRef.current = true;
    }
  }, [step, bootstrapData]);

  // Check initial auth status when reaching AI provider step
  useEffect(() => {
    if (step !== 5) return;
    setAuthCheckLoading(true);
    fetch("/api/integrations/auth", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const newOauth: Record<string, "done"> = {};
        if (hasConfirmedOAuthSubscription(data.providers as Record<string, AiAuthSummary> | undefined, "anthropic")) newOauth.anthropic = "done";
        if (hasConfirmedOAuthSubscription(data.providers as Record<string, AiAuthSummary> | undefined, "openai-codex")) newOauth["openai-codex"] = "done";
        if (Object.keys(newOauth).length) setOauthStates(prev => ({ ...prev, ...newOauth }));

        const savedKeys: Record<string, boolean> = {};
        for (const pid of ["anthropic", "openai", "google", "deepseek", "mistral", "xai", "groq", "openrouter"]) {
          if (data.providers?.[pid]?.hasProfileApiKey) savedKeys[pid] = true;
        }
        if (Object.keys(savedKeys).length) setApiKeySaved(prev => ({ ...prev, ...savedKeys }));

        const anyAuth = hasConfirmedOAuthSubscription(data.providers as Record<string, AiAuthSummary> | undefined, "openai-codex")
          || Object.values(data.providers ?? {}).some((p: any) => p.hasProfileApiKey);
        setHasAnyBackendAuth(anyAuth);
        setAuthCheckLoading(false);
      })
      .catch(() => { setAuthCheckLoading(false); });
  }, [step]);

  // Clean up polls on unmount
  useEffect(() => {
    return () => {
      if (whatsappPollRef.current) clearInterval(whatsappPollRef.current);
      if (authPollRef.current) clearInterval(authPollRef.current);
    };
  }, []);

  // ── Install handler (npm install -g) ──
  const installPackage = useCallback(async (pkg: "openclaw" | "wacli") => {
    const setInstalling = pkg === "openclaw" ? setOpenClawInstalling : setWacliInstalling;
    setInstalling(true);
    if (pkg === "openclaw") {
      setOpenClawError(null);
      setOpenClawPhase("downloading");
      setOpenClawProgressStart(Date.now());
    }
    try {
      const res = await fetch("/api/integrations/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pkg === "openclaw" ? { adapter: "openclaw" } : { package: pkg }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Server error (${res.status})`);
      }

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.output || data.error || "Installation failed");
      }

      if (pkg === "openclaw") {
        setOpenClawPhase("verifying");
        updateBootstrapData((current) => ({
          ...current,
          toolStatus: {
            ...current.toolStatus,
            openClaw: {
              ...current.toolStatus.openClaw,
              installed: true,
              cliAvailable: true,
              lastError: null,
            },
          },
        }));
        setInstalling(false);
        setOpenClawPhase("configuring");
        setOpenClawSetupState("running");
        setOpenClawProgressStart(Date.now());
        try {
          const setupRes = await fetch("/api/integrations/setup", { method: "POST" });
          const setupData = await setupRes.json();
          if (setupData.openClaw) {
            updateBootstrapData((current) => ({
              ...current,
              toolStatus: { ...current.toolStatus, openClaw: setupData.openClaw },
            }));
            const ok = isOpenClawEngineConfigured(setupData.openClaw);
            setOpenClawSetupState(ok ? "done" : "failed");
            if (!ok) setOpenClawError(setupData.openClaw.lastError || null);
          } else {
            setOpenClawSetupState("failed");
            setOpenClawError("Setup returned no status");
          }
        } catch (e) {
          setOpenClawSetupState("failed");
          setOpenClawError(e instanceof Error ? e.message : "Setup failed");
        }
        return;
      }

      const statusRes = await fetch("/api/integrations/status");
      const status = await statusRes.json();
      updateBootstrapData((current) => ({ ...current, toolStatus: status }));
    } catch (e) {
      if (pkg === "openclaw") {
        setOpenClawError(e instanceof Error ? e.message : "Installation failed");
      }
    }
    setInstalling(false);
  }, [updateBootstrapData]);

  // ── Setup-only handler (when OpenClaw CLI is already installed) ──
  const setupOpenClaw = useCallback(async () => {
    setOpenClawError(null);
    setOpenClawPhase("configuring");
    setOpenClawSetupState("running");
    setOpenClawProgressStart(Date.now());
    try {
      const setupRes = await fetch("/api/integrations/setup", { method: "POST" });
      const setupData = await setupRes.json();
      if (setupData.openClaw) {
        updateBootstrapData((current) => ({
          ...current,
          toolStatus: { ...current.toolStatus, openClaw: setupData.openClaw },
        }));
        const ok = isOpenClawEngineConfigured(setupData.openClaw);
        setOpenClawSetupState(ok ? "done" : "failed");
        if (!ok) setOpenClawError(setupData.openClaw.lastError || null);
      } else {
        setOpenClawSetupState("failed");
        setOpenClawError("Setup returned no status");
      }
    } catch (e) {
      setOpenClawSetupState("failed");
      setOpenClawError(e instanceof Error ? e.message : "Setup failed");
    }
  }, [updateBootstrapData]);

  // ── OAuth launch handler ──
  const launchOAuth = useCallback(async (provider: string) => {
    setAuthLaunchError(null);
    setOauthStates(prev => ({ ...prev, [provider]: "launching" }));
    setOauthLaunchModes(prev => ({ ...prev, [provider]: null }));

    try {
      const res = await fetch("/api/integrations/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "oauth", provider }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setAuthLaunchError(typeof data.error === "string" ? data.error : "Could not start the sign-in flow.");
        setOauthStates(prev => ({ ...prev, [provider]: "idle" }));
        setOauthLaunchModes(prev => ({ ...prev, [provider]: null }));
        return;
      }

      if (data.connected) {
        setAuthLaunchError(null);
        setHasAnyBackendAuth(true);
        setOauthStates(prev => ({ ...prev, [provider]: "done" }));
        setOauthLaunchModes(prev => ({ ...prev, [provider]: null }));
        const fullStatus = await fetch("/api/integrations/status");
        const fullData = await fullStatus.json();
        updateBootstrapData((current) => ({ ...current, toolStatus: fullData }));
        return;
      }

      setOauthLaunchModes(prev => ({ ...prev, [provider]: data.launchMode === "terminal" ? "terminal" : "browser" }));
      setOauthStates(prev => ({ ...prev, [provider]: "polling" }));

      // Poll for auth completion with a 60s timeout
      if (authPollRef.current) clearInterval(authPollRef.current);
      let pollCount = 0;
      authPollRef.current = setInterval(async () => {
        pollCount++;
        if (pollCount > 20) { // ~60s at 3s intervals
          if (authPollRef.current) clearInterval(authPollRef.current);
          authPollRef.current = null;
          setAuthLaunchError(messages.onboarding.aiProvider.waitingForAuth);
          setOauthStates(prev => ({ ...prev, [provider]: "idle" }));
          setOauthLaunchModes(prev => ({ ...prev, [provider]: null }));
          return;
        }
        try {
          const statusRes = await fetch("/api/integrations/auth", { cache: "no-store" });
          const statusData = await statusRes.json();
          if (hasConfirmedOAuthSubscription(statusData.providers as Record<string, AiAuthSummary> | undefined, provider)) {
            if (authPollRef.current) clearInterval(authPollRef.current);
            authPollRef.current = null;
            setAuthLaunchError(null);
            setHasAnyBackendAuth(true);
            setOauthStates(prev => ({ ...prev, [provider]: "done" }));
            setOauthLaunchModes(prev => ({ ...prev, [provider]: null }));
            // Auto-set as default (onboarding is first setup)
            try {
              await fetch("/api/integrations/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "set-default", model: provider }),
              });
            } catch { /* ignore */ }
            const fullStatus = await fetch("/api/integrations/status");
            const fullData = await fullStatus.json();
            updateBootstrapData((current) => ({ ...current, toolStatus: fullData }));
          }
        } catch { /* ignore */ }
      }, 3000);
    } catch {
      setAuthLaunchError("Could not start the sign-in flow.");
      setOauthStates(prev => ({ ...prev, [provider]: "idle" }));
      setOauthLaunchModes(prev => ({ ...prev, [provider]: null }));
    }
  }, [messages.onboarding.aiProvider.waitingForAuth, updateBootstrapData]);

  // ── API key save handler ──
  const saveApiKey = useCallback(async (provider: string, key: string) => {
    try {
      const res = await fetch("/api/integrations/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apikey", provider, key }),
      });
      const data = await res.json();
      if (data.ok) {
        setApiKeySaved(prev => ({ ...prev, [provider]: true }));
        setHasAnyBackendAuth(true);
        // Auto-set as default (onboarding is first setup)
        try {
          await fetch("/api/integrations/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "set-default", model: provider }),
          });
        } catch { /* ignore */ }
        const fullStatus = await fetch("/api/integrations/status");
        const fullData = await fullStatus.json();
        updateBootstrapData((current) => ({ ...current, toolStatus: fullData }));
      }
    } catch { /* ignore */ }
  }, [updateBootstrapData]);

  // ── Remove auth handler ──
  const removeAuth = useCallback(async (provider: string) => {
    try {
      const res = await fetch("/api/integrations/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", provider }),
      });
      const data = await res.json();
      if (data.ok) {
        setApiKeySaved(prev => ({ ...prev, [provider]: false }));
        setApiKeyValues(prev => ({ ...prev, [provider]: "" }));
        setOauthStates(prev => ({ ...prev, [provider]: "idle" }));
        setOauthLaunchModes(prev => ({ ...prev, [provider]: null }));
        setHasAnyBackendAuth(false);
        const fullStatus = await fetch("/api/integrations/status");
        const fullData = await fullStatus.json();
        updateBootstrapData((current) => ({ ...current, toolStatus: fullData }));
      }
    } catch { /* ignore */ }
  }, [updateBootstrapData]);

  // ── Enable calendar/email ──
  const enableIntegration = useCallback(async (integration: "calendar" | "email") => {
    const setEnabled = integration === "calendar" ? setCalendarEnabled : setEmailEnabled;
    try {
      const res = await fetch("/api/integrations/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integration, enabled: true }),
      });
      const data = await res.json();
      if (data.ok) setEnabled(true);
    } catch { /* ignore */ }
  }, []);

  // ── Connect WhatsApp (QR flow, auto-installs wacli if needed) ──
  const connectWhatsApp = useCallback(async () => {
    setWhatsappConnecting(true);
    setWhatsappQr("");
    try {
      // Auto-install wacli if not present
      const ts = bootstrapData?.toolStatus ?? defaultToolStatus();
      if (!ts.whatsapp.installed && !ts.whatsapp.wacliAvailable) {
        await installPackage("wacli");
      }
      const res = await fetch("/api/integrations/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      const data = await res.json();

      if (data.state === "connected") {
        updateBootstrapData((current) => ({
          ...current,
          toolStatus: {
            ...current.toolStatus,
            whatsapp: { ...current.toolStatus.whatsapp, authenticated: true, dbExists: true },
          },
        }));
        setWhatsappConnecting(false);
        return;
      }

      if (data.qrText) setWhatsappQr(data.qrText);

      if (whatsappPollRef.current) clearInterval(whatsappPollRef.current);
      whatsappPollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch("/api/integrations/status");
          const status = await statusRes.json();
          if (status.whatsapp?.authenticated) {
            if (whatsappPollRef.current) clearInterval(whatsappPollRef.current);
            whatsappPollRef.current = null;
            updateBootstrapData((current) => ({ ...current, toolStatus: status }));
            setWhatsappConnecting(false);
            setWhatsappQr("");
          } else if (status.whatsapp?.qrText && status.whatsapp.qrText !== whatsappQr) {
            setWhatsappQr(status.whatsapp.qrText);
          }
        } catch { /* ignore */ }
      }, 3000);
    } catch {
      setWhatsappConnecting(false);
    }
  }, [bootstrapData, installPackage, updateBootstrapData, whatsappQr]);

  const toggleArea = useCallback((area: ConcernCategory) => {
    setSelectedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(area)) {
        next.delete(area);
        const cat = CONCERN_CATEGORIES.find((c) => c.id === area);
        if (cat) {
          setSelectedConcerns((prevConcerns) => {
            const nextConcerns = new Set(prevConcerns);
            for (const item of cat.items) nextConcerns.delete(item);
            return nextConcerns;
          });
        }
      } else {
        next.add(area);
      }
      return next;
    });
  }, []);

  const toggleConcern = useCallback((key: ConcernKey) => {
    setSelectedConcerns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const setAllConcerns = useCallback((area: ConcernCategory, select: boolean) => {
    const cat = CONCERN_CATEGORIES.find((c) => c.id === area);
    if (!cat) return;
    setSelectedConcerns((prev) => {
      const next = new Set(prev);
      for (const item of cat.items) {
        if (select) next.add(item);
        else next.delete(item);
      }
      return next;
    });
  }, []);

  const handleFinish = useCallback(async () => {
    if (!bootstrapData) return;
    setSaving(true);

    try {
      const topicLabels = Array.from(selectedConcerns).map(
        (key) => messages.onboarding.concerns.items[key]
      );

      // Fetch fresh config from disk so we don't overwrite integration
      // settings (email, calendar, whatsapp) saved during onboarding steps.
      let currentConfig = bootstrapData.config;
      try {
        const cfgRes = await fetch("/api/config");
        if (cfgRes.ok) currentConfig = await cfgRes.json();
      } catch { /* fallback to bootstrapData.config */ }

      const updatedConfig = {
        ...currentConfig,
        locale,
        displayName: name.trim(),
        profileNameKey: name.trim().toLowerCase(),
        chat: {
          ...currentConfig.chat,
          suggestedTopics: topicLabels.length > 0 ? topicLabels : currentConfig.chat.suggestedTopics,
        },
        tts: {
          ...currentConfig.tts,
          provider: currentConfig.tts?.provider || "local",
          enabled: ttsEnabled,
        },
        ...(transcriptionEnabled ? {
          transcription: currentConfig.transcription || { provider: "local" as const },
        } : {}),
      };

      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedConfig),
      });

      await fetch("/api/config/local", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingCompleted: true, openClawEnabled: true, disclaimerAcceptedAt: new Date().toISOString() }),
      });

      // Seed hot topics from onboarding concerns (fire and forget)
      if (topicLabels.length > 0) {
        fetch("/api/hot-topics/seed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topics: topicLabels }),
        }).catch(() => { /* non-critical */ });
      }

      // Refresh tool status so the chat UI sees openClaw as ready
      let freshToolStatus = bootstrapData.toolStatus;
      try {
        const statusRes = await fetch("/api/integrations/status");
        if (statusRes.ok) freshToolStatus = await statusRes.json();
      } catch { /* use stale status as fallback */ }

      updateBootstrapData((current) => ({
        ...current,
        config: updatedConfig,
        localSettings: { ...current.localSettings, onboardingCompleted: true, openClawEnabled: true },
        toolStatus: freshToolStatus,
      }));

      onComplete();
    } catch {
      setSaving(false);
    }
  }, [bootstrapData, locale, messages, name, onComplete, selectedConcerns, ttsEnabled, transcriptionEnabled, updateBootstrapData]);

  const m = messages.onboarding;
  const toolStatus = bootstrapData?.toolStatus ?? defaultToolStatus();

  // Derived states
  const engineReady = isOpenClawEngineConfigured(toolStatus.openClaw) || openClawSetupState === "done";
  const openClawInstalled = toolStatus.openClaw.installed || toolStatus.openClaw.cliAvailable;
  const anyAuthConnected = hasAnyBackendAuth || Object.values(oauthStates).some(s => s === "done") || Object.values(apiKeySaved).some(Boolean);
  const wacliInstalled = toolStatus.whatsapp.installed || !!toolStatus.whatsapp.wacliAvailable;
  const whatsappAuthenticated = !!toolStatus.whatsapp.authenticated;
  const calendarAvailable = toolStatus.calendar.available;
  const emailAvailable = toolStatus.email.available;
  const calendarIsEnabled = calendarEnabled || !!toolStatus.calendar.enabled;
  const emailIsEnabled = emailEnabled || !!toolStatus.email.enabled;


  return (
    <div
      data-testid="onboarding-flow"
      data-step={step}
      className="relative flex flex-col items-center justify-center max-w-md mx-auto w-full"
      style={{ minHeight: "calc(100vh - 120px)" }}
    >

      {/* Step 0: Welcome */}
      <StepContainer visible={step === 0}>
        <div className="text-center">
          <h2
            className="text-3xl font-light text-foreground mb-4"          >
            {m.welcome.title}
          </h2>
          <p className="text-[15px] text-muted-foreground max-w-xs mx-auto leading-relaxed">
            {m.welcome.subtitle}
          </p>
          <NavButtons
            messages={messages}
            onNext={() => setStep(1)}
            nextLabel={m.next}
          />
        </div>
      </StepContainer>

      {/* Step 1: Language */}
      <StepContainer visible={step === 1}>
        <div className="text-center w-full">
          <h2
            className="text-3xl font-light text-foreground mb-2"          >
            {m.language.title}
          </h2>
          <p className="text-[15px] text-muted-foreground mb-8">
            {m.language.subtitle}
          </p>

          <div className="grid grid-cols-2 gap-2.5 max-w-xs mx-auto">
            {locales.map((code) => {
              const isSelected = code === locale;
              return (
                <button
                  key={code}
                  onClick={() => { void applyLocale(code); }}
                  className={`px-4 py-3 rounded-xl text-sm transition-colors duration-200 ${
                    isSelected
                      ? "bg-foreground text-background"
                      : "bg-card/50 border border-border/70 text-strong-foreground hover:border-muted-foreground hover:bg-card/70"
                  }`}
                >
                  {localeMetadata[code].nativeLabel}
                </button>
              );
            })}
          </div>

          <NavButtons
            messages={messages}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
            nextLabel={m.next}
          />
        </div>
      </StepContainer>

      {/* Step 2: Disclaimer – info */}
      <StepContainer visible={step === 2 && disclaimerPhase === "info"}>
        <div className="text-center w-full max-w-lg mx-auto">
          <h2
            className="text-3xl font-light text-foreground mb-2"          >
            {m.disclaimer.title}
          </h2>
          <p className="text-[15px] text-muted-foreground mb-6 max-w-sm mx-auto">
            {m.disclaimer.subtitle}
          </p>

          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-left">
            {([
              { icon: <Brain className="w-[17px] h-[17px]" />, title: m.disclaimer.assistantNoticeTitle, hint: m.disclaimer.assistantNoticeHint },
              { icon: <Bug className="w-[17px] h-[17px]" />, title: m.disclaimer.betaTitle, hint: m.disclaimer.betaHint },
              { icon: <Database className="w-[17px] h-[17px]" />, title: m.disclaimer.dataPrivacyTitle, hint: m.disclaimer.dataPrivacyHint },
              { icon: <Users className="w-[17px] h-[17px]" />, title: m.disclaimer.thirdPartyDataTitle, hint: m.disclaimer.thirdPartyDataHint },
              { icon: <Code2 className="w-[17px] h-[17px]" />, title: m.disclaimer.openSourceTitle, hint: m.disclaimer.openSourceHint },
            ] as const).map((item, i, arr) => (
              <div
                key={i}
                className={`flex items-center gap-3.5 px-4 py-3.5${i < arr.length - 1 ? " border-b border-muted" : ""}`}
              >
                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center bg-muted text-strong-foreground shrink-0">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium text-foreground">{item.title}</span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{item.hint}</p>
                </div>
              </div>
            ))}
          </div>

          <NavButtons
            messages={messages}
            onBack={() => setStep(1)}
            onNext={() => setDisclaimerPhase("accept")}
            nextLabel={m.next}
          />
        </div>
      </StepContainer>

      {/* Step 2: Disclaimer – accept */}
      <StepContainer visible={step === 2 && disclaimerPhase === "accept"}>
        <div className="text-center w-full max-w-lg mx-auto">
          <h2
            className="text-3xl font-light text-foreground mb-2"          >
            {m.disclaimer.acceptPageTitle}
          </h2>
          <p className="text-[15px] text-muted-foreground mb-6 max-w-sm mx-auto">
            {m.disclaimer.acceptPageSubtitle}
          </p>

          <div className="flex flex-col gap-2.5">
            {([
              {
                title: m.disclaimer.acceptTitle,
                hint: m.disclaimer.acceptHint,
                checked: disclaimerAccepted,
                onChange: setDisclaimerAccepted,
              },
              {
                title: m.disclaimer.dataConsentTitle,
                hint: m.disclaimer.dataConsentHint,
                checked: dataConsentAccepted,
                onChange: setDataConsentAccepted,
              },
              {
                title: m.disclaimer.openClawTitle,
                hint: m.disclaimer.openClawHint,
                checked: openClawAccepted,
                onChange: setOpenClawAccepted,
              },
            ] as const).map((item, i) => (
              <label
                key={i}
                className={`flex items-start gap-3 px-3.5 py-3 rounded-xl border cursor-pointer select-none text-left transition-all duration-150 ${
                  item.checked
                    ? "border-foreground/20 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    : "border-border bg-card/60 hover:bg-card/80"
                }`}
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => item.onChange(e.target.checked)}
                  className="sr-only"
                />
                <div className={`mt-[7px] w-[15px] h-[15px] rounded-[4px] border-[1.5px] flex items-center justify-center shrink-0 transition-all duration-150 ${
                  item.checked
                    ? "bg-foreground border-foreground"
                    : "bg-card border-muted-foreground"
                }`}>
                  {item.checked && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium text-foreground leading-tight">{item.title}</span>
                  <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{item.hint}</p>
                </div>
              </label>
            ))}
          </div>

          <NavButtons
            messages={messages}
            onBack={() => setDisclaimerPhase("info")}
            onNext={() => setStep(3)}
            nextLabel={m.next}
            nextDisabled={!disclaimerAccepted || !dataConsentAccepted || !openClawAccepted}
          />
        </div>
      </StepContainer>

      {/* Step 3: Name */}
      <StepContainer visible={step === 3}>
        <div className="text-center w-full">
          <h2
            className="text-3xl font-light text-foreground mb-2"          >
            {m.name.title}
          </h2>
          <p className="text-[15px] text-muted-foreground mb-8">
            {m.name.subtitle}
          </p>

          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={m.name.placeholder}
            autoCapitalize="words"
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) setStep(4); }}
            className="w-full max-w-xs mx-auto block bg-card/60 border border-border/80 rounded-xl px-4 py-3 text-center text-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-muted-foreground/20 focus:border-muted-foreground transition-all"
          />

          <NavButtons
            messages={messages}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
            nextLabel={m.next}
            nextDisabled={!name.trim()}
          />
        </div>
      </StepContainer>

      {/* Step 4: OpenClaw engine */}
      <StepContainer visible={step === 4}>
        <div className="text-center w-full">
          <h2
            className="text-3xl font-light text-foreground mb-2"          >
            {m.engine.title}
          </h2>
          <p className="text-[15px] text-muted-foreground mb-8 max-w-sm mx-auto">
            {m.engine.subtitle}
          </p>

          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-left">
            <div className="flex items-center gap-3.5 px-4 py-3.5">
              <div className="relative flex-shrink-0">
                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center bg-muted text-strong-foreground">
                  <svg width="17" height="17" viewBox="0 0 120 120" fill="currentColor">
                    <path d="M60 10C30 10 15 35 15 55C15 75 30 95 45 100L45 110L55 110L55 100C55 100 60 102 65 100L65 110L75 110L75 100C90 95 105 75 105 55C105 35 90 10 60 10Z"/>
                    <path d="M20 45C5 40 0 50 5 60C10 70 20 65 25 55C28 48 25 45 20 45Z"/>
                    <path d="M100 45C115 40 120 50 115 60C110 70 100 65 95 55C92 48 95 45 100 45Z"/>
                    <path d="M45 15Q35 5 30 8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
                    <path d="M75 15Q85 5 90 8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
                    <circle cx="45" cy="35" r="6" className="fill-muted"/>
                    <circle cx="75" cy="35" r="6" className="fill-muted"/>
                  </svg>
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${
                  engineReady ? "bg-emerald-400" : (openClawInstalling || openClawSetupState === "running") ? "bg-sky-500" : "bg-border-hover"
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-medium text-foreground">{m.engine.openClaw}</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">{m.engine.openClawHint}</p>
              </div>
              {(openClawInstalling || openClawSetupState === "running") ? (
                <svg className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              ) : engineReady ? (
                <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              ) : openClawError ? (
                <ErrorBadge
                  label={openClawSetupState === "failed" ? m.engine.openClawSetupFailed : m.engine.installFailed}
                  detail={openClawError}
                  onRetry={() => {
                    setOpenClawError(null);
                    setOpenClawSetupState("idle");
                    setupTriggeredRef.current = false;
                    if (openClawInstalled) setupOpenClaw(); else installPackage("openclaw");
                  }}
                />
              ) : !openClawInstalled ? (
                <CardAction
                  label={m.engine.install}
                  onClick={() => installPackage("openclaw")}
                  variant="primary"
                />
              ) : (
                <CardAction
                  label={m.engine.configure}
                  onClick={() => setupOpenClaw()}
                  variant="primary"
                />
              )}
            </div>

            {/* Animated progress section */}
            <div
              className="overflow-hidden transition-all duration-300 ease-in-out"
              style={{
                maxHeight: (openClawInstalling || openClawSetupState === "running") ? 120 : 0,
                opacity: (openClawInstalling || openClawSetupState === "running") ? 1 : 0,
              }}
            >
              <div className="mx-3 mb-3 rounded-xl bg-muted px-4 py-3 flex items-center gap-3">
                <p className="text-[12px] text-strong-foreground flex-1">
                  {openClawPhase === "downloading" ? m.engine.phaseDownloading
                    : openClawPhase === "verifying" ? m.engine.phaseVerifying
                    : m.engine.phaseConfiguringWorkspace}
                </p>
              </div>
            </div>
          </div>

          <NavButtons
            messages={messages}
            onBack={() => setStep(3)}
            onNext={() => setStep(5)}
            nextLabel={engineReady ? m.next : m.skip ?? "Skip"}
          />
        </div>
      </StepContainer>

      {/* Step 5: AI Provider auth */}
      <StepContainer visible={step === 5}>
        <div className="text-center w-full">
          <h2
            className="text-3xl font-light text-foreground mb-2"          >
            {m.aiProvider.title}
          </h2>
          <p className="text-[15px] text-muted-foreground mb-8 max-w-sm mx-auto">
            {m.aiProvider.subtitle}
          </p>

          {(() => {
            const providerIcons: Record<string, React.ReactNode> = {
              anthropic: <svg width="17" height="17" viewBox="0 0 248 248" fill="currentColor"><path d="M52.43 162.87l46.35-25.99.77-2.28-.77-1.27h-2.29l-7.77-.47-26.49-.71-22.92-.95-22.29-1.18-5.6-1.18L6.2 121.87l.51-3.43 4.71-3.19 6.75.59 14.9 1.06 22.41 1.54 16.18.94 24.07 2.48h3.82l.51-1.54-1.27-.94-1.02-.95-23.18-15.72-25.09-16.54-13.12-9.57-7-4.84-3.57-4.49-1.53-9.93 6.37-6.99 8.66.59 2.16.59 8.79 6.74 18.72 14.53 24.45 17.96 3.57 2.95 1.44-.97.22-.68-1.66-2.72-13.24-23.99-14.14-24.46-6.37-10.16-1.65-6.03c-.65-2.53-1.02-4.62-1.02-7.2l7.26-9.93 4.07-1.3 9.81 1.3 4.07 3.54 6.12 13.94 9.81 21.86 15.28 29.77 4.46 8.86 2.42 8.15.89 2.48h1.53v-1.42l1.27-16.78 2.3-20.56 2.29-26.47.76-7.44 3.7-8.98 7.38-4.84 5.73 2.72 4.71 6.73-.64 4.37-2.8 18.2-5.48 28.47-3.57 19.14h2.04l2.42-2.48 9.68-12.76 16.17-20.32 7.14-8.04 8.4-8.86 5.35-3.25h10.19l7.39 11.11-3.31 11.46-10.44 13.23-8.66 11.22-12.42 16.64-7.69 13.38.69 1.1 1.86-.16 27.98-6.03 15.16-2.72 18.08-3.07 8.15 3.78.89 3.9-3.18 7.92-19.36 4.73-22.67 4.6-33.76 7.95-.37.3.44.65 15.22 1.38 6.5.35h15.92l29.67 2.25 7.77 5.08 4.58 6.26-.76 4.84-11.97 6.03-16.05-3.78-37.57-8.98-12.86-3.19h-1.78v1.06l10.7 10.52 19.74 17.72 24.58 22.92 1.27 5.67-3.18 4.49-3.31-.47-21.65-16.31-8.4-7.32-18.85-15.95h-1.27v1.65l4.33 6.38 23.05 34.62 1.15 10.63-1.66 3.43-5.98 2.13-6.5-1.18-13.62-19.02-13.88-21.27-11.21-19.14-1.35.85-6.67 71.22-3.06 3.66-7.13 2.72-5.98-4.49-3.18-7.33 3.18-14.53 3.82-18.9 3.06-15.01 2.8-18.67 1.71-6.24.15-.42-1.37.23-14.07 19.3-21.4 28.95-16.93 17.96-4.08 1.65-7-3.66-.64-6.5 3.95-5.79 23.43-29.77 14.14-18.55 9.11-10.65-.09-1.54-.5-.04-62.26 40.59-11.08 1.42-4.84-4.49.64-6.5 2.29-2.36 18.72-15.24Z" /></svg>,
              "openai-codex": <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M22.28 9.37a6.2 6.2 0 0 0-.54-5.1 6.29 6.29 0 0 0-6.78-3.02A6.23 6.23 0 0 0 10.28 0a6.29 6.29 0 0 0-6 4.35 6.22 6.22 0 0 0-4.15 3.02 6.29 6.29 0 0 0 .78 7.37 6.2 6.2 0 0 0 .54 5.1 6.29 6.29 0 0 0 6.78 3.02A6.23 6.23 0 0 0 13.72 24a6.29 6.29 0 0 0 6-4.35 6.22 6.22 0 0 0 4.15-3.02 6.29 6.29 0 0 0-.78-7.37ZM13.72 22.43a4.65 4.65 0 0 1-2.99-1.09l.17-.09 4.96-2.87a.81.81 0 0 0 .41-.7v-7l2.1 1.21a.07.07 0 0 1 .04.06v5.81a4.68 4.68 0 0 1-4.69 4.67ZM3.53 18.29a4.65 4.65 0 0 1-.56-3.13l.17.1 4.96 2.87a.81.81 0 0 0 .81 0l6.06-3.5v2.42a.08.08 0 0 1-.03.06l-5.02 2.9a4.68 4.68 0 0 1-6.39-1.72ZM2.27 7.89A4.65 4.65 0 0 1 4.7 5.84v5.9a.81.81 0 0 0 .41.7l6.06 3.5-2.1 1.21a.08.08 0 0 1-.07 0L3.99 14.3a4.68 4.68 0 0 1-1.72-6.4Zm17.17 4L13.38 8.4l2.1-1.21a.08.08 0 0 1 .07 0l5.01 2.9a4.68 4.68 0 0 1-.72 8.45v-5.96a.81.81 0 0 0-.4-.7Zm2.09-3.15-.17-.1-4.96-2.87a.81.81 0 0 0-.81 0l-6.06 3.5V6.85a.08.08 0 0 1 .03-.06l5.02-2.9a4.68 4.68 0 0 1 6.95 4.85ZM8.68 13.5l-2.1-1.21a.07.07 0 0 1-.04-.06V6.42a4.68 4.68 0 0 1 7.68-3.58l-.17.09-4.96 2.87a.81.81 0 0 0-.41.7v7Zm1.14-2.46L12 9.64l2.18 1.26v2.52L12 14.68l-2.18-1.26v-2.52Z" /></svg>,
              openai: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M22.28 9.37a6.2 6.2 0 0 0-.54-5.1 6.29 6.29 0 0 0-6.78-3.02A6.23 6.23 0 0 0 10.28 0a6.29 6.29 0 0 0-6 4.35 6.22 6.22 0 0 0-4.15 3.02 6.29 6.29 0 0 0 .78 7.37 6.2 6.2 0 0 0 .54 5.1 6.29 6.29 0 0 0 6.78 3.02A6.23 6.23 0 0 0 13.72 24a6.29 6.29 0 0 0 6-4.35 6.22 6.22 0 0 0 4.15-3.02 6.29 6.29 0 0 0-.78-7.37ZM13.72 22.43a4.65 4.65 0 0 1-2.99-1.09l.17-.09 4.96-2.87a.81.81 0 0 0 .41-.7v-7l2.1 1.21a.07.07 0 0 1 .04.06v5.81a4.68 4.68 0 0 1-4.69 4.67ZM3.53 18.29a4.65 4.65 0 0 1-.56-3.13l.17.1 4.96 2.87a.81.81 0 0 0 .81 0l6.06-3.5v2.42a.08.08 0 0 1-.03.06l-5.02 2.9a4.68 4.68 0 0 1-6.39-1.72ZM2.27 7.89A4.65 4.65 0 0 1 4.7 5.84v5.9a.81.81 0 0 0 .41.7l6.06 3.5-2.1 1.21a.08.08 0 0 1-.07 0L3.99 14.3a4.68 4.68 0 0 1-1.72-6.4Zm17.17 4L13.38 8.4l2.1-1.21a.08.08 0 0 1 .07 0l5.01 2.9a4.68 4.68 0 0 1-.72 8.45v-5.96a.81.81 0 0 0-.4-.7Zm2.09-3.15-.17-.1-4.96-2.87a.81.81 0 0 0-.81 0l-6.06 3.5V6.85a.08.08 0 0 1 .03-.06l5.02-2.9a4.68 4.68 0 0 1 6.95 4.85ZM8.68 13.5l-2.1-1.21a.07.07 0 0 1-.04-.06V6.42a4.68 4.68 0 0 1 7.68-3.58l-.17.09-4.96 2.87a.81.81 0 0 0-.41.7v7Zm1.14-2.46L12 9.64l2.18 1.26v2.52L12 14.68l-2.18-1.26v-2.52Z" /></svg>,
              google: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" /></svg>,
              deepseek: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z" /></svg>,
              mistral: <svg width="17" height="17" viewBox="0 0 24 24"><path d="M3.428 3.4h3.429v3.428H3.428V3.4zm13.714 0h3.43v3.428h-3.43V3.4z" fill="currentColor"/><path d="M3.428 6.828h6.857v3.429H3.429V6.828zm10.286 0h6.857v3.429h-6.857V6.828z" fill="currentColor" opacity=".6"/><path d="M3.428 10.258h17.144v3.428H3.428v-3.428z" fill="currentColor"/><path d="M3.428 13.686h3.429v3.428H3.428v-3.428zm6.858 0h3.429v3.428h-3.429v-3.428zm6.856 0h3.43v3.428h-3.43v-3.428z" fill="currentColor" opacity=".6"/><path d="M0 17.114h10.286v3.429H0v-3.429zm13.714 0H24v3.429H13.714v-3.429z" fill="currentColor"/></svg>,
              xai: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd"><path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815" /></svg>,
              groq: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd"><path d="M12.036 2c-3.853-.035-7 3-7.036 6.781-.035 3.782 3.055 6.872 6.908 6.907h2.42v-2.566h-2.292c-2.407.028-4.38-1.866-4.408-4.23-.029-2.362 1.901-4.298 4.308-4.326h.1c2.407 0 4.358 1.915 4.365 4.278v6.305c0 2.342-1.944 4.25-4.323 4.279a4.375 4.375 0 01-3.033-1.252l-1.851 1.818A7 7 0 0012.029 22h.092c3.803-.056 6.858-3.083 6.879-6.816v-6.5C18.907 4.963 15.817 2 12.036 2z" /></svg>,
              openrouter: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd"><path d="M16.804 1.957l7.22 4.105v.087L16.73 10.21l.017-2.117-.821-.03c-1.059-.028-1.611.002-2.268.11-1.064.175-2.038.577-3.147 1.352L8.345 11.03c-.284.195-.495.336-.68.455l-.515.322-.397.234.385.23.53.338c.476.314 1.17.796 2.701 1.866 1.11.775 2.083 1.177 3.147 1.352l.3.045c.694.091 1.375.094 2.825.033l.022-2.159 7.22 4.105v.087L16.589 22l.014-1.862-.635.022c-1.386.042-2.137.002-3.138-.162-1.694-.28-3.26-.926-4.881-2.059l-2.158-1.5a21.997 21.997 0 00-.755-.498l-.467-.28a55.927 55.927 0 00-.76-.43C2.908 14.73.563 14.116 0 14.116V9.888l.14.004c.564-.007 2.91-.622 3.809-1.124l1.016-.58.438-.274c.428-.28 1.072-.726 2.686-1.853 1.621-1.133 3.186-1.78 4.881-2.059 1.152-.19 1.974-.213 3.814-.138l.02-1.907z" /></svg>,
            };

            const subscriptionProviders: Array<{ id: string; oauthId: string; label: string; hint: string }> = [
              { id: "openai-codex", oauthId: "openai-codex", label: m.aiProvider.chatgptSub, hint: m.aiProvider.chatgptSubHint },
            ];

            const apiKeyProviders: Array<{ id: string; label: string }> = [
              { id: "anthropic", label: m.aiProvider.anthropicKey },
              { id: "openai", label: m.aiProvider.openaiKey },
              { id: "google", label: m.aiProvider.googleKey },
              { id: "deepseek", label: m.aiProvider.deepseekKey },
              { id: "mistral", label: m.aiProvider.mistralKey },
              { id: "xai", label: m.aiProvider.xaiKey },
              { id: "groq", label: m.aiProvider.groqKey },
              { id: "openrouter", label: m.aiProvider.openrouterKey },
            ];

            const apiKeyPatterns: Record<string, { test: (k: string) => boolean; placeholder: string }> = {
              anthropic: { test: (k) => k.startsWith("sk-ant-"), placeholder: "sk-ant-api03-..." },
              openai: { test: (k) => k.startsWith("sk-proj-") || (k.startsWith("sk-") && k.length >= 40), placeholder: "sk-proj-..." },
              google: { test: (k) => k.startsWith("AIzaSy") && k.length >= 35, placeholder: "AIzaSy..." },
              deepseek: { test: (k) => k.startsWith("sk-") && k.length >= 30, placeholder: "sk-..." },
              mistral: { test: (k) => k.length >= 20, placeholder: "..." },
              xai: { test: (k) => k.startsWith("xai-"), placeholder: "xai-..." },
              groq: { test: (k) => k.startsWith("gsk_"), placeholder: "gsk_..." },
              openrouter: { test: (k) => k.startsWith("sk-or-"), placeholder: "sk-or-v1-..." },
            };

            const activeOauthActivity =
              Object.entries(oauthStates).find(([, s]) => s === "launching")
              ?? Object.entries(oauthStates).find(([, s]) => s === "polling");
            const isAnyPolling = !!activeOauthActivity;
            const activeOauthProvider = activeOauthActivity?.[0] ?? null;
            const activeOauthState = activeOauthActivity?.[1] ?? null;
            const activeOauthLaunchMode = activeOauthProvider ? (oauthLaunchModes[activeOauthProvider] ?? null) : null;
            const oauthProgressMessage = activeOauthState === "launching"
              ? m.aiProvider.checkingForExistingAuth
              : activeOauthLaunchMode === "terminal"
                ? m.aiProvider.completeSignInInTerminal
                : m.aiProvider.completeSignInInBrowser;

            const modalProvider = apiKeyModalProvider
              ? apiKeyProviders.find((p) => p.id === apiKeyModalProvider)
              : null;

            return (
              <div className="space-y-5 text-left">

                {/* ── Subscription section ── */}
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{m.aiProvider.oauthSection}</h3>
                  <p className="text-xs text-muted-foreground mb-3">{m.aiProvider.oauthHint}</p>
                  <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    {subscriptionProviders.map(({ id, oauthId, label, hint }, i) => {
                      const authState = oauthStates[oauthId] ?? "idle";
                      const isConnected = authState === "done";
                      const isLoading = authState === "polling" || authState === "launching";
                      return (
                        <div
                          key={id}
                          className={`flex items-center gap-3.5 px-4 py-3.5 transition-colors ${
                            isAnyPolling ? "" : (i < subscriptionProviders.length - 1 ? "border-b border-muted" : "")
                          }`}
                        >
                          <div className="relative flex-shrink-0">
                            <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center ${
                              !isConnected ? "bg-border text-muted-foreground" : "bg-muted text-strong-foreground"
                            }`}>
                              {providerIcons[id] ?? providerIcons.openai}
                            </div>
                            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${
                              isConnected ? "bg-emerald-400" : isLoading ? "bg-sky-500" : "bg-border-hover"
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className={`text-[13px] font-medium ${isConnected ? "text-foreground" : "text-strong-foreground"}`}>{label}</span>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
                          </div>
                          {isConnected && (
                            <StatusBadge
                              label={m.aiProvider.connected}
                              variant="success"
                              testId={`onboarding-oauth-status-${oauthId}`}
                            />
                          )}
                          {isLoading && (
                            <svg className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                            </svg>
                          )}
                          <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                            <Toggle
                              enabled={isConnected}
                              disabled={isLoading}
                              testId={`onboarding-oauth-toggle-${oauthId}`}
                              onChange={(v) => {
                                if (v) {
                                  launchOAuth(oauthId);
                                } else {
                                  removeAuth(oauthId);
                                  setOauthStates(prev => ({ ...prev, [oauthId]: "idle" }));
                                }
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}

                    {/* ── Polling hint (inside the card, animated) ── */}
                    <div
                      className="overflow-hidden transition-all duration-300 ease-in-out"
                      style={{
                        maxHeight: isAnyPolling ? 120 : 0,
                        opacity: isAnyPolling ? 1 : 0,
                      }}
                    >
                      <div className="mx-3 mb-3 rounded-xl bg-muted px-4 py-3 flex items-center gap-3">
                        <p className="text-[12px] text-strong-foreground flex-1">{oauthProgressMessage}</p>
                        <button
                          type="button"
                          onClick={() => {
                            if (authPollRef.current) { clearInterval(authPollRef.current); authPollRef.current = null; }
                            const pollingProvider =
                              Object.entries(oauthStates).find(([, s]) => s === "launching")?.[0]
                              ?? Object.entries(oauthStates).find(([, s]) => s === "polling")?.[0];
                            if (pollingProvider) {
                              setOauthStates(prev => ({ ...prev, [pollingProvider]: "idle" }));
                              setOauthLaunchModes(prev => ({ ...prev, [pollingProvider]: null }));
                            }
                          }}
                          className="flex-shrink-0 px-3 py-1 rounded-lg text-[11px] font-medium text-strong-foreground bg-card border border-border hover:bg-background transition-colors"
                        >
                          {m.aiProvider.retryAuth}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── API key section ── */}
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{m.aiProvider.apiKeySection}</h3>
                  <p className="text-xs text-muted-foreground mb-3">{m.aiProvider.apiKeyHint}</p>
                  <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    {apiKeyProviders.map(({ id, label }, i) => {
                      const saved = apiKeySaved[id] ?? false;
                      return (
                        <div
                          key={id}
                          className={`flex items-center gap-3.5 px-4 py-3.5 transition-colors ${
                            i < apiKeyProviders.length - 1 ? "border-b border-muted" : ""
                          } ${saved ? "cursor-pointer hover:bg-background" : ""}`}
                          onClick={saved ? () => setApiKeyModalProvider(id) : undefined}
                        >
                          <div className="relative flex-shrink-0">
                            <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center ${
                              !saved ? "bg-border text-muted-foreground" : "bg-muted text-strong-foreground"
                            }`}>
                              {providerIcons[id] ?? providerIcons.openai}
                            </div>
                            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${
                              saved ? "bg-emerald-400" : "bg-border-hover"
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className={`text-[13px] font-medium ${saved ? "text-foreground" : "text-strong-foreground"}`}>{label}</span>
                          </div>
                          <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                            <Toggle
                              enabled={saved}
                              onChange={(v) => {
                                if (v) {
                                  setApiKeyModalProvider(id);
                                } else {
                                  removeAuth(id);
                                }
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Needs auth hint */}
                {!authCheckLoading && !anyAuthConnected && (
                  <p className="text-xs text-amber-600 text-center">
                    {m.aiProvider.needsAuth}
                  </p>
                )}
                {authLaunchError && (
                  <p className="text-xs text-amber-600 text-center" data-testid="onboarding-auth-launch-error">
                    {authLaunchError}
                  </p>
                )}

                {/* ── API key modal ── */}
                {apiKeyModalProvider && modalProvider && (() => {
                  const currentValue = (apiKeyValues[apiKeyModalProvider] ?? "").trim();
                  const pattern = apiKeyPatterns[apiKeyModalProvider];
                  const isValid = !currentValue || !pattern || pattern.test(currentValue);
                  const saved = apiKeySaved[apiKeyModalProvider] ?? false;
                  return (
                    <>
                    <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => setApiKeyModalProvider(null)} />
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setApiKeyModalProvider(null)}>
                      <div
                        className="mx-4 flex w-full max-w-[380px] flex-col rounded-xl border border-border bg-card shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
                        style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-3.5 px-7 pt-6 pb-0">
                          <div className="w-10 h-10 rounded-[10px] bg-card text-strong-foreground flex items-center justify-center">
                            {providerIcons[apiKeyModalProvider] ?? providerIcons.openai}
                          </div>
                          <h3 className="text-[16px] font-semibold text-foreground flex-1">{modalProvider.label}</h3>
                          <button
                            type="button"
                            onClick={() => setApiKeyModalProvider(null)}
                            className="w-[30px] h-[30px] rounded-lg bg-card text-tertiary-foreground flex items-center justify-center hover:bg-muted hover:text-strong-foreground transition-colors"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                        {saved && (
                          <div className="flex items-center gap-1.5 px-7 pt-3 text-[11px] text-emerald-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {m.aiProvider.keySaved}
                          </div>
                        )}
                        <div className="px-7 pt-4 pb-5 space-y-3">
                          <div>
                            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                              {m.aiProvider.apiKeySection}
                            </label>
                            <input
                              type="password"
                              value={apiKeyValues[apiKeyModalProvider] ?? ""}
                              onChange={(e) => {
                                const id = apiKeyModalProvider;
                                setApiKeyValues((prev) => ({ ...prev, [id]: e.target.value }));
                                setApiKeySaved((prev) => ({ ...prev, [id]: false }));
                              }}
                              placeholder={pattern?.placeholder ?? m.aiProvider.apiKeyPlaceholder}
                              className={`w-full bg-card border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 transition-colors ${
                                currentValue && !isValid
                                  ? "border-amber-300 focus:ring-amber-300 focus:border-amber-300"
                                  : "border-border focus:ring-tertiary-foreground focus:border-tertiary-foreground"
                              }`}
                            />
                          </div>
                          {currentValue && !isValid && (
                            <p className="text-[11px] text-amber-600">{m.aiProvider.invalidKeyFormat}</p>
                          )}
                        </div>
                        <div className="px-7 pb-6 pt-0 flex justify-end gap-2.5">
                          {saved && !currentValue && (
                            <button
                              type="button"
                              onClick={() => {
                                removeAuth(apiKeyModalProvider);
                                setApiKeyModalProvider(null);
                              }}
                              className="px-4 py-2 rounded-xl border border-red-200 dark:border-red-800 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                            >
                              {m.aiProvider.removeKey}
                            </button>
                          )}
                          {currentValue ? (
                            <button
                              type="button"
                              disabled={!isValid}
                              onClick={() => {
                                saveApiKey(apiKeyModalProvider, apiKeyValues[apiKeyModalProvider] ?? "");
                              }}
                              className="px-4 py-2 rounded-xl bg-foreground text-sm text-primary-foreground hover:bg-foreground-intense transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {m.aiProvider.saveKey}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setApiKeyModalProvider(null)}
                              className="px-4 py-2 rounded-xl bg-foreground text-sm text-primary-foreground hover:bg-foreground-intense transition-colors"
                            >
                              OK
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    </>
                  );
                })()}
              </div>
            );
          })()}

          <NavButtons
            messages={messages}
            onBack={() => setStep(4)}
            onNext={() => setStep(6)}
            nextLabel={anyAuthConnected ? m.next : m.skip ?? "Skip"}
          />
        </div>
      </StepContainer>

      {/* Step 6: Data integrations */}
      <StepContainer visible={step === 6}>
        <div className="text-center w-full">
          <h2
            className="text-3xl font-light text-foreground mb-2"          >
            {m.integrations.title}
          </h2>
          <p className="text-[15px] text-muted-foreground mb-8 max-w-sm mx-auto">
            {m.integrations.subtitle}
          </p>

          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-left">

            {/* ── WhatsApp ── */}
            <div className="border-b border-muted">
              <div className="flex items-center gap-3.5 px-4 py-3.5 transition-colors">
                <div className="relative flex-shrink-0">
                  <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center ${
                    !whatsappAuthenticated ? "bg-border text-muted-foreground" : "bg-muted text-strong-foreground"
                  }`}>
                    <MessageCircle className="w-[17px] h-[17px]" />
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${
                    whatsappAuthenticated ? "bg-emerald-400" : (whatsappConnecting || wacliInstalling) ? "bg-sky-500" : "bg-border-hover"
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`text-[13px] font-medium ${whatsappAuthenticated ? "text-foreground" : "text-strong-foreground"}`}>{m.integrations.whatsapp}</span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{m.integrations.whatsappHint}</p>
                </div>
                {(whatsappConnecting || wacliInstalling) && (
                  <svg className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                )}
                <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                  <Toggle
                    enabled={whatsappAuthenticated}
                    disabled={whatsappConnecting || wacliInstalling}
                    onChange={(v) => {
                      if (v) connectWhatsApp();
                    }}
                  />
                </div>
              </div>

              {/* ── WhatsApp connecting hint (animated) ── */}
              <div
                className="overflow-hidden transition-all duration-300 ease-in-out"
                style={{
                  maxHeight: (whatsappConnecting || wacliInstalling) && !whatsappQr ? 120 : 0,
                  opacity: (whatsappConnecting || wacliInstalling) && !whatsappQr ? 1 : 0,
                }}
              >
                <div className="mx-3 mb-3 rounded-xl bg-muted px-4 py-3 flex items-center gap-3">
                  <p className="text-[12px] text-strong-foreground flex-1">{wacliInstalling ? m.integrations.whatsappInstallingTools : m.integrations.whatsappConnecting}</p>
                </div>
              </div>
            </div>

            {/* WhatsApp QR modal */}
            {whatsappQr && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm" onClick={() => setWhatsappQr("")}>
                <div className="bg-card rounded-2xl shadow-xl border border-border p-6 max-w-xs w-full mx-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-col items-center gap-3">
                    <h3 className="text-sm font-medium text-foreground">{m.integrations.whatsapp}</h3>
                    <img
                      src={terminalQrToDataUri(whatsappQr)}
                      alt="WhatsApp QR"
                      className="w-56 h-56 rounded-lg border border-border bg-card p-2"
                    />
                    <p className="text-[10px] text-muted-foreground text-center">
                      {m.integrations.scanQr}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Calendar ── */}
            <div className="flex items-center gap-3.5 px-4 py-3.5 transition-colors border-b border-muted">
              <div className="relative flex-shrink-0">
                <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center ${
                  !calendarIsEnabled ? "bg-border text-muted-foreground" : "bg-muted text-strong-foreground"
                }`}>
                  <Calendar className="w-[17px] h-[17px]" />
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${
                  calendarIsEnabled ? "bg-emerald-400" : "bg-border-hover"
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <span className={`text-[13px] font-medium ${calendarIsEnabled ? "text-foreground" : "text-strong-foreground"}`}>{m.integrations.calendar}</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">{m.integrations.calendarHint}</p>
              </div>
              <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                <Toggle
                  enabled={calendarIsEnabled}
                  disabled={!calendarAvailable && !calendarIsEnabled}
                  onChange={(v) => {
                    if (v) enableIntegration("calendar");
                  }}
                />
              </div>
            </div>

            {/* ── Email ── */}
            <div className="flex items-center gap-3.5 px-4 py-3.5 transition-colors">
              <div className="relative flex-shrink-0">
                <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center ${
                  !emailIsEnabled ? "bg-border text-muted-foreground" : "bg-muted text-strong-foreground"
                }`}>
                  <Mail className="w-[17px] h-[17px]" />
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${
                  emailIsEnabled ? "bg-emerald-400" : "bg-border-hover"
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <span className={`text-[13px] font-medium ${emailIsEnabled ? "text-foreground" : "text-strong-foreground"}`}>{m.integrations.email}</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">{m.integrations.emailHint}</p>
              </div>
              <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                <Toggle
                  enabled={emailIsEnabled}
                  disabled={!emailAvailable && !emailIsEnabled}
                  onChange={(v) => {
                    if (v) enableIntegration("email");
                  }}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-4 text-center">
            {m.integrations.skipForNow}
          </p>

          <NavButtons
            messages={messages}
            onBack={() => setStep(5)}
            onNext={() => setStep(7)}
            nextLabel={m.next}
          />
        </div>
      </StepContainer>

      {/* Step 7: Tools (TTS, transcription) */}
      <StepContainer visible={step === 7}>
        <div className="text-center w-full">
          <h2
            className="text-3xl font-light text-foreground mb-2"          >
            {m.tools.title}
          </h2>
          <p className="text-[15px] text-muted-foreground mb-8 max-w-sm mx-auto">
            {m.tools.subtitle}
          </p>

          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-left">

            {/* TTS */}
            <div className="flex items-center gap-3.5 px-4 py-3.5 transition-colors border-b border-muted">
              <div className="relative flex-shrink-0">
                <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center ${
                  !ttsEnabled ? "bg-border text-muted-foreground" : "bg-muted text-strong-foreground"
                }`}>
                  <Volume2 className="w-[17px] h-[17px]" />
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${
                  ttsEnabled ? "bg-emerald-400" : "bg-border-hover"
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <span className={`text-[13px] font-medium ${ttsEnabled ? "text-foreground" : "text-strong-foreground"}`}>{m.tools.tts}</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">{m.tools.ttsHint}</p>
              </div>
              <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                <Toggle
                  enabled={ttsEnabled}
                  onChange={(v) => setTtsEnabled(v)}
                />
              </div>
            </div>

            {/* Transcription */}
            <div className="flex items-center gap-3.5 px-4 py-3.5 transition-colors">
              <div className="relative flex-shrink-0">
                <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center ${
                  !transcriptionEnabled ? "bg-border text-muted-foreground" : "bg-muted text-strong-foreground"
                }`}>
                  <Mic className="w-[17px] h-[17px]" />
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${
                  transcriptionEnabled ? "bg-emerald-400" : "bg-border-hover"
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <span className={`text-[13px] font-medium ${transcriptionEnabled ? "text-foreground" : "text-strong-foreground"}`}>{m.tools.transcription}</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">{m.tools.transcriptionHint}</p>
              </div>
              <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                <Toggle
                  enabled={transcriptionEnabled}
                  onChange={(v) => setTranscriptionEnabled(v)}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-4 text-center">
            {m.tools.skipForNow}
          </p>

          <NavButtons
            messages={messages}
            onBack={() => setStep(6)}
            onNext={handleFinish}
            nextLabel={saving ? messages.common.saving : m.finish}
          />
        </div>
      </StepContainer>
    </div>
  );
}
