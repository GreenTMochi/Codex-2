const DEVICE_CACHE = "sir-device-notifications-v1";
const ENABLED_KEY = "/__sir_phone_notifications_enabled";
const LIVE_STATUSES = new Set(["planned", "due", "overdue"]);
const DEFAULT_NOTIFICATIONS = {
  prestudy: true,
  upcoming_mle: true,
  active_revision: true,
  friday_weekend: true,
  overdue: true,
  suggested_assessment: true,
  daily_summary: false,
  badge: true,
  lead_days: 0,
  reminder_time: "09:00",
  quiet_enabled: true,
  quiet_start: "22:00",
  quiet_end: "07:00"
};

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

async function setDeviceEnabled(enabled) {
  const cache = await caches.open(DEVICE_CACHE);
  if (enabled) await cache.put(ENABLED_KEY, new Response("1"));
  else await cache.delete(ENABLED_KEY);
}

async function deviceEnabled() {
  return Boolean(await (await caches.open(DEVICE_CACHE)).match(ENABLED_KEY));
}

async function wasDelivered(key) {
  return Boolean(await (await caches.open(DEVICE_CACHE)).match(`/__sir_delivered/${encodeURIComponent(key)}`));
}

async function markDelivered(key) {
  await (await caches.open(DEVICE_CACHE)).put(`/__sir_delivered/${encodeURIComponent(key)}`, new Response(new Date().toISOString()));
}

function notificationSettings(snapshot) {
  let saved = {};
  try { saved = JSON.parse(snapshot?.local?.settings || "{}").notifications || {}; } catch {}
  return { ...DEFAULT_NOTIFICATIONS, ...saved };
}

function zonedNow(timeZone, boundary = "00:00") {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  const calendarDate = `${parts.year}-${parts.month}-${parts.day}`, minutes = Number(parts.hour) * 60 + Number(parts.minute), boundaryMinutes = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(boundary || "")) ? clockMinutes(boundary, "00:00") : 0;
  return { date: minutes < boundaryMinutes ? addIsoDays(calendarDate, -1) : calendarDate, calendarDate, minutes };
}

function addIsoDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function clockMinutes(value, fallback) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || fallback);
  return Number(match?.[1] || 0) * 60 + Number(match?.[2] || 0);
}

