import { useSettingsStore } from "../../state/settingsStore";
import { useWindowStore } from "../../state/windowStore";

function buildMonthGrid(reference: Date): (number | null)[][] {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-first week layout.
  const startOffset = (firstDay.getDay() + 6) % 7;

  const cells: (number | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

interface Props {
  onClose: () => void;
}

export function ClockFlyout({ onClose }: Props) {
  const now = new Date();
  const weeks = buildMonthGrid(now);
  const { mailUrl, calendarUrl } = useSettingsStore();
  const { windows, openWindow, focusWindow, toggleMinimize } = useWindowStore();

  function openApp(url: string, title: string) {
    if (!url) return;
    const existing = windows.find((w) => w.appId === "browser" && w.title === title);
    if (existing) {
      if (existing.minimized) toggleMinimize(existing.id);
      focusWindow(existing.id);
    } else {
      openWindow("browser", title, { forceNew: true, initialUrl: url });
    }
    onClose();
  }

  return (
    <div className="clock-flyout" onClick={(e) => e.stopPropagation()}>
      <div className="clock-flyout-header">
        <div className="clock-flyout-time">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
        <div className="clock-flyout-date">
          {now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
      </div>

      <div className="calendar">
        <div className="calendar-title">{now.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
        <div className="calendar-weekdays">
          {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div className="calendar-row" key={wi}>
            {week.map((day, di) => (
              <span key={di} className={`calendar-day ${day === now.getDate() ? "today" : ""}`}>
                {day ?? ""}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="quick-apps">
        <h4>Applications</h4>
        <div className="quick-apps-row">
          <button className="quick-app" disabled={!mailUrl} onClick={() => openApp(mailUrl, "Messagerie")}>
            <span className="icon-glyph">✉️</span>
            Messagerie
          </button>
          <button className="quick-app" disabled={!calendarUrl} onClick={() => openApp(calendarUrl, "Calendrier")}>
            <span className="icon-glyph">📅</span>
            Calendrier
          </button>
        </div>
        {!mailUrl && !calendarUrl && (
          <p className="settings-hint">
            Configurez les adresses de vos applications dans Paramètres → Applications.
          </p>
        )}
      </div>
    </div>
  );
}
