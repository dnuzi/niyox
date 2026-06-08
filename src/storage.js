// src/storage.js — Optional MongoDB persistence layer  v0.0.4
"use strict";

const DEFAULT_MONGO_URI = "mongodb+srv://danuzdev_db_user:eUcIyqvRaNEKnAtA@niyoxai.tzrs4rg.mongodb.net/";
const DEFAULT_DB_NAME   = "niyox_npm";

const _cache = new Map();

async function getDb(uri = DEFAULT_MONGO_URI, dbName = DEFAULT_DB_NAME) {
  const cacheKey = `${uri}::${dbName}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey).db;
  try {
    const { MongoClient } = require("mongodb");
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const db = client.db(dbName);
    _cache.set(cacheKey, { client, db });
    return db;
  } catch (err) {
    throw new Error(`MongoDB connection failed: ${err.message}`);
  }
}

async function closeDb(uri = DEFAULT_MONGO_URI, dbName = DEFAULT_DB_NAME) {
  const cacheKey = `${uri}::${dbName}`;
  const entry = _cache.get(cacheKey);
  if (entry) {
    await entry.client.close();
    _cache.delete(cacheKey);
  }
}

async function closeAllDb() {
  for (const [, entry] of _cache) await entry.client.close();
  _cache.clear();
}

/**
 * NiyoXStorage — handles optional persistent chat/session storage.
 *
 * v0.0.4 — Context & Memory additions:
 *   • savePersona / getPersona   — persist AI persona per-user in MongoDB
 *   • exportConversation         — export a stored conversation as JSON / text / markdown
 */
class NiyoXStorage {
  constructor(userId = "anonymous", options = {}) {
    this.userId   = userId;
    this.mongoUri = options.mongoUri || DEFAULT_MONGO_URI;
    this.dbName   = options.dbName   || DEFAULT_DB_NAME;
    this.enabled  = false;
  }

  _getDb() { return getDb(this.mongoUri, this.dbName); }

  async connect(userId, mongoUri, dbName) {
    if (userId)   this.userId   = userId;
    if (mongoUri) this.mongoUri = mongoUri;
    if (dbName)   this.dbName   = dbName;
    await this._getDb();
    this.enabled = true;
    return this;
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  async saveMessage({ conversationId, role, content, responseTime = null }) {
    if (!this.enabled) return null;
    const db   = await this._getDb();
    const doc  = { userId: this.userId, conversationId, role, content, responseTime, createdAt: new Date() };
    const res  = await db.collection("messages").insertOne(doc);
    return res.insertedId;
  }

  async saveTurn({ conversationId, userMessage, assistantMessage, responseTime }) {
    if (!this.enabled) return;
    await Promise.all([
      this.saveMessage({ conversationId, role: "user",      content: userMessage }),
      this.saveMessage({ conversationId, role: "assistant", content: assistantMessage, responseTime }),
    ]);
  }

  async getConversation(conversationId) {
    if (!this.enabled) return [];
    const db = await this._getDb();
    return db.collection("messages")
      .find({ conversationId, userId: this.userId })
      .sort({ createdAt: 1 })
      .toArray();
  }

  async listConversations() {
    if (!this.enabled) return [];
    const db = await this._getDb();
    return db.collection("messages").distinct("conversationId", { userId: this.userId });
  }

  async deleteConversation(conversationId) {
    if (!this.enabled) return 0;
    const db  = await this._getDb();
    const res = await db.collection("messages").deleteMany({ conversationId, userId: this.userId });
    return res.deletedCount;
  }

  // ── Persona persistence (v0.0.4) ─────────────────────────────────────────

  /**
   * Persist the user's preferred AI persona to MongoDB.
   * Automatically applied by NiyoXAI.enableStorage() if the client has no persona set.
   *
   * @param {string|null} persona  Pass null to clear.
   *
   * @example
   *   await store.savePersona("You are a friendly cooking assistant.");
   */
  async savePersona(persona) {
    return this.setPref("__persona__", persona ?? null);
  }

  /**
   * Load the persisted persona for this user.
   * @returns {Promise<string|null>}
   */
  async getPersona() {
    return this.getPref("__persona__", null);
  }

  // ── Conversation export (v0.0.4) ─────────────────────────────────────────

  /**
   * Export a stored conversation from MongoDB as a formatted string.
   *
   * @param {string}                    conversationId
   * @param {"json"|"text"|"markdown"}  [format="json"]
   * @returns {Promise<string>}
   *
   * @example
   *   const md = await store.exportConversation("conv-abc-123", "markdown");
   *   fs.writeFileSync("chat.md", md);
   */
  async exportConversation(conversationId, format = "json") {
    const messages = await this.getConversation(conversationId);
    const fmt      = String(format).toLowerCase();

    if (fmt === "json") {
      return JSON.stringify({
        exportedAt:     new Date().toISOString(),
        conversationId,
        userId:         this.userId,
        messages,
      }, null, 2);
    }

    if (fmt === "text") {
      const lines = [`Conversation: ${conversationId}\nUser: ${this.userId}\n`];
      for (const m of messages) {
        const ts    = m.createdAt ? new Date(m.createdAt).toLocaleString() : "";
        const label = m.role === "user" ? "You" : "NiyoX AI";
        const meta  = m.responseTime ? ` (${m.responseTime}ms)` : "";
        lines.push(`[${ts}] ${label}${meta}:\n${m.content}\n`);
      }
      return lines.join("\n");
    }

    if (fmt === "markdown") {
      const lines = [
        `# NiyoX AI Conversation\n`,
        `> **ID:** \`${conversationId}\`  `,
        `> **User:** ${this.userId}  `,
        `> **Exported:** ${new Date().toISOString()}\n\n---\n`,
      ];
      for (const m of messages) {
        const ts    = m.createdAt ? new Date(m.createdAt).toLocaleString() : "";
        const label = m.role === "user" ? "**You**" : "**NiyoX AI**";
        const meta  = m.responseTime ? ` *(${m.responseTime}ms)*` : "";
        lines.push(`### ${label} — ${ts}${meta}\n\n${m.content}\n`);
      }
      return lines.join("\n");
    }

    throw new Error(`Unknown export format "${format}". Use "json", "text", or "markdown".`);
  }

  // ── Preferences ───────────────────────────────────────────────────────────

  async setPref(key, value) {
    if (!this.enabled) return;
    const db = await this._getDb();
    await db.collection("user_prefs").updateOne(
      { userId: this.userId, key },
      { $set: { value, updatedAt: new Date() } },
      { upsert: true }
    );
  }

  async getPref(key, defaultValue = null) {
    if (!this.enabled) return defaultValue;
    const db  = await this._getDb();
    const doc = await db.collection("user_prefs").findOne({ userId: this.userId, key });
    return doc ? doc.value : defaultValue;
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  async getStats() {
    if (!this.enabled) return null;
    const db   = await this._getDb();
    const coll = db.collection("messages");
    const [total, conversations, avgTime] = await Promise.all([
      coll.countDocuments({ userId: this.userId }),
      coll.distinct("conversationId", { userId: this.userId }),
      coll.aggregate([
        { $match: { userId: this.userId, role: "assistant", responseTime: { $ne: null } } },
        { $group: { _id: null, avg: { $avg: "$responseTime" } } },
      ]).toArray(),
    ]);
    return {
      totalMessages:      total,
      totalConversations: conversations.length,
      avgResponseTimeMs:  avgTime[0]?.avg?.toFixed(0) ?? "N/A",
    };
  }

  async disconnect() {
    await closeDb(this.mongoUri, this.dbName);
    this.enabled = false;
  }
}

module.exports = { NiyoXStorage, getDb, closeDb, closeAllDb };
