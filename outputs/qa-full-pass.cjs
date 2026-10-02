const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');

// Exercise the actual pile editor, completion handler and presentation functions
// with lightweight elements. No live account or browser data is touched.
class Element {
  constructor(tag) { this.nodeType = 1; this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.style = {}; this.listeners = {}; this.value = ''; this.checked = false; this._text = ''; }
  setAttribute(k, v) { this.attrs[k] = v; if (k === 'value') this.value = String(v); if (k === 'checked') this.checked = true; if (k === 'disabled') this.disabled = true; if (k === 'hidden') this.hidden = true; }
  addEventListener(k, fn) { this.listeners[k] = fn; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map(n => n.textContent ?? String(n)).join(' '); }
  querySelectorAll(tag) { return this.children.flatMap(n => n instanceof Element ? [...(n.tagName === tag.toUpperCase() ? [n] : []), ...n.querySelectorAll(tag)] : []); }
}
const storage = new Map();
const html = fs.readFileSync(path.join(__dirname, 'offline.html'), 'utf8');
let source = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
source = source.slice(0, source.indexOf('      window.addEventListener("beforeunload"'));
const context = {
  assert, console, crypto, setTimeout, clearTimeout,
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
  window: { __SIR_USER__: null, __SIR_ACCOUNT_STATE__: null, addEventListener() {} },
  document: { querySelector: () => ({}), createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag), createTextNode: text => ({ nodeType: 3, textContent: String(text) }) }
};
context.sessionStorage = context.localStorage;
vm.createContext(context);
vm.runInContext(source + String.raw`
// Isolate rich-text and calendar rendering, already covered by their suites.
lab = (text, input) => el("label", { text }, [input]);
pilePlanningCalendar = () => el("div");
revisionWindowEditor = initial => ({ node: el("div", { text: "Revision windows" }), values: () => initial });
form = (title, fields, submit) => ({ title, fields, submit });
richTextDisplay = value => el("div", { text: value || "" });
function nodes(fields) { return fields.filter(Boolean).flatMap(node => [node, ...nodes(node.children || [])]); }
function inputFor(form, label) { const field = nodes(form.fields).find(n => n.tagName === "LABEL" && n._text === label); assert(field, "field exists: " + label); return field.children[0]; }
function visibleText(fields) { return fields.filter(n => n && !n.hidden).map(n => n._text + " " + visibleText(n.children || [])).join(" "); }
function fixture() {
  state.store = { notebook: "", subjects: [{ id: "s", name: "Math" }], units: [{ id: "u", subject_id: "s", name: "Unit", assessment_mode: "normal", custom_spacing: [] }],
    blocks: ["a", "b"].map(id => ({ id, name: "Block " + id, subject_id: "s", unit_id: "u", mle_date: "2026-08-31", pre_study_date: "2026-08-30" })),
    tasks: ["a", "b"].flatMap(id => [
      { id: id + "-pre", block_id: id, stage: "pre_study", cycle: 1, status: "completed", window_start: "2026-08-30", window_end: "2026-08-30" },
      { id: id + "-mle", block_id: id, stage: "mle", cycle: 1, status: "completed", window_start: "2026-08-31", window_end: "2026-08-31" },
      { id: id + "-day", block_id: id, stage: "zero_two", cycle: 1, status: "completed", window_start: "2026-09-01", window_end: "2026-09-01", completed_at: "2026-09-01" },
      { id: id + "-review", block_id: id, stage: "two_week_review", cycle: 1, status: "planned", window_start: "2026-09-04", window_end: "2026-09-06" }
    ]), sessions: [], piles: [], pile_sessions: [], extra_sessions: [], usage: [], notifications: [], techniques: [], placements: [], presets: [], preset_links: [], preset_exclusions: [], stage_history: [] };
  localStorage.setItem(appSettingsKey, JSON.stringify({ cycle_start_week: "2026-08-30", cycle_start_phase: 0, end_week_start: 5, end_week_end: 0, timezone: "America/New_York" }));
}
fixture();
state.modal = { pileDraft: { name: "Question set", block_ids: ["a", "b"], notes: "Keep these notes" } };
let editor = pileModal();
assert.equal(inputFor(editor, "Pile type").value, "full_pass", "new piles default to Full Pass");
assert(!visibleText(editor.fields).includes("Shared technique order"), "Full Pass hides shared fields");
assert(visibleText(editor.fields).includes(fullPassReminder()), "editor explains the answer-checking rule");
editor.submit();
let pile = state.store.piles[0];
assert.equal(pile.pile_type, "full_pass", "Full Pass saves without any techniques in the account");
assert.equal(pile.technique_id, "");
assert.equal(pile.shared_minutes_estimate, null);
assert.equal(pile.notes, "Keep these notes");
const pileId = pile.id;
state.store.techniques.push({ id: "teaching", name: "Teaching", categories: ["declarative"] });
state.modal = { pileId };
editor = pileModal();
const memberSearch = nodes(editor.fields).find(n=>n.attrs['aria-label']==='Search member blocks');
const choices = () => nodes(editor.fields).filter(n=>n.className==='pile-block-choice');
memberSearch.value='  BLOCK a  ';memberSearch.listeners.input();assert.equal(choices().filter(n=>!n.hidden).length,1);assert(choices().every(row=>row.children[0].checked),'filtering keeps hidden selections');
for(const query of ['math','UNIT']) { memberSearch.value=query;memberSearch.listeners.input();assert.equal(choices().filter(n=>!n.hidden).length,2,'subject and unit are searchable'); }
memberSearch.value='no-such-block';memberSearch.listeners.input();assert.equal(choices().filter(n=>!n.hidden).length,0);assert(visibleText(editor.fields).includes('No matching blocks'));
memberSearch.value='';memberSearch.listeners.input();assert.equal(choices().filter(n=>!n.hidden).length,2,'clearing restores the whole list');
memberSearch.value='Block a';memberSearch.listeners.input();
const type = inputFor(editor, "Pile type");
type.value = "shared_technique"; type.onchange();
assert(visibleText(editor.fields).includes("Shared technique order"), "Shared Technique exposes its controls");
assert.throws(() => editor.submit(), /Shared technique is required/, "shared piles still require a technique");
inputFor(editor, "Shared technique").value = "teaching";
editor.submit();
assert.equal(pile.pile_type, "shared_technique");
assert.deepEqual(pile.block_ids,["a","b"],"saving a filtered list retains hidden members");
assert.equal(pileTechnique(pile).id, "teaching");
state.store.pile_sessions.push({ id: "old-shared", pile_id: pileId, technique_id: "teaching", shared_applied: true, minutes: 20, confidence: 5, completed_at: "2026-09-01" });
state.modal = { pileId };
editor = pileModal();
inputFor(editor, "Pile type").value = "full_pass"; inputFor(editor, "Pile type").onchange();
editor.submit();
assert.equal(pile.id, pileId, "editing type retains pile identity");
assert.equal(pile.notes, "Keep these notes", "type changes retain notes");
assert.equal(state.store.pile_sessions[0].shared_applied, true, "converting a pile preserves old shared history");
assert.equal(pileTechnique(pile), null);
assert.equal(pileSharedTechniqueActive(pile, state.store.tasks[2]), false);
const tasks = state.store.tasks.filter(t => t.id.endsWith("-review"));
assert.equal(pileGroupsForTasks(tasks)[0].tasks.length, 2);
const card = pileStudyCard(pile, tasks);
assert(card.textContent.includes("Full Pass") && card.textContent.includes(fullPassReminder()));
assert(!card.textContent.includes("Technique unavailable") && !card.textContent.includes("planned for"), "Full Pass never displays a missing technique warning");
assert(!card.textContent.includes("★"), "past shared confidence is not presented as Full Pass confidence");
assert.equal(homeEstimatedTime(tasks).missing, 2, "only individual timing is missing, no phantom shared estimate");
// Retain each block's actual revision method and independent measurements.
state.store.techniques.push({ id: "questions", name: "Questions", categories: ["procedural"] });
state.store.placements = ["a", "b"].map(id => ({ id: "placement-" + id, block_id: id, technique_id: "questions", category: "procedural", level: "LO", window_keys: ["all_revisions"] }));
state.modal = { pileId, taskIds: tasks.map(t => t.id) };
let completion = completePileModal();
state.modal.completionDraft.members["a-review"] = { selected: true, confidence: 3, completion_percent: 75, minutes: "12", gaps: "Missed one", notes: "First attempt" };
state.modal.completionDraft.members["b-review"] = { selected: true, confidence: 4, completion_percent: 100, minutes: "18", gaps: "", notes: "Second block" };
completion = completePileModal();
assert(visibleText(completion.fields).includes(fullPassReminder()));
assert(!visibleText(completion.fields).includes("Complete shared pile technique"));
assert(!visibleText(completion.fields).includes("Shared confidence"));
completion.submit();
const pass = state.store.pile_sessions.find(s => s.id !== "old-shared");
assert.equal(pass.pile_type, "full_pass");
assert.equal(pass.shared_applied, false);
assert.equal(pass.confidence, null);
assert.equal(pass.minutes, null);
assert.equal(pass.technique_id, "");
assert.equal(pass.session_ids.length, 2);
assert.equal(state.store.sessions.length, 2);
assert.equal(state.store.sessions[0].completion_percent, 75);
assert.deepEqual(state.store.sessions.map(s => s.confidence), [3, 4]);
assert.deepEqual(state.store.sessions.map(s => s.minutes), [12, 18]);
assert.equal(state.store.sessions[0].notes, "First attempt");
assert(state.store.sessions.every(s => s.pile_session_id === pass.id && s.stage_completed));
assert(tasks.every(t => t.status === "completed"), "both stages advance, including the 75% session");
assert.equal(state.store.tasks.filter(t => t.stage === "two_week_review" && t.cycle === 2).length, 2, "one next-stage task per block");
assert.equal(state.store.usage.filter(u => u.technique_id === "questions").length, 2, "block techniques still count individually");
assert.equal(state.store.usage.filter(u => u.technique_id === "teaching").length, 0, "no shared method is fabricated");
assert.throws(() => completion.submit(), /changed stage/, "repeated submission cannot duplicate sessions");
assert.equal(state.store.sessions.length, 2);
// Type remains a session snapshot even after the pile is edited again.
pile.pile_type = "shared_technique"; pile.technique_id = "teaching";
assert.equal(pass.pile_type, "full_pass");
const exported = JSON.parse(JSON.stringify(state.store));
const imported = normalizeImportedData(exported).store;
assert.equal(imported.pile_sessions.find(s => s.id === pass.id).pile_type, "full_pass", "history type survives export/import");
pile.pile_type = "full_pass";
const importedPass = normalizeImportedData(JSON.parse(JSON.stringify(state.store))).store;
assert.equal(importedPass.piles[0].pile_type, "full_pass", "pile type survives export/import");
delete exported.piles[0].pile_type;
assert.equal(normalizeImportedData(exported).store.piles[0].pile_type, "shared_technique", "legacy piles remain Shared Technique");
// Archive and restore preserve block data and the full-pass record.
setPileArchived(pileId, true);
assert.equal(pilesForBlock("a").length, 0);
setPileArchived(pileId, false);
assert.equal(pilesForBlock("a")[0].pile_type, "full_pass");
assert.equal(state.store.sessions.length, 2);
assert.equal(state.store.pile_sessions.length, 2);
// Failed completions are atomic across all selected blocks.
fixture();
state.store.piles = [{ id: "full", name: "Full", pile_type: "full_pass", block_ids: ["a", "b"] }];
state.modal = { pileId: "full", taskIds: ["a-review", "b-review"] };
completion = completePileModal();
const completeOriginal = completeTaskById;
completeTaskById = (id, values) => { if (id === "b-review") throw new Error("Simulated failure"); return completeOriginal(id, values); };
assert.throws(() => completion.submit(), /Simulated failure/);
completeTaskById = completeOriginal;
assert.equal(state.store.sessions.length, 0, "failure in the second member rolls back the first");
assert.equal(state.store.pile_sessions.length, 0);
assert.equal(state.store.tasks.find(t => t.id === "a-review").status, "planned");
state.modal = { pileId: "full", taskIds: ["a-review", "b-review"] };
completion = completePileModal();
state.modal.completionDraft.members["b-review"].selected = false;
completion = completePileModal(); completion.submit();
assert.equal(state.store.sessions.length, 1, "only selected work is completed");
assert.equal(state.store.tasks.find(t => t.id === "b-review").status, "planned", "unselected block remains in its own stage");
assert.deepEqual(state.store.pile_sessions[0].block_ids, ["a"]);
// Existing Shared Technique completion still supports shared-only work.
fixture();
state.store.techniques = [{ id: "teaching", name: "Teaching", categories: ["declarative"] }];
state.store.piles = [{ id: "shared", name: "Theory", block_ids: ["a", "b"], technique_id: "teaching", category: "declarative", level: "LO", window_keys: ["all_revisions"] }];
state.modal = { pileId: "shared", taskIds: ["a-review", "b-review"] };
completion = completePileModal();
assert(visibleText(completion.fields).includes("Shared confidence"));
state.modal.completionDraft.progress_blocks = false;
state.modal.completionDraft.shared_confidence = 4;
state.modal.completionDraft.shared_minutes = "15";
completion = completePileModal(); completion.submit();
assert.equal(state.store.pile_sessions[0].pile_type, "shared_technique");
assert.equal(state.store.pile_sessions[0].shared_applied, true);
assert.equal(state.store.pile_sessions[0].minutes, 15);
assert.equal(state.store.sessions.length, 0, "shared-only work does not advance blocks");
assert(state.store.tasks.filter(t => t.id.endsWith("-review")).every(t => t.status === "planned"));
// Shared-pile notes use the existing pile record, survive navigation, and resolve refreshed records on save.
let noteSaves=0;save=()=>{noteSaves++};autoSizeTextarea=node=>node;richTextHasContent=value=>Boolean(String(value||""));
state.openBlock={blockId:'a',openNoteIds:[],noteDrafts:{},dirtyKeys:{}};
const noteSettings=JSON.parse(localStorage.getItem(appSettingsKey));noteSettings.autosave={technique_notes:false};localStorage.setItem(appSettingsKey,JSON.stringify(noteSettings));
let notesPile=state.store.piles[0];notesPile.notes='Existing pile context';
let pileNotes=pileTechniqueNotes(notesPile),noteInput=nodes([pileNotes.editor]).find(n=>n.tagName==='TEXTAREA');assert.equal(noteInput.value,'Existing pile context');
pileNotes.toggle.listeners.click();assert.equal(pileNotes.editor.hidden,false);
noteInput.value='More context';noteInput.oninput();assert.equal(notesPile.notes,'Existing pile context');assert(blockHasUnsavedChanges());
pileNotes.toggle.listeners.click();assert.equal(pileNotes.editor.hidden,true);assert.equal(state.openBlock.pileNoteDrafts[notesPile.id],'More context');
assert(commitTechniqueNoteDrafts());assert.equal(notesPile.notes,'More context');assert(!blockHasUnsavedChanges());
state.openBlock={blockId:'b',openNoteIds:[],dirtyKeys:{}};pileNotes=pileTechniqueNotes(notesPile);noteInput=nodes([pileNotes.editor]).find(n=>n.tagName==='TEXTAREA');assert.equal(noteInput.value,'More context','all member blocks share the saved notes');
const refreshedPile={...notesPile,name:'Synced name'};state.store.piles[0]=refreshedPile;
noteInput.value='Manual save after sync';noteInput.oninput();nodes([pileNotes.editor]).find(n=>n.tagName==='BUTTON'&&n.textContent==='Save notes').listeners.click();assert.equal(refreshedPile.notes,'Manual save after sync');assert.equal(refreshedPile.name,'Synced name');assert(!blockHasUnsavedChanges());
noteSettings.autosave.technique_notes=true;localStorage.setItem(appSettingsKey,JSON.stringify(noteSettings));pileNotes=pileTechniqueNotes(refreshedPile);noteInput=nodes([pileNotes.editor]).find(n=>n.tagName==='TEXTAREA');noteInput.value='Autosaved shared context';noteInput.oninput();assert.equal(refreshedPile.notes,'Autosaved shared context');assert(!blockHasUnsavedChanges());assert(noteSaves>=3);
const sharedRow=pileTechniqueChip(refreshedPile,state.store.blocks[0]);assert(nodes([sharedRow]).some(n=>n.tagName==='BUTTON'&&n.textContent.includes('Notes')));assert(nodes([sharedRow]).some(n=>n.className==='technique-note-editor'));
console.log("Shared-pile notes, manual/autosave, cross-block access, navigation and refreshed-record checks passed");
console.log("Full Pass editor, history, timing, progression, import and archive checks passed");
`, context);
