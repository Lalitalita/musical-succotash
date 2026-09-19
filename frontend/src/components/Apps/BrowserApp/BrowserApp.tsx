import { FormEvent, useState } from "react";

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function BrowserApp() {
  const [address, setAddress] = useState("");
  const [src, setSrc] = useState<string | null>(null);

  function navigate(e: FormEvent) {
    e.preventDefault();
    const url = normalizeUrl(address);
    if (!url) return;
    setSrc(`/api/browser/view?url=${encodeURIComponent(url)}`);
  }

  return (
    <div className="browser-app">
      <form className="browser-toolbar" onSubmit={navigate}>
        <input
          placeholder="Entrer une adresse (ex: exemple.com)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button type="submit">Aller</button>
      </form>
      <div className="browser-status">
        Mode texte sans script ni vidéo - la page est nettoyée et réécrite côté serveur.
      </div>
      <div className="browser-frame-wrap">
        {src ? (
          <iframe title="remote-browser" src={src} sandbox="allow-forms allow-same-origin allow-popups" />
        ) : (
          <div style={{ padding: 20, color: "#333" }}>Saisissez une adresse pour commencer.</div>
        )}
      </div>
    </div>
  );
}
