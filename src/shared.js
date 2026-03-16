// shared.js
import React from "react";

export const API_URL =
  "https://script.google.com/macros/s/AKfycbwBTObE1wKttfWxpBXsW2oehfBdBcIcFPuYAmfDf23Ps47Y8MkcoS_M1Pip6kCx8rpB/exec";

export const T = {
  gold:    "#D4AF37",
  goldDim: "#a88a20",
  goldBg:  "rgba(212,175,55,0.10)",
  bg:      "#07080a",
  card:    "#0e1015",
  surface: "#13161d",
  border:  "#1e2330",
  borderHi:"#2e3550",
  text:    "#e8eaf0",
  muted:   "#6b7394",
  danger:  "#ef4444",
  success: "#22c55e",
  warn:    "#f59e0b",
};

export const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  html, body {
    background: ${T.bg};
    color: ${T.text};
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
    /* prevent overscroll bounce interfering with fixed overlays */
    overscroll-behavior: none;
  }
  input, select, textarea, button { font-family: inherit; }
  /* stop iOS from zooming into inputs */
  input, select, textarea { font-size: 16px !important; }
  input[type=date]::-webkit-calendar-picker-indicator,
  input[type=time]::-webkit-calendar-picker-indicator { filter: invert(0.6); cursor: pointer; }
  /* hide number spinners */
  input[type=number]::-webkit-inner-spin-button,
  input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  input[type=number] { -moz-appearance: textfield; }
  /* tap highlight */
  * { -webkit-tap-highlight-color: transparent; }
  button { touch-action: manipulation; }

  @keyframes spin    { to { transform: rotate(360deg); } }
  @keyframes fadeUp  { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pop     { 0%{transform:scale(0.9);opacity:0} 60%{transform:scale(1.02)} 100%{transform:scale(1);opacity:1} }
  @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.35} }
  @keyframes scanBeam { 0%{top:8%} 50%{top:82%} 100%{top:8%} }
  .fadeUp { animation: fadeUp 0.28s ease both; }
  .pop    { animation: pop 0.32s cubic-bezier(.34,1.56,.64,1) both; }
