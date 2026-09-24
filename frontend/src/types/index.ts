export interface Me {
  username: string;
  email: string;
  is_admin: boolean;
  display_name: string | null;
  avatar_url: string | null;
}

export type AppId =
  | "browser"
  | "security-dashboard"
  | "settings"
  | "files"
  | "notes"
  | "downloads"
  | "terminal"
  | "dockerctl";

export interface WindowInstance {
  id: string;
  appId: AppId;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  maximized: boolean;
  zIndex: number;
  /** Initial navigation target for a freshly opened browser window (Mail/Calendrier shortcuts). */
  initialUrl?: string;
  /** Initial tab id for a freshly opened Paramètres window (e.g. "bureau" from the desktop context menu). */
  initialTab?: string;
  /** Initial note id for a freshly opened Notes window (jumping straight to a result from global search). */
  initialNoteId?: string;
  /** Opens straight into full mode - used by desktop "app" shortcuts pinned to a site. */
  initialMode?: BrowserTabMode;
  /** WebToApp-style shortcut: hides the browser's own toolbar/bookmarks
   * bar/tab strip so the window shows just the site, like a real app -
   * only meaningful in text mode (see DesktopItem.chromeless). */
  chromeless?: boolean;
}

export interface LoginAttempt {
  id: number;
  timestamp: string;
  username: string | null;
  status: string;
  ip_address: string;
  user_agent: string | null;
  country: string | null;
  city: string | null;
}

export interface MySecurity {
  mfa_enabled: boolean;
  account_created_at: string;
  recent_attempts: LoginAttempt[];
}

export interface SecurityStats {
  total_attempts: number;
  success_count: number;
  failure_count: number;
  locked_count: number;
  top_countries: { country: string; count: number }[];
  attempts_per_day: { date: string; count: number }[];
  top_usernames: { username: string; count: number }[];
  top_ips: { ip: string; count: number }[];
  hourly_distribution: { hour: number; count: number }[];
}

export interface ActiveLock {
  scope: string;
  key: string;
  retry_after_seconds: number;
}

export interface SecurityAlert {
  id: number;
  timestamp: string;
  subject: string;
  detail: string;
  username: string | null;
  ip_address: string | null;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  icon_url: string | null;
  position: number;
}

export type BrowserTabMode = "text" | "full";

export interface BrowserTab {
  id: string;
  title: string;
  address: string;
  src: string | null;
  mode: BrowserTabMode;
}

export interface DesktopSettings {
  /** A preset id from Desktop.tsx's WALLPAPERS map, or "custom-color" /
   * "custom-image" to use wallpaperColor / wallpaperImageUrl below. */
  wallpaper: string;
  wallpaperColor: string;
  wallpaperImageUrl: string;
  accent: string;
  mailUrl: string;
  calendarUrl: string;
}

export const DEFAULT_SETTINGS: DesktopSettings = {
  wallpaper: "default",
  wallpaperColor: "#203a43",
  wallpaperImageUrl: "",
  accent: "#4cc2ff",
  mailUrl: "",
  calendarUrl: "",
};

export interface DesktopItem {
  id: string;
  label: string;
  icon: string;
  /** Custom uploaded image, takes priority over `icon` (an emoji) when set. */
  iconUrl?: string;
  kind: "app" | "url";
  appId?: AppId;
  url?: string;
  /** Open straight into full mode (a real, JS-capable browser) instead of
   * the default lightweight text mode: for "Site web" shortcuts, for a
   * single site that needs JS (e.g. Instagram); for "Application"
   * shortcuts, only meaningful when appId is "browser" (mode complet is a
   * browsing concept, not applicable to Fichiers/Sécurité/Paramètres). */
  fullMode?: boolean;
  /** "Site web" shortcuts only: WebToApp style - opens with no browser
   * toolbar/bookmarks bar/tab strip, just the site filling the window
   * like a standalone app. Only works in text mode: full mode's real
   * Chromium window can't have its own chrome hidden (see README). */
  chromeless?: boolean;
  /** Free-form position on the desktop grid, in pixels from the top-left -
   * absent until the user drags the icon at least once (falls back to the
   * normal grid flow). */
  x?: number;
  y?: number;
}

export interface FileEntry {
  name: string;
  is_dir: boolean;
  size: number;
  mtime: string;
}

export type FileSource = "local" | "smb";

export interface NoteListItem {
  id: string;
  title: string;
  folder: string;
  updated_at: string;
}

export interface Note extends NoteListItem {
  content: string;
}

export interface Download {
  id: string;
  url: string;
  filename: string;
  status: "downloading" | "done" | "failed";
  total_bytes: number | null;
  downloaded_bytes: number;
  error: string | null;
  created_at: string;
}

export interface ActiveSession {
  id: string;
  ip_address: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  is_current: boolean;
}

export interface DockerContainer {
  ID: string;
  Names: string;
  Image: string;
  Status: string;
  State: string;
  Ports: string;
}
