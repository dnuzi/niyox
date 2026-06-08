// src/client.js — NiyoX AI Core Client  v0.0.4
"use strict";

const BASE_URL = "https://ai.dnuz.top/api/ai";

/**
 * NiyoXClient — the core wrapper around the NiyoX AI REST API.
 *
 * v0.0.4 — Context & Memory additions:
 *   • Persona / system prompt  — set once, prepended to every message
 *   • Context window trimming  — auto-prune oldest turns when history is too long
 *   • Conversation export      — dump history as JSON or plain text
 */
class NiyoXClient {
  /**
   * @param {object}  options
   * @param {string}  [options.sessionId="default"]
   * @param {string}  [options.conversationId=null]
   * @param {number}  [options.timeout=30000]           ms per request
   * @param {string}  [options.persona=null]            System-prompt / persona string
   * @param {number}  [options.maxHistory=50]           Max history *entries* (pairs = maxHistory/2).
   *                                                    0 = unlimited.
   */
  constructor(options = {}) {
    this.sessionId       = options.sessionId       || "default";
    this.conversationId  = options.conversationId  || null;
    this.timeout         = options.timeout         || 30000;
    this.history         = [];

    // ── v0.0.4: Context & Memory ──────────────────────────────────────────
    this._persona        = options.persona    || null;   // system prompt string
    this._maxHistory     = options.maxHistory != null ? options.maxHistory : 50; // 0 = unlimited
  }

  // ── Persona / system-prompt ─────────────────────────────────────────────

  /**
   * Set (or clear) the AI persona / system prompt.
   * The persona is transparently prepended to every outgoing message.
   *
   * @param {string|null} text  Pass null or "" to clear.
   * @returns {NiyoXClient}     Chainable.
   *
   * @example
   *   client.setPersona("You are a concise coding assistant. Respond only in code.");
   */
  setPersona(text) {
    this._persona = text ? String(text).trim() : null;
    return this;
  }

  /** Get the currently active persona string (or null). */
  getPersona() { return this._persona; }

  /**
   * Compose the actual query to send, injecting the persona when set.
   * Format:  "[SYSTEM: <persona>]\n\nUser: <message>"
   * @private
   */
  _buildQuery(message) {
    if (!this._persona) return message;
    return `[SYSTEM: ${this._persona}]\n\nUser: ${message}`;
  }

  // ── Context window trimming ─────────────────────────────────────────────

  /**
   * Set the maximum number of history *entries* kept in memory.
   * One chat turn = 2 entries (user + assistant).
   * When the limit is exceeded the oldest entries are pruned.
   *
   * @param {number} max  Set to 0 for unlimited.
   * @returns {NiyoXClient} Chainable.
   *
   * @example
   *   client.setMaxHistory(20);  // keep last 10 turns
   */
  setMaxHistory(max) {
    this._maxHistory = Number(max) || 0;
    this._trimHistory();
    return this;
  }

  /** Get the current maxHistory limit. */
  getMaxHistory() { return this._maxHistory; }

  /** @private — prune oldest entries when over the limit */
  _trimHistory() {
    if (this._maxHistory > 0 && this.history.length > this._maxHistory) {
      this.history = this.history.slice(this.history.length - this._maxHistory);
    }
  }

  // ── Core chat ───────────────────────────────────────────────────────────

  /**
   * Send a message to NiyoX AI and get a response.
   * @param {string} message
   * @returns {Promise<{result: string, conversationId: string, responseTime: number}>}
   */
  async chat(message) {
    const query  = this._buildQuery(message);
    const params = new URLSearchParams({ q: query });
    if (this.conversationId) params.append("conversationId", this.conversationId);
    if (this.sessionId !== "default") params.append("sessionId", this.sessionId);

    const url = `${BASE_URL}?${params.toString()}`;

    const fetch = globalThis.fetch ?? (await import("node-fetch").then(m => m.default).catch(() => null));
    if (!fetch) throw new Error("No fetch available — install node-fetch or use Node 18+");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let data;
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      data = await res.json();
    } finally {
      clearTimeout(timer);
    }

    if (!data.success) throw new Error("API returned success=false");

    if (data.conversationId) this.conversationId = data.conversationId;

    this.history.push({ role: "user",      content: message,     timestamp: new Date() });
    this.history.push({ role: "assistant", content: data.result, timestamp: new Date(), responseTime: data.responseTime });

    // Auto-trim after each turn
    this._trimHistory();

    return {
      result:         data.result,
      conversationId: data.conversationId,
      sessionId:      data.sessionId,
      responseTime:   data.responseTime,
      attempts:       data.attempts,
    };
  }

  /** Alias for chat() */
  async ask(message) { return this.chat(message); }

  /** Clear in-memory history and start a fresh conversation */
  newConversation() {
    this.conversationId = null;
    this.history = [];
  }

  /** Get in-memory chat history (returns a copy) */
  getHistory() { return [...this.history]; }

  // ── Conversation export ─────────────────────────────────────────────────

  /**
   * Export the current in-memory conversation.
   *
   * @param {"json"|"text"|"markdown"} [format="json"]
   * @returns {string}
   *
   * @example
   *   const json = client.exportConversation("json");
   *   fs.writeFileSync("chat.json", json);
   *
   *   const txt = client.exportConversation("text");
   *   console.log(txt);
   */
  exportConversation(format = "json") {
    const fmt = String(format).toLowerCase();

    if (fmt === "json") {
      return JSON.stringify({
        exportedAt:     new Date().toISOString(),
        conversationId: this.conversationId,
        sessionId:      this.sessionId,
        persona:        this._persona,
        messages:       this.history,
      }, null, 2);
    }

    if (fmt === "text") {
      const lines = [];
      if (this._persona)        lines.push(`[Persona: ${this._persona}]\n`);
      if (this.conversationId)  lines.push(`Conversation ID: ${this.conversationId}\n`);
      for (const entry of this.history) {
        const ts    = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : "";
        const label = entry.role === "user" ? "You" : "NiyoX AI";
        const meta  = entry.responseTime ? ` (${entry.responseTime}ms)` : "";
        lines.push(`[${ts}] ${label}${meta}:\n${entry.content}\n`);
      }
      return lines.join("\n");
    }

    if (fmt === "markdown") {
      const lines = [`# NiyoX AI Conversation\n`];
      if (this._persona)        lines.push(`> **Persona:** ${this._persona}\n`);
      if (this.conversationId)  lines.push(`> **ID:** \`${this.conversationId}\`\n`);
      lines.push(`> **Exported:** ${new Date().toISOString()}\n\n---\n`);
      for (const entry of this.history) {
        const ts    = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : "";
        const label = entry.role === "user" ? "**You**" : "**NiyoX AI**";
        const meta  = entry.responseTime ? ` *(${entry.responseTime}ms)*` : "";
        lines.push(`### ${label} — ${ts}${meta}\n\n${entry.content}\n`);
      }
      return lines.join("\n");
    }

    throw new Error(`Unknown export format "${format}". Use "json", "text", or "markdown".`);
  }
}

module.exports = { NiyoXClient, BASE_URL };
