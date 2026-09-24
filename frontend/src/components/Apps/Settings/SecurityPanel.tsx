import { useEffect, useState } from "react";
import { api, ApiError } from "../../../api/client";
import { openContextMenu } from "../../../state/contextMenuStore";
import type { ActiveSession, MySecurity } from "../../../types";

function statusClass(status: string): string {
  if (status === "mfa_success" || status === "password_ok") return "ok";
  if (status === "locked" || status === "rate_limited") return "warn";
  return "fail";
}

function SessionsSection() {
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

  return (
    <>
      <h4>Sessions actives</h4>
      <p className="settings-hint">
        Les appareils actuellement connectés à votre compte. Déconnecter une session la termine
        immédiatement, sur cet appareil-là uniquement.
      </p>
      {error && <p className="settings-hint">{error}</p>}
      {!error && !sessions && <p className="settings-hint">Chargement...</p>}
      {sessions && (
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
                <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.user_agent || "Appareil inconnu"}
                  {s.is_current && (
                    <span className="status-pill ok" style={{ marginLeft: 8 }}>
                      Cet appareil
                    </span>
                  )}
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
      )}
    </>
  );
}

export function SecurityPanel() {
  const [data, setData] = useState<MySecurity | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<MySecurity>("/security/me")
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Impossible de charger vos informations."));
  }, []);

  if (error) return <p className="settings-hint">{error}</p>;
  if (!data) return <p className="settings-hint">Chargement...</p>;

  return (
    <div>
      <h4>Votre compte</h4>
      <div className="settings-row">
        <span>Double authentification (2FA)</span>
        <span className={`status-pill ${data.mfa_enabled ? "ok" : "warn"}`}>
          {data.mfa_enabled ? "Activée" : "Désactivée"}
        </span>
      </div>
      <div className="settings-row">
        <span>Compte créé le</span>
        <span>{new Date(data.account_created_at).toLocaleDateString()}</span>
      </div>

      <SessionsSection />

      <h4>Vos dernières connexions</h4>
      <p className="settings-hint">
        Uniquement vos propres tentatives de connexion - pas celles des autres comptes.
      </p>
      <table className="attempts-table">
        <thead>
          <tr>
            <th>Horodatage</th>
            <th>Statut</th>
            <th>IP</th>
            <th>Localisation</th>
            <th>Appareil</th>
          </tr>
        </thead>
        <tbody>
          {data.recent_attempts.length === 0 && (
            <tr>
              <td colSpan={5}>Aucune tentative enregistrée.</td>
            </tr>
          )}
          {data.recent_attempts.map((a) => (
            <tr key={a.id}>
              <td>{new Date(a.timestamp).toLocaleString()}</td>
              <td>
                <span className={`status-pill ${statusClass(a.status)}`}>{a.status}</span>
              </td>
              <td>{a.ip_address}</td>
              <td>{[a.city, a.country].filter(Boolean).join(", ") || "—"}</td>
              <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{a.user_agent}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
