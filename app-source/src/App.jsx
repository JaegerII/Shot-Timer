import { useState } from "react";
import { useShotTimer } from "./useShotTimer";
import { useTargetsTimer } from "./useTargetsTimer";

const APP_VERSION = "1.5.0";

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
  const [tab, setTab] = useState("timer"); // timer | targets | settings

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
function TargetGraphic({ type }) {
  if (type === "steel") {
    return (
      <svg viewBox="0 0 200 200" className="target-svg" preserveAspectRatio="xMidYMid meet">
        <circle cx="100" cy="100" r="82" className="target-steel-plate" />
        <circle cx="100" cy="100" r="82" className="target-steel-rim" />
      </svg>
    );
  }

  if (type === "ipsc") {
    // Classic IPSC target with nested D/C/A zones. Proportioned to the
    // official full-size metric target's roughly 450 x 750mm silhouette
    // (narrower "shoulders" up top, wider through the middle, tapered
    // base) rather than a symmetric octagon - not a certified scoring
    // template, but closer to the real target's proportions.
    return (
      <svg viewBox="0 0 180 300" className="target-svg" preserveAspectRatio="xMidYMid meet">
        <path d="M65 10 L115 10 L165 70 L165 230 L125 290 L55 290 L15 230 L15 70 Z" className="target-fill" />
        <path d="M72 55 L108 55 L145 95 L145 205 L115 255 L65 255 L35 205 L35 95 Z" className="target-line" />
        <path d="M78 80 L102 80 L128 115 L128 170 L90 205 L52 170 L52 115 Z" className="target-line" />
        <text x="25" y="155" className="target-zone-label">D</text>
        <text x="44" y="155" className="target-zone-label">C</text>
        <text x="90" y="155" className="target-zone-label">A</text>
        <text x="136" y="155" className="target-zone-label">C</text>
        <text x="155" y="155" className="target-zone-label">D</text>
      </svg>
    );
  }

  // USPSA - classic humanoid-style silhouette, visually distinct from the
  // IPSC octagon/zone target above.
  return (
    <svg viewBox="0 0 200 320" className="target-svg" preserveAspectRatio="xMidYMid meet">
      <path d="M60 300 L60 150 Q60 90 100 90 Q140 90 140 150 L140 300 Z" className="target-fill" />
      <circle cx="100" cy="55" r="38" className="target-fill" />
      <ellipse cx="100" cy="150" rx="28" ry="46" className="target-line" />
    </svg>
  );
}

// Range Officer simulation: pick a target type, optionally turn on Voice
// Start (you say "Shooter Ready", the app answers "Standby" out loud, then
// the random delay + beep starts) - otherwise Start behaves just like the
// Dry Fire timer. The target itself is shown full-size for sight-picture
// practice, with the timer reduced to a slim status bar.
function TargetsPanel({ t }) {
  const s = t.settings;
  const running = t.phase !== "idle" && t.phase !== "done";

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

      <div className="target-frame">
        <TargetGraphic type={s.targetType} />
      </div>

      {running ? (
        <button className="main-btn stop" onClick={t.stop}>
          Stop
        </button>
      ) : (
        <button className="main-btn start" onClick={t.start}>
          Start
        </button>
      )}

      <div className="row-btns">
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
