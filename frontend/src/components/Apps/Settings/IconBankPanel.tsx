import { useRef, useState } from "react";
import { api } from "../../../api/client";
import { ICON_BANK } from "../../../constants/icons";
import { AppIconGlyph } from "../../IconPicker/AppIconGlyph";
import { useIconBankStore } from "../../../state/iconBankStore";
import { saveDesktopState } from "../../../state/persistence";

export function IconBankPanel() {
  const { customIcons, addIcon, removeIcon } = useIconBankStore();
  const [newEmoji, setNewEmoji] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function addEmoji() {
    const value = newEmoji.trim();
    if (!value) return;
    addIcon({ icon: value });
    setNewEmoji("");
    saveDesktopState();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await api.upload("/uploads", file);
      addIcon({ iconUrl: url });
      saveDesktopState();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <h4>Banque d'icônes</h4>
      <p className="settings-hint">
        Les icônes disponibles partout où une icône se choisit (apps, raccourcis de bureau, types de
        fichiers). Les icônes prédéfinies ne peuvent pas être supprimées, mais vous pouvez en ajouter
        vos propres emoji ou images.
      </p>

      <div className="icon-bank-add-row">
        <input
          className="settings-input"
          placeholder="Coller un emoji (ex: 🚗)"
          value={newEmoji}
          onChange={(e) => setNewEmoji(e.target.value)}
          maxLength={8}
        />
        <button className="settings-btn" onClick={addEmoji} disabled={!newEmoji.trim()}>
          Ajouter
        </button>
        <button className="settings-btn" onClick={() => fileInput.current?.click()} disabled={uploading}>
          {uploading ? "Envoi..." : "Image..."}
        </button>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={onFileChange} />
      </div>

      <h4>Icônes personnalisées</h4>
      {customIcons.length === 0 ? (
        <p className="settings-hint">Aucune pour l'instant.</p>
      ) : (
        <div className="icon-bank-grid">
          {customIcons.map((bankIcon) => (
            <div key={bankIcon.id} className="icon-bank-item">
              <AppIconGlyph icon={bankIcon} className="icon-bank-item-icon" />
              <button className="icon-bank-remove" onClick={() => removeIcon(bankIcon.id)} title="Supprimer">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <h4>Icônes prédéfinies</h4>
      <div className="icon-bank-grid">
        {ICON_BANK.map((emoji, i) => (
          <div key={`${emoji}-${i}`} className="icon-bank-item readonly">
            <span className="icon-bank-item-icon">{emoji}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
