const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "offline.html"), "utf8");
let source = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
source = source.slice(0, source.indexOf('      window.addEventListener("beforeunload"'));
source += `
state.store = {
  subjects: [{ id: "subject", name: "Calculus", archived: false }],
  units: [{ id: "unit", subject_id: "subject", name: "Unit", assessment_mode: "normal", custom_spacing: [], archived: false }],
  blocks: [{ id: "block", subject_id: "subject", unit_id: "unit", name: "Limits", mle_date: "2026-07-14", assessment_mode: "normal", custom_spacing: [], archived: false }],
  tasks: [
    { id: "mle", block_id: "block", stage: "mle", cycle: 1, status: "completed", window_start: "2026-07-14", window_end: "2026-07-14" },
    { id: "zero", block_id: "block", stage: "zero_two", cycle: 1, status: "completed", window_start: "2026-07-14", window_end: "2026-07-16" },
    { id: "review-1", block_id: "block", stage: "two_week_review", cycle: 1, status: "completed", window_start: "2026-07-17", window_end: "2026-07-18" },
    { id: "review-2", block_id: "block", stage: "two_week_review", cycle: 2, status: "completed", window_start: "2026-07-24", window_end: "2026-07-25" },
    { id: "month", block_id: "block", stage: "one_month", cycle: 1, status: "due", window_start: "2026-08-07", window_end: "2026-08-08" }
  ],
  sessions: [{ id: "session", block_id: "block", stage: "two_week_review", cycle: 2, completed_at: "2026-07-24T12:00:00Z", confidence: 3, minutes: 22 }],
  usage: [{ id: "usage", session_id: "session", technique_id: "active-recall", times_used: 2, notes: "" }],
  notifications: [],
  techniques: [{ id: "active-recall", name: "Active recall", categories: ["declarative", "procedural"] }],
  placements: [],
  presets: [],
  preset_links: [],
  stage_history: []
};
localStorage.setItem(appSettingsKey, JSON.stringify({ cycle_start_week: "2026-07-12", cycle_start_phase: 0, end_week_start: 5, end_week_end: 6, timezone: "America/New_York" }));

const block = state.store.blocks[0];
const month = state.store.tasks.find(task => task.id === "month");
revertRevisionStage(month, "Repeat the final two-week review");

assert.strictEqual(month.status, "reverted", "the former active stage is retained as reverted");
assert.strictEqual(state.store.sessions.length, 1, "completed session history is preserved");
assert.strictEqual(state.store.usage.length, 1, "technique usage history is preserved");
assert.strictEqual(state.store.usage[0].times_used, 2, "recorded usage totals are unchanged");

let active = state.store.tasks.find(task => task.block_id === block.id && task.stage === "two_week_review" && task.cycle === 2 && live.includes(task.status));
assert(active, "the previous revision stage is reactivated");
assert.deepStrictEqual([active.window_start, active.window_end], ["2026-07-24", "2026-07-26"], "reverting restores the MLE-anchored Friday-through-Sunday revision window instead of using today");
assert.strictEqual(state.store.stage_history.length, 1, "the reversal is audited");
assert.strictEqual(state.store.stage_history[0].reason, "Repeat the final two-week review", "the optional reason is stored");

syncBlockAssessmentTasks(block);
active = state.store.tasks.find(task => task.block_id === block.id && task.stage === "two_week_review" && task.cycle === 2 && live.includes(task.status));
assert(active, "the reverted stage survives schedule refresh");

active.status = "completed";
advancePipeline(active, block);
const resumedMonth = state.store.tasks.find(task => task.block_id === block.id && task.stage === "one_month" && live.includes(task.status));
assert(resumedMonth, "normal forward progression resumes after repeating the prior stage");
assert.strictEqual(state.store.sessions.length, 1, "resuming progression does not rewrite old sessions");

const assessmentBlock = { id: "assessment-block", subject_id: "subject", unit_id: "unit", name: "Assessment", assessment_mode: "pre_assessment", assessment_date: "2026-09-10", custom_spacing: [14, 7, 1], archived: false };
state.store.blocks.push(assessmentBlock);
state.store.tasks.push(
  { id: "pre-1-done", block_id: assessmentBlock.id, stage: "pre_assessment", cycle: 1, status: "completed", window_start: "2026-08-27", window_end: "2026-08-27" },
  { id: "pre-2", block_id: assessmentBlock.id, stage: "pre_assessment", cycle: 2, status: "due", window_start: "2026-09-03", window_end: "2026-09-03" },
  { id: "pre-3", block_id: assessmentBlock.id, stage: "pre_assessment", cycle: 3, status: "planned", window_start: "2026-09-09", window_end: "2026-09-09" }
);
const preTwo = state.store.tasks.find(task => task.id === "pre-2");
revertRevisionStage(preTwo, "Repeat custom session one");
let repeatedPreOne = state.store.tasks.find(task => task.block_id === assessmentBlock.id && task.stage === "pre_assessment" && task.cycle === 1 && live.includes(task.status));
assert(repeatedPreOne, "custom assessment revision can move back one numbered session");
assert.deepStrictEqual([repeatedPreOne.window_start, repeatedPreOne.window_end], ["2026-08-27", "2026-08-27"], "assessment reversion restores its configured assessment-relative date");
repeatedPreOne.status = "completed";
advancePipeline(repeatedPreOne, assessmentBlock);
assert(state.store.tasks.some(task => task.id === "pre-2" && live.includes(task.status)), "custom assessment progression resumes at the following session");

const resetBlock = { id: "reset-block", subject_id: "subject", unit_id: "unit", name: "Reset", mle_date: "2026-07-14", assessment_mode: "normal", custom_spacing: [], archived: false };
state.store.blocks.push(resetBlock);
state.store.tasks.push(
  { id: "reset-mle", block_id: resetBlock.id, stage: "mle", cycle: 1, status: "completed", window_start: "2026-07-14", window_end: "2026-07-14" },
  { id: "reset-zero-done", block_id: resetBlock.id, stage: "zero_two", cycle: 1, status: "completed", window_start: "2026-07-02", window_end: "2026-07-04" },
  { id: "reset-two-week", block_id: resetBlock.id, stage: "two_week_review", cycle: 2, status: "due", window_start: "2026-08-01", window_end: "2026-08-01" }
);
state.store.sessions.push({ id: "reset-session", block_id: resetBlock.id, stage: "zero_two", cycle: 1, completed_at: "2026-07-03T12:00:00Z", confidence: 2, minutes: 18 });
const sessionCountBeforeReset = state.store.sessions.length;
resetRevisionStages(state.store.tasks.find(task => task.id === "reset-two-week"), "Restart the full revision sequence", "2026-08-10");
let resetStart = state.store.tasks.find(task => task.block_id === resetBlock.id && task.stage === "zero_two" && live.includes(task.status));
assert(resetStart, "normal revision reset restarts at the 1-Day Revision");
assert.deepStrictEqual([resetStart.window_start, resetStart.window_end], ["2026-08-10", "2026-08-12"], "reset starts a fresh practical 1-Day window on the reset date");
assert.strictEqual(resetBlock.mle_date, "2026-07-14", "reset preserves the assigned MLE date as historical truth");
assert.strictEqual(resetBlock.revision_anchor_date, "2026-08-10", "reset stores a separate practical revision anchor");
assert.strictEqual(state.store.sessions.length, sessionCountBeforeReset, "reset preserves all completed session history");
assert.strictEqual(state.store.stage_history.at(-1).action, "reset", "reset is distinguished in stage history");
assert.strictEqual(state.store.stage_history.at(-1).reason, "Restart the full revision sequence", "reset reason is stored");
syncBlockAssessmentTasks(resetBlock);
assert(state.store.tasks.some(task => task.id === resetStart.id && live.includes(task.status)), "reset stage survives schedule refresh");
resetStart.status = "completed";
state.store.sessions.push({ id: "reset-new-zero", block_id: resetBlock.id, stage: "zero_two", cycle: 1, completed_at: new Date().toISOString(), confidence: 2, minutes: 18 });
advancePipeline(resetStart, resetBlock, "2026-08-10");
assert(state.store.tasks.some(task => task.block_id === resetBlock.id && task.stage === "two_week_review" && task.cycle === 1 && live.includes(task.status)), "normal reset begins a fresh rolling sequence instead of skipping completed historical stages");
const resetFirstTwoWeek = state.store.tasks.find(task => task.block_id === resetBlock.id && task.stage === "two_week_review" && task.cycle === 1 && live.includes(task.status));
revertRevisionStage(resetFirstTwoWeek, "Return to 1-Day again", "2026-08-11");
const revertedOneDay = state.store.tasks.find(task => task.block_id === resetBlock.id && task.stage === "zero_two" && live.includes(task.status));
assert.deepStrictEqual([revertedOneDay.window_start, revertedOneDay.window_end], ["2026-08-11", "2026-08-13"], "reverting back to 1-Day also starts a fresh practical window");
assert.strictEqual(resetBlock.mle_date, "2026-07-14", "reverting to 1-Day leaves the assigned MLE untouched");

const customReset = state.store.tasks.find(task => task.id === "pre-2");
customReset.status = "completed";
const preThree = state.store.tasks.find(task => task.id === "pre-3");
preThree.status = "due";
resetRevisionStages(preThree, "Restart assessment revisions");
let resetPreOne = state.store.tasks.find(task => task.block_id === assessmentBlock.id && task.stage === "pre_assessment" && task.cycle === 1 && live.includes(task.status));
assert(resetPreOne, "assessment reset restarts at revision one without changing assessment mode");
resetPreOne.status = "completed";
advancePipeline(resetPreOne, assessmentBlock);
assert(state.store.tasks.some(task => task.block_id === assessmentBlock.id && task.stage === "pre_assessment" && task.cycle === 2 && live.includes(task.status)), "assessment reset can progress through a fresh sequence");

const imported = normalizeImportedData({ data: state.store });
assert.strictEqual(imported.store.stage_history.length, 5, "reversal and reset history survive export/import normalization");
assert(imported.store.stage_history.some(change => change.action === "reset"), "import keeps reset history type");
assert(imported.store.stage_history.some(change => change.practical_anchor_date), "import preserves practical restart dates");

const legacyRestartBlock = { id: "legacy-restart-block", subject_id: "subject", unit_id: "unit", name: "Legacy restart", mle_date: "2026-07-14", revision_anchor_date: "2026-07-14", revision_anchor_source: "mle_recovery", revision_anchor_updated_at: "2026-08-10T12:00:00Z", assessment_mode: "normal", archived: false };
state.store.blocks.push(legacyRestartBlock);
state.store.tasks.push({ id: "legacy-restart-active", block_id: legacyRestartBlock.id, stage: "zero_two", cycle: 1, status: "overdue", window_start: "2026-07-14", window_end: "2026-07-16", scheduled_date: "2026-08-02" });
state.store.sessions.push({ id: "legacy-restart-session", block_id: legacyRestartBlock.id, stage: "zero_two", cycle: 1, completed_at: "2026-08-01T16:00:00Z", confidence: 1 });
state.store.stage_history.push(
  { id: "legacy-revert-one", block_id: legacyRestartBlock.id, action: "revert", from_stage: "two_week_review", from_cycle: 1, to_stage: "zero_two", to_cycle: 1, changed_at: "2026-08-01T16:00:00Z" },
  { id: "legacy-revert-two", block_id: legacyRestartBlock.id, action: "revert", from_stage: "two_week_review", from_cycle: 1, to_stage: "zero_two", to_cycle: 1, changed_at: "2026-08-02T16:00:00Z" }
);
assert.strictEqual(recoverNormalRevisionAnchor(legacyRestartBlock), true, "older revert history replaces a stale practical anchor even when one already exists");
assert.strictEqual(legacyRestartBlock.revision_anchor_date, "2026-08-02", "the newest revert overrides the stale MLE-based anchor");
assert(state.store.stage_history.filter(change => change.block_id === legacyRestartBlock.id).every(change => change.practical_anchor_date), "legacy restart history is backfilled for display");
reanchorActiveRevisionTasks(legacyRestartBlock);
const repairedLegacyTask = state.store.tasks.find(task => task.id === "legacy-restart-active");
assert.deepStrictEqual([repairedLegacyTask.window_start, repairedLegacyTask.window_end], ["2026-08-02", "2026-08-04"], "the active 1-Day window is rebuilt from the recovered restart");
assert.strictEqual(retrievalSchedule(repairedLegacyTask).inWindow, true, "the August 2 manual date is no longer compared with the July MLE window");
assert.strictEqual(taskOverdueInfo(repairedLegacyTask, "2026-08-10").label, "Overdue by 8 days", "overdue age is measured from the repaired manual date");
const importedLegacy = normalizeImportedData({ data: state.store }).store.blocks.find(block => block.id === legacyRestartBlock.id);
assert.strictEqual(importedLegacy.revision_anchor_date, "2026-08-02", "data import preserves a repaired practical anchor");

const workflowBlock = { id: "workflow-block", subject_id: "subject", unit_id: "unit", name: "Workflow controls", pre_study_date: "2026-08-10", mle_date: "2026-08-12", assessment_mode: "normal", custom_spacing: [], archived: false };
state.store.blocks.push(workflowBlock);
state.store.tasks.push(
  { id: "workflow-pre-study-done", block_id: workflowBlock.id, stage: "pre_study", cycle: 1, status: "completed", window_start: "2026-08-10", window_end: "2026-08-10" },
  { id: "workflow-mle", block_id: workflowBlock.id, stage: "mle", cycle: 1, status: "due", window_start: "2026-08-12", window_end: "2026-08-12" }
);
state.store.sessions.push({ id: "workflow-pre-study-session", block_id: workflowBlock.id, stage: "pre_study", cycle: 1, completed_at: "2026-08-10T14:00:00Z" });
const sessionsBeforeWorkflowActions = state.store.sessions.length;
const usageBeforeWorkflowActions = state.store.usage.length;
const workflowMle = state.store.tasks.find(task => task.id === "workflow-mle");
revertWorkflowStage(workflowMle, "Repeat the preparation", "2026-08-12");
const reopenedPreStudy = state.store.tasks.find(task => task.block_id === workflowBlock.id && task.stage === "pre_study" && live.includes(task.status));
assert.strictEqual(workflowMle.status, "reverted", "MLE reversion retains the former MLE task as history");
assert(reopenedPreStudy, "MLE reversion reopens Pre-study");
assert.strictEqual(reopenedPreStudy.scheduled_date, "2026-08-12", "the repeated Pre-study is actionable on the revert date");
assert.strictEqual(workflowBlock.mle_date, "2026-08-12", "MLE reversion preserves the assigned MLE date");
assert.strictEqual(preStudyCompleted(workflowBlock.id), false, "the replacement MLE stays blocked until repeated Pre-study is passed");
assert.strictEqual(state.store.sessions.length, sessionsBeforeWorkflowActions, "MLE reversion creates no completed session");
assert.strictEqual(state.store.usage.length, usageBeforeWorkflowActions, "MLE reversion creates no technique usage");

reopenedPreStudy.status = "completed";
advancePipeline(reopenedPreStudy, workflowBlock, "2026-08-12");
const replacementMle = state.store.tasks.find(task => task.block_id === workflowBlock.id && task.stage === "mle" && live.includes(task.status));
assert(replacementMle, "passing repeated Pre-study restores an active MLE");
skipWorkflowStage(replacementMle, "MLE intentionally omitted", "2026-08-12");
const oneDayAfterSkip = state.store.tasks.find(task => task.block_id === workflowBlock.id && task.stage === "zero_two" && live.includes(task.status));
assert.strictEqual(replacementMle.status, "skipped", "skip retains the omitted MLE as a non-completion record");
assert(oneDayAfterSkip, "skipping MLE advances to 1-Day Revision");
assert.strictEqual(state.store.sessions.length, sessionsBeforeWorkflowActions, "skipping MLE creates no completed session");
assert.strictEqual(state.store.usage.length, usageBeforeWorkflowActions, "skipping MLE creates no technique usage");
assert.strictEqual(state.store.stage_history.at(-1).action, "skip", "skip is distinguished in stage history");
assert.strictEqual(state.store.stage_history.at(-1).to_stage, "zero_two", "skip history records the resulting stage");

assert.deepStrictEqual(previousWorkflowStep(oneDayAfterSkip), { stage: "mle", cycle: 1 }, "1-Day Revision exposes MLE as its previous workflow step");
assert.strictEqual(revisionStageTask(oneDayAfterSkip), true, "the 1-Day row renders its Revert control");
revertWorkflowStage(oneDayAfterSkip, "Return to the assigned MLE", "2026-08-12");
const mleAfterOneDayRevert = state.store.tasks.find(task => task.block_id === workflowBlock.id && task.stage === "mle" && live.includes(task.status));
assert(mleAfterOneDayRevert, "reverting 1-Day Revision restores an active MLE");
assert.strictEqual(mleAfterOneDayRevert.window_start, "2026-08-12", "the restored MLE uses its assigned date");
syncAssessmentModes();
assert.strictEqual(state.store.tasks.filter(task => task.block_id === workflowBlock.id && isRevisionStage(task.stage) && [...live, "paused"].includes(task.status)).length, 0, "schedule refresh cannot regenerate 1-Day Revision beside a reverted MLE");
assert.strictEqual(state.store.tasks.filter(task => task.block_id === workflowBlock.id && task.stage === "mle" && [...live, "paused"].includes(task.status)).length, 1, "the reverted MLE remains the block's only active pipeline stage after refresh");
const pausedDuplicate = { id: "paused-duplicate-after-revert", block_id: workflowBlock.id, stage: "zero_two", cycle: 1, status: "paused", window_start: "2026-08-12", window_end: "2026-08-14" };
state.store.tasks.push(pausedDuplicate);
syncBlockAssessmentTasks(workflowBlock);
assert.strictEqual(pausedDuplicate.status, "superseded", "the repair also retires a paused revision duplicated beside an active MLE");
assert.strictEqual(workflowBlock.mle_date, "2026-08-12", "reverting 1-Day Revision does not rewrite the assigned MLE date");
assert.strictEqual(state.store.sessions.length, sessionsBeforeWorkflowActions, "reverting 1-Day Revision creates no completed session");
assert.strictEqual(state.store.usage.length, usageBeforeWorkflowActions, "reverting 1-Day Revision creates no technique usage");

skipWorkflowStage(mleAfterOneDayRevert, "Return to 1-Day Revision", "2026-08-12");
const restoredOneDay = state.store.tasks.find(task => task.block_id === workflowBlock.id && task.stage === "zero_two" && live.includes(task.status));
assert(restoredOneDay, "advancing the restored MLE returns to 1-Day Revision");
skipWorkflowStage(restoredOneDay, "Move to the end-of-week review", "2026-08-12");
assert(state.store.tasks.some(task => task.block_id === workflowBlock.id && task.stage === "two_week_review" && live.includes(task.status)), "skipping 1-Day Revision advances to the first end-of-week review");
assert.strictEqual(state.store.sessions.length, sessionsBeforeWorkflowActions, "skipping a revision creates no completed session");
assert.strictEqual(state.store.usage.length, usageBeforeWorkflowActions, "skipping a revision creates no technique usage");
assert(stageHistoryText(state.store.stage_history.at(-1)).includes("Skipped 1-Day Revision"), "skip history clearly names the skipped stage");

const editableMleBlock = { id: "editable-mle-block", subject_id: "subject", unit_id: "unit", name: "Editable MLE", pre_study_date: "2026-08-14", mle_date: "2026-08-14", assessment_mode: "normal", custom_spacing: [], archived: false };
state.store.blocks.push(editableMleBlock);
state.store.tasks.push({ id: "editable-mle-task", block_id: editableMleBlock.id, stage: "mle", cycle: 1, status: "due", window_start: "2026-08-14", window_end: "2026-08-14", scheduled_date: "2026-08-14", schedule_source: "legacy" });
applyBlockScheduleDates(editableMleBlock, "2026-08-20", "2026-08-20");
const editedMleTask = state.store.tasks.find(task => task.id === "editable-mle-task");
assert.strictEqual(editableMleBlock.mle_date, "2026-08-20", "the shared MLE editor updates the block field used by Subjects");
assert.strictEqual(editableMleBlock.pre_study_date, "2026-08-20", "same-as-MLE Pre-study follows the edited date");
assert.deepStrictEqual([editedMleTask.window_start, editedMleTask.window_end], ["2026-08-20", "2026-08-20"], "the active MLE task follows the edited block date");
assert.strictEqual(editedMleTask.scheduled_date, undefined, "a stale task-level MLE override cannot mask the block's edited date");
globalThis.__result = "Revision stage reversion and reset checks passed";
`;

const storage = new Map();
const context = {
  assert,
  console,
  crypto,
  setTimeout,
  clearTimeout,
  fetch: async () => ({ ok: true }),
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  },
  window: {
    __SIR_USER__: null,
    __SIR_ACCOUNT_STATE__: null,
    addEventListener: () => {},
  },
  document: {
    querySelector: () => ({}),
    createElement: () => ({}),
    createElementNS: () => ({}),
  },
};

context.sessionStorage = context.localStorage;
vm.createContext(context);
vm.runInContext(source, context);
console.log(context.__result);
