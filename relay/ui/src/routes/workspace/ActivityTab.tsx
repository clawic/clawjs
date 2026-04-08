import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Badge } from "../../components/Badge";
import { ErrorMsg, Loading } from "../../components/Empty";
import { Mono, TD, TH, THead, TR, Table } from "../../components/Table";
import { relativeTime } from "../../lib/format";

type ActivityItem = {
  createdAt?: string;
  capability?: string;
  status?: string;
  detail?: string;
};

export function ActivityTab({ prefix }: { prefix: string }) {
  const q = useQuery({
    queryKey: ["activity", prefix],
    queryFn: async () => {
      const { activity } = await api.get<{ activity: ActivityItem[] }>(`${prefix}/activity`);
      return activity;
    },
    refetchInterval: 10_000,
  });

  if (q.isLoading) return <Loading label="Loading activity..." />;
  if (q.isError) return <ErrorMsg message={(q.error as Error).message} />;
  if (!q.data?.length)
    return <div className="text-xs text-text-muted p-3">No activity yet.</div>;

  return (
    <Table>
      <THead>
        <tr>
          <TH>Time</TH>
          <TH>Capability</TH>
          <TH>Status</TH>
          <TH>Detail</TH>
        </tr>
      </THead>
      <tbody>
        {q.data.map((a, i) => (
          <TR key={i}>
            <TD className="text-text-muted">{relativeTime(a.createdAt)}</TD>
            <TD>
              <Mono>{a.capability}</Mono>
            </TD>
            <TD>
              <Badge
                variant={
                  a.status === "success"
                    ? "success"
                    : a.status === "error"
                      ? "error"
                      : "info"
                }
              >
                {a.status}
              </Badge>
            </TD>
            <TD className="text-text-muted">{a.detail}</TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}
