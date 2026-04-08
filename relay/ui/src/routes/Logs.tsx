import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PageBody, PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Empty, ErrorMsg, Loading } from "../components/Empty";
import { Mono, TD, TH, THead, TR, Table } from "../components/Table";
import { relativeTime } from "../lib/format";

type Agent = { agentId: string };
type Workspace = { workspaceId: string };
type ActivityItem = {
  createdAt?: string;
  capability?: string;
  status?: string;
  detail?: string;
};
type Row = ActivityItem & { agentId: string; workspaceId: string };

export function LogsPage() {
  const { auth } = useAuth();
  const tenantId = auth!.tenantId;

  const q = useQuery({
    queryKey: ["logs", tenantId],
    refetchInterval: 15_000,
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
            await Promise.all(
              workspaces.map(async (w) => {
                try {
                  const { activity } = await api.get<{ activity: ActivityItem[] }>(
                    `/tenants/${tenantId}/agents/${a.agentId}/workspaces/${w.workspaceId}/activity`,
                  );
                  for (const item of activity) {
                    rows.push({ ...item, agentId: a.agentId, workspaceId: w.workspaceId });
                  }
                } catch {
                  /* skip workspace */
                }
              }),
            );
          } catch {
            /* skip agent */
          }
        }),
      );
      rows.sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
      );
      return rows.slice(0, 200);
    },
  });

  return (
    <>
      <PageHeader title="Logs">
        <Button onClick={() => q.refetch()}>
          <RefreshCw size={12} /> Refresh
        </Button>
      </PageHeader>
      <PageBody>
        {q.isLoading ? (
          <Loading label="Loading activity..." />
        ) : q.isError ? (
          <ErrorMsg message={(q.error as Error).message} />
        ) : (q.data?.length ?? 0) === 0 ? (
          <Empty
            title="No activity yet"
            description="Agent activity will appear here as it happens."
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Time</TH>
                <TH>Agent</TH>
                <TH>Workspace</TH>
                <TH>Capability</TH>
                <TH>Status</TH>
                <TH>Detail</TH>
              </tr>
            </THead>
            <tbody>
              {q.data!.map((r, i) => (
                <TR key={i}>
                  <TD className="text-text-muted">{relativeTime(r.createdAt)}</TD>
                  <TD>
                    <Mono>{r.agentId}</Mono>
                  </TD>
                  <TD>
                    <Mono>{r.workspaceId}</Mono>
                  </TD>
                  <TD>
                    <Mono>{r.capability}</Mono>
                  </TD>
                  <TD>
                    <Badge
                      variant={
                        r.status === "success"
                          ? "success"
                          : r.status === "error"
                            ? "error"
                            : "info"
                      }
                    >
                      {r.status}
                    </Badge>
                  </TD>
                  <TD className="text-text-muted">{r.detail}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </PageBody>
    </>
  );
}
