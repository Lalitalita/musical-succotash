import { useEffect, useMemo, useRef, useState } from "react";
import { openContextMenu } from "../../../state/contextMenuStore";
import { useNotesStore } from "../../../state/notesStore";
import type { Note } from "../../../types";

const AUTOSAVE_DELAY_MS = 600;

interface Props {
  /** Jump straight to this note - e.g. a result picked from global search.
   * Re-applied whenever it changes, not just on mount, so picking a
   * different note from search while this window is already open still
   * navigates to it. */
  initialNoteId?: string;
}

export function NotesApp({ initialNoteId }: Props) {
  const { notes, loaded, load, getNote, create, update, remove } = useNotesStore();
  const [activeId, setActiveId] = useState<string | null>(initialNoteId || null);
  const [draft, setDraft] = useState<Note | null>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  useEffect(() => {
    if (initialNoteId) setActiveId(initialNoteId);
  }, [initialNoteId]);

  useEffect(() => {
    if (!activeId) {
      setDraft(null);
      return;
    }
    let cancelled = false;
    getNote(activeId).then((note) => {
      if (!cancelled) setDraft(note);
    });
    return () => {
      cancelled = true;
    };
  }, [activeId, getNote]);

  const groups = useMemo(() => {
    const byFolder = new Map<string, typeof notes>();
    for (const n of notes) {
      const key = n.folder || "Sans dossier";
      if (!byFolder.has(key)) byFolder.set(key, []);
      byFolder.get(key)!.push(n);
    }
    return [...byFolder.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [notes]);

  function scheduleSave(next: Note) {
    setDraft(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      update(next.id, { title: next.title, folder: next.folder, content: next.content });
    }, AUTOSAVE_DELAY_MS);
  }

  async function onNew() {
    const note = await create();
    setActiveId(note.id);
    setDraft(note);
  }

  async function onDelete(id: string) {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    await remove(id);
    if (activeId === id) setActiveId(null);
  }

  return (
    <div className="notes-app">
      <div className="notes-sidebar">
        <button className="notes-new-btn" onClick={onNew}>
          + Nouvelle note
        </button>
        <div className="notes-list">
          {groups.map(([folder, items]) => (
            <div key={folder} className="notes-folder-group">
              <div className="notes-folder-label">{folder}</div>
              {items.map((n) => (
                <button
                  key={n.id}
                  className={`notes-list-item ${n.id === activeId ? "active" : ""}`}
                  onClick={() => setActiveId(n.id)}
                  onContextMenu={(e) =>
                    openContextMenu(e, [
                      { label: "Supprimer", icon: "🗑", danger: true, onSelect: () => onDelete(n.id) },
                    ])
                  }
                >
                  <span className="notes-list-title">{n.title || "Sans titre"}</span>
                  <span className="notes-list-date">{new Date(n.updated_at).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          ))}
          {notes.length === 0 && loaded && <div className="notes-empty">Aucune note - créez-en une.</div>}
        </div>
      </div>

      <div className="notes-editor">
        {draft ? (
          <>
            <div className="notes-editor-header">
              <input
                className="notes-title-input"
                value={draft.title}
                placeholder="Titre"
                onChange={(e) => scheduleSave({ ...draft, title: e.target.value })}
              />
              <input
                className="notes-folder-input"
                value={draft.folder}
                placeholder="Dossier (optionnel)"
                onChange={(e) => scheduleSave({ ...draft, folder: e.target.value })}
              />
              <button className="notes-delete-btn" title="Supprimer" onClick={() => onDelete(draft.id)}>
                🗑
              </button>
            </div>
            <textarea
              className="notes-content-input"
              value={draft.content}
              placeholder="Écrivez en Markdown..."
              onChange={(e) => scheduleSave({ ...draft, content: e.target.value })}
            />
          </>
        ) : (
          <div className="notes-empty-state">Sélectionnez une note ou créez-en une nouvelle.</div>
        )}
      </div>
    </div>
  );
}
