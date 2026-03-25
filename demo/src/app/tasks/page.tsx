"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  Plus, Loader2, Target, GripVertical, X,
  ChevronDown, ChevronRight, Trash2, Flag,
  CheckCircle2, Circle, AlertTriangle, Clock,
} from "lucide-react";

/* ── Types ── */
interface Task {
  id: string;
  title: string;
  description: string;
  status: "backlog" | "in_progress" | "done" | "blocked";
  priority: "low" | "medium" | "high" | "urgent";
  goalId?: string;
  labels: string[];
  linkedSessionIds: string[];
  createdAt: number;
  updatedAt: number;
}

interface Goal {
  id: string;
  title: string;
  description: string;
  parentId?: string;
  progress: number;
  status: "active" | "completed" | "paused";
  taskIds: string[];
  createdAt: number;
  updatedAt: number;
}

type ColumnKey = Task["status"];

const COLUMNS: { key: ColumnKey; label: string; icon: React.ReactNode; accent: string }[] = [
  { key: "backlog", label: "Backlog", icon: <Circle className="w-3.5 h-3.5" />, accent: "text-muted-foreground" },
  { key: "in_progress", label: "In Progress", icon: <Clock className="w-3.5 h-3.5" />, accent: "text-blue-500" },
  { key: "done", label: "Done", icon: <CheckCircle2 className="w-3.5 h-3.5" />, accent: "text-emerald-500" },
  { key: "blocked", label: "Blocked", icon: <AlertTriangle className="w-3.5 h-3.5" />, accent: "text-red-500" },
];

