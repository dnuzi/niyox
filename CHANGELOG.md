# Changelog

All notable changes to **NiyoX AI** are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Streaming response support
- OpenAI-compatible interface shim

---

## [0.0.4] — 2025-06-08

### Added

#### Persona / System Prompt (`src/client.js`, `src/storage.js`)
- `NiyoXClient` constructor now accepts a `persona` option — a system-prompt string prepended to every outgoing message automatically
- `setPersona(text)` — set or clear the active persona at runtime; chainable, returns the client
- `getPersona()` — returns the current persona string or `null`
- `_buildQuery(message)` — internal method that injects `[SYSTEM: <persona>]\n\nUser: <message>` when a persona is set; plain message passed through when no persona is active
- `NiyoXStorage.savePersona(text)` — persist the user's preferred persona to MongoDB (stored as a user preference under the key `__persona__`)
- `NiyoXStorage.getPersona()` — load the persisted persona for the current user
- `NiyoXAI.setPersona(text)` — async wrapper; updates the client and, when storage is enabled, saves the persona to MongoDB
- `NiyoXAI.getPersona()` — delegates to `NiyoXClient.getPersona()`
- `NiyoXAI.enableStorage()` now auto-restores the saved persona from MongoDB when the client has no persona set
- `persona` option forwarded through `NiyoXAI` constructor to `NiyoXClient`
- `useNiyoX()` hook returns `persona` (string | null) and `setPersona(text)` 
- `<NiyoXChat>` accepts a `persona` prop; header now includes a 🎭 Persona button that opens an inline editor
- `<NiyoXProvider>` forwards `persona` option to `useNiyoX`

#### Context Window Trimming (`src/client.js`)
- `NiyoXClient` constructor now accepts a `maxHistory` option (default `50`); set to `0` for unlimited
- `setMaxHistory(n)` — update the limit at runtime; immediately prunes existing history if over the new limit; chainable
- `getMaxHistory()` — returns the current limit
- `_trimHistory()` — internal; called after every `chat()` turn and after `setMaxHistory()`; slices the oldest entries when the array exceeds the limit
- `NiyoXAI.setMaxHistory(n)` / `NiyoXAI.getMaxHistory()` — delegate to the client; chainable
- `maxHistory` option forwarded through `NiyoXAI` constructor to `NiyoXClient`
- `useNiyoX()` hook returns `maxHistory` (number) and `setMaxHistory(n)`
- `<NiyoXChat>` accepts a `maxHistory` prop

#### Conversation Export (`src/client.js`, `src/storage.js`)
- `NiyoXClient.exportConversation(format?)` — export in-memory history as `"json"` (default), `"text"`, or `"markdown"`; throws on unknown format
- `NiyoXStorage.exportConversation(conversationId, format?)` — export a stored MongoDB conversation in the same three formats
- `NiyoXAI.exportConversation(conversationId?, format?)` — smart router: uses MongoDB export when storage is enabled and a conversation ID is available; falls back to in-memory client export otherwise
- JSON export includes `exportedAt`, `conversationId`, `sessionId`, `persona`, and `messages` array
- Text export includes optional `[Persona: ...]` header, conversation ID, and per-message timestamps + response times
- Markdown export is GitHub-flavoured with headings, bold role labels, and response-time annotations
- `useNiyoX()` hook returns `exportConversation(format?)` 
- `<NiyoXChat>` accepts a `showExport` prop (default `true`); header shows an ⬇ Export button that downloads the conversation as a JSON file

#### Tests
- 30 new test cases added across `test/client.test.js` and `test/sdk.test.js`
- Total test count: **68** (up from 38 in v0.0.3)
- New coverage areas: persona constructor / runtime / MongoDB / query injection, maxHistory constructor / runtime / trimming behaviour, export JSON / text / markdown / persona inclusion / unknown-format error, NiyoXAI delegation, NiyoXStorage offline persona and export, in-memory fallback export

### Changed
- `package.json` version bumped to `0.0.4`
- `[Unreleased]` planned section: removed "Conversation export (JSON / Markdown)" — shipped in this release

---

## [0.0.3] — 2025-05-29

