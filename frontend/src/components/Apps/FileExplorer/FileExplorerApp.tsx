import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../../api/client";
import { getFileCategory } from "../../../constants/icons";
import { AppIconGlyph } from "../../IconPicker/AppIconGlyph";
import { openContextMenu, type ContextMenuItem } from "../../../state/contextMenuStore";
import {
  useFileExplorerCategoriesStore,
  type FileExplorerCategory,
  type PinnedFolder,
} from "../../../state/fileExplorerCategoriesStore";
import { useFileExplorerStore } from "../../../state/fileExplorerStore";
import { useFileTypeIcon } from "../../../state/fileTypeIconsStore";
import { saveDesktopState } from "../../../state/persistence";
import type { FileEntry, FileSource } from "../../../types";

interface Props {
  windowId: string;
}

function joinPath(base: string, name: string): string {
  return base ? `${base}/${name}` : name;
}

function formatSize(bytes: number, isDir: boolean): string {
  if (isDir) return "—";
  if (bytes < 1024) return `${bytes} o`;
  const units = ["Ko", "Mo", "Go", "To"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function FileRowIcon({ entry }: { entry: FileEntry }) {
  const category = getFileCategory(entry.name, entry.is_dir);
  const icon = useFileTypeIcon(category);
  return <AppIconGlyph className="file-icon" icon={icon} />;
}

function Sidebar({
  activeSource,
  activePath,
  onNavigate,
}: {
  activeSource: FileSource;
  activePath: string;
  onNavigate: (source: FileSource, path: string) => void;
}) {
  const categories = useFileExplorerCategoriesStore((s) => s.categories);
  const unpinFolder = useFileExplorerCategoriesStore((s) => s.unpinFolder);

  function unpin(category: FileExplorerCategory, folder: PinnedFolder) {
    unpinFolder(category.id, folder.id);
    saveDesktopState();
  }

  return (
    <div className="file-explorer-sidebar">
      <button
        className={`sidebar-item ${activeSource === "local" && activePath === "" ? "active" : ""}`}
        onClick={() => onNavigate("local", "")}
      >
        💾 Local
      </button>
      <button
        className={`sidebar-item ${activeSource === "smb" && activePath === "" ? "active" : ""}`}
        onClick={() => onNavigate("smb", "")}
      >
        🏠 Partage SMB
      </button>

      {categories.map((category) => (
        <div key={category.id} className="sidebar-category">
          <div className="sidebar-category-name">{category.name}</div>
          {category.folders.length === 0 ? (
            <div className="sidebar-category-empty">Vide</div>
          ) : (
            category.folders.map((folder) => (
              <button
                key={folder.id}
                className={`sidebar-item pinned ${
                  activeSource === folder.source && activePath === folder.path ? "active" : ""
                }`}
                onClick={() => onNavigate(folder.source, folder.path)}
                onContextMenu={(e) =>
                  openContextMenu(e, [
                    {
                      label: "Détacher",
                      icon: "✕",
                      danger: true,
                      onSelect: () => unpin(category, folder),
                    },
                  ])
                }
              >
                {folder.isDir ? "📁" : "📄"} {folder.label}
              </button>
            ))
          )}
        </div>
      ))}
    </div>
  );
}

export function FileExplorerApp({ windowId }: Props) {
  const { byWindow, ensureWindow, navigate: navigateTab } = useFileExplorerStore();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smbUnconfigured, setSmbUnconfigured] = useState(false);
  const [newFolderName, setNewFolderName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ensureWindow(windowId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowId]);

  const win = byWindow[windowId];
  const activeTab = win?.tabs.find((t) => t.id === win.activeTabId);
  const source = activeTab?.source ?? "local";
  const path = activeTab?.path ?? "";
  // `api.get/post/del/upload` already prefix calls with "/api" (see
  // src/api/client.ts) - `base` must NOT repeat it, or every request 404s
  // on "/api/api/...". `directBase` is only for window.open(), which needs
  // the real path since it bypasses the api client entirely.
  const base = `/files/${source}`;
  const directBase = `/api/files/${source}`;

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setSmbUnconfigured(false);
    api
      .get<FileEntry[]>(`${base}?path=${encodeURIComponent(path)}`)
      .then((rows) => setEntries(rows))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 503) {
          setSmbUnconfigured(true);
        } else if (e instanceof ApiError) {
          setError(e.message);
        } else {
          setError("Erreur inconnue.");
        }
        setEntries([]);
      })
      .finally(() => setLoading(false));
  }, [base, path]);

  useEffect(() => {
    load();
  }, [load]);

  function navigate(nextSource: FileSource, nextPath: string) {
    if (!activeTab) return;
    navigateTab(windowId, activeTab.id, nextSource, nextPath);
    setNewFolderName(null);
  }

  function goTo(next: string) {
    if (!activeTab) return;
    navigateTab(windowId, activeTab.id, source, next);
  }

  function openEntry(entry: FileEntry) {
    if (entry.is_dir) {
      goTo(joinPath(path, entry.name));
    } else {
      downloadEntry(entry);
    }
  }

  function downloadEntry(entry: FileEntry) {
    const full = joinPath(path, entry.name);
    window.open(`${directBase}/download?path=${encodeURIComponent(full)}`, "_blank");
  }

  function deleteEntry(entry: FileEntry) {
    const full = joinPath(path, entry.name);
    const label = entry.is_dir ? "ce dossier (et son contenu)" : "ce fichier";
    if (!window.confirm(`Supprimer ${label} « ${entry.name} » ?`)) return;
    api
      .del(`${base}?path=${encodeURIComponent(full)}`)
      .then(() => load())
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Échec de la suppression."));
  }

  function buildRowMenu(entry: FileEntry): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];
    if (!entry.is_dir) {
      items.push({ label: "Télécharger", icon: "⬇", onSelect: () => downloadEntry(entry) });
    }

    const categories = useFileExplorerCategoriesStore.getState().categories;
    const full = joinPath(path, entry.name);
    const folder: Omit<PinnedFolder, "id"> = { label: entry.name, source, path: full, isDir: entry.is_dir };

    categories.forEach((c, i) => {
      items.push({
        label: `Épingler dans « ${c.name} »`,
        icon: "📌",
        separatorBefore: i === 0,
        onSelect: () => {
          useFileExplorerCategoriesStore.getState().pinFolder(c.id, folder);
          saveDesktopState();
        },
      });
    });
    items.push({
      label: "Épingler dans une nouvelle catégorie...",
      icon: "📌",
      separatorBefore: categories.length === 0,
      onSelect: () => {
        const name = window.prompt("Nom de la nouvelle catégorie :");
        if (!name || !name.trim()) return;
        const category = useFileExplorerCategoriesStore.getState().addCategory(name);
        if (category) {
          useFileExplorerCategoriesStore.getState().pinFolder(category.id, folder);
          saveDesktopState();
        }
      },
    });

    items.push({
      label: "Supprimer",
      icon: "🗑",
      danger: true,
      separatorBefore: true,
      onSelect: () => deleteEntry(entry),
    });

    return items;
  }

  function handleUploadChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    api
      .upload(`${base}/upload?path=${encodeURIComponent(path)}`, file)
      .then(() => load())
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Échec de l'envoi."));
  }

  function submitNewFolder(e: FormEvent) {
    e.preventDefault();
    const name = (newFolderName || "").trim();
    if (!name) {
      setNewFolderName(null);
      return;
    }
    api
      .post(`${base}/mkdir?path=${encodeURIComponent(joinPath(path, name))}`)
      .then(() => {
        setNewFolderName(null);
        load();
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Échec de la création du dossier."));
  }

  const segments = path ? path.split("/") : [];

  if (!activeTab) return null;

  return (
    <div className="file-explorer">
      <div className="file-explorer-main">
        <Sidebar activeSource={source} activePath={path} onNavigate={navigate} />

        <div className="file-explorer-panel">
          <div className="file-explorer-toolbar">
            <button onClick={() => fileInputRef.current?.click()}>⬆ Uploader</button>
            <input ref={fileInputRef} type="file" hidden onChange={handleUploadChange} />
            <button onClick={() => setNewFolderName("")}>📁 Nouveau dossier</button>
            <button onClick={() => load()}>⟳ Actualiser</button>
          </div>

          <div className="file-explorer-breadcrumb">
            <button className="crumb" onClick={() => goTo("")}>
              {source === "local" ? "Mes fichiers" : "Partage SMB"}
            </button>
            {segments.map((seg, i) => (
              <span key={i}>
                <span className="crumb-sep">/</span>
                <button className="crumb" onClick={() => goTo(segments.slice(0, i + 1).join("/"))}>
                  {seg}
                </button>
              </span>
            ))}
          </div>

          {newFolderName !== null && (
            <form className="file-explorer-newfolder" onSubmit={submitNewFolder}>
              <input
                autoFocus
                placeholder="Nom du dossier"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onBlur={() => !newFolderName && setNewFolderName(null)}
              />
              <button type="submit">Créer</button>
              <button type="button" onClick={() => setNewFolderName(null)}>
                Annuler
              </button>
            </form>
          )}

          <div className="file-explorer-body">
            {smbUnconfigured ? (
              <div className="file-explorer-empty">
                Partage SMB non configuré sur ce serveur. Définissez <code>SMB_HOST</code>, <code>SMB_SHARE</code>{" "}
                (et si besoin <code>SMB_USERNAME</code> / <code>SMB_PASSWORD</code> / <code>SMB_DOMAIN</code>) dans
                la configuration du backend pour l'activer.
              </div>
            ) : error ? (
              <div className="file-explorer-empty">Erreur : {error}</div>
            ) : loading ? (
              <div className="file-explorer-empty">Chargement...</div>
            ) : entries.length === 0 ? (
              <div className="file-explorer-empty">Ce dossier est vide.</div>
            ) : (
              <table className="file-explorer-table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Taille</th>
                    <th>Modifié le</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.name}
                      onDoubleClick={() => openEntry(entry)}
                      onContextMenu={(e) => openContextMenu(e, buildRowMenu(entry))}
                    >
                      <td>
                        <FileRowIcon entry={entry} />
                        {entry.name}
                      </td>
                      <td>{formatSize(entry.size, entry.is_dir)}</td>
                      <td>{formatDate(entry.mtime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
