import { useEffect, useMemo, useState } from "react";
import { getFileCategory } from "../../../constants/icons";
import { joinPath } from "../FileExplorer/FileExplorerApp";
import { useFileListing } from "../../../state/useFileListing";
import type { FileSource } from "../../../types";

interface Props {
  initialFile?: { source: FileSource; path: string; name: string };
}

/** PDF viewer ("Hadobe" - not that one) opened from the File Explorer:
 * shows the PDF in place via the browser's own built-in PDF renderer
 * instead of forcing a download just to see what's in it. The download
 * endpoint normally sends Content-Disposition: attachment (so a plain
 * double-click still downloads by default elsewhere) - `inline=true` here
 * is what lets an <iframe> render it instead of triggering a save dialog. */
export function HadobeApp({ initialFile }: Props) {
  const [source, setSource] = useState<FileSource>(initialFile?.source ?? "local");
  const [folder, setFolder] = useState(initialFile?.path ?? "");
  const [currentName, setCurrentName] = useState<string | undefined>(initialFile?.name);

  const fileKey = initialFile ? `${initialFile.source}:${initialFile.path}/${initialFile.name}` : undefined;
  useEffect(() => {
    if (!initialFile) return;
    setSource(initialFile.source);
    setFolder(initialFile.path);
    setCurrentName(initialFile.name);
  }, [fileKey]);

  const { entries } = useFileListing(source, folder);
  const pdfs = useMemo(() => entries.filter((e) => !e.is_dir && getFileCategory(e.name, false) === "pdf"), [entries]);
  const currentIndex = pdfs.findIndex((e) => e.name === currentName);

  function go(delta: number) {
    if (pdfs.length === 0) return;
    const next = ((currentIndex < 0 ? 0 : currentIndex) + delta + pdfs.length) % pdfs.length;
    setCurrentName(pdfs[next].name);
  }

  const fileUrl = currentName
    ? `/api/files/${source}/download?path=${encodeURIComponent(joinPath(folder, currentName))}&inline=true`
    : null;
  const downloadUrl = currentName
    ? `/api/files/${source}/download?path=${encodeURIComponent(joinPath(folder, currentName))}`
    : null;

  return (
    <div className="hadobe-app">
      <div className="hadobe-toolbar">
        <button onClick={() => go(-1)} disabled={pdfs.length < 2} title="Document précédent">
          ‹
        </button>
        <button onClick={() => go(1)} disabled={pdfs.length < 2} title="Document suivant">
          ›
        </button>
        <span className="hadobe-filename">{currentName || "Aucun document"}</span>
        <div className="gallery-toolbar-spacer" />
        {downloadUrl && (
          <a className="gallery-download" href={downloadUrl} title="Télécharger">
            ⬇ Télécharger
          </a>
        )}
      </div>
      <div className="hadobe-viewport">
        {fileUrl ? (
          <iframe title={currentName} src={fileUrl} />
        ) : (
          <div className="gallery-empty">Aucun document sélectionné. Ouvrez un PDF depuis l'Explorateur de fichiers.</div>
        )}
      </div>
    </div>
  );
}
