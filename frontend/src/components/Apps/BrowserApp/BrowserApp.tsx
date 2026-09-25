import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../../../api/client";
import { openContextMenu } from "../../../state/contextMenuStore";
import { useBookmarksStore } from "../../../state/bookmarksStore";
import { useBrowserStore } from "../../../state/browserStore";
import type { BrowserTabMode } from "../../../types";
import { normalizeUrl } from "../../../utils/url";
import { RemoteFrame, type RemoteFrameHandle } from "./RemoteFrame";

interface Props {
  windowId: string;
  initialUrl?: string;
  initialMode?: BrowserTabMode;
  /** WebToApp style: hides the toolbar/bookmarks bar so only the site
   * itself is visible, like a standalone app - see WindowInstance.chromeless. */
  chromeless?: boolean;
}

export function BrowserApp({ windowId, initialUrl, initialMode, chromeless }: Props) {
  // Selector-scoped (not a whole-store destructure): this window's own
  // `byWindow` slice is the only thing that needs to re-render this
  // component - the actions below are stable Zustand references and don't
  // need to be subscribed to at all. Without this, EVERY browser window/tab
  // in the whole desktop re-rendered on every single one of the others'
  // periodic full-mode /meta polls (see below) - each poll ticks every
  // 1.5s per open full-mode tab, so with more than one browser window open
  // this was a constant, compounding source of unnecessary re-renders
  // fighting the VNC canvas for the main thread, felt as exactly the kind
  // of "something briefly redraws/stutters" jank reported.
  const byWindow = useBrowserStore((s) => s.byWindow);
  const { ensureWindow, navigate, reload, setMode, updateTabMeta } = useBrowserStore.getState();
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const loaded = useBookmarksStore((s) => s.loaded);
  const { load, add, remove } = useBookmarksStore.getState();
  const [addressInput, setAddressInput] = useState("");
  const [addingBookmark, setAddingBookmark] = useState(false);
  const [newBookmarkTitle, setNewBookmarkTitle] = useState("");
  const [newBookmarkIcon, setNewBookmarkIcon] = useState("");
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
  const remoteFrameRef = useRef<RemoteFrameHandle>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ensureWindow(windowId, initialUrl, initialMode);
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

  // Full mode has no address bar of its own (see RemoteFrame) - poll the
  // remote page's real URL/title and reflect it here, both in the address
  // bar (unless the user is actively typing a new one) and in the tab's
  // own title (so the merged tab strip shows the real page, not just
  // whatever address was last typed).
  useEffect(() => {
    if (!activeTab || activeTab.mode !== "full") return;
    const tabId = activeTab.id;
    let cancelled = false;
    function poll() {
      api
        .get<{ url: string; title: string }>(`/browser/full/${tabId}/meta`)
        .then((meta) => {
          if (cancelled) return;
          const title = meta.title || meta.url;
          // Most polls land on an unchanged page - skip the store write
          // entirely rather than replacing the tab with an referentially-new
          // (but value-identical) object every 1.5s, which otherwise forced
          // a re-render of every subscriber for no actual change.
          const current = useBrowserStore.getState().byWindow[windowId]?.tabs.find((t) => t.id === tabId);
          if (!current || current.address !== meta.url || current.title !== title) {
            updateTabMeta(windowId, tabId, { address: meta.url, title });
          }
          if (document.activeElement !== addressInputRef.current) setAddressInput(meta.url);
        })
        .catch(() => {});
    }
    poll();
    const t = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id, activeTab?.mode, windowId]);

  if (!win || !activeTab) return null;

  function doNavigate(addressValue: string) {
    if (!activeTab) return;
    navigate(windowId, activeTab.id, addressValue);
    if (activeTab.mode === "full") {
      const url = normalizeUrl(addressValue);
      if (url) api.post(`/browser/full/${activeTab.id}/navigate`, { url }).catch(() => {});
    }
  }

  function onNavigate(e: FormEvent) {
    e.preventDefault();
    doNavigate(addressInput);
  }

  function openBookmark(url: string) {
    setAddressInput(url);
    doNavigate(url);
  }

  function goBack() {
    if (!activeTab) return;
    if (activeTab.mode === "full") {
      api.post(`/browser/full/${activeTab.id}/back`).catch(() => {});
      return;
    }
    try {
      iframeRefs.current[activeTab.id]?.contentWindow?.history.back();
    } catch {
      /* cross-origin edge case: ignore */
    }
  }

  function goForward() {
    if (!activeTab) return;
    if (activeTab.mode === "full") {
      api.post(`/browser/full/${activeTab.id}/forward`).catch(() => {});
      return;
    }
    try {
      iframeRefs.current[activeTab.id]?.contentWindow?.history.forward();
    } catch {
      /* cross-origin edge case: ignore */
    }
  }

  function onReloadClick() {
    if (!activeTab) return;
    if (activeTab.mode === "full") {
      api.post(`/browser/full/${activeTab.id}/reload`).catch(() => {});
      return;
    }
    reload(windowId, activeTab.id);
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
      {!chromeless && (
      <>
      <form className="browser-toolbar" onSubmit={onNavigate}>
        <button type="button" className="browser-icon-btn" title="Précédent" onClick={goBack}>
          ←
        </button>
        <button type="button" className="browser-icon-btn" title="Suivant" onClick={goForward}>
          →
        </button>
        <button
          type="button"
          className="browser-icon-btn"
          title="Recharger"
          onClick={onReloadClick}
          disabled={!activeTab.address}
        >
          ⟳
        </button>
        <input
          ref={addressInputRef}
          placeholder="Entrer une adresse (ex: exemple.com)"
          value={addressInput}
          onChange={(e) => setAddressInput(e.target.value)}
          autoComplete="off"
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
        {activeTab.mode === "full" && (
          <button
            type="button"
            className="browser-icon-btn"
            title="Coller depuis le presse-papiers"
            onClick={() => remoteFrameRef.current?.paste()}
          >
            📋
          </button>
        )}
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
      </>
      )}

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
            ref={remoteFrameRef}
            tabId={activeTab.id}
            initialUrl={normalizeUrl(activeTab.address) || "about:blank"}
          />
        )}
        {activeTab.mode !== "full" && !activeTab.src && (
          <div className="browser-empty">Saisissez une adresse pour commencer.</div>
        )}
      </div>
    </div>
  );
}
