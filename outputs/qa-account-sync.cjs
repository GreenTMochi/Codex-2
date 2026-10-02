const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "offline.html"), "utf8");
const start = html.indexOf("      function cloneAccountSnapshot");
const end = html.indexOf("      function applyAccountSnapshot", start);
assert(start > 0 && end > start, "account merge implementation is present");

const context = {};
vm.createContext(context);
vm.runInContext(`${html.slice(start, end)}\nthis.mergeAccountSnapshots = mergeAccountSnapshots;`, context);
const merge = (base, local, remote) => JSON.parse(JSON.stringify(context.mergeAccountSnapshots(base, local, remote)));

const pileBase = { store: { piles: [{ id: "p", name: "Questions", technique_id: "teaching" }], pile_sessions: [] }, local: {} };
const pileLocal = { store: { piles: [{ id: "p", name: "Questions", technique_id: "", pile_type: "full_pass" }], pile_sessions: [{ id: "pass", pile_id: "p", pile_type: "full_pass", shared_applied: false, session_ids: ["a", "b"] }] }, local: {} };
const pileRemote = { store: { piles: [{ id: "p", name: "Renamed questions", technique_id: "teaching" }], pile_sessions: [] }, local: {} };
const pileMerged = merge(pileBase, pileLocal, pileRemote).store;
assert.strictEqual(pileMerged.piles[0].pile_type, "full_pass", "Full Pass type survives concurrent changes from an older device");
assert.strictEqual(pileMerged.piles[0].technique_id, "", "an older snapshot cannot restore the cleared shared technique");
assert.strictEqual(pileMerged.piles[0].name, "Renamed questions", "independent pile edits are retained");
assert.strictEqual(pileMerged.pile_sessions[0].pile_type, "full_pass", "Full Pass history survives account merging");

const datesBase = { store: { blocks: [{ id: "a", name: "A" }], tasks: [], sessions: [] }, local: {} };
const datesLocal = { store: { blocks: [{ id: "a", name: "A", assessment_mode: "pre_assessment", manual_pre_assessment: true, manual_assessment_unit_id: "unit" }], tasks: [{ id: "manual-a", block_id: "a", stage: "pre_assessment", cycle: 1, scheduled_date: "2026-09-20", schedule_source: "manual_pre_assessment", status: "planned" }], sessions: [] }, local: {} };
const datesRemote = { store: { blocks: [{ id: "a", name: "Renamed A" }], tasks: [], sessions: [{ id: "old-session", block_id: "a", stage: "two_week_review", confidence: 4 }] }, local: {} };
const datesMerged = merge(datesBase, datesLocal, datesRemote).store;
assert.strictEqual(datesMerged.blocks[0].manual_pre_assessment, true, "manual scheduling survives independent account edits");
assert.strictEqual(datesMerged.blocks[0].name, "Renamed A");
assert.strictEqual(datesMerged.tasks[0].scheduled_date, "2026-09-20", "the selected calendar date survives sync");
assert.strictEqual(datesMerged.sessions[0].id, "old-session", "manual schedules do not replace concurrently saved history");

const base = { store: { blocks: [{ id: "a", name: "A", confidence: 1 }] }, local: { settings: "old" } };
const localAdded = { store: { blocks: [{ id: "a", name: "A", confidence: 1 }, { id: "local", name: "Local" }] }, local: { settings: "old" } };
const remoteAdded = { store: { blocks: [{ id: "a", name: "A", confidence: 1 }, { id: "remote", name: "Remote" }] }, local: { settings: "old" } };
assert.deepStrictEqual(merge(base, localAdded, remoteAdded).store.blocks.map(row => row.id), ["a", "remote", "local"], "independent additions from two devices are preserved");
const extrasBase = { store: { extra_sessions: [] }, local: {} }, extrasLocal = { store: { extra_sessions: [{ id: "extra-local", block_id: "a", name: "Local extra" }] }, local: {} }, extrasRemote = { store: { extra_sessions: [{ id: "extra-remote", block_id: "a", name: "Remote extra" }] }, local: {} };
assert.deepStrictEqual(merge(extrasBase, extrasLocal, extrasRemote).store.extra_sessions.map(row => row.id), ["extra-remote", "extra-local"], "independently scheduled Custom Sessions merge across devices");

