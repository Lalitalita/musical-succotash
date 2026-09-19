export interface Me {
  username: string;
  email: string;
  is_admin: boolean;
  display_name: string | null;
  avatar_url: string | null;
}

export type AppId = "browser" | "security-dashboard" | "about" | "settings" | "files";

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
  /** Bumped on every explicit navigate()/reload() while in full mode, so the
   * remote-control view knows to send a fresh navigation - as opposed to
   * merely being remounted when the user switches tabs. */
  navSeq: number;
}

export interface DesktopSettings {
  wallpaper: string;
  accent: string;
  mailUrl: string;
  calendarUrl: string;
}

export const DEFAULT_SETTINGS: DesktopSettings = {
  wallpaper: "default",
  accent: "#4cc2ff",
  mailUrl: "",
  calendarUrl: "",
};

export interface DesktopItem {
  id: string;
  label: string;
  icon: string;
  kind: "app" | "url";
  appId?: AppId;
  url?: string;
}

export interface FileEntry {
  name: string;
  is_dir: boolean;
  size: number;
  mtime: string;
}

export type FileSource = "local" | "smb";
