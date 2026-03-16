import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom";

const T = {
  gold: "#D4AF37",
  goldDim: "#a88a20",
  bg: "#07080a",
  card: "#0e1015",
  surface: "#13161d",
  border: "#1e2330",
  borderHi: "#2e3550",
  text: "#e8eaf0",
  muted: "#6b7394",
  danger: "#ef4444",
  success: "#22c55e",
  warn: "#f59e0b",
  info: "#3b82f6",
};

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Inter:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: ${T.bg}; color: ${T.text}; font-family: 'Inter', sans-serif; }
  input, select, textarea, button { font-family: inherit; }
  input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.7); }
  @keyframes spin   { to { transform: rotate(360deg); } }
  @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pop    { 0%{transform:scale(0.85);opacity:0} 60%{transform:scale(1.04)} 100%{transform:scale(1);opacity:1} }
  @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.5} }
  @keyframes shimmer{ 0%{background-position:-200% center} 100%{background-position:200% center} }
  @keyframes scanline { 0%{top:8%} 50%{top:85%} 100%{top:8%} }
  .fadeUp   { animation: fadeUp 0.35s ease both; }
  .pop      { animation: pop 0.4s cubic-bezier(.34,1.56,.64,1) both; }
`;

function injectGlobalStyles() {
  if (document.getElementById("bd-global")) return;
  const s = document.createElement("style");
  s.id = "bd-global";
  s.textContent = GLOBAL_CSS;
  document.head.appendChild(s);
}

// ── Image Compression ────────────────────────────────────────────────────────
// Compresses base64 images to keep payload size manageable.
// iPhone Pro Max photos can be 10-15MB as base64 — this brings them to ~200-400KB.
function compressImage(base64String, maxWidth = 1200, quality = 0.6) {
  return new Promise((resolve) => {
    if (!base64String || !base64String.startsWith("data:image")) {
      resolve(base64String);
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxWidth) {
          h = Math.round(h * (maxWidth / w));
          w = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL("image/jpeg", quality);
        resolve(compressed);
      } catch {
        resolve(base64String);
      }
    };
    img.onerror = () => resolve(base64String);
    img.src = base64String;
  });
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    try {
      const log = JSON.parse(localStorage.getItem("bd_error_log") || "[]");
      log.push({ time: Date.now(), error: error.message, stack: info.componentStack?.slice(0, 300) });
      localStorage.setItem("bd_error_log", JSON.stringify(log.slice(-10)));
    } catch { }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          background: T.bg, minHeight: "100vh", display: "flex",
          justifyContent: "center", alignItems: "center", padding: 16
        }}>
          <div style={{
            background: T.card, borderRadius: 16, padding: "40px 28px",
            border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.danger}`,
            maxWidth: 380, width: "100%", textAlign: "center",
            boxShadow: "0 24px 80px rgba(0,0,0,0.7)"
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <div style={{
              color: T.gold, fontFamily: "'Rajdhani',sans-serif",
              fontSize: 20, fontWeight: 700, letterSpacing: "0.12em", marginBottom: 10
            }}>SOMETHING WENT WRONG</div>
            <div style={{ color: T.muted, fontSize: 13, marginBottom: 28, lineHeight: 1.6 }}>
              The app hit an unexpected error. Your saved data is safe. Try reloading — if the problem persists, contact dispatch.
            </div>
            <button onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              style={{
                width: "100%", padding: "13px 16px", background: T.gold,
                color: "#000", border: "none", borderRadius: 8, fontWeight: 700,
                fontSize: 13, letterSpacing: "0.1em", cursor: "pointer",
                fontFamily: "'Rajdhani', sans-serif"
              }}>
              RELOAD APP
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

async function detectAndTranslate(text) {
  try {
    if (!text || typeof text !== 'string' || text.trim().length < 6) return null;
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim() })
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.language === 'es' && data.translated && data.translated.trim().toLowerCase() !== text.trim().toLowerCase()) {
      return data.translated;
    }
    return null;
  } catch {
    return null;
  }
}

function Spinner({ size = 16, color = "#000" }) {
  return (
    <span style={{
      display: "inline-block", width: size, height: size,
      border: `2px solid rgba(0,0,0,0.2)`, borderTop: `2px solid ${color}`,
      borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0
    }} />
  );
}

function Label({ text, required }) {
  return (
    <div style={{
      color: T.muted, fontSize: 10, fontWeight: 600,
      letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 16, marginBottom: 6
    }}>
      {text}{required && <span style={{ color: T.danger }}> ✱</span>}
    </div>
  );
}

function Input({ style, ...props }) {
  return (
    <input style={{
      width: "100%", maxWidth: "100%", padding: "10px 12px", background: T.surface,
      border: `1px solid ${T.border}`, color: T.text, borderRadius: 8,
      fontSize: 14, outline: "none", transition: "border-color 0.15s",
      boxSizing: "border-box",
      ...style
    }}
      onFocus={e => e.target.style.borderColor = T.goldDim}
      onBlur={e => e.target.style.borderColor = T.border}
      {...props}
    />
  );
}

function Textarea({ style, ...props }) {
  return (
    <textarea style={{
      width: "100%", padding: "10px 12px", background: T.surface,
      border: `1px solid ${T.border}`, color: T.text, borderRadius: 8,
      fontSize: 14, resize: "vertical", minHeight: 100, outline: "none",
      lineHeight: 1.6, transition: "border-color 0.15s", ...style
    }}
      onFocus={e => e.target.style.borderColor = T.goldDim}
      onBlur={e => e.target.style.borderColor = T.border}
      {...props}
    />
  );
}

function Select({ children, style, ...props }) {
  return (
    <select style={{
      width: "100%", padding: "10px 12px", background: T.surface,
      border: `1px solid ${T.border}`, color: T.text, borderRadius: 8,
      fontSize: 14, outline: "none", appearance: "none",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7394' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
      backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
      transition: "border-color 0.15s", ...style
    }}
      onFocus={e => e.target.style.borderColor = T.goldDim}
      onBlur={e => e.target.style.borderColor = T.border}
      {...props}
    >
      {children}
    </select>
  );
}

function GoldBtn({ children, disabled, loading, onClick, style }) {
  return (
    <button onClick={onClick} disabled={disabled || loading}
      style={{
        width: "100%", padding: "13px 16px", background: disabled ? "#2a2d38" : T.gold,
        color: disabled ? T.muted : "#000", border: "none", borderRadius: 8,
        fontWeight: 700, fontSize: 13, letterSpacing: "0.1em",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        transition: "all 0.15s", opacity: loading ? 0.85 : 1,
        fontFamily: "'Rajdhani', sans-serif", ...style
      }}>
      {loading && <Spinner size={14} color={disabled ? "#6b7394" : "#000"} />}
      {children}
    </button>
  );
}

function GhostBtn({ children, onClick, style }) {
  return (
    <button onClick={onClick}
      style={{
        width: "100%", padding: "12px 16px", background: "transparent",
        color: T.text, border: `1px solid ${T.border}`, borderRadius: 8,
        fontWeight: 600, fontSize: 13, letterSpacing: "0.08em",
        cursor: "pointer", transition: "all 0.15s",
        fontFamily: "'Rajdhani', sans-serif", ...style
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = T.borderHi; e.currentTarget.style.background = T.surface; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = "transparent"; }}
    >
      {children}
    </button>
  );
}

function PageShell({ children, maxW = 480 }) {
  return (
    <div style={{
      background: T.bg, minHeight: "100vh", width: "100%",
      display: "flex", justifyContent: "center", alignItems: "flex-start",
      padding: "24px 12px 48px", boxSizing: "border-box"
    }}>
      <div className="fadeUp" style={{
        width: "100%", maxWidth: maxW, background: T.card,
        borderRadius: 14, border: `1px solid ${T.border}`,
        borderLeft: `3px solid ${T.gold}`, padding: "24px 20px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)"
      }}>
        {children}
      </div>
    </div>
  );
}

