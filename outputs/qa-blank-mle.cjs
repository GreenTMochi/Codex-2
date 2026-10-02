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
render=()=>{};richTextHasContent=value=>Boolean(String(value||'').trim());lab=(text,input)=>el('label',{text},[input]);form=(title,fields,submit)=>({title,fields,submit});
function nodes(root){return [root,...(root.children||[]).filter(n=>n.nodeType===1).flatMap(nodes)];}
function field(root,name){return root.fields.flatMap(nodes).find(n=>n.tagName==='LABEL'&&n._text===name).children[0];}
state.page='Study';state.openBlock=null;
state.store={subjects:[{id:'s',name:'Chem'}],units:[{id:'u',subject_id:'s',name:'Exam'}],blocks:[{id:'source',name:'Original',subject_id:'s',unit_id:'u',description:'Existing work',weak_points:'Gaps',mle_date:today(),pre_study_date:today(),blueprint_dismissed:true,revision_anchor_date:today()}],tasks:[{id:'pre',block_id:'source',subject_id:'s',unit_id:'u',stage:'pre_study',status:'completed',window_start:today(),window_end:today()},{id:'mle',block_id:'source',subject_id:'s',unit_id:'u',stage:'mle',status:'due',window_start:today(),window_end:today()}],sessions:[{id:'history',block_id:'source',stage:'pre_study',confidence:4,completed_at:new Date().toISOString()}],usage:[],placements:[{id:'work',block_id:'source',technique_id:'t',category:'procedural',level:'LO',notes:'Original notes',preset_managed:false}],techniques:[{id:'t',name:'Practice',categories:['procedural']}],presets:[{id:'p',name:'Toolkit',placements:[{technique_id:'t',category:'procedural',level:'LO'}]}],preset_links:[{id:'link',preset_id:'p',target_type:'unit',target_id:'u',window_keys:['always']}],preset_exclusions:[],piles:[],pile_sessions:[],extra_sessions:[],notifications:[],stage_history:[],blueprint_entries:[{id:'bp',target_type:'unit',target_id:'u',content_name:'Plan',technique_id:'t',category:'procedural',level:'HO'}]};
const original=JSON.stringify(state.store.blocks[0]),history=JSON.stringify(state.store.sessions),oldNotes=JSON.stringify(state.store.placements[0]);
assert(blankMleDuplicateAvailable(state.store.blocks[0]));
assert(nodes(taskLine(state.store.tasks[1],true)).some(n=>n.textContent==='Blank duplicate'));
assert(!nodes(taskLine(state.store.tasks[0],true)).some(n=>n.textContent==='Blank duplicate'));
blankMleDuplicateButton(state.store.blocks[0]).listeners.click();assert.equal(state.modal.type,'blankMleDuplicate');
let dialog=blankMleDuplicateModal();assert.equal(field(dialog,'Name').value,'');assert.equal(field(dialog,'MLE date').value,today());
assert.throws(()=>dialog.submit(),/Name/);assert.equal(state.store.blocks.length,1);
field(dialog,'Name').value='Separate content';dialog.submit();
const fresh=state.store.blocks.at(-1);assert.equal(state.openBlock.blockId,fresh.id);assert.notEqual(fresh.id,'source');assert.equal(fresh.subject_id,'s');assert.equal(fresh.unit_id,'u');assert.equal(fresh.mle_date,today());assert.equal(fresh.description,'');assert.equal(fresh.weak_points,undefined);assert.equal(fresh.revision_anchor_date,undefined);assert.equal(latestBlockConfidence(fresh.id),null);
assert.equal(JSON.stringify(state.store.blocks[0]),original);assert.equal(JSON.stringify(state.store.sessions),history);assert.equal(JSON.stringify(state.store.placements[0]),oldNotes);
assert.equal(state.store.placements.filter(p=>p.block_id===fresh.id).length,1);assert.equal(state.store.placements.find(p=>p.block_id===fresh.id).notes,'');assert(blueprintEligible(fresh));
assert.equal(blockStage(fresh).stage,'mle');assert(preStudyCompleted(fresh.id));assert.equal(state.store.tasks.find(t=>t.block_id===fresh.id&&t.stage==='pre_study').status,'skipped');assert(!state.store.sessions.some(s=>s.block_id===fresh.id));
refresh();assert.equal(blockStage(fresh).stage,'mle');assert.equal(state.store.tasks.filter(t=>t.block_id===fresh.id&&t.stage==='mle'&&live.includes(t.status)).length,1);assert(blueprintEligible(fresh));
const mle=state.store.tasks.find(t=>t.block_id===fresh.id&&t.stage==='mle');revertMleStage(mle,'Return to pre-study');assert.equal(blockStage(fresh).stage,'pre_study');assert(!blankMleDuplicateAvailable(fresh));
assert.throws(()=>createBlankMleDuplicate(fresh.id,'No longer MLE',today()),/no longer/);
const src=state.store.blocks[0];src.archived=true;assert.equal(blankMleDuplicateButton(src),null);assert.throws(()=>createBlankMleDuplicate(src.id,'Archived',today()),/no longer/);src.archived=false;
state.store.tasks.find(t=>t.id==='mle').status='completed';assert(!blankMleDuplicateAvailable(src));

