"use client";

import { useLocale } from "@/components/locale-provider";
import { useEffect, useState, useCallback } from "react";
import { BookOpen, Plus, FolderOpen, Tag, Save, Trash2, X, FileText } from "lucide-react";

interface Note {
  id: string;
  title: string;
  content: string;
  folder: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export default function NotesPage() {
  const { messages, formatDate } = useLocale();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState("all");
  const [selectedTag, setSelectedTag] = useState("");
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editFolder, setEditFolder] = useState("");
  const [editTags, setEditTags] = useState("");

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch("/api/notes");
      const data = await res.json();
      setNotes(data.notes || []);
    } catch {
      /* empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const folders = Array.from(new Set(notes.map((n) => n.folder).filter(Boolean)));
  const allTags = Array.from(new Set(notes.flatMap((n) => n.tags)));

  const filtered = notes.filter((n) => {
    if (selectedFolder === "unfiled" && n.folder) return false;
    if (selectedFolder !== "all" && selectedFolder !== "unfiled" && n.folder !== selectedFolder) return false;
    if (selectedTag && !n.tags.includes(selectedTag)) return false;
    return true;
  });

  const activeNote = notes.find((n) => n.id === activeNoteId) || null;

  function openNote(note: Note) {
    setActiveNoteId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditFolder(note.folder);
    setEditTags(note.tags.join(", "));
  }

  function closeEditor() {
    setActiveNoteId(null);
    setEditTitle("");
    setEditContent("");
    setEditFolder("");
    setEditTags("");
  }

  async function createNote() {
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled", content: "", folder: selectedFolder === "all" || selectedFolder === "unfiled" ? "" : selectedFolder, tags: [] }),
      });
      const note = await res.json();
      setNotes((prev) => [note, ...prev]);
      openNote(note);
    } catch {
      /* empty */
    }
  }

  async function saveNote() {
    if (!activeNoteId) return;
    const tags = editTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      const res = await fetch("/api/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeNoteId, title: editTitle, content: editContent, folder: editFolder, tags }),
      });
      const updated = await res.json();
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    } catch {
      /* empty */
    }
  }

  async function deleteNote(id: string) {
    try {
      await fetch(`/api/notes?id=${id}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (activeNoteId === id) closeEditor();
    } catch {
      /* empty */
    }
  }

  function fmtDate(ts: number) {
    return formatDate(new Date(ts), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="notes-page">
      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border overflow-x-auto shrink-0">
          <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <button
            onClick={() => setSelectedTag("")}
            className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap transition-colors ${!selectedTag ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? "" : tag)}
              className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap transition-colors ${selectedTag === tag ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Folder sidebar */}
        <div className="w-[200px] shrink-0 border-r border-border bg-muted/30 p-3 overflow-y-auto">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Folders</p>
          <button
            data-testid="notes-folder-all"
            onClick={() => setSelectedFolder("all")}
            className={`w-full text-left text-sm px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${selectedFolder === "all" ? "bg-foreground/10 text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            All Notes
            <span className="ml-auto text-xs opacity-60">{notes.length}</span>
          </button>
          <button
            data-testid="notes-folder-unfiled"
            onClick={() => setSelectedFolder("unfiled")}
            className={`w-full text-left text-sm px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${selectedFolder === "unfiled" ? "bg-foreground/10 text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            <FileText className="w-3.5 h-3.5" />
            Unfiled
            <span className="ml-auto text-xs opacity-60">{notes.filter((n) => !n.folder).length}</span>
          </button>
          {folders.map((f) => (
            <button
              key={f}
              data-testid={`notes-folder-${f.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              onClick={() => setSelectedFolder(f)}
              className={`w-full text-left text-sm px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${selectedFolder === f ? "bg-foreground/10 text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              {f}
              <span className="ml-auto text-xs opacity-60">{notes.filter((n) => n.folder === f).length}</span>
            </button>
          ))}
        </div>

        {/* Note list */}
        <div className="w-[280px] shrink-0 border-r border-border overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <FileText className="w-8 h-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No notes yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Create one to get started</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((note) => (
                <button
                  key={note.id}
                  data-testid="note-list-item"
                  data-note-id={note.id}
                  onClick={() => openNote(note)}
                  className={`w-full text-left p-3 transition-colors hover:bg-muted/50 ${activeNoteId === note.id ? "bg-muted" : ""}`}
                >
                  <p className="text-sm font-medium text-foreground truncate">{note.title || "Untitled"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {note.content.slice(0, 80) || "Empty note"}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-muted-foreground/60">{fmtDate(note.updatedAt)}</span>
                    {note.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Editor panel */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {activeNote ? (
            <div className="p-4 flex flex-col gap-4 h-full">
              <div className="flex items-center justify-between shrink-0">
                <input
                  data-testid="notes-title-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Note title..."
                  className="text-lg font-semibold text-foreground bg-transparent border-none outline-none w-full placeholder:text-muted-foreground/40"
                />
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  <button
                    data-testid="notes-save-button"
                    onClick={saveNote}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Save"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                  <button
                    data-testid="notes-delete-button"
                    onClick={() => deleteNote(activeNote.id)}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-500 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    data-testid="notes-close-button"
                    onClick={closeEditor}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    data-testid="notes-folder-input"
                    value={editFolder}
                    onChange={(e) => setEditFolder(e.target.value)}
                    placeholder="Folder"
                    className="text-xs bg-muted rounded px-2 py-1 text-foreground w-32 outline-none border border-border focus:border-foreground/30"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    data-testid="notes-tags-input"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    placeholder="tag1, tag2..."
                    className="text-xs bg-muted rounded px-2 py-1 text-foreground w-48 outline-none border border-border focus:border-foreground/30"
                  />
                </div>
              </div>

              <textarea
                data-testid="notes-editor-content"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="Write your note..."
                className="flex-1 w-full bg-muted/30 rounded-lg p-4 text-sm text-foreground font-mono leading-relaxed outline-none resize-none border border-border focus:border-foreground/20 placeholder:text-muted-foreground/40"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <BookOpen className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Select a note to edit</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Or create a new one</p>
            </div>
          )}
        </div>
      </div>

      {/* Floating new note button */}
      <button
        data-testid="notes-create-button"
        onClick={createNote}
        className="absolute bottom-6 right-6 w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity"
        title="New Note"
      >
        <Plus className="w-5 h-5" />
      </button>
    </div>
  );
}
