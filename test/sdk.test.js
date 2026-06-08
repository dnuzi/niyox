// test/sdk.test.js  v0.0.4
"use strict";

const { NiyoXAI, NiyoXClient, NiyoXStorage } = require("../lib/index.cjs");

function mockFetch(overrides = {}) {
  const payload = Object.assign({
    success: true, result: "Mock AI response", conversationId: "mock-conv-id",
    sessionId: "default", responseTime: 300, attempts: 1,
  }, overrides);
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => payload });
  return payload;
}

afterEach(() => { delete globalThis.fetch; });

// ── exports ──────────────────────────────────────────────────────────────────
describe("exports", () => {
  test("package exports NiyoXAI, NiyoXClient, NiyoXStorage", () => {
    expect(typeof NiyoXAI).toBe("function");
    expect(typeof NiyoXClient).toBe("function");
    expect(typeof NiyoXStorage).toBe("function");
  });
});

// ── NiyoXAI base ─────────────────────────────────────────────────────────────
describe("NiyoXAI", () => {
  describe("construction", () => {
    test("creates with default userId", () => {
      const ai = new NiyoXAI();
      expect(ai.storage.userId).toBe("anonymous");
      expect(ai.storage.enabled).toBe(false);
    });

    test("accepts userId option", () => {
      expect(new NiyoXAI({ userId: "alice" }).storage.userId).toBe("alice");
    });
  });

  describe("chat()", () => {
    test("returns result and metadata", async () => {
      mockFetch({ result: "The sky is blue." });
      const res = await new NiyoXAI().chat("Why is the sky blue?");
      expect(res.result).toBe("The sky is blue.");
      expect(res.conversationId).toBe("mock-conv-id");
      expect(typeof res.responseTime).toBe("number");
    });

    test("ask() delegates to chat()", async () => {
      mockFetch({ result: "42" });
      expect((await new NiyoXAI().ask("What is the answer?")).result).toBe("42");
    });

    test("does NOT call storage.saveTurn when storage disabled", async () => {
      mockFetch();
      const ai  = new NiyoXAI();
      const spy = jest.spyOn(ai.storage, "saveTurn");
      await ai.chat("Hello");
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("conversation management", () => {
    test("newConversation() resets client state", async () => {
      mockFetch({ conversationId: "cid-first" });
      const ai = new NiyoXAI();
      await ai.chat("First");
      expect(ai.client.conversationId).toBe("cid-first");
      ai.newConversation();
      expect(ai.client.conversationId).toBeNull();
      expect(ai.client.history).toHaveLength(0);
    });

    test("getHistory() returns current session history", async () => {
      mockFetch();
      const ai = new NiyoXAI();
      await ai.chat("One");
      await ai.chat("Two");
      const h = ai.getHistory();
      expect(h).toHaveLength(4);
      expect(h[0].role).toBe("user");
      expect(h[0].content).toBe("One");
    });

    test("getConversationId() returns null before first chat", () => {
      expect(new NiyoXAI().getConversationId()).toBeNull();
    });

    test("getConversationId() returns id after first chat", async () => {
      mockFetch({ conversationId: "cid-xyz" });
      const ai = new NiyoXAI();
      await ai.chat("Hello");
      expect(ai.getConversationId()).toBe("cid-xyz");
    });
  });
});

// ── v0.0.4: Persona ───────────────────────────────────────────────────────────
describe("NiyoXAI — persona (v0.0.4)", () => {
  test("getPersona() returns null by default", () => {
    expect(new NiyoXAI().getPersona()).toBeNull();
  });

  test("setPersona() (sync path, no storage) updates client persona", async () => {
    const ai = new NiyoXAI();
    await ai.setPersona("You are a chef.");
    expect(ai.getPersona()).toBe("You are a chef.");
  });

  test("setPersona() is awaitable and returns the instance", async () => {
    const ai  = new NiyoXAI();
    const ret = await ai.setPersona("chef");
    expect(ret).toBe(ai);
  });

  test("persona is passed through constructor options", () => {
    const ai = new NiyoXAI({ persona: "Be brief." });
    expect(ai.getPersona()).toBe("Be brief.");
  });

  test("setPersona(null) clears the persona", async () => {
    const ai = new NiyoXAI({ persona: "chef" });
    await ai.setPersona(null);
    expect(ai.getPersona()).toBeNull();
  });

  test("does NOT call storage.savePersona when storage is disabled", async () => {
    const ai  = new NiyoXAI();
    const spy = jest.spyOn(ai.storage, "savePersona");
    await ai.setPersona("chef");
    expect(spy).not.toHaveBeenCalled();
  });
});

// ── v0.0.4: Context window trimming ──────────────────────────────────────────
describe("NiyoXAI — setMaxHistory (v0.0.4)", () => {
  test("getMaxHistory() returns 50 by default", () => {
    expect(new NiyoXAI().getMaxHistory()).toBe(50);
  });

  test("setMaxHistory() is chainable", () => {
    const ai = new NiyoXAI();
    expect(ai.setMaxHistory(10)).toBe(ai);
    expect(ai.getMaxHistory()).toBe(10);
  });

  test("maxHistory option is forwarded to client", () => {
    expect(new NiyoXAI({ maxHistory: 6 }).getMaxHistory()).toBe(6);
  });

  test("history stays within limit across multiple turns", async () => {
    mockFetch();
    const ai = new NiyoXAI({ maxHistory: 4 });
    await ai.chat("1"); await ai.chat("2"); await ai.chat("3");
    expect(ai.getHistory().length).toBeLessThanOrEqual(4);
  });
});

// ── v0.0.4: Conversation export ───────────────────────────────────────────────
describe("NiyoXAI — exportConversation (v0.0.4)", () => {
  test("falls back to in-memory export when storage disabled", async () => {
    mockFetch({ result: "Hi there" });
    const ai = new NiyoXAI();
    await ai.chat("Hello");
    const out    = await ai.exportConversation(null, "json");
    const parsed = JSON.parse(out);
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[1].content).toBe("Hi there");
  });

  test("in-memory text export contains role labels", async () => {
    mockFetch({ result: "Hi there" });
    const ai = new NiyoXAI();
    await ai.chat("Hello");
    const out = await ai.exportConversation(null, "text");
    expect(out).toContain("You:");
    expect(out).toContain("NiyoX AI");
  });

  test("in-memory markdown export contains heading", async () => {
    mockFetch();
    const ai = new NiyoXAI();
    await ai.chat("Hello");
    const out = await ai.exportConversation(null, "markdown");
    expect(out).toContain("# NiyoX AI Conversation");
  });

  test("persona appears in JSON export", async () => {
    mockFetch();
    const ai = new NiyoXAI({ persona: "Be a chef." });
    await ai.chat("Hello");
    const parsed = JSON.parse(await ai.exportConversation(null, "json"));
    expect(parsed.persona).toBe("Be a chef.");
  });
});

// ── NiyoXStorage offline mode ─────────────────────────────────────────────────
describe("NiyoXStorage (offline mode)", () => {
  test("enabled is false by default", () => {
    expect(new NiyoXStorage("user1").enabled).toBe(false);
  });

  test("saveMessage returns null when disabled", async () => {
    expect(await new NiyoXStorage().saveMessage({ conversationId: "c", role: "user", content: "hi" })).toBeNull();
  });

  test("saveTurn is a no-op when disabled", async () => {
    await expect(
      new NiyoXStorage().saveTurn({ conversationId: "c", userMessage: "hi", assistantMessage: "hey", responseTime: 100 })
    ).resolves.toBeUndefined();
  });

  test("getConversation returns [] when disabled", async () => {
    expect(await new NiyoXStorage().getConversation("any")).toEqual([]);
  });

  test("listConversations returns [] when disabled", async () => {
    expect(await new NiyoXStorage().listConversations()).toEqual([]);
  });

  test("getStats returns null when disabled", async () => {
    expect(await new NiyoXStorage().getStats()).toBeNull();
  });

  test("getPref returns defaultValue when disabled", async () => {
    expect(await new NiyoXStorage().getPref("theme", "light")).toBe("light");
  });

  test("deleteConversation returns 0 when disabled", async () => {
    expect(await new NiyoXStorage().deleteConversation("any")).toBe(0);
  });

  // v0.0.4 storage offline tests
  test("getPersona returns null when disabled", async () => {
    expect(await new NiyoXStorage().getPersona()).toBeNull();
  });

  test("savePersona is a no-op when disabled", async () => {
    await expect(new NiyoXStorage().savePersona("chef")).resolves.toBeUndefined();
  });

  test("exportConversation returns empty JSON when disabled", async () => {
    const out    = await new NiyoXStorage("u1").exportConversation("c1", "json");
    const parsed = JSON.parse(out);
    expect(parsed.messages).toEqual([]);
  });

  test("exportConversation returns empty text when disabled", async () => {
    const out = await new NiyoXStorage("u1").exportConversation("c1", "text");
    expect(typeof out).toBe("string");
  });

  test("exportConversation returns empty markdown when disabled", async () => {
    const out = await new NiyoXStorage("u1").exportConversation("c1", "markdown");
    expect(out).toContain("# NiyoX AI Conversation");
  });

  test("exportConversation throws on unknown format", async () => {
    await expect(
      new NiyoXStorage("u1").exportConversation("c1", "xml")
    ).rejects.toThrow("Unknown export format");
  });
});
