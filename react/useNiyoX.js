// react/useNiyoX.js — NiyoX AI React hook & context provider  v0.0.4
"use client";

import { useState, useCallback, useRef, createContext, useContext } from "react";

const BASE_URL = "https://ai.dnuz.top/api/ai";

// ── Browser client (v0.0.4 — persona, maxHistory, exportConversation) ────────
class NiyoXBrowserClient {
  /**
   * @param {object} options
   * @param {string} [options.sessionId="default"]
   * @param {string} [options.persona=null]       System-prompt / persona string
   * @param {number} [options.maxHistory=50]      Max history entries. 0 = unlimited.
   */
  constructor({ sessionId = "default", persona = null, maxHistory = 50 } = {}) {
    this.sessionId      = sessionId;
    this.conversationId = null;
    this.history        = [];
    this._persona       = persona ? String(persona).trim() : null;
    this._maxHistory    = Number(maxHistory) || 0;
  }

  // ── Persona ────────────────────────────────────────────────────────────
  setPersona(text) { this._persona = text ? String(text).trim() : null; return this; }
  getPersona()     { return this._persona; }

  _buildQuery(message) {
    if (!this._persona) return message;
    return `[SYSTEM: ${this._persona}]\n\nUser: ${message}`;
  }

  // ── Context trimming ───────────────────────────────────────────────────
  setMaxHistory(max) { this._maxHistory = Number(max) || 0; this._trimHistory(); return this; }
  getMaxHistory()    { return this._maxHistory; }

  _trimHistory() {
    if (this._maxHistory > 0 && this.history.length > this._maxHistory) {
      this.history = this.history.slice(this.history.length - this._maxHistory);
    }
  }

  // ── Chat ───────────────────────────────────────────────────────────────
  async chat(message) {
    const params = new URLSearchParams({ q: this._buildQuery(message) });
    if (this.conversationId) params.set("conversationId", this.conversationId);
    if (this.sessionId !== "default") params.set("sessionId", this.sessionId);

    const res  = await fetch(`${BASE_URL}?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (!data.success) throw new Error("API returned success=false");

    if (data.conversationId) this.conversationId = data.conversationId;

    const ts = new Date();
    this.history.push({ role: "user",      content: message,     timestamp: ts });
    this.history.push({ role: "assistant", content: data.result, timestamp: ts, responseTime: data.responseTime });
    this._trimHistory();

    return data;
  }

  newConversation() { this.conversationId = null; this.history = []; }
  getHistory()      { return [...this.history]; }

  // ── Export (v0.0.4) ────────────────────────────────────────────────────
  exportConversation(format = "json") {
    const fmt = String(format).toLowerCase();

    if (fmt === "json") {
      return JSON.stringify({
        exportedAt: new Date().toISOString(),
        conversationId: this.conversationId,
        sessionId: this.sessionId,
        persona: this._persona,
        messages: this.history,
      }, null, 2);
    }

    if (fmt === "text") {
      const lines = [];
      if (this._persona) lines.push(`[Persona: ${this._persona}]\n`);
      for (const m of this.history) {
        const ts    = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : "";
        const label = m.role === "user" ? "You" : "NiyoX AI";
        const meta  = m.responseTime ? ` (${m.responseTime}ms)` : "";
        lines.push(`[${ts}] ${label}${meta}:\n${m.content}\n`);
      }
      return lines.join("\n");
    }

    if (fmt === "markdown") {
      const lines = [`# NiyoX AI Conversation\n`];
      if (this._persona) lines.push(`> **Persona:** ${this._persona}\n`);
      if (this.conversationId) lines.push(`> **ID:** \`${this.conversationId}\`\n`);
      lines.push(`> **Exported:** ${new Date().toISOString()}\n\n---\n`);
      for (const m of this.history) {
        const ts    = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : "";
        const label = m.role === "user" ? "**You**" : "**NiyoX AI**";
        const meta  = m.responseTime ? ` *(${m.responseTime}ms)*` : "";
        lines.push(`### ${label} — ${ts}${meta}\n\n${m.content}\n`);
      }
      return lines.join("\n");
    }

    throw new Error(`Unknown export format "${format}". Use "json", "text", or "markdown".`);
  }
}

