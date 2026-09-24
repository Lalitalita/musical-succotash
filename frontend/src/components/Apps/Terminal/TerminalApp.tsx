/**
 * A real interactive shell (ttyd), reverse-proxied and admin+LAN-gated by
 * the backend itself (app/routers/terminal.py) - active by default, see
 * docker-compose.yml's `terminal` service. Unlike every other proxied "app"
 * in this desktop, this is a raw iframe with no text-mode rewriting: ttyd
 * needs full JavaScript/WebSocket support to work at all.
 */
export function TerminalApp() {
  return (
    <div className="terminal-app">
      <iframe title="Terminal" src="/api/terminal/" className="terminal-frame" />
    </div>
  );
}