const PRIORITY_CONFIG: Record<Task["priority"], { label: string; color: string }> = {
  urgent: { label: "Urgent", color: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" },
  high: { label: "High", color: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20" },
  medium: { label: "Medium", color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" },
  low: { label: "Low", color: "bg-muted text-muted-foreground border-border" },
};

export default function TasksPage() {
  const { messages, formatDate } = useLocale();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [goalsExpanded, setGoalsExpanded] = useState(true);
  const [newTaskColumn, setNewTaskColumn] = useState<ColumnKey | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Task["priority"]>("medium");
  const [creating, setCreating] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [creatingGoal, setCreatingGoal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ColumnKey | null>(null);
  const [editingTask, setEditingTask] = useState<Partial<Task> | null>(null);
  const [saving, setSaving] = useState(false);

  /* ── Data fetching ── */
  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks ?? []);
        setGoals(data.goals ?? []);
      }
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Task CRUD ── */
  const createTask = async () => {
    if (!newTaskTitle.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          status: newTaskColumn || "backlog",
          priority: newTaskPriority,
        }),
      });
      if (res.ok) {
        const task = await res.json();
        setTasks((prev) => [...prev, task]);
        setNewTaskTitle("");
        setNewTaskPriority("medium");
        setNewTaskColumn(null);
      }
    } catch { /* ignore */ }
    setCreating(false);
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
        if (selectedTask?.id === id) setSelectedTask(updated);
      }
    } catch { /* ignore */ }
  };

  const deleteTask = async (id: string) => {
    try {
      const res = await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== id));
        if (selectedTask?.id === id) setSelectedTask(null);
      }
    } catch { /* ignore */ }
  };

  const saveTaskEdits = async () => {
    if (!selectedTask || !editingTask) return;
    setSaving(true);
    await updateTask(selectedTask.id, editingTask);
    setEditingTask(null);
    setSaving(false);
  };

  /* ── Goal CRUD ── */
  const createGoal = async () => {
    if (!newGoalTitle.trim() || creatingGoal) return;
    setCreatingGoal(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "goal", title: newGoalTitle.trim() }),
      });
      if (res.ok) {
        const goal = await res.json();
        setGoals((prev) => [...prev, goal]);
        setNewGoalTitle("");
        setShowGoalForm(false);
      }
    } catch { /* ignore */ }
    setCreatingGoal(false);
  };

  const deleteGoal = async (id: string) => {
    try {
      const res = await fetch(`/api/tasks?id=${id}&type=goal`, { method: "DELETE" });
      if (res.ok) setGoals((prev) => prev.filter((g) => g.id !== id));
    } catch { /* ignore */ }
  };

  /* ── Drag & drop ── */
  const handleDragStart = (taskId: string) => {
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent, column: ColumnKey) => {
    e.preventDefault();
    setDragOverColumn(column);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (column: ColumnKey) => {
    if (draggedTaskId) {
      const task = tasks.find((t) => t.id === draggedTaskId);
      if (task && task.status !== column) {
        await updateTask(draggedTaskId, { status: column });
      }
    }
    setDraggedTaskId(null);
    setDragOverColumn(null);
  };

  /* ── Helpers ── */
  const tasksByColumn = (col: ColumnKey) =>
    tasks.filter((t) => t.status === col).sort((a, b) => b.updatedAt - a.updatedAt);

  const goalForTask = (task: Task) => goals.find((g) => g.id === task.goalId);

  const computeGoalProgress = (goal: Goal) => {
    const linked = tasks.filter((t) => t.goalId === goal.id);
    if (linked.length === 0) return 0;
    const done = linked.filter((t) => t.status === "done").length;
    return Math.round((done / linked.length) * 100);
  };

  /* ── Loading state ── */
  if (!loaded) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" data-testid="tasks-page">
      {/* ── Header ── */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Target className="w-5 h-5 text-muted-foreground" />
            {messages.nav?.tasks ?? "Tasks & Goals"}
          </h1>
          <div className="flex items-center gap-1.5">
            <button
              data-testid="tasks-new-button"
              onClick={() => setNewTaskColumn("backlog")}
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              New Task
            </button>
          </div>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Organize your work with a Kanban board and track goals
        </p>
      </div>

      {/* ── Goals section ── */}
      <div className="flex-shrink-0 px-6 pb-4">
        <button
          onClick={() => setGoalsExpanded(!goalsExpanded)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors mb-2"
        >
          {goalsExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          Goals ({goals.length})
        </button>

        {goalsExpanded && (
          <div className="space-y-2">
            {goals.map((goal) => {
              const progress = computeGoalProgress(goal);
              const linkedCount = tasks.filter((t) => t.goalId === goal.id).length;
              return (
                <div key={goal.id} className="bg-card border border-border rounded-xl px-4 py-3 group">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Target className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-[13px] font-medium text-foreground truncate">{goal.title}</span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {linkedCount} task{linkedCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-muted-foreground">{progress}%</span>
                      <button
                        onClick={() => deleteGoal(goal.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 p-1 rounded-lg hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {showGoalForm ? (
              <div className="bg-card border border-border rounded-xl px-4 py-3">
                <div className="flex gap-2">
                  <input
                    data-testid="tasks-goal-title-input"
                    type="text"
                    value={newGoalTitle}
                    onChange={(e) => setNewGoalTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createGoal();
                      if (e.key === "Escape") { setShowGoalForm(false); setNewGoalTitle(""); }
                    }}
                    autoFocus
                    placeholder="Goal title..."
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition-colors"
                  />
                  <button
                    data-testid="tasks-goal-add-confirm"
                    onClick={createGoal}
                    disabled={!newGoalTitle.trim() || creatingGoal}
                    className="px-3 py-1.5 bg-foreground text-primary-foreground text-[12px] font-medium rounded-lg hover:bg-foreground-intense disabled:opacity-40 transition-colors"
                  >
                    {creatingGoal ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
                  </button>
                  <button
                    onClick={() => { setShowGoalForm(false); setNewGoalTitle(""); }}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                data-testid="tasks-add-goal-button"
                onClick={() => setShowGoalForm(true)}
                className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Goal
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Kanban board ── */}
      <div className="flex-1 overflow-x-auto px-6 pb-6">
        <div className="flex gap-4 h-full min-w-max">
          {COLUMNS.map((col) => {
            const colTasks = tasksByColumn(col.key);
            const isOver = dragOverColumn === col.key;
            return (
              <div
                key={col.key}
                data-testid={`tasks-column-${col.key}`}
                className={`w-72 flex flex-col rounded-xl transition-colors ${
                  isOver ? "bg-muted/60 ring-2 ring-foreground/10" : "bg-muted/30"
                }`}
                onDragOver={(e) => handleDragOver(e, col.key)}
                onDragLeave={handleDragLeave}
                onDrop={() => handleDrop(col.key)}
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0">
                  <div className={`flex items-center gap-1.5 text-[12px] font-semibold ${col.accent}`}>
                    {col.icon}
                    {col.label}
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                      {colTasks.length}
                    </span>
                  </div>
                  <button
                    data-testid={`tasks-column-add-${col.key}`}
                    onClick={() => setNewTaskColumn(col.key)}
                    className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Inline new task form */}
                {newTaskColumn === col.key && (
                  <div className="mx-2 mb-2 bg-card border border-border rounded-xl p-3 shadow-sm">
                    <input
                      data-testid="tasks-new-title-input"
                      type="text"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") createTask();
                        if (e.key === "Escape") { setNewTaskColumn(null); setNewTaskTitle(""); }
                      }}
                      autoFocus
                      placeholder="Task title..."
                      className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none mb-2"
                    />
                    <div className="flex items-center justify-between">
                      <select
                        data-testid="tasks-new-priority-select"
                        value={newTaskPriority}
                        onChange={(e) => setNewTaskPriority(e.target.value as Task["priority"])}
                        className="text-[11px] bg-muted border border-border rounded-md px-2 py-1 text-foreground focus:outline-none"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                      <div className="flex items-center gap-1.5">
                        <button
                          data-testid="tasks-new-cancel-button"
                          onClick={() => { setNewTaskColumn(null); setNewTaskTitle(""); }}
                          className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          data-testid="tasks-new-add-button"
                          onClick={createTask}
                          disabled={!newTaskTitle.trim() || creating}
                          className="text-[11px] font-medium bg-foreground text-primary-foreground px-3 py-1 rounded-md disabled:opacity-40 transition-colors flex items-center gap-1"
                        >
                          {creating && <Loader2 className="w-3 h-3 animate-spin" />}
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Task cards */}
                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                  {colTasks.map((task) => {
                    const goal = goalForTask(task);
                    const isDragging = draggedTaskId === task.id;
                    return (
                      <div
                        key={task.id}
                        data-testid="task-card"
                        data-task-id={task.id}
                        draggable
                        onDragStart={() => handleDragStart(task.id)}
                        onDragEnd={() => { setDraggedTaskId(null); setDragOverColumn(null); }}
                        onClick={() => { setSelectedTask(task); setEditingTask(null); }}
                        className={`bg-card border border-border rounded-xl p-3 cursor-pointer hover:border-foreground/20 hover:shadow-sm transition-all group ${
                          isDragging ? "opacity-40 scale-95" : ""
                        } ${selectedTask?.id === task.id ? "ring-2 ring-foreground/15 border-foreground/20" : ""}`}
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-foreground leading-snug mb-1.5 line-clamp-2">
                              {task.title}
                            </p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${PRIORITY_CONFIG[task.priority].color}`}>
                                {PRIORITY_CONFIG[task.priority].label}
                              </span>
                              {task.labels.map((label) => (
                                <span key={label} className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                                  {label}
                                </span>
                              ))}
                              {goal && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center gap-1">
                                  <Target className="w-2.5 h-2.5" />
                                  {goal.title}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {colTasks.length === 0 && !newTaskColumn && (
                    <div className="text-center py-8 text-[11px] text-muted-foreground/50">
                      No tasks
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Task detail panel ── */}
      {selectedTask && (
        <div
          data-testid="task-detail-panel"
          className="fixed inset-0 z-50 flex justify-end"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedTask(null); }}
        >
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setSelectedTask(null)} />
          <div className="relative w-full max-w-md bg-card border-l border-border shadow-2xl h-full overflow-y-auto animate-in slide-in-from-right-8 duration-200">
            {/* Panel header */}
            <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border px-5 py-4 flex items-center justify-between z-10">
              <h2 className="text-[14px] font-semibold text-foreground">Task Details</h2>
              <div className="flex items-center gap-1">
                <button
                  data-testid="task-detail-delete-button"
                  onClick={() => deleteTask(selectedTask.id)}
                  className="text-muted-foreground hover:text-red-500 p-1.5 rounded-lg hover:bg-red-500/10 transition-all"
                  title="Delete task"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="px-5 py-5 space-y-5">
              {/* Title */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Title</label>
                {editingTask !== null ? (
                  <input
                    data-testid="task-detail-title-input"
                    type="text"
                    value={editingTask.title ?? selectedTask.title}
                    onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition-colors"
                  />
                ) : (
                  <p
                    className="text-[15px] font-medium text-foreground cursor-pointer hover:text-foreground/80 transition-colors"
                    onClick={() => setEditingTask({ title: selectedTask.title })}
                  >
                    {selectedTask.title}
                  </p>
                )}
              </div>

              {/* Status */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Status</label>
                <div className="flex gap-1.5">
                  {COLUMNS.map((col) => (
                    <button
                      key={col.key}
                      data-testid={`task-status-${col.key}`}
                      onClick={() => updateTask(selectedTask.id, { status: col.key })}
                      className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1 ${
                        selectedTask.status === col.key
                          ? "bg-foreground text-primary-foreground border-foreground"
                          : "bg-card text-muted-foreground border-border hover:border-foreground/20 hover:text-foreground"
                      }`}
                    >
                      {col.icon}
                      {col.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Priority</label>
                <div className="flex gap-1.5">
                  {(["low", "medium", "high", "urgent"] as const).map((p) => (
                    <button
                      key={p}
                      data-testid={`task-priority-${p}`}
                      onClick={() => updateTask(selectedTask.id, { priority: p })}
                      className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1 ${
                        selectedTask.priority === p
                          ? `${PRIORITY_CONFIG[p].color} border`
                          : "bg-card text-muted-foreground border-border hover:border-foreground/20"
                      }`}
                    >
                      <Flag className="w-3 h-3" />
                      {PRIORITY_CONFIG[p].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Description</label>
                {editingTask !== null ? (
                  <textarea
                    data-testid="task-detail-description-input"
                    value={editingTask.description ?? selectedTask.description}
                    onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                    rows={4}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition-colors resize-none"
                    placeholder="Add a description..."
                  />
                ) : (
                  <p
                    className="text-[13px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors min-h-[2rem]"
                    onClick={() => setEditingTask({ description: selectedTask.description })}
                  >
                    {selectedTask.description || "Click to add description..."}
                  </p>
                )}
              </div>

              {/* Goal */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Goal</label>
                <select
                  data-testid="task-detail-goal-select"
                  value={selectedTask.goalId || ""}
                  onChange={(e) => updateTask(selectedTask.id, { goalId: e.target.value || undefined })}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition-colors"
                >
                  <option value="">No goal</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>{g.title}</option>
                  ))}
                </select>
              </div>

              {/* Labels */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Labels</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedTask.labels.map((label) => (
                    <span key={label} className="text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border flex items-center gap-1">
                      {label}
                      <button
                        onClick={() => updateTask(selectedTask.id, { labels: selectedTask.labels.filter((l) => l !== label) })}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  data-testid="task-detail-label-input"
                  type="text"
                  placeholder="Type and press Enter to add label..."
                  className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition-colors"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val && !selectedTask.labels.includes(val)) {
                        updateTask(selectedTask.id, { labels: [...selectedTask.labels, val] });
                      }
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                />
              </div>

              {/* Save edits button */}
              {editingTask !== null && (
                <div className="flex gap-2 pt-2">
                  <button
                    data-testid="task-detail-save-button"
                    onClick={saveTaskEdits}
                    disabled={saving}
                    className="flex-1 px-4 py-2 bg-foreground text-primary-foreground text-[12px] font-medium rounded-lg hover:bg-foreground-intense disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
                  >
                    {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                    Save Changes
                  </button>
                  <button
                    onClick={() => setEditingTask(null)}
                    className="px-4 py-2 text-[12px] text-muted-foreground hover:text-foreground border border-border rounded-lg hover:border-foreground/20 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Metadata */}
              <div className="border-t border-border pt-4 space-y-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Created</span>
                  <span className="text-foreground">{formatDate(new Date(selectedTask.createdAt), { dateStyle: "medium", timeStyle: "short" })}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Updated</span>
                  <span className="text-foreground">{formatDate(new Date(selectedTask.updatedAt), { dateStyle: "medium", timeStyle: "short" })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
