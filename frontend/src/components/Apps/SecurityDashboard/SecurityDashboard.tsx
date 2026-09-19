import { useEffect, useState } from "react";
import { api, ApiError } from "../../../api/client";
import type { ActiveLock, LoginAttempt, SecurityAlert, SecurityStats } from "../../../types";

function statusClass(status: string): string {
  if (status === "mfa_success" || status === "password_ok") return "ok";
  if (status === "locked" || status === "rate_limited") return "warn";
  return "fail";
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  return `${Math.floor(minutes / 60)}h${minutes % 60}`;
}

export function SecurityDashboard() {
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [attempts, setAttempts] = useState<LoginAttempt[]>([]);
  const [locks, setLocks] = useState<ActiveLock[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<SecurityStats>("/admin/security/stats"),
      api.get<LoginAttempt[]>("/admin/security/attempts"),
      api.get<ActiveLock[]>("/admin/security/locks"),
      api.get<SecurityAlert[]>("/admin/security/alerts"),
    ])
      .then(([s, a, l, al]) => {
        setStats(s);
        setAttempts(a);
        setLocks(l);
        setAlerts(al);
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
  const maxHour = Math.max(1, ...stats.hourly_distribution.map((d) => d.count));

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
          <div
            key={d.date}
            className="bar"
            style={{ height: `${(d.count / maxDay) * 100}%` }}
            title={`${d.date}: ${d.count}`}
          />
        ))}
      </div>

      <h4>Répartition par heure de la journée</h4>
      <div className="bar-chart small">
        {stats.hourly_distribution.map((d) => (
          <div
            key={d.hour}
            className="bar accent2"
            style={{ height: `${(d.count / maxHour) * 100}%` }}
            title={`${d.hour}h: ${d.count}`}
          />
        ))}
      </div>

      <div className="dashboard-columns">
        <div>
          <h4>Comptes les plus ciblés</h4>
          <table className="attempts-table compact">
            <tbody>
              {stats.top_usernames.length === 0 && (
                <tr>
                  <td>Aucune donnée</td>
                </tr>
              )}
              {stats.top_usernames.map((u) => (
                <tr key={u.username}>
                  <td>{u.username}</td>
                  <td>{u.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h4>IP les plus actives (échecs)</h4>
          <table className="attempts-table compact">
            <tbody>
              {stats.top_ips.length === 0 && (
                <tr>
                  <td>Aucune donnée</td>
                </tr>
              )}
              {stats.top_ips.map((i) => (
                <tr key={i.ip}>
                  <td>{i.ip}</td>
                  <td>{i.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h4>Origines géographiques</h4>
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
      </div>

      <h4>Blocages actifs</h4>
      <table className="attempts-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Cible</th>
            <th>Expire dans</th>
          </tr>
        </thead>
        <tbody>
          {locks.length === 0 && (
            <tr>
              <td colSpan={3}>Aucun blocage actif.</td>
            </tr>
          )}
          {locks.map((l) => (
            <tr key={`${l.scope}-${l.key}`}>
              <td>
                <span className="status-pill warn">{l.scope === "ip" ? "IP" : l.scope === "user" ? "Compte" : "MFA"}</span>
              </td>
              <td>{l.key}</td>
              <td>{formatDuration(l.retry_after_seconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Alertes envoyées récemment</h4>
      <table className="attempts-table">
        <thead>
          <tr>
            <th>Horodatage</th>
            <th>Sujet</th>
            <th>Compte</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          {alerts.length === 0 && (
            <tr>
              <td colSpan={4}>Aucune alerte envoyée.</td>
            </tr>
          )}
          {alerts.map((a) => (
            <tr key={a.id} title={a.detail}>
              <td>{new Date(a.timestamp).toLocaleString()}</td>
              <td>{a.subject}</td>
              <td>{a.username ?? "—"}</td>
              <td>{a.ip_address ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

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
