import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { Button } from "../../components/Button";
import { Drawer } from "../../components/Drawer";
import { Empty, ErrorMsg, Loading } from "../../components/Empty";
import { TD, TH, THead, TR, Table } from "../../components/Table";
import { truncate } from "../../lib/format";

const RESOURCE_TYPES = [
  "tasks",
  "notes",
  "memory",
  "inbox",
  "people",
  "events",
  "personas",
  "plugins",
  "routines",
  "images",
] as const;

type ResourceType = (typeof RESOURCE_TYPES)[number];
type Item = Record<string, unknown> & { id?: string };

const COLUMN_PRIORITY = ["id", "title", "name", "content", "text", "status", "role", "createdAt"];

function pickColumns(items: Item[]): string[] {
  if (!items.length) return [];
  const keys = Object.keys(items[0]);
  const sorted = COLUMN_PRIORITY.filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !sorted.includes(k)).slice(0, 3);
  return [...sorted, ...rest].slice(0, 6);
}

export function ResourcesTab({ prefix }: { prefix: string }) {
  const [activeType, setActiveType] = useState<ResourceType>("tasks");
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const q = useQuery({
    queryKey: ["resource", prefix, activeType],
    queryFn: async () => {
      const data = await api.get<Record<string, Item[] | undefined>>(
        `${prefix}/${activeType}`,
      );
      return (
        (data[activeType] as Item[] | undefined) ??
        (data.items as Item[] | undefined) ??
        (Array.isArray(data) ? (data as unknown as Item[]) : [])
      );
    },
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) => api.del(`${prefix}/${activeType}`, { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resource", prefix, activeType] });
      setConfirmDelete(null);
    },
  });

  const items = useMemo(() => q.data ?? [], [q.data]);
  const columns = useMemo(() => pickColumns(items), [items]);

  return (
    <div>
      {/* Type pills */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {RESOURCE_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveType(t)}
            className={[
              "h-7 px-3 rounded-full text-[12px] border transition-colors",
              activeType === t
                ? "bg-text text-bg border-text"
                : "bg-bg border-border text-text-muted hover:bg-bg-hover",
            ].join(" ")}
          >
            {t}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorMsg message={(q.error as Error).message} />
      ) : (
        <>
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs text-text-muted">
              {items.length} item{items.length !== 1 ? "s" : ""}
            </span>
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={12} /> New {activeType.slice(0, -1)}
            </Button>
          </div>

          {items.length === 0 ? (
            <Empty title={`No ${activeType}`} description="Create your first item." />
          ) : (
            <Table>
              <THead>
                <tr>
                  {columns.map((c) => (
                    <TH key={c}>{c}</TH>
                  ))}
                  <TH />
                </tr>
              </THead>
              <tbody>
                {items.map((item, idx) => (
                  <TR key={(item.id as string) ?? idx}>
                    {columns.map((c) => (
                      <TD key={c} className={c === "id" ? "font-mono text-[11px]" : ""}>
                        {truncate(item[c], 80)}
                      </TD>
                    ))}
                    <TD className="w-10">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete((item.id as string) ?? null);
                        }}
                        className="h-6 w-6 flex items-center justify-center rounded-sm text-red hover:bg-red-bg"
                        aria-label="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}

      <CreateDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        resourceType={activeType}
        prefix={prefix}
      />

      <Drawer
        open={confirmDelete !== null}
        title="Delete item"
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => confirmDelete && deleteItem.mutate(confirmDelete)}
              disabled={deleteItem.isPending}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-xs">This item will be permanently removed.</p>
      </Drawer>
    </div>
  );
}

function CreateDrawer({
  open,
  onClose,
  resourceType,
  prefix,
}: {
  open: boolean;
  onClose: () => void;
  resourceType: ResourceType;
  prefix: string;
}) {
  const [json, setJson] = useState("{}");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: async () => {
      const parsed = JSON.parse(json);
      return api.post(`${prefix}/${resourceType}`, parsed);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resource", prefix, resourceType] });
      setJson("{}");
      setError(null);
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Drawer
      open={open}
      title={`New ${resourceType.slice(0, -1)}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending}>
            Create
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted uppercase tracking-wide">JSON data</span>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={12}
          placeholder='{"title": "...", "content": "..."}'
          className="font-mono text-[12px] px-2 py-2 bg-bg-input border border-border rounded-sm outline-none focus:border-border-strong"
        />
      </label>
      <p className="text-[11px] text-text-muted mt-1">
        The body is posted verbatim to the resource endpoint.
      </p>
      {error ? (
        <div className="text-xs text-red bg-red-bg rounded-sm px-2 py-1 mt-2">{error}</div>
      ) : null}
    </Drawer>
  );
}
