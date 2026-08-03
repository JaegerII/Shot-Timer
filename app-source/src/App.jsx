import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runSummary, useShotTimer } from "./useShotTimer";
import { useAuth } from "./useAuth";
import { supabase } from "./supabaseClient";

const APP_VERSION = "1.0.0";

const TOPO_BG_URL = new URL("topo-bg.png", document.baseURI).toString();

function fmt(ms) {
  return (ms / 1000).toFixed(2);
}

function Toggle({ on, onClick }) {
  return <button className={`toggle ${on ? "on" : ""}`} onClick={onClick} />;
}

export default function App() {
  const auth = useAuth();
  const userIdRef = useRef(auth.user?.id ?? null);
  useEffect(() => {
    userIdRef.current = auth.user?.id ?? null;
  }, [auth.user]);

  // Only the draw + first-shot time get synced - everything after that
  // (re-holstering, follow-up shots) would only skew the trend.
  const syncRunToSupabase = useCallback(async (entry) => {
    const userId = userIdRef.current;
    if (!userId) return;
    const summary = runSummary(entry.shots);
    if (summary.firstShotMs == null) return; // nothing usable to log
    try {
      await supabase.from("training_runs").insert({
        user_id: userId,
        run_at: entry.date,
        draw_ms: summary.drawMs,
        first_shot_ms: summary.firstShotMs,
        draw_to_shot_ms: summary.drawToShotMs,
        shot_count: summary.shotCount,
        raw_shots: entry.shots,
      });
    } catch (err) {
      console.warn("Supabase sync failed:", err);
    }
  }, []);

  const t = useShotTimer({ onCommit: syncRunToSupabase });
  const [tab, setTab] = useState("timer"); // timer | dashboard | account | settings | history | about

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
        <div className="header-brand">
          <img src="./icons/logo-header.png" alt="" className="header-logo" />
          <h1>FORT Timer</h1>
        </div>
      </div>

      {t.micError && <div className="mic-warning">{t.micError}</div>}

      <div className="tab-content">
      {tab === "settings" ? (
        <SettingsPanel t={t} />
      ) : tab === "history" ? (
        <HistoryPanel t={t} onBack={() => setTab("timer")} />
      ) : tab === "account" ? (
        <AccountPanel auth={auth} />
      ) : tab === "dashboard" ? (
        <DashboardPanel
          auth={auth}
          localHistory={t.history}
          onAccount={() => setTab("account")}
        />
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
    { key: "account", label: "Konto", icon: IconAccount },
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

function IconAccount() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.6-4 5-6 8-6s6.4 2 8 6" />
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

function SettingsPanel({ t }) {
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

function AboutPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel about-panel">
      <button className="about-toggle" onClick={() => setOpen((v) => !v)}>
        <span>About FORT Shot Timer</span>
        <svg
          className={`about-chevron ${open ? "open" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
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
      )}
    </div>
  );
}

function AccountPanel({ auth }) {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gear, setGear] = useState([]);
  const [gearLoading, setGearLoading] = useState(false);
  const [newGearName, setNewGearName] = useState("");

  useEffect(() => {
    if (!auth.user) return;
    setGearLoading(true);
    supabase
      .from("gear")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error) setGear(data || []);
        setGearLoading(false);
      });
  }, [auth.user]);

  const addGear = async () => {
    const name = newGearName.trim();
    if (!name || !auth.user) return;
    const { data, error } = await supabase
      .from("gear")
      .insert({ user_id: auth.user.id, name })
      .select()
      .single();
    if (!error && data) {
      setGear((prev) => [data, ...prev]);
      setNewGearName("");
    }
  };

  const deleteGear = async (id) => {
    setGear((prev) => prev.filter((g) => g.id !== id));
    await supabase.from("gear").delete().eq("id", id);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email || !password) {
      setError("Bitte E-Mail und Passwort eingeben.");
      return;
    }
    setBusy(true);
    const fn = mode === "signup" ? auth.signUp : auth.signIn;
    const errMsg = await fn(email, password);
    setBusy(false);
    if (errMsg) {
      setError(errMsg);
    } else if (mode === "signup") {
      setInfo("Fast geschafft - bitte bestätige deine E-Mail-Adresse über den Link, den wir dir geschickt haben.");
    }
  };

  if (auth.authLoading) {
    return (
      <div className="panel">
        <span className="field-hint">Lädt...</span>
      </div>
    );
  }

  if (!auth.user) {
    return (
      <>
        <div className="panel">
          <h2>{mode === "signup" ? "Konto erstellen" : "Anmelden"}</h2>

          <div className="oauth-row">
            <button className="oauth-btn" onClick={() => auth.signInWithGoogle()}>
              <IconGoogle />
              Mit Google
            </button>
            <button className="oauth-btn" onClick={() => auth.signInWithApple()}>
              <IconApple />
              Mit Apple
            </button>
          </div>
          <div className="oauth-divider">
            <span>oder mit E-Mail</span>
          </div>

          <form onSubmit={submit}>
            <div className="field">
              <div className="field-label">
                <span>E-Mail</span>
              </div>
              <input
                className="text-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="field">
              <div className="field-label">
                <span>Passwort</span>
              </div>
              <input
                className="text-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </div>
            {error && <div className="field-hint account-error">{error}</div>}
            {info && <div className="field-hint">{info}</div>}
            <button className="main-btn start" type="submit" disabled={busy} style={{ marginTop: 14 }}>
              {busy ? "..." : mode === "signup" ? "Konto erstellen" : "Anmelden"}
            </button>
          </form>
          <button
            className="link-row account-switch"
            onClick={() => {
              setMode(mode === "signup" ? "signin" : "signup");
              setError(null);
              setInfo(null);
            }}
          >
            {mode === "signup" ? "Schon ein Konto? Anmelden" : "Noch kein Konto? Registrieren"}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="panel">
        <h2>Konto</h2>
        <p className="account-email">{auth.user.email}</p>
        <button className="sec-btn" onClick={auth.signOut}>
          Abmelden
        </button>
      </div>

      <div className="panel">
        <h2>Equipment</h2>
        <div className="field-hint" style={{ marginBottom: 12 }}>
          Dein Trainingstagebuch - trage ein, mit welcher Ausrüstung du übst.
        </div>
        {gearLoading ? (
          <span className="field-hint">Lädt...</span>
        ) : gear.length === 0 ? (
          <span className="field-hint">Noch kein Equipment eingetragen.</span>
        ) : (
          <div className="gear-list">
            {gear.map((g) => (
              <div className="gear-row" key={g.id}>
                <span>{g.name}</span>
                <button className="icon-btn gear-del" onClick={() => deleteGear(g.id)} aria-label="Löschen">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="gear-add-row">
          <input
            className="text-input"
            placeholder="z. B. Glock 19 + Kydex IWB"
            value={newGearName}
            onChange={(e) => setNewGearName(e.target.value)}
          />
          <button className="sec-btn" onClick={addGear}>
            +
          </button>
        </div>
      </div>
    </>
  );
}

function IconGoogle() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path fill="#4285F4" d="M23.52 12.27c0-.82-.07-1.42-.22-2.05H12v3.72h6.6c-.13 1.06-.85 2.66-2.45 3.73l-.02.15 3.56 2.72.25.02c2.26-2.05 3.58-5.08 3.58-8.29Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.05 7.94-2.86l-3.78-2.9c-1.01.7-2.37 1.19-4.16 1.19-3.18 0-5.88-2.05-6.84-4.9l-.14.01-3.7 2.83-.05.13C3.25 21.3 7.28 24 12 24Z" />
      <path fill="#FBBC05" d="M5.16 14.53a7.6 7.6 0 0 1-.41-2.44c0-.85.15-1.67.4-2.44l-.01-.16-3.75-2.87-.12.06A11.97 11.97 0 0 0 0 12.09c0 1.94.47 3.77 1.27 5.4l3.89-2.96Z" />
      <path fill="#EA4335" d="M12 4.75c2.25 0 3.77.96 4.64 1.77l3.39-3.3C17.95 1.2 15.24 0 12 0 7.28 0 3.25 2.7 1.27 6.63l3.88 2.98c.97-2.85 3.67-4.86 6.85-4.86Z" />
    </svg>
  );
}

function IconApple() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M16.36 1.5c.1 1.15-.34 2.28-1.05 3.1-.73.85-1.9 1.5-3.03 1.42-.13-1.1.4-2.26 1.08-3.03.75-.86 2-1.48 3-1.49ZM19.9 17.6c-.4.94-.87 1.83-1.5 2.66-.85 1.13-1.7 2.26-3.05 2.28-1.3.03-1.72-.77-3.22-.77-1.5 0-1.97.75-3.2.8-1.3.05-2.3-1.22-3.15-2.34-1.72-2.28-3.04-6.44-1.27-9.26.88-1.4 2.44-2.29 4.13-2.32 1.28-.02 2.48.85 3.26.85.77 0 2.24-1.05 3.78-.9.64.03 2.45.26 3.62 1.94-.09.06-2.16 1.24-2.14 3.7.03 2.94 2.6 3.92 2.63 3.93Z" />
    </svg>
  );
}

function startOfWeek(dateInput) {
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

function DashboardPanel({ auth, localHistory, onAccount }) {
  const [remoteRuns, setRemoteRuns] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!auth.user) {
      setRemoteRuns(null);
      return;
    }
    setLoading(true);
    setError(null);
    supabase
      .from("training_runs")
      .select("run_at, draw_ms, first_shot_ms, draw_to_shot_ms")
      .order("run_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setRemoteRuns(data || []);
        setLoading(false);
      });
  }, [auth.user]);

  const runs = useMemo(() => {
    if (auth.user) {
      return (remoteRuns || []).map((r) => ({
        date: r.run_at,
        drawMs: r.draw_ms,
        firstShotMs: r.first_shot_ms,
        drawToShotMs: r.draw_to_shot_ms,
      }));
    }
    return localHistory
      .slice()
      .reverse()
      .map((h) => {
        const s = runSummary(h.shots);
        return { date: h.date, drawMs: s.drawMs, firstShotMs: s.firstShotMs, drawToShotMs: s.drawToShotMs };
      })
      .filter((r) => r.firstShotMs != null);
  }, [auth.user, remoteRuns, localHistory]);

  const stats = useMemo(() => {
    const withFirstShot = runs.filter((r) => r.firstShotMs != null);
    const withDrawToShot = runs.filter((r) => r.drawToShotMs != null);
    const avg = (list, key) => (list.length ? list.reduce((sum, r) => sum + r[key], 0) / list.length : null);
    return {
      count: runs.length,
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
        <h2>Auswertung</h2>
        {!auth.user && (
          <div className="field-hint" style={{ marginBottom: 12 }}>
            Nicht angemeldet - zeigt den lokalen Verlauf auf diesem Gerät.{" "}
            <button className="inline-link" onClick={onAccount}>
              Anmelden
            </button>{" "}
            für geräteübergreifende Auswertung.
          </div>
        )}
        {loading && <span className="field-hint">Lädt...</span>}
        {error && <div className="field-hint account-error">{error}</div>}
        {!loading && stats.count === 0 ? (
          <span className="field-hint">Noch keine auswertbaren Läufe (Draw + erster Schuss nötig).</span>
        ) : (
          !loading && (
            <div className="dash-stats">
              <div className="dash-stat">
                <span className="dash-stat-label">Ø Draw → 1. Schuss</span>
                <span className="dash-stat-val">
                  {stats.avgDrawToShot != null ? fmt(stats.avgDrawToShot) : "–"}
                </span>
              </div>
              <div className="dash-stat">
                <span className="dash-stat-label">Ø 1. Schuss (ab Beep)</span>
                <span className="dash-stat-val">
                  {stats.avgFirstShot != null ? fmt(stats.avgFirstShot) : "–"}
                </span>
              </div>
              <div className="dash-stat">
                <span className="dash-stat-label">Läufe</span>
                <span className="dash-stat-val">{stats.count}</span>
              </div>
            </div>
          )
        )}
      </div>

      {weekly.length > 0 && (
        <div className="panel">
          <h2>Wochen-Trend</h2>
          <WeeklyChart weeks={weekly} />
        </div>
      )}

      <AboutPanel />
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
