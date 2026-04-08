import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Copy, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PageBody, PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Drawer } from "../components/Drawer";
import { Empty } from "../components/Empty";
import { copyToClipboard } from "../lib/format";

type Agent = { agentId: string };
type Workspace = { workspaceId: string };

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 flex-1 min-w-[160px]">
      <span className="text-[11px] uppercase tracking-wide text-text-muted">{label}</span>
      {children}
    </label>
  );
}

const INPUT_CLS =
  "h-8 px-2 text-[12px] bg-bg-input text-text border border-border rounded-sm outline-none focus:border-border-strong";

const CODE_CLS =
  "text-[11px] font-mono bg-bg-panel border border-border rounded p-3 overflow-auto max-h-60 whitespace-pre-wrap break-all";

export function SettingsPage() {
  const { auth, isAdmin } = useAuth();
  const tenantId = auth!.tenantId;

  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Settings" />
        <PageBody>
          <Empty
            title="Admin access required"
            description="Ask a workspace administrator to sign you in."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Settings">
        <span className="text-xs text-text-muted">
          Tenant <span className="font-mono">{tenantId}</span>
        </span>
      </PageHeader>
      <PageBody>
        <EnrollmentCard tenantId={tenantId} />
        <CreateWorkspaceCard tenantId={tenantId} />
        <RuntimeCard tenantId={tenantId} />
        <DeleteDataCard tenantId={tenantId} />
      </PageBody>
    </>
  );
}

// ---------- Enrollment ----------

function EnrollmentCard({ tenantId }: { tenantId: string }) {
  const [agentId, setAgentId] = useState("demo-agent");
  const [description, setDescription] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const data = await api.post<{ enrollmentToken?: string; token?: string }>(
        "/admin/connectors/enrollments",
        { tenantId, agentId, description: description || undefined },
      );
      setToken(data.enrollmentToken ?? data.token ?? JSON.stringify(data));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card
      title="Enrollment token"
      subtitle="Generate a token to enroll a new connector for an agent."
    >
      <div className="flex gap-3 flex-wrap mb-3">
        <Field label="Agent ID">
          <input
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className={INPUT_CLS}
            placeholder="agent-id"
          />
        </Field>
        <Field label="Description">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={INPUT_CLS}
            placeholder="Optional description"
          />
        </Field>
      </div>
      <Button variant="primary" onClick={submit} disabled={pending}>
        <Plus size={12} /> Create token
      </Button>
      {error ? (
        <div className="text-xs text-red bg-red-bg rounded-sm px-2 py-1 mt-3">{error}</div>
      ) : null}
      {token ? (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <Badge variant="success">Token created</Badge>
            <Button
              size="sm"
              onClick={async () => {
                const ok = await copyToClipboard(token);
                if (ok) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }
              }}
            >
              <Copy size={12} /> {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className={CODE_CLS}>{token}</pre>
          <p className="text-[11px] text-text-muted mt-2">
            This token expires in 1 hour. Use it to enroll a connector.
          </p>
        </div>
      ) : null}
    </Card>
  );
}

// ---------- Create workspace ----------

