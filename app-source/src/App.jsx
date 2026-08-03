import { useState } from "react";
import { useShotTimer } from "./useShotTimer";

const APP_VERSION = "1.0.0";

const TOPO_BG_URL = new URL("topo-bg.png", document.baseURI).toString();

function fmt(ms) {
  return (ms / 1000).toFixed(2);
}

function Toggle({ on, onClick }) {
  return <button className={`toggle ${on ? "on" : ""}`} onClick={onClick} />;
}

export default function App() {
  const t = useShotTimer();
  const [tab, setTab] = useState("timer"); // timer | settings | history | about
  const [menuOpen, setMenuOpen] = useState(false);

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
    <div className="app">
      <div className="topo-bg-layer" style={{ backgroundImage: `url(${TOPO_BG_URL})` }} />
      <div className="header">
        <div className="header-brand">
          <img src="./icons/logo-header.png" alt="" className="header-logo" />
          <h1>FORT Timer</h1>
        </div>
        <div className="menu-wrap">
          <button
            className={`icon-btn burger-btn ${menuOpen ? "open" : ""}`}
            aria-label="Menü"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
          {menuOpen && (
            <>
              <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="menu-dropdown">
                <button
                  className="menu-item"
                  onClick={() => {
                    setTab("settings");
                    setMenuOpen(false);
                  }}
                >
                  Einstellungen
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setTab("about");
                    setMenuOpen(false);
                  }}
                >
                  About
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {t.micError && <div className="mic-warning">{t.micError}</div>}

      {tab === "settings" ? (
        <SettingsPanel t={t} onBack={() => setTab("timer")} />
      ) : tab === "history" ? (
        <HistoryPanel t={t} onBack={() => setTab("timer")} />
      ) : tab === "about" ? (
        <AboutPanel onBack={() => setTab("timer")} />
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
                <div
                  key={r.idx}
                  className={`split-row ${r.kind === "draw" ? "is-draw" : ""}`}
                  onClick={() => t.toggleEventKind(r.idx)}
                >
                  <span className="idx">{r.kind === "draw" ? "Zug" : r.label}</span>
                  <span className="abs-val">{fmt(r.abs)}</span>
                  <span className="split-val">{r.split == null ? "antippen" : `+${fmt(r.split)}`}</span>
                </div>
              ))
            )}
          </div>
          {t.splitsView.length > 0 && (
            <div className="splits-hint">Antippen um Zug/Schuss umzuschalten</div>
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

      <Footer />
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
  return (
    <div className="waveform-panel">
      {waveform.length === 0 ? (
        <div className="waveform-empty">
          {active ? "Höre auf Audio..." : "Audio-Anzeige erscheint während des Laufs"}
        </div>
      ) : (
        <div className="waveform-bars">
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

function SettingsPanel({ t, onBack }) {
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

      <button className="main-btn start" onClick={onBack}>
        Fertig
      </button>
    </>
  );
}

function AboutPanel({ onBack }) {
  return (
    <>
      <div className="panel about-panel">
        <h2 className="about-lede">Progress doesn't happen by accident.</h2>
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

      <button className="main-btn start" onClick={onBack}>
        Done
      </button>
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
