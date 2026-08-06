import { useState } from "react";
import { createPortal } from "react-dom";
import { useShotTimer } from "./useShotTimer";
import { useTargetsTimer } from "./useTargetsTimer";
import { useTransitionsTimer } from "./useTransitionsTimer";

const APP_VERSION = "1.7.1";

const TOPO_BG_URL = new URL("topo-bg.png", document.baseURI).toString();

function fmt(ms) {
  return (ms / 1000).toFixed(2);
}

function Toggle({ on, onClick }) {
  return <button className={`toggle ${on ? "on" : ""}`} onClick={onClick} />;
}

// Only the mode selector for now - Dry Fire is the only working mode. Live
// Fire is intentionally non-interactive (structure only, per roadmap) until
// its own beep/par-time-only flow is actually built.
function ModeSwitch() {
  return (
    <div className="panel radio-list">
      <h2>Modus</h2>
      <div className="radio-option active">
        <span className="radio-dot" />
        <span>Dry Fire</span>
      </div>
      <div className="radio-option disabled" aria-disabled="true">
        <span className="radio-dot" />
        <span>Live Fire</span>
        <span className="radio-soon">Bald verfügbar</span>
      </div>
    </div>
  );
}

export default function App() {
  const t = useShotTimer();
  const tt = useTargetsTimer();
  const tr = useTransitionsTimer();
  const [tab, setTabState] = useState("timer"); // timer | targets | transitions | settings

  // Each timer hook lives at the App level so its state survives a tab
  // switch and back - but a run that's actually active must not keep going
  // silently in a tab the user has left. Stopping (not resetting) the timer
  // belonging to the tab being left keeps its last result on screen for
  // later review, matching what the Stop button already does.
  const setTab = (next) => {
    if (next === tab) return;
    if (tab === "timer" && (t.phase === "arming" || t.phase === "listening")) t.stop();
    if (tab === "targets" && tt.phase !== "idle" && tt.phase !== "done") tt.stop();
    if (tab === "transitions" && tr.phase !== "idle" && tr.phase !== "done") tr.stop();
    setTabState(next);
  };

  const running = t.phase === "arming" || t.phase === "listening";

  const statusLabel = {
    idle: "Bereit",
    arming: "Achtung...",
    listening: "Läuft",
    done: "Fertig",
  }[t.phase];

  const bigTime = t.phase === "idle" ? "0.00" : fmt(t.liveElapsed);

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

      <div className="tab-content">
      {tab === "settings" ? (
        <SettingsPanel t={t} />
      ) : tab === "targets" ? (
        <TargetsPanel t={tt} />
      ) : tab === "transitions" ? (
        <TransitionsPanel t={tr} />
      ) : (
        <>
          <ModeSwitch />

          <div className="display">
            <div className="status-row">
              <span className="status">{statusLabel}</span>
              {t.phase === "arming" && t.armRemaining != null && (
                <span className="arm-countdown">{(t.armRemaining / 1000).toFixed(1)}s</span>
              )}
            </div>
            <div className="time">{bigTime}</div>
          </div>

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
    { key: "targets", label: "Targets", icon: IconTargets },
    { key: "transitions", label: "Transitions", icon: IconTransitions },
    { key: "settings", label: "Einstellungen", icon: IconSettings },
  ];

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {items.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`bottom-nav-item ${tab === key ? "active" : ""}`}
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

function IconTargets() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
    </svg>
  );
}

function IconTransitions() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h11" />
      <path d="M12 4l3 3-3 3" />
      <path d="M20 17H9" />
      <path d="M12 20l-3-3 3-3" />
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
            <button className="stepper-btn" onClick={() => step(-0.1)}>
              −
            </button>
            <button className="stepper-btn" onClick={() => step(0.1)}>
              +
            </button>
          </div>
        )}
        <Toggle on={s.parEnabled} onClick={() => t.setSettings({ parEnabled: !s.parEnabled })} />
      </div>
    </div>
  );
}

const TARGET_TYPES = [
  { key: "ipsc", label: "IPSC" },
  { key: "uspsa", label: "USPSA" },
  { key: "steel", label: "Steel" },
];

