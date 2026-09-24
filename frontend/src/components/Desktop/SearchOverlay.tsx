import { useEffect, useImperativeHandle, useMemo, forwardRef } from "react";
import { APP_LABELS, DEFAULT_APP_ICONS } from "../../constants/icons";
import { useAuthStore } from "../../state/authStore";
import { useBookmarksStore } from "../../state/bookmarksStore";
import { useNotesStore } from "../../state/notesStore";
import { useWindowStore } from "../../state/windowStore";
import type { AppId } from "../../types";

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
}

export interface SearchOverlayHandle {
  /** Runs whichever result is currently first, if any - for the Enter key
   * pressed in the taskbar's own search input. */
  runFirst: () => void;
}

interface Result {
  key: string;
  icon: string;
  label: string;
  hint: string;
  onSelect: () => void;
}

const SEARCHABLE_APPS: { id: AppId; adminOnly?: boolean }[] = [
  { id: "browser" },
  { id: "files" },
  { id: "notes" },
  { id: "downloads" },
  { id: "settings" },
  { id: "security-dashboard", adminOnly: true },
  { id: "terminal", adminOnly: true },
  { id: "dockerctl", adminOnly: true },
];

const SETTINGS_TABS: { tab: string; icon: string; label: string; adminOnly?: boolean }[] = [
  { tab: "compte", icon: "👤", label: "Paramètres - Compte" },
  { tab: "bureau", icon: "🎨", label: "Paramètres - Bureau" },
  { tab: "applications", icon: "🧩", label: "Paramètres - Applications" },
  { tab: "securite", icon: "🛡️", label: "Paramètres - Sécurité" },
  { tab: "utilisateurs", icon: "👥", label: "Paramètres - Utilisateurs", adminOnly: true },
  { tab: "systeme", icon: "⚙️", label: "Paramètres - Système" },
];

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export const SearchOverlay = forwardRef<SearchOverlayHandle, Props>(function SearchOverlay(
  { query, onQueryChange, onClose },
  ref
) {
  const openWindow = useWindowStore((s) => s.openWindow);
  const me = useAuthStore((s) => s.me);
  const { bookmarks, loaded: bookmarksLoaded, load: loadBookmarks } = useBookmarksStore();
  const { notes, loaded: notesLoaded, load: loadNotes } = useNotesStore();

  useEffect(() => {
    if (!bookmarksLoaded) loadBookmarks();
    if (!notesLoaded) loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results = useMemo<Result[]>(() => {
    const q = norm(query.trim());
    if (!q) return [];
    const out: Result[] = [];

    for (const a of SEARCHABLE_APPS) {
      if (a.adminOnly && !me?.is_admin) continue;
      if (!norm(APP_LABELS[a.id]).includes(q)) continue;
      out.push({
        key: `app-${a.id}`,
        icon: DEFAULT_APP_ICONS[a.id],
        label: APP_LABELS[a.id],
        hint: "Application",
        onSelect: () => openWindow(a.id, APP_LABELS[a.id]),
      });
    }

    for (const t of SETTINGS_TABS) {
      if (t.adminOnly && !me?.is_admin) continue;
      if (!norm(t.label).includes(q)) continue;
      out.push({
        key: `settings-${t.tab}`,
        icon: t.icon,
        label: t.label,
        hint: "Réglage",
        onSelect: () => openWindow("settings", "Paramètres", { initialTab: t.tab }),
      });
    }

    for (const b of bookmarks) {
      if (!norm(b.title).includes(q) && !norm(b.url).includes(q)) continue;
      out.push({
        key: `bookmark-${b.id}`,
        icon: "🔖",
        label: b.title,
        hint: b.url,
        onSelect: () => openWindow("browser", b.title, { forceNew: true, initialUrl: b.url }),
      });
    }

    for (const n of notes) {
      if (!norm(n.title).includes(q) && !norm(n.folder).includes(q)) continue;
      out.push({
        key: `note-${n.id}`,
        icon: "📝",
        label: n.title || "Sans titre",
        hint: n.folder ? `Note - ${n.folder}` : "Note",
        onSelect: () => openWindow("notes", "Notes", { initialNoteId: n.id }),
      });
    }

    return out.slice(0, 20);
  }, [query, me, bookmarks, notes, openWindow]);

  function pick(r: Result) {
    r.onSelect();
    onQueryChange("");
    onClose();
  }

  useImperativeHandle(ref, () => ({
    runFirst() {
      if (results[0]) pick(results[0]);
    },
  }));

  if (!query.trim()) return null;

  return (
    <div className="search-overlay" onClick={(e) => e.stopPropagation()}>
      {results.length === 0 && <div className="search-overlay-empty">Aucun résultat.</div>}
      {results.map((r) => (
        <button key={r.key} className="search-overlay-result" onClick={() => pick(r)}>
          <span className="search-overlay-result-icon">{r.icon}</span>
          <span className="search-overlay-result-text">
            <span className="search-overlay-result-label">{r.label}</span>
            <span className="search-overlay-result-hint">{r.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
});
