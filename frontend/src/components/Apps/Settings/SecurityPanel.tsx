import { useEffect, useState } from "react";
import { api, ApiError } from "../../../api/client";
import type { MySecurity } from "../../../types";

function statusClass(status: string): string {
  if (status === "mfa_success" || status === "password_ok") return "ok";
  if (status === "locked" || status === "rate_limited") return "warn";
  return "fail";
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
