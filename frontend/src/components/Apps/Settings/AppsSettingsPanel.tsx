import { useEffect, useState } from "react";
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
import { useFileExplorerCategoriesStore } from "../../../state/fileExplorerCategoriesStore";
import { useFileTypeIcon, useFileTypeIconsStore } from "../../../state/fileTypeIconsStore";
import { saveDesktopState } from "../../../state/persistence";
import { useSettingsStore } from "../../../state/settingsStore";
import { useWindowStore } from "../../../state/windowStore";
import type { FileSource } from "../../../types";

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

      {appId === "files" && (
        <>
          <FileExplorerCategoriesSection />
          <FileTypeIconsSection />
        </>
      )}

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

function FileExplorerCategoriesSection() {
  const categories = useFileExplorerCategoriesStore((s) => s.categories);
  const { addCategory, removeCategory, renameCategory, moveCategory, unpinFolder } = useFileExplorerCategoriesStore();
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newFolderLabel, setNewFolderLabel] = useState("");
  const [newFolderSource, setNewFolderSource] = useState<FileSource>("local");
  const [newFolderPath, setNewFolderPath] = useState("");

  function submitNewCategory() {
    if (!newCategoryName.trim()) return;
    addCategory(newCategoryName);
    setNewCategoryName("");
    saveDesktopState();
  }

  function submitPinFolder(categoryId: string) {
    if (!newFolderPath.trim()) return;
    useFileExplorerCategoriesStore.getState().pinFolder(categoryId, {
      label: newFolderLabel.trim() || newFolderPath.trim(),
      source: newFolderSource,
      path: newFolderPath.trim(),
      isDir: true,
    });
    setAddingTo(null);
    setNewFolderLabel("");
    setNewFolderPath("");
    saveDesktopState();
  }

  return (
    <>
      <h4>Catégories de l'explorateur de fichiers</h4>
      <p className="settings-hint">
        Les catégories apparaissent dans la barre latérale de l'explorateur de fichiers, sous les entrées
        permanentes « Local » et « Partage SMB ». Épinglez un dossier ou un fichier depuis l'explorateur (clic
        droit) ou ajoutez-en un manuellement ici.
      </p>

      <div className="file-category-add-row">
        <input
          className="settings-input"
          placeholder="Nom de la nouvelle catégorie"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
        />
        <button className="settings-btn" onClick={submitNewCategory} disabled={!newCategoryName.trim()}>
          Ajouter
        </button>
      </div>

      {categories.length === 0 ? (
        <p className="settings-hint">Aucune catégorie pour l'instant.</p>
      ) : (
        categories.map((category, i) => (
          <div key={category.id} className="file-category-block">
            <div className="file-category-header">
              <input
                className="settings-input"
                value={category.name}
                onChange={(e) => renameCategory(category.id, e.target.value)}
                onBlur={() => saveDesktopState()}
              />
              <button
                className="settings-icon-btn"
                disabled={i === 0}
                onClick={() => {
                  moveCategory(category.id, -1);
                  saveDesktopState();
                }}
                title="Monter"
              >
                ▲
              </button>
              <button
                className="settings-icon-btn"
                disabled={i === categories.length - 1}
                onClick={() => {
                  moveCategory(category.id, 1);
                  saveDesktopState();
                }}
                title="Descendre"
              >
                ▼
              </button>
              <button
                className="settings-icon-btn danger"
                onClick={() => {
                  if (window.confirm(`Supprimer la catégorie « ${category.name} » ?`)) {
                    removeCategory(category.id);
                    saveDesktopState();
                  }
                }}
                title="Supprimer la catégorie"
              >
                🗑
              </button>
            </div>

            {category.folders.length === 0 ? (
              <p className="settings-hint">Aucun dossier épinglé.</p>
            ) : (
              <div className="file-category-pins">
                {category.folders.map((f) => (
                  <div key={f.id} className="file-category-pin">
                    <span>
                      {f.isDir ? "📁" : "📄"} {f.label}{" "}
                      <span className="settings-hint">
                        ({f.source === "local" ? "Local" : "SMB"} : {f.path || "/"})
                      </span>
                    </span>
                    <button
                      className="settings-icon-btn danger"
                      onClick={() => {
                        unpinFolder(category.id, f.id);
                        saveDesktopState();
                      }}
                      title="Détacher"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {addingTo === category.id ? (
              <div className="file-category-add-pin">
                <select
                  className="settings-input"
                  value={newFolderSource}
                  onChange={(e) => setNewFolderSource(e.target.value as FileSource)}
                >
                  <option value="local">Local</option>
                  <option value="smb">Partage SMB</option>
                </select>
                <input
                  className="settings-input"
                  placeholder="Chemin (ex: Documents/Projets)"
                  value={newFolderPath}
                  onChange={(e) => setNewFolderPath(e.target.value)}
                />
                <input
                  className="settings-input"
                  placeholder="Nom affiché (optionnel)"
                  value={newFolderLabel}
                  onChange={(e) => setNewFolderLabel(e.target.value)}
                />
                <button className="settings-btn" onClick={() => submitPinFolder(category.id)}>
                  Épingler
                </button>
                <button className="settings-btn" onClick={() => setAddingTo(null)}>
                  Annuler
                </button>
              </div>
            ) : (
              <button className="settings-btn" onClick={() => setAddingTo(category.id)}>
                + Épingler un dossier
              </button>
            )}
          </div>
        ))
      )}
    </>
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

interface Props {
  initialAppId?: AppMetaId;
}

export function AppsSettingsPanel({ initialAppId }: Props) {
  const [selected, setSelected] = useState<AppMetaId | null>(initialAppId ?? null);
  const { me } = useAuthStore();

  useEffect(() => {
    if (initialAppId) setSelected(initialAppId);
  }, [initialAppId]);

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