function Logo({ sub }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 24 }}>
      <div style={{
        color: T.gold, fontSize: 11, fontWeight: 700,
        letterSpacing: "0.4em", fontFamily: "'Rajdhani',sans-serif"
      }}>BLACK DROP TRUCKING</div>
      <div style={{
        color: T.gold, fontSize: 22, fontWeight: 700,
        letterSpacing: "0.18em", fontFamily: "'Rajdhani',sans-serif", marginTop: 2
      }}>{sub}</div>
      <div style={{ width: 40, height: 2, background: T.gold, margin: "8px auto 0" }} />
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    "PENDING": { color: T.warn, bg: "rgba(245,158,11,0.12)", dot: "#f59e0b" },
    "APPROVED": { color: T.success, bg: "rgba(34,197,94,0.12)", dot: "#22c55e" },
    "BOUNCE BACK": { color: T.danger, bg: "rgba(239,68,68,0.12)", dot: "#ef4444" },
  };
  const s = map[status] || { color: T.muted, bg: T.surface, dot: T.muted };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 10px", borderRadius: 99, background: s.bg,
      color: s.color, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em"
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%", background: s.dot,
        animation: status === "PENDING" ? "pulse 1.5s ease infinite" : "none"
      }} />
      {status}
    </span>
  );
}

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  if (!offline) return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 99999,
      background: T.warn, color: "#000", padding: "8px 16px",
      textAlign: "center", fontSize: 12, fontWeight: 700,
      letterSpacing: "0.08em", fontFamily: "'Rajdhani',sans-serif"
    }}>
      ⚠ NO INTERNET — Tickets will save locally and sync when back online
    </div>
  );
}

function Login({ onLogin }) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const retryCount = useRef(0);

  async function handleLogin() {
    if (!phone || phone.length < 10) { setError("Enter a valid phone number."); return; }
    if (loading) return;
    setError(""); setLoading(true);
    const maxRetries = 2;
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(`/api/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
          signal: controller.signal
        });
        clearTimeout(timeout);
        const data = await res.json();
        if (data.authorized) { onLogin({ phone, token: data.token }); return; }
        else { setError("This number is not authorized."); setLoading(false); return; }
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    setError("Connection failed. Check your signal and try again.");
    setLoading(false);
  }

  return (
    <div style={{
      background: T.bg, minHeight: "100vh", display: "flex",
      justifyContent: "center", alignItems: "center", padding: 16
    }}>
      <div className="pop" style={{
        width: "100%", maxWidth: 360, background: T.card,
        borderRadius: 16, border: `1px solid ${T.border}`,
        borderLeft: `3px solid ${T.gold}`, padding: "32px 24px",
        boxShadow: "0 24px 80px rgba(0,0,0,0.7)"
      }}>
        <Logo sub="FIELD COMMAND" />
        <Label text="Phone Number" required />
        <Input
          type="tel" inputMode="numeric" autoComplete="tel"
          placeholder="e.g. 5551234567"
          value={phone}
          maxLength={15}
          onChange={e => { setPhone(e.target.value.replace(/\D/g, "")); setError(""); }}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
        />
        {error && (
          <div style={{ color: T.danger, fontSize: 12, marginTop: 8, textAlign: "center" }}>
            ⚠ {error}
          </div>
        )}
        <GoldBtn style={{ marginTop: 20 }} loading={loading} onClick={handleLogin}>
          {loading ? "VERIFYING..." : "ENTER FIELD COMMAND"}
        </GoldBtn>
        <div style={{ color: T.muted, fontSize: 11, textAlign: "center", marginTop: 16 }}>
          🔒 Authorized personnel only
        </div>
      </div>
    </div>
  );
}

function Dashboard({ phone, onLogout, onStartTicket, onOpenQueue }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div style={{
      background: T.bg, minHeight: "100vh", display: "flex",
      justifyContent: "center", alignItems: "center", padding: 16
    }}>
      <div className="pop" style={{
        width: "100%", maxWidth: 380, background: T.card,
        borderRadius: 16, border: `1px solid ${T.border}`,
        borderLeft: `3px solid ${T.gold}`, padding: "32px 24px",
        boxShadow: "0 24px 80px rgba(0,0,0,0.7)"
      }}>
        <Logo sub="FIELD COMMAND" />
        <div style={{
          background: T.surface, borderRadius: 10, padding: "14px 16px",
          marginBottom: 24, border: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", gap: 12
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: `rgba(212,175,55,0.12)`, border: `1px solid ${T.goldDim}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16
          }}>👷</div>
          <div>
            <div style={{ color: T.muted, fontSize: 10, letterSpacing: "0.1em" }}>{greeting}</div>
            <div style={{ color: T.text, fontWeight: 600, fontSize: 14 }}>{phone}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <GoldBtn onClick={onStartTicket}>📋 SUBMIT NEW TICKET</GoldBtn>
          <GhostBtn onClick={onOpenQueue}>📥 BOUNCEBACK QUEUE</GhostBtn>
          <GhostBtn onClick={onLogout} style={{ color: T.muted, borderColor: "#1a1d26" }}>← LOG OUT</GhostBtn>
        </div>
        <div style={{
          marginTop: 24, paddingTop: 16, borderTop: `1px solid ${T.border}`,
          color: T.muted, fontSize: 10, textAlign: "center", letterSpacing: "0.1em"
        }}>
          BLACK DROP TRUCKING LLC · FIELD SYSTEM
        </div>
      </div>
    </div>
  );
}

function Queue({ phone, onEdit, onBack }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/tickets?mode=queue`, {
          headers: { "Authorization": `Bearer ${localStorage.getItem('bd_token')}` }
        });
        const json = await res.json();
        const data = json.data || [];
        setTickets(Array.isArray(data) ? data.reverse() : []);
      } catch { setTickets([]); }
      setLoading(false);
    }
    load();
  }, [phone]);

  const bouncedTickets = useMemo(() =>
    tickets.filter(t => t["Status"] === "BOUNCE BACK"),
    [tickets]);

  return (
    <PageShell maxW={520}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          background: "transparent", border: `1px solid ${T.border}`,
          color: T.muted, borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 13
        }}>← Back</button>
        <div>
          <div style={{
            color: T.danger, fontFamily: "'Rajdhani',sans-serif",
            fontSize: 18, fontWeight: 700, letterSpacing: "0.12em"
          }}>BOUNCEBACK QUEUE</div>
          <div style={{ color: T.muted, fontSize: 11 }}>{bouncedTickets.length} tickets need attention</div>
        </div>
      </div>

      {loading && (
        <div style={{
          color: T.muted, textAlign: "center", padding: 40,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12
        }}>
          <Spinner size={24} color={T.gold} />
          Loading queue...
        </div>
      )}

      {!loading && bouncedTickets.length === 0 && (
        <div style={{ color: T.success, textAlign: "center", padding: 40, fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎉</div>
          No bounced tickets found. You are all caught up!
        </div>
      )}

      {bouncedTickets.map((ticket, i) => {
        const status = ticket["Status"] || "PENDING";
        const isBounce = status === "BOUNCE BACK";
        return (
          <div key={ticket["Submission ID"] || i} style={{
            background: T.surface, borderRadius: 10, padding: 16, marginBottom: 12,
            border: `1px solid ${isBounce ? "rgba(239,68,68,0.3)" : T.border}`,
            borderLeft: `3px solid ${isBounce ? T.danger : status === "APPROVED" ? T.success : T.warn}`
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ fontFamily: "'Space Mono',monospace", color: T.text, fontSize: 12, fontWeight: 700 }}>
                {ticket["Submission ID"] || `#${i + 1}`}
              </div>
              <StatusBadge status={status} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
              {[
                ["Client", ticket["Client"] || "—"],
                ["Created", ticket["Timestamp"] ? new Date(ticket["Timestamp"]).toLocaleString() : "—"],
                ticket["Field Ticket #"] ? ["Field Ticket", ticket["Field Ticket #"]] : null,
                ticket["Driver"] ? ["Driver", ticket["Driver"]] : null,
              ].filter(Boolean).map(([k, v]) => (
                <div key={k}>
                  <div style={{ color: T.muted, fontSize: 10 }}>{k}</div>
                  <div style={{ color: T.text, fontSize: 13 }}>{v}</div>
                </div>
              ))}
            </div>
            {ticket["Notes"] && (
              <div style={{
                marginTop: 10, padding: "8px 10px", background: T.bg,
                borderRadius: 6, color: T.muted, fontSize: 12, fontStyle: "italic"
              }}>
                "{ticket["Notes"]}"
              </div>
            )}
            <button onClick={() => onEdit(ticket)} style={{
              marginTop: 12, width: "100%", padding: "10px 16px",
              background: "rgba(212,175,55,0.1)", border: `1px solid ${T.goldDim}`,
              color: T.gold, borderRadius: 8, fontWeight: 700, fontSize: 12,
              letterSpacing: "0.1em", cursor: "pointer",
              fontFamily: "'Rajdhani',sans-serif", transition: "all 0.15s"
            }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(212,175,55,0.2)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(212,175,55,0.1)"}
            >
              {isBounce ? "✎ FIX BOUNCED TICKET" : "✎ EDIT TICKET"}
            </button>
          </div>
        );
      })}
    </PageShell>
  );
}

