"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { MessageText, Trash } from "iconsax-react";
interface EntityConversationParams { entityType: string; entityId: string; label?: string }

export function StartConversationButton({ params }: { params: EntityConversationParams }) {
  const router = useRouter();
  const { messages } = useLocale();
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={() => router.push(`/?entityType=${params.entityType}&entityId=${params.entityId}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="transition-colors p-1 text-tertiary-foreground hover:text-foreground"
      title={messages.common.talkAboutThis}
    >
      <MessageText size={16} color="currentColor" variant={hovered ? "Bold" : "Linear"} />
    </button>
  );
}

export function TrashButton({ onClick, title, size = 16, className = "" }: {
  onClick: () => void;
  title: string;
  size?: number;
  className?: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`transition-colors p-1 text-tertiary-foreground hover:text-red-500 ${className}`}
      title={title}
    >
      <Trash size={size} color="currentColor" variant={hovered ? "Bold" : "Linear"} />
    </button>
  );
}
