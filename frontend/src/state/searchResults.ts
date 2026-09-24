import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import { APP_LABELS, DEFAULT_APP_ICONS } from "../constants/icons";
import { useAuthStore } from "./authStore";
import { useBookmarksStore } from "./bookmarksStore";
import { useCustomAppsStore } from "./customAppsStore";
import { useFileExplorerStore } from "./fileExplorerStore";
import { useNotesStore } from "./notesStore";
import { useWindowStore } from "./windowStore";
import type { AppId, IndexedFileResult } from "../types";

export interface SearchResult {
  key: string;
  icon: string;
  iconUrl?: string;
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

// Only digits/operators/parens/%/whitespace can ever reach `Function` below
// - this regex is what makes that safe, not the Function call itself. At
// least one digit AND one operator are required so a plain note titled
// "2024" or a lone "(" typed while searching doesn't get treated as maths.
const _CALC_CHARS_RE = /^[\d+\-*/().%\s]+$/;
const _HAS_DIGIT_RE = /\d/;
const _HAS_OPERATOR_RE = /[+\-*/%]/;

export function tryCalculate(raw: string): number | null {
  const q = raw.trim();
  if (!q || !_CALC_CHARS_RE.test(q) || !_HAS_DIGIT_RE.test(q) || !_HAS_OPERATOR_RE.test(q)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const value = new Function(`"use strict"; return (${q});`)();
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return value;
  } catch {
    return null;
  }
}

function fileOpenUrl(f: IndexedFileResult): string {
  const full = f.path ? `${f.path}/${f.name}` : f.name;
  return `/api/files/${f.source}/download?path=${encodeURIComponent(full)}`;
}

/** Debounced backend file search (see backend/app/file_indexer.py +
 * routers/search.py) - only queried past 2 characters, and only after the
 * user pauses typing for a beat, so this doesn't fire on every keystroke. */
export function useFileSearchResults(query: string): IndexedFileResult[] {
  const [results, setResults] = useState<IndexedFileResult[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .get<IndexedFileResult[]>(`/search/files?q=${encodeURIComponent(q)}`)
        .then((rows) => {
          if (!cancelled) setResults(rows);
        })
        .catch((e: unknown) => {
          if (!cancelled && !(e instanceof ApiError)) setResults([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  return results;
}

/** Shared search logic behind both the taskbar's Ctrl+K overlay and the
 * Start Menu's own inline search bar - apps (built-in + custom), Settings
 * sections, bookmarks, notes, a calculator, and indexed files, all in one
 * ranked list so both surfaces behave identically. */
export function useSearchResults(query: string): SearchResult[] {
  const openWindow = useWindowStore((s) => s.openWindow);
  const me = useAuthStore((s) => s.me);
  const { bookmarks, loaded: bookmarksLoaded, load: loadBookmarks } = useBookmarksStore();
  const { notes, loaded: notesLoaded, load: loadNotes } = useNotesStore();
  const customApps = useCustomAppsStore((s) => s.apps);
  const fileResults = useFileSearchResults(query);

  useEffect(() => {
    if (!bookmarksLoaded) loadBookmarks();
    if (!notesLoaded) loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useMemo<SearchResult[]>(() => {
    const raw = query.trim();
    const q = norm(raw);
    if (!q) return [];
    const out: SearchResult[] = [];

    const calc = tryCalculate(raw);
    if (calc !== null) {
      out.push({
        key: "calc",
        icon: "🧮",
        label: String(calc),
        hint: `${raw} = ${calc} (Entrée pour copier)`,
        onSelect: () => {
          navigator.clipboard?.writeText(String(calc)).catch(() => undefined);
        },
      });
    }

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

    for (const c of customApps) {
      if (!norm(c.label).includes(q)) continue;
      out.push({
        key: `custom-${c.id}`,
        icon: c.icon,
        iconUrl: c.iconUrl,
        label: c.label,
        hint: "Application",
        onSelect: () =>
          openWindow("browser", c.label, {
            forceNew: true,
            initialUrl: c.url,
            chromeless: c.chromeless,
            initialMode: c.fullMode ? "full" : undefined,
          }),
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

    for (const f of fileResults) {
      out.push({
        key: `file-${f.source}-${f.path}-${f.name}`,
        icon: f.is_dir ? "📁" : "📄",
        label: f.name,
        hint: f.is_dir
          ? `Dossier - ${f.source === "local" ? "Local" : "Partage SMB"}${f.path ? ` / ${f.path}` : ""}`
          : `Fichier - ${f.source === "local" ? "Local" : "Partage SMB"}${f.path ? ` / ${f.path}` : ""}`,
        onSelect: () => {
          if (f.is_dir) {
            const path = f.path ? `${f.path}/${f.name}` : f.name;
            const winId = openWindow("files", "Explorateur de fichiers");
            const fe = useFileExplorerStore.getState();
            fe.ensureWindow(winId, { source: f.source, path });
            const win = fe.byWindow[winId];
            if (win) fe.navigate(winId, win.activeTabId, f.source, path);
          } else {
            window.open(fileOpenUrl(f), "_blank");
          }
        },
      });
    }

    return out.slice(0, 20);
  }, [query, me, bookmarks, notes, customApps, fileResults, openWindow]);
}
