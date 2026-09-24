import { useEffect, useState } from "react";
import { api, ApiError } from "../../../api/client";
import { openContextMenu } from "../../../state/contextMenuStore";
import type { ActiveSession } from "../../../types";

export function SessionsApp() {
  const [sessions, setSessions] = useState<ActiveSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<ActiveSession[]>("/sessions")
      .then(setSessions)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Impossible de charger vos sessions."));
  }

  useEffect(load, []);

  async function revoke(id: string) {
    await api.del(`/sessions/${id}`);
    setSessions((prev) => prev?.filter((s) => s.id !== id) ?? null);
  }

  if (error) return <p className="settings-hint sessions-app">{error}</p>;
  if (!sessions) return <p className="settings-hint sessions-app">Chargement...</p>;

  return (
    <div className="sessions-app">
      <p className="settings-hint">
        Les appareils actuellement connectés à votre compte. Déconnecter une session la termine
        immédiatement, sur cet appareil-là uniquement.
      </p>
      <table className="attempts-table">
        <thead>
          <tr>
            <th>Appareil</th>
            <th>IP</th>
            <th>Connecté depuis</th>
            <th>Dernière activité</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sessions.length === 0 && (
            <tr>
              <td colSpan={5}>Aucune session active.</td>
            </tr>
          )}
          {sessions.map((s) => (
            <tr
              key={s.id}
              onContextMenu={(e) =>
                !s.is_current &&
                openContextMenu(e, [
                  { label: "Déconnecter", icon: "🚪", danger: true, onSelect: () => revoke(s.id) },
                ])
              }
            >
              <td style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>
                {s.user_agent || "Appareil inconnu"}
                {s.is_current && <span className="status-pill ok" style={{ marginLeft: 8 }}>Cet appareil</span>}
              </td>
              <td>{s.ip_address}</td>
              <td>{new Date(s.created_at).toLocaleString()}</td>
              <td>{new Date(s.last_seen_at).toLocaleString()}</td>
              <td>
                {!s.is_current && (
                  <button className="settings-icon-btn danger" title="Déconnecter" onClick={() => revoke(s.id)}>
                    🚪
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
