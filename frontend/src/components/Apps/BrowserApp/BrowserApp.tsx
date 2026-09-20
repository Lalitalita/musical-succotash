import { FormEvent, useEffect, useRef, useState } from "react";
import { openContextMenu } from "../../../state/contextMenuStore";
import { useBookmarksStore } from "../../../state/bookmarksStore";
import { useBrowserStore } from "../../../state/browserStore";
import { normalizeUrl } from "../../../utils/url";
import { RemoteFrame } from "./RemoteFrame";

interface Props {
  windowId: string;
  initialUrl?: string;
}

export function BrowserApp({ windowId, initialUrl }: Props) {
  const { byWindow, ensureWindow, navigate, reload, setMode } = useBrowserStore();
  const { bookmarks, loaded, load, add, remove } = useBookmarksStore();
  const [addressInput, setAddressInput] = useState("");
  const [addingBookmark, setAddingBookmark] = useState(false);
  const [newBookmarkTitle, setNewBookmarkTitle] = useState("");
  const [newBookmarkIcon, setNewBookmarkIcon] = useState("");
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});

  useEffect(() => {
    ensureWindow(windowId, initialUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowId]);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const win = byWindow[windowId];
  const activeTab = win?.tabs.find((t) => t.id === win.activeTabId);

  useEffect(() => {
    setAddressInput(activeTab?.address || "");
  }, [activeTab?.id, activeTab?.address]);

  if (!win || !activeTab) return null;

  function onNavigate(e: FormEvent) {
    e.preventDefault();
    if (!activeTab) return;
    navigate(windowId, activeTab.id, addressInput);
  }

  function openBookmark(url: string) {
    if (!activeTab) return;
    setAddressInput(url);
    navigate(windowId, activeTab.id, url);
  }

  function goBack() {
    if (!activeTab) return;
    try {
      iframeRefs.current[activeTab.id]?.contentWindow?.history.back();
    } catch {
      /* cross-origin edge case: ignore */
    }
  }

  function goForward() {
    if (!activeTab) return;
    try {
      iframeRefs.current[activeTab.id]?.contentWindow?.history.forward();
    } catch {
      /* cross-origin edge case: ignore */
    }
  }

  async function confirmAddBookmark() {
    if (!activeTab?.address) return;
    await add(newBookmarkTitle || activeTab.address, activeTab.address, newBookmarkIcon || undefined);
    setAddingBookmark(false);
    setNewBookmarkTitle("");
    setNewBookmarkIcon("");
  }

  return (
    <div className="browser-app">
      <form className="browser-toolbar" onSubmit={onNavigate}>
        <button
          type="button"
          className="browser-icon-btn"
          title="Précédent"
          onClick={goBack}
          disabled={activeTab.mode === "full"}
        >
          ←
        </button>
        <button
          type="button"
          className="browser-icon-btn"
          title="Suivant"
          onClick={goForward}
          disabled={activeTab.mode === "full"}
        >
          →
        </button>
        <button
          type="button"
          className="browser-icon-btn"
          title="Recharger"
          onClick={() => reload(windowId, activeTab.id)}
          disabled={!activeTab.address}
        >
          ⟳
        </button>
        <input
          placeholder="Entrer une adresse (ex: exemple.com)"
          value={addressInput}
          onChange={(e) => setAddressInput(e.target.value)}
        />
        <button type="submit">Aller</button>
        <button
          type="button"
          className={`browser-icon-btn browser-star ${addingBookmark ? "starred" : ""}`}
          title="Ajouter aux favoris"
          onClick={() => setAddingBookmark((v) => !v)}
          disabled={!activeTab.address}
        >
          ☆
        </button>
        <button
          type="button"
          className={`browser-mode-toggle ${activeTab.mode === "full" ? "active" : ""}`}
          title="Mode complet : un vrai navigateur (JS activé) pour les sites qui ne s'affichent pas correctement en mode texte. Plus lourd en bande passante."
          onClick={() => setMode(windowId, activeTab.id, activeTab.mode === "full" ? "text" : "full")}
        >
          {activeTab.mode === "full" ? "Mode complet" : "Mode texte"}
        </button>
      </form>

      {addingBookmark && (
        <div className="bookmark-form">
          <input placeholder="Nom" value={newBookmarkTitle} onChange={(e) => setNewBookmarkTitle(e.target.value)} />
          <input
            placeholder="URL d'icône (optionnel)"
            value={newBookmarkIcon}
            onChange={(e) => setNewBookmarkIcon(e.target.value)}
          />
          <button onClick={confirmAddBookmark}>Ajouter</button>
        </div>
      )}

      <div className="bookmarks-bar">
        {bookmarks.map((b) => (
          <button
            key={b.id}
            className="bookmark-chip"
            onClick={() => openBookmark(b.url)}
            onContextMenu={(e) =>
              openContextMenu(e, [
                { label: "Ouvrir", icon: "↗", onSelect: () => openBookmark(b.url) },
                { label: "Supprimer", icon: "🗑", danger: true, onSelect: () => remove(b.id) },
              ])
            }
          >
            {b.icon_url ? <img src={b.icon_url} alt="" /> : <span className="bookmark-fallback">🔖</span>}
            {b.title}
          </button>
        ))}
        {bookmarks.length === 0 && <span className="browser-status">Aucun favori - cliquez sur ☆ pour en ajouter.</span>}
      </div>

      <div className="browser-frame-wrap">
        {win.tabs.map((tab) =>
          tab.mode !== "full" && tab.src ? (
            <iframe
              key={tab.id}
              ref={(el) => {
                iframeRefs.current[tab.id] = el;
              }}
              title={tab.title}
              src={tab.src}
              style={{ display: tab.id === win.activeTabId ? "block" : "none" }}
              sandbox="allow-forms allow-same-origin allow-popups"
            />
          ) : null
        )}
        {activeTab.mode === "full" && (
          <RemoteFrame
            key={activeTab.id}
            tabId={activeTab.id}
            initialUrl={normalizeUrl(activeTab.address) || "about:blank"}
            navSeq={activeTab.navSeq}
          />
        )}
        {activeTab.mode !== "full" && !activeTab.src && (
          <div className="browser-empty">Saisissez une adresse pour commencer.</div>
        )}
      </div>
    </div>
  );
}
