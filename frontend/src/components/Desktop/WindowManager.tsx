import { useWindowStore } from "../../state/windowStore";
import { BrowserApp } from "../Apps/BrowserApp/BrowserApp";
import { SecurityDashboard } from "../Apps/SecurityDashboard/SecurityDashboard";
import { Window } from "./Window";

function AboutApp() {
  return (
    <div style={{ padding: 20, fontSize: 13, lineHeight: 1.6 }}>
      <h3>WebDesktop</h3>
      <p>Bureau virtuel exécuté entièrement dans le navigateur, servi par un backend conteneurisé.</p>
      <p>Authentification Argon2id + double facteur, proxy de navigation texte sans flux vidéo.</p>
    </div>
  );
}

export function WindowManager() {
  const windows = useWindowStore((s) => s.windows);

  return (
    <>
      {windows.map((win) => (
        <Window key={win.id} win={win}>
          {win.appId === "browser" && <BrowserApp />}
          {win.appId === "security-dashboard" && <SecurityDashboard />}
          {win.appId === "about" && <AboutApp />}
        </Window>
      ))}
    </>
  );
}
