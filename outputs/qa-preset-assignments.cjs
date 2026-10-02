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
lab=(text,input)=>el('label',{text},[input]);form=(title,fields,submit)=>({title,fields,submit});render=()=>{};open=(type,extra={})=>{state.modal={type,...extra}};
function nodes(fields){return fields.filter(Boolean).flatMap(n=>[n,...nodes(n.children||[])]);}
function field(form,label){return nodes(form.fields).find(n=>n.tagName==='LABEL'&&n._text===label).children[0];}
state.store={subjects:[{id:'s',name:'Math'}],units:[{id:'u',name:'Chosen unit',subject_id:'s'},{id:'v',name:'Other unit',subject_id:'s'}],blocks:['a','b','c','d'].map(id=>({id,name:id,subject_id:'s',unit_id:id==='a'?'u':'v'})),techniques:[{id:'t',name:'Practice',categories:['procedural']}],presets:[{id:'p',name:'Toolkit',placements:[{technique_id:'t',category:'procedural',level:'MO'}]},{id:'q',name:'Other toolkit',placements:[{technique_id:'t',category:'procedural',level:'MO'}]}],preset_links:[],preset_exclusions:[],placements:[{id:'manual-c',block_id:'c',technique_id:'t',category:'procedural',level:'MO',notes:'Manual notes'}],tasks:[],sessions:[{id:'history-b',block_id:'b',stage:'zero_two',confidence:4}],usage:[],piles:[],pile_sessions:[],extra_sessions:[],notifications:[],stage_history:[]};
const values=(preset='p',type='global',id='',windows=['always'])=>({preset_id:preset,target_type:type,target_id:id,window_key:windows[0],window_keys:windows});
const link=savePresetAssignment(values()),linkId=link.id;
const copied=state.store.placements.find(p=>p.block_id==='b');copied.notes='Keep my work';const copyId=copied.id;
assert.equal(state.store.placements.find(p=>p.block_id==='c').preset_managed,false);
const other=savePresetAssignment(values('q','block','d')),otherId=other.id;
openPresetAssignmentEditor('p');assert.equal(state.modal.linkId,linkId,'existing Assign entry opens the actual saved link');
let editor=applyPresetModal();assert.equal(editor.title,'Edit Preset Assignment');assert.equal(field(editor,'Apply to').value,'global');
const scope=field(editor,'Apply to');scope.value='unit';scope.onchange();field(editor,'Unit').value='u';
// Background sync can replace the store while a form stays open.
state.store=JSON.parse(JSON.stringify(state.store));const savedHistory=JSON.stringify(state.store.sessions);editor.submit();
assert.equal(state.store.preset_links.find(l=>l.id===linkId).target_type,'unit');assert.equal(state.store.preset_links.find(l=>l.id===linkId).target_id,'u');assert.equal(state.store.preset_links.length,2,'editing updates instead of adding a link');
syncPresetTechniquePlacements();assert.equal(placementRows('b','procedural','MO').length,0,'out-of-scope copied placements stop appearing');assert.equal(state.store.placements.find(p=>p.id===copyId).notes,'Keep my work');assert.equal(JSON.stringify(state.store.sessions),savedHistory);
assert.equal(placementRows('c','procedural','MO').length,1,'manual technique is retained');assert.equal(state.store.placements.find(p=>p.id==='manual-c').notes,'Manual notes');assert(!state.store.placements.find(p=>p.id==='manual-c').preset_link_id);
assert.equal(placementRows('d','procedural','MO').length,1,'overlapping assignment still provides its technique');assert.equal(state.store.placements.find(p=>p.block_id==='d').preset_link_id,otherId);
openPresetAssignmentEditor('p');editor=applyPresetModal();assert.equal(field(editor,'Apply to').value,'unit');assert.equal(field(editor,'Unit').value,'u','saved target is restored when reopening');
const current=state.store.preset_links.find(l=>l.id===linkId);savePresetAssignment(values('p','global','',['zero_two']),{linkId,signature:JSON.stringify(current)});syncPresetTechniquePlacements();assert.equal(placementRows('b','procedural','MO')[0].id,copyId);assert.equal(placementRows('b','procedural','MO')[0].notes,'Keep my work','re-expanding restores the original notes');assert.deepEqual(state.store.preset_links.find(l=>l.id===linkId).window_keys,['zero_two']);
openPresetAssignmentEditor('p');editor=applyPresetModal();state.store.preset_links.find(l=>l.id===linkId).target_id='changed-elsewhere';assert.throws(()=>editor.submit(),/assignment changed/,'concurrent edits are not silently overwritten');
state.modal={presetId:'p'};editor=applyPresetModal();assert.equal(field(editor,'Apply to').value,'');assert.throws(()=>editor.submit(),/Apply to is required/,'new assignments never silently default to global');
savePresetAssignment(values('p','unit','v',['one_month']));openPresetAssignmentEditor('p');assert.equal(state.modal.type,'presetAssignments','multiple assignments have an explicit chooser');assert(presetAssignmentsModal().some(n=>n.textContent.includes('New assignment')));
// Badge presentation groups identical windows without discarding scope/exception data.
const displayPreset={id:'p',name:'Toolkit'}, firstOrigin={preset:displayPreset,technique_id:'t',link:{id:'one',preset_id:'p',target_type:'global',target_id:'',window_keys:['zero_two','one_month']},status:{key:'upcoming'}}, secondOrigin={...firstOrigin,link:{...firstOrigin.link,id:'two',target_type:'unit',target_id:'u',window_keys:['one_month','zero_two']}};
const grouped=presetOriginGroups([firstOrigin,secondOrigin]);assert.equal(grouped.length,1);assert.equal(grouped[0].length,2);
assert.equal(presetOriginGroups([firstOrigin,{...secondOrigin,link:{...secondOrigin.link,window_keys:['always']}}]).length,2,'different windows remain distinguishable');
const originBadge=presetOriginBadges(grouped[0]);nodes([originBadge]).find(n=>n.tagName==='BUTTON').listeners.click();assert.equal(state.modal.type,'presetAssignments','all overlapping scopes stay editable');
autoSizeTextarea=node=>node;richTextHasContent=value=>Boolean(String(value||'').trim());techniqueHistoryNode=()=>el('div');
state.openBlock={blockId:'a',openNoteIds:[],noteDrafts:{},dirtyKeys:{}};
const shownPlacement={id:'shown',block_id:'a',technique_id:'t',category:'procedural',level:'MO',notes:'Saved content'};
let row=techniqueChip(shownPlacement,'procedural','MO',[firstOrigin,secondOrigin]);assert.equal(nodes([row]).filter(n=>n.className==='technique-preset-origin').length,1,'one badge pair on the actual row');assert.equal(row.attrs['data-has-notes'],'true');
const noteArea=nodes([row]).find(n=>n.tagName==='TEXTAREA');noteArea.value='';noteArea.oninput();assert.equal(row.attrs['data-has-notes'],'false','clearing notes updates styling immediately');noteArea.value='New context';noteArea.oninput();assert.equal(row.attrs['data-has-notes'],'true');
row=techniqueChip({...shownPlacement,id:'empty',notes:''},'procedural','MO');assert.equal(row.attrs['data-has-notes'],'false');
const scheduled=scheduledTechniqueChip([firstOrigin,secondOrigin],state.store.blocks[0]);assert.equal(nodes([scheduled]).filter(n=>n.className==='technique-preset-origin').length,1,'scheduled-only rows also group repeated badges');