// Simplified target shapes for sight-picture practice - not to official
// competition scoring dimensions, just visually representative.
// The FORT mark, traced from the app's own header/footer logo, as a raw
// path in its native 167x240 coordinate space. Stamped small and
// semi-transparent onto every target graphic below - both as a subtle
// brand touch and so the artwork isn't just a bare, easily-reused SVG.
const LOGO_MARK_PATH = "M83,1 L0,163 L0,195 L49,239 L72,239 L83,78 L94,239 L117,239 L166,195 L166,163 Z";

function LogoWatermark({ x, y, width }) {
  const scale = width / 167;
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`} fill="currentColor" opacity="0.32">
      <path d={LOGO_MARK_PATH} />
    </g>
  );
}

function TargetGraphic({ type }) {
  if (type === "steel") {
    // Popper-style steel target (round head on a narrow stand neck), traced
    // from the user's reference photo. The neck rect is drawn first and the
    // head circle layered on top so the shapes read as one clean silhouette
    // with no seam where they overlap.
    return (
      <svg viewBox="0 0 200 320" className="target-svg" preserveAspectRatio="xMidYMid meet">
        <rect x="72" y="105" width="56" height="210" className="target-steel-plate" />
        <rect x="72" y="105" width="56" height="210" className="target-steel-rim" />
        <circle cx="100" cy="80" r="78" className="target-steel-plate" />
        <circle cx="100" cy="80" r="78" className="target-steel-rim" />
        <g className="target-watermark">
          <LogoWatermark x={92} y={258.5} width={16} />
        </g>
      </svg>
    );
  }

  if (type === "ipsc") {
    // User-supplied vector artwork, including the FORT mark baked directly
    // into the design by the user themselves (see public/targets/ipsc-cropped.svg).
    return <img src="./targets/ipsc-cropped.svg" alt="IPSC Target" className="target-img" />;
  }

  // USPSA - user-supplied vector artwork with the real D/C/A/B zone layout,
  // including the FORT mark baked directly into the design.
  return <img src="./targets/uspsa-v3-cropped.svg" alt="USPSA Target" className="target-img" />;
}

// Range Officer simulation: pick a target type, optionally turn on Voice
// Start (you say "Shooter Ready", the app answers "Standby" out loud, then
// the random delay + beep starts) - otherwise Start behaves just like the
// Dry Fire timer. The target itself is shown full-size for sight-picture
// practice, with the timer reduced to a slim status bar.
function IconExpand() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function TargetsPanel({ t }) {
  const s = t.settings;
  const running = t.phase !== "idle" && t.phase !== "done";
  const [zoomed, setZoomed] = useState(false);

  const statusLabel = {
    idle: "Bereit",
    ready: 'Warte auf "Shooter Ready"...',
    standby: "Standby",
    arming: "Achtung...",
    listening: "Läuft",
    done: "Fertig",
  }[t.phase];

  const bigTime =
    t.phase === "idle" || t.phase === "ready" || t.phase === "standby" ? "0.00" : fmt(t.liveElapsed);

  return (
    <>
      <div className="panel target-settings">
        <div className="segmented">
          {TARGET_TYPES.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`segmented-btn ${s.targetType === opt.key ? "active" : ""}`}
              onClick={() => t.setSettings({ targetType: opt.key })}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="toggle-row" style={{ marginTop: 12 }}>
          <span>Voice Start</span>
          <Toggle on={s.voiceEnabled} onClick={() => t.setSettings({ voiceEnabled: !s.voiceEnabled })} />
        </div>
        {s.voiceEnabled && (
          <div className="field-hint">
            Du sagst "Shooter Ready", die App antwortet "Standby" und startet danach den
            Zufalls-Delay.
          </div>
        )}
      </div>

      {t.micError && <div className="mic-warning">{t.micError}</div>}

      <div className="mini-timer-bar">
        <span className="mini-timer-status">{statusLabel}</span>
        {t.phase === "arming" && t.armRemaining != null && (
          <span className="mini-timer-arm">{(t.armRemaining / 1000).toFixed(1)}s</span>
        )}
        <span className="mini-timer-time">{bigTime}</span>
      </div>

      <div className="target-frame" onClick={() => setZoomed(true)}>
        <TargetGraphic type={s.targetType} />
        <span className="target-expand-icon">
          <IconExpand />
        </span>
      </div>

      {running ? (
        <button className="main-btn compact stop" onClick={t.stop}>
          Stop
        </button>
      ) : (
        <button className="main-btn compact start" onClick={t.start}>
          Start
        </button>
      )}

      <div className="row-btns compact">
        <button className="sec-btn" onClick={t.reset}>
          Reset
        </button>
      </div>

      {zoomed &&
        createPortal(
          <div className="target-zoom-overlay">
            <div className="zoom-topbar">
              <span className="mini-timer-status">{statusLabel}</span>
              {t.phase === "arming" && t.armRemaining != null && (
                <span className="mini-timer-arm">{(t.armRemaining / 1000).toFixed(1)}s</span>
              )}
              <span className="mini-timer-time">{bigTime}</span>
              <button className="zoom-close-btn" onClick={() => setZoomed(false)} aria-label="Schließen">
                <IconClose />
              </button>
            </div>

            <div className="zoom-target-wrap">
              <TargetGraphic type={s.targetType} />
            </div>

            <div className="zoom-bottom-bar">
              {running ? (
                <button className="main-btn compact stop" onClick={t.stop}>
                  Stop
                </button>
              ) : (
                <button className="main-btn compact start" onClick={t.start}>
                  Start
                </button>
              )}
              <div className="row-btns compact">
                <button className="sec-btn" onClick={t.reset}>
                  Reset
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

const TRANSITION_CATEGORIES = [
  { key: "lr", label: "Links / Mitte / Rechts" },
  { key: "abcd", label: "Alpha / Beta / Charlie / Delta" },
  { key: "numbers", label: "Zahlen 1–5" },
  { key: "colors", label: "Farben" },
  { key: "distance", label: "Nah / Fern" },
];

const TRANSITION_INTERVALS = [
  { key: "0.5", label: "0.5s" },
  { key: "1", label: "1s" },
  { key: "2", label: "2s" },
  { key: "random", label: "Zufall" },
];

const TRANSITION_COUNTS = [
  { key: "10", label: "10" },
  { key: "20", label: "20" },
  { key: "endless", label: "Endlos" },
];

const TRANSITION_PREP_DELAYS = [
  { key: "2", label: "2s" },
  { key: "3", label: "3s" },
  { key: "4", label: "4s" },
];

const COLOR_CALLOUT_CLASS = {
  Rot: "callout-rot",
  Grün: "callout-gruen",
  Blau: "callout-blau",
  Gelb: "callout-gelb",
};

// Transitions drill: the app calls out a random direction/letter/number/
// color/distance at a set pace, you react. Pure audio output - no camera,
// no mic, nothing to detect. Settings (categories/interval/count/prep
// time/voice) only show while idle; once Start is pressed they're
// replaced by a single big readout (countdown, "Standby", then the
// callouts) - same "just the essentials, full size" idea as the Targets
// tab's zoomed view, just always-on here instead of tap-to-zoom.
function TransitionsPanel({ t }) {
  const s = t.settings;
  const idle = t.phase === "idle";
  const hasCategory = Object.values(s.categories).some(Boolean);
  const countLabel = s.count === "endless" ? "∞" : s.count;

  const statusLabel = {
    idle: "Bereit",
    prep: "Bereit machen...",
    standby: "Standby",
    arming: "Achtung...",
    calling: "Läuft",
    done: "Fertig",
  }[t.phase];

  const bigText =
    t.phase === "prep"
      ? String(t.countdown ?? "")
      : t.phase === "standby"
      ? "Standby"
      : t.phase === "arming"
      ? "•"
      : t.current ?? "–";

  // Farben (Rot/Grün/Blau/Gelb) färben zusätzlich zum Wort auch das ganze
  // Feld ein - auf einen Blick statt lesen müssen.
  const colorClass =
    t.phase === "calling" && COLOR_CALLOUT_CLASS[t.current] ? COLOR_CALLOUT_CLASS[t.current] : "";

  if (idle) {
    return (
      <>
        <div className="panel target-settings">
          <h2>Kategorien</h2>
          {TRANSITION_CATEGORIES.map((c) => (
            <div className="toggle-row" key={c.key}>
              <span>{c.label}</span>
              <Toggle
                on={s.categories[c.key]}
                onClick={() =>
                  t.setSettings({ categories: { ...s.categories, [c.key]: !s.categories[c.key] } })
                }
              />
            </div>
          ))}
          {!hasCategory && (
            <div className="field-hint">Wähle mindestens eine Kategorie aus, um zu starten.</div>
          )}
        </div>

        <div className="panel target-settings">
          <h2>Intervall</h2>
          <div className="segmented">
            {TRANSITION_INTERVALS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`segmented-btn ${s.interval === opt.key ? "active" : ""}`}
                onClick={() => t.setSettings({ interval: opt.key })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="panel target-settings">
          <h2>Anzahl</h2>
          <div className="segmented">
            {TRANSITION_COUNTS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`segmented-btn ${s.count === opt.key ? "active" : ""}`}
                onClick={() => t.setSettings({ count: opt.key })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="panel target-settings">
          <h2>Vorbereitungszeit</h2>
          <div className="segmented">
            {TRANSITION_PREP_DELAYS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`segmented-btn ${s.prepDelay === opt.key ? "active" : ""}`}
                onClick={() => t.setSettings({ prepDelay: opt.key })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <button className="main-btn compact start" onClick={t.start} disabled={!hasCategory}>
          Start
        </button>
      </>
    );
  }

  return (
    <>
      <div className="mini-timer-bar">
        <span className="mini-timer-status">{statusLabel}</span>
        {t.phase === "arming" && t.armRemaining != null && (
          <span className="mini-timer-arm">{(t.armRemaining / 1000).toFixed(1)}s</span>
        )}
        <span className="mini-timer-time">
          {t.calledCount}/{countLabel}
        </span>
      </div>

      <div className={`transitions-frame ${colorClass}`}>
        <span className="transitions-call-text">{bigText}</span>
      </div>

      {t.phase === "done" ? (
        <button className="main-btn compact start" onClick={t.start} disabled={!hasCategory}>
          Start
        </button>
      ) : (
        <button className="main-btn compact stop" onClick={t.stop}>
          Stop
        </button>
      )}

      <div className="row-btns compact">
        <button className="sec-btn" onClick={t.reset}>
          Reset
        </button>
      </div>
    </>
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
          <p className="about-closing">Train with purpose. Improve with every repetition.</p>

          <h2>The FORT Principles</h2>
          <ul className="about-principles">
            <li>Focus with intent.</li>
            <li>Observe objectively.</li>
            <li>Respond decisively.</li>
            <li>Train relentlessly.</li>
          </ul>
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

        <h2>Einstellungen</h2>
        <p>
          Deine Einstellungen werden ausschließlich lokal auf diesem Gerät gespeichert (Local
          Storage). Sie verlassen dein Gerät nie. Löschst du die App oder ihre Daten, sind sie
          unwiderruflich weg - es gibt keine Cloud-Kopie.
        </p>

        <h2>Mikrofonzugriff</h2>
        <p>
          Der Dry-Fire-Timer nutzt kein Mikrofon. Aktivierst du im Targets-Tab "Voice Start",
          hört die App beim Start kurz mit, um auf das gesprochene "Shooter Ready" zu warten -
          danach wird das Mikrofon sofort wieder deaktiviert und die App antwortet per
          Sprachausgabe mit "Standby". Die Spracherkennung läuft über die entsprechende Funktion
          deines Browsers bzw. Betriebssystems; je nach Gerät kann diese Verarbeitung dabei über
          einen Online-Dienst des jeweiligen Anbieters (z. B. Google bei Chrome) erfolgen. Wir
          selbst speichern oder übertragen dabei nichts an eigene Server. Die Berechtigung wird
          nur abgefragt, wenn du Voice Start aktivierst und Start drückst.
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
