import { useEffect } from "react";
import { Desktop } from "./components/Desktop/Desktop";
import { LoginForm } from "./components/Login/LoginForm";
import { MfaDecoyForm } from "./components/Login/MfaDecoyForm";
import { useAuthStore } from "./state/authStore";

export function App() {
  const { stage, bootstrap } = useAuthStore();

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (stage === "checking") return null;
  if (stage === "login") return <LoginForm />;
  if (stage === "mfa") return <MfaDecoyForm />;
  return <Desktop />;
}
