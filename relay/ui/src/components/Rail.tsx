import { NavLink, useNavigate } from "react-router-dom";
import {
  Bot,
  FolderOpenDot,
  LogOut,
  Moon,
  ScrollText,
  Settings,
  Sun,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";

type Item = {
  to: string;
  label: string;
  icon: typeof Bot;
  adminOnly?: boolean;
  match?: (pathname: string) => boolean;
};

const ITEMS: Item[] = [
  { to: "/agents", label: "Agents", icon: Bot },
  {
    to: "/workspaces",
    label: "Workspaces",
    icon: FolderOpenDot,
    // Highlight Workspaces when inside a specific workspace too.
    match: (p) => p.startsWith("/workspaces") || p.startsWith("/workspace/"),
  },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

export function Rail() {
  const { isAdmin, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const visible = ITEMS.filter((i) => !i.adminOnly || isAdmin);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <nav
      aria-label="Primary"
      className="flex flex-col items-center w-16 shrink-0 bg-bg-rail text-text-on-dark border-r border-border"
    >
      <div className="flex-1 flex flex-col items-center gap-1 pt-3">
        {visible.map(({ to, label, icon: Icon, match }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            aria-label={label}
            className={({ isActive }) => {
              const active =
                match?.(window.location.pathname) ?? isActive;
              return [
                "w-10 h-10 flex items-center justify-center rounded-sm transition-colors",
                "text-text-on-dark-muted hover:bg-bg-rail-hover hover:text-text-on-dark",
                active ? "bg-bg-rail-active text-text-on-dark" : "",
              ].join(" ");
            }}
          >
            <Icon size={18} strokeWidth={1.75} />
          </NavLink>
        ))}
      </div>
      <div className="flex flex-col items-center gap-1 pb-3">
        <button
          type="button"
          onClick={toggle}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
          aria-label="Toggle theme"
          className="w-10 h-10 flex items-center justify-center rounded-sm text-text-on-dark-muted hover:bg-bg-rail-hover hover:text-text-on-dark"
        >
          {theme === "dark" ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          title="Sign out"
          aria-label="Sign out"
          className="w-10 h-10 flex items-center justify-center rounded-sm text-text-on-dark-muted hover:bg-bg-rail-hover hover:text-text-on-dark"
        >
          <LogOut size={18} strokeWidth={1.75} />
        </button>
      </div>
    </nav>
  );
}
