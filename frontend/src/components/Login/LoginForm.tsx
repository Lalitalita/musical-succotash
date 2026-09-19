import { FormEvent, useState } from "react";
import { useAuthStore } from "../../state/authStore";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login, error, clearError } = useAuthStore();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    setSubmitting(true);
    await login(username, password);
    setSubmitting(false);
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-avatar">{username ? username[0]?.toUpperCase() : "?"}</div>
        <h2>Se connecter</h2>
        {error && <div className="auth-error">{error}</div>}
        <input
          className="auth-field"
          placeholder="Nom d'utilisateur"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="auth-field"
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="auth-button" type="submit" disabled={submitting}>
          {submitting ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
