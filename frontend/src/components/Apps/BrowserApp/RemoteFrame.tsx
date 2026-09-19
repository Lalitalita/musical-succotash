import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useRef, useState } from "react";

interface Props {
  tabId: string;
  initialUrl: string;
  /** Bumped by the parent every time the user explicitly navigates (address
   * bar submit, bookmark click, reload) while this tab is in full mode. */
  navSeq: number;
}

/**
 * Full-browser mode: a real headless Chromium tab running on the backend.
 * This component never runs the target site's JavaScript locally - it only
 * displays JPEG frames streamed over a WebSocket and forwards mouse/
 * keyboard input back. Opt-in per tab, for the rare site the ultra-light
 * text-mode proxy can't render (it needs JS to work at all).
 */
export function RemoteFrame({ tabId, initialUrl, navSeq }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameUrlRef = useRef<string | null>(null);
  const mountedNavSeq = useRef<number | null>(null);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<"connecting" | "open" | "error" | "closed">("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remoteTitle, setRemoteTitle] = useState("");

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(
      `${proto}://${window.location.host}/api/browser/full/ws?tab_id=${encodeURIComponent(tabId)}&url=${encodeURIComponent(
        initialUrl
      )}`
    );
    ws.binaryType = "blob";
    wsRef.current = ws;
    mountedNavSeq.current = navSeq;

    ws.onopen = () => {
      setStatus("open");
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        ws.send(JSON.stringify({ type: "resize", width: Math.round(rect.width), height: Math.round(rect.height) }));
      }
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "url") setRemoteTitle(msg.title || msg.url || "");
          if (msg.type === "error") setErrorMessage(msg.message);
        } catch {
          /* ignore malformed control message */
        }
        return;
      }
      const blob = ev.data as Blob;
      const url = URL.createObjectURL(blob);
      if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current);
      frameUrlRef.current = url;
      setFrameSrc(url);
    };

    ws.onerror = () => setStatus("error");
    ws.onclose = () => setStatus("closed");

    return () => {
      ws.close();
      if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  useEffect(() => {
    if (mountedNavSeq.current === null) return;
    if (navSeq <= mountedNavSeq.current) return;
    mountedNavSeq.current = navSeq;
    wsRef.current?.send(JSON.stringify({ type: "navigate", url: initialUrl }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navSeq]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || wsRef.current?.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(
        JSON.stringify({
          type: "resize",
          width: Math.round(entry.contentRect.width),
          height: Math.round(entry.contentRect.height),
        })
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function send(msg: Record<string, unknown>) {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }

  function relativeCoords(e: ReactMouseEvent): { x: number; y: number } {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) };
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    e.preventDefault();
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      send({ type: "text", text: e.key });
    } else {
      send({ type: "keydown", key: e.key });
    }
  }

  function onKeyUp(e: ReactKeyboardEvent) {
    e.preventDefault();
    if (e.key.length !== 1) send({ type: "keyup", key: e.key });
  }

  return (
    <div className="remote-frame">
      <div className="remote-frame-bar">
        <span className="remote-frame-badge">Mode complet</span>
        <span className="remote-frame-title">{remoteTitle}</span>
        <div className="remote-frame-controls">
          <button title="Précédent" onClick={() => send({ type: "back" })}>
            ←
          </button>
          <button title="Suivant" onClick={() => send({ type: "forward" })}>
            →
          </button>
          <button title="Recharger" onClick={() => send({ type: "reload" })}>
            ⟳
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="remote-frame-surface"
        tabIndex={0}
        onMouseMove={(e) => send({ type: "mousemove", ...relativeCoords(e) })}
        onMouseDown={(e) => send({ type: "mousedown", ...relativeCoords(e), button: "left" })}
        onMouseUp={(e) => send({ type: "mouseup", ...relativeCoords(e), button: "left" })}
        onWheel={(e) => {
          e.preventDefault();
          send({ type: "wheel", dx: e.deltaX, dy: e.deltaY });
        }}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      >
        {frameSrc && <img src={frameSrc} alt="" draggable={false} />}
        {status === "connecting" && !frameSrc && <div className="remote-frame-status">Connexion au navigateur distant...</div>}
        {status === "error" && <div className="remote-frame-status">Connexion perdue.</div>}
        {errorMessage && <div className="remote-frame-status error">{errorMessage}</div>}
      </div>
    </div>
  );
}
