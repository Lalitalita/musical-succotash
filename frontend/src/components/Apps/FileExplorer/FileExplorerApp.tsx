import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../../api/client";
import type { FileEntry, FileSource } from "../../../types";

interface ContextMenuState {
  x: number;
  y: number;
  entry: FileEntry;
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

export function FileExplorerApp() {
  const [source, setSource] = useState<FileSource>("local");
  const [paths, setPaths] = useState<Record<FileSource, string>>({ local: "", smb: "" });
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smbUnconfigured, setSmbUnconfigured] = useState(false);
  const [newFolderName, setNewFolderName] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const path = paths[source];
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

  function switchSource(next: FileSource) {
    setSource(next);
    setContextMenu(null);
    setNewFolderName(null);
  }

  function goTo(next: string) {
    setPaths((p) => ({ ...p, [source]: next }));
    setContextMenu(null);
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
    setContextMenu(null);
  }

  function deleteEntry(entry: FileEntry) {
    setContextMenu(null);
    const full = joinPath(path, entry.name);
    const label = entry.is_dir ? "ce dossier (et son contenu)" : "ce fichier";
    if (!window.confirm(`Supprimer ${label} « ${entry.name} » ?`)) return;
    api
      .del(`${base}?path=${encodeURIComponent(full)}`)
      .then(() => load())
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Échec de la suppression."));
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

  return (
    <div className="file-explorer" onClick={() => setContextMenu(null)}>
      <div className="file-explorer-tabs">
        <button
          className={`file-source-tab ${source === "local" ? "active" : ""}`}
          onClick={() => switchSource("local")}
        >
          💾 Local
        </button>
        <button className={`file-source-tab ${source === "smb" ? "active" : ""}`} onClick={() => switchSource("smb")}>
          🏠 SMB
        </button>
      </div>

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
            Partage SMB non configuré sur ce serveur. Définissez <code>SMB_HOST</code>, <code>SMB_SHARE</code> (et si
            besoin <code>SMB_USERNAME</code> / <code>SMB_PASSWORD</code> / <code>SMB_DOMAIN</code>) dans la
            configuration du backend pour l'activer.
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
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ x: e.clientX, y: e.clientY, entry });
                  }}
                >
                  <td>
                    <span className="file-icon">{entry.is_dir ? "📂" : "📄"}</span>
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

      {contextMenu && (
        <div
          className="file-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {!contextMenu.entry.is_dir && (
            <button onClick={() => downloadEntry(contextMenu.entry)}>⬇ Télécharger</button>
          )}
          <button onClick={() => deleteEntry(contextMenu.entry)}>🗑 Supprimer</button>
        </div>
      )}
    </div>
  );
}
