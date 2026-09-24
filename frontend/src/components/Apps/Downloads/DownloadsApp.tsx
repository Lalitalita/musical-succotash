import { FormEvent, useEffect, useState } from "react";
import { useDownloadsStore } from "../../../state/downloadsStore";

function formatBytes(n: number | null): string {
  if (n == null) return "?";
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} Mo`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} Go`;
}

const STATUS_LABELS: Record<string, string> = {
  downloading: "Téléchargement...",
  done: "Terminé",
  failed: "Échec",
};

export function DownloadsApp() {
  const { downloads, loaded, load, create, remove } = useDownloadsStore();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  useEffect(() => {
    // Only worth polling while at least one download is still in progress -
    // a finished/failed list doesn't need to keep refreshing itself.
    const hasActive = downloads.some((d) => d.status === "downloading");
    if (!hasActive) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [downloads, load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || submitting) return;
    setSubmitting(true);
    try {
      await create(url.trim());
      setUrl("");
    } catch {
      /* the row list will simply not gain an entry; input stays filled to retry */
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="downloads-app">
      <form className="downloads-form" onSubmit={onSubmit}>
        <input
          className="settings-input"
          placeholder="https://exemple.com/fichier.zip"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoFocus
        />
        <button type="submit" className="settings-btn primary" disabled={submitting}>
          Télécharger
        </button>
      </form>

      <div className="downloads-list">
        {downloads.map((d) => {
          const pct =
            d.total_bytes && d.total_bytes > 0 ? Math.min(100, Math.round((d.downloaded_bytes / d.total_bytes) * 100)) : null;
          return (
            <div key={d.id} className={`downloads-row status-${d.status}`}>
              <div className="downloads-row-main">
                <span className="downloads-filename">{d.filename || d.url}</span>
                <button className="downloads-remove" title="Retirer de la liste" onClick={() => remove(d.id)}>
                  ✕
                </button>
              </div>
              <div className="downloads-row-meta">
                <span>{STATUS_LABELS[d.status] || d.status}</span>
                <span>
                  {formatBytes(d.downloaded_bytes)}
                  {d.total_bytes ? ` / ${formatBytes(d.total_bytes)}` : ""}
                </span>
              </div>
              {d.status === "downloading" && (
                <div className="downloads-progress-track">
                  <div
                    className={`downloads-progress-fill ${pct == null ? "indeterminate" : ""}`}
                    style={pct != null ? { width: `${pct}%` } : undefined}
                  />
                </div>
              )}
              {d.status === "failed" && d.error && <div className="downloads-error">{d.error}</div>}
            </div>
          );
        })}
        {downloads.length === 0 && loaded && (
          <div className="downloads-empty">Aucun téléchargement - collez une URL ci-dessus.</div>
        )}
      </div>
    </div>
  );
}
