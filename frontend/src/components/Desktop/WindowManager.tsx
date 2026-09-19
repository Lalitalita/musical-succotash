import { useWindowStore } from "../../state/windowStore";
import { BrowserApp } from "../Apps/BrowserApp/BrowserApp";
import { FileExplorerApp } from "../Apps/FileExplorer/FileExplorerApp";
import { SecurityDashboard } from "../Apps/SecurityDashboard/SecurityDashboard";
import { SettingsApp } from "../Apps/Settings/SettingsApp";
import { Window } from "./Window";

export function WindowManager() {
  const windows = useWindowStore((s) => s.windows);

  return (
    <>
      {windows.map((win) => (
        <Window key={win.id} win={win}>
          {win.appId === "browser" && <BrowserApp windowId={win.id} initialUrl={win.initialUrl} />}
          {win.appId === "security-dashboard" && <SecurityDashboard />}
          {win.appId === "settings" && <SettingsApp />}
          {win.appId === "files" && <FileExplorerApp />}
        </Window>
      ))}
    </>
  );
}
