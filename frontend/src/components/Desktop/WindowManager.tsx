import { useWindowStore } from "../../state/windowStore";
import { BrowserApp } from "../Apps/BrowserApp/BrowserApp";
import { BrowserTabBar } from "../Apps/BrowserApp/BrowserTabBar";
import { DockerApp } from "../Apps/Docker/DockerApp";
import { DownloadsApp } from "../Apps/Downloads/DownloadsApp";
import { FileExplorerApp } from "../Apps/FileExplorer/FileExplorerApp";
import { FileExplorerTabBar } from "../Apps/FileExplorer/FileExplorerTabBar";
import { NotesApp } from "../Apps/Notes/NotesApp";
import { SecurityDashboard } from "../Apps/SecurityDashboard/SecurityDashboard";
import { SettingsApp } from "../Apps/Settings/SettingsApp";
import { TerminalApp } from "../Apps/Terminal/TerminalApp";
import { Window } from "./Window";

function titlebarContentFor(appId: string, windowId: string, chromeless?: boolean) {
  // A chromeless (WebToApp) window shows its plain title instead of the
  // tab strip - it's locked to a single tab, so there's nothing to switch
  // between and the tab chrome would just be another thing to hide.
  if (appId === "browser" && !chromeless) return <BrowserTabBar windowId={windowId} />;
  if (appId === "files") return <FileExplorerTabBar windowId={windowId} />;
  return undefined;
}

export function WindowManager() {
  const windows = useWindowStore((s) => s.windows);

  return (
    <>
      {windows.map((win) => (
        <Window key={win.id} win={win} titlebarContent={titlebarContentFor(win.appId, win.id, win.chromeless)}>
          {win.appId === "browser" && (
            <BrowserApp
              windowId={win.id}
              initialUrl={win.initialUrl}
              initialMode={win.initialMode}
              chromeless={win.chromeless}
            />
          )}
          {win.appId === "security-dashboard" && <SecurityDashboard />}
          {win.appId === "settings" && <SettingsApp initialTab={win.initialTab} />}
          {win.appId === "files" && <FileExplorerApp windowId={win.id} />}
          {win.appId === "notes" && <NotesApp initialNoteId={win.initialNoteId} />}
          {win.appId === "downloads" && <DownloadsApp />}
          {win.appId === "terminal" && <TerminalApp />}
          {win.appId === "dockerctl" && <DockerApp />}
        </Window>
      ))}
    </>
  );
}
