import RFB from "@novnc/novnc";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../api/client";

interface Props {
  tabId: string;
  initialUrl: string;
  /** Bumped by the parent every time the user explicitly navigates (address
   * bar submit, bookmark click, reload) while this tab is in full mode. */
  navSeq: number;
}

/**
 * Full-browser mode: a real, private headed Chromium instance running on
 * the backend, streamed here over VNC (see app/full_browser.py and
 * routers/full_browser.py) via noVNC. Unlike text mode, the target site's
 * own JavaScript runs entirely server-side - this component only ever
 * displays pixels and forwards mouse/keyboard/clipboard input, all handled
 * by noVNC's RFB client rather than a hand-rolled protocol.
 */
export function RemoteFrame({ tabId, initialUrl, navSeq }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const mountedNavSeq = useRef<number | null>(null);
  const [status, setStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remoteTitle, setRemoteTitle] = useState("");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setStatus("connecting");
    setErrorMessage(null);
    mountedNavSeq.current = navSeq;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${proto}://${window.location.host}/api/browser/full/ws?tab_id=${encodeURIComponent(
      tabId
    )}&url=${encodeURIComponent(initialUrl)}`;

    const rfb = new RFB(el, wsUrl);
    // Xvfb renders at a fixed 1280x800 - scale that to fit instead of
    // asking the (xrandr-less) virtual display to actually resize.
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfbRef.current = rfb;

    rfb.addEventListener("connect", () => setStatus("open"));
    rfb.addEventListener("disconnect", ((e: CustomEvent<{ clean: boolean }>) => {
      setStatus("closed");
      if (!e.detail?.clean) setErrorMessage("Connexion perdue.");
    }) as EventListener);
    rfb.addEventListener("credentialsrequired", () => setErrorMessage("Authentification refusée."));
    rfb.addEventListener("securityfailure", () => setErrorMessage("Échec de connexion au flux distant."));
    rfb.addEventListener("clipboard", ((e: CustomEvent<{ text: string }>) => {
      if (e.detail?.text) navigator.clipboard.writeText(e.detail.text).catch(() => {});
    }) as EventListener);

    return () => {
      rfb.disconnect();
      rfbRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  useEffect(() => {
    if (mountedNavSeq.current === null) return;
    if (navSeq <= mountedNavSeq.current) return;
    mountedNavSeq.current = navSeq;
    api.post(`/browser/full/${tabId}/navigate`, { url: initialUrl }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navSeq]);

  useEffect(() => {
    if (status !== "open") return;
    let cancelled = false;
    function poll() {
      api
        .get<{ url: string; title: string }>(`/browser/full/${tabId}/meta`)
        .then((meta) => {
          if (!cancelled) setRemoteTitle(meta.title || meta.url || "");
        })
        .catch(() => {});
    }
    poll();
    const t = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [tabId, status]);

  function pasteFromClipboard() {
    navigator.clipboard
      .readText()
      .then((text) => {
        if (text) rfbRef.current?.clipboardPasteFrom(text);
      })
      .catch(() => {
        /* clipboard permission denied - nothing we can do without it */
      });
  }

  return (
    <div className="remote-frame">
      <div className="remote-frame-bar">
        <span className="remote-frame-badge">Mode complet</span>
        <span className="remote-frame-title">{remoteTitle}</span>
        <div className="remote-frame-controls">
          <button title="Précédent" onClick={() => api.post(`/browser/full/${tabId}/back`).catch(() => {})}>
            ←
          </button>
          <button title="Suivant" onClick={() => api.post(`/browser/full/${tabId}/forward`).catch(() => {})}>
            →
          </button>
          <button title="Recharger" onClick={() => api.post(`/browser/full/${tabId}/reload`).catch(() => {})}>
            ⟳
          </button>
          <button title="Coller depuis le presse-papiers" onClick={pasteFromClipboard}>
            📋
          </button>
        </div>
      </div>

      <div ref={containerRef} className="remote-frame-surface">
        {status === "connecting" && <div className="remote-frame-status">Connexion au navigateur distant...</div>}
        {status === "closed" && !errorMessage && <div className="remote-frame-status">Connexion fermée.</div>}
        {errorMessage && <div className="remote-frame-status error">{errorMessage}</div>}
      </div>
    </div>
  );
}
