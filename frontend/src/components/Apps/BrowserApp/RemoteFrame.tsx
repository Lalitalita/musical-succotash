import RFB from "@novnc/novnc";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

interface Props {
  tabId: string;
  initialUrl: string;
}

export interface RemoteFrameHandle {
  /** Sends the local clipboard's text into the remote session, matching a
   * Ctrl+V a real client-side browser would do transparently - here it
   * needs an explicit trigger since reading the clipboard requires a user
   * gesture. Exposed so the shared browser toolbar's paste button can
   * reach into whichever RemoteFrame is currently mounted. */
  paste: () => void;
}

/**
 * Full-browser mode: a real, private headed Chromium instance running on
 * the backend, streamed here over VNC (see app/full_browser.py and
 * routers/full_browser.py) via noVNC. Unlike text mode, the target site's
 * own JavaScript runs entirely server-side - this component only ever
 * displays pixels and forwards mouse/keyboard/clipboard input, all handled
 * by noVNC's RFB client rather than a hand-rolled protocol. Navigation
 * controls and the address bar live in the shared BrowserApp toolbar, not
 * here - this is just the video surface, and every explicit
 * navigate/back/forward/reload goes straight from there to the
 * /browser/full/:tab REST endpoints rather than through this component.
 */
// noVNC has no connection timeout of its own - a WebSocket/RFB handshake
// that never resolves (a backend hiccup, a dropped packet mid-negotiation)
// otherwise leaves "Connexion..." spinning forever with no way out short of
// reloading the whole app. This caps how long that's tolerated before
// treating it as failed and offering a retry.
const CONNECT_TIMEOUT_MS = 20000;

// A brief WS hiccup (a VPN/LAN blip, a proxy renegotiating) doesn't need a
// human to click "Réessayer" - that just turned a sub-second interruption
// into "stuck until I notice and click something". A handful of quick,
// automatic retries covers that; a connection that still won't hold after
// this many attempts is a real problem, and THEN it falls back to the
// manual retry button rather than silently retrying forever.
const MAX_AUTO_RECONNECT_ATTEMPTS = 5;
const AUTO_RECONNECT_DELAY_MS = 1000;

export const RemoteFrame = forwardRef<RemoteFrameHandle, Props>(function RemoteFrame(
  { tabId, initialUrl },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const [status, setStatus] = useState<"connecting" | "reconnecting" | "open" | "closed">("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const autoReconnectAttemptsRef = useRef(0);

  useImperativeHandle(ref, () => ({
    paste() {
      navigator.clipboard
        .readText()
        .then((text) => {
          if (text) rfbRef.current?.clipboardPasteFrom(text);
        })
        .catch(() => {
          /* clipboard permission denied - nothing we can do without it */
        });
    },
  }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setStatus("connecting");
    setErrorMessage(null);

    // Xvfb/Chromium are sized once, at connect time, to match the window as
    // it is right now - avoids the box being launched at a fixed 1280x800
    // and then letterboxed/stretched to fit whatever the window actually
    // is. A resize mid-session still falls back to CSS scaling below
    // rather than resizing the remote desktop live (which would need
    // Xvfb/x11vnc support this deployment doesn't have).
    const rect = el.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width) || 1280);
    const height = Math.max(240, Math.round(rect.height) || 800);

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${proto}://${window.location.host}/api/browser/full/ws?tab_id=${encodeURIComponent(
      tabId
    )}&url=${encodeURIComponent(initialUrl)}&width=${width}&height=${height}`;

    const rfb = new RFB(el, wsUrl);
    // Safety net for any mismatch (a resize after connecting, or the
    // container not having settled its layout yet at connect time).
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    // Favor responsiveness over pixel-perfect quality: a lower
    // compressionLevel means x11vnc spends less CPU zlib-compressing each
    // update before sending it (the default (2) noticeably added to the
    // send-then-see-it lag), at the cost of slightly larger frames - a good
    // trade on a LAN. qualityLevel trimmed a notch for the same reason.
    rfb.qualityLevel = 5;
    rfb.compressionLevel = 1;
    rfbRef.current = rfb;

    const connectTimeout = window.setTimeout(() => {
      setErrorMessage("La connexion prend trop de temps.");
      setStatus("closed");
      rfb.disconnect();
    }, CONNECT_TIMEOUT_MS);

    let reconnectTimeout: number | undefined;

    rfb.addEventListener("connect", () => {
      window.clearTimeout(connectTimeout);
      autoReconnectAttemptsRef.current = 0;
      setStatus("open");
    });
    rfb.addEventListener("disconnect", ((e: CustomEvent<{ clean: boolean }>) => {
      window.clearTimeout(connectTimeout);
      const clean = !!e.detail?.clean;
      // Retry regardless of noVNC's own "clean" flag: a server-initiated
      // close (a proxy detecting the upstream died, a worker reload) still
      // arrives as a technically-clean WS close handshake, not just an
      // abrupt drop - gating the retry on `clean` missed exactly that case
      // (confirmed: killing the backend mid-session reports clean=true).
      // What actually distinguishes "the user is done with this" from "we
      // got interrupted" is whether this component is still mounted at all
      // - if the user closed the tab/window, the effect's own cleanup
      // below cancels this timeout before it would ever fire.
      if (autoReconnectAttemptsRef.current < MAX_AUTO_RECONNECT_ATTEMPTS) {
        autoReconnectAttemptsRef.current += 1;
        setStatus("reconnecting");
        setErrorMessage(null);
        reconnectTimeout = window.setTimeout(() => setRetryToken((n) => n + 1), AUTO_RECONNECT_DELAY_MS);
        return;
      }
      setStatus("closed");
      setErrorMessage(clean ? null : "Connexion perdue.");
    }) as EventListener);
    rfb.addEventListener("credentialsrequired", () => setErrorMessage("Authentification refusée."));
    rfb.addEventListener("securityfailure", () => setErrorMessage("Échec de connexion au flux distant."));
    rfb.addEventListener("clipboard", ((e: CustomEvent<{ text: string }>) => {
      if (e.detail?.text) navigator.clipboard.writeText(e.detail.text).catch(() => {});
    }) as EventListener);

    return () => {
      window.clearTimeout(connectTimeout);
      window.clearTimeout(reconnectTimeout);
      rfb.disconnect();
      rfbRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, retryToken]);

  return (
    <div ref={containerRef} className="remote-frame-surface">
      {status === "connecting" && !errorMessage && (
        <div className="remote-frame-status">Connexion au navigateur distant...</div>
      )}
      {status === "reconnecting" && (
        <div className="remote-frame-status reconnecting">Reconnexion...</div>
      )}
      {(status === "closed" || errorMessage) && (
        <div className="remote-frame-status error">
          <p>{errorMessage || "Connexion fermée."}</p>
          <button
            type="button"
            className="remote-frame-retry"
            onClick={() => {
              autoReconnectAttemptsRef.current = 0;
              setRetryToken((n) => n + 1);
            }}
          >
            Réessayer
          </button>
        </div>
      )}
    </div>
  );
});