function CreateWorkspaceCard({ tenantId }: { tenantId: string }) {
  const [agentId, setAgentId] = useState("demo-agent");
  const [workspaceId, setWorkspaceId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<{ agentId: string; workspaceId: string } | null>(null);

  const submit = async () => {
    if (!workspaceId) {
      setError("Workspace ID is required.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.post(`/admin/tenants/${tenantId}/agents/${agentId}/workspaces`, {
        workspaceId,
        displayName: displayName || workspaceId,
      });
      setCreated({ agentId, workspaceId });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card title="Create workspace" subtitle="Create a new workspace for an agent.">
      <div className="flex gap-3 flex-wrap mb-3">
        <Field label="Agent ID">
          <input
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Workspace ID">
          <input
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            className={INPUT_CLS}
            placeholder="my-workspace"
          />
        </Field>
        <Field label="Display name">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={INPUT_CLS}
            placeholder="My workspace"
          />
        </Field>
      </div>
      <Button variant="primary" onClick={submit} disabled={pending}>
        <Plus size={12} /> Create workspace
      </Button>
      {error ? (
        <div className="text-xs text-red bg-red-bg rounded-sm px-2 py-1 mt-3">{error}</div>
      ) : null}
      {created ? (
        <div className="mt-3 flex items-center gap-3">
          <Badge variant="success">Workspace created</Badge>
          <Link
            to={`/workspace/${tenantId}/${created.agentId}/${created.workspaceId}`}
            className="text-xs underline text-text"
          >
            Open workspace
          </Link>
        </div>
      ) : null}
    </Card>
  );
}

// ---------- Runtime ----------

type RuntimeAction = "status" | "setup" | "install" | "uninstall";

function RuntimeCard({ tenantId }: { tenantId: string }) {
  const [agentId, setAgentId] = useState("demo-agent");
  const [action, setAction] = useState<RuntimeAction>("status");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const run = async () => {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.post(
        `/admin/tenants/${tenantId}/agents/${agentId}/runtime/${action}`,
        {},
      );
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card
      title="Runtime management"
      subtitle="Manage the runtime for an agent (setup, install, uninstall, status)."
    >
      <div className="flex gap-3 flex-wrap mb-3">
        <Field label="Agent ID">
          <input
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Action">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as RuntimeAction)}
            className={INPUT_CLS}
          >
            <option value="status">Status</option>
            <option value="setup">Setup</option>
            <option value="install">Install</option>
            <option value="uninstall">Uninstall</option>
          </select>
        </Field>
      </div>
      <Button variant="primary" onClick={run} disabled={pending}>
        Run
      </Button>
      {error ? (
        <div className="text-xs text-red bg-red-bg rounded-sm px-2 py-1 mt-3">{error}</div>
      ) : null}
      {result !== null ? (
        <div className="mt-3">
          <Badge variant="success">{action} completed</Badge>
          <pre className={`${CODE_CLS} mt-2`}>{JSON.stringify(result, null, 2)}</pre>
        </div>
      ) : null}
    </Card>
  );
}

// ---------- Delete data ----------

type DeleteFlags = {
  conversations: boolean;
  activity: boolean;
  usage: boolean;
  projects: boolean;
  agents: boolean;
};

const DELETE_LABELS: Record<keyof DeleteFlags, string> = {
  conversations: "All conversations",
  activity: "Activity log",
  usage: "Usage records",
  projects: "All projects / workspaces",
  agents: "All agents (connectors)",
};

function DeleteDataCard({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const [flags, setFlags] = useState<DeleteFlags>({
    conversations: false,
    activity: false,
    usage: false,
    projects: false,
    agents: false,
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [log, setLog] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const selected = (Object.keys(flags) as (keyof DeleteFlags)[]).filter((k) => flags[k]);

  const toggle = (k: keyof DeleteFlags) => setFlags((f) => ({ ...f, [k]: !f[k] }));

  const selectAll = () =>
    setFlags({
      conversations: true,
      activity: true,
      usage: true,
      projects: true,
      agents: true,
    });

  const runDelete = async () => {
    setConfirmOpen(false);
    setConfirmText("");
    setPending(true);
    setError(null);
    const entries: string[] = [];
    try {
      const { agents } = await api.get<{ agents: Agent[] }>(`/tenants/${tenantId}/agents`);

      if (flags.conversations) {
        let total = 0;
        for (const a of agents) {
          try {
            const { workspaces } = await api.get<{ workspaces: Workspace[] }>(
              `/tenants/${tenantId}/agents/${a.agentId}/workspaces`,
            );
            for (const w of workspaces) {
              try {
                const res = await api.post<{ deleted?: number }>(
                  `/admin/tenants/${tenantId}/agents/${a.agentId}/workspaces/${w.workspaceId}/sessions/clear`,
                  {},
                );
                total += res?.deleted ?? 0;
              } catch (err) {
                entries.push(`  skip ${a.agentId}/${w.workspaceId}: ${(err as Error).message}`);
              }
            }
          } catch (err) {
            entries.push(`  skip agent ${a.agentId}: ${(err as Error).message}`);
          }
        }
        entries.push(`Conversations: ${total} session file(s) deleted`);
      }

      if (flags.activity) {
        const res = await api.del<{ deleted: number }>(`/admin/tenants/${tenantId}/activity`);
        entries.push(`Activity: ${res.deleted} record(s) deleted`);
      }

      if (flags.usage) {
        const res = await api.del<{ deleted: number }>(`/admin/tenants/${tenantId}/usage`);
        entries.push(`Usage: ${res.deleted} record(s) deleted`);
      }

      if (flags.projects) {
        let count = 0;
        for (const a of agents) {
          try {
            const { workspaces } = await api.get<{ workspaces: Workspace[] }>(
              `/tenants/${tenantId}/agents/${a.agentId}/workspaces`,
            );
            for (const w of workspaces) {
              try {
                await api.del(
                  `/admin/tenants/${tenantId}/agents/${a.agentId}/workspaces/${w.workspaceId}`,
                );
                count += 1;
              } catch (err) {
                entries.push(
                  `  skip ${a.agentId}/${w.workspaceId}: ${(err as Error).message}`,
                );
              }
            }
          } catch {
            /* skip */
          }
        }
        entries.push(`Projects: ${count} workspace(s) deleted`);
      }

      if (flags.agents) {
        let count = 0;
        for (const a of agents) {
          try {
            await api.del(`/admin/tenants/${tenantId}/agents/${a.agentId}`);
            count += 1;
          } catch (err) {
            entries.push(`  skip agent ${a.agentId}: ${(err as Error).message}`);
          }
        }
        entries.push(`Agents: ${count} agent(s) deleted`);
      }

      setLog(entries);
      setFlags({
        conversations: false,
        activity: false,
        usage: false,
        projects: false,
        agents: false,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
      // In case the user deleted the agents they were viewing
      if (flags.agents || flags.projects) navigate("/agents");
    }
  };

  return (
    <Card
      title="Delete data"
      subtitle="Select what you want to delete. This action is irreversible."
      danger
    >
      <div className="flex flex-col gap-2">
        {(Object.keys(DELETE_LABELS) as (keyof DeleteFlags)[]).map((k) => (
          <label key={k} className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={flags[k]}
              onChange={() => toggle(k)}
              className="accent-red"
            />
            {DELETE_LABELS[k]}
          </label>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <Button
          variant="danger"
          onClick={() => {
            if (selected.length === 0) {
              setError("Please select at least one option to delete.");
              return;
            }
            setError(null);
            setConfirmOpen(true);
          }}
          disabled={pending}
        >
          <Trash2 size={12} /> Delete selected
        </Button>
        <Button size="sm" onClick={selectAll}>
          Select all
        </Button>
      </div>
      {error ? (
        <div className="text-xs text-red bg-red-bg rounded-sm px-2 py-1 mt-3">{error}</div>
      ) : null}
      {log ? (
        <div className="mt-3">
          <Badge variant="success">Delete completed</Badge>
          <pre className={`${CODE_CLS} mt-2`}>{log.join("\n")}</pre>
        </div>
      ) : null}

      <Drawer
        open={confirmOpen}
        title="Confirm deletion"
        onClose={() => {
          setConfirmOpen(false);
          setConfirmText("");
        }}
        footer={
          <>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                setConfirmText("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={runDelete}
              disabled={confirmText !== "DELETE"}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-xs mb-3">You are about to permanently delete:</p>
        <ul className="list-disc ml-5 mb-4 text-xs">
          {selected.map((k) => (
            <li key={k}>{DELETE_LABELS[k]}</li>
          ))}
        </ul>
        <p className="text-[11px] text-text-muted mb-2">
          Type <span className="font-mono text-red">DELETE</span> to confirm.
        </p>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && confirmText === "DELETE") {
              e.preventDefault();
              void runDelete();
            }
          }}
          placeholder="DELETE"
          autoFocus
          className={`${INPUT_CLS} w-full ${
            confirmText && confirmText !== "DELETE" ? "border-red" : ""
          }`}
        />
      </Drawer>
    </Card>
  );
}