const localEdit = { store: { blocks: [{ id: "a", name: "Local name", confidence: 1 }] }, local: { settings: "old" } };
const remoteEdit = { store: { blocks: [{ id: "a", name: "A", confidence: 5 }] }, local: { settings: "old" } };
assert.deepStrictEqual(merge(base, localEdit, remoteEdit).store.blocks[0], { id: "a", name: "Local name", confidence: 5 }, "independent field edits are merged");

assert.deepStrictEqual(merge(base, { store: { blocks: [] }, local: { settings: "old" } }, base).store.blocks, [], "a local deletion is retained when remote data is unchanged");
assert.deepStrictEqual(merge(base, base, { store: { blocks: [] }, local: { settings: "old" } }).store.blocks, [], "a remote deletion is retained when local data is unchanged");

const sameField = merge(base, { store: { blocks: [{ id: "a", name: "Local wins", confidence: 1 }] }, local: { settings: "old" } }, { store: { blocks: [{ id: "a", name: "Remote", confidence: 1 }] }, local: { settings: "old" } });
assert.strictEqual(sameField.store.blocks[0].name, "Local wins", "the current device wins only a true same-field conflict");

assert(html.includes('keepalive: Boolean(allowKeepalive && requestBody.length < 60000)'), "ordinary account saves do not force keepalive mode");
assert(html.includes("function scheduleAccountSyncRetry()"), "failed account saves are retried automatically");
assert(html.includes("window.addEventListener(\"focus\", pullAccountState)"), "a focused device pulls newer account data");
assert(html.includes("setInterval(() => { if (document.visibilityState !== \"hidden\") pullAccountState(); }, 20000)"), "visible devices poll for remote changes");
assert(html.includes("window.__SIR_ACCOUNT_REVISION__"), "the client uses the server revision supplied at bootstrap");
assert(html.includes("const accountSyncClientId = sessionStorage.getItem(syncClientIdKey)"), "each browser tab receives an independent sync identity");
assert(html.includes("sessionStorage.setItem(syncClientSeqKey"), "sync sequence counters are isolated per browser tab");
assert(!html.includes("localStorage.setItem(syncClientSeqKey"), "shared local storage cannot make separate tabs reuse one save sequence");
assert(html.includes('pendingSyncKey = `${pendingSyncPrefix}::${accountSyncClientId}`'), "each tab retains its own unsynced-change marker");
assert(html.includes("Object.keys(localStorage).some(storageKey => storageKey.startsWith"), "startup detects unsynced data left by any earlier tab");

const serverPath = path.join(__dirname, "..", "dist", "server", "index.js");
const server = fs.readFileSync(serverPath, "utf8");
assert(server.includes('request.headers.get("oai-authenticated-user-id")'), "server data is keyed to the stable authenticated user ID");
assert(server.includes("WHERE user_email = ? AND revision = ?"), "server writes use compare-and-swap revision protection");
assert(server.includes("refresh_required: true"), "old clients are blocked from blind whole-account overwrites");
assert(server.includes("revision = revision + 1"), "every accepted save advances the canonical revision");
assert(server.includes("INSERT OR IGNORE INTO user_state_history"), "accepted account changes preserve the prior canonical snapshot");
assert(server.includes('url.pathname === "/api/notebook-history"'), "Notebook recovery exposes authenticated account snapshots");

