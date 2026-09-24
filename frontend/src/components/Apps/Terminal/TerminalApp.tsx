/**
 * A real interactive shell (ttyd), reverse-proxied and admin+LAN-gated by
 * Nginx (see frontend/nginx.conf's /api/terminal/ location and
 * backend/app/routers/terminal.py) - opt-in, see docker-compose.dockerctl.yml.
 * Unlike every other proxied "app" in this desktop, this is a raw iframe
 * with no text-mode rewriting: ttyd needs full JavaScript/WebSocket
 * support to work at all.
 */
export function TerminalApp() {
  return (
    <div className="terminal-app">
      <iframe title="Terminal" src="/api/terminal/" className="terminal-frame" />
    </div>
  );
}
