import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Card } from "../../components/Card";

function CodeBlock({ data }: { data: unknown }) {
  return (
    <pre className="text-[11px] font-mono bg-bg-panel border border-border rounded p-3 overflow-auto max-h-96 whitespace-pre-wrap">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export function StatusTab({ prefix }: { prefix: string }) {
  const status = useQuery({
    queryKey: ["ws-status", prefix],
    queryFn: () => api.get<unknown>(`${prefix}/status`),
  });
  const integrations = useQuery({
    queryKey: ["ws-integrations", prefix],
    queryFn: () => api.get<unknown>(`${prefix}/integrations/status`),
  });

  return (
    <div>
      <Card title="Workspace status" danger={status.isError}>
        {status.isLoading ? (
          <div className="text-xs text-text-muted">Loading...</div>
        ) : status.isError ? (
          <div className="text-xs text-red">
            Workspace offline. {(status.error as Error).message}
          </div>
        ) : (
          <CodeBlock data={status.data} />
        )}
      </Card>
      <Card title="Integrations">
        {integrations.isLoading ? (
          <div className="text-xs text-text-muted">Loading...</div>
        ) : integrations.isError ? (
          <div className="text-xs text-red">
            Could not load integrations. {(integrations.error as Error).message}
          </div>
        ) : (
          <CodeBlock data={integrations.data} />
        )}
      </Card>
    </div>
  );
}
