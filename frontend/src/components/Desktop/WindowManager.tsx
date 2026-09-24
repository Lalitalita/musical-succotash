import { useWindowStore } from "../../state/windowStore";
import { BrowserApp } from "../Apps/BrowserApp/BrowserApp";
import { BrowserTabBar } from "../Apps/BrowserApp/BrowserTabBar";
import { FileExplorerApp } from "../Apps/FileExplorer/FileExplorerApp";
import { FileExplorerTabBar } from "../Apps/FileExplorer/FileExplorerTabBar";
import { SecurityDashboard } from "../Apps/SecurityDashboard/SecurityDashboard";
import { SettingsApp } from "../Apps/Settings/SettingsApp";
import { Window } from "./Window";

function titlebarContentFor(appId: string, windowId: string) {
  if (appId === "browser") return <BrowserTabBar windowId={windowId} />;
  if (appId === "files") return <FileExplorerTabBar windowId={windowId} />;
  return undefined;
}

export function WindowManager() {
  const windows = useWindowStore((s) => s.windows);

  return (
    <>
      {windows.map((win) => (
        <Window key={win.id} win={win} titlebarContent={titlebarContentFor(win.appId, win.id)}>
          {win.appId === "browser" && (
            <BrowserApp windowId={win.id} initialUrl={win.initialUrl} initialMode={win.initialMode} />
          )}
          {win.appId === "security-dashboard" && <SecurityDashboard />}
          {win.appId === "settings" && <SettingsApp initialTab={win.initialTab} />}
          {win.appId === "files" && <FileExplorerApp windowId={win.id} />}
        </Window>
      ))}
    </>
  );
}
