export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function viewSrc(url: string, cacheBust?: number): string {
  const base = `/api/browser/view?url=${encodeURIComponent(url)}`;
  return cacheBust ? `${base}&_r=${cacheBust}` : base;
}
