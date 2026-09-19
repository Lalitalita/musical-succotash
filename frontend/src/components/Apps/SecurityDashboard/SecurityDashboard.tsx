import { useEffect, useState } from "react";
import { api, ApiError } from "../../../api/client";
import type { LoginAttempt, SecurityStats } from "../../../types";

function statusClass(status: string): string {
  if (status === "mfa_success" || status === "password_ok") return "ok";
  if (status === "locked" || status === "rate_limited") return "warn";
  return "fail";
}

export function SecurityDashboard() {
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [attempts, setAttempts] = useState<LoginAttempt[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get<SecurityStats>("/admin/security/stats"), api.get<LoginAttempt[]>("/admin/security/attempts")])
      .then(([s, a]) => {
        setStats(s);
        setAttempts(a);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Accès refusé"));
  }, []);

  if (error) {
    return <div style={{ padding: 20 }}>Impossible de charger le tableau de bord: {error}</div>;
  }
  if (!stats) {
    return <div style={{ padding: 20 }}>Chargement...</div>;
  }

  const maxDay = Math.max(1, ...stats.attempts_per_day.map((d) => d.count));

  return (
    <div className="dashboard">
      <div className="dashboard-cards">
        <div className="stat-card">
          <div className="value">{stats.total_attempts}</div>
          <div className="label">Tentatives</div>
        </div>
        <div className="stat-card">
          <div className="value">{stats.success_count}</div>
          <div className="label">Connexions réussies</div>
        </div>
        <div className="stat-card">
          <div className="value">{stats.failure_count}</div>
          <div className="label">Échecs</div>
        </div>
        <div className="stat-card">
          <div className="value">{stats.locked_count}</div>
          <div className="label">Blocages</div>
        </div>
      </div>

      <h4>Activité par jour</h4>
      <div className="bar-chart">
        {stats.attempts_per_day.map((d) => (
          <div key={d.date} className="bar" style={{ height: `${(d.count / maxDay) * 100}%` }} title={`${d.date}: ${d.count}`} />
        ))}
      </div>

      <h4>Origines géographiques</h4>
      <div>
        {stats.top_countries.map((c) => (
          <div key={c.country} style={{ fontSize: 12, marginBottom: 4 }}>
            {c.country} — {c.count}
          </div>
        ))}
        {stats.top_countries.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Aucune donnée de géolocalisation (base GeoLite2 non installée).
          </div>
        )}
      </div>

      <h4>Historique des tentatives</h4>
      <table className="attempts-table">
        <thead>
          <tr>
            <th>Horodatage</th>
            <th>Utilisateur</th>
            <th>Statut</th>
            <th>IP</th>
            <th>Localisation</th>
            <th>User-Agent</th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((a) => (
            <tr key={a.id}>
              <td>{new Date(a.timestamp).toLocaleString()}</td>
              <td>{a.username ?? "—"}</td>
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
