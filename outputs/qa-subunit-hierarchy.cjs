const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync(require("path").join(__dirname, "offline.html"), "utf8");
let source = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
source = source.slice(0, source.indexOf('      window.addEventListener("beforeunload"'));
source += `
state.store = {
  subjects: [
    { id: "subject-a", name: "Math", archived: false, order: 0 },
    { id: "subject-b", name: "Physics", archived: false, order: 1 }
  ],
  units: [
    { id: "parent", subject_id: "subject-a", parent_unit_id: "", name: "Calculus", archived: false, order: 0 },
    { id: "child", subject_id: "subject-a", parent_unit_id: "parent", name: "Limits", archived: false, order: 0 },
    { id: "target", subject_id: "subject-b", parent_unit_id: "", name: "Mechanics", archived: false, order: 0 }
  ],
  blocks: [
    { id: "nested-block", subject_id: "subject-a", unit_id: "child", name: "Graphical limits", archived: false, order: 0 },
    { id: "target-block", subject_id: "subject-b", unit_id: "target", name: "Vectors", archived: false, order: 0 }
  ],
  tasks: [{ id: "task", block_id: "nested-block", subject_id: "subject-a", unit_id: "child", stage: "pre_study", cycle: 1, status: "planned", window_start: "", window_end: "" }],
  sessions: [], usage: [], notifications: [], piles: [], pile_sessions: [], techniques: [], placements: [], presets: [], preset_links: [], preset_exclusions: [], stage_history: []
};

assert.deepStrictEqual(Array.from(unitDescendantIds("parent")), ["child"], "parent unit discovers its sub-unit");
assert.strictEqual(unitIsWithin("child", "parent"), true, "sub-unit belongs to its parent scope");
assert.deepStrictEqual(Array.from(targetBlocks("unit", "parent"), block => block.id), ["nested-block"], "parent-unit actions include nested blocks");
assert.strictEqual(presetLinkMatchesBlock({ target_type: "unit", target_id: "parent" }, state.store.blocks[0]), true, "parent presets apply to nested blocks");

state.store.units[0].revision_paused = { paused_at: "2026-08-22T12:00:00.000Z", scope_type: "unit", scope_id: "parent", scope_name: "Calculus" };
assert.strictEqual(effectiveRevisionPause(state.store.blocks[0]).scope_id, "parent", "nested blocks inherit parent-unit revision pauses");
delete state.store.units[0].revision_paused;

moveBlockHierarchy(state.store.blocks[0], "subject-b", "target");
assert.deepStrictEqual([state.store.blocks[0].subject_id, state.store.blocks[0].unit_id, state.store.tasks[0].subject_id, state.store.tasks[0].unit_id], ["subject-b", "target", "subject-b", "target"], "moving a block updates its task hierarchy");

moveBlockHierarchy(state.store.blocks[0], "subject-a", "child");
moveUnitHierarchy(state.store.units[0], "subject-b", "target");
assert.deepStrictEqual([state.store.units[0].subject_id, state.store.units[0].parent_unit_id, state.store.units[1].subject_id, state.store.blocks[0].subject_id, state.store.tasks[0].subject_id], ["subject-b", "target", "subject-b", "subject-b", "subject-b"], "moving a unit propagates its subject to every descendant and task");
assert.strictEqual(canDropHierarchy({ type: "unit", id: "target" }, "unit", state.store.units[1]), false, "a unit cannot be dropped inside its own descendant");

state.store.units.find(unit => unit.id === "target").archived = true;
assert.strictEqual(blockIsArchived(state.store.blocks[0]), true, "an archived ancestor removes nested blocks from active work");
state.store.units.find(unit => unit.id === "target").archived = false;

localStorage.setItem(appSettingsKey, JSON.stringify({ ...appSettings(), autosave: { ...appSettings().autosave, hierarchy_arrangement: false } }));
hierarchyDraftSnapshot = null;
beginHierarchyMutation();
assert.ok(hierarchyDraftSnapshot, "manual hierarchy mode captures a reversible draft before moving");
const captured = JSON.parse(hierarchyDraftSnapshot);
assert.strictEqual(captured.store.blocks[0].unit_id, "child", "manual draft preserves the pre-move hierarchy");

assert(html.includes('class: "drag-handle hierarchy-drag-handle"'), "hierarchy dragging is exposed through six-dot handles");
assert(!html.includes('class: className,\\n          draggable: "true"'), "entire hierarchy cards are no longer draggable");
assert(html.includes('autosavePreferenceToggle("hierarchy_arrangement"'), "settings exposes hierarchy autosave/manual save");
assert(html.includes('Parent unit (optional)'), "unit forms expose editable sub-unit parents");
globalThis.__result = "Sub-unit hierarchy checks passed";
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
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  },
  window: {
    __SIR_USER__: null,
    __SIR_ACCOUNT_STATE__: null,
    addEventListener: () => {},
  },
  document: {
    querySelector: () => ({}),
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: () => ({}),
    createElementNS: () => ({}),
  },
};
context.sessionStorage = context.localStorage;
vm.createContext(context);
vm.runInContext(source, context);
vm.runInContext(`
const orderBlocks = ['pre','mle','day','first','second','month'].map((id,index)=>({id,name:id,subject_id:'subject-a',unit_id:'parent',mle_date:index===0?'2026-01-01':'2026-09-01'}));
state.store.tasks=orderBlocks.map((block,index)=>({id:block.id+'-task',block_id:block.id,stage:['pre_study','mle','zero_two','two_week_review','two_week_review','one_month'][index],cycle:index===4?2:1,status:index===4?'paused':'planned'}));
const beforeOrder=JSON.stringify(orderBlocks),beforeTasks=JSON.stringify(state.store.tasks);
assert.deepStrictEqual(blocksByProgress(orderBlocks).map(block=>block.id),['month','second','first','day','mle','pre']);
assert.strictEqual(JSON.stringify(orderBlocks),beforeOrder);assert.strictEqual(JSON.stringify(state.store.tasks),beforeTasks);
`,context);
console.log(context.__result);
