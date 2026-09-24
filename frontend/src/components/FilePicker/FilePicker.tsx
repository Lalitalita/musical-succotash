import { ChangeEvent, useRef, useState } from "react";
import { api } from "../../api/client";
import { FileRowIcon, formatDate, formatSize, Sidebar, joinPath } from "../Apps/FileExplorer/FileExplorerApp";
import { useFileListing } from "../../state/useFileListing";
import type { FileEntry, FileSource } from "../../types";

export interface PickedFile {
  source: FileSource;
  path: string;
  name: string;
  /** Ready to use as an <img src>/CSS url() - same-origin, auth via cookie. */
  url: string;
}

interface Props {
  title?: string;
  /** Only files this returns true for can be picked (folders are always
   * navigable regardless) - e.g. images only for an avatar/wallpaper
   * picker. Omit to allow any file. */
  accept?: (entry: FileEntry) => boolean;
  onSelect: (file: PickedFile) => void;
  onClose: () => void;
}

/** Generic "choose a file" window: browses the webdesktop's own File
 * Explorer (Local/SMB) instead of the client OS's native file picker, so a
 * chosen image/logo/file always comes from - and stays on - the server.
 * Reused anywhere an app needs to ask for an existing file (avatar,
 * wallpaper image, ...). Icons are a separate, existing system
 * (IconPicker/banque d'icônes) and don't go through this. */
export function FilePicker({ title, accept, onSelect, onClose }: Props) {
  const [source, setSource] = useState<FileSource>("local");
  const [path, setPath] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const { entries, loading, error, smbUnconfigured, reload, base } = useFileListing(source, path);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function navigate(nextSource: FileSource, nextPath: string) {
    setSource(nextSource);
    setPath(nextPath);
    setSelectedName(null);
  }

  function goTo(next: string) {
    setPath(next);
    setSelectedName(null);
  }

  function isPickable(entry: FileEntry): boolean {
    return !entry.is_dir && (!accept || accept(entry));
  }

  function onRowClick(entry: FileEntry) {
    if (entry.is_dir) return;
    if (isPickable(entry)) setSelectedName(entry.name);
  }

  function onRowDoubleClick(entry: FileEntry) {
    if (entry.is_dir) {
      goTo(joinPath(path, entry.name));
    } else if (isPickable(entry)) {
      confirmPick(entry.name);
    }
  }

  function confirmPick(name = selectedName) {
    if (!name) return;
    const full = joinPath(path, name);
    onSelect({ source, path, name, url: `/api/files/${source}/download?path=${encodeURIComponent(full)}` });
    onClose();
  }

  async function onUploadChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      await api.upload(`${base}/upload?path=${encodeURIComponent(path)}`, file);
      reload();
    } finally {
      setUploading(false);
    }
  }

  const segments = path ? path.split("/") : [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card file-picker" onClick={(e) => e.stopPropagation()}>
        <h3>{title || "Choisir un fichier"}</h3>

        <div className="file-picker-body">
          <Sidebar activeSource={source} activePath={path} onNavigate={navigate} />

          <div className="file-picker-main">
            <div className="file-explorer-toolbar">
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? "Envoi..." : "⬆ Importer"}
              </button>
              <input ref={fileInputRef} type="file" hidden onChange={onUploadChange} />
              <button onClick={() => reload()} title="Recharger">
                ⟳ Actualiser
              </button>
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

            <div className="file-explorer-body">
              {smbUnconfigured ? (
                <div className="file-explorer-empty">Partage SMB non configuré sur ce serveur.</div>
              ) : error ? (
                <div className="file-explorer-empty">Erreur : {error}</div>
              ) : loading && entries.length === 0 ? (
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
                        className={`${entry.name === selectedName ? "selected" : ""} ${
                          !entry.is_dir && !isPickable(entry) ? "unselectable" : ""
                        }`}
                        onClick={() => onRowClick(entry)}
                        onDoubleClick={() => onRowDoubleClick(entry)}
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

        <div className="modal-actions">
          <button type="button" className="settings-btn" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="settings-btn primary" disabled={!selectedName} onClick={() => confirmPick()}>
            Sélectionner
          </button>
        </div>
      </div>
    </div>
  );
}