### Removed
- **Python SDK** (`python/niyox.py`, `setup.py`, `README_PYTHON.md`) — removed from the npm package; the Python SDK will be maintained as a separate PyPI project (`niyox-ai`)
- `python/` directory removed from the `files` array in `package.json`
- `"python"` keyword removed from `package.json`
- All Python documentation, examples, and API reference removed from `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, and `SECURITY.md`

### Changed
- `package.json` version bumped to `0.0.3`

---

## [0.0.2] — 2025-05-29

### Added

#### Custom MongoDB support
- `NiyoXStorage` constructor now accepts `mongoUri` and `dbName` options — plug in any MongoDB instance instead of the shared NiyoX cloud database
- `connect(userId?, mongoUri?, dbName?)` accepts override arguments at connect-time for dynamic configuration
- Connections are cached per-URI so multiple `NiyoXStorage` instances pointing at the same database share one `MongoClient`
- `closeAllDb()` helper exported for graceful shutdown of all open connections
- `NiyoXAI` constructor forwards `mongoUri` / `dbName` options through to `NiyoXStorage`
- `enableStorage(userId?, mongoUri?, dbName?)` accepts the same overrides

#### React / Vite / Next.js (`react/useNiyoX.js`)
- `useNiyoX(options?)` hook — returns `messages`, `input`, `setInput`, `sendMessage`, `isLoading`, `error`, `newConversation`, `conversationId`
- `<NiyoXChat>` — drop-in styled dark-theme chat component, zero extra dependencies
- `<NiyoXProvider>` + `useNiyoXContext()` — share a single AI session across a React component tree
- Compatible with React 17/18, Create React App, Vite, and Next.js App Router (`"use client"` directive included)
- Importable as `import { useNiyoX } from "niyox/react"` via the new exports map entry

#### CLI (`bin/cli.js`)
- `/mongo <url>` — connect to a custom MongoDB URI directly from the REPL
- `/mongourl <url>` — update the saved URI without reconnecting; persisted across sessions via `conf`
- Custom URI and `useMongo` flag are both saved to local config and restored on next launch
- Banner and help table updated to document the new commands

#### Examples
- `examples/react-cra/App.jsx` — full chat UI using `useNiyoX` for Create React App / Vite
- `examples/nextjs/chat-page.tsx` — Next.js 13+ App Router page with Tailwind styling
- `examples/vite/main.js` — Vite vanilla JS example with no framework

### Changed
- `package.json` version bumped to `0.0.2`
- `exports` map extended with `"./react"` entry
- `files` array extended to include `react/` and `examples/`
- `peerDependencies` added for `react` / `react-dom` (both optional)
- `keywords` extended with `react`, `nextjs`, `vite`, `mongodb`
- `SECURITY.md` — Known Considerations updated to reflect custom MongoDB URI feature

### Fixed
- Storage connection cache now keyed by both URI and database name, preventing cross-database collisions when two instances share the same URI but different `dbName` values

---

## [0.0.1] — 2024-01-01

### Added
- `NiyoXClient` — core HTTP wrapper around the `ai.dnuz.top` REST API
  - `chat(message)` / `ask(message)` for sending messages
  - In-memory conversation history with `getHistory()`
  - `newConversation()` to reset conversation thread
  - Automatic `conversationId` persistence for multi-turn sessions
- `NiyoXStorage` — optional MongoDB persistence layer
  - `connect()` / `disconnect()`
  - `saveMessage()` / `saveTurn()`
  - `getConversation()` / `listConversations()` / `deleteConversation()`
  - `getStats()` for per-user usage statistics
  - `setPref()` / `getPref()` for persistent user preferences
- `NiyoXAI` — high-level SDK combining client and storage
  - `enableStorage()` opt-in
  - Full delegation to `NiyoXClient` and `NiyoXStorage`
- **CLI** (`bin/cli.js`) with interactive REPL
  - Commands: `/help`, `/new`, `/history`, `/stats`, `/convs`, `/mongo`, `/user`, `/clear`, `/exit`
  - One-shot mode: `niyox "your question"`
  - `--version` / `-v` and `--help` / `-h` flags
  - Markdown rendering with syntax highlighting
  - Coloured boxed responses with response-time display
- **Browser SDK** (`html/index.html`) — zero-dependency chat UI
- **ESM + CJS dual build** (`lib/index.mjs`, `lib/index.cjs`)
- Jest test suite — 28 tests, ~94 % statement coverage
- GitHub Actions CI/CD workflow
- MIT licence

---

[Unreleased]: https://github.com/dnuzi/niyox/compare/v0.0.4...HEAD
[0.0.4]: https://github.com/dnuzi/niyox/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/dnuzi/niyox/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/dnuzi/niyox/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/dnuzi/niyox/releases/tag/v0.0.1
