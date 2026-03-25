"use client";

import { useAppBootstrap } from "@/components/app-bootstrap-provider";
import { defaultClawJsTranscriptionDbPath } from "@/lib/openclaw-defaults";
import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { ALL_CALENDARS_ID, NONE_CALENDARS_ID } from "@/lib/calendar-constants";
import { ALL_EMAIL_ACCOUNTS_ID, NONE_EMAIL_ACCOUNTS_ID } from "@/lib/email-constants";
import { useLocale } from "@/components/locale-provider";
import { localized } from "@/lib/i18n/localized";
import type { IntegrationStatus, ProfileSection } from "@/lib/app-bootstrap";
import type { Locale } from "@/lib/i18n/messages";
import type { UserConfig } from "@/lib/user-config";
import type { TtsCatalog, TtsConfigFieldDescriptor, TtsProvider, TtsProviderConfig, TtsProviderDescriptor } from "@clawjs/node";
import MarkdownEditor from "@/components/markdown-editor";
import { useTheme } from "@/components/theme-provider";
import { Compass, Ear, Scale, Heart, Zap, Check, Brain, Eye, Sparkles, MessageSquare, Clock, Shield, Users, BookOpen, Gauge, Swords, Smile, Target, Feather, AlertCircle, RefreshCw, RotateCcw, FolderOpen, Download, Trash2, Search, Hash } from "lucide-react";

type WhatsAppConnectionState = "idle" | "installing" | "connecting" | "pairing" | "waiting";
type Tab = "general" | "tools" | "integrations" | "profile" | "persona" | "openclaw" | "ai" | "advanced";
type PersonaSubTab = "essentials" | "approach" | "style" | "session" | "safety";
type ProfileSubTab = "basics" | "people" | "context";
type AuthState = "idle" | "launching" | "polling" | "done";

const DEFAULT_PATHS = {
  wacli: "~/.wacli/wacli.db",
  transcription: defaultClawJsTranscriptionDbPath(),
};

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
      if (char === "█") {
        top[x] = true;
        bottom[x] = true;
      } else if (char === "▀") {
        top[x] = true;
      } else if (char === "▄") {
        bottom[x] = true;
      }
    }

    rows.push(top, bottom);
  }

  let path = "";
  for (let y = 0; y < rows.length; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rows[y][x]) {
        path += `M${x} ${y}h1v1H${x}Z`;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${rows.length}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="black"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ── small reusable components ────────────────────────────────────── */

function TextInput({ value, onChange, placeholder, testId }: {
  value: string; onChange: (v: string) => void; placeholder?: string; testId?: string;
}) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} autoCapitalize="sentences"
      data-testid={testId}
      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors" />
  );
}

function SelectInput({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      data-testid={testId}
      className={`w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors disabled:bg-card disabled:text-tertiary-foreground ${value ? "text-foreground" : "text-muted-foreground"}`}
    >
      {placeholder && <option value="" disabled hidden>{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value} className="text-foreground">{option.label}</option>
      ))}
    </select>
  );
}

