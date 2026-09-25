import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../api/client";
import { getFileCategory } from "../../../constants/icons";
import { joinPath } from "../FileExplorer/FileExplorerApp";
import { useFileListing } from "../../../state/useFileListing";
import type { FileSource } from "../../../types";

interface Props {
  initialFile?: { source: FileSource; path: string; name: string };
}

const DEFAULT_ADJUST = { brightness: 100, contrast: 100, saturation: 100 };

/** Viewer + light retouch for images opened from the File Explorer (or the
 * Start Menu/search) instead of only ever downloading them. Editing is
 * "non-destructive": adjustments preview live via CSS filters on the same
 * <img>, and "Enregistrer" bakes them into a NEW file (canvas -> blob ->
 * upload) alongside the original rather than overwriting it. */
export function GalleryApp({ initialFile }: Props) {
  const [source, setSource] = useState<FileSource>(initialFile?.source ?? "local");
  const [folder, setFolder] = useState(initialFile?.path ?? "");
  const [currentName, setCurrentName] = useState<string | undefined>(initialFile?.name);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [adjust, setAdjust] = useState(DEFAULT_ADJUST);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const fileKey = initialFile ? `${initialFile.source}:${initialFile.path}/${initialFile.name}` : undefined;
  useEffect(() => {
    if (!initialFile) return;
    setSource(initialFile.source);
    setFolder(initialFile.path);
    setCurrentName(initialFile.name);
    resetEdits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey]);

  const { entries, reload } = useFileListing(source, folder);
  const images = useMemo(
    () => entries.filter((e) => !e.is_dir && getFileCategory(e.name, false) === "image"),
    [entries]
  );
  const currentIndex = images.findIndex((e) => e.name === currentName);

  function resetEdits() {
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setAdjust(DEFAULT_ADJUST);
    setSaveMessage(null);
  }

  function go(delta: number) {
    if (images.length === 0) return;
    const next = ((currentIndex < 0 ? 0 : currentIndex) + delta + images.length) % images.length;
    setCurrentName(images[next].name);
    resetEdits();
  }

  const hasEdits =
    rotation !== 0 || flipH || flipV || adjust.brightness !== 100 || adjust.contrast !== 100 || adjust.saturation !== 100;

  const fileUrl = currentName
    ? `/api/files/${source}/download?path=${encodeURIComponent(joinPath(folder, currentName))}&inline=true`
    : null;
  const downloadUrl = currentName
    ? `/api/files/${source}/download?path=${encodeURIComponent(joinPath(folder, currentName))}`
    : null;

  const cssFilter = `brightness(${adjust.brightness}%) contrast(${adjust.contrast}%) saturate(${adjust.saturation}%)`;
  const cssTransform = `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`;

  async function saveEdited() {
    const img = imgRef.current;
    if (!img || !currentName) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const swap = rotation % 180 !== 0;
      const w = swap ? img.naturalHeight : img.naturalWidth;
      const h = swap ? img.naturalWidth : img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas non supporté.");
      ctx.filter = cssFilter;
      ctx.translate(w / 2, h / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Échec de l'export."))), "image/png")
      );
      const dot = currentName.lastIndexOf(".");
      const stem = dot > 0 ? currentName.slice(0, dot) : currentName;
      const newName = `${stem} (retouché).png`;
      const file = new File([blob], newName, { type: "image/png" });
      await api.upload(`/files/${source}/upload?path=${encodeURIComponent(folder)}`, file);
      reload();
      setSaveMessage(`Enregistré sous « ${newName} ».`);
    } catch {
      setSaveMessage("Échec de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="gallery-app">
      <div className="gallery-toolbar">
        <button onClick={() => go(-1)} disabled={images.length < 2} title="Photo précédente">
          ‹
        </button>
        <button onClick={() => go(1)} disabled={images.length < 2} title="Photo suivante">
          ›
        </button>
        <span className="gallery-filename">{currentName || "Aucune image"}</span>
        <div className="gallery-toolbar-spacer" />
        <button onClick={() => setRotation((r) => (r + 270) % 360)} title="Pivoter à gauche" disabled={!currentName}>
          ↶
        </button>
        <button onClick={() => setRotation((r) => (r + 90) % 360)} title="Pivoter à droite" disabled={!currentName}>
          ↷
        </button>
        <button onClick={() => setFlipH((v) => !v)} title="Miroir horizontal" disabled={!currentName}>
          ⇋
        </button>
        <button onClick={() => setFlipV((v) => !v)} title="Miroir vertical" disabled={!currentName}>
          ⇅
        </button>
        <button onClick={resetEdits} disabled={!currentName || !hasEdits} title="Réinitialiser les retouches">
          ↺ Réinitialiser
        </button>
        {downloadUrl && (
          <a className="gallery-download" href={downloadUrl} title="Télécharger l'original">
            ⬇ Télécharger
          </a>
        )}
        <button
          className="gallery-save"
          onClick={saveEdited}
          disabled={!currentName || !hasEdits || saving}
        >
          {saving ? "Enregistrement..." : "Enregistrer sous..."}
        </button>
      </div>

      <div className="gallery-adjust-row">
        <label>
          Luminosité
          <input
            type="range"
            min={40}
            max={180}
            value={adjust.brightness}
            onChange={(e) => setAdjust((a) => ({ ...a, brightness: Number(e.target.value) }))}
            disabled={!currentName}
          />
        </label>
        <label>
          Contraste
          <input
            type="range"
            min={40}
            max={180}
            value={adjust.contrast}
            onChange={(e) => setAdjust((a) => ({ ...a, contrast: Number(e.target.value) }))}
            disabled={!currentName}
          />
        </label>
        <label>
          Saturation
          <input
            type="range"
            min={0}
            max={200}
            value={adjust.saturation}
            onChange={(e) => setAdjust((a) => ({ ...a, saturation: Number(e.target.value) }))}
            disabled={!currentName}
          />
        </label>
        {saveMessage && <span className="gallery-save-message">{saveMessage}</span>}
      </div>

      <div className="gallery-viewport">
        {fileUrl ? (
          <img
            ref={imgRef}
            src={fileUrl}
            alt={currentName}
            style={{ transform: cssTransform, filter: cssFilter }}
          />
        ) : (
          <div className="gallery-empty">Aucune image sélectionnée. Ouvrez une photo depuis l'Explorateur de fichiers.</div>
        )}
      </div>
    </div>
  );
}
