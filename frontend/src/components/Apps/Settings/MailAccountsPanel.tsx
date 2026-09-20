import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../../../api/client";

interface MailAccount {
  id: string;
  label: string;
  imap_host: string;
  imap_port: number;
  imap_username: string;
}

export function MailAccountsPanel() {
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [internal, setInternal] = useState<{ username: string; password: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(993);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const list = await api.get<MailAccount[]>("/mail/accounts");
    setAccounts(list);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/mail/accounts", {
        label,
        imap_host: host,
        imap_port: port,
        imap_username: username,
        imap_password: password,
      });
      setLabel("");
      setHost("");
      setPort(993);
      setUsername("");
      setPassword("");
      setAdding(false);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Échec de l'ajout du compte.");
    }
  }

  async function onRemove(id: string) {
    await api.del(`/mail/accounts/${id}`);
    await refresh();
  }

  async function onShowInternalPassword() {
    const res = await api.get<{ username: string; password: string }>("/mail/internal-password");
    setInternal(res);
    setShowPassword(true);
  }

  return (
    <>
      <h4>Comptes mail agrégés</h4>
      <p className="settings-hint">
        Ajoutez ici vos comptes IMAP (Gmail, autre fournisseur...). Ils sont automatiquement récupérés en arrière-plan
        et arrivent chacun dans leur propre dossier d'une seule boîte Roundcube - une seule connexion pour tous vos
        mails.
      </p>

      {accounts.map((a) => (
        <div className="settings-row" key={a.id}>
          <span>
            {a.label} <span className="settings-hint">({a.imap_username}@{a.imap_host})</span>
          </span>
          <button className="settings-btn" onClick={() => onRemove(a.id)}>
            Supprimer
          </button>
        </div>
      ))}
      {accounts.length === 0 && <p className="settings-hint">Aucun compte ajouté pour l'instant.</p>}

      {!adding ? (
        <button className="settings-btn" onClick={() => setAdding(true)}>
          Ajouter un compte mail
        </button>
      ) : (
        <form className="bookmark-form" onSubmit={onAdd}>
          <input placeholder="Nom (ex: Gmail perso)" value={label} onChange={(e) => setLabel(e.target.value)} required />
          <input placeholder="Serveur IMAP (ex: imap.gmail.com)" value={host} onChange={(e) => setHost(e.target.value)} required />
          <input
            type="number"
            placeholder="Port"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
          />
          <input placeholder="Identifiant IMAP" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <input
            type="password"
            placeholder="Mot de passe IMAP (ou mot de passe d'application)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div className="auth-error">{error}</div>}
          <button type="submit">Ajouter</button>
        </form>
      )}

      <h4>Connexion à la messagerie interne</h4>
      <p className="settings-hint">
        Ouvrez Roundcube (URL du webmail ci-dessus) et connectez-vous une fois avec votre nom d'utilisateur webdesktop
        et ce mot de passe - il sera ensuite mémorisé.
      </p>
      {!showPassword ? (
        <button className="settings-btn" onClick={onShowInternalPassword}>
          Afficher le mot de passe de messagerie
        </button>
      ) : (
        internal && (
          <div className="settings-row">
            <span>{internal.username}</span>
            <code>{internal.password}</code>
          </div>
        )
      )}
    </>
  );
}