function isQuietTime(minutes, settings) {
  if (!settings.quiet_enabled) return false;
  const start = clockMinutes(settings.quiet_start, "22:00"), end = clockMinutes(settings.quiet_end, "07:00");
  return start === end ? false : start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

function taskScheduledDate(task) {
  return task.scheduled_date || task.window_start || "";
}

function taskDeadline(task) {
  if (["weekend", "two_week", "two_week_review", "one_month"].includes(task.stage)) {
    const start = task.assigned_window_start || task.window_start || "", end = task.assigned_window_end || task.window_end || start;
    if (task.schedule_source === "manual" && task.scheduled_date && (task.scheduled_date < start || task.scheduled_date > end)) return task.scheduled_date;
    return end || start || task.scheduled_date || "";
  }
  return task.stage === "zero_two" && task.scheduled_date ? task.scheduled_date : task.window_end || task.window_start || "";
}

function isEndOfWeekStage(stage) {
  return ["weekend", "two_week", "two_week_review", "one_month"].includes(stage);
}

function taskIsEnabled(task, settings) {
  if (task.stage === "pre_study") return settings.prestudy;
  if (task.stage === "mle") return settings.upcoming_mle;
  return settings.active_revision && (!isEndOfWeekStage(task.stage) || settings.friday_weekend);
}

function taskLabel(task) {
  if (task.stage === "pre_study") return "Pre-study";
  if (task.stage === "mle") return "Main Learning Event";
  if (task.stage === "zero_two") return "1-Day Revision";
  if (task.stage === "two_week_review") return Number(task.cycle || 1) === 1 ? "First 2W Revision" : "Second 2W Revision";
  if (task.stage === "one_month") return "1M Revision";
  if (task.stage === "pre_assessment") return `Pre-assessment Revision ${task.cycle || 1}`;
  if (task.stage === "post_assessment") return `Post-assessment Revision ${task.cycle || 1}`;
  return "Revision";
}

function blockContext(store, block) {
  const subject = store.subjects?.find(item => item.id === block.subject_id), unit = store.units?.find(item => item.id === block.unit_id);
  return [subject?.name, unit?.name].filter(Boolean).join(" > ");
}

async function showStudyNotification(key, title, body, tag, url = "/") {
  if (await wasDelivered(key)) return;
  await self.registration.showNotification(title, { body, icon: "/app-icon-192.png?build=190", badge: "/app-icon-192.png?build=190", tag, data: { url } });
  await markDelivered(key);
}

async function checkStudyNotifications() {
  if (!await deviceEnabled()) return;
  let payload;
  try {
    const response = await fetch("/api/state", { credentials: "include", cache: "no-store" });
    if (!response.ok) return;
    payload = await response.json();
  } catch { return; }
  const snapshot = payload.state, store = snapshot?.store;
  if (!store) return;
  let appSettings = {}; try { appSettings = JSON.parse(snapshot?.local?.settings || "{}"); } catch {}
  const settings = notificationSettings(snapshot), zone = appSettings.timezone || "America/New_York", now = zonedNow(zone, appSettings.study_day_boundary || "00:00"), reminderMinute = clockMinutes(settings.reminder_time, "09:00"), blocks = new Map((store.blocks || []).filter(block => !block.archived).map(block => [block.id, block])), tasks = (store.tasks || []).filter(task => LIVE_STATUSES.has(task.status) && blocks.has(task.block_id));
  const dueCount = tasks.filter(task => { const scheduled = taskScheduledDate(task), deadline = taskDeadline(task); return Boolean(deadline && deadline < now.date || scheduled && scheduled <= now.date); }).length;
  if (settings.badge && self.navigator.setAppBadge) { try { if (dueCount) await self.navigator.setAppBadge(dueCount); else await self.navigator.clearAppBadge(); } catch {} }
  if (now.minutes < reminderMinute || isQuietTime(now.minutes, settings)) return;
  const targetDate = addIsoDays(now.date, Number(settings.lead_days) || 0);
  for (const task of tasks.filter(item => taskScheduledDate(item) === targetDate && taskIsEnabled(item, settings))) {
    const block = blocks.get(task.block_id), context = blockContext(store, block), timing = Number(settings.lead_days) ? `in ${settings.lead_days} day${Number(settings.lead_days) === 1 ? "" : "s"}` : "today";
    await showStudyNotification(`task:${task.id}:${targetDate}:${settings.lead_days}`, `${taskLabel(task)} ${timing}`, `${block.name}${context ? ` - ${context}` : ""}`, `sir-task-${task.id}-${targetDate}`);
  }
  if (settings.overdue) for (const task of tasks.filter(item => taskDeadline(item) && taskDeadline(item) < now.date)) {
    const block = blocks.get(task.block_id), days = Math.max(1, Math.round((new Date(`${now.date}T00:00:00Z`) - new Date(`${taskDeadline(task)}T00:00:00Z`)) / 86400000));
    await showStudyNotification(`overdue:${task.id}:${now.date}`, `${taskLabel(task)} overdue`, `${block.name} is ${days} day${days === 1 ? "" : "s"} overdue.`, `sir-overdue-${task.id}`);
  }
  if (settings.daily_summary) {
    const todayTasks = tasks.filter(task => taskScheduledDate(task) === now.date && taskIsEnabled(task, settings));
    if (todayTasks.length) await showStudyNotification(`summary:${now.date}`, `${todayTasks.length} study task${todayTasks.length === 1 ? "" : "s"} today`, todayTasks.slice(0, 3).map(task => blocks.get(task.block_id)?.name).filter(Boolean).join(", "), `sir-summary-${now.date}`);
  }
  if (settings.suggested_assessment) for (const block of [...blocks.values()].filter(item => item.assessment_mode === "pre_assessment" && !item.assessment_date)) {
    await showStudyNotification(`assessment:${block.id}:${now.date}`, "Assessment date recommended", `Add an assessment date for ${block.name} to schedule its custom revision sessions.`, `sir-assessment-${block.id}`);
  }
}

self.addEventListener("message", event => {
  if (event.data?.type === "SET_PHONE_NOTIFICATIONS") event.waitUntil(setDeviceEnabled(Boolean(event.data.enabled)));
  if (event.data?.type === "CHECK_NOTIFICATIONS") event.waitUntil(checkStudyNotifications());
});

self.addEventListener("periodicsync", event => {
  if (event.tag === "sir-study-reminders") event.waitUntil(checkStudyNotifications());
});

self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { body: event.data?.text() || "You have study work due." }; }
  event.waitUntil(self.registration.showNotification(payload.title || "Study reminder", { body: payload.body || "Open the app to review your schedule.", icon: "/app-icon-192.png?build=190", badge: "/app-icon-192.png?build=190", tag: payload.tag || "sir-push", data: { url: payload.url || "/" } }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => { const existing = clients.find(client => client.url.startsWith(self.location.origin)); if (existing) { existing.navigate(url); return existing.focus(); } return self.clients.openWindow(url); }));
});
