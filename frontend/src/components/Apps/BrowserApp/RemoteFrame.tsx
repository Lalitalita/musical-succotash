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
export const RemoteFrame = forwardRef<RemoteFrameHandle, Props>(function RemoteFrame(
  { tabId, initialUrl },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const [status, setStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  return (
    <div ref={containerRef} className="remote-frame-surface">
      {status === "connecting" && <div className="remote-frame-status">Connexion au navigateur distant...</div>}
      {status === "closed" && !errorMessage && <div className="remote-frame-status">Connexion fermée.</div>}
      {errorMessage && <div className="remote-frame-status error">{errorMessage}</div>}
    </div>
  );
});
