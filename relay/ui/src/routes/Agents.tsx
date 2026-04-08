import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PageBody, PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Drawer } from "../components/Drawer";
import { Empty, ErrorMsg, Loading } from "../components/Empty";
import { Mono, TD, TH, THead, TR, Table } from "../components/Table";
import { relativeTime } from "../lib/format";

type Agent = {
  agentId: string;
  displayName?: string;
  status?: string;
  version?: string;
  capabilities?: string[];
  lastSeenAt?: string;
};
type Workspace = { workspaceId: string; displayName?: string };

export function AgentsPage() {
  const { auth } = useAuth();
  const tenantId = auth!.tenantId;
  const [pickerAgent, setPickerAgent] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["agents", tenantId],
    queryFn: async () => {
      const data = await api.get<{ agents: Agent[] }>(`/tenants/${tenantId}/agents`);
      return data.agents;
    },
    refetchInterval: 15_000,
  });

  return (
    <>
      <PageHeader title="Agents">
        <Button onClick={() => q.refetch()}>
          <RefreshCw size={12} /> Refresh
        </Button>
      </PageHeader>
      <PageBody>
        {q.isLoading ? (
          <Loading label="Loading agents..." />
        ) : q.isError ? (
          <ErrorMsg message={(q.error as Error).message} />
        ) : (q.data?.length ?? 0) === 0 ? (
          <Empty
            title="No agents yet"
            description="Connect a connector to register an agent here."
            action={<Button variant="primary">Create enrollment token</Button>}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>ID</TH>
                <TH>Status</TH>
                <TH>Version</TH>
                <TH>Capabilities</TH>
                <TH>Last seen</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {q.data!.map((a) => {
                const online = a.status === "online";
                return (
                  <TR key={a.agentId} onClick={() => setPickerAgent(a.agentId)}>
                    <TD>{a.displayName || a.agentId}</TD>
                    <TD>
                      <Mono>{a.agentId}</Mono>
                    </TD>
                    <TD>
                      <Badge variant={online ? "success" : "error"}>
                        <span
                          className={`inline-block w-1.5 h-1.5 rounded-full ${
                            online ? "bg-green" : "bg-red"
                          }`}
                        />
                        {a.status || "unknown"}
                      </Badge>
                    </TD>
                    <TD className="text-text-muted">{a.version || "."}</TD>
                    <TD>
                      {a.capabilities?.length ? (
                        <div className="flex gap-1 flex-wrap">
                          {a.capabilities.map((c) => (
                            <Badge key={c} variant="info">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-text-faint">.</span>
                      )}
                    </TD>
                    <TD className="text-text-muted">{relativeTime(a.lastSeenAt)}</TD>
                    <TD className="w-8 text-text-faint">
                      <ChevronRight size={14} />
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </PageBody>

      <WorkspacePicker
        tenantId={tenantId}
        agentId={pickerAgent}
        onClose={() => setPickerAgent(null)}
      />
    </>
  );
}

function WorkspacePicker({
  tenantId,
  agentId,
  onClose,
}: {
  tenantId: string;
  agentId: string | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["agent-workspaces", tenantId, agentId],
    enabled: !!agentId,
    queryFn: async () => {
      const data = await api.get<{ workspaces: Workspace[] }>(
        `/tenants/${tenantId}/agents/${agentId}/workspaces`,
      );
      return data.workspaces;
    },
  });

  return (
    <Drawer
      open={!!agentId}
      title={`Workspaces · ${agentId ?? ""}`}
      onClose={onClose}
    >
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorMsg message={(q.error as Error).message} />
      ) : (q.data?.length ?? 0) === 0 ? (
        <div className="text-xs text-text-muted">No workspaces for this agent.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {q.data!.map((w) => (
            <button
              key={w.workspaceId}
              type="button"
              onClick={() => {
                onClose();
                navigate(
                  `/workspace/${tenantId}/${agentId}/${encodeURIComponent(w.workspaceId)}`,
                );
              }}
              className="text-left border border-border rounded-sm px-3 py-2 hover:bg-bg-hover"
            >
              <div className="text-xs font-medium">{w.displayName || w.workspaceId}</div>
              <div className="text-[11px] text-text-muted font-mono mt-0.5">
                {w.workspaceId}
              </div>
            </button>
          ))}
        </div>
      )}
    </Drawer>
  );
}
