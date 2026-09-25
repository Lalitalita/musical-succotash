import { useEffect } from "react";
import { useWindowStore } from "../../state/windowStore";
import { BrowserApp } from "../Apps/BrowserApp/BrowserApp";
import { BrowserTabBar } from "../Apps/BrowserApp/BrowserTabBar";
import { DockerApp } from "../Apps/Docker/DockerApp";
import { DownloadsApp } from "../Apps/Downloads/DownloadsApp";
import { FileExplorerApp } from "../Apps/FileExplorer/FileExplorerApp";
import { FileExplorerTabBar } from "../Apps/FileExplorer/FileExplorerTabBar";
import { GalleryApp } from "../Apps/Gallery/GalleryApp";
import { HadobeApp } from "../Apps/Hadobe/HadobeApp";
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

/** A click inside an iframe-embedded app (Terminal, the text-mode Browser,
 * full-browser mode) never bubbles a pointer/focus event out to this
 * document - the iframe's content is a separate browsing context - so
 * clicking one when it's NOT the topmost window silently leaves it behind
 * every other window. The browser DOES still fire a `blur` event on this
 * top-level `window` the instant focus moves into any iframe (confirmed:
 * neither `focus` nor `focusin` fires on the iframe element itself in that
 * case, `blur` on `window` is the only reliable signal), so that - plus
 * checking which iframe now holds `document.activeElement` - is what
 * catches this instead. */
function useIframeFocusBringsWindowToFront() {
  const focusWindow = useWindowStore((s) => s.focusWindow);

  useEffect(() => {
    function onBlur() {
      const active = document.activeElement;
      if (!active || active.tagName !== "IFRAME") return;
      const winEl = active.closest("[data-window-id]");
      const id = winEl?.getAttribute("data-window-id");
      if (id) focusWindow(id);
    }
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [focusWindow]);
}

export function WindowManager() {
  const windows = useWindowStore((s) => s.windows);
  useIframeFocusBringsWindowToFront();

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
          {win.appId === "gallery" && <GalleryApp initialFile={win.initialFile} />}
          {win.appId === "pdfviewer" && <HadobeApp initialFile={win.initialFile} />}
        </Window>
      ))}
    </>
  );
}
