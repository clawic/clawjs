import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { ErrorMsg, Loading } from "../../components/Empty";
import { TD, TH, THead, TR, Table } from "../../components/Table";
import { relativeTime } from "../../lib/format";

type UsageItem = {
  createdAt?: string;
  tokensIn?: number;
  tokensOut?: number;
  estimatedCostUsd?: number;
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded bg-bg p-3 flex-1 min-w-[140px]">
      <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}

export function UsageTab({ prefix }: { prefix: string }) {
  const q = useQuery({
    queryKey: ["usage", prefix],
    queryFn: async () => {
      const { usage } = await api.get<{ usage: UsageItem[] }>(`${prefix}/usage`);
      return usage;
    },
    refetchInterval: 15_000,
  });

  if (q.isLoading) return <Loading label="Loading usage..." />;
  if (q.isError) return <ErrorMsg message={(q.error as Error).message} />;

  const usage = q.data ?? [];
  const totalIn = usage.reduce((acc, u) => acc + (u.tokensIn ?? 0), 0);
  const totalOut = usage.reduce((acc, u) => acc + (u.tokensOut ?? 0), 0);
  const totalCost = usage.reduce((acc, u) => acc + (u.estimatedCostUsd ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 flex-wrap">
        <Stat label="Tokens in" value={totalIn.toLocaleString()} />
        <Stat label="Tokens out" value={totalOut.toLocaleString()} />
        <Stat label="Estimated cost" value={`$${totalCost.toFixed(4)}`} />
        <Stat label="Records" value={String(usage.length)} />
      </div>
      <Table>
        <THead>
          <tr>
            <TH>Time</TH>
            <TH className="text-right">Tokens in</TH>
            <TH className="text-right">Tokens out</TH>
            <TH className="text-right">Cost (USD)</TH>
          </tr>
        </THead>
        <tbody>
          {usage.length === 0 ? (
            <TR>
              <TD colSpan={4} className="text-text-muted">
                No usage records yet.
              </TD>
            </TR>
          ) : (
            usage.map((u, i) => (
              <TR key={i}>
                <TD className="text-text-muted">{relativeTime(u.createdAt)}</TD>
                <TD className="text-right font-mono">
                  {(u.tokensIn ?? 0).toLocaleString()}
                </TD>
                <TD className="text-right font-mono">
                  {(u.tokensOut ?? 0).toLocaleString()}
                </TD>
                <TD className="text-right font-mono">
                  ${(u.estimatedCostUsd ?? 0).toFixed(4)}
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );
}