// A new addition is a new record, never a restore of a hidden note or a preset adoption.
state.store={subjects:[{id:'s',name:'Math'}],units:[],blocks:[{id:'fresh-a',name:'Fresh A',subject_id:'s'},{id:'fresh-b',name:'Fresh B',subject_id:'s'}],techniques:[{id:'t',name:'Practice',categories:['procedural']},{id:'other',name:'Other method',categories:['procedural']}],presets:[{id:'p',name:'Toolkit',placements:[{technique_id:'t',category:'procedural',level:'LO',notes:'Do not copy preset text'}]}],preset_links:[{id:'l',preset_id:'p',target_type:'global',window_keys:['one_month']}],preset_exclusions:[],placements:[{id:'old-note',block_id:'fresh-a',technique_id:'t',category:'procedural',level:'LO',notes:'Old removed work',ai_prompt_notes:'Legacy work',preset_id:'p',preset_link_id:'l',preset_managed:true,preset_assignment_removed:true},{id:'other-method',block_id:'fresh-a',technique_id:'other',category:'procedural',level:'LO',notes:'Other technique work'}],tasks:[],sessions:[{id:'keep-history',block_id:'fresh-a',stage:'zero_two'}],usage:[],piles:[],pile_sessions:[],extra_sessions:[],notifications:[],stage_history:[]};
state.openBlock={blockId:'fresh-a',openNoteIds:[],noteDrafts:{'old-note':'Unsaved old draft'},dirtyKeys:{}};
state.modal={type:'placement',blockId:'fresh-a',category:'procedural',level:'LO'};
let addForm=placementModal();field(addForm,'Technique').value='t';addForm.submit();
let fresh=placementRows('fresh-a','procedural','LO').find(p=>p.technique_id==='t');const freshId=fresh.id;
assert.notEqual(freshId,'old-note');assert.equal(fresh.notes,'');assert.equal(fresh.preset_id,undefined);assert.equal(fresh.preset_link_id,undefined);
assert.equal(state.store.placements.find(p=>p.id==='old-note').notes,'Old removed work');
for(let i=0;i<3;i++)syncPresetTechniquePlacements();
assert.deepEqual(placementPresetItems(fresh,state.store.blocks[0]),[]);
let freshRow=techniqueChip(fresh,'procedural','LO',placementPresetItems(fresh,state.store.blocks[0]));
assert.equal(nodes([freshRow]).find(n=>n.tagName==='TEXTAREA').value,'','old draft is not adopted');assert(!freshRow.textContent.includes('Preset:'));
assert.equal(state.store.placements.find(p=>p.block_id==='fresh-b').notes,'','a preset-created block entry also starts empty');
assert(techniqueIdsForTask(state.store.blocks[0],{stage:'zero_two'}).includes('t'),'manual technique does not inherit a one-month-only window');
assert.throws(()=>addManualTechniquePlacement('fresh-a','procedural','LO','t'),/already/);
const secondOrder=addManualTechniquePlacement('fresh-a','procedural','MO','t');assert.equal(secondOrder.notes,'');assert.notEqual(secondOrder.id,freshId);
fresh.notes='Notes for this instance';syncPresetTechniquePlacements();assert.equal(secondOrder.notes,'');
// Background synchronization and explicit preset merge cannot attach preset metadata to manual entries.
state.store=JSON.parse(JSON.stringify(state.store));fresh=state.store.placements.find(p=>p.id===freshId);
applyPresetToBlocks(state.store.presets[0],state.store.blocks,false,state.store.preset_links[0]);syncPresetTechniquePlacements();
assert.equal(fresh.preset_id,undefined);assert.equal(fresh.notes,'Notes for this instance');assert.equal(placementPresetItems(fresh,state.store.blocks[0]).length,0);
hideTechniquePlacement(fresh);hideTechniquePlacement(state.store.placements.find(p=>p.id===secondOrder.id));syncPresetTechniquePlacements();assert(!placementRows('fresh-a','procedural','LO').some(p=>p.technique_id==='t'),'removed manual entries do not immediately return as presets');
const readded=addManualTechniquePlacement('fresh-a','procedural','LO','t');assert.equal(readded.notes,'');assert.notEqual(readded.id,freshId);assert.equal(fresh.notes,'Notes for this instance');
assert.equal(state.store.placements.find(p=>p.id==='other-method').notes,'Other technique work');assert.equal(state.store.sessions[0].id,'keep-history');
const legacyManual={id:'legacy-manual',preset_managed:false,preset_id:'p',preset_link_id:'l',block_id:'fresh-a',technique_id:'t'};assert.deepEqual(placementPresetItems(legacyManual,state.store.blocks[0]),[],'previously adopted manual rows no longer display preset origins');
console.log('Fresh technique notes, re-add identity, draft isolation, manual preset independence and history preservation passed');

console.log('Preset badge grouping and live note appearance checks passed');
console.log('Preset scope save/reopen, sync refresh, narrowing, overlapping/manual notes, restored scope and explicit new scope checks passed');
`, context);
