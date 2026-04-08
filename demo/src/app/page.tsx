"use client";

import { createTtsPlaybackPlan } from "@clawjs/core";
import React, { Suspense, useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { useAppBootstrap } from "@/components/app-bootstrap-provider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLocale } from "@/components/locale-provider";
import { useSidebarOverrides } from "@/components/sidebar-context";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { Attachment, ContextChip, Message, SessionSummary, ChatBootstrapPayload } from "@/lib/app-bootstrap";
import { localized } from "@/lib/i18n/localized";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

type EntityType = "contact" | "notes";

interface ChatPerfPromptBreakdown {
  prepMs?: number;
  emailMs?: number;
  calendarMs?: number;
  totalMs?: number;
  promptChars?: number;
}

interface ChatPerfTrace {
  traceId: string;
  phase?: string;
  totalMs?: number;
  messageCount?: number;
  availabilityMs?: number;
  transcribeMs?: number;
  systemPromptMs?: number;
  ensureAgentMs?: number;
  getClawMs?: number;
  firstChunkMs?: number;
  streamMs?: number;
  transport?: "gateway" | "cli";
  fallback?: boolean;
  retries?: number;
  attempt?: number;
  maxAttempts?: number;
  error?: string;
  prompt?: ChatPerfPromptBreakdown;
}

/**
 * Smooth character-level streaming text.
 * Only used during active streaming. Mounts when streaming starts,
 * finishes its animation after streaming ends, then the parent
 * switches to plain ReactMarkdown.
 */
const CHARS_PER_SECOND = 60;

function StreamingText({ content, onGrow, onComplete }: { content: string; onGrow?: () => void; onComplete?: () => void }) {
  const [displayLen, setDisplayLen] = useState(0);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const displayLenRef = useRef(0);
  const completedRef = useRef(false);

  useEffect(() => {
    if (displayLenRef.current >= content.length) return;

    const tick = (now: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = now;
      const elapsed = now - lastTimeRef.current;
      lastTimeRef.current = now;

      const target = content.length;
      const current = displayLenRef.current;
      if (current >= target) {
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
        return;
      }

      // Gentle acceleration so text feels like smooth typing, never a burst.
      // A 400-char response takes ~4s to render at base speed. The mild
      // acceleration only kicks in when the buffer grows large, keeping the
      // visual effect of text being "typed out" even when chunks arrive fast.
      const buffered = target - current;
      const speed = CHARS_PER_SECOND + Math.min(buffered * 0.5, 80);
      const advance = Math.max(1, Math.round(speed * (elapsed / 1000)));
      const next = Math.min(current + advance, target);

      if (next !== current) {
        displayLenRef.current = next;
        setDisplayLen(next);
        onGrow?.();
      }

      if (next < target) {
        rafRef.current = requestAnimationFrame(tick);
      } else if (!completedRef.current) {
        completedRef.current = true;
        onComplete?.();
      }
    };

    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [content.length]);

  let sliced = content.slice(0, displayLen);
  // Strip [CRISIS] marker during streaming (it will be fully removed post-stream)
  if (sliced.startsWith("[CRISIS]")) {
    sliced = sliced.slice("[CRISIS]".length).replace(/^\n+/, "");
  } else if ("[CRISIS]".startsWith(sliced.trimStart())) {
    // Partial marker being typed, hide it
    sliced = "";
  }
  return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{sliced}</ReactMarkdown>;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

function isImageType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

function VoiceNotePlayer({ src }: { src: string; mimeType?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const animRef = useRef<number | null>(null);

  const updateProgress = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.duration && isFinite(audio.duration)) {
      setProgress(audio.currentTime / audio.duration);
    }
    animRef.current = requestAnimationFrame(updateProgress);
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    } else {
      audio.play().catch((e) => console.error("[voice-player] play failed:", e));
      setPlaying(true);
      animRef.current = requestAnimationFrame(updateProgress);
    }
  }, [playing, updateProgress]);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.preload = "auto";

    const onMeta = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
    const onDurChange = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onTimeUpdate = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setProgress(audio.currentTime / audio.duration);
      }
    };

    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onDurChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);

    audio.src = src;
    audio.load();

    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onDurChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.pause();
      audio.src = "";
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [src]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration || !isFinite(audio.duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * audio.duration;
    setProgress(pct);
  };

  const formatTime = (s: number) => {
    if (!s || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2 w-full">
      <button onClick={togglePlay}
        className="shrink-0 w-5 h-5 relative flex items-center justify-center text-muted-foreground hover:text-tertiary-foreground transition-colors active:scale-95">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"
          className={`absolute transition-all duration-200 ${playing ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}>
          <path d="M10.65 19.11V4.89C10.65 3.54 10.08 3 8.64 3H5.01C3.57 3 3 3.54 3 4.89V19.11C3 20.46 3.57 21 5.01 21H8.64C10.08 21 10.65 20.46 10.65 19.11Z" />
          <path d="M21.0016 19.11V4.89C21.0016 3.54 20.4316 3 18.9916 3H15.3616C13.9316 3 13.3516 3.54 13.3516 4.89V19.11C13.3516 20.46 13.9216 21 15.3616 21H18.9916C20.4316 21 21.0016 20.46 21.0016 19.11Z" />
        </svg>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
          className={`absolute transition-all duration-200 ${playing ? "opacity-0 scale-75" : "opacity-100 scale-100"}`}>
          <path d="M4 11.9999V8.43989C4 4.01989 7.13 2.20989 10.96 4.41989L14.05 6.19989L17.14 7.97989C20.97 10.1899 20.97 13.8099 17.14 16.0199L14.05 17.7999L10.96 19.5799C7.13 21.7899 4 19.9799 4 15.5599V11.9999Z" />
        </svg>
      </button>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 relative h-[6px] bg-border rounded-full cursor-pointer" onClick={handleSeek}>
          <div className="absolute inset-y-0 left-0 bg-muted-foreground rounded-full"
            style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="shrink-0 text-[10px] font-mono text-muted-foreground tabular-nums">
          {!playing && progress === 0 ? formatTime(duration) : formatTime(duration > 0 ? progress * duration : 0)}
        </span>
      </div>
    </div>
  );
}

function fileIcon(mimeType: string): string {
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("word") || mimeType.includes("document")) return "DOC";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "XLS";
  if (mimeType.includes("text")) return "TXT";
  if (mimeType.startsWith("audio/")) return "AUDIO";
  return "FILE";
}

function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

const SUGGESTED_TOPIC_LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  de: "German",
  pt: "Portuguese",
};

const DEFAULT_SUGGESTED_TOPICS_BY_LOCALE: Record<string, string[]> = {
  en: [
    "Relationships",
    "Work stress",
    "Sleep and energy",
    "Communication patterns",
    "Life balance",
    "Anxiety before meetings",
    "Setting boundaries",
    "Feeling disconnected",
    "Family tension",
    "Overthinking",
    "Motivation",
    "Self-esteem",
    "Loneliness",
    "Burnout",
  ],
  es: [
    "Relaciones",
    "Estrés en el trabajo",
    "Sueño y energía",
    "Patrones de comunicación",
    "Equilibrio de vida",
    "Ansiedad antes de reuniones",
    "Poner límites",
    "Sentirme desconectado",
    "Tensión familiar",
    "Dar demasiadas vueltas",
    "Motivación",
    "Autoestima",
    "Soledad",
    "Agotamiento",
  ],
  fr: [
    "Relations",
    "Stress au travail",
    "Sommeil et énergie",
    "Communication",
    "Équilibre de vie",
    "Anxiété avant les réunions",
    "Poser des limites",
    "Sentiment de déconnexion",
    "Tensions familiales",
    "Ruminations",
    "Motivation",
    "Estime de soi",
    "Solitude",
    "Épuisement",
  ],
  it: [
    "Relazioni",
    "Stress al lavoro",
    "Sonno ed energia",
    "Schemi di comunicazione",
    "Equilibrio di vita",
    "Ansia prima delle riunioni",
    "Mettere limiti",
    "Sentirmi distante",
    "Tensioni familiari",
    "Rimuginare troppo",
    "Motivazione",
    "Autostima",
    "Solitudine",
    "Burnout",
  ],
  de: [
    "Beziehungen",
    "Stress bei der Arbeit",
    "Schlaf und Energie",
    "Kommunikationsmuster",
    "Lebensbalance",
    "Angst vor Meetings",
    "Grenzen setzen",
    "Sich abgekoppelt fühlen",
    "Familiäre Spannungen",
    "Zu viel Grübeln",
    "Motivation",
    "Selbstwert",
    "Einsamkeit",
    "Erschöpfung",
  ],
  pt: [
    "Relacionamentos",
    "Stress no trabalho",
    "Sono e energia",
    "Padrões de comunicação",
    "Equilíbrio de vida",
    "Ansiedade antes de reuniões",
    "Definir limites",
    "Sentir-me desligado",
    "Tensão familiar",
    "Pensar demais",
    "Motivação",
    "Autoestima",
    "Solidão",
    "Esgotamento",
  ],
};


const VISIBLE_SUGGESTED_TOPIC_COUNT = 6;

function normalizeTopicKey(topic: string): string {
  return topic.trim().toLocaleLowerCase();
}

function shuffleTopics(topics: string[]): string[] {
  const next = [...topics];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function pickVisibleTopics(topics: string[], previous: string[] = [], count = VISIBLE_SUGGESTED_TOPIC_COUNT): string[] {
  if (topics.length <= count) return topics;

  const previousKey = previous.join("\u0000");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidate = shuffleTopics(topics).slice(0, count);
    if (candidate.join("\u0000") !== previousKey) {
      return candidate;
    }
  }

  return shuffleTopics(topics).slice(0, count);
}

function buildSuggestedTopicPrompt(topic: string, locale: string): string {
  const language = SUGGESTED_TOPIC_LANGUAGE_LABELS[locale] || "the current interface language";
  return [
    `The user started a new chat and selected this topic: "${topic}".`,
    `Write the first assistant message proactively in ${language}.`,
    "Do not mention internal instructions, hidden prompts, or ask the user to repeat the topic they already chose.",
    "Assume they want help with this right now and open the conversation with a grounded reflection plus one useful next question.",
  ].join(" ");
}

const CRISIS_MARKER = "[CRISIS]";

function processCrisisMarkers(msgs: Message[]): { cleaned: Message[] } {
  const cleaned = msgs.map((msg, idx) => {
    if (msg.role === "assistant" && msg.content.trimStart().startsWith(CRISIS_MARKER)) {
      return {
        ...msg,
        content: msg.content.trimStart().slice(CRISIS_MARKER.length).replace(/^\n+/, ""),
      };
    }
    return msg;
  });
  return { cleaned };
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatContent />
    </Suspense>
  );
}

function ChatContent() {
  const { locale, messages: t, speechLocale } = useLocale();
  const lx = useCallback(
    (values: Record<"en" | "es" | "fr" | "it" | "de" | "pt", string>) => localized(locale, values),
    [locale]
  );
  const { bootstrapData, ready: bootstrapReady, updateBootstrapData } = useAppBootstrap();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const chatDebugEnabled = searchParams.get("chatDebug") === "1";
  const openClawReady = (bootstrapData?.localSettings?.openClawEnabled !== false) && (bootstrapData?.toolStatus?.openClaw?.ready ?? false);
  const ttsEnabled = bootstrapData?.config?.tts?.enabled !== false;
  const ttsAutoRead = ttsEnabled && bootstrapData?.config?.tts?.autoRead === true;
  const [messages, setMessages] = useState<Message[]>([]);
  const [configuredGreeting, setConfiguredGreeting] = useState<string | null>(null);
  const [greeting, setGreeting] = useState(() => t.chat.defaultGreeting);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [creatingSession, setCreatingSession] = useState(false);
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [visibleSuggestedTopics, setVisibleSuggestedTopics] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [textAnimDone, setTextAnimDone] = useState(true);
  const [listening, setListening] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceRecordingPaused, setVoiceRecordingPaused] = useState(false);
  const [voiceRecordingTime, setVoiceRecordingTime] = useState(0);
  const [waveformLevels, setWaveformLevels] = useState<number[]>(new Array(24).fill(0));
  const [selectedModel, setSelectedModel] = useState("openclaw");
  const [correctionIdx, setCorrectionIdx] = useState<number | null>(null);
  const [contextOptions, setContextOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [chatTrace, setChatTrace] = useState<ChatPerfTrace | null>(null);
  const [correctionContext, setCorrectionContext] = useState("general");
  const [correctionText, setCorrectionText] = useState("");
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [conversationScrollTop, setConversationScrollTop] = useState(0);
  const [conversationScrollBottomGap, setConversationScrollBottomGap] = useState(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendMessageRef = useRef<() => void>(() => {});
  const inputRef2 = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const fullResponseRef = useRef("");
  const confirmedTranscriptRef = useRef("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recorderMimeTypeRef = useRef("audio/webm");
  const audioStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const waveformAnimRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingTimeRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pendingVoiceAttachmentRef = useRef<Attachment | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const sessionMessagesCacheRef = useRef<Record<string, Message[]>>({});
  const sessionsStateRef = useRef<SessionSummary[]>([]);
  const activeSessionIdRef = useRef<string | null>(null);
  const didHydrateFromBootstrapRef = useRef(false);
  const entityConversationTriggeredRef = useRef(false);
  const anonMapRef = useRef<Record<string, string>>({});
  const sessionAnonMapsRef = useRef<Record<string, Record<string, string>>>({});
  const [hasSpeechSupport, setHasSpeechSupport] = useState(false);

  const chatTraceSummary = useMemo(() => {
    if (!chatTrace) return "";
    const parts: string[] = [];
    if (chatTrace.transport) {
      parts.push(chatTrace.fallback ? `${chatTrace.transport} fallback` : chatTrace.transport);
    }
    if (typeof chatTrace.firstChunkMs === "number") parts.push(`first chunk ${chatTrace.firstChunkMs}ms`);
    if (typeof chatTrace.systemPromptMs === "number") parts.push(`prompt ${chatTrace.systemPromptMs}ms`);
    if (typeof chatTrace.streamMs === "number") parts.push(`stream ${chatTrace.streamMs}ms`);
    if (typeof chatTrace.totalMs === "number") parts.push(`total ${chatTrace.totalMs}ms`);
    if (typeof chatTrace.retries === "number" && chatTrace.retries > 0) parts.push(`retries ${chatTrace.retries}`);
    if (chatTrace.prompt?.promptChars) parts.push(`${chatTrace.prompt.promptChars} chars`);
    if (chatTrace.error) parts.push(chatTrace.error);
    return parts.join(" • ");
  }, [chatTrace]);

  // Context chips & popups
  const [contextChips, setContextChips] = useState<ContextChip[]>([]);
  const [contextPickerOpen, setContextPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [notesPickerOpen, setNotesPickerOpen] = useState(false);
  const [dummyNoteEntries] = useState([
    {
      id: "j1",
      title: { en: "Morning reflection", es: "Reflexión matinal", fr: "Réflexion du matin", it: "Riflessione del mattino", de: "Morgenreflexion", pt: "Reflexão matinal" },
      date: "2026-03-18",
      preview: { en: "Today I woke up feeling more centered than usual...", es: "Hoy me desperté sintiéndome más centrado de lo habitual...", fr: "Aujourd'hui je me suis réveillé en me sentant plus centré que d'habitude...", it: "Oggi mi sono svegliato sentendomi più centrato del solito...", de: "Heute bin ich aufgewacht und fühlte mich zentrierter als sonst...", pt: "Hoje acordei a sentir-me mais centrado do que o habitual..." },
    },
    {
      id: "j2",
      title: { en: "Chat notes", es: "Notas de chat", fr: "Notes de chat", it: "Note di chat", de: "Chat-Notizen", pt: "Notas de chat" },
      date: "2026-03-17",
      preview: { en: "We talked about setting boundaries with my family...", es: "Hablamos de poner límites con mi familia...", fr: "Nous avons parlé de poser des limites avec ma famille...", it: "Abbiamo parlato di mettere dei limiti con la mia famiglia...", de: "Wir haben darüber gesprochen, Grenzen gegenüber meiner Familie zu setzen...", pt: "Falámos sobre definir limites com a minha família..." },
    },
    {
      id: "j3",
      title: { en: "Gratitude list", es: "Lista de gratitud", fr: "Liste de gratitude", it: "Lista della gratitudine", de: "Dankbarkeitsliste", pt: "Lista de gratidão" },
      date: "2026-03-16",
      preview: { en: "Three things I'm grateful for today: 1) The conversation...", es: "Tres cosas por las que hoy siento gratitud: 1) La conversación...", fr: "Trois choses pour lesquelles je suis reconnaissant aujourd'hui : 1) La conversation...", it: "Tre cose per cui oggi provo gratitudine: 1) La conversazione...", de: "Drei Dinge, für die ich heute dankbar bin: 1) Das Gespräch...", pt: "Três coisas pelas quais hoje sinto gratidão: 1) A conversa..." },
    },
    {
      id: "j4",
      title: { en: "Anxiety trigger log", es: "Registro de detonantes de ansiedad", fr: "Journal des déclencheurs d'anxiété", it: "Registro dei trigger d'ansia", de: "Protokoll zu Angstauslösern", pt: "Registo de gatilhos de ansiedade" },
      date: "2026-03-15",
      preview: { en: "Noticed a pattern: the anxiety spikes right before...", es: "He notado un patrón: la ansiedad sube justo antes de...", fr: "J'ai remarqué un schéma : l'anxiété monte juste avant...", it: "Ho notato uno schema: l'ansia sale proprio prima di...", de: "Mir ist ein Muster aufgefallen: Die Angst steigt kurz vor...", pt: "Notei um padrão: a ansiedade dispara mesmo antes de..." },
    },
    {
      id: "j5",
      title: { en: "Weekend thoughts", es: "Pensamientos del fin de semana", fr: "Pensées du week-end", it: "Pensieri del fine settimana", de: "Gedanken zum Wochenende", pt: "Pensamentos do fim de semana" },
      date: "2026-03-14",
      preview: { en: "Spent time with Carlos and realized how much...", es: "Pasé tiempo con Carlos y me di cuenta de cuánto...", fr: "J'ai passé du temps avec Carlos et j'ai réalisé à quel point...", it: "Ho passato del tempo con Carlos e mi sono reso conto di quanto...", de: "Ich habe Zeit mit Carlos verbracht und gemerkt, wie sehr...", pt: "Passei tempo com o Carlos e percebi o quanto..." },
    },
  ]);

  // Real contacts from API
  const [realContacts, setRealContacts] = useState<Array<{ id: string; name: string; relationship: string; avatar: { type: string; value?: string }; emoji?: string }>>([]);
  const [contextDataLoaded, setContextDataLoaded] = useState(false);

  const fetchContextData = useCallback(async () => {
    try {
      const pRes = await fetch("/api/contacts");
      if (pRes.ok) {
        const { contacts } = await pRes.json();
        setRealContacts(contacts || []);
      }
      setContextDataLoaded(true);
    } catch {
      setContextDataLoaded(true);
    }
  }, []);

  // Fetch when context picker opens for the first time
  useEffect(() => {
    if (contextPickerOpen && !contextDataLoaded) {
      fetchContextData();
    }
  }, [contextPickerOpen, contextDataLoaded, fetchContextData]);

  const removeContextChip = useCallback((id: string) => {
    setContextChips((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const toggleContextChip = useCallback((chip: ContextChip) => {
    setContextChips((prev) => {
      const exists = prev.some((c) => c.id === chip.id);
      if (exists) return prev.filter((c) => c.id !== chip.id);
      return [...prev, chip];
    });
  }, []);

  const effectiveConfiguredGreeting = useMemo(() => {
    const trimmed = configuredGreeting?.trim();
    if (!trimmed) return null;
    if (trimmed.replace(/\s+/g, " ") === t.chat.defaultGreeting.trim().replace(/\s+/g, " ")) {
      return null;
    }
    return trimmed;
  }, [configuredGreeting, t.chat.defaultGreeting]);

  const greetingPool = useMemo(
    () => [effectiveConfiguredGreeting || t.chat.defaultGreeting],
    [effectiveConfiguredGreeting, t.chat.defaultGreeting]
  );

  const topicPool = useMemo(() => {
    const defaults = DEFAULT_SUGGESTED_TOPICS_BY_LOCALE[locale] || DEFAULT_SUGGESTED_TOPICS_BY_LOCALE.en;
    const deduped = new Map<string, string>();

    [...suggestedTopics, ...defaults].forEach((topic) => {
      if (!topic?.trim()) return;
      deduped.set(normalizeTopicKey(topic), topic.trim());
    });

    return [...deduped.values()];
  }, [locale, suggestedTopics]);

  const summarizeSessionTitle = useCallback((sessionMessages: Message[]): string => {
    const meaningfulUserMessage = sessionMessages.find((message) => message.role === "user" && message.content.trim());
    const meaningfulAssistantMessage = sessionMessages.find((message) => message.role === "assistant" && message.content.trim());
    const source = meaningfulUserMessage?.content || meaningfulAssistantMessage?.content || t.chat.newSession;
    const normalized = source.replace(/\s+/g, " ").trim();
    return normalized.length > 48 ? `${normalized.slice(0, 48).trim()}...` : normalized || t.chat.newSession;
  }, [t.chat.newSession]);

  const summarizeSessionPreview = useCallback((sessionMessages: Message[]): string => {
    const lastMessage = [...sessionMessages].reverse().find((message) => message.content.trim());
    if (!lastMessage) return "";
    const normalized = lastMessage.content.replace(/\s+/g, " ").trim();
    return normalized.length > 96 ? `${normalized.slice(0, 96).trim()}...` : normalized;
  }, []);

  const sortSessions = useCallback((nextSessions: SessionSummary[]) => (
    [...nextSessions].sort((a, b) => b.updatedAt - a.updatedAt)
  ), []);

  const setLocalSessions = useCallback((nextSessions: SessionSummary[]) => {
    sessionsStateRef.current = nextSessions;
    setSessions(nextSessions);
  }, []);

  const updateBootstrapSessions = useCallback((nextSessions: SessionSummary[], nextActiveSessionId?: string | null) => {
    updateBootstrapData((current) => ({
      ...current,
      sessions: nextSessions,
      activeSessionId: nextActiveSessionId === undefined ? current.activeSessionId : nextActiveSessionId,
    }));
  }, [updateBootstrapData]);

  // De-anonymize text by replacing P-XX pseudonyms with real names
  const deAnonymize = useCallback((text: string, map: Record<string, string>): string => {
    if (!text || !map || Object.keys(map).length === 0) return text;
    let result = text;
    // Sort by pseudonym length (longest first) to avoid partial replacements
    const entries = Object.entries(map).sort((a, b) => b[0].length - a[0].length);
    for (const [pseudonym, realName] of entries) {
      result = result.replaceAll(pseudonym, realName);
    }
    return result;
  }, []);

  const cacheSessionMessages = useCallback((sessionId: string, sessionMessages: Message[]) => {
    sessionMessagesCacheRef.current = {
      ...sessionMessagesCacheRef.current,
      [sessionId]: sessionMessages,
    };
    updateBootstrapData((current) => ({
      ...current,
      activeSessionId: sessionId,
      sessionMessages: {
        ...current.sessionMessages,
        [sessionId]: sessionMessages,
      },
    }));
  }, [updateBootstrapData]);

  const hydrateChatBootstrap = useCallback((chatData: ChatBootstrapPayload) => {
    setConfiguredGreeting(chatData.greeting || null);
    if (Array.isArray(chatData.models)) {
      const available = chatData.models
        .filter((model) => model.available)
        .map((model) => model.id);
      if (available.length > 0) {
        setSelectedModel((current) => (available.includes(current) ? current : available[0]));
      }
    }
    if (chatData.suggestedTopics) setSuggestedTopics(chatData.suggestedTopics);
    if (chatData.contextShortLabels) {
      const opts = Object.entries(chatData.contextShortLabels).map(([id, label]) => ({ id, label }));
      opts.push({ id: "general", label: t.chat.generalContextLabel });
      setContextOptions(opts);
    }
  }, [t.chat.generalContextLabel]);

  const upsertSessionSummary = useCallback((sessionId: string, sessionMessages: Message[], preferredTitle?: string) => {
    const currentSessions = sessionsStateRef.current;
    const now = Date.now();
    const existing = currentSessions.find((session) => session.sessionId === sessionId);
    const stableExistingTitle = existing?.title?.trim();
    const next: SessionSummary = {
      sessionId,
      title: preferredTitle?.trim()
        || (stableExistingTitle && stableExistingTitle !== t.chat.newSession
          ? stableExistingTitle
          : summarizeSessionTitle(sessionMessages)),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      messageCount: sessionMessages.length,
      preview: summarizeSessionPreview(sessionMessages),
    };
    const nextSessions = sortSessions([next, ...currentSessions.filter((session) => session.sessionId !== sessionId)]);
    setLocalSessions(nextSessions);
    updateBootstrapSessions(nextSessions, sessionId);
  }, [setLocalSessions, sortSessions, summarizeSessionPreview, summarizeSessionTitle, t.chat.newSession, updateBootstrapSessions]);

  const refreshSessions = useCallback(async (preferredSessionId?: string | null) => {
    const res = await fetch("/api/chat/sessions");
    const data = await res.json();
    const nextSessions = sortSessions(Array.isArray(data.sessions) ? data.sessions as SessionSummary[] : []);
    setLocalSessions(nextSessions);
    const nextActiveSessionId = preferredSessionId && nextSessions.some((session) => session.sessionId === preferredSessionId)
      ? preferredSessionId
      : nextSessions[0]?.sessionId || null;
    updateBootstrapSessions(nextSessions, nextActiveSessionId);
    return nextActiveSessionId;
  }, [setLocalSessions, sortSessions, updateBootstrapSessions]);

  const loadSession = useCallback(async (sessionId: string) => {
    if (sessionId === activeSessionId) return;

    setStreaming(false);

    const cachedMessages = sessionMessagesCacheRef.current[sessionId];
    if (cachedMessages) {
      const { cleaned } = processCrisisMarkers(cachedMessages);
      setActiveSessionId(sessionId);
      setMessages(cleaned);
      setLoadingSession(false);
      updateBootstrapData((current) => ({
        ...current,
        activeSessionId: sessionId,
      }));
      return;
    }

    setLoadingSession(true);
    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}`);
      if (!res.ok) throw new Error("Failed to load session");
      const data = await res.json();
      const sessionMessages = Array.isArray(data.session?.messages) ? data.session.messages : [];
      const { cleaned } = processCrisisMarkers(sessionMessages);
      setActiveSessionId(sessionId);
      setMessages(cleaned);
      cacheSessionMessages(sessionId, sessionMessages);
    } finally {
      setLoadingSession(false);
    }
  }, [activeSessionId, cacheSessionMessages, updateBootstrapData]);

  const createSession = useCallback(async (initialTitle?: string) => {
    if (!openClawReady || creatingSession) return null;
    setCreatingSession(true);
    try {
      const res = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initialTitle?.trim() ? { title: initialTitle.trim() } : {}),
      });
      if (!res.ok) throw new Error("Failed to create session");
      const data = await res.json();
      const sessionId = data.session?.sessionId as string | undefined;
      if (!sessionId) throw new Error("Missing session id");

      setActiveSessionId(sessionId);
      setMessages([]);
      setLoadingSession(false);
      cacheSessionMessages(sessionId, []);
      const nextSessions = sortSessions([
        {
          sessionId,
          title: initialTitle?.trim() || data.session?.title || t.chat.newSession,
          createdAt: data.session?.createdAt || Date.now(),
          updatedAt: data.session?.updatedAt || Date.now(),
          messageCount: 0,
          preview: "",
        },
        ...sessionsStateRef.current.filter((session) => session.sessionId !== sessionId),
      ]);
      setLocalSessions(nextSessions);
      updateBootstrapSessions(nextSessions, sessionId);

      return sessionId;
    } finally {
      setCreatingSession(false);
    }
  }, [cacheSessionMessages, creatingSession, openClawReady, setLocalSessions, sortSessions, t.chat.newSession, updateBootstrapSessions]);

  const startNewDraft = useCallback(() => {
    recognitionRef.current?.stop();
    confirmedTranscriptRef.current = "";
    setListening(false);
    setActiveSessionId(null);
    setMessages([]);
    setGreeting(greetingPool[0] || t.chat.defaultGreeting);
    setVisibleSuggestedTopics((current) => pickVisibleTopics(topicPool, current, VISIBLE_SUGGESTED_TOPIC_COUNT));
    setInput("");
    setAttachments([]);
    setLoadingSession(false);
    setCorrectionIdx(null);
    setCorrectionText("");
    setCorrectionContext("general");
    updateBootstrapSessions(sessionsStateRef.current, null);
  }, [greetingPool, topicPool, updateBootstrapSessions, t.chat.defaultGreeting]);

  // Register sidebar overrides so the layout-level sidebar uses this page's
  // sessions, activeSessionId, and handlers while mounted
  const { setSidebarOverrides } = useSidebarOverrides();
  useEffect(() => {
    setSidebarOverrides({
      sessions,
      activeSessionId,
      onSessionClick: (id: string) => { void loadSession(id); },
      onNewSession: startNewDraft,
    });
    return () => setSidebarOverrides(null);
  }, [sessions, activeSessionId, loadSession, startNewDraft, setSidebarOverrides]);

  useEffect(() => {
    setGreeting(greetingPool[0] || t.chat.defaultGreeting);
  }, [greetingPool, t.chat.defaultGreeting]);

  useEffect(() => {
    if (didHydrateFromBootstrapRef.current) return;

    if (bootstrapData) {
      didHydrateFromBootstrapRef.current = true;
      hydrateChatBootstrap(bootstrapData.chat);

      const nextSessions = sortSessions(bootstrapData.sessions);
      sessionMessagesCacheRef.current = { ...bootstrapData.sessionMessages };
      setLocalSessions(nextSessions);

      // If the sidebar set activeSessionId (e.g. session clicked from a tool page),
      // auto-load that session instead of starting fresh
      const pendingSessionId = bootstrapData.activeSessionId;
      if (pendingSessionId && nextSessions.some((s) => s.sessionId === pendingSessionId)) {
        void loadSession(pendingSessionId);
      } else {
        setActiveSessionId(null);
        setMessages([]);
        setLoadingSession(false);
      }
      updateBootstrapSessions(nextSessions, pendingSessionId ?? null);
      return;
    }

    if (!bootstrapReady) return;

    let cancelled = false;

    (async () => {
      try {
        const [chatRes, sessionsRes] = await Promise.all([
          fetch("/api/chat"),
          fetch("/api/chat/sessions"),
        ]);
        const data = await chatRes.json();
        const sessionsData = await sessionsRes.json();
        if (cancelled) return;

        didHydrateFromBootstrapRef.current = true;
        hydrateChatBootstrap(data as ChatBootstrapPayload);

        const nextSessions = Array.isArray(sessionsData.sessions)
          ? sortSessions(sessionsData.sessions as SessionSummary[])
          : [];
        setLocalSessions(nextSessions);
        setActiveSessionId(null);
        setMessages([]);
        setLoadingSession(false);
        updateBootstrapSessions(nextSessions, null);
      } catch {
        if (cancelled) return;
        setConfiguredGreeting(null);
        setMessages([]);
        setLoadingSession(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    bootstrapData,
    bootstrapReady,
    hydrateChatBootstrap,
    setLocalSessions,
    sortSessions,
    updateBootstrapSessions,
  ]);

  useEffect(() => {
    setHasSpeechSupport(
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    );
  }, []);

  useEffect(() => {
    if (loadingSession || messages.length > 0) return;
    setVisibleSuggestedTopics((current) => {
      if (current.length === 0) {
        return pickVisibleTopics(topicPool, [], VISIBLE_SUGGESTED_TOPIC_COUNT);
      }

      const allTopicsStillAvailable = current.every((topic) => topicPool.includes(topic));
      return allTopicsStillAvailable ? current : pickVisibleTopics(topicPool, current, VISIBLE_SUGGESTED_TOPIC_COUNT);
    });
  }, [loadingSession, messages.length, topicPool]);

  useEffect(() => { inputRef2.current = input; }, [input]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);
  useEffect(() => {
    if (messages.length === 0) {
      setConversationScrollTop(0);
      setConversationScrollBottomGap(0);
    }
  }, [messages.length, activeSessionId]);

  const syncScrollMetrics = useCallback(() => {
    const viewport = scrollViewportRef.current;
    if (viewport) {
      setConversationScrollTop(viewport.scrollTop);
      setConversationScrollBottomGap(
        Math.max(viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop, 0)
      );
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const viewport = scrollViewportRef.current;
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
        syncScrollMetrics();
      }
    });
  }, [syncScrollMetrics]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Suppress CSS transition on fade overlays when switching sessions
  // to avoid the gradient animating from 0 → target opacity on mount.
  const [fadeTransitionEnabled, setFadeTransitionEnabled] = useState(false);
  useLayoutEffect(() => {
    setFadeTransitionEnabled(false);
    const viewport = scrollViewportRef.current;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
    syncScrollMetrics();
    const raf = requestAnimationFrame(() => {
      setFadeTransitionEnabled(true);
    });
    return () => cancelAnimationFrame(raf);
    // Only reset transition on session change, not every message
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // Keep metrics in sync when messages change (after initial mount)
  useLayoutEffect(() => {
    syncScrollMetrics();
  }, [messages, syncScrollMetrics]);

  const handleConversationScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget;
    setConversationScrollTop(viewport.scrollTop);
    setConversationScrollBottomGap(
      Math.max(viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop, 0)
    );
  }, []);

  // Autofocus the textarea when ready
  useEffect(() => {
    if (!loadingSession && !streaming) {
      inputRef.current?.focus();
    }
  }, [loadingSession, streaming, activeSessionId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const att: Attachment = {
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          data: dataUrl,
          preview: isImageType(file.type) ? dataUrl : undefined,
        };
        setAttachments((prev) => [...prev, att]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (!files.length) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const att: Attachment = {
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          data: dataUrl,
          preview: isImageType(file.type) ? dataUrl : undefined,
        };
        setAttachments((prev) => [...prev, att]);
      };
      reader.readAsDataURL(file);
    });
  };

  const startListening = () => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return;
    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = speechLocale;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let confirmed = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) confirmed += text;
        else interim += text;
      }
      confirmedTranscriptRef.current = confirmed;
      setInput(confirmed + interim);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = (event: { error: string }) => {
      console.error("Speech recognition error:", event.error);
      setListening(false);
    };
    recognitionRef.current = recognition;
    confirmedTranscriptRef.current = "";
    recognition.start();
    setListening(true);
  };

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    confirmedTranscriptRef.current = "";
    setListening(false);
  }, []);

  const toggleListening = () => {
    if (listening) stopListening();
    else startListening();
  };

  // ── Voice recording (MediaRecorder) ──

  const stopWaveformAnimation = useCallback(() => {
    if (waveformAnimRef.current) {
      cancelAnimationFrame(waveformAnimRef.current);
      waveformAnimRef.current = null;
    }
  }, []);

  const startWaveformAnimation = useCallback((analyser: AnalyserNode) => {
    const dataArray = new Uint8Array(analyser.fftSize);
    const update = () => {
      analyser.getByteTimeDomainData(dataArray);
      const bars = 24;
      const step = Math.floor(dataArray.length / bars);
      const levels: number[] = [];
      for (let i = 0; i < bars; i++) {
        let max = 0;
        for (let j = 0; j < step; j++) {
          const v = Math.abs(dataArray[i * step + j] - 128);
          if (v > max) max = v;
        }
        levels.push(Math.min(1, max / 10));
      }
      setWaveformLevels(levels);
      waveformAnimRef.current = requestAnimationFrame(update);
    };
    update();
  }, []);

  const startVoiceRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          noiseSuppression: false,
          echoCancellation: false,
        },
      });
      audioStreamRef.current = stream;

      // Set up analyser for waveform. Must resume AudioContext after getUserMedia
      const audioCtx = new AudioContext();
      if (audioCtx.state === "suspended") await audioCtx.resume();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      recorderMimeTypeRef.current = mediaRecorder.mimeType || mimeType;

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setVoiceRecording(true);
      setVoiceRecordingPaused(false);
      setVoiceRecordingTime(0);
      recordingTimeRef.current = 0;

      // Start timer, keep ref in sync for reliable reads
      recordingTimerRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setVoiceRecordingTime(recordingTimeRef.current);
      }, 1000);

      // Start waveform
      startWaveformAnimation(analyser);
    } catch (e) {
      console.error("[voice] Failed to start recording:", e);
    }
  }, [startWaveformAnimation]);

  const pauseVoiceRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setVoiceRecordingPaused(true);
      stopWaveformAnimation();
      setWaveformLevels(new Array(24).fill(0));
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  }, [stopWaveformAnimation]);

  const resumeVoiceRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setVoiceRecordingPaused(false);
      if (analyserRef.current) startWaveformAnimation(analyserRef.current);
      recordingTimerRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setVoiceRecordingTime(recordingTimeRef.current);
      }, 1000);
    }
  }, [startWaveformAnimation]);

  const cancelVoiceRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    stopWaveformAnimation();
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimeRef.current = 0;
    setVoiceRecording(false);
    setVoiceRecordingPaused(false);
    setVoiceRecordingTime(0);
    setWaveformLevels(new Array(24).fill(0));
  }, [stopWaveformAnimation]);

  const sendVoiceRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    const duration = recordingTimeRef.current;
    const mimeType = recorderMimeTypeRef.current;
    mediaRecorderRef.current = null;

    // Stop recorder and collect the complete audio blob
    const audioBlob = await new Promise<Blob>((resolve) => {
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mimeType }));
      };
      recorder.stop();
    });

    // Cleanup stream, audio context & animation
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    stopWaveformAnimation();
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    recordingTimeRef.current = 0;
    setVoiceRecording(false);
    setVoiceRecordingPaused(false);
    setVoiceRecordingTime(0);
    setWaveformLevels(new Array(24).fill(0));

    if (audioBlob.size < 100) return;

    // Convert to data URL and send as attachment
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(audioBlob);
    });

    const mins = Math.floor(duration / 60).toString().padStart(2, "0");
    const secs = (duration % 60).toString().padStart(2, "0");

    const att: Attachment = {
      name: `voice-${mins}${secs}.webm`,
      mimeType: mimeType,
      data: dataUrl,
    };

    pendingVoiceAttachmentRef.current = att;
    setAttachments((prev) => [...prev, att]);
  }, [stopWaveformAnimation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      if (audioStreamRef.current) audioStreamRef.current.getTracks().forEach((t) => t.stop());
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
      if (waveformAnimRef.current) cancelAnimationFrame(waveformAnimRef.current);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  const ttsCancelledRef = useRef(false);
  const ttsSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ttsAudioCtxRef = useRef<AudioContext | null>(null);
  const speakingIdxRef = useRef<number | null>(null);

  const stopTts = useCallback(() => {
    ttsCancelledRef.current = true;
    if (ttsSourceRef.current) {
      try { ttsSourceRef.current.stop(); } catch {}
      ttsSourceRef.current = null;
    }
    if (ttsAudioCtxRef.current && ttsAudioCtxRef.current.state !== "closed") {
      ttsAudioCtxRef.current.close().catch(() => {});
      ttsAudioCtxRef.current = null;
    }
    speakingIdxRef.current = null;
    setSpeakingIdx(null);
  }, []);

  const speakText = useCallback(async (text: string, idx: number) => {
    if (speakingIdxRef.current === idx) { stopTts(); return; }
    stopTts();

    ttsCancelledRef.current = false;
    setSpeakingIdx(idx);
    speakingIdxRef.current = idx;

    const playbackPlan = createTtsPlaybackPlan({ text });
    if (!playbackPlan.plainText) {
      speakingIdxRef.current = null;
      setSpeakingIdx(null);
      return;
    }

    if (!ttsAudioCtxRef.current || ttsAudioCtxRef.current.state === "closed") {
      ttsAudioCtxRef.current = new AudioContext();
    }
    const ctx = ttsAudioCtxRef.current;
    if (ctx.state === "suspended") await ctx.resume();

    // Process sentences sequentially in order
    for (const segment of playbackPlan.segments) {
      if (ttsCancelledRef.current) break;
      if (!segment.text.trim()) continue;
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: segment.text, lang: locale }),
        });
        if (ttsCancelledRef.current) break;
        const ct = res.headers.get("content-type") || "";
        if (!res.ok || !(ct.includes("audio") || ct.includes("mpeg"))) continue;
        const buf = await res.arrayBuffer();
        if (ttsCancelledRef.current) break;
        const audioBuffer = await ctx.decodeAudioData(buf.slice(0));
        if (ttsCancelledRef.current) break;
        await new Promise<void>((resolve) => {
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          source.onended = () => { ttsSourceRef.current = null; resolve(); };
          ttsSourceRef.current = source;
          source.start();
        });
      } catch {
        if (ttsCancelledRef.current) break;
      }
    }

    if (speakingIdxRef.current === idx) {
      speakingIdxRef.current = null;
      setSpeakingIdx(null);
    }
  }, [stopTts, locale]);

  // Stop TTS when changing session, navigating away, hiding tab, or unmounting
  useEffect(() => { stopTts(); }, [activeSessionId, pathname, stopTts]);
  useEffect(() => {
    const onVisChange = () => { if (document.hidden) stopTts(); };
    document.addEventListener("visibilitychange", onVisChange);
    return () => { stopTts(); document.removeEventListener("visibilitychange", onVisChange); };
  }, [stopTts]);

  const submitCorrection = async () => {
    if (!correctionText.trim() || correctionSaving) return;
    setCorrectionSaving(true);
    try {
      await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correction: correctionText.trim(), contextId: correctionContext }),
      });
      setCorrectionIdx(null); setCorrectionText(""); setCorrectionContext("general");
    } catch (e) { console.error("Correction submit error:", e); }
    setCorrectionSaving(false);
  };

  const streamAssistantReply = useCallback(async ({
    requestMessages,
    visibleMessages,
    sessionId: initialSessionId,
    persistLatestUserMessage = true,
    initialSessionTitle,
    starterPrompt,
  }: {
    requestMessages: Message[];
    visibleMessages: Message[];
    sessionId: string;
    persistLatestUserMessage?: boolean;
    initialSessionTitle?: string;
    starterPrompt?: string;
  }) => {
    let sessionId = initialSessionId;
    setStreaming(true);
    setTextAnimDone(false);
    fullResponseRef.current = "";
    if (inputRef.current) inputRef.current.style.height = "auto";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    setChatTrace(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: requestMessages,
          model: selectedModel,
          sessionId,
          persistLatestUserMessage,
          initialSessionTitle,
          starterPrompt,
          debugTrace: chatDebugEnabled,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: t.chat.streamedError(err.error || "Failed to connect") };
          return updated;
        });
        const errorMessages: Message[] = [
          ...visibleMessages,
          { role: "assistant", content: t.chat.streamedError(err.error || "Failed to connect") },
        ];
        window.setTimeout(() => cacheSessionMessages(sessionId, errorMessages), 0);
        setStreaming(false);
        return;
      }

      const responseSessionId = res.headers.get("X-ClawJS-Session-Id") || res.headers.get("X-ClawJS-Legacy-Session-Id");
      if (responseSessionId && responseSessionId !== activeSessionId) {
        setActiveSessionId(responseSessionId);
        sessionId = responseSessionId;
      }

      const traceId = res.headers.get("X-ClawJS-Chat-Trace-Id");
      if (chatDebugEnabled && traceId) {
        setChatTrace((prev) => ({ ...(prev ?? { traceId }), traceId }));
      }

      // Read anonymization reverse map for de-anonymizing AI responses
      const anonMapHeader = res.headers.get("X-ClawJS-Anon-Map") || res.headers.get("X-ClawJS-Legacy-Anon-Map");
      let currentAnonMap: Record<string, string> = {};
      if (anonMapHeader) {
        try {
          currentAnonMap = JSON.parse(atob(anonMapHeader));
          anonMapRef.current = currentAnonMap;
          // Save map associated with this session for later de-anonymization
          sessionAnonMapsRef.current[sessionId] = currentAnonMap;
        } catch {
          // Invalid map, continue without de-anonymization
        }
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.debug && chatDebugEnabled) {
              const nextDebug = parsed.debug as ChatPerfTrace;
              setChatTrace((prev) => ({
                ...(prev ?? { traceId: nextDebug.traceId || traceId || "trace" }),
                ...nextDebug,
                prompt: nextDebug.prompt ?? prev?.prompt,
              }));
            }

            if (!parsed.text) continue;

            fullResponseRef.current += parsed.text;
            // De-anonymize for display: replace P-XX codes with real names
            const displayContent = deAnonymize(fullResponseRef.current, currentAnonMap);
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { ...updated[updated.length - 1], content: displayContent };
              return updated;
            });
            upsertSessionSummary(sessionId, [
              ...visibleMessages,
              { role: "assistant", content: displayContent },
            ], initialSessionTitle);
            scrollToBottom();

          } catch {
            // Skip malformed chunks.
          }
        }
      }
    } catch (e) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: t.chat.connectionError(String(e)) };
        return updated;
      });
    }

    setStreaming(false);

    const rawResponse = fullResponseRef.current.trim();
    const hasCrisisMarker = rawResponse.startsWith(CRISIS_MARKER);
    if (hasCrisisMarker) {
      // Strip marker from visible text (but keep raw for cache/persistence)
      const cleanedResponse = rawResponse.slice(CRISIS_MARKER.length).replace(/^\n+/, "");
      fullResponseRef.current = cleanedResponse;
      const displayCleaned = deAnonymize(cleanedResponse, anonMapRef.current);
      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === "assistant") {
          updated[lastIdx] = { ...updated[lastIdx], content: displayCleaned };
        }
        return updated;
      });
    }
    await refreshSessions(sessionId);
    const finalResponseContent = deAnonymize(rawResponse, anonMapRef.current);
    const finalMessages: Message[] = [
      ...visibleMessages,
      ...(rawResponse
        ? [{ role: "assistant" as const, content: finalResponseContent }]
        : []),
    ];
    cacheSessionMessages(sessionId, finalMessages);

    // Auto-read the response aloud if enabled (use de-anonymized text)
    const ttsText = deAnonymize(fullResponseRef.current, anonMapRef.current);
    if (ttsAutoRead && ttsText.trim()) {
      speakText(ttsText, finalMessages.length - 1);
    }

    // Generate a smart title after the first exchange (2 messages) and again after the second (4 messages)
    if ((finalMessages.length === 2 || finalMessages.length === 4) && finalMessages.some((m) => m.role === "assistant")) {
      fetch(`/api/chat/sessions/${sessionId}/generate-title`, { method: "POST" })
        .then((res) => res.json())
        .then((data) => {
          if (data.title) {
            // Update the session title in the local sidebar
            const updated = sessionsStateRef.current.map((s) =>
              s.sessionId === sessionId ? { ...s, title: data.title } : s
            );
            setLocalSessions(updated);
            updateBootstrapSessions(updated, sessionId);
          }
        })
        .catch(() => { /* background title generation, ignore errors */ });
    }

    inputRef.current?.focus();
  }, [
    activeSessionId,
    cacheSessionMessages,
    chatDebugEnabled,
    deAnonymize,
    refreshSessions,
    scrollToBottom,
    selectedModel,
    setLocalSessions,
    speakText,
    t.chat,
    ttsAutoRead,
    updateBootstrapSessions,
    upsertSessionSummary,
  ]);

  const sendMessage = async () => {
    if (!openClawReady) return;
    const text = (input || inputRef2.current).trim();
    if ((!text && attachments.length === 0) || streaming) return;
    if (listening) stopListening();

    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = await createSession();
      if (!sessionId) return;
    }

    const hasVoiceAttachment = attachments.some((a) => a.mimeType.startsWith("audio/"));
    const fallbackContent = hasVoiceAttachment
      ? "[Voice message]"
      : attachments.length > 0 ? t.chat.fileSentSummary(attachments.length) : "";

    const userMsg: Message = {
      role: "user",
      content: text || fallbackContent,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
      contextChips: contextChips.length > 0 ? [...contextChips] : undefined,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages); setInput(""); setAttachments([]);
    setContextChips([]);
    cacheSessionMessages(sessionId, newMessages);
    upsertSessionSummary(sessionId, newMessages);
    await streamAssistantReply({
      requestMessages: newMessages,
      visibleMessages: newMessages,
      sessionId,
    });
  };

  const startContextualConversation = useCallback(async (topicLabel: string, starterPrompt: string) => {
    if (!topicLabel.trim() || streaming || creatingSession) return;
    if (listening) stopListening();

    const sessionId = await createSession(topicLabel);
    if (!sessionId) return;

    setInput("");
    setAttachments([]);

    const topicUserMsg: Message = { role: "user", content: topicLabel.trim() };
    const topicMessages: Message[] = [topicUserMsg];
    setMessages(topicMessages);
    cacheSessionMessages(sessionId, topicMessages);
    upsertSessionSummary(sessionId, topicMessages, topicLabel);

    await streamAssistantReply({
      requestMessages: topicMessages,
      visibleMessages: topicMessages,
      sessionId,
      initialSessionTitle: topicLabel,
      starterPrompt,
    });
  }, [cacheSessionMessages, createSession, creatingSession, listening, stopListening, streamAssistantReply, streaming, upsertSessionSummary]);

  const startSuggestedTopicConversation = useCallback(async (topic: string) => {
    await startContextualConversation(topic, buildSuggestedTopicPrompt(topic, locale));
  }, [locale, startContextualConversation]);

  // Handle entity conversation URL params (e.g. from "Talk about this" buttons)
  // Adds entity as a context chip instead of auto-sending a message
  useEffect(() => {
    if (entityConversationTriggeredRef.current) return;
    if (!bootstrapReady || loadingSession) return;

    const entityType = searchParams.get("entityType") as EntityType | null;
    const entityId = searchParams.get("entityId");
    const entityLabel = searchParams.get("entityLabel");
    if (!entityType || !entityId || !entityLabel) return;

    entityConversationTriggeredRef.current = true;
    router.replace("/", { scroll: false });

    const chipTypeMap: Record<EntityType, ContextChip["type"]> = {
      contact: "person",
      notes: "notes",
    };

    const chip: ContextChip = {
      type: chipTypeMap[entityType],
      id: entityId,
      label: entityLabel,
      emoji: searchParams.get("entityEmoji") || undefined,
    };

    setContextChips((prev) => {
      if (prev.some((c) => c.id === chip.id)) return prev;
      return [...prev, chip];
    });
  }, [bootstrapReady, loadingSession, searchParams, router]);

  sendMessageRef.current = sendMessage;

  // Auto-send when a voice recording is added as an attachment
  useEffect(() => {
    if (pendingVoiceAttachmentRef.current && attachments.some((a) => a === pendingVoiceAttachmentRef.current)) {
      pendingVoiceAttachmentRef.current = null;
      sendMessageRef.current();
    }
  }, [attachments]);

  const activeSession = sessions.find((session) => session.sessionId === activeSessionId) || null;
  const bottomFadeOpacity = Math.min(conversationScrollBottomGap / 52, 1);
  const fadeTransitionClass = fadeTransitionEnabled ? "transition-opacity duration-200" : "";

  return (
    <div
      className="relative flex h-full w-full overflow-hidden bg-background"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 z-50 bg-muted/60 backdrop-blur-[2px] border-2 border-dashed border-muted-foreground rounded-lg flex items-center justify-center pointer-events-none animate-drop-in">
          <div className="text-tertiary-foreground text-sm font-medium">{t.chat.dropFiles}</div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${messages.length === 0 && !loadingSession ? "justify-center" : ""}`}>
        <div className={`relative z-0 min-h-0 ${messages.length === 0 && !loadingSession ? "" : "flex-1"}`}>
          {loadingSession ? (
            <div className="flex h-full items-center justify-center px-6" />
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center px-6 pb-6" data-testid="chat-empty-state">
              <h2 className="text-3xl md:text-4xl font-light text-foreground tracking-tight text-center leading-tight">
                {t.chat.headline}
              </h2>
            </div>
          ) : (
            <>
              <ScrollArea
                className="h-full min-h-0"
                ref={scrollRef}
                viewportRef={scrollViewportRef}
                onViewportScroll={handleConversationScroll}
                data-testid="chat-scroll-area"
              >
                <div className="relative min-h-full">
                  <div className="max-w-2xl mx-auto px-6 pt-8 pb-8 space-y-6">
                  {messages.map((msg, idx) => (
                    <React.Fragment key={idx}>
                    <div
                      data-testid={msg.role === "assistant" ? "chat-message-assistant" : "chat-message-user"}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} group`}
                    >
                      <div className={msg.role === "user" ? "max-w-[80%]" : "max-w-[88%]"}>
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {msg.attachments.map((att, ai) =>
                              isImageType(att.mimeType) && att.data ? (
                                <img key={ai} src={att.data} alt={att.name}
                                  className="max-w-[240px] max-h-[200px] rounded-lg object-cover border border-border transition-transform hover:scale-[1.02]" />
                              ) : att.mimeType.startsWith("audio/") && att.data ? (
                                <div key={ai} className="flex items-center gap-2.5 bg-card rounded-2xl px-3 py-2 border border-border min-w-[220px]">
                                  <VoiceNotePlayer src={att.data} mimeType={att.mimeType} />
                                </div>
                              ) : (
                                <div key={ai} className="flex items-center gap-2 bg-card rounded-lg px-3 py-2 border border-border transition-colors hover:border-border-hover">
                                  <span className="text-[10px] font-mono font-medium text-tertiary-foreground bg-border px-1.5 py-0.5 rounded">
                                    {fileIcon(att.mimeType)}
                                  </span>
                                  <span className="text-xs text-strong-foreground truncate max-w-[160px]">{att.name}</span>
                                </div>
                              )
                            )}
                          </div>
                        )}

                        {msg.contextChips && msg.contextChips.length > 0 && (
                          <div className={`flex flex-wrap gap-1 mb-1.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            {msg.contextChips.map((chip) => (
                              <span key={chip.id} className="inline-flex items-center gap-1 bg-border rounded-full px-2 py-0.5 text-[11px] text-strong-foreground font-medium">
                                {chip.emoji && <span className="text-[10px]">{chip.emoji}</span>}
                                {chip.label}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Hide text bubble for voice-only messages */}
                        {!(msg.content === "[Voice message]" && msg.attachments?.some((a) => a.mimeType.startsWith("audio/"))) && (
                        <div className={`text-[15px] leading-relaxed ${
                          msg.role === "user"
                            ? "whitespace-pre-wrap bg-muted text-foreground px-4 py-3 rounded-2xl rounded-br-md shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                            : "text-foreground prose-assistant"
                        } ${idx === messages.length - 1 && msg.role === "user" ? "animate-fade-in" : ""}`}>
                          {msg.role === "assistant" && idx === messages.length - 1 && (streaming || !textAnimDone) ? (
                            <>
                              <StreamingText key={activeSessionId} content={msg.content} onGrow={scrollToBottom} onComplete={() => setTextAnimDone(true)} />
                              {!msg.content && (
                                <span className="inline-flex items-center ml-1.5 align-middle">
                                  <span className="stream-dot" />
                                </span>
                              )}
                            </>
                          ) : msg.role === "assistant" ? (
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{msg.content}</ReactMarkdown>
                          ) : (
                            msg.content
                          )}
                        </div>
                        )}

                        {ttsEnabled && msg.role === "assistant" && msg.content && !(streaming && idx === messages.length - 1) && (
                          <div className={`flex items-center gap-1 mt-1.5 transition-opacity ${
                            speakingIdx === idx ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          }`}>
                            <button onClick={() => speakText(msg.content, idx)}
                              className={`p-1 transition-all duration-200 active:scale-90 ${
                                speakingIdx === idx ? "text-strong-foreground" : "text-border-hover hover:text-tertiary-foreground"
                              }`}
                              title={t.chat.readAloud}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                className="transition-all duration-200">
                                {speakingIdx === idx ? (
                                  <>
                                    <line x1="8" y1="6" x2="8" y2="18" />
                                    <line x1="16" y1="6" x2="16" y2="18" />
                                  </>
                                ) : (
                                  <>
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                  </>
                                )}
                              </svg>
                            </button>
                          </div>
                        )}

                        {msg.role === "assistant" && correctionIdx === idx && (
                          <div className="mt-2 p-2.5 rounded-lg bg-card border border-border animate-slide-down">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[11px] text-muted-foreground">{t.chat.correctionAppliesTo}</span>
                              {(contextOptions.length > 0 ? contextOptions : [{ id: "general", label: t.chat.generalContextLabel }]).map((contextOption) => (
                                <button key={contextOption.id} onClick={() => setCorrectionContext(contextOption.id)}
                                  className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
                                    correctionContext === contextOption.id
                                      ? "bg-border text-foreground"
                                      : "text-muted-foreground hover:text-strong-foreground hover:bg-muted"
                                  }`}>
                                  {contextOption.id === "general" ? t.chat.generalContextLabel : contextOption.label}
                                </button>
                              ))}
                            </div>
                            <div className="flex gap-1.5">
                              <input type="text" value={correctionText}
                                onChange={(e) => setCorrectionText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") submitCorrection();
                                  if (e.key === "Escape") setCorrectionIdx(null);
                                }}
                                autoCapitalize="sentences"
                                placeholder={t.chat.correctionPlaceholder}
                                className="flex-1 text-xs bg-card border border-border rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-muted-foreground"
                                autoFocus
                              />
                              <button onClick={submitCorrection}
                                disabled={!correctionText.trim() || correctionSaving}
                                className="text-xs px-2.5 py-1.5 rounded-md bg-border text-foreground hover:bg-border-hover disabled:opacity-40 transition-all active:scale-[0.96]">
                                {correctionSaving ? "..." : t.chat.saveCorrection}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    </React.Fragment>
                  ))}
                  </div>
                </div>
              </ScrollArea>
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-0 bottom-0 z-0 h-14 bg-gradient-to-t from-background via-background/88 to-transparent ${fadeTransitionClass}`}
                style={{ opacity: bottomFadeOpacity }}
              />
            </>
          )}
        </div>

        {/* Input area */}
        <div data-testid="chat-composer" className="relative z-20 isolate shrink-0">
          <div className="pointer-events-none absolute inset-0 z-0">
            <div
              className={`h-full w-full ${fadeTransitionClass}`}
              style={{
                opacity: bottomFadeOpacity,
                background: "linear-gradient(to top, rgba(248,245,240,1) 0%, rgba(248,245,240,0.94) 52%, rgba(248,245,240,0) 100%)",
              }}
            />
          </div>
          <div className="relative z-10 px-6 pb-3 pt-3">
            <div className="max-w-2xl mx-auto w-full">
              <div className="relative">
                {/* Plus menu popover */}
                {!voiceRecording && plusMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setPlusMenuOpen(false)} />
                    <div className="absolute bottom-full left-3 mb-2 z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      <div className="bg-card border border-border rounded-xl p-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                        <button
                          onClick={() => { fileInputRef.current?.click(); setPlusMenuOpen(false); }}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors whitespace-nowrap rounded-lg"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12.33 4.67L4.67 12.33C2.89 14.11 2.89 16.89 4.67 18.67V18.67C6.45 20.45 9.23 20.45 11.01 18.67L19.85 9.83C21.03 8.65 21.03 6.75 19.85 5.57V5.57C18.67 4.39 16.77 4.39 15.59 5.57L6.93 14.23C6.34 14.82 6.34 15.78 6.93 16.37V16.37C7.52 16.96 8.48 16.96 9.07 16.37L16.19 9.25" />
                          </svg>
                          {t.chat.attachFiles}
                        </button>
                        <button
                          onClick={() => { setContextPickerOpen(true); setPlusMenuOpen(false); setPickerSearch(""); }}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors whitespace-nowrap rounded-lg"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="8" r="4" />
                            <path d="M20 21a8 8 0 1 0-16 0" />
                          </svg>
                          {t.chat.addContext}
                        </button>
                        <div className="h-px bg-muted mx-2 my-0.5" />
                        <button
                          onClick={() => { setNotesPickerOpen(true); setPlusMenuOpen(false); setPickerSearch(""); }}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors whitespace-nowrap rounded-lg"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                            <path d="M8 7h6" />
                            <path d="M8 11h8" />
                          </svg>
                          {t.chat.shareNote}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* Context picker popup (People) */}
                {contextPickerOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setContextPickerOpen(false)} />
                    <div className="absolute bottom-full left-3 mb-2 z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      <div className="bg-card border border-border rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] w-[320px] overflow-hidden">
                        <div className="p-3 border-b border-muted">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-foreground">{t.chat.contextPickerTitle}</span>
                            <button onClick={() => setContextPickerOpen(false)}
                              className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-card">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                          <input
                            type="text"
                            value={pickerSearch}
                            onChange={(e) => setPickerSearch(e.target.value)}
                            autoCapitalize="off"
                            placeholder={t.chat.contextPickerSearch}
                            className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-muted-foreground"
                            autoFocus
                          />
                        </div>
                        <div className="max-h-[220px] overflow-y-auto p-1.5">
                          {!contextDataLoaded ? (
                            <p className="text-sm text-muted-foreground text-center py-4">...</p>
                          ) : (() => {
                            const filtered = realContacts.filter((p) =>
                              !pickerSearch.trim() || p.name.toLowerCase().includes(pickerSearch.toLowerCase())
                            );
                            if (filtered.length === 0) {
                              return <p className="text-sm text-muted-foreground text-center py-4">{t.chat.contextPickerEmpty}</p>;
                            }
                            return filtered.map((p) => {
                              const selected = contextChips.some((c) => c.id === p.id);
                              const displayEmoji = p.avatar?.type === "emoji" && p.avatar.value ? p.avatar.value : "👤";
                              return (
                                <button key={p.id}
                                  onClick={() => toggleContextChip({ type: "person", id: p.id, label: p.name, emoji: displayEmoji })}
                                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                                    selected ? "bg-muted" : "hover:bg-card"
                                  }`}
                                >
                                  <span className="text-base shrink-0">{displayEmoji}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm text-foreground">{p.name}</div>
                                    <div className="text-[11px] text-muted-foreground">{p.relationship}</div>
                                  </div>
                                  {selected && (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-strong-foreground">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  )}
                                </button>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Note entry picker popup */}
                {notesPickerOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setNotesPickerOpen(false)} />
                    <div className="absolute bottom-full left-0 right-0 mb-2 z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      <div className="bg-card border border-border rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] max-w-md mx-auto overflow-hidden">
                        <div className="p-3 border-b border-muted">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-foreground">{t.chat.notesPickerTitle}</span>
                            <div className="flex items-center gap-1">
                              <a href="/notes" className="text-xs text-muted-foreground hover:text-strong-foreground transition-colors px-2 py-1 rounded-md hover:bg-card">
                                {t.chat.notesOpenFull}
                              </a>
                              <button onClick={() => setNotesPickerOpen(false)}
                                className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-card">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <input
                            type="text"
                            value={pickerSearch}
                            onChange={(e) => setPickerSearch(e.target.value)}
                            autoCapitalize="off"
                            placeholder={t.chat.notesPickerSearch}
                            className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-muted-foreground"
                            autoFocus
                          />
                        </div>
                        <div className="max-h-[260px] overflow-y-auto p-1.5">
                          {(() => {
                            const filtered = dummyNoteEntries.filter((j) => {
                              if (!pickerSearch.trim()) return true;
                              const q = pickerSearch.toLowerCase();
                              return lx(j.title).toLowerCase().includes(q) || lx(j.preview).toLowerCase().includes(q);
                            });
                            if (filtered.length === 0) {
                              return <p className="text-sm text-muted-foreground text-center py-4">{t.chat.contextPickerEmpty}</p>;
                            }
                            return filtered.map((entry) => {
                              const selected = contextChips.some((c) => c.id === entry.id);
                              return (
                                <button key={entry.id}
                                  onClick={() => toggleContextChip({ type: "notes", id: entry.id, label: lx(entry.title), emoji: "📝" })}
                                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                                    selected ? "bg-muted" : "hover:bg-card"
                                  }`}
                                >
                                  <span className="text-sm shrink-0 mt-0.5">📝</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-sm text-foreground font-medium truncate">{lx(entry.title)}</span>
                                      <span className="text-[10px] text-muted-foreground font-mono shrink-0">{entry.date}</span>
                                    </div>
                                    <p className="text-xs text-tertiary-foreground truncate mt-0.5">{lx(entry.preview)}</p>
                                  </div>
                                  {selected && (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-1 text-strong-foreground">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  )}
                                </button>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className={`bg-card border border-border ${!voiceRecording && (attachments.length > 0 || contextChips.length > 0) ? "rounded-2xl" : "rounded-full"} flex flex-col transition-all ${!voiceRecording ? "focus-within:border-muted-foreground" : ""} shadow-[0_1px_3px_rgba(0,0,0,0.04)]`}>
                  {/* Attachment & context chip preview (only when not recording) */}
                  {!voiceRecording && (attachments.length > 0 || contextChips.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 px-4 pt-2.5 pb-1">
                      {contextChips.map((chip) => (
                        <div key={chip.id} className="flex items-center gap-1 bg-muted rounded-full px-2.5 py-1 transition-all hover:bg-border">
                          {chip.emoji && <span className="text-xs">{chip.emoji}</span>}
                          <span className="text-xs text-foreground font-medium">{chip.label}</span>
                          <button onClick={() => removeContextChip(chip.id)}
                            className="text-muted-foreground hover:text-strong-foreground ml-0.5 transition-colors rounded-full hover:bg-border p-0.5" title={t.chat.removeAttachment}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      {attachments.map((att, i) => (
                        <div key={i} className="relative group flex items-center gap-1.5 bg-background rounded-md px-2 py-1 transition-all hover:bg-muted">
                          {isImageType(att.mimeType) ? (
                            <img src={att.preview} alt={att.name} className="w-7 h-7 rounded object-cover" />
                          ) : (
                            <span className="text-[9px] font-mono font-medium text-tertiary-foreground bg-border px-1.5 py-0.5 rounded">
                              {fileIcon(att.mimeType)}
                            </span>
                          )}
                          <span className="text-xs text-strong-foreground truncate max-w-[100px]">{att.name}</span>
                          <button onClick={() => removeAttachment(i)}
                            className="text-muted-foreground hover:text-strong-foreground ml-0.5 transition-colors rounded-full hover:bg-border p-0.5" title={t.chat.removeAttachment}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {voiceRecording ? (
                    /* ── Voice recording inner content ── */
                    <div key="voice" className="flex items-center gap-2 px-4 py-2 animate-input-swap">
                      {/* Cancel */}
                      <button onClick={cancelVoiceRecording}
                        className="p-1 text-muted-foreground hover:text-foreground transition-all shrink-0 active:scale-90"
                        title={t.chat.cancelRecording}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>

                      {/* Recording indicator + timer */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`w-2 h-2 rounded-full ${voiceRecordingPaused ? "bg-muted-foreground" : "bg-red-400 animate-pulse"}`} />
                        <span className="text-xs font-mono text-strong-foreground tabular-nums min-w-[40px]">
                          {Math.floor(voiceRecordingTime / 60).toString().padStart(2, "0")}:{(voiceRecordingTime % 60).toString().padStart(2, "0")}
                        </span>
                      </div>

                      {/* Waveform */}
                      <div className="flex-1 flex items-center justify-center gap-[2px] h-[20px] overflow-hidden">
                        {waveformLevels.map((level, i) => (
                          <div
                            key={i}
                            className="w-[3px] rounded-full bg-muted-foreground transition-all duration-75"
                            style={{ height: `${Math.max(3, level * 20)}px` }}
                          />
                        ))}
                      </div>

                      {/* Pause/Resume */}
                      <button
                        onClick={voiceRecordingPaused ? resumeVoiceRecording : pauseVoiceRecording}
                        className="p-1 text-muted-foreground hover:text-foreground transition-all shrink-0 active:scale-90"
                        title={voiceRecordingPaused ? t.chat.resumeRecording : t.chat.pauseRecording}>
                        {voiceRecordingPaused ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="8" y1="4" x2="8" y2="20" /><line x1="16" y1="4" x2="16" y2="20" />
                          </svg>
                        )}
                      </button>

                      {/* Send */}
                      <button onClick={sendVoiceRecording}
                        className="shrink-0 w-7 h-7 flex items-center justify-center text-foreground hover:text-foreground-intense transition-all active:scale-90"
                        title={t.chat.sendVoice}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9.51 4.23L18.07 8.51C21.91 10.43 21.91 13.57 18.07 15.49L9.51 19.77C3.89 22.58 1.42 20.11 4.23 14.49L5.12 12.68C5.32 12.28 5.32 11.72 5.12 11.32L4.23 9.51C1.42 3.89 3.89 1.42 9.51 4.23Z" />
                          <path d="M5.44 12H10.84" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    /* ── Normal input inner content ── */
                    <div key="text" className="flex items-center gap-1.5 px-4 py-2 animate-input-swap">
                    {/* Plus button */}
                    <button onClick={() => setPlusMenuOpen((v) => !v)} disabled={streaming || !openClawReady}
                      title={!openClawReady ? t.chat.openClawUnavailable : undefined}
                      className={`p-1 shrink-0 transition-all active:scale-90 disabled:opacity-30 ${plusMenuOpen ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                        className={`transition-transform duration-200 ${plusMenuOpen ? "rotate-45" : ""}`}>
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                    <input ref={fileInputRef} type="file" multiple
                      accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx"
                      onChange={handleFileSelect} className="hidden" />

                    <textarea ref={inputRef} value={input}
                      data-testid="chat-input"
                      onChange={(e) => {
                        setInput(e.target.value);
                        const el = e.target;
                        el.style.height = "0";
                        el.style.height = Math.min(el.scrollHeight, 200) + "px";
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                      }}
                      autoCapitalize="sentences"
                      placeholder={!openClawReady ? t.chat.openClawUnavailablePlaceholder : listening ? t.chat.listeningPlaceholder : t.chat.inputPlaceholder}
                      className="flex-1 min-h-[20px] max-h-[200px] resize-none bg-transparent px-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none leading-[20px] self-center"
                      style={{ overflow: "hidden" }}
                      disabled={streaming || !openClawReady} rows={1}
                    />

                    {/* Mic / Send toggle button */}
                    <button
                      data-testid="chat-send-button"
                      onClick={input.trim() || attachments.length > 0 ? sendMessage : startVoiceRecording}
                      disabled={streaming || !openClawReady}
                      className={`shrink-0 w-7 h-7 flex items-center justify-center relative transition-all active:scale-90 disabled:opacity-30 ${
                        listening ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                      title={input.trim() || attachments.length > 0 ? t.chat.send : t.chat.voiceInput}>
                      {/* Mic icon */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                        className={`absolute transition-all duration-200 ${input.trim() || attachments.length > 0 ? "opacity-0 scale-75" : "opacity-100 scale-100"}`}>
                        <path d="M12 15.5C14.21 15.5 16 13.71 16 11.5V6C16 3.79 14.21 2 12 2C9.79 2 8 3.79 8 6V11.5C8 13.71 9.79 15.5 12 15.5Z" />
                        <path d="M4.35 9.65V11.35C4.35 15.57 7.78 19 12 19C16.22 19 19.65 15.57 19.65 11.35V9.65" />
                        <path d="M12 19V22" />
                      </svg>
                      {/* Send icon */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                        className={`absolute transition-all duration-200 ${input.trim() || attachments.length > 0 ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}>
                        <path d="M9.51 4.23L18.07 8.51C21.91 10.43 21.91 13.57 18.07 15.49L9.51 19.77C3.89 22.58 1.42 20.11 4.23 14.49L5.12 12.68C5.32 12.28 5.32 11.72 5.12 11.32L4.23 9.51C1.42 3.89 3.89 1.42 9.51 4.23Z" />
                        <path d="M5.44 12H10.84" />
                      </svg>
                    </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2 px-8 min-h-[18px]">
                {chatDebugEnabled && chatTrace && (
                  <div
                    data-testid="chat-perf-trace"
                    className="inline-flex max-w-full items-center rounded-full border border-border bg-card/90 px-3 py-1 text-[11px] leading-4 text-foreground/75 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                  >
                    <span className="font-mono">trace {chatTrace.traceId}</span>
                    {chatTraceSummary ? ` • ${chatTraceSummary}` : ""}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
