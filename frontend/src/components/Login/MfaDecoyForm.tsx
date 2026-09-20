import { FormEvent, useState } from "react";
import { useAuthStore } from "../../state/authStore";

/**
 * Decoy second factor. Visually this looks like a harmless "confirm your
 * birthdate" prompt (placeholder JJ/MM/AAAA, auto-inserted slashes every 2
 * digits) - a shoulder-surfer sees a normal account-verification question,
 * not a security screen. In reality the 6 digits typed here are validated
 * server-side as a standard TOTP code - the slashes are cosmetic and
 * stripped before verification, so this works with a normal Aegis /
 * Google Authenticator entry of "123456".
 */
function formatDecoy(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 6);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)].filter(Boolean);
  return parts.join("/");
}

export function MfaDecoyForm() {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { verifyMfa, error, clearError } = useAuthStore();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    setSubmitting(true);
    await verifyMfa(value);
    setSubmitting(false);
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-avatar">📅</div>
        <h2>Confirmer votre date de naissance</h2>
        <div className="auth-hint">Merci de resaisir votre date de naissance pour vérifier votre identité</div>
        {error && <div className="auth-error">{error}</div>}
        <input
          className="auth-field"
          placeholder="JJ/MM/AAAA"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={value}
          onChange={(e) => setValue(formatDecoy(e.target.value))}
        />
        <button className="auth-button" type="submit" disabled={submitting || value.replace(/\D/g, "").length < 6}>
          {submitting ? "Vérification..." : "Confirmer"}
        </button>
      </form>
    </div>
  );
}