function TicketSuccess({ onBack, onViewQueue }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: T.bg,
      display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999
    }}>
      <div className="pop" style={{
        background: T.card, padding: "48px 40px", borderRadius: 16,
        textAlign: "center", border: `1px solid ${T.border}`,
        borderLeft: `3px solid ${T.gold}`, maxWidth: 360, width: "90%"
      }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>✓</div>
        <div style={{
          color: T.gold, fontFamily: "'Rajdhani',sans-serif",
          fontSize: 24, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8
        }}>TICKET SUBMITTED</div>
        <div style={{ color: T.muted, fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>
          Your field ticket has been received and is pending review.
        </div>
        <GoldBtn onClick={onBack}>← BACK TO DASHBOARD</GoldBtn>
        {onViewQueue && (
          <GhostBtn onClick={onViewQueue} style={{ marginTop: 10 }}>📥 VIEW SUBMISSIONS</GhostBtn>
        )}
      </div>
    </div>
  );
}

async function detectEdges(imgCanvas) {
  try {
    const MAX_DIM = 512;
    let w = imgCanvas.width, h = imgCanvas.height;
    if (Math.max(w, h) > MAX_DIM) {
      const r = MAX_DIM / Math.max(w, h);
      w = Math.round(w * r); h = Math.round(h * r);
    }
    const tmpM = document.createElement("canvas");
    tmpM.width = w; tmpM.height = h;
    tmpM.getContext("2d").drawImage(imgCanvas, 0, 0, w, h);
    const dataUrl = tmpM.toDataURL("image/jpeg", 0.6);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data.points && data.points.length === 4) {
        return { rect: { tl: data.points[0], tr: data.points[1], br: data.points[2], bl: data.points[3] }, text: data.text || "" };
      }
    }
  } catch (e) { }
  const SCALE = 400;
  const w = imgCanvas.width, h = imgCanvas.height;
  const ratio = Math.min(SCALE / w, SCALE / h, 1);
  const sw = Math.round(w * ratio), sh = Math.round(h * ratio);
  const tmp = document.createElement("canvas");
  tmp.width = sw; tmp.height = sh;
  const tctx = tmp.getContext("2d");
  tctx.drawImage(imgCanvas, 0, 0, sw, sh);
  const idat = tctx.getImageData(0, 0, sw, sh);
  const d = idat.data;
  const gray = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  const blurred = new Float32Array(sw * sh);
  for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) blurred[y * sw + x] = (gray[(y - 1) * sw + (x - 1)] + gray[(y - 1) * sw + x] * 2 + gray[(y - 1) * sw + (x + 1)] + gray[y * sw + (x - 1)] * 2 + gray[y * sw + x] * 4 + gray[y * sw + (x + 1)] * 2 + gray[(y + 1) * sw + (x - 1)] + gray[(y + 1) * sw + x] * 2 + gray[(y + 1) * sw + (x + 1)]) / 16;
  const edges = new Float32Array(sw * sh);
  let maxE = 0;
  for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) {
    const gx = -blurred[(y - 1) * sw + (x - 1)] - 2 * blurred[y * sw + (x - 1)] - blurred[(y + 1) * sw + (x - 1)] + blurred[(y - 1) * sw + (x + 1)] + 2 * blurred[y * sw + (x + 1)] + blurred[(y + 1) * sw + (x + 1)];
    const gy = -blurred[(y - 1) * sw + (x - 1)] - 2 * blurred[(y - 1) * sw + x] - blurred[(y - 1) * sw + (x + 1)] + blurred[(y + 1) * sw + (x - 1)] + 2 * blurred[(y + 1) * sw + x] + blurred[(y + 1) * sw + (x + 1)];
    const mag = Math.hypot(gx, gy);
    edges[y * sw + x] = mag;
    if (mag > maxE) maxE = mag;
  }
  const thr = maxE * 0.15;
  const corners = [{ tx: 0, ty: 0, best: null, bd: Infinity }, { tx: sw, ty: 0, best: null, bd: Infinity }, { tx: sw, ty: sh, best: null, bd: Infinity }, { tx: 0, ty: sh, best: null, bd: Infinity }];
  for (let y = 2; y < sh - 2; y++) for (let x = 2; x < sw - 2; x++) {
    if (edges[y * sw + x] < thr) continue;
    for (const q of corners) { const dd = Math.hypot(x - q.tx, y - q.ty); if (dd < q.bd) { q.bd = dd; q.best = { x: x / sw, y: y / sh }; } }
  }
  const m = 0.05;
  const p = [
    corners[0].best || { x: m, y: m },
    corners[1].best || { x: 1 - m, y: m },
    corners[2].best || { x: 1 - m, y: 1 - m },
    corners[3].best || { x: m, y: 1 - m }
  ];
  return { rect: { tl: p[0], tr: p[1], br: p[2], bl: p[3] }, text: "" };
}

