"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { useLocale } from "@/components/locale-provider";
import { localized } from "@/lib/i18n/localized";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  spellCheck?: boolean;
  mono?: boolean;
  className?: string;
  "data-testid"?: string;
}

export default function MarkdownEditor({
  value,
  onChange,
  rows = 14,
  placeholder,
  spellCheck,
  mono = false,
  className,
  "data-testid": testId,
}: MarkdownEditorProps) {
  const { locale } = useLocale();
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emptyLabel = localized(locale, {
    en: "Empty",
    es: "Vacío",
    fr: "Vide",
    it: "Vuoto",
    de: "Leer",
    pt: "Vazio",
  });
  const editLabel = localized(locale, {
    en: "edit",
    es: "editar",
    fr: "modifier",
    it: "modifica",
    de: "bearbeiten",
    pt: "editar",
  });
  const markdownLabel = localized(locale, {
    en: "Markdown",
    es: "Markdown",
    fr: "Markdown",
    it: "Markdown",
    de: "Markdown",
    pt: "Markdown",
  });
  const previewLabel = localized(locale, {
    en: "Preview",
    es: "Vista previa",
    fr: "Aperçu",
    it: "Anteprima",
    de: "Vorschau",
    pt: "Pré-visualização",
  });
  const doneLabel = localized(locale, {
    en: "done",
    es: "listo",
    fr: "terminé",
    it: "fine",
    de: "fertig",
    pt: "feito",
  });

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [editing]);

  const borderClass = "border border-border rounded-lg";
  const previewMinHeight = `${rows * 1.5}em`;

  if (!editing) {
    return (
      <div className={className}>
        <div
          data-testid={testId ? `${testId}-preview` : undefined}
          className={`w-full bg-card ${borderClass} px-4 py-3 text-sm text-foreground leading-relaxed overflow-y-auto prose-assistant cursor-pointer hover:border-muted-foreground transition-colors relative group`}
          style={{ minHeight: previewMinHeight }}
          onClick={() => setEditing(true)}
        >
          {value.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{value}</ReactMarkdown>
          ) : (
            <p className="text-muted-foreground italic text-xs">
              {placeholder || emptyLabel}
            </p>
          )}
          <span className="absolute top-2.5 right-2.5 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            {editLabel}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-3">
        <div className="relative">
          <span className="text-[10px] text-muted-foreground mb-1 block">{markdownLabel}</span>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            placeholder={placeholder}
            autoCapitalize="sentences"
            spellCheck={spellCheck}
            data-testid={testId}
            className={`w-full bg-card ${borderClass} px-4 py-3 text-sm text-foreground leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground focus:border-muted-foreground transition-colors ${
              mono ? "font-mono" : ""
            }`}
          />
        </div>
        <div className="relative">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground">{previewLabel}</span>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-[10px] text-muted-foreground hover:text-strong-foreground transition-colors"
            >
              {doneLabel}
            </button>
          </div>
          <div
            data-testid={testId ? `${testId}-preview` : undefined}
            className={`w-full bg-background ${borderClass} px-4 py-3 text-sm text-foreground leading-relaxed overflow-y-auto prose-assistant`}
            style={{ minHeight: previewMinHeight }}
          >
            {value.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{value}</ReactMarkdown>
            ) : (
              <p className="text-muted-foreground italic text-xs">
                {placeholder || emptyLabel}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
