import { useState } from "react";
import {
  APP_LABELS,
  DEFAULT_FILE_TYPE_ICONS,
  FILE_TYPE_LABELS,
  type AppMetaId,
  type FileTypeCategory,
} from "../../../constants/icons";
import { AppIconGlyph } from "../../IconPicker/AppIconGlyph";
import { IconPicker } from "../../IconPicker/IconPicker";
import { useAppIcon, useAppIconsStore } from "../../../state/appIconsStore";
import { useAuthStore } from "../../../state/authStore";
import { useFileTypeIcon, useFileTypeIconsStore } from "../../../state/fileTypeIconsStore";
import { saveDesktopState } from "../../../state/persistence";
import { useSettingsStore } from "../../../state/settingsStore";
import { useWindowStore } from "../../../state/windowStore";

const FILE_TYPE_ORDER: FileTypeCategory[] = [
  "folder", "text", "pdf", "image", "video", "audio", "archive", "code", "generic",
];

function AppListRow({ appId, onClick }: { appId: AppMetaId; onClick: () => void }) {
  const icon = useAppIcon(appId);
  return (
    <button className="app-list-row" onClick={onClick}>
      <AppIconGlyph className="app-list-icon" icon={icon} />
      <span className="app-list-label">{APP_LABELS[appId]}</span>
      <span className="app-list-chevron">›</span>
    </button>
  );
}

function IconChangeRow({
  label,
  icon,
  onChange,
}: {
  label: string;
  icon: { icon?: string; iconUrl?: string };
  onChange: (v: { icon?: string; iconUrl?: string }) => void;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="settings-row">
      <span>{label}</span>
      <button className="app-icon-change-btn" onClick={() => setPicking(true)}>
        <AppIconGlyph className="app-icon-preview" icon={icon} />
        <span>Changer</span>
      </button>
      {picking && (
        <IconPicker
          value={icon}
          onChange={(v) => {
            onChange(v);
            saveDesktopState();
          }}
          onClose={() => setPicking(false)}
          title={`Icône - ${label}`}
        />
      )}
    </div>
  );
}

function AppDetailPanel({ appId, onBack }: { appId: AppMetaId; onBack: () => void }) {
  const icon = useAppIcon(appId);
  const setAppIcon = useAppIconsStore((s) => s.setOverride);
  const settings = useSettingsStore();

  return (
    <div>
      <button className="app-detail-back" onClick={onBack}>
        ‹ Applications
      </button>
      <div className="app-detail-header">
        <AppIconGlyph className="app-detail-icon" icon={icon} />
        <h4>{APP_LABELS[appId]}</h4>
      </div>

      <IconChangeRow label="Icône" icon={icon} onChange={(v) => setAppIcon(appId, v)} />

      {appId === "mail" && (
        <>
          <label className="settings-label">URL du webmail</label>
          <input
            className="settings-input"
            placeholder="http://snappymail"
            value={settings.mailUrl}
            onChange={(e) => settings.update({ mailUrl: e.target.value })}
            onBlur={() => saveDesktopState()}
          />
        </>
      )}

      {appId === "calendar" && (
        <>
          <label className="settings-label">URL du calendrier</label>
          <input
            className="settings-input"
            placeholder="https://calendrier.example.com"
            value={settings.calendarUrl}
            onChange={(e) => settings.update({ calendarUrl: e.target.value })}
            onBlur={() => saveDesktopState()}
          />
        </>
      )}

      {appId === "files" && <FileTypeIconsSection />}

      {appId === "security-dashboard" && (
        <button
          className="settings-btn"
          onClick={() => useWindowStore.getState().openWindow("security-dashboard", "Sécurité")}
        >
          Ouvrir le tableau de bord
        </button>
      )}
    </div>
  );
}

function FileTypeIconsSection() {
  const setFileTypeIcon = useFileTypeIconsStore((s) => s.setOverride);

  return (
    <>
      <h4>Icônes de fichiers</h4>
      <p className="settings-hint">
        Personnalisez l'icône de chaque type de fichier affiché dans l'explorateur.
      </p>
      {FILE_TYPE_ORDER.map((cat) => (
        <FileTypeIconRow key={cat} category={cat} onChange={(v) => setFileTypeIcon(cat, v)} />
      ))}
    </>
  );
}

function FileTypeIconRow({
  category,
  onChange,
}: {
  category: FileTypeCategory;
  onChange: (v: { icon?: string; iconUrl?: string }) => void;
}) {
  const icon = useFileTypeIcon(category);
  return (
    <IconChangeRow label={FILE_TYPE_LABELS[category]} icon={icon} onChange={onChange} />
  );
}

export function AppsSettingsPanel() {
  const [selected, setSelected] = useState<AppMetaId | null>(null);
  const { me } = useAuthStore();

  const appIds: AppMetaId[] = [
    "browser",
    "files",
    ...(me?.is_admin ? (["security-dashboard"] as AppMetaId[]) : []),
    "settings",
    "mail",
    "calendar",
  ];

  if (selected) {
    return <AppDetailPanel appId={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div>
      <h4>Applications</h4>
      <div className="app-list">
        {appIds.map((id) => (
          <AppListRow key={id} appId={id} onClick={() => setSelected(id)} />
        ))}
      </div>
    </div>
  );
}
