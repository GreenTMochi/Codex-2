const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync(require("path").join(__dirname, "offline.html"), "utf8");
let source = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
source = source.slice(0, source.indexOf('      window.addEventListener("beforeunload"'));
source += `
state.store = {
  subjects: [{ id: "subject", name: "Calculus", archived: false }],
  units: [{ id: "unit", subject_id: "subject", name: "Unit", assessment_mode: "normal", custom_spacing: [], archived: false }],
  blocks: [{ id: "block", subject_id: "subject", unit_id: "unit", name: "Limits", mle_date: "2026-07-14", pre_study_date: "2026-07-14", archived: false }],
  tasks: [],
  extra_sessions: [],
  sessions: [],
  usage: [],
  notifications: [],
  techniques: []
};
localStorage.setItem(appSettingsKey, JSON.stringify({ cycle_start_week: "2026-07-12", cycle_start_phase: 0, end_week_start: 5, end_week_end: 6, timezone: "America/New_York" }));
state.store.units[0].assessment_date = "2026-08-01";
const compressedPhases = timelineFocusPhases([{ key: "compressed", name: "Short unit", start_date: "2026-08-04", assessment_date: "2026-09-01" }]);
assert.deepStrictEqual(compressedPhases.map(phase => phase.key), ["broad", "focused", "precision"], "a 28-day unit runway preserves all three exam-focus phases");
assert.deepStrictEqual(compressedPhases.map(phase => phase.end_day - phase.start_day), [13, 11, 4], "a 28-day runway gives Broad Build meaningful space before narrowing");
assert(compressedPhases.every(phase => phase.ramp_rule.includes("Relative 28-day runway")), "phase tooltips explain the relative boundaries");
const longPhases = timelineFocusPhases([{ key: "long", name: "Long unit", start_date: "2026-06-13", assessment_date: "2026-09-01" }]);
assert.deepStrictEqual(longPhases.map(phase => phase.end_day - phase.start_day), [40, 30, 10], "an 80-day runway uses the same 50/37.5/12.5 relative split");
const projectedPilePlan = pilePlanningData(["block"]);
assert(projectedPilePlan.events.some(item => item.stage === "zero_two"), "pile calendar projects the 1-Day window");
assert(projectedPilePlan.events.some(item => item.stage === "two_week_review" && item.cycle === 1), "pile calendar projects the First 2W window");
assert(projectedPilePlan.events.some(item => item.stage === "two_week_review" && item.cycle === 2), "pile calendar projects the Second 2W window");
assert(projectedPilePlan.events.some(item => item.stage === "one_month"), "pile calendar projects the 1M window");
assert.strictEqual(projectedPilePlan.assessments[0].date, "2026-08-01", "pile calendar includes the selected unit assessment date");
delete state.store.units[0].assessment_date;
const pileArchiveRecord = { id: "archive-pile", name: "Archive me", block_ids: ["block"], technique_id: "", category: "declarative", level: "LO", archived: false, updated_at: "2026-08-31T12:00:00.000Z" };
const pileArchiveTask = { id: "archive-task", block_id: "block", stage: "zero_two", cycle: 1, status: "planned", window_start: "2026-08-31", window_end: "2026-09-02" };
state.store.piles = [pileArchiveRecord];
state.store.pile_sessions = [{ id: "archive-history", pile_id: pileArchiveRecord.id, shared_applied: true }];
state.store.tasks = [pileArchiveTask];
assert.strictEqual(setPileArchived(pileArchiveRecord.id, true), true, "Study Pile archive resolves the current saved pile by id");
assert.strictEqual(pileArchiveRecord.archived, true, "Study Pile archive immediately marks the pile inactive");
assert(Number.isFinite(Date.parse(pileArchiveRecord.archived_at)), "Study Pile archive stores a durable transition timestamp");
const firstArchivedAt = pileArchiveRecord.archived_at;
setPileArchived(pileArchiveRecord.id, true);
assert.strictEqual(pileArchiveRecord.archived_at, firstArchivedAt, "repeated archive attempts are idempotent");
assert.strictEqual(pilesForBlock("block").length, 0, "archived piles disappear from active block badges");
assert.strictEqual(pileGroupsForTasks([pileArchiveTask]).length, 0, "archived piles disappear from active Study cards");
assert.strictEqual(state.store.pile_sessions[0].id, "archive-history", "archiving preserves shared pile history");
setPileArchived(pileArchiveRecord.id, false);
assert.strictEqual(pileArchiveRecord.archived, false, "restoring makes the pile active again");
assert.strictEqual(Object.prototype.hasOwnProperty.call(pileArchiveRecord, "archived_at"), false, "restoring clears the inactive marker");
state.store.piles = [];
state.store.pile_sessions = [];
state.store.tasks = [];
const noteTextarea = { style: {}, scrollHeight: 460, listeners: {}, addEventListener(name, handler) { this.listeners[name] = handler; } };
autoSizeTextarea(noteTextarea);
noteTextarea.listeners.input();
assert.strictEqual(noteTextarea.style.height, "462px", "technique notes grow to fit their rendered text");
noteTextarea.scrollHeight = 0;
noteTextarea.value = Array.from({ length: 20 }, (_, index) => "Saved line " + (index + 1)).join("\\n");
noteTextarea.listeners.input();
assert.strictEqual(noteTextarea.style.height, "474px", "saved multi-line notes receive a content-based height even before layout measurement");
assert.strictEqual(appSettings().autosave.session_confidence, false, "confidence editing defaults to manual save for existing accounts");
assert.strictEqual(appSettings().timezone, "America/New_York", "legacy settings without a day boundary load without recursion or lost preferences");
assert.strictEqual(appSettings().study_day_boundary, "00:00", "legacy accounts receive the midnight study-day default directly");
assert.strictEqual(appSettings().technique_layout, "all", "all LO, MO, and HO sections are shown by default");
assert(html.includes('collapsed = Boolean(collapseKey && isCollapsed("study", collapseKey))'), "Study sections preserve collapse state during pile selection");
assert(!html.includes('collapsed = !state.pileSelection && collapseKey'), "pile selection no longer forces ordinary Study sections open");
assert(html.includes('function studySetupSection(blocks) { const collapsed = isCollapsed("study", "needs-scheduling")'), "Needs scheduling remains collapsible during pile selection");
assert(html.includes('function pileOtherBlocksSection(blocks) { const collapsed = isCollapsed("study", "pile-other-blocks")'), "Other available blocks has its own pile-selection collapse control");
assert.deepStrictEqual([appSettings().end_week_start, appSettings().end_week_end], [5, 0], "legacy end-week settings are normalized to the fixed Friday-through-Sunday weekend");
assert(html.includes('"study-schedule-action"'), "Study revision scheduling uses the compact calendar action");
assert(html.includes('"completion-date-action"'), "Study revisions expose a compact dated-completion action after Complete");
assert(html.includes('type: "date", max: today(), required: chooseCompletionDate'), "the dated-completion form requires a non-future date");
assert.strictEqual(revisionEventDate("2026-08-27"), "2026-08-27", "a date-only completion stays on the exact selected calendar day");
assert.strictEqual(optionalMinutes(""), null, "a blank time entry remains null");
assert.strictEqual(optionalMinutes("0"), null, "zero does not become recorded study time");
assert.strictEqual(optionalMinutes("17.6"), 18, "an explicitly entered time is normalized and retained");
state.store.sessions = [
  { id: "exact-time", block_id: "block", stage: "zero_two", minutes: 24 },
  { id: "other-stage-time", block_id: "block", stage: "two_week_review", minutes: 51 },
  { id: "other-block-time", block_id: "different-block", stage: "one_month", minutes: 73 }
];
assert.strictEqual(predictedMinutes("block", "zero_two"), 24, "an exact block-and-stage time remains available");
assert.strictEqual(predictedMinutes("block", "one_month"), 38, "a block's own recorded revision timing carries forward when the exact stage has no time");
assert.strictEqual(predictedMinutes("missing-block", "one_month"), null, "time from another block is never borrowed");
state.store.piles = [];
state.store.pile_sessions = [];
const homeTimeTasks = [{ id: "home-known", block_id: "block", stage: "zero_two", cycle: 1 }, { id: "home-missing", block_id: "missing-block", stage: "one_month", cycle: 1 }, { id: "home-mle", block_id: "block", stage: "mle", cycle: 1 }];
state.store.tasks = homeTimeTasks;
const partialHomeTime = homeEstimatedTime(homeTimeTasks);
assert.strictEqual(partialHomeTime.total, 24, "Home totals exact active revision timing");
assert.strictEqual(partialHomeTime.missing, 1, "Home reports active revisions with no time separately");
assert.strictEqual(partialHomeTime.text, "24 min entered · 1 no time", "Home does not present a partial duration as a complete total");
state.store.techniques = [{ id: "shared-technique", name: "Teaching", categories: ["declarative"] }];
state.store.piles = [{ id: "home-pile", name: "Home pile", block_ids: ["block", "pile-member"], technique_id: "shared-technique", category: "declarative", level: "LO", window_keys: ["all_revisions"], shared_minutes_estimate: 20, archived: false }];
state.store.sessions = [{ id: "home-block-time", block_id: "block", stage: "zero_two", minutes: 24 }, { id: "home-member-time", block_id: "pile-member", stage: "zero_two", minutes: 16 }];
const pileHomeTasks = [{ id: "home-pile-a", block_id: "block", stage: "zero_two", cycle: 1 }, { id: "home-pile-b", block_id: "pile-member", stage: "zero_two", cycle: 1 }];
state.store.tasks = pileHomeTasks;
const pileHomeTime = homeEstimatedTime(pileHomeTasks);
assert.strictEqual(pileHomeTime.total, 60, "Home counts shared pile timing exactly once alongside member timing");
assert.strictEqual(pileHomeTime.missing, 0, "fully timed pile work has no missing timing items");
assert(html.includes("activeTime = homeEstimatedTime(due, dueExtras)"), "Home totals only tasks and Custom Sessions whose date or window is open or overdue");
assert(!html.includes("activeTime = homeEstimatedTime(activeTasks)"), "Home excludes future scheduled revisions from the time total");
const dueExtra = { id: "extra-due", block_id: "block", name: "Custom Session", date: "2026-07-14", anchor_stage: "zero_two", anchor_cycle: 1, position: "before", technique_ids: [], planned_minutes: 15, status: "planned" };
assert.strictEqual(homeEstimatedTime([], [dueExtra]).total, 15, "Home includes explicit time for a due Custom Session");
const beforeOneDaySlot = { key: "before:zero_two:1", label: "Before 1-Day Revision", left: null, right: { stage: "zero_two", cycle: 1, name: "1-Day Revision", start: "2026-07-14", end: "2026-07-16" } };
assert.strictEqual(extraDateMatchesRelation("2026-07-14", beforeOneDaySlot), true, "same-day Custom Session placement before a window does not warn");
assert.strictEqual(extraDateMatchesRelation("2026-07-20", beforeOneDaySlot), false, "a date clearly after the selected before-window slot warns");
const betweenExtra = { block_id: "block", status: "planned", date: "2026-07-20", after_stage: "zero_two", after_cycle: 1, before_stage: "two_week_review", before_cycle: 1 };
state.store.extra_sessions = [betweenExtra];
assert.strictEqual(taskBlockedByCustomSession({ block_id: "block", stage: "zero_two", cycle: 1 }), false, "the stage before a Custom Session slot remains visible");
assert.strictEqual(taskBlockedByCustomSession({ block_id: "block", stage: "two_week_review", cycle: 1 }), true, "the stage after a Custom Session slot stays gated");
state.store.extra_sessions = [dueExtra];
state.store.tasks = [{ id: "protected-revision", block_id: "block", stage: "zero_two", cycle: 1, status: "planned", window_start: "2026-07-14", window_end: "2026-07-16" }];
state.store.sessions = [];
state.store.usage = [];
const protectedTasks = JSON.stringify(state.store.tasks);
assert.strictEqual(taskBlockedByCustomSession(state.store.tasks[0]), true, "a Custom Session before 1-Day gates that normal revision row");
const completedExtra = completeExtraSession(dueExtra, { confidence: 4, minutes: "19", notes: "Independent review" }, ["shared-technique"]);
assert.strictEqual(JSON.stringify(state.store.tasks), protectedTasks, "completing a Custom Session cannot mutate revision tasks");
assert.strictEqual(taskBlockedByCustomSession(state.store.tasks[0]), false, "completing a Custom Session immediately releases its normal revision gate");
assert.strictEqual(dueExtra.status, "completed", "completed Custom Session leaves the active schedule");
assert.strictEqual(completedExtra.stage, "extra_session", "Custom Session completion gets a distinct history stage");
assert.strictEqual(completedExtra.minutes, 19, "Custom Session records only explicitly entered time");
assert.strictEqual(completedExtra.confidence, 4, "Custom Session stores its own confidence");
assert.strictEqual(state.store.usage[0].technique_id, "shared-technique", "Custom Session records the block technique planned for its anchor window");
state.store.piles = [];
state.store.pile_sessions = [];
state.store.sessions = [];
state.store.tasks = [];
state.store.extra_sessions = [];
state.store.techniques = [];
assert(html.includes('text: estimate == null ? "No time"'), "Study labels missing timing as No time");
assert(html.includes("if (missing) return") && html.includes("entered ·") && html.includes("no time"), "partial pile timing distinguishes entered time from members with no time");
const mleSortedBlocks = blocksByProgress([
  { id: "older", mle_date: "2026-07-14", order: 0, name: "Older" },
  { id: "undated", mle_date: "", order: 0, name: "Undated" },
  { id: "newer-b", mle_date: "2026-08-20", order: 2, name: "Newer B" },
  { id: "newer-a", mle_date: "2026-08-20", order: 1, name: "Newer A" }
]);
assert.deepStrictEqual(Array.from(mleSortedBlocks, item => item.id), ["older", "newer-a", "newer-b", "undated"], "same-stage blocks sort by earlier MLE date, manual tie order, then undated blocks");
assert(html.includes('blocks = blocksByProgress(visible(state.store.blocks.filter(b => b.unit_id === unit.id)))'), "unit rows use later-stage-first block ordering");
state.store.blocks.push({ id: "unit-context", subject_id: "subject", unit_id: "unit", name: "Related unit block", mle_date: "2026-08-10", archived: false });
assert.deepStrictEqual(Array.from(pilePlanningBlocks(["block"]), item => item.id).sort(), ["block", "unit-context"], "pile planning includes every active block in a selected member's unit");
state.store.blocks = state.store.blocks.filter(item => item.id !== "unit-context");
assert(html.includes("timelineScheduleEvents().filter(event => ids.has(event.block_id) && isRevisionStage(event.stage))"), "pile planning uses the same scheduled and projected revision source as Timeline");
assert(html.includes('class: "pile-planning-alert"') && html.includes("after an upcoming test"), "pile planning warns when normal revision windows land after a test");
assert(html.includes("state.modal.pileCalendarMonth ||= focusDate.slice(0, 7)"), "pile planning opens on the nearest relevant assessment month");
assert(html.includes('savedMinutes = optionalMinutes(t.pending_minutes)') && html.includes('value: savedMinutes || "", placeholder: estimate == null ? "Optional"'), "individual completion time opens blank unless actual active time was explicitly recorded");
assert(!html.includes('value: estimate, placeholder:'), "a predicted estimate is never auto-recorded as actual time");
assert(html.includes('shared_minutes: "", shared_notes: ""') && html.includes('minutes: optionalMinutes(task.pending_minutes) || "", gaps: "", notes: ""'), "pile completion keeps shared time blank and reuses only explicitly saved member time");
assert(html.includes('task.stage === "zero_two" && task.estimated_minutes == null') && html.includes('delete task.pending_minutes'), "legacy active 1-Day timing migrates into a separate planning estimate");
assert(html.includes('if (session.stage === "mle") delete session.minutes'), "legacy MLE time records are removed during normalization");
assert(html.includes('if (!isPreStudy && !isMle) fields.push(lab("Time spent (minutes)", mins))'), "individual MLE completion never renders a time-spent field");
assert(html.includes('text: isEstimate ? "Estimated time" : "Time spent so far"'), "active 1-Day revisions expose an explicit planning estimate");
assert(html.includes('.rich-editor-area p, .rich-editor-area div, .rich-text-display p, .rich-text-display div { margin: 0; }'), "Enter-created paragraphs use normal compact line spacing in editors and saved text");
assert(!html.includes('.rich-editor-area p, .rich-editor-area div, .rich-text-display p, .rich-text-display div { margin: 0 0 .65em; }'), "the old extended Enter spacing is removed");
assert.strictEqual(allowedRichHighlight("#111827"), "#475569", "legacy blackout highlights migrate to the visible slate cover");
assert.strictEqual(allowedRichHighlight("rgb(71, 85, 105)"), "#475569", "the new blackout cover survives browser RGB normalization");
assert(html.includes('{ name: "Blackout", value: "#475569", blackout: true }'), "the blackout palette uses the visible slate cover");
assert(html.includes('background === "#475569" ? background : "#111827"'), "blackout text matches its cover while ordinary highlighted text remains dark");
assert(html.includes('span[style*="background-color:#475569"]') && html.includes('background: #475569 !important;'), "blackout regions retain a distinct opaque cover");
assert(html.includes('span[style*="background-color"] { padding: 0; border-radius: 1px; }'), "adjacent highlights do not create padded seams");
assert(html.includes('background: #475569 !important; -webkit-text-fill-color: #475569 !important') && html.includes('span[style*="background-color:#475569"] *'), "blackout covers stay opaque over nested browser formatting");
const applyHighlightSource = html.slice(html.indexOf("const applyHighlight = value =>"), html.indexOf("const keepSelection = event =>"));
assert(!applyHighlightSource.includes("palette.hidden"), "choosing or removing a highlight does not close the color palette");
assert(html.includes('tool("Highlight", "Choose a highlight color", () => { palette.hidden = !palette.hidden; }'), "the main Highlight button remains the palette open and close control");
assert(html.includes('if (event.key === "Enter") { if (clearTypingHighlight(true)) { event.preventDefault();') && html.includes('insertPlainLineBreak();'), "highlighted Enter bypasses the browser's inherited-format line creation");
assert(html.includes('const lineBreak = ["insertParagraph", "insertLineBreak"].includes(event.inputType)') && html.includes('if (lineBreak) { clearTypingHighlight(true); resetHighlightAfterInput = true; }'), "both Enter input modes clear active highlighting");
const beforeInputSource = html.slice(html.indexOf('editor.addEventListener("beforeinput"'), html.indexOf('editor.addEventListener("input"'));
assert(!beforeInputSource.includes("deleteContentBackward") && !beforeInputSource.includes("deleteContentForward"), "Delete and Backspace never trigger caret-moving highlight cleanup");
assert(html.includes("function mergeAdjacentRichHighlights(root)") && html.includes("node.append(...next.childNodes); next.remove();"), "same-color highlight fragments are normalized into one continuous region");
assert(html.includes('setTimeout(() => { clearTypingHighlight(true); changed = true; sync(); }, 0)'), "new lines receive a second highlight cleanup after browser insertion");
assert(html.includes('function unwrapEmptyRichFormatting(root)') && html.includes('node.replaceWith(...node.childNodes)'), "empty highlight wrappers are unwrapped while their line breaks are preserved");
assert(html.includes('const trailingBreaks = []') && html.includes('hasBreak = child.nodeName === "BR"') && html.includes('trailingBreaks.unshift(child)'), "trailing line breaks are moved outside highlighted spans");
assert(html.includes('const plainCaretMarker =') && html.includes('target.setStart(anchor, 1)'), "the caret receives a stable plain marker outside the highlight wrapper");
assert(html.includes('const removePlainCaretMarkers = () =>') && html.includes('textNode.data = textNode.data.replace('), "temporary caret markers are removed as soon as typing begins");
assert(html.includes('return template.innerHTML.replace('), "temporary caret markers are never written into saved rich text");
assert(html.includes('const insertPlainLineBreak = () =>') && html.includes('lineBreak.after(anchor)') && html.includes('changed = true; sync();'), "highlighted Enter inserts and saves an unformatted line synchronously");
assert(html.includes('.study-task-block-name {') && html.includes('class: "study-task-block-name", text: blockName'), "Study renders the block name as its own accented element");
assert(html.includes('class: "study-task-window-label", text: windowLabel'), "Study keeps the revision window separate from the block name");
assert(html.includes("if (accountValueEqual(snapshot, accountSnapshot())) return false;"), "an identical sync response does not replace live objects behind open editors");
assert(html.includes("applyAccountSnapshot(merged, true)") && html.includes("applyAccountSnapshot(canonical, true)"), "genuinely changed account state rebuilds the interface instead of leaving stale controls");
assert(html.includes("if (JSON.stringify(state.store) !== beforeRefresh) save();"), "no-op renders do not trigger redundant account saves");
const migratedBlock = { description: "Existing description", weak_points: "Legacy weak-point note" };
assert.strictEqual(mergeLegacyWeakPointsIntoDescription(migratedBlock), true, "legacy weak-point data triggers migration");
assert.strictEqual(migratedBlock.description, "Existing description\\n\\nLegacy weak-point note", "legacy weak-point data is appended without replacing the description");
assert.strictEqual(Object.prototype.hasOwnProperty.call(migratedBlock, "weak_points"), false, "the legacy weak-point field is removed after migration");
assert.strictEqual(mergeLegacyWeakPointsIntoDescription(migratedBlock), false, "the migration is repeat-safe after the legacy field is removed");
const duplicateMigration = { description: "Legacy weak-point note", weak_points: "Legacy weak-point note" };
mergeLegacyWeakPointsIntoDescription(duplicateMigration);
assert.strictEqual(duplicateMigration.description, "Legacy weak-point note", "legacy text already present in the description is not duplicated");
assert(!html.includes("weakPointsOpen") && !html.includes('text: "Gaps & weak points"'), "the separate weak-points workspace card is removed");
const protectedPlacement = { id: "protected-placement", block_id: "block", category: "declarative", level: "LO", technique_id: "protected-technique", notes: "Earlier saved text" };
state.store.placements = [protectedPlacement];
state.openBlock = { blockId: "block", noteDrafts: { [protectedPlacement.id]: "New protected text" }, dirtyKeys: { ["technique-note:" + protectedPlacement.id]: true } };
assert.strictEqual(commitTechniqueNoteDrafts(), true, "an in-memory technique note is committed before a rerender or edit modal");
assert.strictEqual(protectedPlacement.notes, "New protected text", "committing drafts preserves the newest technique content");
assert.strictEqual(Object.keys(state.openBlock.noteDrafts).length, 0, "committed technique drafts are cleared only after reaching the placement record");
state.openBlock.noteDrafts[protectedPlacement.id] = "Protected while removed";
hideTechniquePlacement(protectedPlacement);
assert.strictEqual(protectedPlacement.notes, "Protected while removed", "removing a placement commits its newest technique text first");
assert.strictEqual(protectedPlacement.preset_assignment_removed, true, "removing a technique hides its placement instead of deleting it");
const replacementPlacement = { id: "replacement-placement", block_id: "block", category: "procedural", level: "HO", technique_id: "old-technique", notes: "Never erase this" };
state.store.placements = [replacementPlacement];
state.openBlock = null;
applyPresetToBlocks({ id: "replacement-preset", placements: [{ category: "declarative", level: "LO", technique_id: "new-technique" }] }, [state.store.blocks[0]], true);
assert(state.store.placements.includes(replacementPlacement), "preset replacement retains the previous placement record");
assert.strictEqual(replacementPlacement.notes, "Never erase this", "preset replacement retains previous technique content");
assert.strictEqual(replacementPlacement.preset_assignment_removed, true, "preset replacement hides superseded techniques instead of deleting them");
state.store.placements = [];
state.store.units[0].assessment_date = "2026-07-14";
state.store.units.push({ id: "nested-assessment", subject_id: "subject", parent_unit_id: "unit", name: "Nested test", assessment_date: "2026-07-14", archived: false });
const massAddContext = massAddDateContext("subject", "2026-07-14");
assert.deepStrictEqual(Array.from(massAddContext.blocks, item => item.id), ["block"], "mass add shows existing subject blocks on their assigned MLE date");
assert.deepStrictEqual(Array.from(massAddContext.tests, item => item.id), ["unit", "nested-assessment"], "mass add shows assessment dates from active units and nested sub-units");
state.store.blocks[0].archived = true;
assert.strictEqual(massAddDateContext("subject", "2026-07-14").blocks.length, 0, "mass add excludes archived blocks from its schedule markers");
state.store.blocks[0].archived = false;
state.store.units = state.store.units.filter(item => item.id !== "nested-assessment");
delete state.store.units[0].assessment_date;
assert(html.includes('class: "mass-add-calendar-marker blocks"') && html.includes('class: "mass-add-calendar-marker test"'), "mass add renders separate block and test markers");
assert(html.includes("stageHistoryOpen: false"), "revision stage history starts collapsed whenever a block opens");
assert(html.includes('"aria-expanded": String(open)'), "revision stage history exposes an accessible collapsible control");
const overdueReview = { stage: "two_week_review", cycle: 1, status: "planned", scheduled_date: "2026-08-07", window_start: "2026-08-07", window_end: "2026-08-09" };
assert.strictEqual(taskOverdueInfo(overdueReview, "2026-08-09").overdue, false, "a First 2W revision remains due throughout its assigned Sunday even when scheduled for Friday");
assert.deepStrictEqual(Array.from(Object.values(taskOverdueInfo(overdueReview, "2026-08-10"))), [true, 1, "2026-08-09", "Overdue by 1 day"], "a First 2W revision becomes overdue on Monday after its assigned weekend");
assert.strictEqual(taskOverdueInfo({ ...overdueReview, stage: "one_month" }, "2026-08-10").overdue, true, "1M revisions use the same fixed weekend deadline");
assert.strictEqual(taskOverdueInfo({ ...overdueReview, cycle: 2 }, "2026-08-10").overdue, true, "Second 2W revisions use the same fixed weekend deadline");
const manuallyMissedReview = { ...overdueReview, window_start: "2026-08-14", window_end: "2026-08-16", assigned_window_start: "2026-08-14", assigned_window_end: "2026-08-16", scheduled_date: "2026-08-08", schedule_source: "manual" };
assert.strictEqual(taskDeadline(manuallyMissedReview), "2026-08-08", "a manual 2W date outside its assigned weekend remains the explicit deadline");
assert.strictEqual(taskOverdueInfo(manuallyMissedReview, "2026-08-10").overdue, true, "a missed manual 2W date cannot appear scheduled for a later weekend");
assert.strictEqual(taskTemporalStatus(overdueReview, "2026-08-10"), "overdue", "past review windows receive overdue state");
assert.strictEqual(taskTemporalStatus({ ...overdueReview, window_start: "2026-08-10", window_end: "2026-08-11" }, "2026-08-10"), "due", "a multi-day review is due, not overdue, while its window remains open");
assert.strictEqual(taskOverdueInfo({ stage: "mle", status: "planned", window_start: "2026-08-09", window_end: "2026-08-09" }, "2026-08-10").label, "Overdue by 1 day", "MLEs use the universal overdue rule");
assert.strictEqual(taskOverdueInfo({ stage: "pre_study", status: "planned", window_start: "2026-08-11", window_end: "2026-08-11" }, "2026-08-10").overdue, false, "future tasks never display as overdue");
assert(html.includes('class: "pill task-overdue"'), "task rows render the explicit overdue badge");
state.openBlock = { blockId: "block", placementLayoutDraft: null };
state.store.techniques = [
  { id: "manual-technique", name: "Manual", categories: ["declarative"] },
  { id: "scheduled-technique", name: "Scheduled", categories: ["procedural"] }
];
state.store.placements = [{ id: "manual-placement", block_id: "block", category: "declarative", level: "LO", technique_id: "manual-technique" }];
state.store.presets = [{ id: "scheduled-preset", name: "Future preset", placements: [{ category: "procedural", level: "HO", technique_id: "scheduled-technique" }] }];
state.store.preset_links = [{ id: "scheduled-link", preset_id: "scheduled-preset", target_type: "block", target_id: "block", window_keys: ["two_week_review:2"] }];
state.store.preset_exclusions = [];
localStorage.setItem(appSettingsKey, JSON.stringify({ ...appSettings(), technique_layout: "compact" }));
assert.deepStrictEqual(Array.from(visibleKnowledgeLevels(state.store.blocks[0], "declarative")), ["LO"], "compact layout includes manually populated sections only");
assert.deepStrictEqual(Array.from(visibleKnowledgeLevels(state.store.blocks[0], "procedural")), ["HO"], "compact layout includes future scheduled preset sections");
const compactPlacementSnapshot = JSON.stringify(state.store.placements);
localStorage.setItem(appSettingsKey, JSON.stringify({ ...appSettings(), technique_layout: "all" }));
assert.deepStrictEqual(Array.from(visibleKnowledgeLevels(state.store.blocks[0], "procedural")), ["LO", "MO", "HO"], "all-sections layout keeps the current six-section view");
assert.strictEqual(JSON.stringify(state.store.placements), compactPlacementSnapshot, "changing the visual layout does not alter technique placements");
localStorage.setItem(appSettingsKey, JSON.stringify({ ...appSettings(), technique_layout: "compact" }));
state.openBlock = null;
state.store.techniques = [];
state.store.placements = [];
state.store.presets = [];
state.store.preset_links = [];
state.store.preset_exclusions = [];
assert.strictEqual(dateInTimezone(new Date("2026-08-03T03:09:00Z"), "America/New_York"), "2026-08-02", "New York does not roll into tomorrow at UTC midnight");
assert.strictEqual(dateInTimezone(new Date("2026-08-03T03:09:00Z"), "UTC"), "2026-08-03", "the selected timezone controls the displayed day");
assert.strictEqual(dateInTimezone(new Date("2026-08-13T05:30:00Z"), "America/New_York", "02:00"), "2026-08-12", "1:30 AM belongs to the previous study day when the boundary is 2:00 AM");
assert.strictEqual(dateInTimezone(new Date("2026-08-13T06:00:00Z"), "America/New_York", "02:00"), "2026-08-13", "the next study day begins exactly at the configured boundary");
assert.strictEqual(dateInTimezone(new Date("2026-08-13T05:30:00Z"), "America/New_York", "00:00"), "2026-08-13", "midnight remains the default study-day boundary");
assert.strictEqual(calendarDateInTimezone(new Date("2026-08-13T05:30:00Z"), "America/New_York"), "2026-08-13", "historical timestamps keep their literal local calendar date");
assert.deepStrictEqual(Array.from(normalReviewPlan({ id: "plan-week-1", mle_date: "2026-07-14" }).twoWeek, item => item.global_cycle_position), [1, 2], "a Week 1 block joins the first and second shared 2W reviews");
assert.deepStrictEqual(Array.from(normalReviewPlan({ id: "plan-week-2", mle_date: "2026-07-21" }).twoWeek, item => item.global_cycle_position), [2, 3], "a Week 2 block joins the second and third shared 2W reviews as its personal first and second reviews");
assert.deepStrictEqual(Array.from(normalReviewPlan({ id: "plan-week-3", mle_date: "2026-07-28" }).twoWeek, item => item.global_cycle_position), [3], "a Week 3 block appears only once before the shared 1M week");
const weekFourPlan = normalReviewPlan({ id: "plan-week-4", mle_date: "2026-08-02" });
assert.deepStrictEqual(Array.from(weekFourPlan.twoWeek, item => [item.cycle, item.global_cycle_position, item.window_start, item.window_end]), [[1, 4, "2026-08-07", "2026-08-09"], [2, 1, "2026-08-14", "2026-08-16"]], "a First 2W always uses the 1-Day anchor week, including the shared 1M week, before a possible Second 2W next weekend");
assert.deepStrictEqual([weekFourPlan.oneMonth.window_start, weekFourPlan.oneMonth.window_end], ["2026-09-04", "2026-09-06"], "the eventual 1M window still follows the shared cycle and closes Sunday");
const saturdayCompletionPlan = normalReviewPlan({ id: "saturday-one-day", mle_date: "2026-08-01", revision_anchor_date: "2026-08-08" });
assert.deepStrictEqual([saturdayCompletionPlan.twoWeek[0].window_start, saturdayCompletionPlan.twoWeek[0].window_end], ["2026-08-07", "2026-08-09"], "completing 1-Day on Saturday keeps First 2W in that same Friday-through-Sunday window");
const manuallyDeferredSameWeek = { stage: "two_week_review", cycle: 1, status: "planned", window_start: "2026-08-07", window_end: "2026-08-09", assigned_window_start: "2026-08-07", assigned_window_end: "2026-08-09", scheduled_date: "2026-08-15", schedule_source: "manual" };
assert.strictEqual(taskDeadline(manuallyDeferredSameWeek), "2026-08-15", "manual scheduling remains the explicit way to defer a same-week First 2W task");
const repairBlock = { id: "repair-same-week", subject_id: "subject", unit_id: "unit", name: "Repair same week", mle_date: "2026-08-01", revision_anchor_date: "2026-08-08", assessment_mode: "normal", archived: false }, repairAutomatic = { id: "repair-automatic", block_id: repairBlock.id, stage: "two_week_review", cycle: 1, status: "planned", window_start: "2026-08-14", window_end: "2026-08-16", assigned_window_start: "2026-08-14", assigned_window_end: "2026-08-16" }, preserveManual = { ...repairAutomatic, id: "preserve-manual", schedule_source: "manual", scheduled_date: "2026-08-15" };
state.store.blocks.push(repairBlock); state.store.tasks.push(repairAutomatic, preserveManual);
assert.strictEqual(repairSameWeekFirstReviews(), true, "the old automatically assigned next-week First 2W pattern is detected and repaired");
assert.deepStrictEqual([repairAutomatic.window_start, repairAutomatic.window_end], ["2026-08-07", "2026-08-09"], "an existing automatic First 2W moves back to the 1-Day completion week");
assert.deepStrictEqual([preserveManual.window_start, preserveManual.window_end, preserveManual.scheduled_date], ["2026-08-14", "2026-08-16", "2026-08-15"], "an existing manually deferred First 2W is never migrated");
state.store.blocks = state.store.blocks.filter(item => item.id !== repairBlock.id); state.store.tasks = state.store.tasks.filter(item => ![repairAutomatic.id, preserveManual.id].includes(item.id));
assert.deepStrictEqual(normalReviewPlan({ id: "no-assigned-mle" }), { twoWeek: [], oneMonth: null }, "revision planning requires the block's assigned MLE date");
const completionTestStore = cloneAccountSnapshot(state.store);
const completionBlock = { id: "completion-block", subject_id: "subject", unit_id: "unit", name: "Completion safety", pre_study_date: "2026-08-25", mle_date: "2026-08-25", archived: false };
state.store.blocks.push(completionBlock);
state.store.tasks.push({ id: "completion-pre", block_id: completionBlock.id, subject_id: "subject", unit_id: "unit", stage: "pre_study", cycle: 1, status: "due", window_start: "2026-08-25", window_end: "2026-08-25" });
const completedPreStudy = completeTaskById("completion-pre", { notes: "Prepared" });
assert.strictEqual(completedPreStudy.task_id, "completion-pre", "Pre-study completion is linked to its exact task");
assert.strictEqual(state.store.tasks.find(task => task.id === "completion-pre").status, "completed", "Pre-study completion updates the current stored task");
assert.strictEqual(state.store.tasks.filter(task => task.block_id === completionBlock.id && task.stage === "mle" && live.includes(task.status)).length, 1, "Pre-study completion creates one MLE task");
const preStudySessionCount = state.store.sessions.filter(session => session.task_id === "completion-pre").length;
state.store.tasks.find(task => task.id === "completion-pre").status = "planned";
completeTaskById("completion-pre", { notes: "Duplicate click" });
assert.strictEqual(state.store.sessions.filter(session => session.task_id === "completion-pre").length, preStudySessionCount, "repeated Pre-study completion is idempotent");
assert.strictEqual(state.store.tasks.find(task => task.id === "completion-pre").status, "completed", "a resurrected Pre-study task is closed from its exact retained session");
const completionMle = state.store.tasks.find(task => task.block_id === completionBlock.id && task.stage === "mle" && live.includes(task.status));
const completedMle = completeTaskById(completionMle.id, { completed_at: "2026-08-25T16:00:00Z", minutes: 99 });
assert.strictEqual(completedMle.task_id, completionMle.id, "MLE completion is linked to its exact task");
assert.strictEqual(Object.prototype.hasOwnProperty.call(completedMle, "minutes"), false, "MLE completion ignores time even when a stale caller supplies it");
assert.strictEqual(state.store.tasks.find(task => task.id === completionMle.id).status, "completed", "MLE completion updates the current stored task");
assert.strictEqual(state.store.tasks.filter(task => task.block_id === completionBlock.id && task.stage === "zero_two" && live.includes(task.status)).length, 1, "MLE completion creates one 1-Day task");
const mleSessionCount = state.store.sessions.filter(session => session.task_id === completionMle.id).length;
state.store.tasks.find(task => task.id === completionMle.id).status = "planned";
completeTaskById(completionMle.id, {});
assert.strictEqual(state.store.sessions.filter(session => session.task_id === completionMle.id).length, mleSessionCount, "repeated MLE completion cannot duplicate its session or progression");
assert.strictEqual(state.store.tasks.filter(task => task.block_id === completionBlock.id && task.stage === "zero_two" && live.includes(task.status)).length, 1, "a resurrected MLE task cannot duplicate 1-Day progression");
const completionOneDay = state.store.tasks.find(task => task.block_id === completionBlock.id && task.stage === "zero_two" && live.includes(task.status));
completionOneDay.estimated_minutes = 37;
assert.strictEqual(predictedMinutes(completionBlock.id, "zero_two", completionOneDay.id), 37, "an active 1-Day planning estimate is immediately available to workload projections");
assert.strictEqual(predictedMinutes(completionBlock.id, "mle", completionMle.id), null, "MLEs never contribute a time projection");
completionOneDay.pending_minutes = 19;
const completedOneDay = completeTaskById(completionOneDay.id, { confidence: 3, minutes: 19, completion_percent: 75, gaps: "Finished most", notes: "Percentage is context", completed_date: "2026-08-27" });
assert.strictEqual(completedOneDay.completion_percent, 75, "revision completion stores its explicit percentage as session context");
assert.strictEqual(completedOneDay.stage_completed, true, "a completion below 100% still advances the revision stage");
assert.strictEqual(completedOneDay.task_id, completionOneDay.id, "the advancing session owns the exact completed task id");
assert.strictEqual(Object.prototype.hasOwnProperty.call(completedOneDay, "source_task_id"), false, "new completion sessions are never stranded behind a source-task link");
assert.strictEqual(state.store.tasks.find(task => task.id === completionOneDay.id).status, "completed", "75% completion closes the current revision stage");
assert.strictEqual(taskDone(completionBlock.id, "zero_two"), true, "scheduling treats the deliberate completion action as stage completion");
assert(sessionSummary(completedOneDay).includes("Completion 75%"), "the Log displays completion percentage as session metadata");
assert(html.includes("Completing it advances the revision stage") && !html.includes("Leave Completion at 100% when you are ready to finish and advance"), "Study states that percentage does not gate progression");
assert.strictEqual(completedOneDay.minutes, 19, "time explicitly entered for a below-100% completion remains attached to the advancing session");
assert.strictEqual(completedOneDay.completed_at, "2026-08-27", "a missed revision is stored on the selected date without inventing a time");
assert.strictEqual(completedOneDay.completed_on, "2026-08-27", "the explicit completion day is retained separately for reliable progression");
assert.strictEqual(completedOneDay.completion_date_source, "manual", "history distinguishes a manually selected completion day");
assert.strictEqual(completionOneDay.completed_on, "2026-08-27", "the completed task retains the same selected completion day");
assert.strictEqual(completionBlock.revision_anchor_date, "2026-08-27", "the selected 1-Day completion date becomes the practical revision anchor");
assert.strictEqual(state.store.sessions.filter(session => session.task_id === completionOneDay.id).length, 1, "the completion action creates exactly one advancing session");
completionOneDay.status = "overdue";
reconcileRevisionTaskCompletions();
assert.strictEqual(completionOneDay.status, "completed", "a revision task resurrected by stale sync is repaired from its exact saved session");
assert.strictEqual(state.store.tasks.filter(task => task.block_id === completionBlock.id && task.stage === "zero_two" && live.includes(task.status)).length, 0, "revision completion repair cannot leave the finished stage active");
assert.strictEqual(state.store.tasks.filter(task => task.block_id === completionBlock.id && task.stage === "two_week_review" && live.includes(task.status)).length, 1, "revision completion repair preserves exactly one next stage");
const legacyRecoveryBlock = { id: "legacy-held-block", subject_id: "subject", unit_id: "unit", name: "Legacy held percentage", pre_study_date: "2026-08-25", mle_date: "2026-08-25", archived: false };
const legacyRecoveryTask = { id: "legacy-held-task", block_id: legacyRecoveryBlock.id, subject_id: "subject", unit_id: "unit", stage: "zero_two", cycle: 1, status: "overdue", window_start: "2026-08-26", window_end: "2026-08-26" };
state.store.blocks.push(legacyRecoveryBlock);
state.store.tasks.push({ id: "legacy-held-mle", block_id: legacyRecoveryBlock.id, subject_id: "subject", unit_id: "unit", stage: "mle", cycle: 1, status: "completed", window_start: "2026-08-25", window_end: "2026-08-25", completed_at: "2026-08-25T10:00:00Z" }, legacyRecoveryTask);
state.store.sessions.push(
  { id: "legacy-held-mle-session", task_id: "legacy-held-mle", block_id: legacyRecoveryBlock.id, stage: "mle", cycle: 1, completed_at: "2026-08-25T10:00:00Z", confidence: 3 },
  { id: "legacy-attempt-1", source_task_id: legacyRecoveryTask.id, block_id: legacyRecoveryBlock.id, stage: "zero_two", cycle: 1, completed_at: "2026-08-27T10:00:00Z", completion_percent: 50, stage_completed: false, confidence: 2 },
  { id: "legacy-attempt-2", source_task_id: legacyRecoveryTask.id, block_id: legacyRecoveryBlock.id, stage: "zero_two", cycle: 1, completed_at: "2026-08-28T10:00:00Z", completion_percent: 75, stage_completed: false, confidence: 3 },
  { id: "legacy-attempt-3", source_task_id: legacyRecoveryTask.id, block_id: legacyRecoveryBlock.id, stage: "zero_two", cycle: 1, completed_at: "2026-08-29T10:00:00Z", completion_percent: 75, stage_completed: false, confidence: 3 }
);
reconcileRevisionTaskCompletions();
assert.strictEqual(legacyRecoveryTask.status, "completed", "the recovery pass advances a task held by the old percentage gate");
assert.strictEqual(state.store.sessions.find(session => session.id === "legacy-attempt-3").task_id, legacyRecoveryTask.id, "the newest held attempt becomes the single progression event");
assert.strictEqual(state.store.sessions.find(session => session.id === "legacy-attempt-3").stage_completed, true, "the recovered attempt is marked as stage-completing without changing its percentage");
assert.strictEqual(state.store.sessions.filter(session => session.source_task_id === legacyRecoveryTask.id).length, 2, "earlier repeated attempts remain in history");
assert.strictEqual(state.store.tasks.filter(task => task.block_id === legacyRecoveryBlock.id && task.stage === "two_week_review" && live.includes(task.status)).length, 1, "legacy recovery advances exactly once to the next stage");
const failingBlock = { id: "failing-completion-block", subject_id: "subject", unit_id: "unit", name: "Transactional completion", assessment_mode: "normal", revision_reset: { stage: "two_week_review", max_cycle: 2 }, archived: false };
const failingTask = { id: "failing-completion-task", block_id: failingBlock.id, subject_id: "subject", unit_id: "unit", stage: "two_week_review", cycle: 1, status: "due", window_start: "2026-08-28", window_end: "2026-08-30" };
state.store.blocks.push(failingBlock); state.store.tasks.push(failingTask);
const beforeFailedCompletion = JSON.stringify(state.store);
assert.throws(() => completeTaskById(failingTask.id, { completion_percent: 100 }), /configured date/, "a next-stage scheduling failure is surfaced");
assert.strictEqual(JSON.stringify(state.store), beforeFailedCompletion, "a failed individual completion rolls back every task, session, and schedule mutation");
state.store.tasks.push({ id: "future-completion", block_id: completionBlock.id, subject_id: "subject", unit_id: "unit", stage: "two_week_review", cycle: 1, status: "planned", window_start: "2099-01-01", window_end: "2099-01-02" });
assert.throws(() => completeTaskById("future-completion", { completed_date: "2099-01-01" }), /future/, "future completion dates are rejected");
assert.throws(() => completeTaskById("future-completion", { completion_percent: 0 }), /1 to 100/, "completion percentage rejects values below the valid range");
assert(!Object.prototype.hasOwnProperty.call(completionOneDay, "estimated_minutes"), "the temporary 1-Day estimate is cleared after completion");
const strandedBlock = { id: "stranded-core", subject_id: "subject", unit_id: "unit", name: "Previously stranded", pre_study_date: "2026-08-20", mle_date: "2026-08-21", archived: false };
state.store.blocks.push(strandedBlock);
state.store.tasks.push({ id: "stranded-pre", block_id: strandedBlock.id, stage: "pre_study", cycle: 1, status: "planned", window_start: "2026-08-20", window_end: "2026-08-20" });
state.store.sessions.push({ id: "stranded-session", block_id: strandedBlock.id, stage: "pre_study", cycle: 1, completed_at: "2026-08-20T12:00:00Z" });
reconcileCoreTaskCompletions();
assert.strictEqual(state.store.tasks.find(task => task.id === "stranded-pre").status, "completed", "a Pre-study task stranded by the old sync bug is repaired from its retained session");
assert.strictEqual(state.store.sessions.find(session => session.id === "stranded-session").task_id, "stranded-pre", "repaired history is linked without deleting the original session");
state.store.tasks.push({ id: "intentional-reopen", block_id: strandedBlock.id, stage: "pre_study", cycle: 1, status: "planned", schedule_source: "mle_revert", window_start: "2026-08-25", window_end: "2026-08-25" });
reconcileCoreTaskCompletions();
assert.strictEqual(state.store.tasks.find(task => task.id === "intentional-reopen").status, "planned", "an intentionally reverted Pre-study stage is not mistaken for a duplicate");
state.store = completionTestStore;
const block = state.store.blocks[0];
const mle = { id: "mle", block_id: block.id, subject_id: block.subject_id, unit_id: block.unit_id, stage: "mle", cycle: 1, status: "completed", window_start: "2026-07-14", window_end: "2026-07-14" };
state.store.tasks.push(mle);
advancePipeline(mle, block);
const zeroTwo = state.store.tasks.find(t => t.stage === "zero_two");
assert.deepStrictEqual([zeroTwo.window_start, zeroTwo.window_end], ["2026-07-14", "2026-07-16"]);
zeroTwo.status = "completed";
advancePipeline(zeroTwo, block, "2026-07-14");
const reviewOne = state.store.tasks.find(t => t.stage === "two_week_review" && t.cycle === 1);
assert.deepStrictEqual([reviewOne.window_start, reviewOne.window_end], ["2026-07-17", "2026-07-19"]);
reviewOne.status = "completed";
advancePipeline(reviewOne, block);
const reviewTwo = state.store.tasks.find(t => t.stage === "two_week_review" && t.cycle === 2);
assert.deepStrictEqual([reviewTwo.window_start, reviewTwo.window_end], ["2026-07-24", "2026-07-26"]);
reviewTwo.status = "completed";
advancePipeline(reviewTwo, block);
assert(!state.store.tasks.some(t => t.stage === "two_week_review" && t.cycle === 3 && live.includes(t.status)), "an individual block never receives a third 2W revision");
const oneMonth = state.store.tasks.find(t => t.stage === "one_month");
assert.deepStrictEqual([oneMonth.window_start, oneMonth.window_end], ["2026-08-07", "2026-08-09"]);
oneMonth.status = "completed";
advancePipeline(oneMonth, block);
assert.strictEqual(block.assessment_mode, "pre_assessment");
assert.strictEqual(blockStage(block).label, "Pre-assessment setup");
const lateBlock = { id: "late-one-day", subject_id: "subject", unit_id: "unit", name: "Late 1-Day", mle_date: "2026-07-14", archived: false };
const lateZero = { id: "late-zero", block_id: lateBlock.id, stage: "zero_two", cycle: 1, status: "completed", window_start: "2026-07-14", window_end: "2026-07-16" };
state.store.blocks.push(lateBlock);
state.store.tasks.push({ id: "late-mle", block_id: lateBlock.id, stage: "mle", cycle: 1, status: "completed", window_start: "2026-07-14", window_end: "2026-07-14" }, lateZero);
advancePipeline(lateZero, lateBlock, "2026-07-21");
assert.strictEqual(lateBlock.mle_date, "2026-07-14", "late 1-Day completion never rewrites the assigned MLE date");
assert.strictEqual(lateBlock.revision_anchor_date, "2026-07-21", "late 1-Day completion becomes the practical rolling revision anchor");
const lateFirstTwoWeek = state.store.tasks.find(task => task.block_id === lateBlock.id && task.stage === "two_week_review" && task.cycle === 1 && live.includes(task.status));
assert.deepStrictEqual([lateFirstTwoWeek.window_start, lateFirstTwoWeek.window_end], ["2026-07-24", "2026-07-26"], "late 1-Day completion progresses to the Friday-through-Sunday window for its completion week");
const weekendMleBlock = { id: "weekend-mle-block", subject_id: "subject", unit_id: "unit", name: "Weekend MLE", mle_date: "2026-08-02", archived: false };
state.store.blocks.push(weekendMleBlock);
state.store.tasks.push(
  { id: "weekend-mle", block_id: weekendMleBlock.id, stage: "mle", cycle: 1, status: "completed", window_start: "2026-08-02", window_end: "2026-08-02" },
  { id: "weekend-zero-two", block_id: weekendMleBlock.id, stage: "zero_two", cycle: 1, status: "completed", window_start: "2026-08-02", window_end: "2026-08-04" },
  { id: "incorrect-early-month", block_id: weekendMleBlock.id, stage: "one_month", cycle: 1, status: "planned", window_start: "2026-08-07", window_end: "2026-08-08" }
);
restoreNormalSchedule(weekendMleBlock);
assert.strictEqual(state.store.tasks.find(task => task.id === "incorrect-early-month").status, "superseded", "an active premature 1M task is retired without deleting it");
const correctedFirstTwoWeek = state.store.tasks.find(task => task.block_id === weekendMleBlock.id && task.stage === "two_week_review" && task.cycle === 1 && live.includes(task.status));
assert.deepStrictEqual([correctedFirstTwoWeek.window_start, correctedFirstTwoWeek.window_end], ["2026-08-07", "2026-08-09"], "completing 1-Day during an end-week period progresses to that same specific First 2W weekend");
assert.deepStrictEqual([correctedFirstTwoWeek.assigned_window_start, correctedFirstTwoWeek.assigned_window_end], ["2026-08-07", "2026-08-09"], "a new same-week First 2W task stores its assigned weekend independently");
applyRevisionWindow(correctedFirstTwoWeek, { stage: "two_week_review", cycle: 1, window_start: "2026-08-21", window_end: "2026-08-23", global_cycle_position: 2 });
assert.deepStrictEqual([correctedFirstTwoWeek.window_start, correctedFirstTwoWeek.window_end], ["2026-08-07", "2026-08-09"], "routine refreshes cannot roll an unfinished same-week 2W task into the next weekend");
assert.strictEqual(taskOverdueInfo(correctedFirstTwoWeek, "2026-08-17").overdue, true, "an unfinished assigned weekend becomes overdue on Monday even if the projected cycle moved on");
applyRevisionWindow(correctedFirstTwoWeek, { stage: "two_week_review", cycle: 1, window_start: "2026-08-21", window_end: "2026-08-23", global_cycle_position: 2 }, true);
assert.deepStrictEqual([correctedFirstTwoWeek.assigned_window_start, correctedFirstTwoWeek.assigned_window_end], ["2026-08-21", "2026-08-23"], "an explicit forced schedule rebuild can deliberately assign a new weekend");
correctedFirstTwoWeek.window_start = "2026-12-20";
correctedFirstTwoWeek.window_end = "2026-12-20";
delete correctedFirstTwoWeek.assigned_window_start;
delete correctedFirstTwoWeek.assigned_window_end;
weekendMleBlock.revision_override = true;
reanchorActiveRevisionTasks(weekendMleBlock);
assert.deepStrictEqual([correctedFirstTwoWeek.window_start, correctedFirstTwoWeek.window_end], ["2026-08-07", "2026-08-09"], "existing active revisions are repaired to their same-week Friday-through-Sunday window even during an override");
assert(state.store.tasks.some(task => task.id === "weekend-zero-two" && task.status === "completed"), "completed 1-Day history is preserved during correction");
const legacyBlock = { id: "legacy-third-block", subject_id: "subject", unit_id: "unit", name: "Legacy third review", mle_date: "2026-07-14", archived: false };
state.store.blocks.push(legacyBlock);
state.store.tasks.push(
  { id: "legacy-third-completed", block_id: legacyBlock.id, stage: "two_week_review", cycle: 3, status: "completed", window_start: "2026-07-31", window_end: "2026-08-01" },
  { id: "legacy-third-live", block_id: legacyBlock.id, stage: "two_week_review", cycle: 3, status: "planned", window_start: "2026-08-07", window_end: "2026-08-08" }
);
state.store.sessions.push({ id: "legacy-third-session", block_id: legacyBlock.id, stage: "two_week_review", cycle: 3, completed_at: "2026-08-01T12:00:00Z", confidence: null, minutes: 20 });
normalizeRollingReviewData();
assert.strictEqual(state.store.tasks.find(task => task.id === "legacy-third-completed").status, "completed", "completed legacy third-review history is preserved");
assert.strictEqual(state.store.tasks.find(task => task.id === "legacy-third-live").status, "superseded", "an invalid future third-review task is retired non-destructively");
assert(state.store.sessions.some(session => session.id === "legacy-third-session"), "legacy completed session records are not erased");
block.assessment_date = "2026-08-20";
block.custom_spacing = [14, 7, 1];
syncBlockAssessmentTasks(block);
assert.deepStrictEqual(state.store.tasks.filter(t => t.stage === "pre_assessment").map(t => t.window_start), ["2026-08-06", "2026-08-13", "2026-08-19"]);
state.store.tasks.push({ id: "future-pre", block_id: block.id, stage: "pre_study", cycle: 2, status: "planned", window_start: "2026-12-01", window_end: "2026-12-01" });
const groups = studyGroups();
assert(groups.preStudies.some(t => t.id === "future-pre"), "all future Pre-study tasks appear in Study");
assert.strictEqual(groups.mles.length, 0, "completed MLE is not shown");
const futureMleBlock = { id: "future-mle-block", subject_id: "subject", unit_id: "unit", name: "Future MLE", mle_date: "2099-12-01", pre_study_date: "2026-08-01", archived: false };
state.store.blocks.push(futureMleBlock);
state.store.tasks.push({ id: "future-mle-pre", block_id: futureMleBlock.id, stage: "pre_study", cycle: 1, status: "completed", window_start: "2026-08-01", window_end: "2026-08-01" }, { id: "future-mle", block_id: futureMleBlock.id, stage: "mle", cycle: 1, status: "planned", window_start: "2099-12-01", window_end: "2099-12-01" });
assert(studyGroups().upcomingMles.some(task => task.id === "future-mle"), "moving an MLE into the future keeps it visible in Upcoming MLE");
state.store.tasks = state.store.tasks.filter(task => !["future-mle-pre", "future-mle"].includes(task.id));
state.store.blocks = state.store.blocks.filter(item => item.id !== futureMleBlock.id);
assert.strictEqual(groups.revisions.filter(t => t.stage === "pre_assessment").length, 0, "assessment revisions do not clutter Study");
assert.strictEqual(assessmentTasks(block, "pre_assessment").length, 3, "future assessment revisions remain accessible for early completion");
assert.strictEqual(taskLabel({ stage: "zero_two", cycle: 1 }), "1-Day Revision");
assert.strictEqual(taskLabel({ stage: "two_week_review", cycle: 1 }), "First 2W Revision");
assert.strictEqual(taskLabel({ stage: "two_week_review", cycle: 2 }), "Second 2W Revision");
assert.strictEqual(taskLabel({ stage: "one_month", cycle: 1 }), "1M Revision");
assert.deepStrictEqual(Array.from(newestFirst([{ id: "older", completed_at: "2026-08-01T10:00:00Z" }, { id: "newer", completed_at: "2026-08-02T10:00:00Z" }], "completed_at"), row => row.id), ["newer", "older"], "the Log sorts completed sessions newest first");
assert(formatDateTime("2026-08-02T14:05:06Z").includes("2026") && formatDateTime("2026-08-02T14:05:06Z").includes("·") && !formatDateTime("2026-08-02T14:05:06Z").includes("not recorded"), "the Log timestamp includes a date and time");
state.store.sessions.push(
  { id: "pre", block_id: block.id, stage: "pre_study", confidence: null, minutes: 10 },
  { id: "rev-a", block_id: block.id, stage: "zero_two", confidence: 3, minutes: 20 },
  { id: "rev-b", block_id: block.id, stage: "zero_two", confidence: 5, minutes: 30 }
);
assert.strictEqual(predictedMinutes(block.id, "zero_two"), 25, "same-block same-stage durations drive the estimate");
assert.strictEqual(predictedMinutes(block.id, "pre_study"), null, "Pre-study has no duration estimate");
assert(!sessionSummary(state.store.sessions.find(session => session.id === "pre")).includes("10 min"), "Pre-study time is hidden from the log");
assert.strictEqual(avg(), "4.0", "unrated Pre-study sessions do not lower average confidence");
state.store.sessions = [];
localStorage.setItem(defaultSessionMinutesKey, "22");
assert.strictEqual(predictedMinutes(block.id, "zero_two"), null, "revisions without timing history show no estimate");
const imported = normalizeImportedData({
  subjects: [{ id: "legacy-subject", title: "Biology" }],
  content_blocks: [{ id: "legacy-block", subject_id: "legacy-subject", title: "Cell division", mle_date: "2026-09-01" }],
  extraSessions: [{ id: "legacy-extra", blockId: "legacy-block", title: "Extra recall", scheduledDate: "2026-09-02", anchorStage: "zero_two", position: "after" }],
  study_sessions: [{ id: "legacy-session", content_block_id: "legacy-block", session_type: "revision", duration_minutes: 18 }, { id: "partial-import", taskId: "active-import-task", content_block_id: "legacy-block", stage: "zero_two", completionPercent: 40, stageCompleted: false, notes: "Imported partial work" }],
  interleaving_techniques: [{ id: "pre", name: "Pre-Made Questions" }],
  technique_usage: [{ id: "use", session_id: "legacy-session", technique_id: "pre" }]
});
assert.strictEqual(imported.store.blocks[0].name, "Cell division", "legacy content_blocks import");
assert.strictEqual(imported.store.sessions[0].minutes, 18, "legacy study_sessions import");
const importedPartial = imported.store.sessions.find(session => session.id === "partial-import");
assert.strictEqual(importedPartial.completion_percent, 40, "partial completion percentage survives import normalization");
assert.strictEqual(importedPartial.stage_completed, false, "imported partial work remains non-progressing");
assert.strictEqual(importedPartial.source_task_id, "active-import-task", "imported partial work retains its source task link");
assert.strictEqual(importedPartial.task_id, "", "imported partial work cannot claim the stage-completion task id");
assert.strictEqual(imported.store.extra_sessions[0].name, "Custom Session", "Custom Sessions survive account backup import normalization");
state.store = imported.store;
assert.deepStrictEqual(questionBalance("legacy-block"), { pre: 1, self: 0 }, "question balance is counted per block");
state.store.blocks.push(
  { id: "low-block", subject_id: "legacy-subject", name: "Low confidence", archived: false },
  { id: "high-block", subject_id: "legacy-subject", name: "High confidence", archived: false }
);
state.store.tasks = [
  { id: "high-task", block_id: "high-block", stage: "two_week_review", cycle: 1, status: "planned", window_start: "2026-07-20", window_end: "2026-07-20" },
  { id: "low-task", block_id: "low-block", stage: "two_week_review", cycle: 1, status: "planned", window_start: "2026-07-20", window_end: "2026-07-20" }
];
state.store.sessions.push(
  { id: "low-rating", block_id: "low-block", stage: "zero_two", confidence: 1, completed_at: "2026-07-13T10:00:00Z" },
  { id: "high-rating", block_id: "high-block", stage: "zero_two", confidence: 5, completed_at: "2026-07-13T10:00:00Z" }
);
assert.strictEqual(studyGroups().revisions[0].block_id, "low-block", "low-confidence revisions are prioritized");
assert.deepStrictEqual(Array.from(studyGroups().firstTwoWeekRevisions, task => task.block_id), ["low-block", "high-block"], "First 2W is a separate confidence-sorted Study section");
const zeroStart = today();
state.store.tasks = [{ id: "zero-calendar", block_id: "legacy-block", stage: "zero_two", cycle: 1, status: "planned", window_start: zeroStart, window_end: addDays(zeroStart, 2) }];
state.store.extra_sessions = [{ id: "calendar-extra", block_id: "legacy-block", name: "Exam bridge", date: addDays(zeroStart, 1), anchor_stage: "zero_two", anchor_cycle: 1, position: "during", technique_ids: [], planned_minutes: null, status: "planned" }];
state.store.blocks[0].mle_date = zeroStart;
state.store.sessions = [
  { id: "done-pre", block_id: "legacy-block", stage: "pre_study", completed_at: addDays(zeroStart, -1) + "T10:00:00Z" },
  { id: "done-mle", block_id: "legacy-block", stage: "mle", completed_at: zeroStart + "T10:00:00Z" }
];
const calendar = calendarEvents();
assert.strictEqual(calendar.filter(event => event.intensity?.startsWith("zero-day-")).length, 1, "0-2 retrieval creates one active calendar date");
assert.strictEqual(retrievalSchedule(state.store.tasks[0]).label, "Day 0/2 · recommended", "automatic scheduling begins on Day 0/2");
state.store.tasks[0].scheduled_date = addDays(zeroStart, 1);
assert.strictEqual(retrievalSchedule(state.store.tasks[0]).label, "Day 1/2 · caution", "manual in-window date reports its day");
assert.strictEqual(taskScheduledDate(state.store.tasks[0]), addDays(zeroStart, 1), "manual date overrides automatic scheduling");
state.store.tasks[0].scheduled_date = addDays(zeroStart, 5);
assert.strictEqual(retrievalSchedule(state.store.tasks[0]).intensity, "zero-day-outside", "outside-window override is a danger state");
delete state.store.tasks[0].scheduled_date;
assert.strictEqual(calendar.filter(event => event.kind === "MLE").length, 1, "MLE has one canonical calendar event");
assert.strictEqual(calendar.filter(event => event.kind === "Custom Session").length, 1, "planned Custom Session appears independently in Calendar");
assert.strictEqual(calendar.filter(event => event.label.startsWith("Completed Pre-study")).length, 1, "Pre-study completion visibility is respected");
assert.strictEqual(calendar.filter(event => event.label.startsWith("Completed Main Learning Event")).length, 0, "completed MLE is not duplicated");
state.store.units.push({ id: "linked-unit", subject_id: "legacy-subject", name: "Linked unit", assessment_mode: "normal", custom_spacing: [], archived: false });
state.store.blocks.push({ id: "linked-block", subject_id: "wrong-subject", unit_id: "linked-unit", name: "Linked block", pre_study_date: "2026-09-10", mle_date: "2026-09-12", archived: false });
state.store.tasks = [];
state.store.sessions = [];
state.store.notifications = [];
refresh();
assert.strictEqual(state.store.blocks.find(item => item.id === "linked-block").subject_id, "legacy-subject", "unit blocks inherit the unit subject");
assert.deepStrictEqual(state.store.tasks.filter(task => task.block_id === "linked-block").map(task => task.stage).sort(), ["mle", "pre_study"], "core tasks are repaired for unit blocks");
assert(state.store.tasks.filter(task => task.block_id === "linked-block").every(task => task.unit_id === "linked-unit"), "unit linkage is propagated across tasks");
assert(studyGroups().preStudies.some(task => task.block_id === "linked-block"), "unit block appears in Study");
const linkedTimeline = timelineScheduleEvents().filter(item => item.block_id === "linked-block");
assert(linkedTimeline.some(item => item.stage === "pre_study" && !item.predicted), "timeline uses the active Pre-study task");
assert(linkedTimeline.some(item => item.stage === "mle" && !item.predicted), "timeline uses the active MLE task");
assert(linkedTimeline.some(item => item.stage === "zero_two" && item.predicted), "timeline predicts the 1-Day revision from the assigned MLE");
assert(linkedTimeline.some(item => item.stage === "two_week_review" && item.predicted), "timeline includes later predicted two-week revision windows");
state.store.blocks.push({ id: "undated-block", subject_id: "legacy-subject", unit_id: "linked-unit", name: "Undated block", pre_study_date: "", mle_date: "", archived: false });
assert(studyGroups().needsScheduling.some(block => block.id === "undated-block"), "undated unit blocks remain visible in Study");
const linkedSubject = state.store.subjects.find(subject => subject.id === "legacy-subject");
const linkedUnit = state.store.units.find(unit => unit.id === "linked-unit"), linkedBlock = state.store.blocks.find(block => block.id === "linked-block"), linkedTask = state.store.tasks.find(task => task.block_id === "linked-block" && task.stage === "pre_study");
setHierarchyArchived("subject", linkedSubject, true);
assert(linkedUnit.archived && linkedBlock.archived, "archiving a subject cascades to its units and blocks");
const frozenStatus = linkedTask.status;
refresh();
assert.strictEqual(linkedTask.status, frozenStatus, "archived subject tasks remain frozen during refresh");
const archivedSubjectGroups = studyGroups();
assert(!archivedSubjectGroups.preStudies.some(task => task.block_id === "linked-block"), "archiving a subject hides its block tasks from Study");
assert(!archivedSubjectGroups.needsScheduling.some(block => block.id === "undated-block"), "archiving a subject hides its undated blocks from Study setup");
assert(!timelineScheduleEvents().some(item => item.subject_id === "legacy-subject"), "archived subjects are excluded from Timeline predictions");
assert(calendarEvents().some(event => event.label.includes("Linked block")), "archiving a subject preserves its calendar records");
setHierarchyArchived("subject", linkedSubject, false);
assert(!linkedUnit.archived && !linkedBlock.archived, "unarchiving a subject restores descendants archived by that subject");
assert(studyGroups().preStudies.some(task => task.block_id === "linked-block"), "unarchiving a subject restores its block tasks to Study");
assert.strictEqual(accountDetailsHidden(), false, "account name and email are visible by default");
localStorage.setItem(accountDetailsHiddenKey, "true");
assert.strictEqual(accountDetailsHidden(), true, "account privacy preference hides name and email");
localStorage.setItem(accountDetailsHiddenKey, "false");
assert.strictEqual(accountDetailsHidden(), false, "account details can be shown again");
state.store = { notebook: "", subjects: [], units: [], blocks: [], tasks: [], extra_sessions: [], sessions: [], usage: [], notifications: [], piles: [], pile_sessions: [], techniques: [], placements: [], presets: [], preset_links: [], preset_exclusions: [], stage_history: [] };
localStorage.removeItem(undoHistoryKey);
localStorage.removeItem(redoHistoryKey);
const dataOnlySnapshot = reversibleSnapshot();
localStorage.setItem(collapsedKey, JSON.stringify({ "subject:test": true }));
localStorage.setItem(showArchivedKey, "true");
localStorage.setItem(themeKey, "light");
localStorage.setItem(updatesReadKey, JSON.stringify(["test-update"]));
localStorage.setItem(accountDetailsHiddenKey, "true");
assert.strictEqual(reversibleSnapshot(), dataOnlySnapshot, "display-only preferences are excluded from account change history");
lastReversibleSnapshot = reversibleSnapshot();
pendingUndoIntent = { before: reversibleSnapshot(), label: "Create block - Undo test", merge_key: "", captured_at: Date.now() };
state.store.blocks.push({ id: "undo-block", subject_id: "", unit_id: "", name: "Undo test", archived: false });
save();
const undoEntry = latestUndoEntry();
assert.strictEqual(undoEntry.label, "Create block - Undo test", "undo identifies the exact saved action");
assert.strictEqual(JSON.parse(undoEntry.before).store.blocks.length, 0, "undo preserves the complete state from before the action");
const originalRender = render, originalPhoneWorker = setPhoneWorkerEnabled;
render = () => {};
setPhoneWorkerEnabled = async () => {};
applyUndoEntry(undoEntry.id);
assert.strictEqual(state.store.blocks.length, 0, "undo restores the prior account state");
assert.strictEqual(latestUndoEntry(), null, "an applied undo is removed from recent history");
const redoEntry = latestRedoEntry();
assert(redoEntry, "undo creates one matching redo entry");
applyRedoEntry(redoEntry.id);
assert.strictEqual(state.store.blocks.length, 1, "redo reapplies the undone account state");
assert.strictEqual(latestRedoEntry(), null, "an applied redo is removed from redo history");
const restoredUndo = latestUndoEntry();
applyUndoEntry(restoredUndo.id);
assert(latestRedoEntry(), "undoing the restored action makes it redoable again");
pendingUndoIntent = { before: reversibleSnapshot(), label: "Edit Notebook/Misc", merge_key: "notebook", captured_at: Date.now() };
state.store.notebook = "First saved sentence";
save();
assert.strictEqual(latestRedoEntry(), null, "a new saved data change clears the stale redo branch");
pendingUndoIntent = { before: reversibleSnapshot(), label: "Edit Notebook/Misc", merge_key: "notebook", captured_at: Date.now() };
state.store.notebook = "First saved sentence plus more";
save();
const typingHistory = loadUndoHistory();
assert.strictEqual(typingHistory.length, 1, "continuous autosaved typing is grouped into one undo entry");
assert.strictEqual(JSON.parse(typingHistory[0].before).store.notebook, "", "grouped typing retains the value from before typing began");
assert.strictEqual(JSON.parse(typingHistory[0].after).store.notebook, "First saved sentence plus more", "grouped typing retains the latest saved text for redo");
storeUndoHistory([]); storeRedoHistory([]);
state.store.blocks = [{ id: "mle-edit", name: "MLE edit", mle_date: "2026-09-01" }];
state.store.notebook = "Notebook before unrelated change";
lastReversibleSnapshot = reversibleSnapshot();
pendingUndoIntent = { before: reversibleSnapshot(), label: "Edit MLE date", merge_key: "", captured_at: Date.now() };
state.store.blocks[0].mle_date = "2026-09-20";
save();
const mleDateUndo = latestUndoEntry();
state.store.notebook = "Newer Notebook text that must survive";
applyUndoEntry(mleDateUndo.id);
assert.strictEqual(state.store.blocks[0].mle_date, "2026-09-01", "Undo reverses the MLE edit itself");
assert.strictEqual(state.store.notebook, "Newer Notebook text that must survive", "Undo preserves unrelated Notebook edits made after the recorded action");
applyRedoEntry(latestRedoEntry().id);
assert.strictEqual(state.store.blocks[0].mle_date, "2026-09-20", "Redo reapplies the MLE edit itself");
assert.strictEqual(state.store.notebook, "Newer Notebook text that must survive", "Redo also preserves unrelated newer Notebook text");
render = originalRender;
setPhoneWorkerEnabled = originalPhoneWorker;
globalThis.__result = "Offline pipeline checks passed";
`;

const storage = new Map();
const context = {
  assert,
  html,
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
