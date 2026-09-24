import type { AppId } from "../types";

/** Flat curated set of preset icons for the icon bank (Paramètres >
 * Applications). Deliberately just emoji - no icon asset pipeline to
 * maintain, and it matches every icon already used across the desktop. */
export const ICON_BANK: string[] = [
  "🌐", "📁", "🛡️", "⚙️", "📧", "📅", "🔒", "🔑", "⭐", "🏠",
  "💻", "🖥️", "📱", "🖨️", "📷", "🎮", "🎵", "🎬", "🖼️", "📷",
  "📄", "📕", "📗", "📘", "📝", "📊", "📈", "🗂️", "🗄️", "🗑️",
  "🔖", "🔗", "🧩", "🛠️", "🧰", "🔍", "💬", "📞", "🛒", "💡",
  "☁️", "💾", "🖱️", "⌨️", "🔔", "📌", "🎯", "🚀", "⭐", "❤️",
];

export type AppMetaId = AppId | "mail" | "calendar";

export const DEFAULT_APP_ICONS: Record<AppMetaId, string> = {
  browser: "🌐",
  files: "📁",
  "security-dashboard": "🛡️",
  settings: "⚙️",
  mail: "📧",
  calendar: "📅",
  notes: "📝",
  downloads: "📥",
  sessions: "🔑",
  terminal: "💻",
  dockerctl: "🐳",
};

export const APP_LABELS: Record<AppMetaId, string> = {
  browser: "Navigateur",
  files: "Explorateur de fichiers",
  "security-dashboard": "Sécurité",
  settings: "Paramètres",
  mail: "Messagerie",
  calendar: "Calendrier",
  notes: "Notes",
  downloads: "Téléchargements",
  sessions: "Sessions",
  terminal: "Terminal",
  dockerctl: "Docker",
};

export type FileTypeCategory =
  | "folder"
  | "pdf"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "code"
  | "text"
  | "generic";

export const FILE_TYPE_LABELS: Record<FileTypeCategory, string> = {
  folder: "Dossier",
  pdf: "PDF",
  image: "Image",
  video: "Vidéo",
  audio: "Audio",
  archive: "Archive",
  code: "Code",
  text: "Texte",
  generic: "Fichier générique",
};

export const DEFAULT_FILE_TYPE_ICONS: Record<FileTypeCategory, string> = {
  folder: "📂",
  pdf: "📕",
  image: "🖼️",
  video: "🎬",
  audio: "🎵",
  archive: "🗜️",
  code: "💻",
  text: "📄",
  generic: "📄",
};

const EXTENSION_MAP: Record<string, FileTypeCategory> = {
  pdf: "pdf",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image", bmp: "image",
  mp4: "video", mkv: "video", mov: "video", avi: "video", webm: "video",
  mp3: "audio", wav: "audio", ogg: "audio", flac: "audio", m4a: "audio",
  zip: "archive", rar: "archive", tar: "archive", gz: "archive", "7z": "archive",
  js: "code", ts: "code", tsx: "code", jsx: "code", py: "code", java: "code", c: "code", cpp: "code",
  go: "code", rs: "code", sh: "code", html: "code", css: "code", json: "code", yml: "code", yaml: "code",
  txt: "text", md: "text", csv: "text", log: "text",
};

export function getFileCategory(name: string, isDir: boolean): FileTypeCategory {
  if (isDir) return "folder";
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "generic";
  const ext = name.slice(dot + 1).toLowerCase();
  return EXTENSION_MAP[ext] || "generic";
}
