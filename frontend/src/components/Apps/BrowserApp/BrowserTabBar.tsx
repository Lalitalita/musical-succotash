import { openContextMenu } from "../../../state/contextMenuStore";
import { useBrowserStore } from "../../../state/browserStore";

interface Props {
  windowId: string;
}

/** The tab strip, rendered inside the window's own titlebar (see Window.tsx)
 * so the drag/minimize/close row and the tabs share a single band instead
 * of stacking two header bars. */
export function BrowserTabBar({ windowId }: Props) {
  const { byWindow, addTab, closeTab, setActiveTab, reload } = useBrowserStore();
  const win = byWindow[windowId];
  if (!win) return null;

  return (
    <div className="browser-tabs">
      {win.tabs.map((tab) => (
        <button
          key={tab.id}
          className={`browser-tab ${tab.id === win.activeTabId ? "active" : ""}`}
          onClick={() => setActiveTab(windowId, tab.id)}
          onContextMenu={(e) =>
            openContextMenu(e, [
              { label: "Recharger", icon: "⟳", onSelect: () => reload(windowId, tab.id) },
              { label: "Fermer", icon: "✕", danger: true, separatorBefore: true, onSelect: () => closeTab(windowId, tab.id) },
            ])
          }
        >
          <span className="browser-tab-title">{tab.title}</span>
          <span
            className="browser-tab-close"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(windowId, tab.id);
            }}
          >
            ✕
          </span>
        </button>
      ))}
      <button
        className="browser-tab-new"
        onClick={(e) => {
          e.stopPropagation();
          addTab(windowId);
        }}
        title="Nouvel onglet"
      >
        +
      </button>
    </div>
  );
}
