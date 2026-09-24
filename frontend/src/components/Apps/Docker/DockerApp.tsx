import { useEffect, useState } from "react";
import { api, ApiError } from "../../../api/client";
import type { DockerContainer } from "../../../types";

function stateClass(state: string): string {
  if (state === "running") return "ok";
  if (state === "exited" || state === "dead") return "fail";
  return "warn";
}

export function DockerApp() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [logs, setLogs] = useState("");
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function loadContainers() {
    api
      .get<DockerContainer[]>("/admin/docker/containers")
      .then((rows) => {
        setContainers(rows);
        setAvailable(true);
        setError(null);
      })
      .catch((e) => {
        setAvailable(false);
        setError(e instanceof ApiError ? e.message : "Docker indisponible.");
      });
  }

  useEffect(() => {
    loadContainers();
    const t = setInterval(loadContainers, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoadingLogs(true);
    api
      .get<{ logs: string }>(`/admin/docker/containers/${encodeURIComponent(selected)}/logs?tail=300`)
      .then((r) => setLogs(r.logs))
      .catch(() => setLogs("Impossible de charger les logs."))
      .finally(() => setLoadingLogs(false));
  }, [selected]);

  async function action(name: string, verb: "start" | "stop" | "restart") {
    setBusy(name);
    try {
      await api.post(`/admin/docker/containers/${encodeURIComponent(name)}/${verb}`);
      loadContainers();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action impossible.");
    } finally {
      setBusy(null);
    }
  }

  const selectedContainer = containers.find((c) => c.Names === selected);

  return (
    <div className="docker-app">
      {available === false && (
        <div className="docker-unavailable">
          <p>Docker n'est pas accessible.</p>
          <p className="settings-hint">{error || "Erreur inconnue."}</p>
        </div>
      )}

      {available && (
        <div className="docker-layout">
          <div className="docker-list">
            {containers.map((c) => (
              <button
                key={c.ID}
                className={`docker-list-item ${c.Names === selected ? "active" : ""}`}
                onClick={() => setSelected(c.Names)}
              >
                <span className={`status-pill ${stateClass(c.State)}`}>{c.State}</span>
                <span className="docker-list-name">{c.Names}</span>
              </button>
            ))}
            {containers.length === 0 && <div className="docker-empty">Aucun conteneur.</div>}
          </div>

          <div className="docker-detail">
            {selectedContainer ? (
              <>
                <div className="docker-detail-header">
                  <h4>{selectedContainer.Names}</h4>
                  <div className="docker-detail-actions">
                    <button
                      className="settings-btn"
                      disabled={busy === selectedContainer.Names}
                      onClick={() => action(selectedContainer.Names, "start")}
                    >
                      Démarrer
                    </button>
                    <button
                      className="settings-btn"
                      disabled={busy === selectedContainer.Names}
                      onClick={() => action(selectedContainer.Names, "stop")}
                    >
                      Arrêter
                    </button>
                    <button
                      className="settings-btn"
                      disabled={busy === selectedContainer.Names}
                      onClick={() => action(selectedContainer.Names, "restart")}
                    >
                      Redémarrer
                    </button>
                  </div>
                </div>
                <div className="settings-row">
                  <span>Image</span>
                  <span>{selectedContainer.Image}</span>
                </div>
                <div className="settings-row">
                  <span>Statut</span>
                  <span>{selectedContainer.Status}</span>
                </div>
                <div className="settings-row">
                  <span>Ports</span>
                  <span>{selectedContainer.Ports || "—"}</span>
                </div>
                <h4>Logs (300 dernières lignes)</h4>
                <pre className="docker-logs">{loadingLogs ? "Chargement..." : logs || "(vide)"}</pre>
              </>
            ) : (
              <div className="docker-empty-state">Sélectionnez un conteneur.</div>
            )}
          </div>
        </div>
      )}

      {error && <p className="settings-hint docker-error">{error}</p>}
    </div>
  );
}