// ── useNiyoX hook ─────────────────────────────────────────────────────────────
/**
 * useNiyoX — drop-in React hook for NiyoX AI chat.
 *
 * v0.0.4 additions:
 *   • persona / setPersona   — set AI personality
 *   • maxHistory             — control context window size
 *   • exportConversation     — download chat as JSON / text / markdown
 *
 * @param {object}  options
 * @param {string}  [options.sessionId="default"]
 * @param {string}  [options.persona=null]         Initial persona string
 * @param {number}  [options.maxHistory=50]        Max history entries (0 = unlimited)
 *
 * @returns {{
 *   messages:            Array<{role, content, timestamp, responseTime?}>,
 *   input:               string,
 *   setInput:            Function,
 *   isLoading:           boolean,
 *   error:               string|null,
 *   sendMessage:         (text?: string) => Promise<void>,
 *   newConversation:     () => void,
 *   conversationId:      string|null,
 *   persona:             string|null,
 *   setPersona:          (text: string|null) => void,
 *   maxHistory:          number,
 *   setMaxHistory:       (n: number) => void,
 *   exportConversation:  (format?: string) => string,
 * }}
 */
export function useNiyoX(options = {}) {
  const clientRef = useRef(null);
  if (!clientRef.current) clientRef.current = new NiyoXBrowserClient(options);

  const [messages,   setMessages]   = useState([]);
  const [input,      setInput]      = useState("");
  const [isLoading,  setIsLoading]  = useState(false);
  const [error,      setError]      = useState(null);
  const [convId,     setConvId]     = useState(null);
  const [persona,    setPersonaState]   = useState(options.persona || null);
  const [maxHistory, setMaxHistoryState] = useState(
    options.maxHistory != null ? options.maxHistory : 50
  );

  // ── Persona ──────────────────────────────────────────────────────────────
  const setPersona = useCallback((text) => {
    clientRef.current.setPersona(text);
    setPersonaState(clientRef.current.getPersona());
  }, []);

  // ── Context trimming ─────────────────────────────────────────────────────
  const setMaxHistory = useCallback((n) => {
    clientRef.current.setMaxHistory(n);
    setMaxHistoryState(clientRef.current.getMaxHistory());
  }, []);

  // ── Export ───────────────────────────────────────────────────────────────
  const exportConversation = useCallback((format = "json") => {
    return clientRef.current.exportConversation(format);
  }, []);

  // ── Send ─────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if (!text || isLoading) return;

    setInput("");
    setError(null);
    setMessages(prev => [...prev, { role: "user", content: text, timestamp: new Date() }]);
    setIsLoading(true);

    try {
      const data = await clientRef.current.chat(text);
      setConvId(clientRef.current.conversationId);
      setMessages(prev => [...prev, {
        role:         "assistant",
        content:      data.result,
        timestamp:    new Date(),
        responseTime: data.responseTime,
      }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading]);

  const newConversation = useCallback(() => {
    clientRef.current.newConversation();
    setMessages([]);
    setConvId(null);
    setError(null);
  }, []);

  return {
    messages,
    input, setInput,
    isLoading,
    error,
    sendMessage,
    newConversation,
    conversationId: convId,
    persona,        setPersona,
    maxHistory,     setMaxHistory,
    exportConversation,
  };
}

// ── Context / Provider ────────────────────────────────────────────────────────
const NiyoXContext = createContext(null);

export function NiyoXProvider({ children, ...options }) {
  const value = useNiyoX(options);
  return <NiyoXContext.Provider value={value}>{children}</NiyoXContext.Provider>;
}

export function useNiyoXContext() {
  const ctx = useContext(NiyoXContext);
  if (!ctx) throw new Error("useNiyoXContext must be used inside <NiyoXProvider>");
  return ctx;
}

// ── <NiyoXChat> widget ────────────────────────────────────────────────────────
/**
 * <NiyoXChat> — ready-made chat widget.
 *
 * v0.0.4 additions:
 *   • persona prop             — set an initial AI personality
 *   • showExport prop          — show an Export button in the header (default: true)
 *   • maxHistory prop          — initial context window limit
 */
export function NiyoXChat({
  sessionId,
  persona: initialPersona,
  maxHistory: initialMaxHistory,
  placeholder = "Ask anything…",
  title = "NiyoX AI",
  showExport = true,
  style,
  className,
}) {
  const {
    messages, input, setInput, sendMessage, isLoading, error,
    newConversation, exportConversation, persona, setPersona,
  } = useNiyoX({ sessionId, persona: initialPersona, maxHistory: initialMaxHistory });

  const [showPersonaInput, setShowPersonaInput] = useState(false);
  const [personaDraft,     setPersonaDraft]     = useState(initialPersona || "");

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleExport = () => {
    const json = exportConversation("json");
    const blob = new Blob([json], { type: "application/json" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = "niyox-chat.json";
    a.click();
  };

  const applyPersona = () => {
    setPersona(personaDraft.trim() || null);
    setShowPersonaInput(false);
  };

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "system-ui, sans-serif", ...style }}>
      {/* header */}
      <div style={{ padding: "12px 16px", background: "linear-gradient(135deg,#2d1b69,#4a00c8)", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "12px 12px 0 0", gap: 6 }}>
        <span style={{ fontWeight: 700, fontSize: "1rem" }}>✦ {title}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setShowPersonaInput(s => !s)} title="Set persona" style={btnStyle}>{persona ? "🎭" : "🎭"} Persona</button>
          {showExport && <button onClick={handleExport} title="Export chat" style={btnStyle}>⬇ Export</button>}
          <button onClick={newConversation} title="New conversation" style={btnStyle}>New</button>
        </div>
      </div>

      {/* persona editor */}
      {showPersonaInput && (
        <div style={{ padding: "10px 16px", background: "#1a1a2e", borderBottom: "1px solid #2a2a4a", display: "flex", gap: 8 }}>
          <input
            value={personaDraft}
            onChange={e => setPersonaDraft(e.target.value)}
            placeholder="e.g. You are a concise coding assistant…"
            style={{ flex: 1, background: "#0d0d1a", border: "1px solid #2a2a4a", color: "#e0e0f0", padding: "8px 12px", borderRadius: 8, fontSize: ".88rem", outline: "none" }}
          />
          <button onClick={applyPersona} style={{ ...btnStyle, background: "linear-gradient(135deg,#00d2ff,#a044ff)", padding: "6px 14px" }}>Apply</button>
        </div>
      )}
      {persona && !showPersonaInput && (
        <div style={{ padding: "6px 16px", background: "#1a1a2e", fontSize: ".75rem", color: "#a044ff", borderBottom: "1px solid #2a2a4a" }}>
          🎭 <em>{persona}</em>
        </div>
      )}

      {/* messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10, background: "#0d0d1a" }}>
        {messages.length === 0 && (
          <div style={{ color: "#555", fontSize: ".9rem", textAlign: "center", marginTop: 32 }}>Start a conversation!</div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            maxWidth: "80%", padding: "10px 14px", borderRadius: 14,
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            background: m.role === "user" ? "linear-gradient(135deg,#2d1b69,#4a00c8)" : "#1a1a2e",
            color: "#e0e0f0", fontSize: ".92rem", lineHeight: 1.5,
            border: m.role === "assistant" ? "1px solid #2a2a4a" : "none",
          }}>
            <div>{m.content}</div>
            {m.responseTime && <div style={{ fontSize: ".7rem", color: "#a044ff", marginTop: 4 }}>⚡ {m.responseTime}ms</div>}
          </div>
        ))}
        {isLoading && <div style={{ alignSelf: "flex-start", color: "#a044ff", fontSize: ".85rem", padding: "8px 14px" }}>NiyoX AI is thinking…</div>}
        {error && <div style={{ color: "#ff6b6b", fontSize: ".85rem", padding: "4px 0" }}>⚠ {error}</div>}
      </div>

      {/* input */}
      <div style={{ display: "flex", gap: 8, padding: 12, background: "#0d0d1a", borderTop: "1px solid #1a1a2e", borderRadius: "0 0 12px 12px" }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey} placeholder={placeholder} disabled={isLoading}
          style={{ flex: 1, background: "#1a1a2e", border: "1px solid #2a2a4a", color: "#e0e0f0", padding: "10px 14px", borderRadius: 10, fontSize: ".95rem", outline: "none" }} />
        <button onClick={() => sendMessage()} disabled={isLoading || !input.trim()}
          style={{ background: "linear-gradient(135deg,#00d2ff,#a044ff)", border: "none", color: "#fff", padding: "10px 20px", borderRadius: 10, fontWeight: 600, cursor: "pointer", opacity: (isLoading || !input.trim()) ? 0.45 : 1 }}>
          Send
        </button>
      </div>
    </div>
  );
}

const btnStyle = {
  background: "transparent", border: "1px solid rgba(255,255,255,.3)",
  color: "#fff", borderRadius: 6, padding: "2px 10px", cursor: "pointer", fontSize: ".8rem",
};

export default useNiyoX;