// Assessment copies keep the selected mode and only the scheduled dates the user chooses.
state.page='Assessment';state.pileSelection=null;
for (const mode of ['pre_assessment','post_assessment']) {
 src.assessment_mode=mode;src.manual_pre_assessment=mode==='pre_assessment';
 writeManualAssessmentDates(src,[{date:addDays(today(),2)},{date:addDays(today(),5)}],src.unit_id,mode);
 state.store.sessions.push({id:'past-'+mode,block_id:src.id,stage:mode,confidence:5,minutes:37,completed_at:new Date().toISOString()});
 const unchangedBlock=JSON.stringify(src),unchangedHistory=JSON.stringify(state.store.sessions),sourceTasks=JSON.stringify(state.store.tasks.filter(t=>t.block_id===src.id)),sourceNotes=JSON.stringify(state.store.placements.filter(p=>p.block_id===src.id));
 const card=assessmentBlockCard(src,mode),duplicateButton=nodes(card).find(n=>n.tagName==='BUTTON'&&n.textContent==='Blank duplicate');assert(duplicateButton);
 state.openBlock=null;duplicateButton.listeners.click();assert.equal(state.modal.type,'blankAssessmentDuplicate');
 const modal=blankAssessmentDuplicateModal();assert.equal(field(modal,'Name').value,'');assert(modal.fields.some(n=>n.textContent.includes('Copy scheduled revision dates (2)')));
 const beforeInvalid=state.store.blocks.length;assert.throws(()=>modal.submit(),/Name/);assert.equal(state.store.blocks.length,beforeInvalid);
 field(modal,'Name').value='Separate '+mode;modal.submit();const created=state.store.blocks.at(-1);
 assert.equal(state.openBlock.blockId,created.id);assert.equal(created.assessment_mode,mode);assert.equal(created.subject_id,src.subject_id);assert.equal(created.unit_id,src.unit_id);assert.equal(created.description,'');assert.equal(latestBlockConfidence(created.id),null);assert.equal(completedPreAssessmentCount(created.id),0);
 assert.equal(state.store.sessions.some(s=>s.block_id===created.id),false);assert.deepEqual(pendingAssessmentDates(created,mode).map(taskScheduledDate),[addDays(today(),2),addDays(today(),5)]);assert(pendingAssessmentDates(created,mode).every(t=>t.status!=='waiting_for_mle'&&t.cycle<=2));
 assert(!state.store.tasks.some(t=>t.block_id===created.id&&['pre_study','mle'].includes(t.stage)&&live.includes(t.status)));assert(blueprintEligible(created));assert(state.store.placements.filter(p=>p.block_id===created.id).every(p=>p.notes===''));
 assert.equal(JSON.stringify(src),unchangedBlock);assert.equal(JSON.stringify(state.store.sessions),unchangedHistory);assert.equal(JSON.stringify(state.store.tasks.filter(t=>t.block_id===src.id)),sourceTasks);assert.equal(JSON.stringify(state.store.placements.filter(p=>p.block_id===src.id)),sourceNotes);
 refresh();assert.equal(blockAssessmentMode(created),mode);assert.equal(pendingAssessmentDates(created,mode).length,2);assert(!blockHasActiveCoreStage(created.id));
 state.openBlock=null;blankAssessmentDuplicateButton(src,mode).listeners.click();const withoutDates=blankAssessmentDuplicateModal();field(withoutDates,'Name').value='Unscheduled '+mode;
 withoutDates.fields.flatMap(nodes).find(n=>n.tagName==='INPUT'&&n.attrs.type==='checkbox').checked=false;withoutDates.submit();const unscheduled=state.store.blocks.at(-1);refresh();assert.equal(blockAssessmentMode(unscheduled),mode);assert.equal(pendingAssessmentDates(unscheduled,mode).length,0);assert(!blockHasActiveCoreStage(unscheduled.id));
 // The original optional maintenance rule still hides undated post-assessment blocks.
 if(mode==='post_assessment'){state.assessmentTab=mode;state.openBlock=null;assert(!Assessment().textContent.includes(unscheduled.name));}
 const count=state.store.blocks.length;assert.throws(()=>createBlankAssessmentDuplicate(src.id,'Invalid date',mode,['2026-02-31']),/valid revision date/);assert.equal(state.store.blocks.length,count);
 src.archived=true;assert.equal(blankAssessmentDuplicateButton(src,mode),null);assert.throws(()=>createBlankAssessmentDuplicate(src.id,'Archived',mode),/no longer/);src.archived=false;
}
assert.equal(blankAssessmentDuplicateButton(src,'normal'),null);
console.log('Blank Assessment copies: both modes, date opt-out, independent notes/history, inherited blueprints, refresh and validation passed');
console.log('Blank MLE duplication: eligibility, modal, empty independent content, inheritance, refresh, and stage reversion passed');
`, context);