class MockDatabase {
  constructor() { this.row = null; this.history = new Map(); this.columns = new Set(["user_email", "data", "updated_at"]); }
  async batch(statements) { for (const statement of statements) await statement.run(); }
  prepare(sql) {
    const db = this;
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async all() {
        if (sql.startsWith("PRAGMA table_info")) return { results: [...db.columns].map(name => ({ name })) };
        if (sql.startsWith("SELECT revision, data, updated_at FROM user_state_history")) return { results: [...db.history.values()].filter(row => row.user_email === this.values[0]).sort((a, b) => b.revision - a.revision).slice(0, 50).map(({ revision, data, updated_at }) => ({ revision, data, updated_at })) };
        return { results: [] };
      },
      async first() {
        if (!db.row) return null;
        if (sql.includes("WHERE user_id = ?")) return db.row.user_id === this.values[0] ? { ...db.row } : null;
        if (sql.includes("WHERE user_email = ?")) return db.row.user_email === this.values[0] ? { ...db.row } : null;
        return null;
      },
      async run() {
        if (sql.startsWith("ALTER TABLE user_state ADD COLUMN")) { db.columns.add(sql.split(" ")[5]); return { meta: { changes: 0 } }; }
        if (sql.startsWith("CREATE ")) return { meta: { changes: 0 } };
        if (sql.startsWith("UPDATE user_state SET user_id = ? WHERE user_email")) { if (db.row?.user_email === this.values[1] && !db.row.user_id) db.row.user_id = this.values[0]; return { meta: { changes: 1 } }; }
        if (sql.startsWith("INSERT INTO user_state")) {
          if (db.row) throw new Error("UNIQUE constraint failed");
          db.row = { user_email: this.values[0], user_id: this.values[1], data: this.values[2], updated_at: new Date().toISOString(), revision: 1, last_client_id: this.values[3], last_client_seq: this.values[4] };
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("INSERT OR IGNORE INTO user_state_history")) {
          const [userEmail, revision, data, updatedAt] = this.values, key = `${userEmail}:${revision}`;
          if (!db.history.has(key)) db.history.set(key, { user_email: userEmail, revision, data, updated_at: updatedAt });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("DELETE FROM user_state_history")) return { meta: { changes: 0 } };
        if (sql.startsWith("UPDATE user_state SET user_id = ?, data = ?")) {
          const [userId, data, clientId, clientSeq, email, revision] = this.values;
          if (!db.row || db.row.user_email !== email || db.row.revision !== revision) return { meta: { changes: 0 } };
          Object.assign(db.row, { user_id: userId, data, updated_at: new Date().toISOString(), revision: revision + 1, last_client_id: clientId, last_client_seq: clientSeq });
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      }
    };
  }
}

(async () => {
  const worker = (await import(`${require("url").pathToFileURL(serverPath).href}?qa=${Date.now()}`)).default;
  const env = { DB: new MockDatabase() };
  const headers = { "oai-authenticated-user-id": "user-1", "oai-authenticated-user-email": "person@example.com" };
  const call = async (method, body, pathName = "/api/state") => {
    const response = await worker.fetch(new Request(`https://example.test${pathName}`, { method, headers: { ...headers, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: response.status, body: await response.json() };
  };

  const first = await call("PUT", { snapshot: localAdded, base_revision: 0, client_id: "device-a", client_seq: 1 });
  assert.strictEqual(first.status, 200); assert.strictEqual(first.body.revision, 1);
  const conflict = await call("PUT", { snapshot: remoteAdded, base_revision: 0, client_id: "device-b", client_seq: 1 });
  assert.strictEqual(conflict.status, 409); assert.strictEqual(conflict.body.revision, 1); assert.strictEqual(conflict.body.state.store.blocks.at(-1).id, "local");
  const combined = merge(base, remoteAdded, conflict.body.state);
  const second = await call("PUT", { snapshot: combined, base_revision: conflict.body.revision, client_id: "device-b", client_seq: 1 });
  assert.strictEqual(second.status, 200); assert.strictEqual(second.body.revision, 2); assert.deepStrictEqual(second.body.state.store.blocks.map(row => row.id), ["a", "local", "remote"]);
  const duplicate = await call("PUT", { snapshot: combined, base_revision: 2, client_id: "device-b", client_seq: 1 });
  assert.strictEqual(duplicate.status, 200); assert.strictEqual(duplicate.body.revision, 2); assert.strictEqual(duplicate.body.duplicate, true);
  const legacy = await call("PUT", localAdded);
  assert.strictEqual(legacy.status, 409); assert.strictEqual(legacy.body.refresh_required, true); assert.strictEqual(legacy.body.revision, 2);
  const large = JSON.parse(JSON.stringify(second.body.state)); large.store.notebook = "x".repeat(70000);
  const largeSave = await call("PUT", { snapshot: large, base_revision: 2, client_id: "device-b", client_seq: 2 });
  assert.strictEqual(largeSave.status, 200); assert.strictEqual(largeSave.body.state.store.notebook.length, 70000);
  const replacement = JSON.parse(JSON.stringify(largeSave.body.state)); replacement.store.notebook = "replacement notebook";
  const replacementSave = await call("PUT", { snapshot: replacement, base_revision: 3, client_id: "device-b", client_seq: 3 });
  assert.strictEqual(replacementSave.status, 200); assert.strictEqual(replacementSave.body.revision, 4);
  const notebookHistory = await call("GET", null, "/api/notebook-history");
  assert.strictEqual(notebookHistory.status, 200);
  assert.deepStrictEqual(notebookHistory.body.versions.map(version => version.value.length), [20, 70000], "Notebook recovery returns the current and previous distinct copies newest first");
  console.log("Account sync checks passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
