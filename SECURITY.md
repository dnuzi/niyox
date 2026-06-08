# Security Policy

## Supported Versions

| Version | Supported |
|---|:---:|
| 0.0.4 (latest) | ✅ |
| 0.0.3 | ❌ |
| 0.0.2 | ❌ |
| 0.0.1 | ❌ |
| < 0.0.1 | ❌ |

As NiyoX AI is pre-1.0, security fixes are applied to the latest release only. Always upgrade to the latest version.

---

## Reporting a Vulnerability

**Please do not open a public GitHub Issue for security vulnerabilities.**

If you discover a security issue, please report it privately:

1. Go to the [Security tab](https://github.com/dnuzi/niyox/security/advisories/new) on GitHub and open a **private advisory**, or
2. Email the maintainer directly (see the author field in `package.json`).

Include as much detail as possible:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (optional but appreciated)

You can expect an acknowledgement within **48 hours** and a status update within **7 days**.

---

## Disclosure Policy

We follow a **coordinated disclosure** model:

1. Reporter submits the vulnerability privately.
2. Maintainer confirms, assesses severity, and begins a fix.
3. A patched release is published.
4. A public advisory is opened **after** the patch is available.

We ask that you give us a reasonable timeframe (typically **14 days**) to address the issue before any public disclosure.

---

## Known Considerations

**MongoDB URI handling**
- The default connection string in `src/storage.js` uses a shared cloud database intended for demo and development use only. Do not store sensitive or production data using the default URI.
- As of **v0.0.2**, you can (and should) supply your own MongoDB instance for any production or sensitive workload:
  ```js
  // Node.js
  const ai = new NiyoXAI({
    mongoUri: "mongodb+srv://user:pass@your-cluster.mongodb.net/",
    dbName:   "your_db",
  });

  // CLI
  /mongo mongodb+srv://user:pass@your-cluster.mongodb.net/
  ```
- Never commit a `mongoUri` containing credentials to source control. Use environment variables instead:
  ```js
  const ai = new NiyoXAI({ mongoUri: process.env.MONGO_URI });
  ```

**Persona / system prompt (v0.0.4)**
- The `persona` string is sent as plain text in the query parameter of every request (`q=...`). Do not include secrets, API keys, or sensitive user data in a persona string.
- When storage is enabled, personas are persisted to MongoDB under the `user_prefs` collection. Apply the same access controls to this collection as to your `messages` collection.
- Personas set via `<NiyoXChat>` or `useNiyoX()` originate in the browser and are visible in network requests. Do not rely on client-side persona strings as a security boundary.

**Conversation export (v0.0.4)**
- `exportConversation()` returns the full conversation history, including all user messages. Treat exported files as sensitive data — they may contain personal information typed by your users.
- The ⬇ Export button in `<NiyoXChat>` triggers a client-side download directly in the user's browser; no data is sent to a third-party server during export.
- When exporting from MongoDB via `NiyoXStorage.exportConversation()`, ensure the caller is authorised to access the conversation before calling the method — the storage layer does not perform its own authorisation check beyond matching `userId`.

**API endpoint**
- All AI requests are sent to `https://ai.dnuz.top/api/ai` over HTTPS. No API keys are required or transmitted by the client at this time.

**React / browser client**
- The React hook and browser client (`react/useNiyoX.js`, `html/index.html`) make requests directly from the browser to `ai.dnuz.top`. Do not proxy sensitive user data through this endpoint in production without your own server-side layer.
- The `persona` and `maxHistory` options in `useNiyoX()` / `<NiyoXChat>` are client-side only and do not add any server-side access control.

**No authentication layer**
- The CLI and SDK do not authenticate the end user. Access controls are the responsibility of the deploying application.

---

## Out of Scope

The following are **not** considered security vulnerabilities for this project:

- Rate limiting or abuse of the public `ai.dnuz.top` API endpoint
- Issues in third-party dependencies (please report those upstream)
- Theoretical attacks with no practical exploit path

---

Thank you for helping keep NiyoX AI safe! 🔒
