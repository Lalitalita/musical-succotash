import { useEffect, useState } from "react";
import { api, ApiError } from "../../../api/client";

interface UpdateStatus {
  enabled: boolean;
  repo: string;
  branch: string;
  current_commit: string | null;
  latest_commit: string | null;
  running: boolean;
  last_run: { status?: string; started_at?: string; finished_at?: string; backup?: string } | null;
}

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 8) : "?";
}

export function UpdatePanel() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  async function refresh() {
    try {
      const res = await api.get<UpdateStatus>("/admin/update/status");
      setStatus(res);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Impossible de vérifier les mises à jour.");
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, []);

  async function onApply() {
    setApplying(true);
    try {
      await api.post("/admin/update/apply");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Échec du démarrage de la mise à jour.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <h4>Mise à jour</h4>
      {!status ? (
        <p className="settings-hint">{error || "Vérification..."}</p>
      ) : !status.enabled ? (
        <p className="settings-hint">
          Non activée. Voir <code>docker-compose.selfupdate.yml</code> et <code>SELF_UPDATE_ENABLED</code> dans le
          README pour l'activer (attention : donne au backend un accès root à l'hôte).
        </p>
      ) : (
        <>
          <div className="settings-row">
            <span>Dépôt</span>
            <span>
              {status.repo}@{status.branch}
            </span>
          </div>
          <div className="settings-row">
            <span>Version installée</span>
            <span>{shortSha(status.current_commit)}</span>
          </div>
          <div className="settings-row">
            <span>Dernière version GitHub</span>
            <span>{shortSha(status.latest_commit)}</span>
          </div>
          {status.current_commit && status.latest_commit && status.current_commit !== status.latest_commit ? (
            <p className="settings-hint">Une nouvelle version est disponible.</p>
          ) : (
            <p className="settings-hint">Vous êtes à jour.</p>
          )}
          {error && <div className="auth-error">{error}</div>}
          <button
            className="settings-btn primary"
            onClick={onApply}
            disabled={applying || status.running}
          >
            {status.running ? "Mise à jour en cours..." : applying ? "Démarrage..." : "Sauvegarder et mettre à jour"}
          </button>
          {status.running && (
            <p className="settings-hint">
              Sauvegarde puis reconstruction en cours - le bureau va se déconnecter brièvement pendant le redémarrage
              des conteneurs.
            </p>
          )}
          {status.last_run?.status && !status.running && (
            <p className="settings-hint">
              Dernière tentative : {status.last_run.status === "success" ? "réussie" : "échouée"}
              {status.last_run.finished_at ? ` (${new Date(status.last_run.finished_at).toLocaleString()})` : ""}
            </p>
          )}
        </>
      )}
    </>
  );
}