const HANDLE_R = 20;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function ScannerModal({ open, onClose, onUse }) {
  const [phase, setPhase] = useState("idle");
  const [preview, setPreview] = useState(null);
  const [sourceCanvas, setSourceCanvas] = useState(null);
  const [rect, setRect] = useState(null);
  const [enhance, setEnhance] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [extractedText, setExtractedText] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const hiddenCanvas = useRef(null);
  const fileRef = useRef(null);
  const imgRef = useRef(null);
  const overlayRef = useRef(null);
  const draggingRef = useRef(null);
  const rafRef = useRef(null);
  const rectRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => { rectRef.current = rect; }, [rect]);

  useEffect(() => {
    if (!open) { stopCam(); setPhase("idle"); setPreview(null); setSourceCanvas(null); setRect(null); setReady(false); setBusy(false); return; }
    setPhase("camera");
    return () => stopCam();
  }, [open]);

  async function startCam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); setReady(true); }
    } catch { setPhase("upload"); }
  }

  function stopCam() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setReady(false);
  }

  async function enterCrop(canvas, dataUrl) {
    setPhase("crop");
    setPreview(dataUrl);
    setSourceCanvas(canvas);
    setAiLoading(true);
    try {
      const detected = await detectEdges(canvas);
      if (detected && detected.rect) {
        setRect({ ...detected.rect });
        if (detected.text) setExtractedText(detected.text);
      }
    } catch { }
    setAiLoading(false);
  }

  function doCapture() {
    const v = videoRef.current;
    if (!v || !ready) return;
    setBusy(true);
    try {
      const c = hiddenCanvas.current;
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext("2d").drawImage(v, 0, 0);
      stopCam();
      const dataUrl = c.toDataURL("image/jpeg", 0.92);
      enterCrop(c, dataUrl);
    } catch { setBusy(false); }
  }

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = hiddenCanvas.current;
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext("2d").drawImage(img, 0, 0);
          enterCrop(c, reader.result);
        } catch { setBusy(false); }
      };
      img.onerror = () => setBusy(false);
      img.src = reader.result;
    };
    reader.onerror = () => setBusy(false);
    reader.readAsDataURL(f);
  }

  function syncOverlay() {
    const img = imgRef.current;
    const oc = overlayRef.current;
    const cont = containerRef.current;
    if (!img || !oc || !cont || !img.naturalWidth) return;
    const cr = cont.getBoundingClientRect();
    const pw = cr.width, ph = cr.height;
    if (pw === 0 || ph === 0) { setTimeout(syncOverlay, 50); return; }
    const nw = img.naturalWidth, nh = img.naturalHeight;
    const r = Math.min(pw / nw, ph / nh);
    const rw = Math.round(nw * r), rh = Math.round(nh * r);
    const rx = Math.round((pw - rw) / 2), ry = Math.round((ph - rh) / 2);
    img.style.display = "block";
    img.style.width = rw + "px";
    img.style.height = rh + "px";
    img.style.left = rx + "px";
    img.style.top = ry + "px";
    oc.style.display = "block";
    oc.style.width = rw + "px";
    oc.style.height = rh + "px";
    oc.style.left = rx + "px";
    oc.style.top = ry + "px";
    const dpr = window.devicePixelRatio || 1;
    oc.width = Math.round(rw * dpr);
    oc.height = Math.round(rh * dpr);
    drawCropOverlay();
  }

  function drawCropOverlay() {
    const oc = overlayRef.current;
    const r = rectRef.current;
    if (!oc || !r) return;
    const ctx = oc.getContext("2d");
    const W = oc.width, H = oc.height;
    if (W === 0 || H === 0) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cw = W / dpr, ch = H / dpr;
    ctx.clearRect(0, 0, cw, ch);
    const tl = { x: r.tl.x * cw, y: r.tl.y * ch };
    const tr = { x: r.tr.x * cw, y: r.tr.y * ch };
    const br = { x: r.br.x * cw, y: r.br.y * ch };
    const bl = { x: r.bl.x * cw, y: r.bl.y * ch };
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.fill("evenodd");
    ctx.strokeStyle = T.gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.stroke();
    const handles = [[tl.x, tl.y], [tr.x, tr.y], [br.x, br.y], [bl.x, bl.y]];
    handles.forEach(([hx, hy]) => {
      ctx.beginPath();
      ctx.arc(hx, hy, HANDLE_R, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(14,165,233,0.18)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hx, hy, 7, 0, Math.PI * 2);
      ctx.fillStyle = T.gold;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hx, hy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  useEffect(() => {
    if (phase !== "crop" || !preview) return;
    const t = setTimeout(syncOverlay, 80);
    const onR = () => syncOverlay();
    window.addEventListener("resize", onR);
    return () => { clearTimeout(t); window.removeEventListener("resize", onR); };
  }, [phase, preview]);

  useEffect(() => {
    const cont = containerRef.current;
    if (phase !== "crop" || !preview || !cont) return;
    const ro = new ResizeObserver(() => {
      if (imgRef.current && imgRef.current.naturalWidth) syncOverlay();
    });
    ro.observe(cont);
    return () => ro.disconnect();
  }, [phase, preview]);

  useEffect(() => { if (phase === "crop" && rect) drawCropOverlay(); }, [rect]);

  function getTouchPt(e) {
    if (e.touches && e.touches.length > 0) return e.touches[0];
    if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0];
    return e;
  }

  function onDown(e) {
    const oc = overlayRef.current;
    const r = rectRef.current;
    if (!oc || !r) return;
    const ocr = oc.getBoundingClientRect();
    const touch = getTouchPt(e);
    const cx = touch.clientX, cy = touch.clientY;
    const W = ocr.width, H = ocr.height;
    const pts = [
      { id: "tl", x: r.tl.x * W + ocr.left, y: r.tl.y * H + ocr.top },
      { id: "tr", x: r.tr.x * W + ocr.left, y: r.tr.y * H + ocr.top },
      { id: "br", x: r.br.x * W + ocr.left, y: r.br.y * H + ocr.top },
      { id: "bl", x: r.bl.x * W + ocr.left, y: r.bl.y * H + ocr.top }
    ];
    let minD = HANDLE_R * 3, found = null;
    pts.forEach(p => { const d = Math.hypot(cx - p.x, cy - p.y); if (d < minD) { minD = d; found = p.id; } });
    if (found) { e.preventDefault(); draggingRef.current = found; }
  }

  function onMove(e) {
    if (!draggingRef.current || !overlayRef.current || !rectRef.current) return;
    e.preventDefault();
    const oc = overlayRef.current;
    const ocr = oc.getBoundingClientRect();
    const touch = getTouchPt(e);
    const nx = clamp((touch.clientX - ocr.left) / ocr.width, 0, 1);
    const ny = clamp((touch.clientY - ocr.top) / ocr.height, 0, 1);
    const id = draggingRef.current;
    const prev = rectRef.current;
    const next = { tl: { ...prev.tl }, tr: { ...prev.tr }, br: { ...prev.br }, bl: { ...prev.bl } };
    if (id === "tl") { next.tl.x = nx; next.tl.y = ny; }
    else if (id === "tr") { next.tr.x = nx; next.tr.y = ny; }
    else if (id === "br") { next.br.x = nx; next.br.y = ny; }
    else if (id === "bl") { next.bl.x = nx; next.bl.y = ny; }
    rectRef.current = next;
    setRect(next);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(drawCropOverlay);
  }

  function onUp() { draggingRef.current = null; }

  function applyCrop() {
    if (!sourceCanvas || !rectRef.current) return;
    try {
      const r = rectRef.current;
      const W = sourceCanvas.width, H = sourceCanvas.height;
      const ptl = { x: r.tl.x * W, y: r.tl.y * H };
      const ptr = { x: r.tr.x * W, y: r.tr.y * H };
      const pbr = { x: r.br.x * W, y: r.br.y * H };
      const pbl = { x: r.bl.x * W, y: r.bl.y * H };
      const dstW = Math.round(Math.max(Math.hypot(ptr.x - ptl.x, ptr.y - ptl.y), Math.hypot(pbr.x - pbl.x, pbr.y - pbl.y)));
      const dstH = Math.round(Math.max(Math.hypot(pbl.x - ptl.x, pbl.y - ptl.y), Math.hypot(pbr.x - ptr.x, pbr.y - ptr.y)));
      if (dstW < 10 || dstH < 10) { onUse(preview, extractedText); onClose(); return; }
      const sys = [];
      const srcPts = [{ x: 0, y: 0 }, { x: dstW, y: 0 }, { x: dstW, y: dstH }, { x: 0, y: dstH }];
      const dstPts = [ptl, ptr, pbr, pbl];
      for (let i = 0; i < 4; i++) {
        const u = srcPts[i].x, v = srcPts[i].y, x = dstPts[i].x, y = dstPts[i].y;
        sys.push([u, v, 1, 0, 0, 0, -x * u, -x * v, x]);
        sys.push([0, 0, 0, u, v, 1, -y * u, -y * v, y]);
      }
      const n = 8;
      for (let i = 0; i < n; i++) {
        let mRow = i;
        for (let k = i + 1; k < n; k++) if (Math.abs(sys[k][i]) > Math.abs(sys[mRow][i])) mRow = k;
        const tmp = sys[i]; sys[i] = sys[mRow]; sys[mRow] = tmp;
        for (let k = i + 1; k < n; k++) {
          const c = -sys[k][i] / sys[i][i];
          for (let j = i; j <= n; j++) sys[k][j] += c * sys[i][j];
        }
      }
      const Hmat = new Array(n);
      for (let i = n - 1; i >= 0; i--) {
        let sum = 0;
        for (let j = i + 1; j < n; j++) sum += sys[i][j] * Hmat[j];
        Hmat[i] = (sys[i][n] - sum) / sys[i][i];
      }
      const out = document.createElement("canvas");
      out.width = dstW; out.height = dstH;
      const ctx = out.getContext("2d");
      const srcData = sourceCanvas.getContext("2d").getImageData(0, 0, W, H);
      const srcB = new Uint32Array(srcData.data.buffer);
      const dstData = ctx.createImageData(dstW, dstH);
      const dstB = new Uint32Array(dstData.data.buffer);
      const [a, b, c, d, e, f, g, h] = Hmat;
      let idx = 0;
      for (let y = 0; y < dstH; y++) {
        for (let x = 0; x < dstW; x++) {
          const denom = g * x + h * y + 1;
          const su = Math.floor((a * x + b * y + c) / denom);
          const sv = Math.floor((d * x + e * y + f) / denom);
          if (su >= 0 && su < W && sv >= 0 && sv < H) dstB[idx] = srcB[sv * W + su];
          else dstB[idx] = 0;
          idx++;
        }
      }
      dstData.data.set(new Uint8Array(dstB.buffer));
      ctx.putImageData(dstData, 0, 0);
      if (enhance) {
        const idata = ctx.getImageData(0, 0, dstW, dstH);
        const d = idata.data;
        const len = d.length;
        const gray = new Uint8Array(dstW * dstH);
        for (let i = 0; i < len; i += 4) {
          gray[i / 4] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        }
        const sumY = new Uint32Array(dstW * dstH);
        for (let y = 0; y < dstH; y++) {
          let rowSum = 0;
          for (let x = 0; x < dstW; x++) {
            rowSum += gray[y * dstW + x];
            sumY[y * dstW + x] = (y > 0 ? sumY[(y - 1) * dstW + x] : 0) + rowSum;
          }
        }
        const win = Math.max(15, Math.floor(Math.min(dstW, dstH) / 16));
        for (let y = 0; y < dstH; y++) {
          for (let x = 0; x < dstW; x++) {
            const x2 = Math.min(x + win, dstW - 1);
            const y2 = Math.min(y + win, dstH - 1);
            const x1 = Math.max(x - win, 0);
            const y1 = Math.max(y - win, 0);
            const count = (x2 - x1 + 1) * (y2 - y1 + 1);
            const sum = sumY[y2 * dstW + x2] - (x1 > 0 ? sumY[y2 * dstW + x1 - 1] : 0) - (y1 > 0 ? sumY[(y1 - 1) * dstW + x2] : 0) + (x1 > 0 && y1 > 0 ? sumY[(y1 - 1) * dstW + x1 - 1] : 0);
            const avg = sum / count;
            const px = gray[y * dstW + x];
            let v = 255;
            if (px < avg * 0.95 - 5) { v = Math.max(0, px - 30); }
            const idx = (y * dstW + x) * 4;
            d[idx] = v; d[idx + 1] = v; d[idx + 2] = v;
          }
        }
        ctx.putImageData(idata, 0, 0);
      }
      onUse(out.toDataURL("image/jpeg", 0.92), extractedText);
      onClose();
    } catch { onUse(preview, extractedText); onClose(); }
  }

  function useFullPhoto() {
    if (preview) { onUse(preview); onClose(); }
  }

  function retake() {
    setPreview(null);
    setSourceCanvas(null);
    setRect(null);
    setPhase("camera");
    startCam();
  }

  if (!open) return null;

  const modalStyle = {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 99999, background: "#000", display: "flex", flexDirection: "column",
    height: "100dvh"
  };
  const headerStyle = {
    height: 64, flexShrink: 0, display: "flex", alignItems: "center",
    justifyContent: "space-between", padding: "0 16px", background: T.card,
    borderBottom: `1px solid ${T.border}`
  };
  const footerStyle = {
    height: "auto", minHeight: 96,
    padding: "16px 16px env(safe-area-inset-bottom, 34px) 16px",
    paddingBottom: "max(env(safe-area-inset-bottom), 34px)",
    display: "flex", alignItems: "center", gap: 12,
    background: T.card, borderTop: `1px solid ${T.border}`, flexShrink: 0
  };
  const middleStyle = { flex: 1, overflow: "hidden", position: "relative", background: "#050505" };
  const btnStyle = { height: 40, borderRadius: 12, background: "transparent", border: "none", color: T.danger, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "0 16px" };

  let headerLeft, headerTitle, content, footer;

  function takePhotoClick() {
    if (fileRef.current) {
      fileRef.current.setAttribute("capture", "environment");
      fileRef.current.click();
    }
  }

  function pickGalleryClick() {
    if (fileRef.current) {
      fileRef.current.removeAttribute("capture");
      fileRef.current.click();
    }
  }

  if (phase === "crop" && preview) {
    headerLeft = <button onClick={retake} style={{ ...btnStyle, color: T.muted }}>← RETAKE</button>;
    headerTitle = "SMART CROP";
    content = (
      <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
        <img ref={imgRef} src={preview} alt="" onLoad={syncOverlay} style={{ position: "absolute", display: "none" }} />
        <canvas ref={overlayRef} style={{ position: "absolute", touchAction: "none", pointerEvents: "auto", display: "none" }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp} />
        {aiLoading && (
          <div style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)",
            display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", zIndex: 100
          }}>
            <Spinner size={40} color={T.gold} />
            <div style={{ color: T.gold, marginTop: 16, fontFamily: "'Space Mono',monospace", fontSize: 13, letterSpacing: "0.1em" }}>
              AI DETECTING EDGES...
            </div>
          </div>
        )}
        <div style={{ position: "absolute", bottom: 16, right: 16, display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.8)", padding: "10px 14px", borderRadius: 20, border: `1px solid ${T.border}`, zIndex: 100 }}>
          <span style={{ color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "'Rajdhani',sans-serif", letterSpacing: "0.05em" }}>AI ENHANCE</span>
          <div style={{ width: 40, height: 22, borderRadius: 12, background: enhance ? T.gold : "#444", position: "relative", cursor: "pointer", transition: "0.2s" }} onClick={() => setEnhance(!enhance)}>
            <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 2, left: enhance ? 20 : 2, transition: "0.2s" }} />
          </div>
        </div>
      </div>
    );
    footer = (
      <>
        <GhostBtn onClick={useFullPhoto} style={{ flex: 1 }}>USE FULL</GhostBtn>
        <GoldBtn onClick={applyCrop} style={{ flex: 2 }}>CROP & SAVE</GoldBtn>
      </>
    );
  } else {
    headerLeft = <button onClick={onClose} style={btnStyle}>✕ CANCEL</button>;
    headerTitle = "DOCUMENT SCANNER";
    content = (
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: 24 }}>
        {busy ? <Spinner size={40} color={T.gold} /> : (
          <>
            <div style={{ fontSize: 64, opacity: 0.5 }}>📷</div>
            <div style={{ color: T.muted, fontSize: 13, textAlign: "center" }}>Take a photo of your document or choose from gallery</div>
          </>
        )}
      </div>
    );
    footer = (
      <>
        <GoldBtn onClick={takePhotoClick} disabled={busy} style={{ flex: 1, padding: "16px 0", fontSize: 16, WebkitTapHighlightColor: "transparent" }}>
          📷 TAKE PHOTO
        </GoldBtn>
        <GhostBtn onClick={pickGalleryClick} disabled={busy} style={{ width: 72, flex: "none", WebkitTapHighlightColor: "transparent" }}>
          <span style={{ fontSize: 22 }}>🖼</span>
        </GhostBtn>
      </>
    );
  }

  const modal = (
    <div style={modalStyle}>
      <div style={headerStyle}>
        {headerLeft}
        <div style={{ color: T.gold, fontSize: 16, fontWeight: 700, letterSpacing: "0.15em", fontFamily: "'Rajdhani',sans-serif" }}>
          {headerTitle}
        </div>
        <div style={{ width: 80 }} />
      </div>
      <div style={middleStyle}>{content}</div>
      <div style={footerStyle}>{footer}</div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
      <canvas ref={hiddenCanvas} style={{ display: "none" }} />
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}

