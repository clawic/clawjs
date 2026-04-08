import { NavLink, useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Badge } from "../components/Badge";
import { ActivityTab } from "./workspace/ActivityTab";
import { UsageTab } from "./workspace/UsageTab";
import { SessionsTab } from "./workspace/SessionsTab";
import { ResourcesTab } from "./workspace/ResourcesTab";
import { StatusTab } from "./workspace/StatusTab";

type Tab = "activity" | "usage" | "sessions" | "resources" | "status";
const TABS: { key: Tab; label: string }[] = [
  { key: "activity", label: "Activity" },
  { key: "usage", label: "Usage" },
  { key: "sessions", label: "Sessions" },
  { key: "resources", label: "Resources" },
  { key: "status", label: "Status" },
];

export function WorkspacePage() {
  const { tenantId, agentId, workspaceId, tab } = useParams();
  const activeTab = (tab as Tab) ?? "activity";

  const prefix = `/tenants/${tenantId}/agents/${agentId}/workspaces/${workspaceId}`;

  // Head-check the workspace status for the badge in the header.
  const status = useQuery({
    queryKey: ["ws-status-head", prefix],
    queryFn: () => api.get(`${prefix}/status`),
    retry: false,
  });
  const online = status.isSuccess;
  const offline = status.isError;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Header */}
      <header className="px-4 pt-3 border-b border-border shrink-0 bg-bg">
        <div className="flex items-center gap-2 text-[11px] text-text-muted">
          <Link to="/workspaces" className="hover:text-text">
            Workspaces
          </Link>
          <span>/</span>
          <span className="font-mono">{agentId}</span>
          <span>/</span>
          <span className="font-mono">{workspaceId}</span>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-sm font-semibold font-mono">{workspaceId}</h1>
          {online ? (
            <Badge variant="success">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green" /> Online
            </Badge>
          ) : offline ? (
            <Badge variant="error">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red" /> Offline
            </Badge>
          ) : null}
        </div>
        <nav className="flex gap-1 mt-3" role="tablist">
          {TABS.map((t) => (
            <NavLink
              key={t.key}
              to={`/workspace/${tenantId}/${agentId}/${workspaceId}/${t.key}`}
              replace
              className={() =>
                [
                  "h-8 px-3 text-[12px] rounded-t-sm border-b-2 transition-colors",
                  t.key === activeTab
                    ? "border-text text-text font-medium"
                    : "border-transparent text-text-muted hover:text-text",
                ].join(" ")
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden p-4">
        <div className="h-full">
          {activeTab === "activity" && <ActivityTab prefix={prefix} />}
          {activeTab === "usage" && <UsageTab prefix={prefix} />}
          {activeTab === "sessions" && <SessionsTab prefix={prefix} />}
          {activeTab === "resources" && <ResourcesTab prefix={prefix} />}
          {activeTab === "status" && <StatusTab prefix={prefix} />}
        </div>
      </div>
    </div>
  );
}
