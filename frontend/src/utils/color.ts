/** Darkens a "#rrggbb" color by `percent` (0-100) - used to derive the
 * "--accent-strong" shade from whatever accent color the user picks, so
 * filled buttons/backgrounds stay consistent with a custom accent instead
 * of a hardcoded blue. */
export function darken(hex: string, percent: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const num = parseInt(match[1], 16);
  const factor = 1 - percent / 100;
  const r = Math.max(0, Math.round(((num >> 16) & 0xff) * factor));
  const g = Math.max(0, Math.round(((num >> 8) & 0xff) * factor));
  const b = Math.max(0, Math.round((num & 0xff) * factor));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