`;

export function injectGlobalStyles() {
  if (document.getElementById("bd-css")) return;
  const s = document.createElement("style");
  s.id = "bd-css";
  s.textContent = GLOBAL_CSS;
  document.head.appendChild(s);
}

// ── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ size = 18, color = T.gold }) {
  return (
    <span style={{
      display: "inline-block", width: size, height: size, flexShrink: 0,
      border: `2px solid rgba(255,255,255,0.08)`,
      borderTop: `2px solid ${color}`,
      borderRadius: "50%", animation: "spin 0.7s linear infinite",
    }}/>
  );
}

// ── Label ────────────────────────────────────────────────────────────────────
export function Label({ text, required }) {
  return (
    <div style={{
      color: T.muted, fontSize: 11, fontWeight: 600,
      letterSpacing: "0.1em", textTransform: "uppercase",
      marginTop: 16, marginBottom: 6,
    }}>
      {text}{required && <span style={{ color: T.danger }}> ✱</span>}
    </div>
  );
}

// ── Input ────────────────────────────────────────────────────────────────────
export function Input({ style, ...props }) {
  return (
    <input
      style={{
        width: "100%",
        // min 48px tall — comfortable thumb target
        padding: "13px 14px",
        background: T.surface,
        border: `1px solid ${T.border}`,
        color: T.text,
        borderRadius: 10,
        fontSize: 16,     // prevents iOS zoom
        outline: "none",
        transition: "border-color 0.15s",
        WebkitAppearance: "none",
        appearance: "none",
        ...style,
      }}
      onFocus={e => (e.target.style.borderColor = T.goldDim)}
      onBlur={e  => (e.target.style.borderColor = T.border)}
      {...props}
    />
  );
}

// ── Textarea ─────────────────────────────────────────────────────────────────
export function Textarea({ style, ...props }) {
  return (
    <textarea
      style={{
        width: "100%",
        padding: "13px 14px",
        background: T.surface,
        border: `1px solid ${T.border}`,
        color: T.text,
        borderRadius: 10,
        fontSize: 16,
        resize: "vertical",
        minHeight: 96,
        outline: "none",
        lineHeight: 1.55,
        transition: "border-color 0.15s",
        WebkitAppearance: "none",
        appearance: "none",
        ...style,
      }}
      onFocus={e => (e.target.style.borderColor = T.goldDim)}
      onBlur={e  => (e.target.style.borderColor = T.border)}
      {...props}
    />
  );
}

// ── Select ───────────────────────────────────────────────────────────────────
export function Select({ children, style, ...props }) {
  return (
    <select
      style={{
        width: "100%",
        padding: "13px 40px 13px 14px",
        background: T.surface,
        border: `1px solid ${T.border}`,
        color: T.text,
        borderRadius: 10,
        fontSize: 16,
        outline: "none",
        appearance: "none",
        WebkitAppearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236b7394' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 14px center",
        transition: "border-color 0.15s",
        ...style,
      }}
      onFocus={e => (e.target.style.borderColor = T.goldDim)}
      onBlur={e  => (e.target.style.borderColor = T.border)}
      {...props}
    >
      {children}
    </select>
  );
}

// ── GoldBtn ──────────────────────────────────────────────────────────────────
export function GoldBtn({ children, disabled, loading, onClick, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        width: "100%",
        // 52px min height = comfortable thumb target
        minHeight: 52,
        padding: "0 16px",
        background: disabled ? "#1e2230" : T.gold,
        color: disabled ? T.muted : "#000",
        border: "none",
        borderRadius: 12,
        fontWeight: 800,
        fontSize: 14,
        letterSpacing: "0.08em",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        transition: "opacity 0.15s",
        opacity: loading ? 0.8 : 1,
        ...style,
      }}
    >
      {loading && <Spinner size={16} color={disabled ? T.muted : "#000"} />}
      {children}
    </button>
  );
}

// ── GhostBtn ─────────────────────────────────────────────────────────────────
export function GhostBtn({ children, onClick, danger, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        minHeight: 52,
        padding: "0 16px",
        background: "transparent",
        color: danger ? T.danger : T.text,
        border: `1px solid ${danger ? "rgba(239,68,68,0.35)" : T.border}`,
        borderRadius: 12,
        fontWeight: 600,
        fontSize: 14,
        letterSpacing: "0.05em",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ── PageShell ─────────────────────────────────────────────────────────────────
export function PageShell({ children, maxW = 480, animate = "fadeUp" }) {
  return (
    <div style={{
      background: T.bg,
      minHeight: "100svh",   // svh = small viewport height — correct on mobile
      width: "100%",
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
      // safe-area padding for notch / home-bar devices
      padding: "20px 14px calc(env(safe-area-inset-bottom, 0px) + 48px)",
      boxSizing: "border-box",
    }}>
      <div
        className={animate}
        style={{
          width: "100%",
          maxWidth: maxW,
          background: T.card,
          borderRadius: 16,
          border: `1px solid ${T.border}`,
          borderLeft: `3px solid ${T.gold}`,
          padding: "22px 16px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Logo ─────────────────────────────────────────────────────────────────────
export function Logo({ sub = "FIELD COMMAND" }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 24 }}>
      <div style={{ color: T.gold, fontSize: 10, fontWeight: 700, letterSpacing: "0.4em" }}>
        BLACK DROP TRUCKING
      </div>
      <div style={{
        color: T.gold, fontSize: 24, fontWeight: 800,
        letterSpacing: "0.18em", marginTop: 2,
      }}>
        {sub}
      </div>
      <div style={{ width: 36, height: 2, background: T.gold, margin: "8px auto 0" }} />
    </div>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const map = {
    "PENDING":      { color: T.warn,    bg: "rgba(245,158,11,0.12)",  dot: T.warn    },
    "APPROVED":     { color: T.success, bg: "rgba(34,197,94,0.12)",   dot: T.success },
    "BOUNCE BACK":  { color: T.danger,  bg: "rgba(239,68,68,0.12)",   dot: T.danger  },
  };
  const s = map[status] ?? { color: T.muted, bg: T.surface, dot: T.muted };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 10px", borderRadius: 99,
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
      whiteSpace: "nowrap",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: s.dot, flexShrink: 0,
        animation: status === "PENDING" ? "pulse 1.5s ease infinite" : "none",
      }}/>
      {status}
    </span>
  );
}

// ── ErrorMsg ─────────────────────────────────────────────────────────────────
export function ErrorMsg({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      color: T.danger, fontSize: 13, marginTop: 10,
      padding: "10px 14px",
      background: "rgba(239,68,68,0.08)",
      border: "1px solid rgba(239,68,68,0.25)",
      borderRadius: 8, textAlign: "center", lineHeight: 1.5,
    }}>
      ⚠ {msg}
    </div>
  );
}

// ── SectionCard ───────────────────────────────────────────────────────────────
export function SectionCard({ title, children, right, style }) {
  return (
    <div style={{
      background: T.surface,
      borderRadius: 12,
      padding: "16px 14px",
      border: `1px solid ${T.border}`,
      marginBottom: 12,
      ...style,
    }}>
      {title && (
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
          gap: 8,
        }}>
          <div style={{
            color: T.gold, fontSize: 12, fontWeight: 700,
            letterSpacing: "0.14em", flexShrink: 0,
          }}>
            {title}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Grid2 helper ─────────────────────────────────────────────────────────────
// Two-column grid that collapses to 1-col on very narrow screens
export function Grid2({ children, gap = 10 }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap,
    }}>
      {children}
    </div>
  );
}
