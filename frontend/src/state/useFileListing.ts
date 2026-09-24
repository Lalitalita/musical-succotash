import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { FileEntry, FileSource } from "../types";

/** Fetches and caches the entry list for one (source, path) folder - shared
 * between the File Explorer app and the FilePicker modal so both stay in
 * sync with the exact same fetch/error handling. Callers that mount one of
 * these per tab/instance (rather than re-creating it on every navigation)
 * get "switching back to a tab shows what was already loaded, instantly"
 * for free, since the state simply lives as long as the component does. */
export function useFileListing(source: FileSource, path: string) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smbUnconfigured, setSmbUnconfigured] = useState(false);

  const base = `/files/${source}`;

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setSmbUnconfigured(false);
    api
      .get<FileEntry[]>(`${base}?path=${encodeURIComponent(path)}`)
      .then((rows) => setEntries(rows))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 503) {
          setSmbUnconfigured(true);
        } else if (e instanceof ApiError) {
          setError(e.message);
        } else {
          setError("Erreur inconnue.");
        }
        setEntries([]);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, path]);

  // Only re-fetches when THIS instance's own (source, path) changes - i.e.
  // navigating within a tab/picker, never just because some OTHER tab
  // became active (that tab has its own hook instance with its own state).
  useEffect(() => {
    reload();
  }, [reload]);

  return { entries, loading, error, smbUnconfigured, reload, base };
}
