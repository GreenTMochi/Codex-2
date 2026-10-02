import { mkdir, copyFile, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const html = await readFile(join(root, "outputs", "offline.html"), "utf8");
const faviconSvg = await readFile(join(root, "outputs", "favicon.svg"), "utf8");
const manifest = await readFile(join(root, "outputs", "manifest.webmanifest"), "utf8");
const serviceWorker = await readFile(join(root, "outputs", "service-worker.js"), "utf8");
const appleTouchIcon = await readFile(join(root, "outputs", "apple-touch-icon.png"));
const appIcon192 = await readFile(join(root, "outputs", "app-icon-192.png"));
const appIcon512 = await readFile(join(root, "outputs", "app-icon-512.png"));
await writeFile(join(dist, "index.html"), html);
await copyFile(join(root, "outputs", "favicon.svg"), join(dist, "favicon.svg"));
await copyFile(join(root, "outputs", "manifest.webmanifest"), join(dist, "manifest.webmanifest"));
await copyFile(join(root, "outputs", "service-worker.js"), join(dist, "service-worker.js"));
await copyFile(join(root, "outputs", "apple-touch-icon.png"), join(dist, "apple-touch-icon.png"));
await copyFile(join(root, "outputs", "app-icon-192.png"), join(dist, "app-icon-192.png"));
await copyFile(join(root, "outputs", "app-icon-512.png"), join(dist, "app-icon-512.png"));
await mkdir(join(dist, "server"), { recursive: true });
await writeFile(
  join(dist, "server", "index.js"),
  `const html = ${JSON.stringify(html)};
const faviconSvg = ${JSON.stringify(faviconSvg)};
const manifest = ${JSON.stringify(manifest)};
const serviceWorker = ${JSON.stringify(serviceWorker)};
const appIcons = ${JSON.stringify({
  "/apple-touch-icon.png": appleTouchIcon.toString("base64"),
  "/app-icon-192.png": appIcon192.toString("base64"),
  "/app-icon-512.png": appIcon512.toString("base64")
})};

const createStateTable = \`CREATE TABLE IF NOT EXISTS user_state (
  user_email TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revision INTEGER NOT NULL DEFAULT 0,
  last_client_id TEXT,
  last_client_seq INTEGER NOT NULL DEFAULT 0
)\`;

const createStateHistoryTable = \`CREATE TABLE IF NOT EXISTS user_state_history (
  user_email TEXT NOT NULL,
  revision INTEGER NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_email, revision)
)\`;

const createCalendarFeedTable = \`CREATE TABLE IF NOT EXISTS calendar_feeds (
  token TEXT PRIMARY KEY NOT NULL,
  user_email TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_email) REFERENCES user_state(user_email) ON DELETE CASCADE
)\`;

function currentUser(request) {
  const id = request.headers.get("oai-authenticated-user-id")?.trim();
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!id || !email) return null;
  let name = email;
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  if (encodedName && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { name = decodeURIComponent(encodedName); } catch {}
  }
  return { id, email, name };
}

async function ensureDatabase(env) {
  if (!env.DB) throw new Error("Account database is unavailable.");
  await env.DB.batch([env.DB.prepare(createStateTable), env.DB.prepare(createStateHistoryTable), env.DB.prepare(createCalendarFeedTable)]);
  const info = await env.DB.prepare("PRAGMA table_info(user_state)").all();
  const columns = new Set((info.results || []).map(row => row.name));
  const additions = [
    ["user_id", "ALTER TABLE user_state ADD COLUMN user_id TEXT"],
    ["revision", "ALTER TABLE user_state ADD COLUMN revision INTEGER NOT NULL DEFAULT 0"],
    ["last_client_id", "ALTER TABLE user_state ADD COLUMN last_client_id TEXT"],
    ["last_client_seq", "ALTER TABLE user_state ADD COLUMN last_client_seq INTEGER NOT NULL DEFAULT 0"]
  ];
  for (const [name, sql] of additions) if (!columns.has(name)) { try { await env.DB.prepare(sql).run(); } catch (error) { if (!String(error).toLowerCase().includes("duplicate column")) throw error; } }
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS user_state_user_id_idx ON user_state(user_id) WHERE user_id IS NOT NULL").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS user_state_history_email_revision_idx ON user_state_history(user_email, revision DESC)").run();
}

async function findUserState(env, user) {
  let row = await env.DB.prepare("SELECT user_email, user_id, data, updated_at, revision, last_client_id, last_client_seq FROM user_state WHERE user_id = ? LIMIT 1").bind(user.id).first();
  if (!row) row = await env.DB.prepare("SELECT user_email, user_id, data, updated_at, revision, last_client_id, last_client_seq FROM user_state WHERE user_email = ? LIMIT 1").bind(user.email).first();
  if (row && !row.user_id) { await env.DB.prepare("UPDATE user_state SET user_id = ? WHERE user_email = ? AND user_id IS NULL").bind(user.id, row.user_email).run(); row.user_id = user.id; }
  return row;
}

function parsedState(row) {
  if (!row?.data) return null;
  try { return JSON.parse(row.data); } catch { return null; }
}

function stateResponse(row, extra = {}) {
  return { state: parsedState(row), revision: Number(row?.revision || 0), updated_at: row?.updated_at || null, ...extra };
}

async function archiveStateVersion(env, row) {
  if (!row?.user_email || !row?.data || !Number.isSafeInteger(Number(row.revision))) return;
  await env.DB.prepare("INSERT OR IGNORE INTO user_state_history (user_email, revision, data, updated_at) VALUES (?, ?, ?, ?)").bind(row.user_email, Number(row.revision), row.data, row.updated_at || new Date().toISOString()).run();
}

async function pruneStateHistory(env, email) {
  await env.DB.prepare("DELETE FROM user_state_history WHERE user_email = ? AND revision NOT IN (SELECT revision FROM user_state_history WHERE user_email = ? ORDER BY revision DESC LIMIT 50)").bind(email, email).run();
}

function safeInlineJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function signInPage() {
  return \`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in | Spaced Interleaved Retrieval Tracker</title><link rel="icon" type="image/svg+xml" href="/favicon.svg?build=190"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?build=190"><link rel="manifest" href="/manifest.webmanifest?build=190"><meta name="theme-color" content="#5b21b6"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="SIR Tracker"><style>body{margin:0;display:grid;place-items:center;min-height:100vh;padding:24px;background:#08111f;color:#eef6fb;font:16px system-ui,sans-serif}.card{width:min(440px,100%);box-sizing:border-box;padding:28px;border:1px solid #2a3b50;border-radius:8px;background:#111f2e}.card h1{margin:0 0 10px;font-size:1.7rem}.card p{color:#a9c4d8;line-height:1.5}.card a{display:inline-block;margin-top:10px;padding:11px 15px;border-radius:7px;background:#55e3cf;color:#07131d;font-weight:800;text-decoration:none}</style></head><body><main class="card"><h1>Spaced Interleaved Retrieval Tracker</h1><p>Sign in to open your private study data. Each account has its own subjects, blocks, revision history, settings, and presets.</p><a href="/signin-with-chatgpt?return_to=%2F">Sign in with ChatGPT</a></main></body></html>\`;
}

function errorPage() {
  return \`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Temporarily unavailable</title><link rel="icon" type="image/svg+xml" href="/favicon.svg?build=190"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?build=190"><meta name="theme-color" content="#5b21b6"></head><body style="font:16px system-ui;padding:32px"><h1>Account data is temporarily unavailable</h1><p>Your browser data has not been deleted. Please reload in a moment.</p></body></html>\`;
}

function pngResponse(encoded) {
  return new Response(Uint8Array.from(atob(encoded), character => character.charCodeAt(0)), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" }
  });
}

function calendarFeedUrls(request, token) {
  const httpsUrl = new URL("/calendar/" + token + ".ics", request.url).href;
  return { https_url: httpsUrl, webcal_url: httpsUrl.replace(/^https:/, "webcal:") };
}

function createCalendarToken() {
  return (crypto.randomUUID() + crypto.randomUUID()).replaceAll("-", "");
}

function escapeCalendarText(value) {
  return String(value || "").replace(/\\\\/g, "\\\\\\\\").replace(/\\r?\\n/g, "\\\\n").replace(/,/g, "\\\\,").replace(/;/g, "\\\\;");
}

function calendarTaskLabel(task) {
  if (task.stage === "pre_study") return "Pre-study";
  if (task.stage === "mle") return "Main Learning Event";
  if (task.stage === "zero_two") return "1-Day Revision";
  if (task.stage === "two_week_review") return "2W Revision " + (task.cycle || 1) + "/3";
  if (task.stage === "one_month") return "1M Revision";
  if (task.stage === "pre_assessment") return "Pre-assessment Revision " + (task.cycle || 1);
  if (task.stage === "post_assessment") return "Post-assessment Revision " + (task.cycle || 1);
  return "Revision";
}

function calendarCustomSessionRelation(extra) {
  const after = extra.after_stage ? calendarTaskLabel({ stage: extra.after_stage, cycle: extra.after_cycle }) : "", before = extra.before_stage ? calendarTaskLabel({ stage: extra.before_stage, cycle: extra.before_cycle }) : "";
  if (after && before) return "Between " + after + " and " + before;
  if (before) return "Before " + before;
  if (after) return "After " + after;
  return (extra.position === "before" ? "Before " : "After ") + calendarTaskLabel({ stage: extra.anchor_stage, cycle: extra.anchor_cycle });
}

function buildCalendarFeed(snapshot, origin) {
  const store = snapshot?.store || snapshot || {}, local = snapshot?.local || {};
  let savedSettings = {};
  try { savedSettings = JSON.parse(local.settings || "{}"); } catch {}
  const savedNotifications = savedSettings.notifications || {}, notifications = { prestudy: true, upcoming_mle: true, active_revision: true, friday_weekend: true, lead_days: 0, reminder_time: "09:00", ...savedNotifications }, zone = savedSettings.timezone || "America/New_York", time = /^\\d{2}:\\d{2}$/.test(notifications.reminder_time || "") ? notifications.reminder_time : "09:00", timeValue = time.replace(":", "") + "00", leadDays = Math.min(30, Math.max(0, Number(notifications.lead_days) || 0)), blocks = new Map((store.blocks || []).filter(block => !block.archived).map(block => [block.id, block])), subjects = new Map((store.subjects || []).map(subject => [subject.id, subject])), units = new Map((store.units || []).map(unit => [unit.id, unit])), live = new Set(["planned", "due", "overdue"]), nowStamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\\.\\d{3}Z$/, "Z"), lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Spaced Interleaved Retrieval//Study Schedule//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Spaced Interleaved Retrieval", "X-WR-TIMEZONE:" + escapeCalendarText(zone), "X-WR-CALDESC:Private study schedule with account notification preferences."];
  const enabled = task => task.stage === "pre_study" ? notifications.prestudy : task.stage === "mle" ? notifications.upcoming_mle : notifications.active_revision && (!["weekend", "two_week", "two_week_review", "one_month"].includes(task.stage) || notifications.friday_weekend);
  for (const task of (store.tasks || []).filter(task => live.has(task.status) && enabled(task) && blocks.has(task.block_id))) {
    const date = task.scheduled_date || task.window_start;
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date || "")) continue;
    const block = blocks.get(task.block_id), subject = subjects.get(block.subject_id), unit = units.get(block.unit_id), context = [subject?.name, unit?.name].filter(Boolean).join(" > "), label = calendarTaskLabel(task), trigger = leadDays ? "-P" + leadDays + "D" : "-PT0M";
    lines.push("BEGIN:VEVENT", "UID:" + escapeCalendarText(task.id) + "@spaced-interleaved-retrieval", "DTSTAMP:" + nowStamp, "DTSTART;TZID=" + escapeCalendarText(zone) + ":" + date.replaceAll("-", "") + "T" + timeValue, "DURATION:PT30M", "SUMMARY:" + escapeCalendarText(label + ": " + block.name), "DESCRIPTION:" + escapeCalendarText((context ? context + "\\n" : "") + "Open the study tracker for details."), "URL:" + escapeCalendarText(origin + "/"), "CATEGORIES:Study," + escapeCalendarText(label), "STATUS:CONFIRMED", "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:" + trigger, "DESCRIPTION:" + escapeCalendarText(label + ": " + block.name), "END:VALARM", "END:VEVENT");
  }
  for (const extra of (store.extra_sessions || []).filter(extra => extra.status === "planned" && blocks.has(extra.block_id))) {
    const date = extra.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) continue;
    const block = blocks.get(extra.block_id), subject = subjects.get(block.subject_id), unit = units.get(block.unit_id), context = [subject?.name, unit?.name, block.name].filter(Boolean).join(" > "), relation = calendarCustomSessionRelation(extra), trigger = leadDays ? "-P" + leadDays + "D" : "-PT0M", eventLines = ["BEGIN:VEVENT", "UID:" + escapeCalendarText(extra.id) + "@spaced-interleaved-retrieval", "DTSTAMP:" + nowStamp, "DTSTART;TZID=" + escapeCalendarText(zone) + ":" + date.replaceAll("-", "") + "T" + timeValue];
    if (Number(extra.planned_minutes) > 0) eventLines.push("DURATION:PT" + Math.max(1, Math.round(Number(extra.planned_minutes))) + "M");
    eventLines.push("SUMMARY:" + escapeCalendarText("Custom Session · " + block.name), "DESCRIPTION:" + escapeCalendarText((context ? context + "\\n" : "") + relation + "\\nInserted session in the block's study order."), "URL:" + escapeCalendarText(origin + "/"), "CATEGORIES:Study,Custom Session", "STATUS:CONFIRMED", "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:" + trigger, "DESCRIPTION:" + escapeCalendarText("Custom Session · " + block.name), "END:VALARM", "END:VEVENT");
    lines.push(...eventLines);
  }
  lines.push("END:VCALENDAR");
  return lines.join("\\r\\n") + "\\r\\n";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const user = currentUser(request);

    if (url.pathname === "/favicon.svg" || url.pathname === "/favicon.ico") {
      return new Response(faviconSvg, {
        headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=300" }
      });
    }
    if (url.pathname === "/manifest.webmanifest") {
      return new Response(manifest, {
        headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=300" }
      });
    }
    if (url.pathname === "/service-worker.js") {
      return new Response(serviceWorker, {
        headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache", "service-worker-allowed": "/" }
      });
    }
    if (appIcons[url.pathname]) return pngResponse(appIcons[url.pathname]);

    const calendarMatch = /^\\/calendar\\/([a-f0-9]{64})\\.ics$/.exec(url.pathname);
    if (calendarMatch) {
      try {
        await ensureDatabase(env);
        const row = await env.DB.prepare("SELECT user_state.data FROM calendar_feeds JOIN user_state ON user_state.user_email = calendar_feeds.user_email WHERE calendar_feeds.token = ?").bind(calendarMatch[1]).first();
        if (!row?.data) return new Response("Calendar not found", { status: 404 });
        const body = buildCalendarFeed(JSON.parse(row.data), url.origin), download = url.searchParams.get("download") === "1";
        return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store", "content-disposition": (download ? "attachment" : "inline") + "; filename=spaced-interleaved-retrieval.ics" } });
      } catch (error) {
        console.error("Calendar feed request failed", error);
        return new Response("Calendar is temporarily unavailable", { status: 503 });
      }
    }

    if (url.pathname === "/api/calendar-feed") {
      if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
      try {
        await ensureDatabase(env);
        const accountRow = await findUserState(env, user), storageEmail = accountRow?.user_email || user.email;
        if (request.method === "GET") {
          const row = await env.DB.prepare("SELECT token FROM calendar_feeds WHERE user_email = ?").bind(storageEmail).first();
          return Response.json({ feed: row?.token ? { ...calendarFeedUrls(request, row.token), created: true } : null });
        }
        if (request.method === "POST") {
          let row = await env.DB.prepare("SELECT token FROM calendar_feeds WHERE user_email = ?").bind(storageEmail).first();
          if (!row?.token) { const token = createCalendarToken(); await env.DB.prepare("INSERT INTO calendar_feeds (token, user_email) VALUES (?, ?)").bind(token, storageEmail).run(); row = { token }; }
          return Response.json({ feed: { ...calendarFeedUrls(request, row.token), created: true } });
        }
        if (request.method === "DELETE") {
          await env.DB.prepare("DELETE FROM calendar_feeds WHERE user_email = ?").bind(storageEmail).run();
          return Response.json({ revoked: true });
        }
        return new Response("Method not allowed", { status: 405, headers: { allow: "GET, POST, DELETE" } });
      } catch (error) {
        console.error("Calendar feed settings failed", error);
        return Response.json({ error: "Calendar settings are temporarily unavailable" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/notebook-history") {
      if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { allow: "GET" } });
      try {
        await ensureDatabase(env);
        const current = await findUserState(env, user);
        if (!current) return Response.json({ versions: [] }, { headers: { "cache-control": "no-store" } });
        const history = await env.DB.prepare("SELECT revision, data, updated_at FROM user_state_history WHERE user_email = ? ORDER BY revision DESC LIMIT 50").bind(current.user_email).all();
        const seen = new Set(), versions = [];
        for (const row of [current, ...(history.results || [])]) {
          const notebook = parsedState(row)?.store?.notebook;
          if (typeof notebook !== "string" || !notebook.trim() || seen.has(notebook)) continue;
          seen.add(notebook); versions.push({ revision: Number(row.revision || 0), updated_at: row.updated_at || null, value: notebook });
        }
        return Response.json({ versions }, { headers: { "cache-control": "no-store" } });
      } catch (error) {
        console.error("Notebook history request failed", error);
        return Response.json({ error: "Notebook recovery is temporarily unavailable" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/state") {
      if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
      try {
        await ensureDatabase(env);
        if (request.method === "GET") {
          const row = await findUserState(env, user);
          return Response.json(stateResponse(row), { headers: { "cache-control": "no-store" } });
        }
        if (request.method === "PUT") {
          const raw = await request.text();
          if (raw.length > 5_000_000) return Response.json({ error: "Account data is too large" }, { status: 413 });
          const payload = JSON.parse(raw);
          const snapshot = payload?.snapshot, clientId = String(payload?.client_id || ""), clientSeq = Number(payload?.client_seq), baseRevision = Number(payload?.base_revision);
          if (!clientId || !Number.isSafeInteger(clientSeq) || clientSeq < 1 || !Number.isSafeInteger(baseRevision) || baseRevision < 0) {
            const current = await findUserState(env, user);
            return Response.json(stateResponse(current, { error: "Refresh the app before syncing account data", refresh_required: true }), { status: 409, headers: { "cache-control": "no-store" } });
          }
          if (!snapshot?.store || typeof snapshot.store !== "object") return Response.json({ error: "Invalid account data" }, { status: 400 });
          const serialized = JSON.stringify({ store: snapshot.store, local: snapshot.local || {} });
          for (let attempt = 0; attempt < 4; attempt += 1) {
            const current = await findUserState(env, user);
            if (!current) {
              try {
                await env.DB.prepare("INSERT INTO user_state (user_email, user_id, data, updated_at, revision, last_client_id, last_client_seq) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1, ?, ?)").bind(user.email, user.id, serialized, clientId, clientSeq).run();
                const saved = await findUserState(env, user);
                return Response.json(stateResponse(saved, { saved: true }), { headers: { "cache-control": "no-store" } });
              } catch (error) { if (attempt === 3) throw error; continue; }
            }
            const currentRevision = Number(current.revision || 0), previousSequence = Number(current.last_client_seq || 0), sameClient = current.last_client_id === clientId;
            if (sameClient && clientSeq <= previousSequence) return Response.json(stateResponse(current, { saved: true, duplicate: true }), { headers: { "cache-control": "no-store" } });
            if (baseRevision !== currentRevision && !sameClient) return Response.json(stateResponse(current, { error: "Account data changed on another device", conflict: true }), { status: 409, headers: { "cache-control": "no-store" } });
            await archiveStateVersion(env, current);
            const result = await env.DB.prepare("UPDATE user_state SET user_id = ?, data = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), revision = revision + 1, last_client_id = ?, last_client_seq = ? WHERE user_email = ? AND revision = ?").bind(user.id, serialized, clientId, clientSeq, current.user_email, currentRevision).run();
            if (Number(result.meta?.changes || 0) > 0) { await pruneStateHistory(env, current.user_email); const saved = await findUserState(env, user); return Response.json(stateResponse(saved, { saved: true }), { headers: { "cache-control": "no-store" } }); }
          }
          throw new Error("Account data changed repeatedly during save");
        }
        return new Response("Method not allowed", { status: 405, headers: { allow: "GET, PUT" } });
      } catch (error) {
        console.error("Account state request failed", error);
        return Response.json({ error: "Account data is temporarily unavailable" }, { status: 500 });
      }
    }

    if (!user) return new Response(signInPage(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

    try {
      await ensureDatabase(env);
      const row = await findUserState(env, user), accountState = parsedState(row), accountRevision = Number(row?.revision || 0);
      const bootstrap = \`<script>window.__SIR_USER__=\${safeInlineJson(user)};window.__SIR_ACCOUNT_STATE__=\${safeInlineJson(accountState)};window.__SIR_ACCOUNT_REVISION__=\${safeInlineJson(accountRevision)};</script>\`;
      return new Response(html.replace("</head>", bootstrap + "</head>"), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    } catch (error) {
      console.error("App bootstrap failed", error);
      return new Response(errorPage(), { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
  }
};
`,
);
await mkdir(join(dist, ".openai"), { recursive: true });
await copyFile(join(root, ".openai", "hosting.json"), join(dist, ".openai", "hosting.json"));
