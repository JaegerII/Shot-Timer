import { useEffect, useMemo, useRef, useState } from "react";
import { runSummary, useShotTimer } from "./useShotTimer";

const APP_VERSION = "1.4.0";

const TOPO_BG_URL = new URL("topo-bg.png", document.baseURI).toString();

function fmt(ms) {
  return (ms / 1000).toFixed(2);
}

function Toggle({ on, onClick }) {
  return <button className={`toggle ${on ? "on" : ""}`} onClick={onClick} />;
}

// × button that asks "wirklich löschen?" inline before actually deleting -
// used anywhere a run/entry can be removed, so a stray tap can't wipe data.
function ConfirmDeleteButton({ onConfirm, label = "Löschen" }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        className="icon-btn gear-del"
        aria-label={label}
        onClick={() => setConfirming(true)}
      >
        ×
      </button>
    );
  }

  return (
    <div className="confirm-inline">
      <span>Wirklich löschen?</span>
      <button
        className="confirm-inline-btn"
        onClick={() => {
          onConfirm();
          setConfirming(false);
        }}
      >
        Ja
      </button>
      <button className="confirm-inline-btn" onClick={() => setConfirming(false)}>
        Nein
      </button>
    </div>
  );
}

export default function App() {
  const t = useShotTimer();
  const [tab, setTab] = useState("timer"); // timer | dashboard | settings | history

  const running = t.phase === "arming" || t.phase === "listening";

  const statusLabel = {
    idle: "Bereit",
    arming: "Achtung...",
    listening: "Läuft",
    done: "Fertig",
  }[t.phase];

  const lastShotRow = [...t.splitsView].reverse().find((r) => r.kind === "shot");

  const bigTime =
    t.phase === "listening"
      ? fmt(t.liveElapsed)
      : lastShotRow
      ? fmt(lastShotRow.abs)
      : "0.00";

  return (
    <div className="app-shell">
    <div className="app">
      <div className="topo-bg-layer" style={{ backgroundImage: `url(${TOPO_BG_URL})` }} />
      <div className="header">
        <button className="header-brand" onClick={() => setTab("timer")}>
          <img src="./icons/logo-header.png" alt="" className="header-logo" />
          <h1>FORT Timer</h1>
        </button>
      </div>

      {t.micError && <div className="mic-warning">{t.micError}</div>}

      <div className="tab-content">
      {tab === "settings" ? (
        <SettingsPanel t={t} />
      ) : tab === "history" ? (
        <HistoryPanel t={t} onBack={() => setTab("timer")} />
      ) : tab === "dashboard" ? (
        <DashboardPanel localHistory={t.history} onDeleteLocal={t.deleteHistoryEntry} />
      ) : (
        <>
          <div className="display">
            <div className="status-row">
              <span className="status">{statusLabel}</span>
              {t.phase === "arming" && t.armRemaining != null && (
                <span className="arm-countdown">{(t.armRemaining / 1000).toFixed(1)}s</span>
              )}
            </div>
            <div className="time">{bigTime}</div>
            {t.shotCount > 0 && (
              <div className="sub">{t.shotCount} Treffer erkannt</div>
            )}
          </div>

          <Waveform waveform={t.waveform} active={t.phase === "listening"} />

          <div className={`splits ${t.splitsView.length === 0 ? "empty" : ""}`}>
            {t.splitsView.length === 0 ? (
              <span>Noch keine Splits</span>
            ) : (
              t.splitsView.map((r) => (
                <div key={r.idx} className={`split-row ${r.kind === "draw" ? "is-draw" : ""}`}>
                  <button
                    type="button"
                    className="split-row-main"
                    onClick={() => t.toggleEventKind(r.idx)}
                  >
                    <span className="idx">{r.kind === "draw" ? "Zug" : r.label}</span>
                    <span className="abs-val">{fmt(r.abs)}</span>
                    <span className="split-val">{r.split == null ? "antippen" : `+${fmt(r.split)}`}</span>
                  </button>
                  <ConfirmDeleteButton label="Event löschen" onConfirm={() => t.deleteShot(r.idx)} />
                </div>
              ))
            )}
          </div>
          {t.splitsView.length > 0 && (
            <div className="splits-hint">Antippen um Zug/Schuss umzuschalten, × um ein Event zu löschen</div>
          )}

          {running ? (
            <button className="main-btn stop" onClick={t.stop}>
              Stop
            </button>
          ) : (
            <button className="main-btn start" onClick={t.start}>
              GO
            </button>
          )}

          <div className="row-btns">
            <button className="sec-btn" onClick={t.reset}>
              Reset
            </button>
            <button className="sec-btn" onClick={() => setTab("history")}>
              Verlauf ({t.history.length})
            </button>
          </div>

          <ParTimeQuickBar t={t} />
        </>
      )}
      {tab !== "timer" && <Footer />}
      </div>
    </div>

    <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}

function BottomNav({ tab, setTab }) {
  const items = [
    { key: "timer", label: "Timer", icon: IconTimer },
    { key: "dashboard", label: "Dashboard", icon: IconDashboard },
    { key: "settings", label: "Einstellungen", icon: IconSettings },
  ];
  // History is a drill-in reached from the Timer tab, but the bar should
  // still highlight "Timer" as active while looking at it.
  const activeKey = tab === "history" ? "timer" : tab;

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {items.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`bottom-nav-item ${activeKey === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function IconTimer() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2" />
      <path d="M9 2h6" />
      <path d="M19 5l-1.5 1.5" />
    </svg>
  );
}

function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V10" />
      <path d="M11 20V4" />
      <path d="M18 20v-7" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.4 7.4 0 0 0 0-3l1.9-1.5-2-3.4-2.2.9a7.3 7.3 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.5a7.3 7.3 0 0 0-2.6 1.5l-2.2-.9-2 3.4L4.6 10.5a7.4 7.4 0 0 0 0 3l-1.9 1.5 2 3.4 2.2-.9c.76.66 1.64 1.17 2.6 1.5l.5 2.5h4l.5-2.5a7.3 7.3 0 0 0 2.6-1.5l2.2.9 2-3.4-1.9-1.5Z" />
    </svg>
  );
}

function ParTimeQuickBar({ t }) {
  const s = t.settings;
  const step = (delta) => {
    const next = Math.min(15, Math.max(0.5, Math.round((s.parTime + delta) * 10) / 10));
    t.setSettings({ parTime: next });
  };
  return (
    <div className="quick-bar">
      <span className="quick-bar-label">
        Par Time{s.parEnabled ? ` · ${s.parTime.toFixed(1)}s` : ""}
      </span>
      <div className="quick-bar-controls">
        {s.parEnabled && (
          <div className="stepper">
            <button className="stepper-btn" onClick={() => step(-0.5)}>
              −
            </button>
            <button className="stepper-btn" onClick={() => step(0.5)}>
              +
            </button>
          </div>
        )}
        <Toggle on={s.parEnabled} onClick={() => t.setSettings({ parEnabled: !s.parEnabled })} />
      </div>
    </div>
  );
}

function Waveform({ waveform, active }) {
  const scrollRef = useRef(null);
  const wasActiveRef = useRef(active);

  // While listening, keep the view pinned to the newest sample - like a
  // live meter scrolling forward.
  useEffect(() => {
    if (!active) return;
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [waveform, active]);

  // Once a run ends, jump back to the start so you can scroll through the
  // whole track from the draw onward and see where each event landed.
  useEffect(() => {
    if (wasActiveRef.current && !active) {
      const el = scrollRef.current;
      if (el) el.scrollLeft = 0;
    }
    wasActiveRef.current = active;
  }, [active]);

  return (
    <div className="waveform-panel">
      {waveform.length === 0 ? (
        <div className="waveform-empty">
          {active ? "Höre auf Audio..." : "Audio-Anzeige erscheint während des Laufs"}
        </div>
      ) : (
        <div className="waveform-bars" ref={scrollRef}>
          {waveform.map((b, i) => (
            <div key={i} className="wave-bar-col">
              <div
                className={`wave-bar ${b.kind === "shot" ? "shot" : ""} ${b.kind === "draw" ? "draw" : ""}`}
                style={{ height: `${6 + (b.level / 100) * 58}px` }}
              />
              <div className={`wave-dot ${b.kind === "shot" ? "on" : ""} ${b.kind === "draw" ? "on-draw" : ""}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SETTINGS_SECTIONS = [
  { key: "timer", label: "Timer-Einstellungen" },
  { key: "about", label: "Über FORT Timer" },
  { key: "privacy", label: "Datenschutz" },
];

function IconChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function SettingsBackButton({ onBack, label = "Einstellungen" }) {
  return (
    <button className="settings-back" onClick={onBack}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 6l-6 6 6 6" />
      </svg>
      {label}
    </button>
  );
}

function TimerSettingsSection({ t }) {
  const s = t.settings;
  return (
    <>
      <div className="panel">
        <h2>Erkennung</h2>
        <div className="field">
          <div className="field-label">
            <span>Empfindlichkeit</span>
            <span className="val">{s.sensitivity}</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={s.sensitivity}
            onChange={(e) => t.setSettings({ sensitivity: Number(e.target.value) })}
          />
        </div>
        <div className="toggle-row" style={{ marginTop: 18 }}>
          <span>Erster Ton = Holster-Zug</span>
          <Toggle on={s.drawDetection} onClick={() => t.setSettings({ drawDetection: !s.drawDetection })} />
        </div>
        <div className="field-hint">
          Der erste erkannte Ton in jedem Lauf zählt dann nicht als Schuss. Falsch erkannte Töne kannst du in der Liste antippen und umschalten.
        </div>
      </div>

      <div className="panel">
        <h2>Random Delay</h2>
        <div className="field">
          <div className="field-label">
            <span>Min (Sek.)</span>
            <span className="val">{s.delayMin.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="8"
            step="0.1"
            value={s.delayMin}
            onChange={(e) => {
              const v = Number(e.target.value);
              t.setSettings({ delayMin: v, delayMax: Math.max(v, s.delayMax) });
            }}
          />
        </div>
        <div className="field">
          <div className="field-label">
            <span>Max (Sek.)</span>
            <span className="val">{s.delayMax.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="8"
            step="0.1"
            value={s.delayMax}
            onChange={(e) => {
              const v = Number(e.target.value);
              t.setSettings({ delayMax: v, delayMin: Math.min(v, s.delayMin) });
            }}
          />
        </div>
      </div>
    </>
  );
}

function SettingsPanel({ t }) {
  const [section, setSection] = useState(null);

  if (section) {
    return (
      <>
        <SettingsBackButton onBack={() => setSection(null)} />
        {section === "timer" && <TimerSettingsSection t={t} />}
        {section === "about" && <AboutSection />}
        {section === "privacy" && <PrivacySection />}
      </>
    );
  }

  return (
    <div className="settings-menu">
      {SETTINGS_SECTIONS.map((sec) => (
        <button key={sec.key} className="settings-menu-item" onClick={() => setSection(sec.key)}>
          <span>{sec.label}</span>
          <IconChevronRight />
        </button>
      ))}
    </div>
  );
}

function Footer() {
  return (
    <div className="app-footer">
      <img src="./icons/logo-header.png" alt="" className="footer-logo" />
      <span className="footer-brand">FORT Performance</span>
      <span className="footer-tagline">Built Through Repetition.</span>
      <span className="footer-version">v{APP_VERSION}</span>
    </div>
  );
}

function AboutSection() {
  return (
    <>
      <div className="panel about-panel">
        <div className="about-body">
          <p className="about-lede">Progress doesn't happen by accident.</p>
          <p>
            FORT Timer was developed to make dry-fire practice structured, repeatable and
            measurable. Whether you're training at home or preparing for your next competition,
            every repetition provides valuable feedback.
          </p>
          <p>
            Using your phone's microphone, the app detects your draw and trigger press, helping
            you monitor consistency and identify improvement over time.
          </p>
          <p className="about-closing">Train with purpose. Improve with every repetition.</p>

          <h2>The FORT Principles</h2>
          <ul className="about-principles">
            <li>Focus with intent.</li>
            <li>Observe objectively.</li>
            <li>Respond decisively.</li>
            <li>Train relentlessly.</li>
          </ul>

          <p className="about-note">
            Tip: for reliable detection, keep your phone within about 50&nbsp;cm (20&nbsp;in) of you.
          </p>
        </div>
      </div>

      <div className="panel">
        <h2>Rechtliches</h2>
        <a className="inline-link" href="https://www.wemacon.de/impressum" target="_blank" rel="noopener noreferrer">
          Impressum
        </a>
      </div>
    </>
  );
}

function PrivacySection() {
  return (
    <div className="panel about-panel">
      <div className="about-body">
        <p>
          FORT Timer läuft komplett lokal auf deinem Gerät. Es gibt kein Konto, keinen
          Server-Login und keine Übertragung deiner Daten irgendwohin.
        </p>

        <h2>Trainingsverlauf &amp; Einstellungen</h2>
        <p>
          Dein Verlauf (Zug-/Schusszeiten in Millisekunden, keine Tonaufnahmen) und deine
          Einstellungen werden ausschließlich lokal auf diesem Gerät gespeichert (Local Storage).
          Sie verlassen dein Gerät nie. Löschst du die App oder ihre Daten, sind sie unwiderruflich
          weg - es gibt keine Cloud-Kopie.
        </p>

        <h2>Mikrofonzugriff</h2>
        <p>
          Das Mikrofon wird nur benötigt, um Holster-Zug und Abzugsklick in Echtzeit lokal auf
          deinem Gerät zu erkennen. Es wird dabei keine Tonaufnahme gespeichert oder übertragen.
        </p>

        <h2>Kein Tracking</h2>
        <p>FORT Timer verwendet keine Analyse-, Tracking- oder Werbedienste Dritter.</p>

        <h2>Verantwortlicher &amp; Kontakt</h2>
        <p>
          Anbieter dieser App: wemacon. Kontaktdaten und alle rechtlichen Angaben findest du im
          Impressum unter Einstellungen → Über FORT Timer.
        </p>
      </div>
    </div>
  );
}

function startOfWeek(dateInput = new Date()) {
  const d = new Date(dateInput);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

function fmtWeek(d) {
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function WeeklyChart({ weeks }) {
  if (weeks.length < 2) {
    return (
      <div className="field-hint">
        Noch nicht genug Wochen mit Daten für einen Trend (mindestens 2 nötig).
      </div>
    );
  }

  const width = 300;
  const height = 110;
  const padX = 12;
  const padY = 14;
  const values = weeks.map((w) => w.avg);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;
  const stepX = weeks.length > 1 ? (width - padX * 2) / (weeks.length - 1) : 0;

  const points = weeks.map((w, i) => {
    const x = padX + i * stepX;
    const y = padY + (1 - (w.avg - minV) / range) * (height - padY * 2);
    return { x, y };
  });
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  const first = weeks[0].avg;
  const last = weeks[weeks.length - 1].avg;
  const improved = last < first;
  const deltaPct = first ? Math.abs(((last - first) / first) * 100).toFixed(0) : "0";

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart" preserveAspectRatio="none">
        <path d={pathD} className="trend-line" fill="none" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.6" className="trend-dot" />
        ))}
      </svg>
      <div className="trend-axis">
        <span>{fmtWeek(weeks[0].weekStart)}</span>
        <span>{fmtWeek(weeks[weeks.length - 1].weekStart)}</span>
      </div>
      <div className="trend-summary">
        {improved
          ? `${deltaPct}% schneller seit ${fmtWeek(weeks[0].weekStart)}.`
          : `Noch keine Verbesserung seit ${fmtWeek(weeks[0].weekStart)} (${deltaPct}% langsamer).`}
      </div>
    </div>
  );
}

function DashboardPanel({ localHistory, onDeleteLocal }) {
  // Newest-first list for the itemized view/delete UI below the stats.
  const itemized = useMemo(() => {
    return localHistory
      .map((h) => {
        const s = runSummary(h.shots);
        return {
          id: h.id,
          date: h.date,
          drawMs: s.drawMs,
          firstShotMs: s.firstShotMs,
          drawToShotMs: s.drawToShotMs,
          shotCount: s.shotCount,
        };
      })
      .filter((r) => r.firstShotMs != null);
  }, [localHistory]);

  // Downloads the itemized runs as a CSV file, oldest first like a log.
  const exportCsv = () => {
    const header = ["Datum", "Uhrzeit", "Draw (s)", "1. Schuss (s)", "Draw->Schuss (s)", "Schuesse"];
    const rows = itemized
      .slice()
      .reverse()
      .map((r) => {
        const d = new Date(r.date);
        return [
          d.toLocaleDateString("de-DE"),
          d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
          r.drawMs != null ? (r.drawMs / 1000).toFixed(2) : "",
          r.firstShotMs != null ? (r.firstShotMs / 1000).toFixed(2) : "",
          r.drawToShotMs != null ? (r.drawToShotMs / 1000).toFixed(2) : "",
          r.shotCount != null ? String(r.shotCount) : "",
        ];
      });
    const csv = [header, ...rows]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fort-timer-verlauf-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Same data, oldest-first, for the stats/trend calculations below.
  const runs = useMemo(() => itemized.slice().reverse(), [itemized]);

  const stats = useMemo(() => {
    const withDraw = runs.filter((r) => r.drawMs != null);
    const withFirstShot = runs.filter((r) => r.firstShotMs != null);
    const withDrawToShot = runs.filter((r) => r.drawToShotMs != null);
    const avg = (list, key) => (list.length ? list.reduce((sum, r) => sum + r[key], 0) / list.length : null);
    return {
      count: runs.length,
      avgDraw: avg(withDraw, "drawMs"),
      avgFirstShot: avg(withFirstShot, "firstShotMs"),
      avgDrawToShot: avg(withDrawToShot, "drawToShotMs"),
    };
  }, [runs]);

  const weekly = useMemo(() => {
    const buckets = new Map();
    for (const r of runs) {
      const value = r.drawToShotMs != null ? r.drawToShotMs : r.firstShotMs;
      if (value == null) continue;
      const weekStart = startOfWeek(r.date);
      const key = weekStart.toISOString();
      if (!buckets.has(key)) buckets.set(key, { weekStart, values: [] });
      buckets.get(key).values.push(value);
    }
    return [...buckets.values()]
      .map((b) => ({ weekStart: b.weekStart, avg: b.values.reduce((a, v) => a + v, 0) / b.values.length }))
      .sort((a, b) => a.weekStart - b.weekStart)
      .slice(-10);
  }, [runs]);

  return (
    <>
      <div className="panel">
        <div className="panel-header-row">
          <h2>Auswertung</h2>
          {stats.count > 0 && <span className="dash-count">{stats.count} Läufe</span>}
        </div>
        {stats.count === 0 ? (
          <span className="field-hint">Noch keine auswertbaren Läufe (Draw + erster Schuss nötig).</span>
        ) : (
          <>
            <div className="dash-stats">
              <div className="dash-stat">
                <span className="dash-stat-label">Ø Zug</span>
                <span className="dash-stat-val">{stats.avgDraw != null ? fmt(stats.avgDraw) : "–"}</span>
              </div>
              <div className="dash-stat">
                <span className="dash-stat-label">Ø 1. Schuss</span>
                <span className="dash-stat-val">
                  {stats.avgFirstShot != null ? fmt(stats.avgFirstShot) : "–"}
                </span>
              </div>
            </div>
            {stats.avgDrawToShot != null && (
              <div className="dash-delta">Ø Zug → Schuss: {fmt(stats.avgDrawToShot)}s</div>
            )}
          </>
        )}
      </div>

      {weekly.length > 0 && (
        <div className="panel">
          <h2>Wochen-Trend</h2>
          <WeeklyChart weeks={weekly} />
        </div>
      )}

      {itemized.length > 0 && (
        <div className="panel">
          <div className="panel-header-row">
            <h2>Läufe</h2>
            <button className="sec-btn" onClick={exportCsv}>
              Exportieren (CSV)
            </button>
          </div>
          <div className="field-hint" style={{ marginBottom: 10 }}>
            Ein Lauf durch Fremdgeräusche verfälscht? Hier kannst du ihn aus der Auswertung entfernen.
          </div>
          <div className="run-list">
            {itemized.map((r) => (
              <div className="run-row" key={r.id}>
                <div className="run-row-main">
                  <span className="run-row-date">
                    {new Date(r.date).toLocaleString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="run-row-vals">
                    {r.drawMs != null ? (
                      <>
                        Zug {fmt(r.drawMs)}s → Schuss {fmt(r.firstShotMs)}s
                        {r.drawToShotMs != null && (
                          <span className="run-row-delta"> (Δ {fmt(r.drawToShotMs)}s)</span>
                        )}
                      </>
                    ) : (
                      `1. Schuss ${fmt(r.firstShotMs)}s`
                    )}
                  </span>
                </div>
                <ConfirmDeleteButton label="Lauf löschen" onConfirm={() => onDeleteLocal?.(r.id)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function HistoryPanel({ t, onBack }) {
  return (
    <>
      {t.history.length === 0 ? (
        <div className="splits empty">
          <span>Noch keine gespeicherten Läufe</span>
        </div>
      ) : (
        t.history.map((h) => {
          const events = h.shots.map(t.normalizeEvent);
          return (
            <div className="history-item" key={h.id}>
              <div className="h-top">
                <div className="h-top-main">
                  <span className="h-time">{fmt(h.total)}</span>
                  <span className="h-date">
                    {new Date(h.date).toLocaleString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <ConfirmDeleteButton label="Lauf löschen" onConfirm={() => t.deleteHistoryEntry(h.id)} />
              </div>
              <div className="h-splits">
                {events
                  .map((ev) => (ev.kind === "draw" ? `Zug ${fmt(ev.t)}` : fmt(ev.t)))
                  .join("s  ·  ")}
                s
              </div>
            </div>
          );
        })
      )}

      <div className="row-btns" style={{ marginTop: 8 }}>
        <button className="sec-btn" onClick={t.clearHistory}>
          Verlauf löschen
        </button>
        <button className="sec-btn" onClick={onBack}>
          Zurück
        </button>
      </div>
    </>
  );
}
