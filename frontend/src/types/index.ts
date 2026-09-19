export interface Me {
  username: string;
  email: string;
  is_admin: boolean;
}

export type AppId = "browser" | "security-dashboard" | "about";

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
}
