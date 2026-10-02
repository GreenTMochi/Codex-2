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
  assert, console, crypto, setTimeout, clearTimeout, confirm:()=>true,
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
  window: { __SIR_USER__: null, __SIR_ACCOUNT_STATE__: null, addEventListener() {} },
  document: { querySelector: () => ({}), createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag), createTextNode: text => ({ nodeType: 3, textContent: String(text) }) }
};
context.sessionStorage = context.localStorage;
vm.createContext(context);
vm.runInContext(source + String.raw`
render=()=>{};
state.store={subjects:[{id:'s',name:'Chem'}],units:[{id:'u',subject_id:'s',name:'Exam'}],blocks:[{id:'b',subject_id:'s',unit_id:'u',name:'Block',assessment_mode:'pre_assessment',manual_pre_assessment:true},{id:'other',subject_id:'s',unit_id:'u',name:'Other'}],tasks:[],sessions:[],usage:[],placements:[{id:'placed',block_id:'b',technique_id:'t',category:'procedural',level:'LO',preset_managed:false}],techniques:[{id:'t',name:'Practice',categories:['procedural']},{id:'other-technique',name:'Other',categories:['procedural']}],presets:[],preset_links:[],preset_exclusions:[],piles:[],pile_sessions:[],extra_sessions:[],notifications:[],stage_history:[]};
const block=state.store.blocks[0];
assert.deepEqual(techniqueAssessmentUsage('b','t'),{pre_assessment:0,post_assessment:0});
state.store.tasks.push({id:'mle-done',block_id:'b',stage:'mle',status:'skipped'});
task(block,'pre_assessment',today(),today());let preTask=state.store.tasks.find(t=>t.stage==='pre_assessment');completeTaskById(preTask.id,{confidence:3});
assert.deepEqual(techniqueAssessmentUsage('b','t'),{pre_assessment:1,post_assessment:0});
// Repeated completion is idempotent and a future scheduled revision is not counted.
completeTaskById(preTask.id,{});task(block,'pre_assessment',addDays(today(),5),addDays(today(),5),2);
assert.deepEqual(techniqueAssessmentUsage('b','t'),{pre_assessment:1,post_assessment:0});
block.assessment_mode='post_assessment';block.manual_pre_assessment=false;
assert.deepEqual(techniqueAssessmentUsage('b','t'),{pre_assessment:1,post_assessment:0});
task(block,'post_assessment',today(),today());const postTask=state.store.tasks.find(t=>t.stage==='post_assessment');completeTaskById(postTask.id,{});
assert.deepEqual(techniqueAssessmentUsage('b','t'),{pre_assessment:1,post_assessment:1});
const savedPre=state.store.sessions.find(s=>s.stage==='pre_assessment');
state.store.sessions.push({id:'custom',block_id:'b',stage:'extra_session',anchor_stage:'pre_assessment'},{id:'normal',block_id:'b',stage:'zero_two'},{id:'other-block',block_id:'other',stage:'pre_assessment'},{id:'shared-child',block_id:'b',stage:'post_assessment',pile_session_id:'shared-post'});
state.store.usage.push({id:'repeated-origin',session_id:savedPre.id,technique_id:'t',times_used:1},{id:'custom-use',session_id:'custom',technique_id:'t',times_used:3},{id:'normal-use',session_id:'normal',technique_id:'t',times_used:10},{id:'other-use',session_id:'other-block',technique_id:'t',times_used:9},{id:'different-technique',session_id:savedPre.id,technique_id:'other-technique',times_used:5},{id:'shared-child-use',session_id:'shared-child',technique_id:'t',times_used:1});
state.store.pile_sessions.push({id:'shared-post',stage:'post_assessment',technique_id:'t',shared_applied:true,block_ids:['b','other'],session_ids:['shared-child']},{id:'shared-pre',stage:'pre_assessment',technique_id:'t',shared_applied:true,block_ids:['b'],session_ids:[]},{id:'not-applied',stage:'post_assessment',technique_id:'t',shared_applied:false,block_ids:['b']},{id:'other-only',stage:'post_assessment',technique_id:'t',shared_applied:true,block_ids:['other']});
assert.deepEqual(techniqueAssessmentUsage('b','t'),{pre_assessment:5,post_assessment:2},'separate saved stages, custom counts, shared work once, and block isolation');
assert.deepEqual(techniqueAssessmentUsage('b','other-technique'),{pre_assessment:5,post_assessment:0});
const before=JSON.stringify(state.store),counters=techniqueAssessmentUsageNode('b','t');assert.equal(counters.children[0].attrs['data-active'],'false');assert.equal(counters.children[1].attrs['data-active'],'true');assert(counters.textContent.includes('Post-assessment'));assert.equal(JSON.stringify(state.store),before,'display never mutates history');
block.assessment_mode='pre_assessment';assert.deepEqual(techniqueAssessmentUsage('b','t'),{pre_assessment:5,post_assessment:2});assert.equal(techniqueAssessmentUsageNode('b','t').children[0].attrs['data-active'],'true');
state.store=normalizeImportedData(JSON.parse(JSON.stringify(state.store))).store;assert.deepEqual(techniqueAssessmentUsage('b','t'),{pre_assessment:5,post_assessment:2},'counts survive export/import and reload');
assert(techniqueHistoryNode('b','t').textContent.includes('Post-assessment'));assert(techniqueHistoryNode('other','unused').textContent.includes('0'));
console.log('Per-block assessment technique counters: completion, mode separation, persistence, custom sessions, shared deduplication and isolation passed');
`, context);
