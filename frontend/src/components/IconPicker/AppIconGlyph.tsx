import type { IconOverride } from "../../state/appIconsStore";

interface Props {
  icon: IconOverride;
  className?: string;
}

/** Renders whichever icon an app/file-type currently resolves to - a
 * preset emoji, or an uploaded custom image. */
export function AppIconGlyph({ icon, className }: Props) {
  if (icon.iconUrl) return <img className={className} src={icon.iconUrl} alt="" />;
  return <span className={className}>{icon.icon}</span>;
}
