import { openContextMenu } from "../../../state/contextMenuStore";
import { useFileExplorerStore, type ExplorerTab } from "../../../state/fileExplorerStore";
import { useWindowStore } from "../../../state/windowStore";

interface Props {
  windowId: string;
}

function tabLabel(tab: ExplorerTab): string {
  if (!tab.path) return tab.source === "local" ? "Local" : "Partage SMB";
  const segments = tab.path.split("/");
  return segments[segments.length - 1] || (tab.source === "local" ? "Local" : "Partage SMB");
}

/** The tab strip, rendered inside the window's own titlebar (see Window.tsx),
 * mirroring BrowserTabBar - the drag/minimize/close row and the tabs share a
 * single band instead of stacking two header bars. */
export function FileExplorerTabBar({ windowId }: Props) {
  const { byWindow, addTab, closeTab, setActiveTab } = useFileExplorerStore();
  const win = byWindow[windowId];
  if (!win) return null;

  return (
    <div className="file-explorer-tabbar-tabs">
      {win.tabs.map((tab) => (
        <button
          key={tab.id}
          className={`file-explorer-tabbar-tab ${tab.id === win.activeTabId ? "active" : ""}`}
          onClick={() => setActiveTab(windowId, tab.id)}
          onContextMenu={(e) =>
            openContextMenu(e, [
              { label: "Fermer", icon: "✕", danger: true, onSelect: () => closeTab(windowId, tab.id) },
            ])
          }
        >
          <span className="file-explorer-tabbar-title">
            {tab.source === "local" ? "💾" : "🏠"} {tabLabel(tab)}
          </span>
          {win.tabs.length > 1 && (
            <span
              className="file-explorer-tabbar-close"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(windowId, tab.id);
              }}
            >
              ✕
            </span>
          )}
        </button>
      ))}
      <button className="file-explorer-tabbar-new" onClick={() => addTab(windowId)} title="Nouvel onglet">
        +
      </button>
      <button
        className="file-explorer-tabbar-settings"
        onClick={() =>
          useWindowStore.getState().openWindow("settings", "Paramètres", { initialTab: "applications:files" })
        }
        title="Paramètres de l'explorateur de fichiers"
      >
        ⚙️
      </button>
    </div>
  );
}
