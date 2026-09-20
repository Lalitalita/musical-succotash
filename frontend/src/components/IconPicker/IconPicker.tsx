import { useRef, useState } from "react";
import { api } from "../../api/client";
import { ICON_BANK } from "../../constants/icons";
import type { IconOverride } from "../../state/appIconsStore";
import { useIconBankStore } from "../../state/iconBankStore";
import { AppIconGlyph } from "./AppIconGlyph";

interface Props {
  value: IconOverride;
  onChange: (value: IconOverride) => void;
  onClose: () => void;
  title?: string;
}

/** Shared icon-bank modal: pick a preset emoji or upload a custom image.
 * Used for app icons, desktop shortcut icons and file-type icons alike. */
export function IconPicker({ value, onChange, onClose, title }: Props) {
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const customIcons = useIconBankStore((s) => s.customIcons);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await api.upload("/uploads", file);
      onChange({ iconUrl: url });
      onClose();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card icon-picker" onClick={(e) => e.stopPropagation()}>
        <h3>{title || "Choisir une icône"}</h3>

        <div className="icon-picker-grid">
          {ICON_BANK.map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              className={`icon-picker-cell ${value.icon === emoji && !value.iconUrl ? "active" : ""}`}
              onClick={() => {
                onChange({ icon: emoji });
                onClose();
              }}
            >
              {emoji}
            </button>
          ))}
          {customIcons.map((bankIcon) => (
            <button
              key={bankIcon.id}
              className={`icon-picker-cell ${
                (bankIcon.icon && value.icon === bankIcon.icon) ||
                (bankIcon.iconUrl && value.iconUrl === bankIcon.iconUrl)
                  ? "active"
                  : ""
              }`}
              onClick={() => {
                onChange({ icon: bankIcon.icon, iconUrl: bankIcon.iconUrl });
                onClose();
              }}
            >
              <AppIconGlyph icon={bankIcon} />
            </button>
          ))}
        </div>

        <div className="icon-picker-upload">
          <button className="settings-btn" onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading ? "Envoi..." : "Image personnalisée..."}
          </button>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={onFileChange} />
        </div>

        <div className="modal-actions">
          <button type="button" className="settings-btn" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
