// test/client.test.js  v0.0.4
"use strict";

const { NiyoXClient } = require("../src/client.js");

function mockFetch(payload, status = 200) {
  globalThis.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => payload,
  });
}

afterEach(() => { delete globalThis.fetch; });

const BASE_RESPONSE = {
  success: true, result: "Hello from NiyoX AI!", conversationId: "conv-abc-123",
  sessionId: "default", responseTime: 512, attempts: 1,
};

describe("NiyoXClient", () => {

  describe("construction", () => {
    test("creates with default options", () => {
      const c = new NiyoXClient();
      expect(c.sessionId).toBe("default");
      expect(c.conversationId).toBeNull();
      expect(c.history).toEqual([]);
    });

    test("accepts custom sessionId and conversationId", () => {
      const c = new NiyoXClient({ sessionId: "s1", conversationId: "cid" });
      expect(c.sessionId).toBe("s1");
      expect(c.conversationId).toBe("cid");
    });
  });

  describe("chat()", () => {
    beforeEach(() => mockFetch(BASE_RESPONSE));

    test("returns result string", async () => {
      const res = await new NiyoXClient().chat("Hello!");
      expect(res.result).toBe("Hello from NiyoX AI!");
    });

    test("returns correct metadata fields", async () => {
      const res = await new NiyoXClient().chat("Hi");
      expect(res.conversationId).toBe("conv-abc-123");
      expect(res.responseTime).toBe(512);
    });

    test("persists conversationId after first response", async () => {
      const c = new NiyoXClient();
      await c.chat("Hi");
      expect(c.conversationId).toBe("conv-abc-123");
    });

    test("appends two history entries per turn", async () => {
      const c = new NiyoXClient();
      await c.chat("test");
      expect(c.getHistory()).toHaveLength(2);
      expect(c.getHistory()[0].role).toBe("user");
      expect(c.getHistory()[1].role).toBe("assistant");
    });

    test("ask() is an alias for chat()", async () => {
      const res = await new NiyoXClient().ask("Hello");
      expect(res.result).toBe("Hello from NiyoX AI!");
    });
  });

  describe("error handling", () => {
    test("throws on non-OK HTTP status", async () => {
      mockFetch({ success: false }, 500);
      await expect(new NiyoXClient().chat("test")).rejects.toThrow("HTTP 500");
    });

    test("throws when success is false", async () => {
      mockFetch({ success: false, result: "nope" });
      await expect(new NiyoXClient().chat("test")).rejects.toThrow("success=false");
    });
  });

  describe("newConversation()", () => {
    test("resets conversationId and history", async () => {
      mockFetch({ ...BASE_RESPONSE, conversationId: "cid-1" });
      const c = new NiyoXClient();
      await c.chat("Hello");
      c.newConversation();
      expect(c.conversationId).toBeNull();
      expect(c.history).toEqual([]);
    });
  });

  describe("getHistory()", () => {
    test("returns a copy, not the original array", async () => {
      mockFetch(BASE_RESPONSE);
      const c = new NiyoXClient();
      await c.chat("test");
      const h = c.getHistory();
      h.push({ injected: true });
      expect(c.getHistory()).toHaveLength(2);
    });
  });

  // ── v0.0.4: Persona ──────────────────────────────────────────────────────
  describe("persona (v0.0.4)", () => {
    test("getPersona() returns null by default", () => {
      expect(new NiyoXClient().getPersona()).toBeNull();
    });

    test("setPersona() stores the persona and returns client (chainable)", () => {
      const c = new NiyoXClient();
      const ret = c.setPersona("You are a chef.");
      expect(ret).toBe(c);
      expect(c.getPersona()).toBe("You are a chef.");
    });

    test("setPersona(null) clears the persona", () => {
      const c = new NiyoXClient();
      c.setPersona("chef").setPersona(null);
      expect(c.getPersona()).toBeNull();
    });

    test("persona is accepted via constructor option", () => {
      const c = new NiyoXClient({ persona: "You are a pirate." });
      expect(c.getPersona()).toBe("You are a pirate.");
    });

    test("_buildQuery injects persona into outgoing message", () => {
      const c = new NiyoXClient({ persona: "Be concise." });
      const q = c._buildQuery("Hello");
      expect(q).toContain("[SYSTEM: Be concise.]");
      expect(q).toContain("User: Hello");
    });

    test("_buildQuery returns plain message when no persona set", () => {
      const c = new NiyoXClient();
      expect(c._buildQuery("Hello")).toBe("Hello");
    });

    test("chat() sends persona-injected query and still returns result", async () => {
      let capturedUrl;
      globalThis.fetch = async (url) => {
        capturedUrl = url;
        return { ok: true, status: 200, json: async () => BASE_RESPONSE };
      };
      const c = new NiyoXClient({ persona: "You are a robot." });
      await c.chat("Hello");
      expect(capturedUrl).toContain(encodeURIComponent("SYSTEM:"));
      expect(c.getHistory()[0].content).toBe("Hello");
    });
  });

  // ── v0.0.4: Context window trimming ─────────────────────────────────────
  describe("context window trimming (v0.0.4)", () => {
    test("getMaxHistory() returns 50 by default", () => {
      expect(new NiyoXClient().getMaxHistory()).toBe(50);
    });

    test("setMaxHistory() is chainable", () => {
      const c = new NiyoXClient();
      expect(c.setMaxHistory(10)).toBe(c);
      expect(c.getMaxHistory()).toBe(10);
    });

    test("maxHistory=0 means unlimited", () => {
      const c = new NiyoXClient({ maxHistory: 0 });
      expect(c.getMaxHistory()).toBe(0);
    });

    test("history is trimmed after each chat() turn", async () => {
      mockFetch(BASE_RESPONSE);
      const c = new NiyoXClient({ maxHistory: 4 }); // keep 2 turns
      await c.chat("1"); await c.chat("2"); await c.chat("3");
      expect(c.getHistory().length).toBeLessThanOrEqual(4);
    });

    test("setMaxHistory prunes existing history immediately", async () => {
      mockFetch(BASE_RESPONSE);
      const c = new NiyoXClient({ maxHistory: 0 });
      await c.chat("1"); await c.chat("2"); await c.chat("3");
      expect(c.history).toHaveLength(6);
      c.setMaxHistory(2);
      expect(c.history).toHaveLength(2);
    });
  });

  // ── v0.0.4: Conversation export ──────────────────────────────────────────
  describe("exportConversation (v0.0.4)", () => {
    beforeEach(() => mockFetch(BASE_RESPONSE));

    test("exports as JSON by default", async () => {
      const c = new NiyoXClient();
      await c.chat("Hello");
      const out = c.exportConversation();
      const parsed = JSON.parse(out);
      expect(parsed.messages).toHaveLength(2);
      expect(parsed.conversationId).toBe("conv-abc-123");
    });

    test("exports as text format", async () => {
      const c = new NiyoXClient();
      await c.chat("Hello");
      const out = c.exportConversation("text");
      expect(out).toContain("You:");
      expect(out).toContain("NiyoX AI");
    });

    test("exports as markdown format", async () => {
      const c = new NiyoXClient();
      await c.chat("Hello");
      const out = c.exportConversation("markdown");
      expect(out).toContain("# NiyoX AI Conversation");
      expect(out).toContain("**You**");
      expect(out).toContain("**NiyoX AI**");
    });

    test("includes persona in json export when set", async () => {
      const c = new NiyoXClient({ persona: "Be a chef." });
      await c.chat("Hello");
      const parsed = JSON.parse(c.exportConversation("json"));
      expect(parsed.persona).toBe("Be a chef.");
    });

    test("includes persona in text export when set", async () => {
      const c = new NiyoXClient({ persona: "Be a chef." });
      await c.chat("Hello");
      expect(c.exportConversation("text")).toContain("[Persona: Be a chef.]");
    });

    test("includes persona in markdown export when set", async () => {
      const c = new NiyoXClient({ persona: "Be a chef." });
      await c.chat("Hello");
      expect(c.exportConversation("markdown")).toContain("**Persona:** Be a chef.");
    });

    test("throws on unknown format", async () => {
      const c = new NiyoXClient();
      await c.chat("Hello");
      expect(() => c.exportConversation("xml")).toThrow("Unknown export format");
    });
  });
});
