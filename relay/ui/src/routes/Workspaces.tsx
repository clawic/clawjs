import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PageBody, PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Empty, ErrorMsg, Loading } from "../components/Empty";
import { Mono, TD, TH, THead, TR, Table } from "../components/Table";

type Agent = { agentId: string; displayName?: string };
type Workspace = { workspaceId: string; displayName?: string };
type Row = {
  agentId: string;
  agentName: string;
  workspaceId: string;
  displayName: string;
};

export function WorkspacesPage() {
  const { auth } = useAuth();
  const tenantId = auth!.tenantId;
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["workspaces-flat", tenantId],
    queryFn: async (): Promise<Row[]> => {
      const { agents } = await api.get<{ agents: Agent[] }>(
        `/tenants/${tenantId}/agents`,
      );
      const rows: Row[] = [];
      await Promise.all(
        agents.map(async (a) => {
          try {
            const { workspaces } = await api.get<{ workspaces: Workspace[] }>(
              `/tenants/${tenantId}/agents/${a.agentId}/workspaces`,
            );
            for (const w of workspaces) {
              rows.push({
                agentId: a.agentId,
                agentName: a.displayName || a.agentId,
                workspaceId: w.workspaceId,
                displayName: w.displayName || w.workspaceId,
              });
            }
          } catch {
            /* ignore per-agent failures */
          }
        }),
      );
      return rows;
    },
  });

  return (
    <>
      <PageHeader title="Workspaces">
        <Button variant="primary" onClick={() => navigate("/settings")}>
          <Plus size={12} /> New workspace
        </Button>
      </PageHeader>
      <PageBody>
        {q.isLoading ? (
          <Loading label="Loading workspaces..." />
        ) : q.isError ? (
          <ErrorMsg message={(q.error as Error).message} />
        ) : (q.data?.length ?? 0) === 0 ? (
          <Empty
            title="No workspaces"
            description="Create a workspace from the Settings page."
            action={
              <Button variant="primary" onClick={() => navigate("/settings")}>
                Go to settings
              </Button>
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Workspace</TH>
                <TH>ID</TH>
                <TH>Agent</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {q.data!.map((r) => (
                <TR
                  key={`${r.agentId}/${r.workspaceId}`}
                  onClick={() =>
                    navigate(
                      `/workspace/${tenantId}/${r.agentId}/${encodeURIComponent(r.workspaceId)}`,
                    )
                  }
                >
                  <TD>{r.displayName}</TD>
                  <TD>
                    <Mono>{r.workspaceId}</Mono>
                  </TD>
                  <TD className="text-text-muted">{r.agentName}</TD>
                  <TD className="w-8 text-text-faint">
                    <ChevronRight size={14} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </PageBody>
    </>
  );
}
