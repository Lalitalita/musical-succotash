import { FormEvent, useEffect, useState } from "react";
import { ApiError } from "../../../api/client";
import { useAdminUsersStore } from "../../../state/adminUsersStore";

export function UsersPanel() {
  const { users, loaded, load, create, update, remove, lastCreated, dismissLastCreated } = useAdminUsersStore();
  const [creating, setCreating] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) load().catch(() => undefined);
  }, [loaded, load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await create(username, email, isAdmin);
      setUsername("");
      setEmail("");
      setIsAdmin(false);
      setCreating(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Création impossible");
    }
  }

  async function onResetTotp(id: string) {
    try {
      await update(id, { reset_totp: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Réinitialisation impossible");
    }
  }

  async function onToggleAdmin(id: string, current: boolean) {
    try {
      await update(id, { is_admin: !current });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Modification impossible");
    }
  }

  async function onDelete(id: string) {
    try {
      await remove(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Suppression impossible");
    }
  }

  return (
    <div>
      <h4>Comptes</h4>
      <p className="settings-hint">
        Seul un administrateur peut créer un compte - aucune inscription publique n'existe sur cette instance.
      </p>

      {error && <div className="auth-error">{error}</div>}

      {lastCreated && (
        <div className="users-credential-box">
          <div>
            <strong>Identifiants pour {lastCreated.user.username}</strong> (affichés une seule fois) :
          </div>
          {lastCreated.generated_password && (
            <div>
              Mot de passe : <code>{lastCreated.generated_password}</code>
            </div>
          )}
          {lastCreated.totp_secret && (
            <div>
              Secret TOTP : <code>{lastCreated.totp_secret}</code>
            </div>
          )}
          <button className="settings-btn" onClick={dismissLastCreated}>
            J'ai noté ces informations
          </button>
        </div>
      )}

      <table className="attempts-table">
        <thead>
          <tr>
            <th>Utilisateur</th>
            <th>Email</th>
            <th>Rôle</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.display_name || u.username}</td>
              <td>{u.email}</td>
              <td>
                <span className={`status-pill ${u.is_admin ? "ok" : "warn"}`}>
                  {u.is_admin ? "Admin" : "Utilisateur"}
                </span>
              </td>
              <td className="users-actions">
                <button className="settings-btn" onClick={() => onToggleAdmin(u.id, u.is_admin)}>
                  {u.is_admin ? "Retirer admin" : "Rendre admin"}
                </button>
                <button className="settings-btn" onClick={() => onResetTotp(u.id)}>
                  Réinitialiser TOTP
                </button>
                <button className="settings-btn danger" onClick={() => onDelete(u.id)}>
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {creating ? (
        <form className="bookmark-form users-create-form" onSubmit={onCreate}>
          <input placeholder="Nom d'utilisateur" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label className="users-admin-check">
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
            Administrateur
          </label>
          <button type="submit">Créer</button>
        </form>
      ) : (
        <button className="settings-btn" onClick={() => setCreating(true)} style={{ marginTop: 12 }}>
          + Nouveau compte
        </button>
      )}
    </div>
  );
}
