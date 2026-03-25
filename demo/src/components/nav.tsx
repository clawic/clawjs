"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/components/locale-provider";

export default function Nav() {
  const pathname = usePathname();
  const { messages } = useLocale();
  const links = [
    { href: "/chat", label: messages.nav.chat },
    { href: "/settings", label: messages.nav.settings },
  ];

  return (
    <nav className="border-b border-border bg-background">
      <div className="max-w-7xl mx-auto px-6 flex items-center h-12 gap-8">
        <span className="flex items-center gap-2 font-medium text-sm text-foreground tracking-tight">
          <Image
            src="/header-chat-icon.png"
            alt={messages.common.appName}
            width={16}
            height={16}
            className="h-4 w-4 shrink-0"
          />
          <span>{messages.common.appName}</span>
        </span>
        <div className="flex gap-0.5">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1 rounded-md text-[13px] transition-all active:scale-[0.96] ${
                pathname === l.href
                  ? "bg-muted text-foreground font-medium"
                  : "text-tertiary-foreground hover:text-strong-foreground hover:bg-card"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
