import { forwardRef, useImperativeHandle } from "react";
import { useSearchResults } from "../../state/searchResults";
import { AppIconGlyph } from "../IconPicker/AppIconGlyph";

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
}

export interface SearchOverlayHandle {
  /** Runs whichever result is currently first, if any - for the Enter key
   * pressed in the taskbar's own search input. */
  runFirst: () => void;
}

export const SearchOverlay = forwardRef<SearchOverlayHandle, Props>(function SearchOverlay(
  { query, onQueryChange, onClose },
  ref
) {
  const results = useSearchResults(query);

  function pick(r: (typeof results)[number]) {
    r.onSelect();
    onQueryChange("");
    onClose();
  }

  useImperativeHandle(ref, () => ({
    runFirst() {
      if (results[0]) pick(results[0]);
    },
  }));

  if (!query.trim()) return null;

  return (
    <div className="search-overlay" onClick={(e) => e.stopPropagation()}>
      {results.length === 0 && <div className="search-overlay-empty">Aucun résultat.</div>}
      {results.map((r) => (
        <button key={r.key} className="search-overlay-result" onClick={() => pick(r)}>
          <span className="search-overlay-result-icon">
            <AppIconGlyph className="icon-glyph" icon={{ icon: r.icon, iconUrl: r.iconUrl }} />
          </span>
          <span className="search-overlay-result-text">
            <span className="search-overlay-result-label">{r.label}</span>
            <span className="search-overlay-result-hint">{r.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
});