function TagsInput({ value, onChange, placeholder }: {
  value: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
  const { messages } = useLocale();
  const [inputVal, setInputVal] = useState("");
  const addTag = () => {
    const trimmed = inputVal.trim();
    if (trimmed && !value.includes(trimmed)) { onChange([...value, trimmed]); setInputVal(""); }
  };
  return (
    <div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((tag, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-card text-strong-foreground text-xs px-2.5 py-1 rounded-full transition-colors hover:bg-muted">
              {tag}
              <button onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-strong-foreground transition-colors ml-0.5">&times;</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input type="text" value={inputVal} onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
          placeholder={placeholder || messages.common.add} autoCapitalize="off"
          className="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors" />
        <button onClick={addTag}
          className="px-3 py-1.5 bg-card text-strong-foreground rounded-lg text-xs hover:bg-muted transition-all active:scale-[0.96]">
          {messages.common.add}
        </button>
      </div>
    </div>
  );
}

function Toggle({ enabled, onChange, disabled = false, testId }: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => onChange(!enabled)}
      disabled={disabled}
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

function TripleOptionSelector({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }>;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((opt) => {
        const selected = value === opt.value;
        const Icon = opt.icon;
        return (
          <button key={opt.value} type="button"
            onClick={() => onChange(opt.value)}
            className={`relative flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl text-center border transition-colors duration-200 h-full ${
              selected
                ? "border-[1.5px] border-foreground bg-foreground/[0.04] text-foreground"
                : "border-border/70 bg-background text-foreground hover:border-muted-foreground"
            }`}>
            {selected && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-foreground rounded-full flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />
              </span>
            )}
            <Icon className={`w-[18px] h-[18px] ${selected ? "text-foreground" : "text-muted-foreground"}`} />
            <span className={`text-[11px] ${selected ? "font-semibold" : "font-medium"}`}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function MultiSelectChips({ selected, onChange, options }: {
  selected: string[];
  onChange: (v: string[]) => void;
  options: Array<{ value: string; label: string; desc: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isSelected = selected.includes(opt.value);
        return (
          <button key={opt.value} type="button"
            onClick={() => onChange(isSelected ? selected.filter((s) => s !== opt.value) : [...selected, opt.value])}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors duration-200 ${
              isSelected
                ? "border-foreground bg-foreground/[0.06] text-foreground font-medium"
                : "border-border/70 bg-card/50 text-foreground hover:border-muted-foreground hover:bg-card/70"
            }`}>
            <span className="font-medium">{opt.label}</span>
            <span className={`ml-1 text-[10px] ${isSelected ? "text-foreground/60" : "text-muted-foreground"}`}>{opt.desc}</span>
          </button>
        );
      })}
    </div>
  );
}

function TextArea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} rows={rows} autoCapitalize="sentences"
      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors resize-none" />
  );
}

function SectionHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="pt-2">
      <h2 className="text-sm font-medium text-foreground mb-0.5">{title}</h2>
      <p className="text-xs text-muted-foreground mb-4">{hint}</p>
    </div>
  );
}

/* ── integration card ─────────────────────────────────────────────── */

function IntegrationRow({
  icon,
  title,
  description,
  enabled,
  onToggle,
  status,
  detail,
  onRowClick,
  toggleDisabled = false,
  isFirst = false,
  isLast = false,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  status: "connected" | "syncing" | "installing" | "needs-app" | "pairing" | "waiting" | "connecting" | "disabled";
  detail?: string;
  onRowClick?: () => void;
  toggleDisabled?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  testId?: string;
}) {
  const statusDotColor = {
    connected: "bg-emerald-400",
    syncing: "bg-sky-500",
    installing: "bg-sky-500",
    "needs-app": "bg-amber-400",
    pairing: "bg-sky-500",
    waiting: "bg-sky-400",
    connecting: "bg-sky-500",
    disabled: "bg-border-hover",
  }[status];

  return (
    <div
      data-testid={testId ? `${testId}-card` : undefined}
      className={`flex items-center gap-3.5 px-4 py-3.5 transition-colors ${
        !isLast ? "border-b border-border" : ""
      } ${enabled && onRowClick ? "cursor-pointer hover:bg-background" : ""}`}
      onClick={enabled && onRowClick ? onRowClick : undefined}
    >
      {/* Icon with status dot */}
      <div className="relative flex-shrink-0">
        <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center ${
          !enabled ? "bg-border text-muted-foreground" : "bg-muted text-strong-foreground"
        }`}>
          {icon}
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${statusDotColor}`} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] font-medium ${enabled ? "text-foreground" : "text-strong-foreground"}`}>{title}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{description}</div>
      </div>

      {/* Detail text or spinner */}
      {enabled && (status === "installing" || status === "connecting" || status === "syncing" || (status === "waiting" && !detail)) ? (
        <svg className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      ) : enabled && detail ? (
        <span className="text-[10px] text-muted-foreground text-right max-w-[120px] truncate flex-shrink-0">{detail}</span>
      ) : null}

      {/* Toggle */}
      <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
        <Toggle
          enabled={enabled}
          onChange={onToggle}
          disabled={toggleDisabled}
          testId={testId ? `${testId}-toggle` : undefined}
        />
      </div>
    </div>
  );
}

function IntegrationConfigModal({
  open,
  onClose,
  icon,
  title,
  statusLabel,
  children,
  doneDisabled,
}: {
  open: boolean;
  onClose: () => void;
  icon: React.ReactNode;
  title: string;
  statusLabel?: string;
  children: React.ReactNode;
  doneDisabled?: boolean;
}) {
  const { messages } = useLocale();
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="mx-4 flex w-full max-w-[380px] flex-col rounded-xl border border-border bg-card shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
          style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3.5 px-7 pt-6 pb-0">
            <div className="w-10 h-10 rounded-[10px] bg-card text-strong-foreground flex items-center justify-center">
              {icon}
            </div>
            <h3 className="text-[16px] font-semibold text-foreground flex-1">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="w-[30px] h-[30px] rounded-lg bg-card text-tertiary-foreground flex items-center justify-center hover:bg-muted hover:text-strong-foreground transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          {statusLabel && (
            <div className="flex items-center gap-1.5 px-7 pt-3 text-[11px] text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {statusLabel}
            </div>
          )}
          <div className="px-7 pt-4 pb-5 space-y-4">
            {children}
          </div>
          <div className="px-7 pb-6 pt-0 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={doneDisabled}
              className={`h-9 rounded-xl px-4 text-sm transition-colors ${
                doneDisabled
                  ? "bg-border text-muted-foreground cursor-not-allowed"
                  : "bg-foreground text-primary-foreground hover:bg-foreground-intense"
              }`}
            >
              {messages.settings.integrations.email.done}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── section wrapper ─────────────────────────────────────────────── */

function SettingField({ label, hint, children }: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-strong-foreground mb-1.5">{label}</label>
      {hint && <p className="text-[11px] text-muted-foreground mb-2">{hint}</p>}
      {children}
    </div>
  );
}

function resolveSelectedEmailIds(
  selectedIds: string[],
  availableAccounts: Array<{ id: string; email: string }>
): string[] {
  if (!selectedIds.length) return [];
  if (selectedIds.includes(ALL_EMAIL_ACCOUNTS_ID)) {
    return availableAccounts.map((account) => account.id);
  }

  const resolved = new Set<string>();
  for (const selectedId of selectedIds) {
    const match = availableAccounts.find((account) => account.id === selectedId || account.email === selectedId);
    if (match) {
      resolved.add(match.id);
    }
  }

  return Array.from(resolved);
}

function resolveSelectedCalendarIds(
  selectedIds: string[],
  availableCalendars: Array<{ id: string; title: string }>
): string[] {
  if (!selectedIds.length) return [];
  if (selectedIds.includes(ALL_CALENDARS_ID)) {
    return availableCalendars.map((cal) => cal.id);
  }

  const resolved = new Set<string>();
  for (const selectedId of selectedIds) {
    // Match by exact ID first, then fall back to legacy "title::index" format by title.
    const match = availableCalendars.find((cal) => cal.id === selectedId)
      || (selectedId.includes("::") && availableCalendars.find((cal) => cal.title === selectedId.split("::")[0]));
    if (match) {
      resolved.add(match.id);
    }
  }

  return Array.from(resolved);
}

/* ── main page ────────────────────────────────────────────────────── */

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const { bootstrapData, ready: bootstrapReady, updateBootstrapData } = useAppBootstrap();
  const { locale, setLocale, languageOptions, messages } = useLocale();
  const { theme, setTheme } = useTheme();
  const [config, setConfig] = useState<UserConfig | null>(bootstrapData?.config ?? null);
  const [profileSections, setProfileSections] = useState<ProfileSection[]>(bootstrapData?.profileSections ?? []);
  const [activeProfileSectionId, setActiveProfileSectionId] = useState("");
  const [toolStatus, setToolStatus] = useState<IntegrationStatus | null>(bootstrapData?.toolStatus ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [resettingWorkspace, setResettingWorkspace] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetOptions, setResetOptions] = useState({
    conversations: true,
    profile: true,
    contextFiles: true,
    transcriptions: true,
    settings: true,
    whatsappData: true,
    whatsappCli: true,
    emailAccounts: true,
    calendarAccounts: true,
    openClawWorkspace: true,
    openClawUninstall: false,
  });
  const [showEmailAccountsModal, setShowEmailAccountsModal] = useState(false);
  const [showWhatsAppConfigModal, setShowWhatsAppConfigModal] = useState(false);
  const [waChats, setWaChats] = useState<Array<{ name: string; isGroup: boolean; messageCount: number }>>([]);
  const [waChatsLoading, setWaChatsLoading] = useState(false);
  const [showCalendarConfigModal, setShowCalendarConfigModal] = useState(false);
  const [showTranscriptionConfigModal, setShowTranscriptionConfigModal] = useState(false);
  const [showTtsConfigModal, setShowTtsConfigModal] = useState(false);
  const [ttsCatalog, setTtsCatalog] = useState<TtsCatalog | null>(null);

  const [imageBackends, setImageBackends] = useState<Array<{
    id: string;
    label: string;
    available: boolean;
    reason?: string;
    supportedKinds: string[];
    supportedModels?: Array<{ id: string; label: string; default?: boolean }>;
    metadataSchema?: Array<{ key: string; label: string; type: "select" | "text" | "number"; options?: Array<{ value: string; label: string }>; default?: string; placeholder?: string }>;
  }>>([]);
  const [imageBackendsLoaded, setImageBackendsLoaded] = useState(false);
  const [showImageGenConfigModal, setShowImageGenConfigModal] = useState(false);

  const [apiKeyModalProvider, setApiKeyModalProvider] = useState<string | null>(null);
  const [oauthModalProvider, setOauthModalProvider] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "general";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [personaSubTab, setPersonaSubTab] = useState<PersonaSubTab>("essentials");
  const [profileSubTab, setProfileSubTab] = useState<ProfileSubTab>("basics");
  const [whatsAppState, setWhatsAppState] = useState<WhatsAppConnectionState>("idle");
  const [whatsAppQrText, setWhatsAppQrText] = useState("");
  const [whatsAppAutoStarted, setWhatsAppAutoStarted] = useState(false);
  const [showWhatsAppQrModal, setShowWhatsAppQrModal] = useState(false);
  const [whatsAppInstallAttempted, setWhatsAppInstallAttempted] = useState(false);
  const [showWhatsAppDisconnectModal, setShowWhatsAppDisconnectModal] = useState(false);
  const [whatsAppDisconnecting, setWhatsAppDisconnecting] = useState<false | "keep" | "delete">(false);
  const [whatsAppUninstallCli, setWhatsAppUninstallCli] = useState(false);
  const [showTelegramConfigModal, setShowTelegramConfigModal] = useState(false);
  const [showTelegramDisconnectModal, setShowTelegramDisconnectModal] = useState(false);
  const [telegramDisconnecting, setTelegramDisconnecting] = useState<false | "keep" | "delete">(false);
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramTestError, setTelegramTestError] = useState(false);
  const [telegramBotTokenInput, setTelegramBotTokenInput] = useState("");
  const [telegramBotInfo, setTelegramBotInfo] = useState<{ username: string; name: string } | null>(null);
  const [showSlackConfigModal, setShowSlackConfigModal] = useState(false);
  const [showSlackDisconnectModal, setShowSlackDisconnectModal] = useState(false);
  const [slackDisconnecting, setSlackDisconnecting] = useState<false | "keep" | "delete">(false);
  const [slackTesting, setSlackTesting] = useState(false);
  const [slackTestError, setSlackTestError] = useState(false);
  const [slackBotTokenInput, setSlackBotTokenInput] = useState("");
  const [slackBotInfo, setSlackBotInfo] = useState<{ username: string; teamName: string } | null>(null);
  const [openClawRefreshing, setOpenClawRefreshing] = useState(false);
  const [openClawRestarting, setOpenClawRestarting] = useState(false);
  const [openClawReinstalling, setOpenClawReinstalling] = useState(false);
  const [openClawUninstalling, setOpenClawUninstalling] = useState(false);
  const [showOpenClawUninstallModal, setShowOpenClawUninstallModal] = useState(false);
  const [showOpenClawUpdateModal, setShowOpenClawUpdateModal] = useState(false);
  const [showOpenClawDisableModal, setShowOpenClawDisableModal] = useState(false);
  const [openClawDisabling, setOpenClawDisabling] = useState(false);
  const [openClawCopied, setOpenClawCopied] = useState<string | null>(null);
  const [adapterBusy, setAdapterBusy] = useState<Record<string, "installing" | "uninstalling">>({});
  const [adapterProgress, setAdapterProgress] = useState<Record<string, { message: string; percent: number }>>({});
  const [openClawEnabled, setOpenClawEnabled] = useState<boolean | undefined>(
    bootstrapData ? bootstrapData.localSettings.openClawEnabled !== false : undefined
  );

  // Fetch WhatsApp chats when modal opens
  const fetchWhatsAppChats = useCallback(() => {
    return fetch("/api/integrations/whatsapp/chats")
      .then((r) => r.json())
      .then((data) => setWaChats(data.chats || []))
      .catch(() => setWaChats([]));
  }, []);

  const openWhatsAppConfigModal = useCallback(() => {
    setShowWhatsAppConfigModal(true);
    setWaChatsLoading(true);
    fetchWhatsAppChats().finally(() => setWaChatsLoading(false));
  }, [fetchWhatsAppChats]);

  // Poll for new chats while modal is open and syncing
  useEffect(() => {
    if (!showWhatsAppConfigModal || !toolStatus?.whatsapp.syncing) return;
    const poll = setInterval(() => { fetchWhatsAppChats(); }, 5000);
    return () => clearInterval(poll);
  }, [showWhatsAppConfigModal, toolStatus?.whatsapp.syncing, fetchWhatsAppChats]);

  // Advanced: workspace files
  const [workspaceFiles, setWorkspaceFiles] = useState<Array<{ fileName: string; content: string }>>([]);
  const [activeWorkspaceFile, setActiveWorkspaceFile] = useState("");
  const [workspaceFilesSaving, setWorkspaceFilesSaving] = useState<Record<string, boolean>>({});
  const [workspaceFilesSaved, setWorkspaceFilesSaved] = useState<Record<string, boolean>>({});
  const [workspaceFilesLoaded, setWorkspaceFilesLoaded] = useState(false);

  // AI provider auth states, initialised from bootstrap so there's no flash
  const [oauthStates, setOauthStates] = useState<Record<string, AuthState>>(() => {
    const p = bootstrapData?.aiAuth?.providers;
    return {
      "openai-codex": p?.["openai-codex"]?.hasSubscription ? "done" : "idle",
      "google-gemini-cli": p?.["google-gemini-cli"]?.hasSubscription ? "done" : "idle",
      "kimi-coding": p?.["kimi-coding"]?.hasSubscription ? "done" : "idle",
      "qwen": p?.["qwen"]?.hasSubscription ? "done" : "idle",
    };
  });
  const [apiKeyValues, setApiKeyValues] = useState<Record<string, string>>({});
  const [apiKeySaved, setApiKeySaved] = useState<Record<string, boolean>>(() => {
    const p = bootstrapData?.aiAuth?.providers;
    const saved: Record<string, boolean> = {};
    for (const k of ["anthropic", "openai", "google", "deepseek", "mistral", "xai", "groq", "openrouter"]) {
      if (p?.[k]?.hasProfileApiKey) saved[k] = true;
    }
    return saved;
  });
  const [authTypes, setAuthTypes] = useState<Record<string, string | null>>(() => {
    const p = bootstrapData?.aiAuth?.providers;
    const types: Record<string, string | null> = {};
    for (const k of ["anthropic", "openai", "google", "deepseek", "mistral", "xai", "groq", "openrouter"]) {
      types[k] = p?.[k]?.authType ?? null;
    }
    return types;
  });
  const [defaultModel, setDefaultModel] = useState(bootstrapData?.aiAuth?.defaultModel ?? "");
  const authPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const configLoadedRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashSaved = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }, []);

  const refreshToolStatus = useCallback(async () => {
    const tools = await fetch("/api/integrations/status").then((r) => r.json()) as IntegrationStatus;
    setToolStatus(tools);
    updateBootstrapData((current) => ({
      ...current,
      toolStatus: tools,
    }));
    return tools;
  }, [updateBootstrapData]);

  useEffect(() => {
    if (bootstrapData) {
      if (!config) {
        setConfig(bootstrapData.config);
        setLocale(bootstrapData.config.locale);
      }
      if (profileSections.length === 0) {
        setProfileSections(bootstrapData.profileSections);
      }
      if (!toolStatus) {
        setToolStatus(bootstrapData.toolStatus);
      }
      if (!ttsCatalog) {
        fetch("/api/tts/providers")
          .then((response) => response.json())
          .then((tts) => setTtsCatalog(tts))
          .catch(() => {});
      }
      if (openClawEnabled === undefined) {
        setOpenClawEnabled(bootstrapData.localSettings.openClawEnabled !== false);
      }
      return;
    }

    if (!bootstrapReady) return;

    Promise.all([
      fetch("/api/config").then((r) => r.json()),
      fetch("/api/config/profile").then((r) => r.json()),
      refreshToolStatus(),
      fetch("/api/tts/providers").then((r) => r.json()).catch(() => null),
    ]).then(([cfg, prof, tools, tts]) => {
      setConfig(cfg);
      setLocale(cfg.locale);
      setProfileSections(Array.isArray(prof.sections) ? prof.sections : []);
      setToolStatus(tools);
      setTtsCatalog(tts);
    }).catch(() => setError("Failed to load settings"));
  }, [bootstrapData, bootstrapReady, config, profileSections.length, refreshToolStatus, setLocale, toolStatus, ttsCatalog, openClawEnabled]);

  useEffect(() => {
    if (profileSections.length === 0) return;
    if (!profileSections.some((section) => section.id === activeProfileSectionId)) {
      setActiveProfileSectionId(profileSections[0].id);
    }
  }, [activeProfileSectionId, profileSections]);

  useEffect(() => {
    if (toolStatus?.telegram.botConnected && toolStatus.telegram.botUsername) {
      setTelegramBotInfo({
        username: toolStatus.telegram.botUsername,
        name: config?.telegram?.botName || toolStatus.telegram.botUsername,
      });
    } else if (!toolStatus?.telegram.botConnected) {
      setTelegramBotInfo(null);
    }
  }, [config?.telegram?.botName, toolStatus?.telegram.botConnected, toolStatus?.telegram.botUsername]);

  useEffect(() => {
    if (toolStatus?.slack.botConnected && (toolStatus.slack.botUsername || toolStatus.slack.teamName)) {
      setSlackBotInfo({
        username: toolStatus.slack.botUsername || "configured",
        teamName: toolStatus.slack.teamName || "Connected workspace",
      });
    } else if (!toolStatus?.slack.botConnected) {
      setSlackBotInfo(null);
    }
  }, [toolStatus?.slack.botConnected, toolStatus?.slack.botUsername, toolStatus?.slack.teamName]);

  const loadImageBackends = useCallback(async () => {
    try {
      const res = await fetch("/api/images/backends");
      if (res.ok) {
        const data = await res.json();
        const filtered = (data.backends ?? []).filter((b: { id: string }) => b.id !== "command");
        setImageBackends(filtered);
        // Auto-set default backend to first available if none configured
        if (!config?.imageGeneration?.defaultBackendId) {
          const firstAvailable = filtered.find((b: { available: boolean }) => b.available);
          if (firstAvailable) {
            updateConfig((c) => ({
              ...c,
              imageGeneration: { ...c.imageGeneration, defaultBackendId: firstAvailable.id },
            }));
          }
        }
      }
      setImageBackendsLoaded(true);
    } catch {
      setImageBackendsLoaded(true);
    }
  }, [config?.imageGeneration?.defaultBackendId]);

  // Load image backends when tools tab is opened
  useEffect(() => {
    if (tab === "tools" && !imageBackendsLoaded) {
      loadImageBackends();
    }
  }, [tab, imageBackendsLoaded, loadImageBackends]);

  // Auto-save: debounce 1s on any config or profileSections change
  useEffect(() => {
    if (!config) return;
    // Skip the initial load
    if (!configLoadedRef.current) {
      configLoadedRef.current = true;
      return;
    }

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      setSaving(true); setError("");
      try {
        const [profRes, cfgRes] = await Promise.all([
          fetch("/api/config/profile", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              profileConfig: {
                displayName: config.displayName,
                profileBasics: config.profileBasics || {
                  age: "",
                  gender: "",
                  location: "",
                  occupation: "",
                },
                profileFile: config.profileFile,
              },
              sections: profileSections.map((section) => ({
                id: section.id,
                content: section.content,
              })),
            }),
          }),
          fetch("/api/config", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(config),
          }),
        ]);
        if (!cfgRes.ok || !profRes.ok) throw new Error("Save failed");
        updateBootstrapData((current) => ({
          ...current,
          config,
          profileSections,
        }));
        flashSaved();
      } catch { setError(messages.settings.errors.save); }
      setSaving(false);
    }, 1000);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, profileSections]);

  const updateConfig = useCallback((updater: (c: UserConfig) => UserConfig) => {
    setConfig((prev) => prev ? updater({ ...prev }) : prev);
  }, []);

  const syncLocaleState = useCallback((nextLocale: Locale) => {
    setLocale(nextLocale);
    updateConfig((current) => ({ ...current, locale: nextLocale }));
    updateBootstrapData((current) => ({
      ...current,
      config: {
        ...current.config,
        locale: nextLocale,
      },
    }));
  }, [setLocale, updateBootstrapData, updateConfig]);

  const applyLocale = useCallback(async (nextLocale: Locale) => {
    if (nextLocale === locale) return;

    const previousLocale = locale;
    setError("");
    syncLocaleState(nextLocale);

    try {
      const response = await fetch("/api/config/local", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });
      if (!response.ok) {
        throw new Error("Failed to save locale");
      }
      flashSaved();
    } catch {
      syncLocaleState(previousLocale);
      setError(messages.settings.errors.save);
    }
  }, [flashSaved, locale, messages.settings.errors.save, syncLocaleState]);

  const resetWorkspace = useCallback(async () => {
    setResettingWorkspace(true);
    setError("");

    try {
      const response = await fetch("/api/config/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resetOptions),
      });

      if (!response.ok) {
        throw new Error("Failed to reset workspace");
      }

      window.location.assign("/");
    } catch {
      setResettingWorkspace(false);
      setShowResetModal(false);
      setError(messages.settings.errors.reset);
    }
  }, [messages.settings.errors.reset, resetOptions]);

  // ── AI provider: silent background refresh when entering tab ──
  useEffect(() => {
    if (tab !== "ai") return;
    fetch("/api/integrations/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.defaultModel) setDefaultModel(data.defaultModel);
        setOauthStates((prev) => {
          const next = { ...prev };
          if (data.providers?.["openai-codex"]?.hasSubscription) next["openai-codex"] = prev["openai-codex"] === "idle" ? "done" : prev["openai-codex"];
          if (data.providers?.["google-gemini-cli"]?.hasSubscription) next["google-gemini-cli"] = prev["google-gemini-cli"] === "idle" ? "done" : prev["google-gemini-cli"];
          if (data.providers?.["kimi-coding"]?.hasSubscription) next["kimi-coding"] = prev["kimi-coding"] === "idle" ? "done" : prev["kimi-coding"];
          if (data.providers?.["qwen"]?.hasSubscription) next["qwen"] = prev["qwen"] === "idle" ? "done" : prev["qwen"];
          return next;
        });
        setApiKeySaved((prev) => {
          const next = { ...prev };
          for (const k of ["anthropic", "openai", "google", "deepseek", "mistral", "xai", "groq", "openrouter"]) {
            if (data.providers?.[k]?.hasProfileApiKey) next[k] = true;
          }
          return next;
        });
      })
      .catch(() => {});
  }, [tab]);

  // Clean up auth poll on unmount
  useEffect(() => {
    return () => {
      if (authPollRef.current) clearInterval(authPollRef.current);
    };
  }, []);

  // ── Advanced: load workspace files ──
  useEffect(() => {
    if (tab !== "advanced" || workspaceFilesLoaded) return;
    fetch("/api/config/workspace-files")
      .then((r) => r.json())
      .then((data: { files?: Array<{ fileName: string; content: string }> }) => {
        if (Array.isArray(data.files)) {
          setWorkspaceFiles(data.files);
          if (data.files.length > 0 && !activeWorkspaceFile) {
            setActiveWorkspaceFile(data.files[0].fileName);
          }
          setWorkspaceFilesLoaded(true);
        }
      })
      .catch(() => {});
  }, [tab, workspaceFilesLoaded, activeWorkspaceFile]);

  const saveWorkspaceFile = useCallback(async (fileName: string, content: string) => {
    setWorkspaceFilesSaving((prev) => ({ ...prev, [fileName]: true }));
    try {
      const res = await fetch("/api/config/workspace-files", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, content }),
      });
      if (res.ok) {
        setWorkspaceFilesSaved((prev) => ({ ...prev, [fileName]: true }));
        setTimeout(() => setWorkspaceFilesSaved((prev) => ({ ...prev, [fileName]: false })), 3000);
      }
    } catch { /* ignore */ }
    setWorkspaceFilesSaving((prev) => ({ ...prev, [fileName]: false }));
  }, []);

  // ── OAuth launch handler ──
  const launchOAuth = useCallback(async (provider: string) => {
    setOauthStates((prev) => ({ ...prev, [provider]: "launching" as AuthState }));

    try {
      const res = await fetch("/api/integrations/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "oauth", provider }),
      });
      const data = await res.json();
      if (!data.ok) {
        setOauthStates((prev) => ({ ...prev, [provider]: "idle" as AuthState }));
        return;
      }

      setOauthStates((prev) => ({ ...prev, [provider]: "polling" as AuthState }));

      if (authPollRef.current) clearInterval(authPollRef.current);
      let pollCount = 0;
      authPollRef.current = setInterval(async () => {
        pollCount++;
        if (pollCount > 20) { // ~60s timeout
          if (authPollRef.current) clearInterval(authPollRef.current);
          authPollRef.current = null;
          setOauthStates((prev) => ({ ...prev, [provider]: "idle" as AuthState }));
          return;
        }
        try {
          const statusRes = await fetch("/api/integrations/auth");
          const statusData = await statusRes.json();
          if (statusData.providers?.[provider]?.hasSubscription) {
            if (authPollRef.current) clearInterval(authPollRef.current);
            authPollRef.current = null;
            setOauthStates((prev) => ({ ...prev, [provider]: "done" as AuthState }));
            if (statusData.defaultModel) {
              setDefaultModel(statusData.defaultModel);
            } else {
              // First provider connected, auto-set as default
              try {
                const setRes = await fetch("/api/integrations/auth", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "set-default", model: provider }),
                });
                const setData = await setRes.json();
                if (setData.ok) setDefaultModel(setData.model ?? provider);
              } catch { /* ignore */ }
            }
            await refreshToolStatus();
          }
        } catch { /* ignore */ }
      }, 3000);
    } catch {
      setOauthStates((prev) => ({ ...prev, [provider]: "idle" as AuthState }));
    }
  }, [refreshToolStatus]);

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
        setApiKeySaved((prev) => ({ ...prev, [provider]: true }));
        setApiKeyValues((prev) => ({ ...prev, [provider]: "" }));
        // Auto-set as default if no model is configured yet
        if (!defaultModel) {
          try {
            const setRes = await fetch("/api/integrations/auth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "set-default", model: provider }),
            });
            const setData = await setRes.json();
            if (setData.ok) setDefaultModel(setData.model ?? provider);
          } catch { /* ignore */ }
        }
        await refreshToolStatus();
        flashSaved();
      }
    } catch { /* ignore */ }
  }, [refreshToolStatus, flashSaved, defaultModel]);

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
        setApiKeySaved((prev) => ({ ...prev, [provider]: false }));
        setApiKeyValues((prev) => ({ ...prev, [provider]: "" }));
        setOauthStates((prev) => ({ ...prev, [provider]: "idle" as AuthState }));
        await refreshToolStatus();
        flashSaved();
      }
    } catch { /* ignore */ }
  }, [refreshToolStatus, flashSaved]);

  // ── Set default model handler ──
  const handleSetDefault = useCallback(async (model: string) => {
    try {
      const res = await fetch("/api/integrations/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-default", model }),
      });
      const data = await res.json();
      if (data.ok) setDefaultModel(data.model ?? model);
    } catch { /* ignore */ }
  }, []);

  const groupedProfileSections = profileSections.reduce<Array<{ group: string; sections: ProfileSection[] }>>((groups, section) => {
    const existing = groups.find((entry) => entry.group === section.group);
    if (existing) {
      existing.sections.push(section);
      return groups;
    }

    groups.push({ group: section.group, sections: [section] });
    return groups;
  }, []);

  const activeProfileSection = profileSections.find((section) => section.id === activeProfileSectionId) || null;

  const installWacli = useCallback(async () => {
    const res = await fetch("/api/integrations/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ package: "wacli" }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Server error (${res.status})`);
    }
    const data = await res.json();
    if (!data.success) throw new Error(data.output || data.error || "Installation failed");
    await refreshToolStatus();
  }, [refreshToolStatus]);

  const connectWhatsApp = useCallback(async (showSavedState: boolean) => {
    const res = await fetch("/api/integrations/whatsapp/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Connection failed");

    setToolStatus((prev) => prev ? { ...prev, whatsapp: data.integration } : prev);
    setWhatsAppState(data.state === "connected" || data.state === "disabled" ? "idle" : data.state);
    setWhatsAppQrText(data.qrText || "");
    if (showSavedState) {
      flashSaved();
    }
  }, [flashSaved]);

  const handleWhatsAppEnable = useCallback(async () => {
    updateConfig((c) => ({
      ...c,
      dataSources: { ...c.dataSources, wacliDbPath: DEFAULT_PATHS.wacli },
    }));
    setError("");
    setWhatsAppQrText("");
    setWhatsAppAutoStarted(true);

    const needsInstall = !toolStatus?.whatsapp.installed;
    if (needsInstall) {
      setWhatsAppState("installing");
      setWhatsAppInstallAttempted(true);
      try {
        await installWacli();
        await refreshToolStatus();
      } catch {
        setWhatsAppState("idle");
        setError(messages.settings.integrations.whatsapp.installFailed);
        return;
      }
    }
    setWhatsAppState("connecting");
    try {
      await connectWhatsApp(true);
    } catch (e) {
      setWhatsAppState("waiting");
      setWhatsAppQrText("");
      setError(e instanceof Error ? e.message : messages.settings.errors.updateWhatsApp);
    }
  }, [connectWhatsApp, installWacli, messages.settings.errors.updateWhatsApp, messages.settings.integrations.whatsapp.installFailed, refreshToolStatus, toolStatus, updateConfig]);

  const handleWhatsAppDisable = useCallback(async (deleteData: boolean, uninstallCli: boolean) => {
    setWhatsAppDisconnecting(deleteData ? "delete" : "keep");
    try {
      if (deleteData || uninstallCli) {
        await fetch("/api/integrations/whatsapp/cleanup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deleteData, uninstallCli }),
        });
      } else {
        await fetch("/api/integrations/whatsapp/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: false }),
        });
      }

      updateConfig((c) => ({
        ...c,
        dataSources: { ...c.dataSources, wacliDbPath: "" },
      }));
      setWhatsAppState("idle");
      setWhatsAppQrText("");
      setWhatsAppAutoStarted(false);
      setWhatsAppInstallAttempted(false);
      await refreshToolStatus();
      flashSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : messages.settings.errors.updateWhatsApp);
    } finally {
      setWhatsAppDisconnecting(false);
      setShowWhatsAppDisconnectModal(false);
      setWhatsAppUninstallCli(false);
    }
  }, [flashSaved, messages.settings.errors.updateWhatsApp, refreshToolStatus, updateConfig]);

  const handleWhatsAppToggle = useCallback((enabled: boolean) => {
    if (enabled) {
      handleWhatsAppEnable();
    } else {
      setShowWhatsAppDisconnectModal(true);
    }
  }, [handleWhatsAppEnable]);

  const handleTelegramToggle = useCallback((enabled: boolean) => {
    if (enabled) {
      updateConfig((c) => ({
        ...c,
        telegram: { ...c.telegram, enabled: true },
      }));
      setTelegramBotTokenInput("");
      setTelegramTestError(false);
      setShowTelegramConfigModal(true);
    } else {
      setShowTelegramDisconnectModal(true);
    }
  }, [updateConfig]);

  const handleTelegramTestConnection = useCallback(async (token: string) => {
    setTelegramTesting(true);
    setTelegramTestError(false);
    try {
      const res = await fetch("/api/integrations/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token }),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.state === "connected") {
        setTelegramBotInfo({ username: data.botUsername, name: data.botName });
        setTelegramBotTokenInput("");
        updateConfig((c) => ({
          ...c,
          telegram: {
            ...c.telegram,
            enabled: true,
            botToken: "",
            botName: data.botName,
            botUsername: data.botUsername,
          },
        }));
        await refreshToolStatus();
      } else {
        setTelegramTestError(true);
      }
    } catch {
      setTelegramTestError(true);
    } finally {
      setTelegramTesting(false);
    }
  }, [refreshToolStatus, updateConfig]);

  const handleTelegramDisable = useCallback(async (deleteToken: boolean) => {
    setTelegramDisconnecting(deleteToken ? "delete" : "keep");
    try {
      await fetch("/api/integrations/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deleteToken ? { botToken: null } : { enabled: false }),
      });
      if (deleteToken) {
        updateConfig((c) => ({
          ...c,
          telegram: {
            enabled: false,
            botToken: "",
            botName: "",
            botUsername: "",
            allowedChatIds: [],
            syncMessages: false,
          },
        }));
        setTelegramBotInfo(null);
      } else {
        updateConfig((c) => ({
          ...c,
          telegram: { ...c.telegram, enabled: false },
        }));
      }
      await refreshToolStatus();
      flashSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disable Telegram");
    } finally {
      setTelegramDisconnecting(false);
      setShowTelegramDisconnectModal(false);
    }
  }, [flashSaved, refreshToolStatus, updateConfig]);

  const handleSlackToggle = useCallback((enabled: boolean) => {
    if (enabled) {
      updateConfig((c) => ({
        ...c,
        slack: { ...c.slack, enabled: true },
      }));
      setSlackBotTokenInput("");
      setSlackTestError(false);
      setShowSlackConfigModal(true);
    } else {
      setShowSlackDisconnectModal(true);
    }
  }, [updateConfig]);

  const handleSlackTestConnection = useCallback(async (token: string) => {
    setSlackTesting(true);
    setSlackTestError(false);
    try {
      const res = await fetch("/api/integrations/slack/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token }),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.state === "connected") {
        setSlackBotInfo({ username: data.botUsername, teamName: data.teamName });
        setSlackBotTokenInput("");
        updateConfig((c) => ({
          ...c,
          slack: {
            ...c.slack,
            enabled: true,
            botToken: "",
            botUsername: data.botUsername,
            teamName: data.teamName,
          },
        }));
        await refreshToolStatus();
      } else {
        setSlackTestError(true);
      }
    } catch {
      setSlackTestError(true);
    } finally {
      setSlackTesting(false);
    }
  }, [refreshToolStatus, updateConfig]);

  const handleSlackDisable = useCallback(async (deleteToken: boolean) => {
    setSlackDisconnecting(deleteToken ? "delete" : "keep");
    try {
      await fetch("/api/integrations/slack/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deleteToken ? { botToken: null } : { enabled: false }),
      });
      if (deleteToken) {
        updateConfig((c) => ({
          ...c,
          slack: {
            enabled: false,
            botToken: "",
            botUsername: "",
            teamName: "",
            allowedChannelIds: [],
            syncMessages: false,
          },
        }));
        setSlackBotInfo(null);
      } else {
        updateConfig((c) => ({
          ...c,
          slack: { ...c.slack, enabled: false },
        }));
      }
      await refreshToolStatus();
      flashSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disable Slack");
    } finally {
      setSlackDisconnecting(false);
      setShowSlackDisconnectModal(false);
    }
  }, [flashSaved, refreshToolStatus, updateConfig]);

  useEffect(() => {
    if (!config?.dataSources.wacliDbPath || whatsAppState === "connecting" || whatsAppState === "installing") return;

    if (toolStatus?.whatsapp.authenticated) {
      setWhatsAppState("idle");
      setWhatsAppQrText("");
      setShowWhatsAppQrModal(false);
      return;
    }

    if (toolStatus && !toolStatus.whatsapp.installed) {
      if (whatsAppInstallAttempted) return; // Don't retry if install already failed
      // Auto-install instead of showing needs-app
      setWhatsAppInstallAttempted(true);
      setWhatsAppState("installing");
      installWacli()
        .then(() => {
          setWhatsAppState("connecting");
          return connectWhatsApp(false);
        })
        .catch(() => {
          setWhatsAppState("idle");
        });
      return;
    }

    if (toolStatus?.whatsapp.authInProgress) {
      if (toolStatus.whatsapp.qrText) {
        setWhatsAppQrText(toolStatus.whatsapp.qrText);
      }
      setWhatsAppState((whatsAppQrText || toolStatus.whatsapp.qrText) ? "pairing" : "waiting");
    } else if (toolStatus?.whatsapp.lastError) {
      setWhatsAppState("waiting");
    }

    const poll = setInterval(async () => {
      try {
        const tools = await refreshToolStatus();
        if (tools.whatsapp.authenticated) {
          setWhatsAppState("idle");
          setWhatsAppQrText("");
          setShowWhatsAppQrModal(false);
        } else if (tools.whatsapp.authInProgress) {
          if (tools.whatsapp.qrText) {
            setWhatsAppQrText(tools.whatsapp.qrText);
          }
          setWhatsAppState((whatsAppQrText || tools.whatsapp.qrText) ? "pairing" : "waiting");
        } else if (tools.whatsapp.lastError) {
          setWhatsAppState("waiting");
        }
      } catch {
        // Keep the last visible state; polling is best-effort only.
      }
    }, 3000);

    return () => clearInterval(poll);
  }, [config, connectWhatsApp, installWacli, refreshToolStatus, toolStatus, whatsAppInstallAttempted, whatsAppQrText, whatsAppState]);

  useEffect(() => {
    if (!config?.dataSources.wacliDbPath) {
      setWhatsAppAutoStarted(false);
      return;
    }

    const shouldAutoConnect = !toolStatus?.whatsapp.authenticated
      && !whatsAppQrText
      && !whatsAppAutoStarted
      && whatsAppState !== "connecting"
      && whatsAppState !== "installing";

    if (!shouldAutoConnect) return;

    setWhatsAppAutoStarted(true);
    setWhatsAppState("connecting");

    connectWhatsApp(false).catch((e) => {
      setWhatsAppState("waiting");
      setError(e instanceof Error ? e.message : messages.settings.errors.updateWhatsApp);
    });
  }, [config, connectWhatsApp, messages.settings.errors.updateWhatsApp, toolStatus, whatsAppAutoStarted, whatsAppQrText, whatsAppState]);

  // Auto-open QR modal when QR appears, auto-close when connected
  useEffect(() => {
    if (whatsAppQrText) setShowWhatsAppQrModal(true);
  }, [whatsAppQrText]);

  useEffect(() => {
    if (toolStatus?.whatsapp.authenticated) setShowWhatsAppQrModal(false);
  }, [toolStatus?.whatsapp.authenticated]);

  if (!config) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground text-sm">{error || messages.common.loading}</div>
      </div>
    );
  }

  /* ── derived integration states ── */

  const whatsappEnabled = !!config.dataSources.wacliDbPath;
  const emailEnabled = config.emailAccounts.length > 0;
  const calendarEnabled = (config.calendarAccounts || []).length > 0 && !(config.calendarAccounts || []).includes(NONE_CALENDARS_ID);
  const transcriptionEnabled = !!config.dataSources.transcriptionDbPath;
  const whatsappReady = !!toolStatus?.whatsapp.authenticated;
  const whatsAppQrImage = terminalQrToDataUri(whatsAppQrText);
  const emailOptions = toolStatus?.email.accounts || [];
  const selectedEmailIds = resolveSelectedEmailIds(config.emailAccounts, emailOptions);
  const allEmailSelected = config.emailAccounts.includes(ALL_EMAIL_ACCOUNTS_ID)
    || (emailOptions.length > 0 && selectedEmailIds.length === emailOptions.length);
  const calendarOptions = toolStatus?.calendar.calendars || [];
  const selectedCalendarIds = resolveSelectedCalendarIds(config.calendarAccounts || [], calendarOptions);
  const allCalendarSelected = (config.calendarAccounts || []).includes(ALL_CALENDARS_ID)
    || (calendarOptions.length > 0 && selectedCalendarIds.length === calendarOptions.length);

  const whatsappSyncing = !!toolStatus?.whatsapp.syncing;
  const whatsappStatus = !whatsappEnabled ? "disabled"
    : whatsAppState === "installing" ? "installing"
    : whatsAppState === "connecting" ? "connecting"
    : whatsappReady && whatsappSyncing ? "syncing"
    : whatsappReady ? "connected"
    : whatsAppQrText || whatsAppState === "pairing" ? "pairing" : "waiting";

  const emailStatus = !emailEnabled ? "disabled"
    : toolStatus?.email.available ? "connected" : "waiting";

  const calendarStatus = !calendarEnabled ? "disabled"
    : toolStatus?.calendar.available ? "connected" : "waiting";

  const transcriptionWhisperReady = !!(toolStatus?.transcription as { whisperCliAvailable?: boolean; whisperAvailable?: boolean })?.whisperCliAvailable
    || !!(toolStatus?.transcription as { whisperCliAvailable?: boolean; whisperAvailable?: boolean })?.whisperAvailable;
  const transcriptionStatus = !transcriptionEnabled ? "disabled"
    : transcriptionWhisperReady ? "connected" : "waiting";
  const selectedTtsProviderId = (config.tts?.provider || "local") as TtsProvider;
  const selectedTtsProvider = ttsCatalog?.providers.find((provider) => provider.id === selectedTtsProviderId) ?? null;
  const ttsProviderLabel = ttsCatalog?.providers.find((provider) => provider.id === selectedTtsProviderId)?.label
    ?? selectedTtsProviderId;
  const ttsConfigMissingApiKey = !!selectedTtsProvider?.requiresApiKey && !config.tts?.apiKey?.trim();
  const ttsProviderOptions = (ttsCatalog?.providers ?? []).map((provider) => ({
    value: provider.id,
    label: provider.label,
  }));

  const telegramEnabled = !!config.telegram?.enabled;
  const telegramConnected = !!toolStatus?.telegram.botConnected;
  const telegramStatus: "connected" | "disabled" | "waiting" = !telegramEnabled ? "disabled"
    : telegramConnected ? "connected" : "waiting";

  const slackEnabled = !!config.slack?.enabled;
  const slackStatus = !slackEnabled ? "disabled" as const
    : toolStatus?.slack.botConnected ? "connected" as const
    : "disabled" as const;

  const m = messages.onboarding.aiProvider;

  const tabs: { key: Tab; label: string }[] = [
    { key: "general", label: messages.settings.tabs.general },
    { key: "profile", label: messages.settings.tabs.profile },
    { key: "persona", label: messages.settings.tabs.persona },
    { key: "tools", label: messages.settings.tabs.tools },
    { key: "integrations", label: messages.settings.tabs.integrations },
    { key: "openclaw", label: messages.settings.tabs.openclaw },
    { key: "ai", label: messages.settings.tabs.ai },
    { key: "advanced", label: messages.settings.tabs.advanced },
  ];

  const updateTtsConfigField = (
    field: TtsConfigFieldDescriptor,
    rawValue: string | number | boolean,
  ) => {
    updateConfig((current) => {
      const nextTts: TtsProviderConfig = {
        ...(current.tts ?? {}),
        provider: (current.tts?.provider || "local") as TtsProvider,
      };

      if (field.key === "speed" || field.key === "stability" || field.key === "similarityBoost") {
        const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);
        nextTts[field.key] = Number.isFinite(parsed) ? parsed : undefined;
      } else if (field.key === "enabled" || field.key === "autoRead") {
        nextTts[field.key] = Boolean(rawValue);
      } else {
        nextTts[field.key] = String(rawValue);
      }

      return {
        ...current,
        tts: nextTts as UserConfig["tts"],
      };
    });
  };

  const renderTtsField = (provider: TtsProviderDescriptor, field: TtsConfigFieldDescriptor) => {
    const rawValue = config.tts?.[field.key];
    const fallbackValue = field.defaultValue;
    const currentValue = rawValue ?? fallbackValue ?? "";
    const key = `${provider.id}-${field.key}`;

    if (field.type === "password" || field.type === "text") {
      return (
        <SettingField key={key} label={field.label}>
          <input
            type={field.type === "password" ? "password" : "text"}
            value={typeof currentValue === "string" ? currentValue : String(currentValue)}
            onChange={(e) => updateTtsConfigField(field, e.target.value)}
            placeholder={field.placeholder}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors"
          />
        </SettingField>
      );
    }

    if (field.type === "select") {
      return (
        <SettingField key={key} label={field.label}>
          <SelectInput
            value={String(currentValue)}
            onChange={(value) => updateTtsConfigField(field, value)}
            options={(field.options ?? []).map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
        </SettingField>
      );
    }

    if (field.type === "number") {
      return (
        <SettingField key={key} label={field.label}>
          <input
            type="number"
            value={typeof currentValue === "number" ? String(currentValue) : String(currentValue || "")}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={(e) => updateTtsConfigField(field, e.target.value)}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors"
          />
        </SettingField>
      );
    }

    return null;
  };


  return (
    <div className="h-full overflow-y-auto bg-background" style={{ scrollbarGutter: "stable" }} data-testid="settings-page">
      {/* Header area */}
      <div className="max-w-3xl mx-auto px-6 pt-10 pb-2">
        {/* Back + save row */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 text-tertiary-foreground hover:text-foreground transition-all text-[13px]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {messages.nav.back}
          </button>
          <div className="flex items-center gap-3">
            {saving && <span className="text-tertiary-foreground text-xs">{messages.common.saving}</span>}
            {error && <span className="text-amber-600 text-xs">{error}</span>}
          </div>
        </div>

        {/* Large title */}
        <h1
          className="text-3xl font-light text-foreground tracking-tight mb-8"
        >
          {messages.settings.title}
        </h1>

        {/* Segmented pill selector */}
        <div className="inline-flex bg-muted rounded-xl p-1 mb-10">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              data-testid={`settings-tab-${t.key}`}
              className={`px-3 py-1.5 rounded-[10px] text-[12.5px] whitespace-nowrap transition-all ${
                tab === t.key
                  ? "bg-card text-foreground font-medium shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                  : "text-tertiary-foreground hover:text-strong-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 pb-16">

        {/* ── GENERAL TAB ─────────────────────────────────────────── */}
        {tab === "general" && (
          <div className="space-y-4">
            {/* Language card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="px-4 py-4">
                <SettingField
                  label={messages.settings.language.selectorLabel}
                  hint={messages.settings.language.help}
                >
                  <select
                    value={locale}
                    onChange={(e) => { void applyLocale(e.currentTarget.value as Locale); }}
                    data-testid="settings-locale-select"
                    className="w-full max-w-xs bg-card border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors"
                  >
                    {languageOptions.map((option) => (
                      <option key={option.code} value={option.code}>{option.label}</option>
                    ))}
                  </select>
                </SettingField>
              </div>
            </div>

            {/* Theme card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="px-4 py-4">
                <SettingField
                  label={localized(locale, { en: "Theme", es: "Tema", fr: "Thème", it: "Tema", de: "Design", pt: "Tema" })}
                  hint={localized(locale, { en: "Choose light, dark, or match your system", es: "Elige claro, oscuro, o sigue tu sistema", fr: "Choisissez clair, sombre ou selon votre système", it: "Scegli chiaro, scuro o in base al sistema", de: "Wähle hell, dunkel oder passend zum System", pt: "Escolha claro, escuro ou de acordo com o sistema" })}
                >
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.currentTarget.value as "light" | "dark" | "system")}
                    className="w-full max-w-xs bg-card border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors"
                  >
                    <option value="system">{localized(locale, { en: "System", es: "Sistema", fr: "Système", it: "Sistema", de: "System", pt: "Sistema" })}</option>
                    <option value="light">{localized(locale, { en: "Light", es: "Claro", fr: "Clair", it: "Chiaro", de: "Hell", pt: "Claro" })}</option>
                    <option value="dark">{localized(locale, { en: "Dark", es: "Oscuro", fr: "Sombre", it: "Scuro", de: "Dunkel", pt: "Escuro" })}</option>
                  </select>
                </SettingField>
              </div>
            </div>

            {/* Reset card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <p className="text-xs font-medium text-strong-foreground">{messages.settings.general.resetAction}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{messages.settings.general.resetModalDescription}</p>
                </div>
                <button
                  type="button"
                  data-testid="reset-workspace-button"
                  onClick={() => setShowResetModal(true)}
                  className="h-8 shrink-0 rounded-lg border border-border px-3.5 text-xs font-medium text-strong-foreground hover:bg-muted hover:border-border-hover transition-colors"
                >
                  {messages.settings.general.resetAction}
                </button>
              </div>
            </div>

            {showResetModal && (() => {
              // openClawUninstall is opt-in only, excluded from select-all logic
              const { openClawUninstall: _ocu, ...safeOptions } = resetOptions;
              const allSelected = Object.values(safeOptions).every(Boolean);
              const noneSelected = Object.values(resetOptions).every(v => !v);
              const rc = messages.settings.general.resetCategories;
              const categories = [
                { key: "conversations" as const, label: rc.conversations, desc: rc.conversationsDesc },
                { key: "profile" as const, label: rc.profile, desc: rc.profileDesc },
                { key: "contextFiles" as const, label: rc.contextFiles, desc: rc.contextFilesDesc },
                { key: "transcriptions" as const, label: rc.transcriptions, desc: rc.transcriptionsDesc },
                { key: "whatsappData" as const, label: rc.whatsappData, desc: rc.whatsappDataDesc },
                { key: "whatsappCli" as const, label: rc.whatsappCli, desc: rc.whatsappCliDesc },
                { key: "emailAccounts" as const, label: rc.emailAccounts, desc: rc.emailAccountsDesc },
                { key: "calendarAccounts" as const, label: rc.calendarAccounts, desc: rc.calendarAccountsDesc },
                { key: "openClawWorkspace" as const, label: rc.openClawWorkspace, desc: rc.openClawWorkspaceDesc },
                { key: "openClawUninstall" as const, label: rc.openClawUninstall, desc: rc.openClawUninstallDesc },
                { key: "settings" as const, label: rc.settings, desc: rc.settingsDesc },
              ];
              return (
                <>
                  <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => !resettingWorkspace && setShowResetModal(false)} />
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !resettingWorkspace && setShowResetModal(false)}>
                    <div
                      className="mx-4 w-full max-w-[400px] rounded-xl border border-border bg-card px-7 py-6 shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
                      style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h3 className="text-[16px] font-semibold text-foreground mb-1">
                        {messages.settings.general.resetModalTitle}
                      </h3>
                      <p className="text-[13px] leading-relaxed text-tertiary-foreground mb-4">
                        {messages.settings.general.resetModalDescription}
                      </p>

                      <label className="flex items-center gap-3 px-3 py-2 mb-1 rounded-lg cursor-pointer hover:bg-background transition-colors">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => {
                            const next = !allSelected;
                            setResetOptions(prev => ({ conversations: next, profile: next, contextFiles: next, transcriptions: next, settings: next, whatsappData: next, whatsappCli: next, emailAccounts: next, calendarAccounts: next, openClawWorkspace: next, openClawUninstall: prev.openClawUninstall }));
                          }}
                          className="sr-only"
                        />
                        <div className={`w-[15px] h-[15px] rounded-[4px] border-[1.5px] flex items-center justify-center shrink-0 transition-all duration-150 ${
                          allSelected ? "bg-foreground border-foreground" : "bg-card border-muted-foreground"
                        }`}>
                          {allSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />}
                        </div>
                        <span className="text-[13px] font-medium text-foreground">{messages.settings.general.resetSelectAll}</span>
                      </label>

                      <div className="border-t border-border mb-1" />

                      <div className="max-h-[340px] overflow-y-auto">
                        {categories.map(({ key, label, desc }) => (
                          <label key={key} className="flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-background transition-colors">
                            <input
                              type="checkbox"
                              checked={resetOptions[key]}
                              onChange={() => setResetOptions(prev => ({ ...prev, [key]: !prev[key] }))}
                              className="sr-only"
                            />
                            <div className={`mt-[3px] w-[15px] h-[15px] rounded-[4px] border-[1.5px] flex items-center justify-center shrink-0 transition-all duration-150 ${
                              resetOptions[key] ? "bg-foreground border-foreground" : "bg-card border-muted-foreground"
                            }`}>
                              {resetOptions[key] && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />}
                            </div>
                            <div>
                              <p className="text-[13px] font-medium text-foreground leading-tight">{label}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
                            </div>
                          </label>
                        ))}
                      </div>

                      <p className="text-[11px] text-muted-foreground mt-3 px-1 leading-relaxed">
                        {localized(locale, {
                          en: "Data already sent to AI providers during chat sessions cannot be deleted from their systems.",
                          es: "Los datos ya enviados a proveedores de IA durante las sesiones no pueden eliminarse de sus sistemas.",
                          fr: "Les données déjà envoyées aux fournisseurs d'IA pendant les sessions de chat ne peuvent pas être supprimées de leurs systèmes.",
                          it: "I dati già inviati ai fornitori di IA durante le sessioni di chat non possono essere eliminati dai loro sistemi.",
                          de: "Daten, die während Chat-Sitzungen bereits an KI-Anbieter gesendet wurden, können nicht aus deren Systemen gelöscht werden.",
                          pt: "Os dados já enviados a fornecedores de IA durante as sessões de chat não podem ser eliminados dos respetivos sistemas.",
                        })}
                      </p>

                      <div className="flex gap-2.5 justify-end mt-4">
                        <button
                          type="button"
                          onClick={() => setShowResetModal(false)}
                          disabled={resettingWorkspace}
                          data-testid="reset-workspace-cancel"
                          className="px-4 py-2 rounded-xl border border-border text-sm text-strong-foreground hover:bg-card transition-colors disabled:opacity-50"
                        >
                          {messages.settings.general.resetModalCancel}
                        </button>
                        <button
                          type="button"
                          onClick={() => { void resetWorkspace(); }}
                          disabled={resettingWorkspace || noneSelected}
                          data-testid="reset-workspace-confirm"
                          className="px-4 py-2 rounded-xl bg-foreground text-sm text-primary-foreground hover:bg-foreground-intense transition-colors disabled:opacity-50"
                        >
                          {resettingWorkspace
                            ? messages.settings.general.resetBusy
                            : allSelected
                              ? messages.settings.general.resetModalConfirmAll
                              : messages.settings.general.resetModalConfirm}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ── OPENCLAW TAB ──────────────────────────────────────── */}
        {tab === "openclaw" && (() => {
          const oc = toolStatus?.openClaw;
          const isReady = !!oc?.ready;
          const ocEnabled = openClawEnabled !== false;
          const anyBusy = openClawRefreshing || openClawRestarting || openClawReinstalling || openClawUninstalling;
          const adapterList = toolStatus?.adapters ?? [];
          const adapterMessages = messages.settings.adapters;
          const activeAdapterId = bootstrapData?.localSettings?.activeAdapter || "openclaw";
          return (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground mb-4">
              {adapterMessages.intro}
            </p>

            {/* ── Unified adapters list (radio selection) ── */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              {adapterList.map((adapter, i) => {
                const adapterKey = adapter.id as keyof typeof adapterMessages;
                const meta = (adapterMessages[adapterKey] ?? { name: adapter.runtimeName, hint: "" }) as { name: string; hint: string };
                const isOpenClaw = adapter.id === "openclaw";
                const isInstalled = isOpenClaw ? !!oc?.cliAvailable : adapter.cliAvailable;
                const isSelected = activeAdapterId === adapter.id;
                const isBusy = !!adapterBusy[adapter.id];
                const statusLabel = adapter.recommended ? adapterMessages.recommended : adapterMessages.experimental;
                return (
                  <div key={adapter.id} className={i < adapterList.length - 1 ? "border-b border-border" : ""}>
                    {/* ── Row: click to select ── */}
                    <div
                      data-testid={`adapter-${adapter.id}-card`}
                      className={`flex items-center gap-3.5 px-4 py-3.5 transition-colors ${
                        !isBusy ? "cursor-pointer hover:bg-accent" : ""
                      } ${isSelected ? "bg-accent" : ""}`}
                      onClick={isBusy ? undefined : async () => {
                        if (isSelected) return;
                        // Select this adapter
                        await fetch("/api/config/local", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ activeAdapter: adapter.id }),
                        });
                        updateBootstrapData((current) => ({
                          ...current,
                          localSettings: { ...current.localSettings, activeAdapter: adapter.id },
                        }));
                        // If not installed, install it
                        if (!isInstalled) {
                          setAdapterBusy((prev) => ({ ...prev, [adapter.id]: "installing" }));
                          setAdapterProgress((prev) => ({ ...prev, [adapter.id]: { message: adapterMessages.installing, percent: 0 } }));
                          try {
                            const res = await fetch("/api/integrations/install-stream", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ adapter: adapter.id, operation: "install" }),
                            });
                            if (res.body) {
                              const reader = res.body.getReader();
                              const decoder = new TextDecoder();
                              let buf = "";
                              while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                buf += decoder.decode(value, { stream: true });
                                const lines = buf.split("\n\n");
                                buf = lines.pop() ?? "";
                                for (const line of lines) {
                                  const dataLine = line.replace(/^data: /, "").trim();
                                  if (!dataLine) continue;
                                  try {
                                    const ev = JSON.parse(dataLine);
                                    setAdapterProgress((prev) => ({ ...prev, [adapter.id]: { message: ev.message || "", percent: ev.percent || 0 } }));
                                  } catch { /* ignore */ }
                                }
                              }
                            }
                          } finally {
                            setAdapterBusy((prev) => { const next = { ...prev }; delete next[adapter.id]; return next; });
                            setAdapterProgress((prev) => { const next = { ...prev }; delete next[adapter.id]; return next; });
                          }
                        }
                        await refreshToolStatus();
                        flashSaved();
                      }}
                    >
                      {/* Icon */}
                      <div className="relative flex-shrink-0">
                        <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center ${
                          isSelected ? "bg-muted text-muted-foreground" : "bg-muted text-tertiary-foreground"
                        }`}>
                          {isOpenClaw
                            ? <svg width="17" height="17" viewBox="0 0 120 120" fill="currentColor"><path d="M60 10C30 10 15 35 15 55C15 75 30 95 45 100L45 110L55 110L55 100C55 100 60 102 65 100L65 110L75 110L75 100C90 95 105 75 105 55C105 35 90 10 60 10Z"/><path d="M20 45C5 40 0 50 5 60C10 70 20 65 25 55C28 48 25 45 20 45Z"/><path d="M100 45C115 40 120 50 115 60C110 70 100 65 95 55C92 48 95 45 100 45Z"/><path d="M45 15Q35 5 30 8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><path d="M75 15Q85 5 90 8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><circle cx="45" cy="35" r="6" fill="currentColor" opacity="0.3"/><circle cx="75" cy="35" r="6" fill="currentColor" opacity="0.3"/></svg>
                            : <img src={`/runtimes/${adapter.id}.png`} alt={meta.name} width={17} height={17} className="rounded-sm grayscale" />
                          }
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${
                          isBusy ? "bg-sky-500" : isSelected ? "bg-emerald-400" : isInstalled ? "bg-muted-foreground" : "bg-muted"
                        }`} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[13px] font-medium ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>{meta.name}</span>
                          {isSelected && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-foreground/[0.06] text-[10px] font-medium text-muted-foreground">
                              {messages.settings.openclaw.statusActive || "Active"}
                            </span>
                          )}
                          {!isSelected && isInstalled && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                              {adapterMessages.installed}
                            </span>
                          )}
                          {!isInstalled && !isBusy && (
                            <span className="text-[10px] text-muted-foreground">{statusLabel}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{meta.hint}</p>
                      </div>

                      {/* Spinner when busy */}
                      {isBusy && (
                        <svg className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                      )}

                      {/* Radio indicator */}
                      <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <div className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-colors ${
                          isSelected ? "border-foreground" : "border-muted"
                        }`}>
                          {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-foreground" />}
                        </div>
                      </div>
                    </div>

                    {/* ── Progress bar during install/uninstall ── */}
                    {adapterBusy[adapter.id] && adapterProgress[adapter.id] && (
                      <div className="px-4 py-3 border-t border-border bg-accent">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-3.5 h-3.5 animate-spin text-sky-500 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                          </svg>
                          <span className="text-[11px] text-muted-foreground">{adapterProgress[adapter.id]!.message}</span>
                        </div>
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-sky-500 rounded-full transition-all duration-300"
                            style={{ width: `${Math.max(5, adapterProgress[adapter.id]!.percent)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* ── OpenClaw inline expanded details ── */}
                    {isOpenClaw && isSelected && ocEnabled && (
                      <>
                        {/* Status chips */}
                        <div className="flex flex-wrap gap-1.5 px-4 py-3.5 border-t border-border">
                    {[
                      { ok: !!oc?.cliAvailable, label: messages.settings.openclaw.cli },
                      { ok: !!oc?.agentConfigured, label: messages.settings.openclaw.agent },
                      { ok: !!oc?.modelConfigured, label: messages.settings.openclaw.model },
                      { ok: !!oc?.authConfigured, label: messages.settings.openclaw.auth },
                    ].map((item) => (
                      <span
                        key={item.label}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium ${
                          item.ok
                            ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400"
                            : "bg-card text-muted-foreground border border-border"
                        }`}
                      >
                        {item.ok ? (
                          <Check size={12} strokeWidth={2.5} />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                        )}
                        {item.label}
                      </span>
                    ))}
                  </div>

                  {/* Error if any */}
                  {oc?.lastError && (
                    <div className="px-4 py-3 border-b border-border bg-amber-50/30 dark:bg-amber-950/30 flex items-start gap-2">
                      <AlertCircle size={13} className="text-amber-500 mt-px flex-shrink-0" />
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">{oc.lastError}</p>
                    </div>
                  )}

                  {/* Metadata */}
                  {(oc?.context || oc?.version || oc?.defaultModel) && (
                    <div className="border-b border-border">
                      <div className="px-4 pt-3 pb-1.5">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{messages.settings.openclaw.details}</span>
                      </div>
                      {[
                        ...(oc?.version ? [{ label: messages.settings.openclaw.version, value: oc.version, copyable: false, mono: false, versionStatus: oc.latestVersion && oc.version !== oc.latestVersion ? "update" as const : oc.latestVersion ? "current" as const : null }] : []),
                        ...(oc?.defaultModel ? [{ label: messages.settings.openclaw.defaultModelLabel, value: oc.defaultModel, copyable: false, mono: true }] : []),
                        ...(oc?.context ? [
                          { label: messages.settings.openclaw.agentId, value: oc.context.agentName ? `${oc.context.agentName} (${oc.context.agentId})` : oc.context.agentId, copyable: false, mono: true },
                          { label: messages.settings.openclaw.workspace, value: oc.context.workspaceDir, copyable: true, mono: true },
                          { label: messages.settings.openclaw.stateDir, value: oc.context.stateDir, copyable: true, mono: true },
                        ] : []),
                      ].map((meta) => (
                        <div
                          key={meta.label}
                          className={`px-4 py-2 flex items-baseline gap-3 ${meta.copyable ? "cursor-pointer hover:bg-background transition-colors" : ""}`}
                          onClick={meta.copyable ? () => {
                            navigator.clipboard.writeText(meta.value);
                            setOpenClawCopied(meta.label);
                            setTimeout(() => setOpenClawCopied(null), 1500);
                          } : undefined}
                        >
                          <span className="text-[11px] text-muted-foreground w-[76px] flex-shrink-0">{meta.label}</span>
                          {openClawCopied === meta.label ? (
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">{messages.settings.openclaw.copied}</span>
                          ) : (
                            <span className={`text-[11px] text-foreground truncate flex-1 ${meta.mono ? "font-mono" : ""} flex items-center gap-2`}>
                              {meta.value}
                              {"versionStatus" in meta && meta.versionStatus === "current" && (
                                <span className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded-full">{messages.settings.openclaw.upToDate}</span>
                              )}
                              {"versionStatus" in meta && meta.versionStatus === "update" && (
                                <button
                                  onClick={() => setShowOpenClawUpdateModal(true)}
                                  className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors flex items-center gap-1.5"
                                >
                                  <Download size={11} />
                                  {messages.settings.openclaw.updateAvailable} ({oc?.latestVersion})
                                </button>
                              )}
                            </span>
                          )}
                        </div>
                      ))}
                      <div className="h-1.5" />
                    </div>
                  )}

                  {/* Actions row 1 */}
                  <div className="flex gap-2 px-4 pt-3.5 pb-2">
                    <button
                      disabled={anyBusy}
                      onClick={async () => {
                        setOpenClawRefreshing(true);
                        try {
                          await refreshToolStatus();
                          flashSaved();
                        } finally {
                          setOpenClawRefreshing(false);
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-border rounded-xl text-[12px] font-medium text-foreground hover:bg-background transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={13} className={`text-tertiary-foreground ${openClawRefreshing ? "animate-spin" : ""}`} />
                      {openClawRefreshing ? messages.settings.openclaw.refreshing : messages.settings.openclaw.refresh}
                    </button>
                    <button
                      disabled={anyBusy}
                      onClick={async () => {
                        setOpenClawRestarting(true);
                        try {
                          await fetch("/api/integrations/setup", { method: "POST" });
                          await refreshToolStatus();
                          flashSaved();
                        } finally {
                          setOpenClawRestarting(false);
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-border rounded-xl text-[12px] font-medium text-foreground hover:bg-background transition-colors disabled:opacity-50"
                    >
                      <RotateCcw size={13} className={`text-tertiary-foreground ${openClawRestarting ? "animate-spin" : ""}`} />
                      {openClawRestarting ? messages.settings.openclaw.restarting : messages.settings.openclaw.restart}
                    </button>
                  </div>

                  {/* Actions row 2 */}
                  <div className="flex gap-2 px-4 pb-3.5">
                    <button
                      disabled={!oc?.context?.workspaceDir}
                      onClick={() => {
                        if (oc?.context?.workspaceDir) {
                          fetch("/api/integrations/reveal", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ path: oc.context.workspaceDir }),
                          });
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-border rounded-xl text-[12px] font-medium text-foreground hover:bg-background transition-colors disabled:opacity-50"
                    >
                      <FolderOpen size={13} className="text-tertiary-foreground" />
                      {messages.settings.openclaw.openWorkspace}
                    </button>
                    <button
                      disabled={anyBusy}
                      onClick={() => setShowOpenClawUninstallModal(true)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-red-200 dark:border-red-800 rounded-xl text-[12px] font-medium text-red-400 hover:bg-red-50/50 dark:hover:bg-red-950/50 transition-colors disabled:opacity-50"
                    >
                      <Trash2 size={13} />
                      {openClawUninstalling ? messages.settings.openclaw.uninstalling : messages.settings.openclaw.uninstall}
                    </button>
                  </div>
                      </>
                    )}

                    {/* ── Non-OpenClaw inline expanded details ── */}
                    {!isOpenClaw && isSelected && isInstalled && (
                      <>
                        {/* Capability chips */}
                        <div className="flex flex-wrap gap-1.5 px-4 py-3 border-t border-border">
                          {[
                            ...(adapter.providers.length > 0 ? [{ ok: true, label: `${adapterMessages.capProviders} (${adapter.providers.length})` }] : []),
                            ...(adapter.channels.length > 0 ? [{ ok: true, label: `${adapterMessages.capChannels} (${adapter.channels.length})` }] : []),
                            ...(adapter.hasScheduler ? [{ ok: true, label: adapterMessages.capScheduler }] : []),
                            ...(adapter.hasMemory ? [{ ok: true, label: adapterMessages.capMemory }] : []),
                            ...(adapter.hasSandbox ? [{ ok: true, label: adapterMessages.capSandbox }] : []),
                            ...(adapter.hasGateway ? [{ ok: true, label: adapterMessages.capGateway }] : []),
                          ].map((item) => (
                            <span
                              key={item.label}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              {item.label}
                            </span>
                          ))}
                        </div>

                        {/* Metadata rows */}
                        <div className="border-t border-border">
                          {adapter.version && (
                            <div className="px-4 py-2 flex items-baseline gap-3">
                              <span className="text-[11px] text-muted-foreground w-[76px] flex-shrink-0">{adapterMessages.versionLabel}</span>
                              <span className="text-[11px] text-foreground font-mono">{adapter.version}</span>
                            </div>
                          )}
                          {adapter.providers.length > 0 && (
                            <div className="px-4 py-2 flex items-baseline gap-3">
                              <span className="text-[11px] text-muted-foreground w-[76px] flex-shrink-0">{adapterMessages.capProviders}</span>
                              <span className="text-[11px] text-foreground">{adapter.providers.map((p) => p.label).join(", ")}</span>
                            </div>
                          )}
                          {adapter.channels.length > 0 && (
                            <div className="px-4 py-2 flex items-baseline gap-3">
                              <span className="text-[11px] text-muted-foreground w-[76px] flex-shrink-0">{adapterMessages.capChannels}</span>
                              <span className="text-[11px] text-foreground">{adapter.channels.map((c) => c.label).join(", ")}</span>
                            </div>
                          )}
                          {adapter.workspaceFiles.length > 0 && (
                            <div className="px-4 py-2 flex items-baseline gap-3">
                              <span className="text-[11px] text-muted-foreground w-[76px] flex-shrink-0">{adapterMessages.workspaceFiles}</span>
                              <span className="text-[11px] text-foreground font-mono">{adapter.workspaceFiles.join(", ")}</span>
                            </div>
                          )}
                          <div className="h-1" />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 px-4 py-3 border-t border-border">
                          <button
                            onClick={async () => {
                              setAdapterBusy((prev) => ({ ...prev, [adapter.id]: "installing" }));
                              try { await refreshToolStatus(); flashSaved(); } finally {
                                setAdapterBusy((prev) => { const next = { ...prev }; delete next[adapter.id]; return next; });
                              }
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-border rounded-xl text-[12px] font-medium text-foreground hover:bg-background transition-colors"
                          >
                            <RefreshCw size={13} className="text-tertiary-foreground" />
                            {messages.settings.openclaw.refresh}
                          </button>
                          <button
                            disabled={!!adapterBusy[adapter.id]}
                            onClick={async () => {
                              setAdapterBusy((prev) => ({ ...prev, [adapter.id]: "uninstalling" }));
                              setAdapterProgress((prev) => ({ ...prev, [adapter.id]: { message: adapterMessages.uninstalling, percent: 0 } }));
                              try {
                                const res = await fetch("/api/integrations/install-stream", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ adapter: adapter.id, operation: "uninstall" }),
                                });
                                if (res.body) {
                                  const reader = res.body.getReader();
                                  const decoder = new TextDecoder();
                                  let buf = "";
                                  while (true) {
                                    const { done, value } = await reader.read();
                                    if (done) break;
                                    buf += decoder.decode(value, { stream: true });
                                    const lines = buf.split("\n\n");
                                    buf = lines.pop() ?? "";
                                    for (const line of lines) {
                                      const dataLine = line.replace(/^data: /, "").trim();
                                      if (!dataLine) continue;
                                      try {
                                        const ev = JSON.parse(dataLine);
                                        setAdapterProgress((prev) => ({ ...prev, [adapter.id]: { message: ev.message || "", percent: ev.percent || 0 } }));
                                      } catch { /* ignore */ }
                                    }
                                  }
                                }
                                await refreshToolStatus();
                                flashSaved();
                              } finally {
                                setAdapterBusy((prev) => { const next = { ...prev }; delete next[adapter.id]; return next; });
                                setAdapterProgress((prev) => { const next = { ...prev }; delete next[adapter.id]; return next; });
                              }
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-red-200 dark:border-red-800 rounded-xl text-[12px] font-medium text-red-400 hover:bg-red-50/50 dark:hover:bg-red-950/50 transition-colors disabled:opacity-50"
                          >
                            <Trash2 size={13} />
                            {messages.settings.openclaw.uninstall}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Uninstall confirmation modal */}
            {/* Update confirmation modal */}
            {showOpenClawUpdateModal && (
              <>
                <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setShowOpenClawUpdateModal(false)} />
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <div className="bg-card rounded-2xl shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
                    <h3 className="text-[15px] font-semibold text-foreground mb-2">{messages.settings.openclaw.updateTitle}</h3>
                    <p className="text-[13px] text-muted-foreground leading-relaxed mb-5">
                      {messages.settings.openclaw.updateDescription
                        .replace("{current}", oc?.version || "?")
                        .replace("{latest}", oc?.latestVersion || "?")}
                    </p>
                    <div className="flex gap-2.5 justify-end">
                      <button
                        onClick={() => setShowOpenClawUpdateModal(false)}
                        disabled={openClawReinstalling}
                        className="px-4 py-2 rounded-xl border border-border text-sm text-strong-foreground hover:bg-card transition-colors disabled:opacity-50"
                      >
                        {messages.settings.openclaw.updateCancel}
                      </button>
                      <button
                        disabled={openClawReinstalling}
                        onClick={async () => {
                          setOpenClawReinstalling(true);
                          try {
                            await fetch("/api/integrations/install", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ package: "openclaw" }),
                            });
                            await fetch("/api/integrations/setup", { method: "POST" });
                            await refreshToolStatus();
                            setShowOpenClawUpdateModal(false);
                            flashSaved();
                          } finally {
                            setOpenClawReinstalling(false);
                          }
                        }}
                        className="px-4 py-2 rounded-xl bg-foreground text-sm text-primary-foreground hover:bg-foreground-intense transition-colors disabled:opacity-50"
                      >
                        {openClawReinstalling ? messages.settings.openclaw.reinstalling : messages.settings.openclaw.updateConfirm}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {showOpenClawUninstallModal && (
              <>
                <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setShowOpenClawUninstallModal(false)} />
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <div className="bg-card rounded-2xl shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
                    <h3 className="text-[15px] font-semibold text-foreground mb-2">{messages.settings.openclaw.uninstallTitle}</h3>
                    <p className="text-[13px] text-muted-foreground leading-relaxed mb-5">{messages.settings.openclaw.uninstallWarning}</p>
                    <div className="flex gap-2.5 justify-end">
                      <button
                        onClick={() => setShowOpenClawUninstallModal(false)}
                        disabled={openClawUninstalling}
                        className="px-4 py-2 rounded-xl border border-border text-sm text-strong-foreground hover:bg-card transition-colors disabled:opacity-50"
                      >
                        {messages.settings.openclaw.uninstallCancel}
                      </button>
                      <button
                        disabled={openClawUninstalling}
                        onClick={async () => {
                          setOpenClawUninstalling(true);
                          try {
                            const res = await fetch("/api/integrations/uninstall", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ package: "openclaw" }),
                            });
                            const data = await res.json();
                            if (!res.ok || !data.success) {
                              setError(data.error || "Failed to uninstall OpenClaw");
                              setShowOpenClawUninstallModal(false);
                              return;
                            }
                            await refreshToolStatus();
                            setShowOpenClawUninstallModal(false);
                            flashSaved();
                          } catch {
                            setError("Failed to uninstall OpenClaw");
                            setShowOpenClawUninstallModal(false);
                          } finally {
                            setOpenClawUninstalling(false);
                          }
                        }}
                        className="px-4 py-2 rounded-xl bg-red-500 text-sm text-primary-foreground hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        {openClawUninstalling ? messages.settings.openclaw.uninstalling : messages.settings.openclaw.uninstallConfirm}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {showOpenClawDisableModal && (
              <>
                <div className="fixed inset-0 bg-black/30 z-50" onClick={() => !openClawDisabling && setShowOpenClawDisableModal(false)} />
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <div className="bg-card rounded-2xl shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
                    <h3 className="text-[15px] font-semibold text-foreground mb-2">{messages.settings.openclaw.disableTitle}</h3>
                    <p className="text-[13px] text-muted-foreground leading-relaxed mb-5">{messages.settings.openclaw.disableWarning}</p>
                    <div className="flex gap-2.5 justify-end">
                      <button
                        onClick={() => setShowOpenClawDisableModal(false)}
                        disabled={openClawDisabling}
                        className="px-4 py-2 rounded-xl border border-border text-sm text-strong-foreground hover:bg-card transition-colors disabled:opacity-50"
                      >
                        {messages.settings.openclaw.disableCancel}
                      </button>
                      <button
                        disabled={openClawDisabling}
                        onClick={async () => {
                          setOpenClawDisabling(true);
                          try {
                            await fetch("/api/integrations/gateway", { method: "DELETE" });
                            setOpenClawEnabled(false);
                            updateBootstrapData((current) => ({
                              ...current,
                              localSettings: { ...current.localSettings, openClawEnabled: false },
                            }));
                            await fetch("/api/config/local", {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ openClawEnabled: false }),
                            });
                            await refreshToolStatus();
                            setShowOpenClawDisableModal(false);
                            flashSaved();
                          } finally {
                            setOpenClawDisabling(false);
                          }
                        }}
                        className="px-4 py-2 rounded-xl bg-red-500 text-sm text-primary-foreground hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        {messages.settings.openclaw.disableConfirm}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          );
        })()}

        {/* ── AI TAB ────────────────────────────────────────────── */}
        {tab === "ai" && (
          <div className="space-y-6">
            <p className="text-xs text-muted-foreground mb-4">
              {m.subtitle}
            </p>

            {(() => {
              const icons: Record<string, React.ReactNode> = {
                "openai-codex": <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M22.28 9.37a6.2 6.2 0 0 0-.54-5.1 6.29 6.29 0 0 0-6.78-3.02A6.23 6.23 0 0 0 10.28 0a6.29 6.29 0 0 0-6 4.35 6.22 6.22 0 0 0-4.15 3.02 6.29 6.29 0 0 0 .78 7.37 6.2 6.2 0 0 0 .54 5.1 6.29 6.29 0 0 0 6.78 3.02A6.23 6.23 0 0 0 13.72 24a6.29 6.29 0 0 0 6-4.35 6.22 6.22 0 0 0 4.15-3.02 6.29 6.29 0 0 0-.78-7.37ZM13.72 22.43a4.65 4.65 0 0 1-2.99-1.09l.17-.09 4.96-2.87a.81.81 0 0 0 .41-.7v-7l2.1 1.21a.07.07 0 0 1 .04.06v5.81a4.68 4.68 0 0 1-4.69 4.67ZM3.53 18.29a4.65 4.65 0 0 1-.56-3.13l.17.1 4.96 2.87a.81.81 0 0 0 .81 0l6.06-3.5v2.42a.08.08 0 0 1-.03.06l-5.02 2.9a4.68 4.68 0 0 1-6.39-1.72ZM2.27 7.89A4.65 4.65 0 0 1 4.7 5.84v5.9a.81.81 0 0 0 .41.7l6.06 3.5-2.1 1.21a.08.08 0 0 1-.07 0L3.99 14.3a4.68 4.68 0 0 1-1.72-6.4Zm17.17 4L13.38 8.4l2.1-1.21a.08.08 0 0 1 .07 0l5.01 2.9a4.68 4.68 0 0 1-.72 8.45v-5.96a.81.81 0 0 0-.4-.7Zm2.09-3.15-.17-.1-4.96-2.87a.81.81 0 0 0-.81 0l-6.06 3.5V6.85a.08.08 0 0 1 .03-.06l5.02-2.9a4.68 4.68 0 0 1 6.95 4.85ZM8.68 13.5l-2.1-1.21a.07.07 0 0 1-.04-.06V6.42a4.68 4.68 0 0 1 7.68-3.58l-.17.09-4.96 2.87a.81.81 0 0 0-.41.7v7Zm1.14-2.46L12 9.64l2.18 1.26v2.52L12 14.68l-2.18-1.26v-2.52Z" /></svg>,
                "google-gemini-cli": <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" /></svg>,
                anthropic: <svg width="17" height="17" viewBox="0 0 248 248" fill="currentColor"><path d="M52.43 162.87l46.35-25.99.77-2.28-.77-1.27h-2.29l-7.77-.47-26.49-.71-22.92-.95-22.29-1.18-5.6-1.18L6.2 121.87l.51-3.43 4.71-3.19 6.75.59 14.9 1.06 22.41 1.54 16.18.94 24.07 2.48h3.82l.51-1.54-1.27-.94-1.02-.95-23.18-15.72-25.09-16.54-13.12-9.57-7-4.84-3.57-4.49-1.53-9.93 6.37-6.99 8.66.59 2.16.59 8.79 6.74 18.72 14.53 24.45 17.96 3.57 2.95 1.44-.97.22-.68-1.66-2.72-13.24-23.99-14.14-24.46-6.37-10.16-1.65-6.03c-.65-2.53-1.02-4.62-1.02-7.2l7.26-9.93 4.07-1.3 9.81 1.3 4.07 3.54 6.12 13.94 9.81 21.86 15.28 29.77 4.46 8.86 2.42 8.15.89 2.48h1.53v-1.42l1.27-16.78 2.3-20.56 2.29-26.47.76-7.44 3.7-8.98 7.38-4.84 5.73 2.72 4.71 6.73-.64 4.37-2.8 18.2-5.48 28.47-3.57 19.14h2.04l2.42-2.48 9.68-12.76 16.17-20.32 7.14-8.04 8.4-8.86 5.35-3.25h10.19l7.39 11.11-3.31 11.46-10.44 13.23-8.66 11.22-12.42 16.64-7.69 13.38.69 1.1 1.86-.16 27.98-6.03 15.16-2.72 18.08-3.07 8.15 3.78.89 3.9-3.18 7.92-19.36 4.73-22.67 4.6-33.76 7.95-.37.3.44.65 15.22 1.38 6.5.35h15.92l29.67 2.25 7.77 5.08 4.58 6.26-.76 4.84-11.97 6.03-16.05-3.78-37.57-8.98-12.86-3.19h-1.78v1.06l10.7 10.52 19.74 17.72 24.58 22.92 1.27 5.67-3.18 4.49-3.31-.47-21.65-16.31-8.4-7.32-18.85-15.95h-1.27v1.65l4.33 6.38 23.05 34.62 1.15 10.63-1.66 3.43-5.98 2.13-6.5-1.18-13.62-19.02-13.88-21.27-11.21-19.14-1.35.85-6.67 71.22-3.06 3.66-7.13 2.72-5.98-4.49-3.18-7.33 3.18-14.53 3.82-18.9 3.06-15.01 2.8-18.67 1.71-6.24.15-.42-1.37.23-14.07 19.3-21.4 28.95-16.93 17.96-4.08 1.65-7-3.66-.64-6.5 3.95-5.79 23.43-29.77 14.14-18.55 9.11-10.65-.09-1.54-.5-.04-62.26 40.59-11.08 1.42-4.84-4.49.64-6.5 2.29-2.36 18.72-15.24Z" /></svg>,
                openai: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M22.28 9.37a6.2 6.2 0 0 0-.54-5.1 6.29 6.29 0 0 0-6.78-3.02A6.23 6.23 0 0 0 10.28 0a6.29 6.29 0 0 0-6 4.35 6.22 6.22 0 0 0-4.15 3.02 6.29 6.29 0 0 0 .78 7.37 6.2 6.2 0 0 0 .54 5.1 6.29 6.29 0 0 0 6.78 3.02A6.23 6.23 0 0 0 13.72 24a6.29 6.29 0 0 0 6-4.35 6.22 6.22 0 0 0 4.15-3.02 6.29 6.29 0 0 0-.78-7.37ZM13.72 22.43a4.65 4.65 0 0 1-2.99-1.09l.17-.09 4.96-2.87a.81.81 0 0 0 .41-.7v-7l2.1 1.21a.07.07 0 0 1 .04.06v5.81a4.68 4.68 0 0 1-4.69 4.67ZM3.53 18.29a4.65 4.65 0 0 1-.56-3.13l.17.1 4.96 2.87a.81.81 0 0 0 .81 0l6.06-3.5v2.42a.08.08 0 0 1-.03.06l-5.02 2.9a4.68 4.68 0 0 1-6.39-1.72ZM2.27 7.89A4.65 4.65 0 0 1 4.7 5.84v5.9a.81.81 0 0 0 .41.7l6.06 3.5-2.1 1.21a.08.08 0 0 1-.07 0L3.99 14.3a4.68 4.68 0 0 1-1.72-6.4Zm17.17 4L13.38 8.4l2.1-1.21a.08.08 0 0 1 .07 0l5.01 2.9a4.68 4.68 0 0 1-.72 8.45v-5.96a.81.81 0 0 0-.4-.7Zm2.09-3.15-.17-.1-4.96-2.87a.81.81 0 0 0-.81 0l-6.06 3.5V6.85a.08.08 0 0 1 .03-.06l5.02-2.9a4.68 4.68 0 0 1 6.95 4.85ZM8.68 13.5l-2.1-1.21a.07.07 0 0 1-.04-.06V6.42a4.68 4.68 0 0 1 7.68-3.58l-.17.09-4.96 2.87a.81.81 0 0 0-.41.7v7Zm1.14-2.46L12 9.64l2.18 1.26v2.52L12 14.68l-2.18-1.26v-2.52Z" /></svg>,
                google: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" /></svg>,
                deepseek: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z" /></svg>,
                mistral: <svg width="17" height="17" viewBox="0 0 24 24"><path d="M3.428 3.4h3.429v3.428H3.428V3.4zm13.714 0h3.43v3.428h-3.43V3.4z" fill="currentColor"/><path d="M3.428 6.828h6.857v3.429H3.429V6.828zm10.286 0h6.857v3.429h-6.857V6.828z" fill="currentColor" opacity=".6"/><path d="M3.428 10.258h17.144v3.428H3.428v-3.428z" fill="currentColor"/><path d="M3.428 13.686h3.429v3.428H3.428v-3.428zm6.858 0h3.429v3.428h-3.429v-3.428zm6.856 0h3.43v3.428h-3.43v-3.428z" fill="currentColor" opacity=".6"/><path d="M0 17.114h10.286v3.429H0v-3.429zm13.714 0H24v3.429H13.714v-3.429z" fill="currentColor"/></svg>,
                xai: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd"><path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815" /></svg>,
                groq: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd"><path d="M12.036 2c-3.853-.035-7 3-7.036 6.781-.035 3.782 3.055 6.872 6.908 6.907h2.42v-2.566h-2.292c-2.407.028-4.38-1.866-4.408-4.23-.029-2.362 1.901-4.298 4.308-4.326h.1c2.407 0 4.358 1.915 4.365 4.278v6.305c0 2.342-1.944 4.25-4.323 4.279a4.375 4.375 0 01-3.033-1.252l-1.851 1.818A7 7 0 0012.029 22h.092c3.803-.056 6.858-3.083 6.879-6.816v-6.5C18.907 4.963 15.817 2 12.036 2z" /></svg>,
                openrouter: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd"><path d="M16.804 1.957l7.22 4.105v.087L16.73 10.21l.017-2.117-.821-.03c-1.059-.028-1.611.002-2.268.11-1.064.175-2.038.577-3.147 1.352L8.345 11.03c-.284.195-.495.336-.68.455l-.515.322-.397.234.385.23.53.338c.476.314 1.17.796 2.701 1.866 1.11.775 2.083 1.177 3.147 1.352l.3.045c.694.091 1.375.094 2.825.033l.022-2.159 7.22 4.105v.087L16.589 22l.014-1.862-.635.022c-1.386.042-2.137.002-3.138-.162-1.694-.28-3.26-.926-4.881-2.059l-2.158-1.5a21.997 21.997 0 00-.755-.498l-.467-.28a55.927 55.927 0 00-.76-.43C2.908 14.73.563 14.116 0 14.116V9.888l.14.004c.564-.007 2.91-.622 3.809-1.124l1.016-.58.438-.274c.428-.28 1.072-.726 2.686-1.853 1.621-1.133 3.186-1.78 4.881-2.059 1.152-.19 1.974-.213 3.814-.138l.02-1.907z" /></svg>,
                "kimi-coding": <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="white"/></svg>,
                qwen: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>,
              };

              const defaultModelProvider = defaultModel.split("/")[0] || "";
              const isProviderDefault = (provider: string, requireAuth = false) => {
                if (defaultModelProvider !== provider) return false;
                if (!requireAuth) return true;
                // For OAuth providers, check subscription state
                const oauthState = oauthStates[provider];
                if (oauthState === "done") return true;
                // For API key providers, check saved state
                if (apiKeySaved[provider]) return true;
                return false;
              };

              /* ── API key validation patterns ── */
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

              /* ── OAuth providers (require interactive Terminal for login) ── */
              const oauthProviders: Array<{ id: string; label: string; hint: string }> = [
                { id: "openai-codex", label: m.chatgptSub, hint: m.chatgptSubHint },
                { id: "google-gemini-cli", label: m.geminiSub, hint: m.geminiSubHint },
                { id: "kimi-coding", label: m.kimiSub, hint: m.kimiSubHint },
                { id: "qwen", label: m.qwenSub, hint: m.qwenSubHint },
              ];
              oauthProviders.sort((a, b) => (isProviderDefault(b.id) ? 1 : 0) - (isProviderDefault(a.id) ? 1 : 0));

              /* ── API key providers ── */
              const apiKeyProviders: Array<{ id: string; label: string }> = [
                { id: "anthropic", label: m.anthropicKey },
                { id: "openai", label: m.openaiKey },
                { id: "google", label: m.googleKey },
                { id: "deepseek", label: m.deepseekKey },
                { id: "mistral", label: m.mistralKey },
                { id: "xai", label: m.xaiKey },
                { id: "groq", label: m.groqKey },
                { id: "openrouter", label: m.openrouterKey },
              ];
              apiKeyProviders.sort((a, b) => (isProviderDefault(b.id) ? 1 : 0) - (isProviderDefault(a.id) ? 1 : 0));

              const isPolling = Object.values(oauthStates).some((s) => s === "polling");

              /* ── API key modal provider data ── */
              const modalProvider = apiKeyModalProvider
                ? apiKeyProviders.find((p) => p.id === apiKeyModalProvider)
                : null;



              /* ── OAuth modal data ── */
              const oauthModalData = oauthModalProvider
                ? oauthProviders.find((p) => p.id === oauthModalProvider)
                : null;
              const oauthModalState = oauthModalProvider ? (oauthStates[oauthModalProvider] ?? "idle") : "idle";
              const oauthModalConnected = oauthModalState === "done";
              const oauthModalDef = oauthModalProvider ? isProviderDefault(oauthModalProvider, true) : false;

              return (
                <>
                  {/* ── OAuth section ── */}
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{m.oauthSection}</h3>
                    <p className="text-xs text-muted-foreground mb-3">{m.oauthHint}</p>
                    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      {oauthProviders.map(({ id, label, hint }, i) => {
                        const authState = oauthStates[id] ?? "idle";
                        const isConnected = authState === "done";
                        const isLoading = authState === "polling" || authState === "launching";
                        return (
                          <IntegrationRow
                            key={id}
                            icon={icons[id] ?? icons.openai}
                            title={label}
                            description={hint}
                            enabled={isConnected}
                            onToggle={(v) => {
                              if (v) {
                                setOauthModalProvider(id);
                              } else {
                                const baseProvider = id.replace("openai-codex", "openai").replace("google-gemini-cli", "google").replace("kimi-coding", "kimi");
                                removeAuth(baseProvider);
                                removeAuth(id);
                                setOauthStates((prev) => ({ ...prev, [id]: "idle" as AuthState }));
                              }
                            }}
                            status={isConnected ? "connected" : isLoading ? "connecting" : "disabled"}
                            detail={isConnected && isProviderDefault(id, true) ? m.defaultProvider : undefined}
                            onRowClick={isConnected ? () => setOauthModalProvider(id) : undefined}
                            toggleDisabled={isLoading}
                            isLast={i === oauthProviders.length - 1}
                            testId={`ai-provider-${id}`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* ── API key section ── */}
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{m.apiKeySection}</h3>
                    <p className="text-xs text-muted-foreground mb-3">{m.apiKeyHint}</p>
                    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      {apiKeyProviders.map(({ id, label }, i) => {
                        const saved = apiKeySaved[id] ?? false;
                        return (
                          <IntegrationRow
                            key={id}
                            icon={icons[id] ?? icons.openai}
                            title={label}
                            description={m.apiKeyHint}
                            enabled={saved}
                            onToggle={(v) => {
                              if (v) {
                                setApiKeyModalProvider(id);
                              } else {
                                removeAuth(id);
                              }
                            }}
                            status={saved ? "connected" : "disabled"}
                            detail={saved && isProviderDefault(id, true) ? m.defaultProvider : undefined}
                            onRowClick={saved ? () => setApiKeyModalProvider(id) : undefined}
                            isLast={i === apiKeyProviders.length - 1}
                            testId={`ai-provider-${id}`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* ── OAuth provider modal ── */}
                  {oauthModalProvider && oauthModalData && (
                    <>
                    <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => setOauthModalProvider(null)} />
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOauthModalProvider(null)}>
                      <div
                        className="mx-4 flex w-full max-w-[380px] flex-col rounded-xl border border-border bg-card shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
                        style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-3.5 px-7 pt-6 pb-0">
                          <div className="relative flex-shrink-0">
                            <div className="w-10 h-10 rounded-[10px] bg-card text-strong-foreground flex items-center justify-center">
                              {icons[oauthModalProvider]}
                            </div>
                            {oauthModalConnected && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card bg-emerald-400" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-[16px] font-semibold text-foreground">{oauthModalData.label}</h3>
                              {oauthModalConnected && oauthModalDef && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-foreground/[0.06] text-[9px] font-medium text-muted-foreground">
                                  {m.defaultProvider}
                                </span>
                              )}
                            </div>
                            {oauthModalConnected && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">{m.connected}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setOauthModalProvider(null)}
                            className="w-[30px] h-[30px] rounded-lg bg-card text-tertiary-foreground flex items-center justify-center hover:bg-muted hover:text-strong-foreground transition-colors self-start"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                        <div className="px-7 pt-4 pb-5 space-y-3">
                          <p className="text-[13px] text-tertiary-foreground">{oauthModalData.hint}</p>
                          {oauthModalConnected && !oauthModalDef && (
                            <button
                              type="button"
                              onClick={() => { handleSetDefault(oauthModalProvider); }}
                              className="w-full h-9 rounded-xl border border-border text-xs text-strong-foreground hover:bg-card transition-colors"
                            >
                              {m.setDefault}
                            </button>
                          )}
                          {!oauthModalConnected && (oauthModalState === "polling" || oauthModalState === "launching") && (
                            <div className="flex items-center justify-center gap-2 py-1">
                              <svg className="w-3.5 h-3.5 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                              </svg>
                              <span className="text-[11px] text-muted-foreground">{m.openTerminal}</span>
                            </div>
                          )}
                          {!oauthModalConnected && oauthModalState !== "polling" && oauthModalState !== "launching" && (
                            <p className="text-[11px] text-muted-foreground">{m.oauthHint}</p>
                          )}
                        </div>
                        <div className="px-7 pb-6 pt-0 flex justify-end gap-2.5">
                          {oauthModalConnected ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  const baseProvider = oauthModalProvider.replace("openai-codex", "openai").replace("google-gemini-cli", "google").replace("kimi-coding", "kimi");
                                  removeAuth(baseProvider);
                                  removeAuth(oauthModalProvider);
                                  setOauthStates((prev) => ({ ...prev, [oauthModalProvider]: "idle" as AuthState }));
                                  setOauthModalProvider(null);
                                }}
                                className="px-4 py-2 rounded-xl border border-red-200 dark:border-red-800 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                              >
                                {m.disconnectAccount}
                              </button>
                              <button
                                type="button"
                                onClick={() => setOauthModalProvider(null)}
                                className="px-4 py-2 rounded-xl bg-foreground text-sm text-primary-foreground hover:bg-foreground-intense transition-colors"
                              >
                                {messages.settings.integrations.email.done}
                              </button>
                            </>
                          ) : (oauthModalState === "polling" || oauthModalState === "launching") ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (authPollRef.current) { clearInterval(authPollRef.current); authPollRef.current = null; }
                                setOauthStates((prev) => ({ ...prev, [oauthModalProvider]: "idle" as AuthState }));
                              }}
                              className="px-4 py-2 rounded-xl border border-border text-sm text-strong-foreground hover:bg-card transition-colors"
                            >
                              {m.retryAuth}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => launchOAuth(oauthModalProvider)}
                              className="px-4 py-2 rounded-xl bg-foreground text-sm text-primary-foreground hover:bg-foreground-intense transition-colors"
                            >
                              {m.connectAccount}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    </>
                  )}

                  {/* ── API key modal ── */}
                  {apiKeyModalProvider && modalProvider && (() => {
                    const currentValue = (apiKeyValues[apiKeyModalProvider] ?? "").trim();
                    const pattern = apiKeyPatterns[apiKeyModalProvider];
                    const isValid = !currentValue || !pattern || pattern.test(currentValue);
                    const saved = apiKeySaved[apiKeyModalProvider];
                    const isDef = isProviderDefault(apiKeyModalProvider, true);
                    const isFromEnv = authTypes[apiKeyModalProvider] === "env";
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
                              {icons[apiKeyModalProvider] ?? icons.openai}
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
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              {m.keySaved}
                            </div>
                          )}
                          {saved && isFromEnv && (
                            <p className="px-7 pt-2 text-[11px] text-muted-foreground">{m.keyFromEnv}</p>
                          )}
                          <div className="px-7 pt-4 pb-5 space-y-3">
                            <SettingField label={m.apiKeySection}>
                              <input
                                type="password"
                                value={apiKeyValues[apiKeyModalProvider] ?? ""}
                                onChange={(e) => {
                                  const id = apiKeyModalProvider;
                                  setApiKeyValues((prev) => ({ ...prev, [id]: e.target.value }));
                                  setApiKeySaved((prev) => ({ ...prev, [id]: false }));
                                }}
                                placeholder={pattern?.placeholder ?? m.apiKeyPlaceholder}
                                className={`w-full bg-card border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 transition-colors ${
                                  currentValue && !isValid
                                    ? "border-amber-300 focus:ring-amber-300 focus:border-amber-300"
                                    : "border-border focus:ring-tertiary-foreground focus:border-tertiary-foreground"
                                }`}
                              />
                            </SettingField>
                            {currentValue && !isValid && (
                              <p className="text-[11px] text-amber-600">{m.invalidKeyFormat}</p>
                            )}

                            {saved && !isDef && (
                              <button
                                type="button"
                                onClick={() => handleSetDefault(apiKeyModalProvider)}
                                className="w-full h-9 rounded-xl border border-border text-xs text-strong-foreground hover:bg-card transition-colors"
                              >
                                {m.setDefault}
                              </button>
                            )}

                            {saved && isDef && (
                              <div className="flex items-center justify-center gap-1.5 py-1">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-foreground/[0.06] text-[10px] text-tertiary-foreground">
                                  {m.defaultProvider}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="px-7 pb-6 pt-0 flex justify-end gap-2.5">
                            {saved && !isFromEnv && !currentValue && (
                              <button
                                type="button"
                                onClick={() => {
                                  removeAuth(apiKeyModalProvider);
                                  setApiKeyModalProvider(null);
                                }}
                                className="px-4 py-2 rounded-xl border border-red-200 dark:border-red-800 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                              >
                                {m.removeKey}
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
                                {m.saveKey}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setApiKeyModalProvider(null)}
                                className="px-4 py-2 rounded-xl bg-foreground text-sm text-primary-foreground hover:bg-foreground-intense transition-colors"
                              >
                                {messages.settings.integrations.email.done}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      </>
                    );
                  })()}
                </>
              );
            })()}
          </div>
        )}

        {/* ── INTEGRATIONS TAB ────────────────────────────────────── */}
        {tab === "integrations" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground mb-4">
              {messages.settings.integrations.intro}
            </p>

            {/* Unified integrations card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              {/* WhatsApp */}
              <IntegrationRow
                icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>}
                title={messages.settings.integrations.whatsapp.title}
                description={messages.settings.integrations.whatsapp.description}
                enabled={whatsappEnabled}
                onToggle={handleWhatsAppToggle}
                status={whatsappStatus}
                detail={whatsappStatus === "connected" && (config.excludedChats.length > 0 || config.excludeGroups)
                  ? [
                      config.excludedChats.length > 0 ? `${config.excludedChats.length} ${messages.settings.integrations.whatsapp.chatsToExclude.toLowerCase()}` : "",
                      config.excludeGroups ? messages.settings.integrations.whatsapp.excludeGroups.toLowerCase() : "",
                    ].filter(Boolean).join(", ")
                  : undefined}
                onRowClick={whatsappStatus === "connected" || whatsappStatus === "syncing" ? openWhatsAppConfigModal : undefined}
                toggleDisabled={whatsAppState === "connecting" || whatsAppState === "installing"}
                isFirst
                testId="whatsapp-integration"
              />

              {/* Email */}
              <IntegrationRow
                icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>}
                title={messages.settings.integrations.email.title}
                description={messages.settings.integrations.email.description}
                enabled={emailEnabled}
                onToggle={(v) => updateConfig((c) => ({
                  ...c,
                  emailAccounts: v ? [ALL_EMAIL_ACCOUNTS_ID] : [],
                }))}
                status={emailStatus}
                detail={emailStatus === "connected"
                  ? allEmailSelected
                    ? messages.settings.integrations.email.allAccounts
                    : selectedEmailIds.length === 0
                      ? undefined
                      : emailOptions
                          .filter((a) => selectedEmailIds.includes(a.id))
                          .map((a) => a.displayName || a.email || a.id)
                          .join(", ")
                  : undefined}
                onRowClick={emailStatus === "connected" ? () => setShowEmailAccountsModal(true) : undefined}
                testId="email-integration"
              />

              {/* Telegram */}
              <IntegrationRow
                icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.7 3.3-19.4 7.5c-.8.3-.8 1.5 0 1.8l4.9 1.6 2 6.3c.2.5.8.7 1.2.4l2.9-2.1 4.7 3.5c.5.4 1.3.1 1.4-.5L22.9 4.5c.2-.8-.5-1.4-1.2-1.2z"/><line x1="10.2" y1="13.8" x2="21.7" y2="3.3"/></svg>}
                title={messages.settings.integrations.telegram.title}
                description={messages.settings.integrations.telegram.description}
                enabled={telegramEnabled}
                onToggle={handleTelegramToggle}
                status={telegramStatus}
                detail={telegramStatus === "connected" ? telegramBotInfo ? `@${telegramBotInfo.username}` : messages.settings.integrations.telegram.connected : undefined}
                onRowClick={telegramEnabled ? () => {
                  setTelegramBotTokenInput("");
                  setTelegramTestError(false);
                  setShowTelegramConfigModal(true);
                } : undefined}
                testId="telegram-integration"
              />

              {/* Slack */}
              <IntegrationRow
                icon={<Hash className="w-[17px] h-[17px]" />}
                title={messages.settings.integrations.slack.title}
                description={messages.settings.integrations.slack.description}
                enabled={slackEnabled}
                onToggle={handleSlackToggle}
                status={slackStatus}
                detail={slackStatus === "connected" ? slackBotInfo ? slackBotInfo.teamName : messages.settings.integrations.slack.connected : undefined}
                onRowClick={slackEnabled ? () => {
                  setSlackBotTokenInput("");
                  setSlackTestError(false);
                  setShowSlackConfigModal(true);
                } : undefined}
                testId="slack-integration"
              />

              {/* Calendar */}
              <IntegrationRow
                icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>}
                title={messages.settings.integrations.calendar.title}
                description={messages.settings.integrations.calendar.description}
                enabled={calendarEnabled}
                onToggle={(v) => updateConfig((c) => ({
                  ...c,
                  calendarAccounts: v ? [ALL_CALENDARS_ID] : [],
                }))}
                status={calendarStatus}
                detail={calendarStatus === "connected"
                  ? allCalendarSelected
                    ? messages.settings.integrations.calendar.allCalendars
                    : selectedCalendarIds.length === 0
                      ? undefined
                      : calendarOptions
                          .filter((c) => selectedCalendarIds.includes(c.id))
                          .map((c) => c.title)
                          .join(", ")
                  : undefined}
                onRowClick={calendarStatus === "connected" ? () => setShowCalendarConfigModal(true) : undefined}
                testId="calendar-integration"
              />

              {/* Contacts */}
              <IntegrationRow
                icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
                title="Contacts"
                description="Access contacts from macOS Contacts.app"
                enabled={!!config.contactsEnabled}
                onToggle={(v) => updateConfig((c) => ({
                  ...c,
                  contactsEnabled: v,
                }))}
                status={!config.contactsEnabled ? "disabled"
                  : toolStatus?.contacts?.available ? "connected" : "waiting"}
                detail={config.contactsEnabled && toolStatus?.contacts?.available
                  ? `${toolStatus.contacts.contactCount} contacts`
                  : undefined}
                isLast
                testId="contacts-integration"
              />
            </div>

            {/* ── WhatsApp error (only shown when there's a real error) ── */}
            {whatsappEnabled && toolStatus?.whatsapp.lastError && whatsappStatus !== "connected" && (
              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400">
                {toolStatus.whatsapp.lastError}
              </div>
            )}

            {/* ── WhatsApp QR modal ── */}
            {showWhatsAppQrModal && whatsAppQrText && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowWhatsAppQrModal(false)}>
                <div className="bg-card rounded-2xl shadow-xl border border-border p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-col items-center gap-4">
                    <h3 className="text-sm font-medium text-foreground">{messages.settings.integrations.whatsapp.title}</h3>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={whatsAppQrImage}
                      alt={messages.settings.integrations.whatsapp.qrAlt}
                      className="w-56 h-56 rounded-lg border border-border bg-card p-2"
                    />
                    <p className="text-center text-xs text-muted-foreground">
                      {messages.settings.integrations.whatsapp.qrHint}
                    </p>
                    {toolStatus?.whatsapp.lastError && (
                      <div className="w-full bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 text-xs text-amber-700 dark:text-amber-400">
                        {toolStatus.whatsapp.lastError}
                      </div>
                    )}
                    <button
                      onClick={() => setShowWhatsAppQrModal(false)}
                      className="text-xs text-muted-foreground hover:text-muted-foreground transition-colors"
                    >
                      {messages.common.hide}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── WhatsApp disconnect modal ── */}
            {showWhatsAppDisconnectModal && (
              <>
                <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => !whatsAppDisconnecting && (setShowWhatsAppDisconnectModal(false), setWhatsAppUninstallCli(false))} />
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !whatsAppDisconnecting && (setShowWhatsAppDisconnectModal(false), setWhatsAppUninstallCli(false))}>
                  <div
                    data-testid="whatsapp-disconnect-modal"
                    className="mx-4 w-full max-w-[380px] rounded-xl border border-border bg-card px-7 py-6 shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
                    style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 className="text-[16px] font-semibold text-foreground mb-1.5">
                      {messages.settings.integrations.whatsapp.disconnect.title}
                    </h3>
                    <p className="text-[12px] leading-relaxed text-tertiary-foreground mb-5">
                      {messages.settings.integrations.whatsapp.disconnect.description}
                    </p>

                    <div className="space-y-2.5 mb-5">
                      {/* Option: just disable */}
                      <button
                        type="button"
                        disabled={!!whatsAppDisconnecting}
                        onClick={() => handleWhatsAppDisable(false, false)}
                        data-testid="whatsapp-disconnect-keep"
                        className="w-full text-left rounded-xl border border-border px-4 py-3 hover:bg-background transition-colors disabled:opacity-50"
                      >
                        <div className="flex items-center gap-2">
                          {whatsAppDisconnecting === "keep" && (
                            <svg className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                            </svg>
                          )}
                          <span className="text-[13px] font-medium text-foreground">
                            {messages.settings.integrations.whatsapp.disconnect.keepData}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {messages.settings.integrations.whatsapp.disconnect.keepDataHint}
                        </p>
                      </button>

                      {/* Option: delete data */}
                      <button
                        type="button"
                        disabled={!!whatsAppDisconnecting}
                        onClick={() => handleWhatsAppDisable(true, whatsAppUninstallCli)}
                        data-testid="whatsapp-disconnect-delete"
                        className="w-full text-left rounded-xl border border-border px-4 py-3 hover:bg-background transition-colors disabled:opacity-50"
                      >
                        <div className="flex items-center gap-2">
                          {whatsAppDisconnecting === "delete" && (
                            <svg className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                            </svg>
                          )}
                          <span className="text-[13px] font-medium text-foreground">
                            {messages.settings.integrations.whatsapp.disconnect.deleteData}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {messages.settings.integrations.whatsapp.disconnect.deleteDataHint}
                        </p>
                      </button>
                    </div>

                    {/* Checkbox: also uninstall CLI */}
                    <label className="flex items-center gap-2.5 mb-5 cursor-pointer">
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        whatsAppUninstallCli ? "border-foreground bg-foreground" : "border-muted-foreground"
                      }`} onClick={() => setWhatsAppUninstallCli((v) => !v)}>
                        {whatsAppUninstallCli && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                      </span>
                      <span className="text-[11px] text-strong-foreground">
                        {messages.settings.integrations.whatsapp.disconnect.uninstallCli}
                      </span>
                    </label>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={!!whatsAppDisconnecting}
                        onClick={() => { setShowWhatsAppDisconnectModal(false); setWhatsAppUninstallCli(false); }}
                        data-testid="whatsapp-disconnect-cancel"
                        className="px-4 py-2 rounded-xl border border-border text-sm text-strong-foreground hover:bg-card transition-colors disabled:opacity-50"
                      >
                        {messages.settings.integrations.whatsapp.disconnect.cancel}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── WhatsApp config modal ── */}
            {showWhatsAppConfigModal && (() => {
              const waGroups = waChats.filter((c) => c.isGroup);
              const waContacts = waChats.filter((c) => !c.isGroup);
              const excludedSet = new Set(config.excludedChats.map((n) => n.toLowerCase()));
              const isExcluded = (name: string) => {
                const lower = name.toLowerCase();
                for (const n of excludedSet) {
                  if (lower.includes(n)) return true;
                }
                return false;
              };
              const toggleChat = (chatName: string) => {
                const lower = chatName.toLowerCase();
                if (isExcluded(chatName)) {
                  updateConfig((c) => ({
                    ...c,
                    excludedChats: c.excludedChats.filter((n) => !lower.includes(n)),
                  }));
                } else {
                  updateConfig((c) => ({
                    ...c,
                    excludedChats: [...c.excludedChats, lower],
                  }));
                }
              };

              const ChatRow = ({ chat }: { chat: { name: string; isGroup: boolean; messageCount: number } }) => {
                const excluded = config.excludeGroups && chat.isGroup ? true : isExcluded(chat.name);
                const disabledByGroupToggle = config.excludeGroups && chat.isGroup;
                return (
                  <button
                    type="button"
                    onClick={() => !disabledByGroupToggle && toggleChat(chat.name)}
                    disabled={disabledByGroupToggle}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs transition-colors ${disabledByGroupToggle ? "opacity-40 cursor-not-allowed" : "hover:bg-muted"}`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      !excluded
                        ? "border-foreground bg-foreground"
                        : "border-muted-foreground"
                    }`}>
                      {!excluded && (
                        <Check className="h-3 w-3 text-primary-foreground" />
                      )}
                    </span>
                    <span className={`flex-1 truncate ${excluded ? "text-muted-foreground" : "text-foreground"}`}>
                      {chat.name}
                    </span>
                  </button>
                );
              };

              return (
                <>
                  <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => setShowWhatsAppConfigModal(false)} />
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowWhatsAppConfigModal(false)}>
                    <div
                      data-testid="whatsapp-config-modal"
                      className="mx-4 flex w-full max-w-[420px] max-h-[min(580px,85vh)] flex-col rounded-xl border border-border bg-card shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
                      style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Header */}
                      <div className="flex items-center gap-3.5 px-6 pt-5 pb-0">
                        <div className="w-10 h-10 rounded-[10px] bg-card text-strong-foreground flex items-center justify-center">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-[16px] font-semibold text-foreground">{messages.settings.integrations.whatsapp.title}</h3>
                          {whatsappSyncing ? (
                            <div className="flex items-center gap-1.5 text-[11px] text-sky-600 mt-0.5">
                              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                              </svg>
                              {messages.settings.integrations.whatsapp.syncing}
                            </div>
                          ) : whatsappReady ? (
                            <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 mt-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              {messages.settings.status.connected}
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowWhatsAppConfigModal(false)}
                          className="w-[30px] h-[30px] rounded-lg bg-card text-tertiary-foreground flex items-center justify-center hover:bg-muted hover:text-strong-foreground transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>

                      {/* Voice note transcription toggle */}
                      <div className="flex items-center justify-between px-6 pt-3">
                        <span className="text-[12px] font-medium text-strong-foreground">{messages.settings.integrations.whatsapp.autoTranscribe}</span>
                        <Toggle
                          enabled={!!config.whatsappAutoTranscribe}
                          onChange={(v) => {
                            if (v && !config.transcription?.provider) {
                              setShowWhatsAppConfigModal(false);
                              setTab("tools");
                              setTimeout(() => setShowTranscriptionConfigModal(true), 200);
                              return;
                            }
                            updateConfig((c) => ({ ...c, whatsappAutoTranscribe: v }));
                          }}
                          testId="whatsapp-auto-transcribe-toggle"
                        />
                      </div>

                      {/* Send messages toggle */}
                      <div className="flex items-center justify-between px-6 pt-3">
                        <div>
                          <span className="text-[12px] font-medium text-strong-foreground">{messages.settings.integrations.whatsapp.sendMessages}</span>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{messages.settings.integrations.whatsapp.sendMessagesHint}</p>
                        </div>
                        <Toggle
                          enabled={!!config.whatsappBot?.enabled}
                          onChange={(v) => updateConfig((c) => ({
                            ...c,
                            whatsappBot: { ...c.whatsappBot, enabled: v, mode: v ? (c.whatsappBot?.mode || "wacli") : c.whatsappBot?.mode },
                          }))}
                          testId="whatsapp-send-messages-toggle"
                        />
                      </div>

                      {config.whatsappBot?.enabled && (
                        <div className="px-6 pt-2 space-y-2">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => updateConfig((c) => ({ ...c, whatsappBot: { ...c.whatsappBot, enabled: true, mode: "wacli" } }))}
                              className={`flex-1 rounded-lg border px-3 py-2 text-[11px] text-left transition-colors ${
                                config.whatsappBot?.mode !== "business-api"
                                  ? "border-foreground bg-foreground/5 text-foreground"
                                  : "border-border text-muted-foreground hover:border-muted-foreground"
                              }`}
                            >
                              <div className="font-medium">{messages.settings.integrations.whatsapp.modeWacli}</div>
                              <div className="text-[10px] mt-0.5 opacity-70">{messages.settings.integrations.whatsapp.modeWacliHint}</div>
                            </button>
                            <button
                              type="button"
                              onClick={() => updateConfig((c) => ({ ...c, whatsappBot: { ...c.whatsappBot, enabled: true, mode: "business-api" } }))}
                              className={`flex-1 rounded-lg border px-3 py-2 text-[11px] text-left transition-colors ${
                                config.whatsappBot?.mode === "business-api"
                                  ? "border-foreground bg-foreground/5 text-foreground"
                                  : "border-border text-muted-foreground hover:border-muted-foreground"
                              }`}
                            >
                              <div className="font-medium">{messages.settings.integrations.whatsapp.modeBusinessApi}</div>
                              <div className="text-[10px] mt-0.5 opacity-70">{messages.settings.integrations.whatsapp.modeBusinessApiHint}</div>
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="h-px bg-muted mx-6 mt-3" />

                      <p className="text-[11px] text-muted-foreground px-6 pt-3">
                        {messages.settings.integrations.whatsapp.chatsToExcludeHint}
                      </p>

                      {/* Syncing banner */}
                      {whatsappSyncing && (
                        <div className="mx-6 mt-2.5 flex items-center gap-2 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950 px-3 py-2">
                          <svg className="w-3.5 h-3.5 animate-spin text-sky-500 shrink-0" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                          </svg>
                          <span className="text-[11px] text-sky-700">{messages.settings.integrations.whatsapp.syncingHint}</span>
                        </div>
                      )}

                      {/* Chat list */}
                      <div className="flex-1 overflow-y-auto px-3 pt-1 pb-2 min-h-0">
                        {waChatsLoading ? (
                          <div className="flex items-center justify-center gap-2 py-8">
                            <svg className="w-4 h-4 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                            </svg>
                          </div>
                        ) : waChats.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-8">{messages.settings.integrations.whatsapp.noChatsFound}</p>
                        ) : (
                          <>
                            {/* Contacts section (first) */}
                            {waContacts.length > 0 && (
                              <div className="mb-1">
                                <div className="flex items-center justify-between px-3 pt-2 pb-1">
                                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {messages.settings.integrations.whatsapp.contacts} ({waContacts.length})
                                  </span>
                                </div>
                                {waContacts.map((chat, index) => (
                                  <ChatRow key={`${chat.name}-${index}`} chat={chat} />
                                ))}
                              </div>
                            )}

                            {/* Groups section (second) */}
                            {waGroups.length > 0 && (
                              <div>
                                <div className="flex items-center justify-between px-3 pt-2 pb-1">
                                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {messages.settings.integrations.whatsapp.groups} ({waGroups.length})
                                  </span>
                                  <Toggle
                                    enabled={!config.excludeGroups}
                                    onChange={(v) => updateConfig((c) => ({ ...c, excludeGroups: !v }))}
                                  />
                                </div>
                                {!config.excludeGroups ? (
                                  <p className="text-[11px] text-muted-foreground px-3 py-2">{messages.settings.integrations.whatsapp.excluded}</p>
                                ) : (
                                  waGroups.map((chat, index) => (
                                    <ChatRow key={`${chat.name}-${index}`} chat={chat} />
                                  ))
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="px-6 pb-5 pt-2 flex justify-end border-t border-border">
                        <button
                          type="button"
                          onClick={() => setShowWhatsAppConfigModal(false)}
                          data-testid="whatsapp-config-done"
                          className="h-9 rounded-xl bg-foreground px-4 text-sm text-primary-foreground hover:bg-foreground-intense transition-colors"
                        >
                          {messages.settings.integrations.email.done}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}

            {/* ── Telegram disconnect modal ── */}
            {showTelegramDisconnectModal && (
              <>
                <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => !telegramDisconnecting && setShowTelegramDisconnectModal(false)} />
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !telegramDisconnecting && setShowTelegramDisconnectModal(false)}>
                  <div
                    data-testid="telegram-disconnect-modal"
                    className="mx-4 w-full max-w-[380px] rounded-xl border border-border bg-card px-7 py-6 shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
                    style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 className="text-[16px] font-semibold text-foreground mb-1.5">
                      {messages.settings.integrations.telegram.disconnect.title}
                    </h3>
                    <p className="text-[12px] leading-relaxed text-tertiary-foreground mb-5">
                      {messages.settings.integrations.telegram.disconnect.description}
                    </p>

                    <div className="space-y-2.5 mb-5">
                      <button
                        type="button"
                        disabled={!!telegramDisconnecting}
                        onClick={() => handleTelegramDisable(false)}
                        data-testid="telegram-disconnect-keep"
                        className="w-full text-left rounded-xl border border-border px-4 py-3 hover:bg-background transition-colors disabled:opacity-50"
                      >
                        <div className="flex items-center gap-2">
                          {telegramDisconnecting === "keep" && (
                            <svg className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                            </svg>
                          )}
                          <span className="text-[13px] font-medium text-foreground">
                            {messages.settings.integrations.telegram.disconnect.keepData}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {messages.settings.integrations.telegram.disconnect.keepDataHint}
                        </p>
                      </button>

                      <button
                        type="button"
                        disabled={!!telegramDisconnecting}
                        onClick={() => handleTelegramDisable(true)}
                        data-testid="telegram-disconnect-delete"
                        className="w-full text-left rounded-xl border border-border px-4 py-3 hover:bg-background transition-colors disabled:opacity-50"
                      >
                        <div className="flex items-center gap-2">
                          {telegramDisconnecting === "delete" && (
                            <svg className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                            </svg>
                          )}
                          <span className="text-[13px] font-medium text-foreground">
                            {messages.settings.integrations.telegram.disconnect.deleteData}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {messages.settings.integrations.telegram.disconnect.deleteDataHint}
                        </p>
                      </button>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={!!telegramDisconnecting}
                        onClick={() => setShowTelegramDisconnectModal(false)}
                        data-testid="telegram-disconnect-cancel"
                        className="px-4 py-2 rounded-xl border border-border text-sm text-strong-foreground hover:bg-card transition-colors disabled:opacity-50"
                      >
                        {messages.settings.integrations.telegram.disconnect.cancel}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── Telegram config modal ── */}
            {showTelegramConfigModal && (() => {
              const hasBotToken = telegramConnected;
              const botInfo = telegramBotInfo;

              return (
                <>
                  <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => setShowTelegramConfigModal(false)} />
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowTelegramConfigModal(false)}>
                    <div
                      data-testid="telegram-config-modal"
                      className="mx-4 flex w-full max-w-[420px] max-h-[min(580px,85vh)] flex-col rounded-xl border border-border bg-card shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
                      style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Header */}
                      <div className="flex items-center gap-3.5 px-6 pt-5 pb-0">
                        <div className="w-10 h-10 rounded-[10px] bg-card text-strong-foreground flex items-center justify-center">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.7 3.3-19.4 7.5c-.8.3-.8 1.5 0 1.8l4.9 1.6 2 6.3c.2.5.8.7 1.2.4l2.9-2.1 4.7 3.5c.5.4 1.3.1 1.4-.5L22.9 4.5c.2-.8-.5-1.4-1.2-1.2z"/><line x1="10.2" y1="13.8" x2="21.7" y2="3.3"/></svg>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-[16px] font-semibold text-foreground">{messages.settings.integrations.telegram.title}</h3>
                          {hasBotToken ? (
                            <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 mt-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              {messages.settings.integrations.telegram.connected}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                              {messages.settings.integrations.telegram.disconnected}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowTelegramConfigModal(false)}
                          className="w-[30px] h-[30px] rounded-lg bg-card text-tertiary-foreground flex items-center justify-center hover:bg-muted hover:text-strong-foreground transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>

                      {/* Content */}
                      <div className="flex-1 overflow-y-auto px-6 pt-4 pb-2 space-y-4">

                        {/* ── State A: no token yet → setup flow ── */}
                        {!hasBotToken && (
                          <div>
                            <p className="text-[11px] text-muted-foreground mb-3">{messages.settings.integrations.telegram.botTokenHint}</p>

                            {/* Token input + connect button */}
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={telegramBotTokenInput}
                                onChange={(e) => { setTelegramBotTokenInput(e.target.value); setTelegramTestError(false); }}
                                placeholder={messages.settings.integrations.telegram.botTokenPlaceholder}
                                autoComplete="off"
                                autoFocus
                                data-testid="telegram-token-input"
                                className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors font-mono"
                              />
                            </div>

                            {telegramTestError && (
                              <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-amber-600">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                {messages.settings.integrations.telegram.testFailed}
                              </div>
                            )}

                            {/* Connect button (full width below) */}
                            <button
                              type="button"
                              disabled={!telegramBotTokenInput.trim() || telegramTesting}
                              onClick={() => handleTelegramTestConnection(telegramBotTokenInput.trim())}
                              data-testid="telegram-test-connection"
                              className={`w-full mt-3 h-9 rounded-xl text-sm font-medium transition-colors ${
                                !telegramBotTokenInput.trim() || telegramTesting
                                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                                  : "bg-foreground text-primary-foreground hover:bg-foreground-intense"
                              }`}
                            >
                              {telegramTesting ? (
                                <span className="flex items-center justify-center gap-2">
                                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                                  </svg>
                                  {messages.settings.integrations.telegram.connecting}
                                </span>
                              ) : messages.settings.integrations.telegram.testConnection}
                            </button>
                          </div>
                        )}

                        {/* ── State B: token saved → bot info + configuration ── */}
                        {hasBotToken && (
                          <>
                            {/* Bot info card */}
                            <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
                              <div className="w-9 h-9 rounded-full bg-foreground flex items-center justify-center shrink-0">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.7 3.3-19.4 7.5c-.8.3-.8 1.5 0 1.8l4.9 1.6 2 6.3c.2.5.8.7 1.2.4l2.9-2.1 4.7 3.5c.5.4 1.3.1 1.4-.5L22.9 4.5c.2-.8-.5-1.4-1.2-1.2z"/><line x1="10.2" y1="13.8" x2="21.7" y2="3.3"/></svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                {botInfo ? (
                                  <>
                                    <div className="text-[13px] font-medium text-foreground truncate">{botInfo.name}</div>
                                    <div className="text-[11px] text-muted-foreground truncate">@{botInfo.username}</div>
                                  </>
                                ) : (
                                  <>
                                    <div className="text-[13px] font-medium text-foreground">{messages.settings.integrations.telegram.connected}</div>
                                    <div className="text-[11px] text-muted-foreground font-mono truncate">••••••••••</div>
                                  </>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 shrink-0">
                                <Check className="w-3.5 h-3.5" />
                              </div>
                            </div>

                            <div className="h-px bg-muted" />

                            {/* Sync messages toggle */}
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-[12px] font-medium text-strong-foreground">{messages.settings.integrations.telegram.syncMessages}</span>
                                <p className="text-[11px] text-muted-foreground mt-0.5">{messages.settings.integrations.telegram.syncMessagesHint}</p>
                              </div>
                              <Toggle
                                enabled={!!config.telegram?.syncMessages}
                                onChange={(v) => updateConfig((c) => ({
                                  ...c,
                                  telegram: { ...c.telegram, enabled: true, syncMessages: v },
                                }))}
                                testId="telegram-sync-toggle"
                              />
                            </div>

                            <div className="h-px bg-muted" />

                            {/* Allowed chat IDs */}
                            <div>
                              <label className="block text-[12px] font-medium text-strong-foreground mb-1">{messages.settings.integrations.telegram.allowedChats}</label>
                              <p className="text-[11px] text-muted-foreground mb-2">{messages.settings.integrations.telegram.allowedChatsHint}</p>
                              <TagsInput
                                value={config.telegram?.allowedChatIds || []}
                                onChange={(v) => updateConfig((c) => ({
                                  ...c,
                                  telegram: { ...c.telegram, enabled: true, allowedChatIds: v },
                                }))}
                                placeholder={messages.settings.integrations.telegram.allowedChatsPlaceholder}
                              />
                            </div>

                            {/* Webhook URL (read-only info) */}
                            {toolStatus?.telegram?.webhookUrl && (
                              <>
                                <div className="h-px bg-muted" />
                                <div>
                                  <label className="block text-[12px] font-medium text-strong-foreground mb-1">{messages.settings.integrations.telegram.webhookUrl}</label>
                                  <p className="text-[11px] text-muted-foreground mb-1.5">{messages.settings.integrations.telegram.webhookUrlHint}</p>
                                  <div className="bg-muted rounded-lg px-3 py-2 text-xs text-strong-foreground font-mono break-all">
                                    {toolStatus.telegram.webhookUrl}
                                  </div>
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="px-6 pb-5 pt-2 flex justify-end border-t border-border">
                        <button
                          type="button"
                          onClick={() => setShowTelegramConfigModal(false)}
                          data-testid="telegram-config-done"
                          className="h-9 rounded-xl bg-foreground px-4 text-sm text-primary-foreground hover:bg-foreground-intense transition-colors"
                        >
                          {messages.settings.integrations.email.done}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}

            {/* ── Slack disconnect modal ── */}
            {showSlackDisconnectModal && (
              <>
                <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => !slackDisconnecting && setShowSlackDisconnectModal(false)} />
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !slackDisconnecting && setShowSlackDisconnectModal(false)}>
                  <div
                    data-testid="slack-disconnect-modal"
                    className="mx-4 w-full max-w-[380px] rounded-xl border border-border bg-card px-7 py-6 shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
                    style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 className="text-[16px] font-semibold text-foreground mb-1.5">
                      {messages.settings.integrations.slack.disconnect.title}
                    </h3>
                    <p className="text-[12px] leading-relaxed text-tertiary-foreground mb-5">
                      {messages.settings.integrations.slack.disconnect.description}
                    </p>
                    <div className="space-y-2.5 mb-5">
                      <button type="button" disabled={!!slackDisconnecting} onClick={() => handleSlackDisable(false)}
                        data-testid="slack-disconnect-keep"
                        className="w-full text-left rounded-xl border border-border px-4 py-3 hover:bg-background transition-colors disabled:opacity-50">
                        <div className="flex items-center gap-2">
                          {slackDisconnecting === "keep" && (
                            <svg className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                            </svg>
                          )}
                          <span className="text-[13px] font-medium text-foreground">{messages.settings.integrations.slack.disconnect.keepData}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{messages.settings.integrations.slack.disconnect.keepDataHint}</p>
                      </button>
                      <button type="button" disabled={!!slackDisconnecting} onClick={() => handleSlackDisable(true)}
                        data-testid="slack-disconnect-delete"
                        className="w-full text-left rounded-xl border border-border px-4 py-3 hover:bg-background transition-colors disabled:opacity-50">
                        <div className="flex items-center gap-2">
                          {slackDisconnecting === "delete" && (
                            <svg className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                            </svg>
                          )}
                          <span className="text-[13px] font-medium text-foreground">{messages.settings.integrations.slack.disconnect.deleteData}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{messages.settings.integrations.slack.disconnect.deleteDataHint}</p>
                      </button>
                    </div>
                    <div className="flex justify-end">
                      <button type="button" disabled={!!slackDisconnecting} onClick={() => setShowSlackDisconnectModal(false)}
                        data-testid="slack-disconnect-cancel"
                        className="px-4 py-2 rounded-xl border border-border text-sm text-strong-foreground hover:bg-card transition-colors disabled:opacity-50">
                        {messages.settings.integrations.slack.disconnect.cancel}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── Slack config modal ── */}
            {showSlackConfigModal && (() => {
              const hasBotToken = !!toolStatus?.slack.botConnected;
              const botInfo = slackBotInfo;
              return (
                <>
                  <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => setShowSlackConfigModal(false)} />
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowSlackConfigModal(false)}>
                    <div
                      data-testid="slack-config-modal"
                      className="mx-4 flex w-full max-w-[420px] max-h-[min(580px,85vh)] flex-col rounded-xl border border-border bg-card shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
                      style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-3.5 px-6 pt-5 pb-0">
                        <div className="w-10 h-10 rounded-[10px] bg-card text-strong-foreground flex items-center justify-center">
                          <Hash className="w-[18px] h-[18px]" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-[16px] font-semibold text-foreground">{messages.settings.integrations.slack.title}</h3>
                          {hasBotToken ? (
                            <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 mt-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              {messages.settings.integrations.slack.connected}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                              {messages.settings.integrations.slack.disconnected}
                            </div>
                          )}
                        </div>
                        <button type="button" onClick={() => setShowSlackConfigModal(false)}
                          className="w-[30px] h-[30px] rounded-lg bg-card text-tertiary-foreground flex items-center justify-center hover:bg-muted hover:text-strong-foreground transition-colors">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto px-6 pt-4 pb-2 space-y-4">
                        {!hasBotToken && (
                          <div>
                            <p className="text-[11px] text-muted-foreground mb-3">{messages.settings.integrations.slack.botTokenHint}</p>
                            <div className="flex gap-2">
                              <input type="text" value={slackBotTokenInput}
                                onChange={(e) => { setSlackBotTokenInput(e.target.value); setSlackTestError(false); }}
                                placeholder={messages.settings.integrations.slack.botTokenPlaceholder}
                                autoComplete="off" autoFocus
                                data-testid="slack-token-input"
                                className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors font-mono" />
                            </div>
                            {slackTestError && (
                              <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-amber-600">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                {messages.settings.integrations.slack.testFailed}
                              </div>
                            )}
                            <button type="button" disabled={!slackBotTokenInput.trim() || slackTesting}
                              onClick={() => handleSlackTestConnection(slackBotTokenInput.trim())}
                              data-testid="slack-test-connection"
                              className={`w-full mt-3 h-9 rounded-xl text-sm font-medium transition-colors ${
                                !slackBotTokenInput.trim() || slackTesting
                                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                                  : "bg-foreground text-primary-foreground hover:bg-foreground-intense"
                              }`}>
                              {slackTesting ? (
                                <span className="flex items-center justify-center gap-2">
                                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                                  </svg>
                                  {messages.settings.integrations.slack.connecting}
                                </span>
                              ) : messages.settings.integrations.slack.testConnection}
                            </button>
                          </div>
                        )}
                        {hasBotToken && (
                          <>
                            <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
                              <div className="w-9 h-9 rounded-full bg-foreground flex items-center justify-center shrink-0">
                                <Hash className="w-4 h-4 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                {botInfo ? (
                                  <>
                                    <div data-testid="slack-bot-username" className="text-[13px] font-medium text-foreground truncate">{botInfo.username}</div>
                                    <div data-testid="slack-team-name" className="text-[11px] text-muted-foreground truncate">{botInfo.teamName}</div>
                                  </>
                                ) : (
                                  <div className="text-[13px] text-muted-foreground">{messages.settings.integrations.slack.connected}</div>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="px-6 pb-5 pt-2 flex justify-end border-t border-border">
                        <button type="button" onClick={() => setShowSlackConfigModal(false)}
                          data-testid="slack-config-done"
                          className="h-9 rounded-xl bg-foreground px-4 text-sm text-primary-foreground hover:bg-foreground-intense transition-colors">
                          {messages.settings.integrations.email.done}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}

            {/* ── Email config modal ── */}
            {showEmailAccountsModal && (
              <>
                <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => setShowEmailAccountsModal(false)} />
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowEmailAccountsModal(false)}>
                  <div
                    data-testid="email-config-modal"
                    className="mx-4 flex w-full max-w-[420px] max-h-[min(480px,85vh)] flex-col rounded-xl border border-border bg-card shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
                    style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Header */}
                    <div className="flex items-center gap-3.5 px-6 pt-5 pb-0">
                      <div className="w-10 h-10 rounded-[10px] bg-card text-strong-foreground flex items-center justify-center">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-[16px] font-semibold text-foreground">{messages.settings.integrations.email.title}</h3>
                        {emailStatus === "connected" && (
                          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            {messages.settings.status.connected}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowEmailAccountsModal(false)}
                        className="w-[30px] h-[30px] rounded-lg bg-card text-tertiary-foreground flex items-center justify-center hover:bg-muted hover:text-strong-foreground transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>

                    <p className="text-[11px] text-muted-foreground px-6 pt-2">
                      {messages.settings.integrations.email.description}
                    </p>

                    <div className="flex items-center justify-end px-6 pt-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (allEmailSelected) {
                            updateConfig((c) => ({ ...c, emailAccounts: emailOptions.map(() => NONE_EMAIL_ACCOUNTS_ID) }));
                          } else {
                            updateConfig((c) => ({ ...c, emailAccounts: [ALL_EMAIL_ACCOUNTS_ID] }));
                          }
                        }}
                        className="text-xs text-strong-foreground hover:text-foreground transition-colors"
                      >
                        {allEmailSelected
                          ? messages.settings.integrations.email.deselectAll
                          : messages.settings.integrations.email.selectAll}
                      </button>
                    </div>

                    {/* Account list */}
                    <div className="flex-1 overflow-y-auto px-3 pt-1 pb-2 min-h-0">
                      {emailOptions.length === 0 ? (
                        <div className="flex items-center justify-center py-8">
                          <svg className="w-4 h-4 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                          </svg>
                        </div>
                      ) : (
                        emailOptions.map((account) => {
                          const selected = selectedEmailIds.includes(account.id);
                          return (
                            <button
                              key={account.id}
                              type="button"
                              data-testid={`email-integration-account-${account.id}`}
                              onClick={() => updateConfig((current) => {
                                const currentSelectedIds = resolveSelectedEmailIds(current.emailAccounts, emailOptions);
                                const nextSelectedIds = new Set(currentSelectedIds);
                                if (selected) {
                                  nextSelectedIds.delete(account.id);
                                } else {
                                  nextSelectedIds.add(account.id);
                                }
                                const nextIds = Array.from(nextSelectedIds);
                                return {
                                  ...current,
                                  emailAccounts: nextIds.length === 0
                                    ? [NONE_EMAIL_ACCOUNTS_ID]
                                    : nextIds.length === emailOptions.length
                                      ? [ALL_EMAIL_ACCOUNTS_ID]
                                      : nextIds,
                                };
                              })}
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
                            >
                              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                                selected
                                  ? "border-foreground bg-foreground"
                                  : "border-muted-foreground"
                              }`}>
                                {selected && (
                                  <Check className="h-3 w-3 text-primary-foreground" />
                                )}
                              </span>
                              <span className={`flex-1 truncate ${selected ? "text-foreground" : "text-muted-foreground"}`}>
                                {account.displayName || account.email || account.id}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 pb-5 pt-2 flex justify-end border-t border-border">
                      <button
                        type="button"
                        onClick={() => setShowEmailAccountsModal(false)}
                        data-testid="email-config-done"
                        className="h-9 rounded-xl bg-foreground px-4 text-sm text-primary-foreground hover:bg-foreground-intense transition-colors"
                      >
                        {messages.settings.integrations.email.done}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── Calendar config modal ── */}
            {showCalendarConfigModal && (
              <>
                <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" onClick={() => setShowCalendarConfigModal(false)} />
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowCalendarConfigModal(false)}>
                  <div
                    data-testid="calendar-config-modal"
                    className="mx-4 flex w-full max-w-[420px] max-h-[min(480px,85vh)] flex-col rounded-xl border border-border bg-card shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
                    style={{ animation: "modalSlideIn 220ms cubic-bezier(0.25,0.1,0.25,1)" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Header */}
                    <div className="flex items-center gap-3.5 px-6 pt-5 pb-0">
                      <div className="w-10 h-10 rounded-[10px] bg-card text-strong-foreground flex items-center justify-center">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-[16px] font-semibold text-foreground">{messages.settings.integrations.calendar.title}</h3>
                        {calendarStatus === "connected" && (
                          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            {messages.settings.status.connected}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCalendarConfigModal(false)}
                        className="w-[30px] h-[30px] rounded-lg bg-card text-tertiary-foreground flex items-center justify-center hover:bg-muted hover:text-strong-foreground transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>

                    <p className="text-[11px] text-muted-foreground px-6 pt-2">
                      {messages.settings.integrations.calendar.description}
                    </p>

                    <div className="flex items-center justify-end px-6 pt-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (allCalendarSelected) {
                            updateConfig((c) => ({ ...c, calendarAccounts: calendarOptions.map(() => NONE_CALENDARS_ID) }));
                          } else {
                            updateConfig((c) => ({ ...c, calendarAccounts: [ALL_CALENDARS_ID] }));
                          }
                        }}
                        className="text-xs text-strong-foreground hover:text-foreground transition-colors"
                      >
                        {allCalendarSelected
                          ? messages.settings.integrations.calendar.deselectAll
                          : messages.settings.integrations.calendar.selectAll}
                      </button>
                    </div>

                    {/* Calendar list */}
                    <div className="flex-1 overflow-y-auto px-3 pt-1 pb-2 min-h-0">
                      {calendarOptions.length === 0 ? (
                        <div className="flex items-center justify-center py-8">
                          <svg className="w-4 h-4 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                          </svg>
                        </div>
                      ) : (
                        calendarOptions.map((calendar) => {
                          const selected = selectedCalendarIds.includes(calendar.id);
                          return (
                            <button
                              key={calendar.id}
                              type="button"
                              data-testid={`calendar-integration-calendar-${calendar.id}`}
                              onClick={() => updateConfig((current) => {
                                const currentSelectedIds = resolveSelectedCalendarIds(current.calendarAccounts || [], calendarOptions);
                                const nextSelectedIds = new Set(currentSelectedIds);
                                if (selected) {
                                  nextSelectedIds.delete(calendar.id);
                                } else {
                                  nextSelectedIds.add(calendar.id);
                                }
                                const nextIds = Array.from(nextSelectedIds);
                                return {
                                  ...current,
                                  calendarAccounts: nextIds.length === 0
                                    ? [NONE_CALENDARS_ID]
                                    : nextIds.length === calendarOptions.length
                                      ? [ALL_CALENDARS_ID]
                                      : nextIds,
                                };
                              })}
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
                            >
                              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                                selected
                                  ? "border-foreground bg-foreground"
                                  : "border-muted-foreground"
                              }`}>
                                {selected && (
                                  <Check className="h-3 w-3 text-primary-foreground" />
                                )}
                              </span>
                              <span className={`flex-1 truncate ${selected ? "text-foreground" : "text-muted-foreground"}`}>
                                {calendar.title}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 pb-5 pt-2 flex justify-end border-t border-border">
                      <button
                        type="button"
                        onClick={() => setShowCalendarConfigModal(false)}
                        data-testid="calendar-config-done"
                        className="h-9 rounded-xl bg-foreground px-4 text-sm text-primary-foreground hover:bg-foreground-intense transition-colors"
                      >
                        {messages.settings.integrations.calendar.done}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

          </div>
        )}

        {/* ── TOOLS TAB ───────────────────────────────────────────── */}
        {tab === "tools" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground mb-4">
              {messages.settings.tools.intro}
            </p>

            {/* Audio section header */}
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{messages.settings.tools.audioSection}</h3>

            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              {/* Transcription */}
              <IntegrationRow
                icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>}
                title={messages.settings.tools.transcription.title}
                description={messages.settings.tools.transcription.description}
                enabled={transcriptionEnabled}
                onToggle={(v) => {
                  updateConfig((c) => ({
                    ...c,
                    dataSources: {
                      ...c.dataSources,
                      transcriptionDbPath: v ? DEFAULT_PATHS.transcription : "",
                    },
                  }));
                  if (v && !transcriptionWhisperReady) {
                    fetch("/api/integrations/setup", { method: "POST" })
                      .then(() => refreshToolStatus())
                      .catch(() => {});
                  }
                }}
                status={transcriptionStatus}
                detail={transcriptionEnabled
                  ? (config.transcription?.provider === "groq" ? "Groq"
                    : config.transcription?.provider === "openai" ? "OpenAI"
                    : messages.settings.tools.transcription.providerLocal)
                  : undefined}
                onRowClick={() => setShowTranscriptionConfigModal(true)}
                isFirst
                testId="transcription-tool"
              />

              {/* Text to Speech */}
              <IntegrationRow
                icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
                title={messages.settings.tools.tts.title}
                description={messages.settings.tools.tts.description}
                enabled={config.tts?.enabled !== false}
                onToggle={(v) => updateConfig((c) => ({
                  ...c,
                  tts: { ...c.tts, provider: c.tts?.provider || "local", enabled: v },
                }))}
                status={config.tts?.enabled !== false ? "connected" : "disabled"}
                detail={config.tts?.enabled !== false
                  ? ttsProviderLabel
                  : undefined}
                onRowClick={config.tts?.enabled !== false ? () => setShowTtsConfigModal(true) : undefined}
                isLast
                testId="tts-tool"
              />
            </div>

            {/* ── Transcription config modal ── */}
            <IntegrationConfigModal
              open={showTranscriptionConfigModal}
              onClose={() => setShowTranscriptionConfigModal(false)}
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>}
              title={messages.settings.tools.transcription.title}
              statusLabel={transcriptionStatus === "connected" ? messages.settings.status.connected : undefined}
            >
              <SettingField label={messages.settings.tools.transcription.provider}>
                <SelectInput
                  value={config.transcription?.provider || "local"}
                  onChange={(v) => updateConfig((c) => ({
                    ...c,
                    transcription: {
                      ...c.transcription,
                      provider: v as "local" | "groq" | "openai",
                    },
                  }))}
                  options={[
                    { value: "local", label: messages.settings.tools.transcription.providerLocal },
                    { value: "groq", label: messages.settings.tools.transcription.providerGroq },
                    { value: "openai", label: messages.settings.tools.transcription.providerOpenai },
                  ]}
                />
              </SettingField>
              {(config.transcription?.provider === "groq" || config.transcription?.provider === "openai") && (
                <SettingField label={messages.settings.tools.transcription.apiKey}>
                  <input
                    type="password"
                    value={config.transcription?.apiKey || ""}
                    onChange={(e) => updateConfig((c) => ({
                      ...c,
                      transcription: {
                        ...c.transcription,
                        provider: c.transcription?.provider || "local",
                        apiKey: e.target.value,
                      },
                    }))}
                    placeholder={messages.settings.tools.transcription.apiKeyPlaceholder}
                    className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors"
                  />
                </SettingField>
              )}
              {(!config.transcription?.provider || config.transcription?.provider === "local") && (
                <SettingField label={messages.settings.tools.transcription.whisperModel}>
                  <SelectInput
                    value={config.transcription?.model || "base"}
                    onChange={(v) => updateConfig((c) => ({
                      ...c,
                      transcription: {
                        ...c.transcription,
                        provider: c.transcription?.provider || "local",
                        model: v,
                      },
                    }))}
                    options={[
                      { value: "tiny", label: "Tiny" },
                      { value: "base", label: "Base" },
                      { value: "small", label: "Small" },
                      { value: "medium", label: "Medium" },
                      { value: "large", label: "Large" },
                    ]}
                  />
                </SettingField>
              )}
            </IntegrationConfigModal>

            {/* ── TTS config modal ── */}
            <IntegrationConfigModal
              open={showTtsConfigModal}
              onClose={() => {
                if (ttsConfigMissingApiKey) {
                  updateConfig((c) => ({
                    ...c,
                    tts: { ...c.tts, provider: "local" },
                  }));
                }
                setShowTtsConfigModal(false);
              }}
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
              title={messages.settings.tools.tts.title}
              doneDisabled={ttsConfigMissingApiKey}
            >
              <SettingField label={messages.settings.tools.tts.provider}>
                <SelectInput
                  value={selectedTtsProviderId}
                  onChange={(v) => updateConfig((c) => ({
                    ...c,
                    tts: {
                      ...c.tts,
                      provider: v as TtsProvider,
                    },
                  }))}
                  options={ttsProviderOptions}
                  disabled={ttsProviderOptions.length === 0}
                />
              </SettingField>
              {!selectedTtsProvider && (
                <div className="text-sm text-muted-foreground py-2">{messages.common.loading}</div>
              )}
              {selectedTtsProvider?.fields.map((field) => renderTtsField(selectedTtsProvider, field))}
              <div className="flex items-center justify-between py-1">
                <div>
                  <div className="text-xs font-medium text-strong-foreground">{messages.settings.tools.tts.autoRead}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{messages.settings.tools.tts.autoReadHint}</div>
                </div>
                <Toggle
                  enabled={config.tts?.autoRead === true}
                  onChange={(v) => updateConfig((c) => ({
                    ...c,
                    tts: { ...c.tts, provider: c.tts?.provider || "local", autoRead: v },
                  }))}
                />
              </div>
            </IntegrationConfigModal>

            {/* ── Image Generation section ──────────────────────────── */}
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-6">{messages.settings.tools.imageSection}</h3>

            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <IntegrationRow
                icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>}
                title={messages.settings.tools.imageGeneration.title}
                description={messages.settings.tools.imageGeneration.description}
                enabled={config.imageGeneration?.enabled !== false}
                onToggle={(v) => updateConfig((c) => ({
                  ...c,
                  imageGeneration: { ...c.imageGeneration, enabled: v },
                }))}
                status={(() => {
                  if (config.imageGeneration?.enabled === false) return "disabled" as const;
                  const avail = imageBackends.filter((b) => b.available);
                  return avail.length > 0 ? "connected" as const : "disabled" as const;
                })()}
                detail={config.imageGeneration?.enabled !== false
                  ? (() => {
                      const selectedId = config.imageGeneration?.defaultBackendId;
                      if (selectedId) {
                        const found = imageBackends.find((b) => b.id === selectedId);
                        if (found) return found.label;
                      }
                      const avail = imageBackends.filter((b) => b.available);
                      return avail[0]?.label;
                    })()
                  : undefined}
                onRowClick={config.imageGeneration?.enabled !== false ? () => setShowImageGenConfigModal(true) : undefined}
                isFirst
                isLast
                testId="image-generation-tool"
              />
            </div>

            {/* ── Image Generation config modal ── */}
            <IntegrationConfigModal
              open={showImageGenConfigModal}
              onClose={() => setShowImageGenConfigModal(false)}
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>}
              title={messages.settings.tools.imageGeneration.title}
              statusLabel={(() => {
                const avail = imageBackends.filter((b) => b.available);
                return avail.length > 0 ? `${avail.length} ${messages.settings.tools.imageGeneration.backendAvailable.toLowerCase()}` : undefined;
              })()}
            >
              {/* Default backend selector — always show a proper dropdown */}
              <SettingField label={messages.settings.tools.imageGeneration.backend}>
                {imageBackends.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{messages.settings.tools.imageGeneration.noBackends}</p>
                ) : (
                  <SelectInput
                    value={config.imageGeneration?.defaultBackendId || imageBackends.find((b) => b.available)?.id || ""}
                    onChange={(v) => updateConfig((c) => ({
                      ...c,
                      imageGeneration: { ...c.imageGeneration, defaultBackendId: v || undefined, model: undefined, metadata: undefined },
                    }))}
                    placeholder={messages.settings.tools.imageGeneration.selectBackend}
                    options={imageBackends.map((b) => ({
                      value: b.id,
                      label: `${b.label}${!b.available ? ` (${messages.settings.tools.imageGeneration.backendUnavailable.toLowerCase()})` : ""}`,
                    }))}
                  />
                )}
              </SettingField>

              {/* Model selector — dropdown when backend has supportedModels, text input fallback */}
              {(() => {
                const selectedBackendId = config.imageGeneration?.defaultBackendId || imageBackends.find((b) => b.available)?.id;
                const selectedBackend = imageBackends.find((b) => b.id === selectedBackendId);
                const models = selectedBackend?.supportedModels;
                if (!selectedBackend) return null;
                return (
                  <SettingField label={messages.settings.tools.imageGeneration.model}>
                    {models && models.length > 0 ? (
                      <SelectInput
                        value={config.imageGeneration?.model || models.find((m) => m.default)?.id || models[0].id}
                        onChange={(v) => updateConfig((c) => ({
                          ...c,
                          imageGeneration: { ...c.imageGeneration, model: v || undefined },
                        }))}
                        placeholder={messages.settings.tools.imageGeneration.selectModel}
                        options={models.map((m) => ({
                          value: m.id,
                          label: m.default ? `${m.label} (${messages.settings.tools.imageGeneration.modelDefault})` : m.label,
                        }))}
                      />
                    ) : (
                      <input
                        type="text"
                        value={config.imageGeneration?.model || ""}
                        onChange={(e) => updateConfig((c) => ({
                          ...c,
                          imageGeneration: { ...c.imageGeneration, model: e.target.value || undefined },
                        }))}
                        placeholder="model-id"
                        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors"
                      />
                    )}
                  </SettingField>
                );
              })()}

              {/* Metadata options — rendered dynamically from the selected backend's metadataSchema */}
              {(() => {
                const selectedBackendId = config.imageGeneration?.defaultBackendId || imageBackends.find((b) => b.available)?.id;
                const selectedBackend = imageBackends.find((b) => b.id === selectedBackendId);
                const schema = selectedBackend?.metadataSchema;
                if (!schema || schema.length === 0) return null;
                return (
                  <>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-2">{messages.settings.tools.imageGeneration.options}</h4>
                    {schema.map((field) => (
                      <SettingField key={field.key} label={field.label}>
                        {field.type === "select" && field.options ? (
                          <SelectInput
                            value={config.imageGeneration?.metadata?.[field.key] || field.default || ""}
                            onChange={(v) => updateConfig((c) => ({
                              ...c,
                              imageGeneration: {
                                ...c.imageGeneration,
                                metadata: { ...c.imageGeneration?.metadata, ...(v ? { [field.key]: v } : {}) },
                              },
                            }))}
                            placeholder={field.label}
                            options={field.options.map((o) => ({ value: o.value, label: o.label }))}
                          />
                        ) : (
                          <input
                            type={field.type === "number" ? "number" : "text"}
                            value={config.imageGeneration?.metadata?.[field.key] || ""}
                            onChange={(e) => updateConfig((c) => ({
                              ...c,
                              imageGeneration: {
                                ...c.imageGeneration,
                                metadata: { ...c.imageGeneration?.metadata, ...(e.target.value ? { [field.key]: e.target.value } : {}) },
                              },
                            }))}
                            placeholder={field.placeholder || field.default || ""}
                            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors"
                          />
                        )}
                      </SettingField>
                    ))}
                  </>
                );
              })()}

              {/* Backend availability list */}
              {imageBackends.length > 0 && (
                <>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-3">{messages.settings.tools.imageGeneration.backendsStatus}</h4>
                  <div className="space-y-1.5">
                    {imageBackends.map((backend) => (
                      <div key={backend.id} className="flex items-center justify-between py-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-strong-foreground truncate">{backend.label}</div>
                          {!backend.available && backend.reason && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">{backend.reason}</div>
                          )}
                        </div>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                          backend.available
                            ? "bg-green-500/10 text-green-600 dark:text-green-400"
                            : "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                        }`}>
                          {backend.available
                            ? messages.settings.tools.imageGeneration.backendAvailable
                            : messages.settings.tools.imageGeneration.backendUnavailable}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </IntegrationConfigModal>

          </div>
        )}

        {/* ── PERSONA TAB ─────────────────────────────────────────── */}
        {tab === "persona" && (
          <div className="space-y-5">
            {/* Sub-tab navigation */}
            <div className="flex gap-5 px-5">
              {([
                { key: "essentials" as const, label: messages.settings.persona.subTabEssentials },
                { key: "approach" as const, label: messages.settings.persona.subTabApproach },
                { key: "style" as const, label: messages.settings.persona.subTabStyle },
                { key: "session" as const, label: messages.settings.persona.subTabSession },
                { key: "safety" as const, label: messages.settings.persona.subTabSafety },
              ]).map((st) => (
                <button key={st.key} type="button"
                  onClick={() => setPersonaSubTab(st.key)}
                  className={`pb-1 text-xs transition-all border-b-2 ${
                    personaSubTab === st.key
                      ? "font-semibold text-foreground border-foreground"
                      : "font-normal text-muted-foreground border-transparent hover:text-strong-foreground"
                  }`}>
                  {st.label}
                </button>
              ))}
            </div>

            {/* ── ESSENTIALS ── */}
            {personaSubTab === "essentials" && (
              <div className="space-y-4">
                {/* Identity card */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-testid="profile-basics-card">
                  <div className="px-4 pt-4 pb-1">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{messages.settings.persona.assistantPersona}</p>
                    <p className="text-[10px] text-muted-foreground mb-3">{messages.settings.persona.assistantPersonaHint}</p>
                  </div>
                  <div className="px-4 pb-4">
                    <div className="grid grid-cols-2 gap-3">
                      <SettingField label={messages.settings.persona.assistantName}>
                        <TextInput value={config.assistantPersona?.name || ""}
                          placeholder={messages.settings.persona.assistantNamePlaceholder}
                          onChange={(v) => updateConfig((c) => ({
                            ...c,
                            assistantPersona: { ...c.assistantPersona, name: v, gender: c.assistantPersona?.gender || "" },
                          }))} />
                      </SettingField>
                      <SettingField label={messages.settings.persona.assistantGender}>
                        <SelectInput value={config.assistantPersona?.gender || ""}
                          placeholder={messages.settings.persona.assistantGender}
                          onChange={(v) => updateConfig((c) => ({
                            ...c,
                            assistantPersona: { ...c.assistantPersona, name: c.assistantPersona?.name || "", gender: v },
                          }))}
                          options={[
                            { value: "male", label: messages.settings.persona.assistantGenderMale },
                            { value: "female", label: messages.settings.persona.assistantGenderFemale },
                          ]} />
                      </SettingField>
                      <SettingField label={messages.settings.persona.assistantApparentAge} hint={messages.settings.persona.assistantApparentAgeHint}>
                        <SelectInput value={config.assistantPersona?.apparentAge || ""}
                          placeholder={messages.settings.persona.assistantApparentAge}
                          onChange={(v) => updateConfig((c) => ({ ...c, assistantPersona: { ...c.assistantPersona, name: c.assistantPersona?.name || "", gender: c.assistantPersona?.gender || "", apparentAge: (v || undefined) as typeof c.assistantPersona extends undefined ? never : typeof v extends "" ? undefined : "young" | "middle-aged" | "senior" } }))}
                          options={[
                            { value: "young", label: messages.settings.persona.apparentAgeYoung },
                            { value: "middle-aged", label: messages.settings.persona.apparentAgeMiddle },
                            { value: "senior", label: messages.settings.persona.apparentAgeSenior },
                          ]} />
                      </SettingField>
                      <div className="col-span-2">
                        <SettingField label={messages.settings.persona.assistantLanguage}>
                          <TextInput value={config.assistantPersona?.language || ""}
                            placeholder={messages.settings.persona.assistantLanguagePlaceholder}
                            onChange={(v) => updateConfig((c) => ({ ...c, assistantPersona: { ...c.assistantPersona, name: c.assistantPersona?.name || "", gender: c.assistantPersona?.gender || "", language: v || undefined } }))} />
                        </SettingField>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Orientation card */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="px-4 pt-4 pb-1">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{messages.settings.persona.guidanceStyle}</p>
                    <p className="text-[10px] text-muted-foreground mb-3">{messages.settings.persona.guidanceStyleHint}</p>
                  </div>
                  <div className="px-4 pb-4 space-y-4">
                    <div>
                      <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.guidanceStyle}</label>
                      <TripleOptionSelector
                        value={config.chat.guidanceStyle || "balanced"}
                        onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, guidanceStyle: v as "guiding" | "reflective" | "balanced" } }))}
                        options={[
                          { value: "guiding", label: messages.settings.persona.styleGuiding, desc: messages.settings.persona.styleGuidingDesc, icon: Compass },
                          { value: "balanced", label: messages.settings.persona.styleBalanced, desc: messages.settings.persona.styleBalancedDesc, icon: Scale },
                          { value: "reflective", label: messages.settings.persona.styleReflective, desc: messages.settings.persona.styleReflectiveDesc, icon: Ear },
                        ]} />
                    </div>
                    <div className="h-px bg-muted" />
                    <div>
                      <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.emotionalTone}</label>
                      <TripleOptionSelector
                        value={config.chat.emotionalTone || "balanced"}
                        onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, emotionalTone: v as "warm" | "direct" | "balanced" } }))}
                        options={[
                          { value: "warm", label: messages.settings.persona.toneWarm, desc: messages.settings.persona.toneWarmDesc, icon: Heart },
                          { value: "balanced", label: messages.settings.persona.toneBalanced, desc: messages.settings.persona.toneBalancedDesc, icon: Scale },
                          { value: "direct", label: messages.settings.persona.toneDirect, desc: messages.settings.persona.toneDirectDesc, icon: Zap },
                        ]} />
                    </div>
                  </div>
                </div>

                {/* Topics card */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="px-4 pt-4 pb-1">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">{messages.settings.persona.suggestedTopics}</p>
                  </div>
                  <div className="px-4 pb-4 space-y-3">
                    <div className="py-2 border-b border-border">
                      <SettingField label={messages.settings.persona.suggestedTopics}>
                        <TagsInput value={config.chat.suggestedTopics}
                          onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, suggestedTopics: v } }))}
                          placeholder={messages.settings.persona.suggestedTopicsPlaceholder} />
                      </SettingField>
                    </div>
                    <div className="py-2 border-b border-border">
                      <SettingField label={messages.settings.persona.focusTopics} hint={messages.settings.persona.focusTopicsHint}>
                        <TagsInput value={config.chat.focusTopics ?? []}
                          onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, focusTopics: v } }))}
                          placeholder={messages.settings.persona.focusTopicsPlaceholder} />
                      </SettingField>
                    </div>
                    <div className="py-2">
                      <SettingField label={messages.settings.persona.topicsToAvoid} hint={messages.settings.persona.topicsToAvoidHint}>
                        <TagsInput value={config.chat.neverMention}
                          onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, neverMention: v } }))}
                          placeholder={messages.settings.persona.topicsToAvoidPlaceholder} />
                      </SettingField>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── APPROACH ── */}
            {personaSubTab === "approach" && (
              <div className="space-y-4">
                {/* Depth & techniques card */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="px-4 pt-4 pb-4 space-y-4">
                    <div>
                      <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.depthLevel}</label>
                      <TripleOptionSelector
                        value={config.chat.depthLevel || "moderate"}
                        onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, depthLevel: v as "surface" | "moderate" | "deep" } }))}
                        options={[
                          { value: "surface", label: messages.settings.persona.depthSurface, desc: messages.settings.persona.depthSurfaceDesc, icon: Eye },
                          { value: "moderate", label: messages.settings.persona.depthModerate, desc: messages.settings.persona.depthModerateDesc, icon: Scale },
                          { value: "deep", label: messages.settings.persona.depthDeep, desc: messages.settings.persona.depthDeepDesc, icon: Brain },
                        ]} />
                    </div>
                    <div className="h-px bg-muted" />
                    <div>
                      <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.exerciseFrequency}</label>
                      <TripleOptionSelector
                        value={config.chat.exerciseFrequency || "sometimes"}
                        onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, exerciseFrequency: v as "never" | "sometimes" | "frequent" } }))}
                        options={[
                          { value: "never", label: messages.settings.persona.exerciseNever, desc: "", icon: Feather },
                          { value: "sometimes", label: messages.settings.persona.exerciseSometimes, desc: "", icon: Scale },
                          { value: "frequent", label: messages.settings.persona.exerciseFrequent, desc: "", icon: Target },
                        ]} />
                    </div>
                    <div className="h-px bg-muted" />
                    <div>
                      <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.metaphorUse}</label>
                      <TripleOptionSelector
                        value={config.chat.metaphorUse || "moderate"}
                        onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, metaphorUse: v as "low" | "moderate" | "frequent" } }))}
                        options={[
                          { value: "low", label: messages.settings.persona.metaphorLow, desc: "", icon: Feather },
                          { value: "moderate", label: messages.settings.persona.metaphorModerate, desc: "", icon: Scale },
                          { value: "frequent", label: messages.settings.persona.metaphorFrequent, desc: "", icon: Sparkles },
                        ]} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── STYLE ── */}
            {personaSubTab === "style" && (
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="px-4 pt-4 pb-4 space-y-4">
                <div>
                  <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.responseLength}</label>
                  <TripleOptionSelector
                    value={config.chat.responseLength || "moderate"}
                    onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, responseLength: v as "brief" | "moderate" | "extended" } }))}
                    options={[
                      { value: "brief", label: messages.settings.persona.responseBrief, desc: messages.settings.persona.responseBriefDesc, icon: MessageSquare },
                      { value: "moderate", label: messages.settings.persona.responseModerate, desc: messages.settings.persona.responseModerateDesc, icon: Scale },
                      { value: "extended", label: messages.settings.persona.responseExtended, desc: messages.settings.persona.responseExtendedDesc, icon: BookOpen },
                    ]} />
                </div>

                <div className="h-px bg-muted" />
                <div>
                  <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.formalityLevel}</label>
                  <TripleOptionSelector
                    value={config.chat.formalityLevel || "neutral"}
                    onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, formalityLevel: v as "informal" | "neutral" | "formal" } }))}
                    options={[
                      { value: "informal", label: messages.settings.persona.formalityInformal, desc: messages.settings.persona.formalityInformalDesc, icon: Smile },
                      { value: "neutral", label: messages.settings.persona.formalityNeutral, desc: messages.settings.persona.formalityNeutralDesc, icon: Scale },
                      { value: "formal", label: messages.settings.persona.formalityFormal, desc: messages.settings.persona.formalityFormalDesc, icon: BookOpen },
                    ]} />
                </div>

                <div className="h-px bg-muted" />
                <div>
                  <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.humorUse}</label>
                  <TripleOptionSelector
                    value={config.chat.humorUse || "never"}
                    onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, humorUse: v as "never" | "occasional" | "frequent" } }))}
                    options={[
                      { value: "never", label: messages.settings.persona.humorNever, desc: "", icon: Feather },
                      { value: "occasional", label: messages.settings.persona.humorOccasional, desc: "", icon: Smile },
                      { value: "frequent", label: messages.settings.persona.humorFrequent, desc: "", icon: Sparkles },
                    ]} />
                </div>

                <div className="h-px bg-muted" />
                <div>
                  <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.progressSpeed}</label>
                  <TripleOptionSelector
                    value={config.chat.progressSpeed || "moderate"}
                    onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, progressSpeed: v as "patient" | "moderate" | "direct" } }))}
                    options={[
                      { value: "patient", label: messages.settings.persona.progressPatient, desc: messages.settings.persona.progressPatientDesc, icon: Clock },
                      { value: "moderate", label: messages.settings.persona.progressModerate, desc: messages.settings.persona.progressModerateDesc, icon: Scale },
                      { value: "direct", label: messages.settings.persona.progressDirect, desc: messages.settings.persona.progressDirectDesc, icon: Zap },
                    ]} />
                </div>

                <div className="h-px bg-muted" />
                <div>
                  <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.confrontationLevel}</label>
                  <TripleOptionSelector
                    value={config.chat.confrontationLevel || "moderate"}
                    onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, confrontationLevel: v as "gentle" | "moderate" | "confrontational" } }))}
                    options={[
                      { value: "gentle", label: messages.settings.persona.confrontationGentle, desc: messages.settings.persona.confrontationGentleDesc, icon: Heart },
                      { value: "moderate", label: messages.settings.persona.confrontationModerate, desc: messages.settings.persona.confrontationModerateDesc, icon: Scale },
                      { value: "confrontational", label: messages.settings.persona.confrontationHigh, desc: messages.settings.persona.confrontationHighDesc, icon: Swords },
                    ]} />
                </div>
                </div>
              </div>
            )}

            {/* ── SESSION ── */}
            {personaSubTab === "session" && (
              <div className="space-y-4">
                {/* Duration & structure card */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="px-4 pt-4 pb-4 space-y-4">
                    <SettingField label={messages.settings.persona.sessionDuration} hint={messages.settings.persona.sessionDurationHint}>
                      <div className="grid grid-cols-4 gap-2">
                        {(["15min", "30min", "45min", "unlimited"] as const).map((dur) => {
                          const labels: Record<string, string> = { "15min": messages.settings.persona.duration15, "30min": messages.settings.persona.duration30, "45min": messages.settings.persona.duration45, unlimited: messages.settings.persona.durationUnlimited };
                          const selected = (config.chat.sessionDuration || "unlimited") === dur;
                          return (
                            <button key={dur} type="button"
                              onClick={() => updateConfig((c) => ({ ...c, chat: { ...c.chat, sessionDuration: dur } }))}
                              className={`px-3 py-2 rounded-lg text-xs border transition-colors duration-200 ${
                                selected
                                  ? "border-[1.5px] border-foreground bg-foreground/[0.04] text-foreground font-medium"
                                  : "border-border/70 bg-background text-foreground hover:border-muted-foreground"
                              }`}>
                              {labels[dur]}
                            </button>
                          );
                        })}
                      </div>
                    </SettingField>

                    <div className="h-px bg-muted" />

                    <div>
                      <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.sessionStructure}</label>
                      <TripleOptionSelector
                        value={config.chat.sessionStructure || "free"}
                        onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, sessionStructure: v as "free" | "semi-structured" | "structured" } }))}
                        options={[
                          { value: "free", label: messages.settings.persona.structureFree, desc: messages.settings.persona.structureFreeDesc, icon: Feather },
                          { value: "semi-structured", label: messages.settings.persona.structureSemi, desc: messages.settings.persona.structureSemiDesc, icon: Scale },
                          { value: "structured", label: messages.settings.persona.structureStructured, desc: messages.settings.persona.structureStructuredDesc, icon: Target },
                        ]} />
                    </div>
                  </div>
                </div>

                {/* Toggles card */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
                    <div>
                      <div className="text-xs font-medium text-strong-foreground">{messages.settings.persona.postSessionSummary}</div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{messages.settings.persona.postSessionSummaryHint}</p>
                    </div>
                    <Toggle enabled={config.chat.postSessionSummary ?? false}
                      onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, postSessionSummary: v } }))} />
                  </div>
                  <div className="flex items-center justify-between px-4 py-3.5">
                    <div>
                      <div className="text-xs font-medium text-strong-foreground">{messages.settings.persona.interSessionFollowUp}</div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{messages.settings.persona.interSessionFollowUpHint}</p>
                    </div>
                    <Toggle enabled={config.chat.interSessionFollowUp ?? false}
                      onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, interSessionFollowUp: v } }))} />
                  </div>
                </div>
              </div>
            )}

            {/* ── SAFETY ── */}
            {personaSubTab === "safety" && (
              <div className="space-y-4">
                {/* Autonomy & reminders card */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="px-4 pt-4 pb-4 space-y-4">
                    <div>
                      <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.userAutonomy}</label>
                      <TripleOptionSelector
                        value={config.chat.userAutonomy || "collaborative"}
                        onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, userAutonomy: v as "active-guidance" | "collaborative" | "user-led" } }))}
                        options={[
                          { value: "active-guidance", label: messages.settings.persona.autonomyActiveGuidance, desc: messages.settings.persona.autonomyActiveGuidanceDesc, icon: Compass },
                          { value: "collaborative", label: messages.settings.persona.autonomyCollaborative, desc: messages.settings.persona.autonomyCollaborativeDesc, icon: Users },
                          { value: "user-led", label: messages.settings.persona.autonomyUserLed, desc: messages.settings.persona.autonomyUserLedDesc, icon: Gauge },
                        ]} />
                    </div>

                    <div className="h-px bg-muted" />

                    <div>
                      <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.aiReminders}</label>
                      <TripleOptionSelector
                        value={config.chat.aiReminders || "never"}
                        onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, aiReminders: v as "never" | "start" | "periodically" } }))}
                        options={[
                          { value: "never", label: messages.settings.persona.aiRemindersNever, desc: "", icon: Feather },
                          { value: "start", label: messages.settings.persona.aiRemindersStart, desc: "", icon: MessageSquare },
                          { value: "periodically", label: messages.settings.persona.aiRemindersPeriodically, desc: "", icon: Clock },
                        ]} />
                    </div>
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

        {/* ── PROFILE TAB (About me) ────────────────────────────── */}
        {tab === "profile" && (
          <div className="space-y-5">
            {/* Sub-tab navigation */}
            <div className="flex gap-5 px-5">
              {([
                { key: "basics" as const, label: messages.settings.profile.subTabBasics },
                { key: "people" as const, label: messages.settings.profile.subTabPeople },
                { key: "context" as const, label: messages.settings.profile.subTabContext },
              ]).map((st) => (
                <button key={st.key} type="button"
                  onClick={() => setProfileSubTab(st.key)}
                  className={`pb-1 text-xs transition-all border-b-2 ${
                    profileSubTab === st.key
                      ? "font-semibold text-foreground border-foreground"
                      : "font-normal text-muted-foreground border-transparent hover:text-strong-foreground"
                  }`}>
                  {st.label}
                </button>
              ))}
            </div>

            {/* ── BASICS ── */}
            {profileSubTab === "basics" && (
              <div className="space-y-4">
                {/* Basic profile card */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="px-4 pt-4 pb-1">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{messages.settings.profile.basicProfile}</p>
                    <p className="text-[10px] text-muted-foreground mb-3">{messages.settings.profile.basicProfileHint}</p>
                  </div>
                  <div className="px-4 pb-4">
                  <div className="grid grid-cols-2 gap-3" data-testid="profile-basics">
                    <SettingField label={messages.settings.profile.name}>
                      <TextInput value={config.displayName}
                        testId="profile-name-input"
                        onChange={(v) => updateConfig((c) => ({ ...c, displayName: v, profileNameKey: v.toLowerCase() }))} />
                    </SettingField>
                    <SettingField label={messages.settings.profile.age}>
                      <TextInput value={config.profileBasics?.age || ""}
                        testId="profile-age-input"
                        onChange={(v) => updateConfig((c) => ({
                          ...c,
                          profileBasics: {
                            age: v,
                            gender: c.profileBasics?.gender || "",
                            location: c.profileBasics?.location || "",
                            occupation: c.profileBasics?.occupation || "",
                          },
                        }))} />
                    </SettingField>
                    <SettingField label={messages.settings.profile.gender}>
                      <SelectInput value={config.profileBasics?.gender || ""}
                        placeholder={messages.settings.profile.gender}
                        onChange={(v) => updateConfig((c) => ({
                          ...c,
                          profileBasics: {
                            age: c.profileBasics?.age || "",
                            gender: v,
                            location: c.profileBasics?.location || "",
                            occupation: c.profileBasics?.occupation || "",
                          },
                        }))}
                        options={[
                          { value: "male", label: messages.settings.profile.genderMale },
                          { value: "female", label: messages.settings.profile.genderFemale },
                        ]} />
                    </SettingField>
                    <SettingField label={messages.settings.profile.location}>
                      <TextInput value={config.profileBasics?.location || ""}
                        testId="profile-location-input"
                        onChange={(v) => updateConfig((c) => ({
                          ...c,
                          profileBasics: {
                            age: c.profileBasics?.age || "",
                            gender: c.profileBasics?.gender || "",
                            location: v,
                            occupation: c.profileBasics?.occupation || "",
                          },
                        }))} />
                    </SettingField>
                    <div className="col-span-2">
                      <SettingField label={messages.settings.profile.occupation}>
                        <TextInput value={config.profileBasics?.occupation || ""}
                          testId="profile-occupation-input"
                          onChange={(v) => updateConfig((c) => ({
                            ...c,
                            profileBasics: {
                              age: c.profileBasics?.age || "",
                              gender: c.profileBasics?.gender || "",
                              location: c.profileBasics?.location || "",
                              occupation: v,
                            },
                          }))} />
                      </SettingField>
                    </div>
                  </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── PEOPLE ── */}
            {profileSubTab === "people" && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  {messages.settings.people.intro}
                </p>

                {/* Priority contacts card */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="px-4 pt-4 pb-1">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{messages.settings.people.priorityContacts}</p>
                    <p className="text-[10px] text-muted-foreground mb-3">{messages.settings.people.priorityContactsHint}</p>
                  </div>
                  <div className="px-4 pb-4 space-y-3">
                    <div className="py-2 border-b border-border">
                      <SettingField label={messages.settings.people.names}>
                        <TagsInput value={config.priorityContacts.exactNames}
                          onChange={(v) => updateConfig((c) => ({ ...c, priorityContacts: { ...c.priorityContacts, exactNames: v } }))}
                          placeholder={messages.settings.people.namesPlaceholder} />
                      </SettingField>
                    </div>
                    <div className="py-2">
                      <SettingField label={messages.settings.people.keywords}>
                        <TagsInput value={config.priorityContacts.patterns}
                          onChange={(v) => updateConfig((c) => ({ ...c, priorityContacts: { ...c.priorityContacts, patterns: v } }))}
                          placeholder={messages.settings.people.keywordsPlaceholder} />
                      </SettingField>
                    </div>
                  </div>
                </div>

                {/* Family card */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="px-4 pt-4 pb-1">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{messages.settings.people.family}</p>
                    <p className="text-[10px] text-muted-foreground mb-3">{messages.settings.people.familyHint}</p>
                  </div>
                  <div className="px-4 pb-4">
                    <TagsInput value={config.closeRelationMatchers.patterns}
                      onChange={(v) => updateConfig((c) => ({ ...c, closeRelationMatchers: { patterns: v } }))}
                      placeholder={messages.settings.people.familyPlaceholder} />
                  </div>
                </div>

                {/* Work card */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="px-4 pt-4 pb-1">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{messages.settings.people.work}</p>
                    <p className="text-[10px] text-muted-foreground mb-3">{messages.settings.people.workHint}</p>
                  </div>
                  <div className="px-4 pb-4">
                    <TagsInput value={config.workRelationMatchers.patterns}
                      onChange={(v) => updateConfig((c) => ({ ...c, workRelationMatchers: { patterns: v } }))}
                      placeholder={messages.settings.people.workPlaceholder} />
                  </div>
                </div>
              </div>
            )}

            {/* ── CONTEXT ── */}
            {profileSubTab === "context" && (
              <div className="space-y-4">
            {/* Structured context files card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-testid="profile-sections">
              <div className="px-4 pt-4 pb-1">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{messages.settings.profile.structuredContextFiles}</p>
                <p className="text-[10px] text-muted-foreground mb-3">
                  Use the selector to move through the main summary and the specific assistant dimensions. Each area is saved as its own file inside the local workspace profile directory.
                </p>
              </div>
              <div className="px-4 pb-4">
                {/* Section selector as flat pills */}
                <div className="flex flex-wrap gap-1.5 mb-5" data-testid="profile-nav">
                  {groupedProfileSections.map((group) =>
                    group.sections.map((section) => {
                      const active = section.id === activeProfileSectionId;
                      return (
                        <button
                          key={section.id}
                          type="button"
                          data-testid={`profile-nav-${section.id}`}
                          onClick={() => setActiveProfileSectionId(section.id)}
                          className={`px-3 py-1.5 rounded-lg text-[13px] transition-all ${
                            active
                              ? "bg-foreground text-background font-medium shadow-sm"
                              : "bg-card text-strong-foreground hover:bg-muted"
                          }`}
                        >
                          {section.title}
                          {section.isPrimary && (
                            <span className={`ml-1.5 text-[10px] ${active ? "text-muted-foreground" : "text-muted-foreground"}`}>
                              Main
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                {activeProfileSection && (
                  <div data-testid="profile-editor">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <h3 className="text-sm font-medium text-strong-foreground">{activeProfileSection.title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{activeProfileSection.description}</p>
                      </div>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap rounded-full bg-card px-2.5 py-1">
                        {activeProfileSection.fileName}
                      </span>
                    </div>
                    <MarkdownEditor
                      key={activeProfileSection.id}
                      value={activeProfileSection.content}
                      data-testid={`profile-section-${activeProfileSection.id}`}
                      onChange={(v) => setProfileSections((prev) => prev.map((item) =>
                        item.id === activeProfileSection.id
                          ? { ...item, content: v }
                          : item
                      ))}
                      rows={14}
                      placeholder={activeProfileSection.placeholder}
                    />
                  </div>
                )}
              </div>
            </div>
              </div>
            )}
          </div>
        )}

        {/* ── ADVANCED TAB ───────────────────────────────────────── */}
        {tab === "advanced" && (() => {
          const activeFile = workspaceFiles.find((f) => f.fileName === activeWorkspaceFile) || null;
          const FILE_DESCRIPTIONS: Record<string, string> = {
            "SOUL.md": messages.settings.advanced.soulDesc,
            "USER.md": messages.settings.advanced.userDesc,
            "IDENTITY.md": messages.settings.advanced.identityDesc,
            "AGENTS.md": messages.settings.advanced.agentsDesc,
            "TOOLS.md": messages.settings.advanced.toolsDesc,
            "HEARTBEAT.md": messages.settings.advanced.heartbeatDesc,
          };

          return (
            <div className="space-y-6">
              <p className="text-xs text-muted-foreground mb-4">
                {messages.settings.advanced.intro}
              </p>

              <div className="flex flex-wrap gap-1.5 mb-4" data-testid="workspace-files-nav">
                {workspaceFiles.map((file) => {
                  const active = file.fileName === activeWorkspaceFile;
                  return (
                    <button
                      key={file.fileName}
                      onClick={() => setActiveWorkspaceFile(file.fileName)}
                      data-testid={`workspace-file-tab-${file.fileName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                      className={`px-3 py-1.5 rounded-lg text-[13px] transition-all ${
                        active
                          ? "bg-foreground text-background font-medium shadow-sm"
                          : "bg-card text-strong-foreground hover:bg-muted"
                      }`}
                    >
                      {file.fileName}
                    </button>
                  );
                })}
              </div>

              {activeFile && (
                <div>
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <h3 className="text-sm font-medium text-strong-foreground">{activeFile.fileName}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {FILE_DESCRIPTIONS[activeFile.fileName] || ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => saveWorkspaceFile(activeFile.fileName, activeFile.content)}
                        disabled={!!workspaceFilesSaving[activeFile.fileName]}
                        data-testid={`workspace-file-save-${activeFile.fileName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                        className="px-3 py-1.5 bg-foreground text-background rounded-lg text-xs hover:bg-foreground-intense disabled:opacity-40 transition-all active:scale-[0.97]"
                      >
                        {workspaceFilesSaving[activeFile.fileName]
                          ? messages.common.saving
                          : messages.settings.advanced.saveFile}
                      </button>
                    </div>
                  </div>
                  <MarkdownEditor
                    key={activeFile.fileName}
                    value={activeFile.content}
                    data-testid={`workspace-file-editor-${activeFile.fileName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                    onChange={(v) => {
                      setWorkspaceFiles((prev) =>
                        prev.map((f) =>
                          f.fileName === activeFile.fileName
                            ? { ...f, content: v }
                            : f
                        )
                      );
                    }}
                    rows={20}
                    spellCheck={false}
                    mono
                  />
                </div>
              )}

              {!workspaceFilesLoaded && (
                <p className="text-xs text-muted-foreground">{messages.common.loading}</p>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