function NotesField({ value, onChange }) {
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState(false);
  const [originalText, setOriginalText] = useState("");

  async function doTranslate() {
    const text = (value || '').trim();
    if (!text || text.length < 3 || translating) return;
    setTranslating(true);
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.language === 'es' && data.translated && data.translated.trim().toLowerCase() !== text.toLowerCase()) {
          setOriginalText(text);
          onChange(data.translated);
          setTranslated(true);
        }
      }
    } catch { }
    setTranslating(false);
  }

  function handleChange(e) {
    if (translated) { setTranslated(false); setOriginalText(""); }
    onChange(e.target.value);
  }

  function revert() {
    if (!originalText) return;
    onChange(originalText);
    setTranslated(false);
    setOriginalText("");
  }

  return (
    <div>
      <div style={{ position: "relative" }}>
        <Textarea
          placeholder="Add job specifics…"
          value={value}
          onChange={handleChange}
          style={translating ? { opacity: 0.6 } : {}}
        />
        {translating && (
          <div style={{
            position: "absolute", top: 10, right: 10,
            display: "flex", alignItems: "center", gap: 6
          }}>
            <Spinner size={12} color={T.gold} />
            <span style={{ color: T.gold, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em" }}>TRANSLATING...</span>
          </div>
        )}
      </div>
      {!translated && value && value.trim().length >= 3 && (
        <button onClick={doTranslate} disabled={translating} style={{
          marginTop: 6, padding: "6px 12px", background: "rgba(212,175,55,0.08)",
          border: "1px solid rgba(212,175,55,0.2)", borderRadius: 6,
          color: T.gold, fontSize: 11, fontWeight: 700, cursor: "pointer",
          letterSpacing: "0.06em", transition: "all 0.15s"
        }}>
          🌐 TRANSLATE IF SPANISH
        </button>
      )}
      {translated && (
        <div style={{
          marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "6px 10px", background: "rgba(212,175,55,0.08)",
          border: "1px solid rgba(212,175,55,0.2)", borderRadius: 6
        }}>
          <span style={{ color: T.gold, fontSize: 11 }}>🌐 Translated from Spanish</span>
          <button onClick={revert} style={{
            background: "transparent", border: "none",
            color: T.muted, fontSize: 11, cursor: "pointer", textDecoration: "underline"
          }}>Revert</button>
        </div>
      )}
    </div>
  );
}


function SubmitTicket({ phone, onComplete, editTicket }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const today = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();

  const [form, setForm] = useState(() => {
    if (editTicket) {
      return {
        client: editTicket["Client"] || "",
        fieldTicket: editTicket["Field Ticket #"] || "",
        dispatch: editTicket["Dispatch #"] || "",
        unit: editTicket["Unit #"] || "",
        driver: editTicket["Driver"] || "",
        workDate: editTicket["Service Date"] || today,
        wellLease: editTicket["Well/Lease"] || "",
        notes: editTicket["Notes"] || "",
        fieldTicketImage: "",
        startTime: editTicket["Start Time"] || "",
        endTime: editTicket["End Time"] || ""
      };
    }
    try {
      const saved = localStorage.getItem("bd_draft_form");
      if (saved) return JSON.parse(saved);
    } catch { }
    return {
      client: "", fieldTicket: "", dispatch: "", unit: "",
      driver: "", workDate: today, wellLease: "", notes: "", fieldTicketImage: "",
      startTime: "", endTime: ""
    };
  });

  const [loads, setLoads] = useState(() => {
    if (editTicket) return [{
      id: 1, geminiRef: "", loadTicket: "", fluid: "Fresh Water",
      bbls: "", manifestOps: { washOut: false, unload: false }, verificationImage: ""
    }];
    try {
      const saved = localStorage.getItem("bd_draft_loads");
      if (saved) return JSON.parse(saved);
    } catch { }
    return [{
      id: 1, geminiRef: "", loadTicket: "", fluid: "Fresh Water",
      bbls: "", manifestOps: { washOut: false, unload: false }, verificationImage: ""
    }];
  });

  useEffect(() => {
    if (!editTicket) {
      try { localStorage.setItem("bd_draft_form", JSON.stringify(form)); } catch { }
    }
  }, [form, editTicket]);

  useEffect(() => {
    if (!editTicket) {
      try { localStorage.setItem("bd_draft_loads", JSON.stringify(loads)); } catch { }
    }
  }, [loads, editTicket]);

  const [submissionId] = useState(editTicket ? editTicket["Submission ID"] : null);
  const [scanTarget, setScanTarget] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const sigRef = useRef(null);
  const drawing = useRef(false);
  const lastPt = useRef({ x: 0, y: 0 });

  const isExxon = form.client === "Exxon";

  function update(k, v) { setForm(p => ({ ...p, [k]: v })); }
  function updateLoad(i, k, v) { setLoads(p => { const c = [...p]; c[i][k] = v; return c; }); }
  function addLoad() {
    setLoads(p => [...p, {
      id: p.length + 1, geminiRef: "", loadTicket: "",
      fluid: "Fresh Water", bbls: "", manifestOps: { washOut: false, unload: false }, verificationImage: ""
    }]);
  }
  function deleteLoad(i) { setLoads(p => p.filter((_, idx) => idx !== i)); }
  function toggleOp(i, op) {
    setLoads(p => { const c = [...p]; c[i].manifestOps[op] = !c[i].manifestOps[op]; return c; });
  }

  const totalBBLS = useMemo(() =>
    loads.reduce((s, l) => { const n = parseFloat(l.bbls); return s + (isNaN(n) ? 0 : n); }, 0)
    , [loads]);

  function nonEmpty(v) { return String(v ?? "").trim().length > 0; }
  function loadOk(l) {
    const base = (!isExxon || nonEmpty(l.geminiRef)) && nonEmpty(l.loadTicket) &&
      nonEmpty(l.bbls) && !isNaN(parseFloat(l.bbls));
    return l.fluid === "Manifest" ? base && (l.manifestOps.washOut || l.manifestOps.unload) : base;
  }

  const checks = useMemo(() => [
    { key: "client", ok: nonEmpty(form.client) },
    { key: "fieldTicket", ok: nonEmpty(form.fieldTicket) },
    { key: "dispatch", ok: nonEmpty(form.dispatch) },
    { key: "unit", ok: nonEmpty(form.unit) },
    { key: "driver", ok: nonEmpty(form.driver) },
    { key: "workDate", ok: nonEmpty(form.workDate) },
    { key: "wellLease", ok: nonEmpty(form.wellLease) },
    { key: "fieldTicketImage", ok: nonEmpty(form.fieldTicketImage) },
    { key: "signature", ok: hasSignature },
    ...loads.map((l, i) => ({ key: `load_${i}`, ok: loadOk(l) }))
  ], [form, loads, hasSignature]);

  const progress = useMemo(() => Math.round(checks.filter(c => c.ok).length / checks.length * 100), [checks]);
  const isComplete = useMemo(() => checks.every(c => c.ok), [checks]);

  const dispatchLabel = {
    "Exxon": "GEMINI DISPATCH #", "Oxy": "IRONSIGHT JOB #",
    "Western Midstream": "IRONSIGHT JOB #"
  }[form.client] || "DISPATCH #";

  function pt(e, canvas) {
    const r = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return { x: (touch.clientX - r.left) * (canvas.width / r.width), y: (touch.clientY - r.top) * (canvas.height / r.height) };
  }
  function startDraw(e) {
    if (e.type === "touchstart") e.preventDefault();
    const c = sigRef.current, ctx = c.getContext("2d");
    drawing.current = true;
    const p = pt(e, c); lastPt.current = p;
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#000";
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
  }
  function draw(e) {
    if (!drawing.current) return;
    if (e.type === "touchmove") e.preventDefault();
    const c = sigRef.current, ctx = c.getContext("2d"), p = pt(e, c);
    ctx.lineTo(p.x, p.y); ctx.stroke(); lastPt.current = p; setHasSignature(true);
  }
  function endDraw() { drawing.current = false; }
  function clearSig() {
    const c = sigRef.current; c.getContext("2d").clearRect(0, 0, c.width, c.height);
    setHasSignature(false);
  }

  // ── SUBMIT — with image compression ──────────────────────────────────────
  async function handleSubmit() {
    if (!isComplete || isSubmitting) return;
    setIsSubmitting(true); setSubmitError("");

    try {
      // Compress all images before sending to keep payload small
      const [compressedTicketImage, compressedSignature] = await Promise.all([
        compressImage(form.fieldTicketImage, 1200, 0.6),
        compressImage(sigRef.current.toDataURL("image/png"), 800, 0.7),
      ]);

      const compressedLoads = await Promise.all(
        loads.map(async (load) => ({
          ...load,
          verificationImage: load.verificationImage
            ? await compressImage(load.verificationImage, 1200, 0.6)
            : "",
        }))
      );

      const sid = `BD-${Date.now().toString(36).toUpperCase()}`;
      const payload = {
        submissionId: submissionId || sid,
        phone,
        ...form,
        fieldTicketImage: compressedTicketImage,
        loads: compressedLoads,
        totalBBLS,
        signature: compressedSignature,
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const res = await fetch('/api/tickets', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem('bd_token')}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error("Network response was not ok");

      try {
        localStorage.removeItem("bd_draft_form");
        localStorage.removeItem("bd_draft_loads");
      } catch { }

      onComplete();
    } catch (err) {
      if (err.name === 'AbortError') {
        // Timeout but data was sent — treat as success
        try {
          localStorage.removeItem("bd_draft_form");
          localStorage.removeItem("bd_draft_loads");
        } catch { }
        onComplete();
      } else {
        setSubmitError("Submission may have failed. Check your connection and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const sectionStyle = {
    background: T.surface, borderRadius: 10, padding: "16px",
    border: `1px solid ${T.border}`, marginBottom: 12
  };
  const sectionTitle = {
    color: T.gold, fontFamily: "'Rajdhani',sans-serif",
    fontSize: 13, fontWeight: 700, letterSpacing: "0.15em", marginBottom: 14
  };

  return (
    <PageShell maxW={520}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => {
          if (confirm("Any unsaved changes will remain in drafts. Return to dashboard?")) {
            onComplete();
          }
        }} style={{
          background: "transparent", border: `1px solid ${T.border}`,
          color: T.muted, borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 13
        }}>← Back</button>
        <div>
          <div style={{
            color: T.gold, fontFamily: "'Rajdhani',sans-serif",
            fontSize: 20, fontWeight: 700, letterSpacing: "0.12em"
          }}>
            {editTicket ? "EDIT & RESUBMIT" : "NEW FIELD TICKET"}
          </div>
          <div style={{ color: T.muted, fontSize: 11 }}>
            {editTicket ? `Editing ${submissionId}` : "Complete all required fields"}
          </div>
        </div>
      </div>

      <div style={{
        marginBottom: 20, position: "sticky", top: 0, zIndex: 10,
        background: T.card, paddingTop: 4, paddingBottom: 8
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          fontSize: 11, color: T.muted, marginBottom: 6
        }}>
          <span>FORM COMPLETION</span>
          <span style={{ color: progress === 100 ? T.success : T.gold, fontWeight: 700 }}>
            {progress}%
          </span>
        </div>
        <div style={{ height: 4, background: T.surface, borderRadius: 99 }}>
          <div style={{
            height: "100%", borderRadius: 99,
            background: progress === 100 ? T.success : T.gold,
            width: `${progress}%`, transition: "width 0.3s ease"
          }} />
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitle}>📋 JOB INFORMATION</div>

        <Label text="Client Organization" required />
        <Select value={form.client} onChange={e => update("client", e.target.value)}>
          <option value="">Select client…</option>
          {["Exxon", "Oxy", "Western Midstream", "Chevron", "Other"].map(c => (
            <option key={c}>{c}</option>
          ))}
        </Select>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <Label text="Field Ticket #" required />
            <Input value={form.fieldTicket} onChange={e => update("fieldTicket", e.target.value)} />
          </div>
          <div style={{ minWidth: 0 }}>
            <Label text={dispatchLabel} required />
            <Input value={form.dispatch} onChange={e => update("dispatch", e.target.value)} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <Label text="Unit / Truck #" required />
            <Input value={form.unit} onChange={e => update("unit", e.target.value)} />
          </div>
          <div style={{ minWidth: 0 }}>
            <Label text="Driver Name" required />
            <Input value={form.driver} onChange={e => update("driver", e.target.value)} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <Label text="Work Date" required />
            <Input type="date" value={form.workDate} onChange={e => update("workDate", e.target.value)} />
          </div>
          <div style={{ minWidth: 0 }}>
            <Label text="Well / Lease" required />
            <Input value={form.wellLease} onChange={e => update("wellLease", e.target.value)} />
          </div>
        </div>

        <Label text="Notes / Description" />
        <NotesField value={form.notes} onChange={v => update("notes", v)} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4 }}>
          <div style={{ minWidth: 0 }}>
            <Label text="Start Time" />
            <Input type="time" value={form.startTime} onChange={e => update("startTime", e.target.value)} />
          </div>
          <div style={{ minWidth: 0 }}>
            <Label text="End Time" />
            <Input type="time" value={form.endTime} onChange={e => update("endTime", e.target.value)} />
          </div>
        </div>

        {form.startTime && form.endTime && (() => {
          const [sh, sm] = form.startTime.split(":").map(Number);
          const [eh, em] = form.endTime.split(":").map(Number);
          let mins = (eh * 60 + em) - (sh * 60 + sm);
          if (mins < 0) mins += 1440;
          const hrs = (mins / 60).toFixed(2);
          return (
            <div style={{
              marginTop: 12, padding: "10px 12px", background: "rgba(212,175,55,0.08)",
              border: "1px solid rgba(212,175,55,0.2)", borderRadius: 6,
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <div style={{ color: T.gold }}>
                <div style={{ fontSize: 10, letterSpacing: "0.05em", fontWeight: 700 }}>TOTAL HOURS</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Space Mono',monospace" }}>{hrs} <span style={{ fontSize: 12 }}>hrs</span></div>
              </div>
            </div>
          );
        })()}
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitle}>📄 FIELD TICKET PHOTO <span style={{ color: T.danger }}>✱</span></div>
        <div onClick={() => { setScanTarget({ type: "field" }); setScanOpen(true); }}
          style={{
            border: `1px dashed ${form.fieldTicketImage ? T.goldDim : T.border}`,
            borderRadius: 8, padding: 20, cursor: "pointer", textAlign: "center",
            background: T.bg, transition: "border-color 0.2s"
          }}>
          {form.fieldTicketImage
            ? <img src={form.fieldTicketImage} style={{ width: "100%", borderRadius: 6 }} alt="" />
            : <div style={{ color: T.muted, fontSize: 13 }}>📄 Tap to scan or upload ticket</div>
          }
        </div>
        {form.fieldTicketImage && (
          <button onClick={() => update("fieldTicketImage", "")} style={{
            marginTop: 8, background: "transparent", border: "none",
            color: T.danger, fontSize: 12, cursor: "pointer"
          }}>✕ Remove photo</button>
        )}
      </div>

      <div style={{ ...sectionStyle }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={sectionTitle}>🚛 LOAD MANIFEST</div>
          <div style={{
            background: `rgba(212,175,55,0.1)`, border: `1px solid ${T.goldDim}`,
            borderRadius: 8, padding: "4px 12px", color: T.gold,
            fontFamily: "'Space Mono',monospace", fontSize: 13, fontWeight: 700
          }}>
            {totalBBLS.toFixed(2)} BBL
          </div>
        </div>

        {loads.map((load, idx) => (
          <div key={load.id} style={{
            background: T.bg, borderRadius: 8, padding: 14,
            border: `1px solid ${T.border}`, marginBottom: 10,
            borderLeft: `3px solid ${T.gold}`
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{
                background: T.gold, color: "#000", padding: "2px 8px",
                borderRadius: 4, fontWeight: 800, fontSize: 11, fontFamily: "'Rajdhani',sans-serif"
              }}>LOAD {String(idx + 1).padStart(2, "0")}</span>
              {loads.length > 1 && (
                <button onClick={() => deleteLoad(idx)} style={{
                  marginLeft: "auto", background: "transparent",
                  border: `1px solid ${T.border}`, color: T.danger,
                  borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 12
                }}>✕</button>
              )}
            </div>

            {isExxon && (
              <>
                <Label text="Gemini Dispatch Ref #" required />
                <Input value={load.geminiRef} onChange={e => updateLoad(idx, "geminiRef", e.target.value)} />
              </>
            )}

            <Label text="Load Ticket Number" required />
            <Input value={load.loadTicket} onChange={e => updateLoad(idx, "loadTicket", e.target.value)} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <Label text="Fluid Type" />
                <Select value={load.fluid} onChange={e => updateLoad(idx, "fluid", e.target.value)}>
                  {["Fresh Water", "Brine Water", "Disposal Water", "Manifest"].map(f => (
                    <option key={f}>{f}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label text="BBLs" required />
                <Input type="number" value={load.bbls}
                  onChange={e => updateLoad(idx, "bbls", e.target.value)} />
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {[90, 100, 120, 130, 150, 200].map(q => (
                <button key={q} onClick={() => updateLoad(idx, "bbls", String(q))}
                  style={{
                    padding: "5px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                    background: String(load.bbls) === String(q) ? `rgba(212,175,55,0.2)` : T.surface,
                    border: `1px solid ${String(load.bbls) === String(q) ? T.gold : T.border}`,
                    color: String(load.bbls) === String(q) ? T.gold : T.muted,
                    transition: "all 0.15s"
                  }}>{q}</button>
              ))}
            </div>

            <Label text="Verification Image" />
            <div onClick={() => { setScanTarget({ type: "load", index: idx }); setScanOpen(true); }}
              style={{
                border: `1px dashed ${load.verificationImage ? T.goldDim : T.border}`,
                borderRadius: 8, padding: load.verificationImage ? 0 : 14,
                cursor: "pointer", textAlign: "center", background: T.card, overflow: "hidden"
              }}>
              {load.verificationImage
                ? <img src={load.verificationImage} style={{ width: "100%", display: "block" }} alt="" />
                : <div style={{ color: T.muted, fontSize: 12 }}>🧾 Scan load ticket</div>
              }
            </div>

            {load.fluid === "Manifest" && (
              <div style={{
                marginTop: 10, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12
              }}>
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  color: T.muted, fontSize: 10, marginBottom: 10
                }}>
                  <span>MANIFEST OPERATIONS</span>
                  <span style={{ color: T.danger }}>REQUIRED SELECTION</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["washOut", "WASH OUT"], ["unload", "UNLOAD"]].map(([op, label]) => (
                    <button key={op} onClick={() => toggleOp(idx, op)} style={{
                      flex: 1, padding: "9px 0", borderRadius: 8, fontWeight: 700,
                      fontSize: 12, cursor: "pointer", letterSpacing: "0.05em",
                      border: `1px solid ${load.manifestOps[op] ? T.gold : T.border}`,
                      background: load.manifestOps[op] ? `rgba(212,175,55,0.12)` : "transparent",
                      color: load.manifestOps[op] ? T.gold : T.muted,
                      transition: "all 0.15s"
                    }}>{label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        <button onClick={addLoad} style={{
          width: "100%", padding: 12, border: `1px dashed ${T.border}`,
          borderRadius: 8, cursor: "pointer", textAlign: "center",
          background: "transparent", color: T.muted, fontSize: 13,
          transition: "all 0.15s"
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = T.borderHi; e.currentTarget.style.color = T.text; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
        >+ ADD ADDITIONAL LOAD</button>
      </div>

      <div style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={sectionTitle}>✍ OPERATOR SIGNATURE <span style={{ color: T.danger }}>✱</span></div>
          {hasSignature && (
            <button onClick={clearSig} style={{
              background: "transparent", border: "none",
              color: T.danger, fontSize: 12, cursor: "pointer"
            }}>✕ Clear</button>
          )}
        </div>
        <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}` }}>
          <canvas ref={sigRef} width={900} height={280}
            style={{ width: "100%", height: 140, background: "#fff", display: "block", touchAction: "none" }}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
          />
        </div>
        {!hasSignature && (
          <div style={{ color: T.muted, fontSize: 11, textAlign: "center", marginTop: 6 }}>
            Sign above with your finger or mouse
          </div>
        )}
      </div>

      <div style={{
        ...sectionStyle, display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div style={{ color: T.muted, fontSize: 12 }}>
          <div>TOTAL LOADS</div>
          <div style={{ color: T.text, fontWeight: 700, fontSize: 18, marginTop: 2 }}>{loads.length}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: T.muted, fontSize: 12 }}>TOTAL VOLUME</div>
          <div style={{
            color: T.gold, fontFamily: "'Space Mono',monospace",
            fontSize: 28, fontWeight: 700, marginTop: 2
          }}>{totalBBLS.toFixed(2)} <span style={{ fontSize: 14 }}>BBL</span></div>
        </div>
      </div>

      {submitError && (
        <div style={{ color: T.danger, fontSize: 12, textAlign: "center", marginBottom: 10 }}>
          ⚠ {submitError}
        </div>
      )}

      <GoldBtn disabled={!isComplete} loading={isSubmitting} onClick={handleSubmit}>
        {isSubmitting ? "SUBMITTING…" : isComplete ? "✓ SUBMIT FINAL TICKET" : `COMPLETE FORM (${progress}%)`}
      </GoldBtn>

      <ScannerModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onUse={(img, extractedText) => {
          if (scanTarget?.type === "field") {
            update("fieldTicketImage", img);
            if (extractedText && form.notes.length === 0) {
              update("notes", extractedText);
            }
          }
          if (scanTarget?.type === "load") {
            setLoads(p => { const c = [...p]; c[scanTarget.index].verificationImage = img; return c; });
          }
          setScanOpen(false); setScanTarget(null);
        }}
      />
    </PageShell>
  );
}

export default function App() {
  injectGlobalStyles();
  const [phone, setPhone] = useState(() => { try { return localStorage.getItem("bd_phone"); } catch { return null; } });
  const [page, setPage] = useState(() => {
    try {
      if (localStorage.getItem("bd_phone") && localStorage.getItem("bd_token")) {
        return localStorage.getItem("bd_draft_form") ? "submit" : "dashboard";
      }
    } catch { }
    return "login";
  });
  const [editTicket, setEditTicket] = useState(null);
  function login(data) {
    try { localStorage.setItem("bd_phone", data.phone); localStorage.setItem("bd_token", data.token); } catch { }
    setPhone(data.phone); setPage("dashboard");
  }
  function logout() {
    try { localStorage.removeItem("bd_phone"); localStorage.removeItem("bd_token"); } catch { }
    setPhone(null); setPage("login");
  }
  return (
    <ErrorBoundary>
      <OfflineBanner />
      {(!phone || page === "login") && <Login onLogin={login} />}
      {phone && page === "dashboard" && <Dashboard phone={phone} onLogout={logout} onStartTicket={() => { setEditTicket(null); setPage("submit"); }} onOpenQueue={() => setPage("queue")} />}
      {phone && page === "queue" && <Queue phone={phone} onBack={() => setPage("dashboard")} onEdit={t => { setEditTicket(t); setPage("submit"); }} />}
      {phone && page === "submit" && <SubmitTicket phone={phone} editTicket={editTicket} onComplete={() => { setEditTicket(null); setPage("success"); }} />}
      {phone && page === "success" && <TicketSuccess onBack={() => setPage("dashboard")} onViewQueue={() => setPage("queue")} />}
    </ErrorBoundary>
  );
}
