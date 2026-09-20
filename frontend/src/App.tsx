import { useEffect } from "react";
import { Desktop } from "./components/Desktop/Desktop";
import { LoginForm } from "./components/Login/LoginForm";
import { MfaDecoyForm } from "./components/Login/MfaDecoyForm";
import { useAuthStore } from "./state/authStore";
import { saveDesktopState } from "./state/persistence";
import { useSettingsStore } from "./state/settingsStore";
import { darken } from "./utils/color";

const AUTO_SAVE_INTERVAL_MS = 45_000;

export function App() {
  const { stage, bootstrap } = useAuthStore();
  const accent = useSettingsStore((s) => s.accent);

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-strong", darken(accent, 20));
  }, [accent]);

  useEffect(() => {
    if (stage !== "authenticated") return;
    const t = setInterval(saveDesktopState, AUTO_SAVE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [stage]);

  if (stage === "checking") return null;
  if (stage === "login") return <LoginForm />;
  if (stage === "mfa") return <MfaDecoyForm />;
  return <Desktop />;
}
