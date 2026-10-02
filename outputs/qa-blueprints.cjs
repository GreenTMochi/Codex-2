const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
class Element {
  constructor(tag) { this.nodeType=1; this.tagName=tag.toUpperCase(); this.children=[]; this.attrs={}; this.style={}; this.listeners={}; this.value=''; this.checked=false; this._text=''; }
  setAttribute(k,v) { this.attrs[k]=v; if(k==='value')this.value=String(v); if(k==='checked')this.checked=true; if(k==='disabled')this.disabled=true; }
  addEventListener(k,fn) { this.listeners[k]=fn; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children=nodes; }
  set textContent(v) { this._text=String(v); this.children=[]; }
  get textContent() { return this._text+this.children.map(n=>n.textContent??String(n)).join(' '); }
}
const storage = new Map(), html=fs.readFileSync(path.join(__dirname,'offline.html'),'utf8');
let source=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')); source=source.slice(0,source.indexOf('      window.addEventListener("beforeunload"'));
const context={assert,console,crypto,setTimeout,clearTimeout,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},window:{__SIR_USER__:null,__SIR_ACCOUNT_STATE__:null,addEventListener(){}},document:{querySelector:()=>({}),createElement:t=>new Element(t),createElementNS:(_,t)=>new Element(t),createTextNode:t=>({nodeType:3,textContent:String(t)})}};
context.sessionStorage=context.localStorage; vm.createContext(context);
vm.runInContext(source+String.raw`
richTextHasContent=value=>Boolean(String(value||'').trim());
lab=(text,input)=>el('label',{text},[input]);form=(title,fields,submit)=>({title,fields,submit});render=()=>{};
function nodes(fields){return fields.filter(Boolean).flatMap(node=>[node,...nodes(node.children||[])]);}
function field(root,text){return nodes(root.fields||[root]).find(node=>node.tagName==='LABEL'&&node._text===text)?.children.at(-1);}
function button(root,text){return nodes(root.fields||[root]).find(node=>node.tagName==='BUTTON'&&node.textContent===text);}
state.store={subjects:[{id:'s',name:'Chem'},{id:'other',name:'Other'}],units:[{id:'u',subject_id:'s',name:'Equilibrium'},{id:'child',subject_id:'s',parent_unit_id:'u',name:'Changes'}],blocks:[{id:'b',subject_id:'s',unit_id:'child',name:'New block'},{id:'other',subject_id:'other',name:'Other block'}],tasks:[],sessions:[],usage:[],notifications:[],techniques:[{id:'t',name:'Explain',categories:['declarative']},{id:'p',name:'Solve',categories:['procedural']}],placements:[],presets:[],preset_links:[],preset_exclusions:[],piles:[],pile_sessions:[],extra_sessions:[],stage_history:[]};
const b=state.store.blocks[0];state.openBlock={blockId:b.id,returnPage:'Subjects',blueprintVisible:true};
assert(!blueprintEligible(b),"no panel until a blueprint is assigned");b.description='Content decided';assert(!blueprintEligible(b));b.description='';
state.store.sessions.push({id:'prior',block_id:b.id});assert(!blueprintEligible(b));state.store.sessions=[];
state.modal={type:'blueprint',targetType:'subject',targetId:'s'};let editor=blueprintEditorModal();button(editor,'Add entry').listeners.click();
let draft=state.modal.blueprintDraft.entries[0];field(editor,'Content name').listeners.input({target:{value:'Equilibrium principle'}});field(editor,'Technique').value='t';field(editor,'Technique').onchange();field(editor,'Order').value='HO';field(editor,'Order').onchange();field(editor,'Instructions (optional)').listeners.input({target:{value:'Explain without notes'}});editor.submit();
const entry=blueprintEntries()[0];assert.equal(entry.target_type,'subject');assert.equal(entry.content_name,'Equilibrium principle');assert.equal(entry.level,'HO');assert(blueprintEligible(b));b.description='Decided content';assert(!blueprintEligible(b));b.description='';
state.store.blueprint_entries.push({id:'unit-entry',target_type:'unit',target_id:'u',content_name:'Calculate equilibrium',category:'procedural',level:'MO',technique_id:'p'}, {id:'unrelated',target_type:'subject',target_id:'other',content_name:'Other',category:'declarative',level:'LO',technique_id:'t'});
assert.deepEqual(blueprintEntriesForBlock(b).map(row=>row.id),[entry.id,'unit-entry']);assert.deepEqual(blueprintScopes(b).map(row=>row.id),['s','u','child']);
// Empty preset bundles must not suppress the blueprint, before or after synchronization.
state.store.presets=[{id:'bundle',name:'Toolkit',placements:[{technique_id:'p',category:'procedural',level:'MO'}]}];
for (const windowKey of ['always','one_month']) {
 state.store.preset_links=[{id:'bundle-link',preset_id:'bundle',target_type:'subject',target_id:'s',window_keys:[windowKey]}];
 assert(assignedPresetPlacements(b).length);assert(blueprintEligible(b),'assigned bundle alone allows blueprint');
 syncPresetTechniquePlacements();assert(blueprintEligible(b),'materialized preset rows still allow blueprint');
 const bundled=state.store.placements.find(row=>row.block_id===b.id);
 assert(bundled.preset_managed);assert.equal(bundled.notes,'');
 const bank=blueprintPanel(b);assert(bank.textContent.includes('Equilibrium principle'));assert(bank.textContent.includes('Calculate equilibrium'));
 bundled.notes='Actual class notes';assert(!blueprintEligible(b),'written notes still mean content exists');bundled.notes='';
 delete bundled.preset_managed;assert(blueprintEligible(b),'legacy preset origins are recognized');
 delete bundled.notes;bundled.ai_prompt_notes='Legacy notes';assert(!blueprintEligible(b));bundled.notes='';assert(blueprintEligible(b),'explicitly cleared notes override legacy fields');delete bundled.ai_prompt_notes;
 bundled.preset_managed=false;assert(!blueprintEligible(b),'manual entries remain independent even with old preset metadata');
 state.store.placements=[];
}
state.store.preset_links=[];state.store.presets=[];
state.store.placements=[{id:'manual',block_id:b.id,technique_id:'p',notes:''}];assert(!blueprintEligible(b),'manual choice still counts as decided content');state.store.placements=[];
state.store.sessions=[{id:'previous-session',block_id:b.id}];assert(!blueprintEligible(b));state.store.sessions=[];
b.blueprint_dismissed=true;assert(!blueprintEligible(b));delete b.blueprint_dismissed;
const schedule=JSON.stringify(state.store.tasks), first=applyBlueprintEntry(b,entry.id);assert.equal(first.level,'HO');assert.equal(first.category,'declarative');assert.equal(first.notes,'');assert.equal(first.content_name,entry.content_name);assert.equal(JSON.stringify(state.store.tasks),schedule);
assert(blueprintEligible(b),'setup remains open after a first drop');assert.equal(applyBlueprintEntry(b,entry.id).id,first.id);assert.equal(state.store.placements.length,1);
entry.content_name='Changed blueprint';assert.equal(first.content_name,'Equilibrium principle','copies are independent');
assert.throws(()=>applyBlueprintEntry(b,'unrelated'),/no longer assigned/);
state.openBlock.placementLayoutDraft={[first.id]:{category:'declarative',level:'HO',order:0}};
const second=applyBlueprintEntry(b,'unit-entry');assert.equal(second.category,'procedural');assert.equal(second.level,'MO');assert.equal(state.openBlock.placementLayoutDraft[second.id].level,'MO');
state.modal={type:'blueprintPlacement',placementId:first.id};editor=blueprintPlacementModal();field(editor,'Content name').listeners.input({target:{value:'My adjusted content'}});field(editor,'Order').value='LO';field(editor,'Order').onchange();editor.submit();assert.equal(first.content_name,'My adjusted content');assert.equal(placementPosition(first).level,'LO');assert.equal(entry.level,'HO');assert.equal(first.notes,'');
state.modal={type:'blueprint',targetType:'unit',targetId:'u'};editor=blueprintEditorModal();blueprintScopeRows('unit','u')[0].content_name='Concurrent change';assert.throws(()=>editor.submit(),/blueprint changed/);
state.store.techniques[1].archived=true;second.preset_assignment_removed=true;assert.throws(()=>applyBlueprintEntry(b,'unit-entry'),/available technique/);state.store.techniques[1].archived=false;
// The drag payload copies into its preset section, regardless of the drop area's location.
blockTechniqueSections=()=>[];beginDragScroll=()=>{};endDragScroll=()=>{};
const panel=blueprintPanel(b), card=nodes([panel]).find(n=>n.tagName==='ARTICLE'&&n.textContent.includes('Concurrent change'));
const data=new Map(),transfer={setData:(k,v)=>data.set(k,v),getData:k=>data.get(k)||''};card.listeners.dragstart({dataTransfer:transfer});assert.equal(transfer.effectAllowed,'copy');
let prevented=false;blueprintDropArea(b).listeners.drop({dataTransfer:transfer,preventDefault(){prevented=true;},stopPropagation(){},currentTarget:{classList:{remove(){}}}});assert(prevented);assert.equal(activeBlueprintEntryId,'');assert(state.store.placements.some(p=>p.id!==second.id&&p.blueprint_entry_id==='unit-entry'&&p.level==='MO'));
finishBlueprint(b);assert(!blueprintEligible(b));assert.equal(state.openBlock.blueprintVisible,false);state.openBlock=null;assert(!blueprintEligible(b));
// Pre-study can explicitly reopen a dismissed blueprint alongside already decided content.
state.page='Study';b.description='Existing class notes';state.store.tasks=[{id:'pre-blueprint',block_id:b.id,stage:'pre_study',status:'planned',window_start:'2099-01-01',window_end:'2099-01-01'}];
assert(!blueprintEligible(b));assert(preStudyBlueprintAvailable(b));
const preButton=preStudyBlueprintButton(b);preButton.listeners.click();assert.equal(state.openBlock.blockId,b.id);assert.equal(state.openBlock.blueprintVisible,true);
const beforePreSchedule=JSON.stringify(state.store.tasks),beforePrePlacements=JSON.stringify(state.store.placements),beforePreSessions=JSON.stringify(state.store.sessions);
state.store.blueprint_entries.push({id:'pre-entry',target_type:'unit',target_id:'child',content_name:'Preview key ideas',category:'declarative',level:'MO',technique_id:'t',instructions:'List the key questions'});
const preCopy=applyBlueprintEntry(b,'pre-entry');assert.equal(preCopy.level,'MO');assert.equal(preCopy.notes,'');assert.equal(b.description,'Existing class notes');assert.equal(JSON.stringify(state.store.placements.slice(0,-1)),beforePrePlacements);assert.equal(JSON.stringify(state.store.tasks),beforePreSchedule);assert.equal(JSON.stringify(state.store.sessions),beforePreSessions);
assert.equal(applyBlueprintEntry(b,'pre-entry').id,preCopy.id,'adding the same blueprint twice does not duplicate it');finishBlueprint(b);assert(preStudyBlueprintButton(b),'pre-study can reopen the panel after Done choosing');
state.store.tasks[0].status='completed';assert.equal(preStudyBlueprintButton(b),null);state.store.tasks[0].status='paused';assert(preStudyBlueprintAvailable(b));b.archived=true;assert.equal(preStudyBlueprintButton(b),null);b.archived=false;
const imported=normalizeImportedData(JSON.parse(JSON.stringify(state.store))).store;assert.equal(imported.blueprint_entries.length,4);assert.equal(imported.blocks[0].blueprint_dismissed,true);assert.equal(imported.placements[0].content_name,'My adjusted content');
const merge=mergeAccountSnapshots({store:{blueprint_entries:[entry]},local:{}},{store:{blueprint_entries:[entry,{id:'new-a',content_name:'A'}]},local:{}},{store:{blueprint_entries:[entry,{id:'new-b',content_name:'B'}]},local:{}});assert.equal(merge.store.blueprint_entries.length,3);

// Both confirmation steps are required; removing a block's blueprint cannot edit the shared bank.
const otherBlock={id:'same-unit',subject_id:'s',unit_id:'child',name:'Other unit block'};state.store.blocks.push(otherBlock);
const bankBefore=JSON.stringify(blueprintEntries()),historyBefore=JSON.stringify(state.store.sessions),tasksBefore=JSON.stringify(state.store.tasks);
state.openBlock={blockId:b.id,noteDrafts:{[preCopy.id]:'Unsaved work'},dirtyKeys:{['technique-note:'+preCopy.id]:true},openNoteIds:[preCopy.id],placementLayoutDraft:{[preCopy.id]:{category:'declarative',level:'MO',order:0}}};
let confirmations=[];confirm=message=>{confirmations.push(message);return false;};const beforeCancel=JSON.stringify(state.store),draftsBefore=JSON.stringify(state.openBlock);
assert.equal(removeBlueprintEntryFromBlock(b.id,'pre-entry'),false);assert.equal(confirmations.length,1);assert.equal(JSON.stringify(state.store),beforeCancel);assert.equal(JSON.stringify(state.openBlock),draftsBefore);
confirmations=[];confirm=message=>{confirmations.push(message);return confirmations.length===1;};assert.equal(removeBlueprintEntryFromBlock(b.id,'pre-entry'),false);assert.equal(confirmations.length,2);assert.equal(JSON.stringify(state.store),beforeCancel);
confirmations=[];confirm=message=>{confirmations.push(message);return true;};assert(removeBlueprintEntryFromBlock(b.id,'pre-entry'));assert.equal(confirmations.length,2);assert(preCopy.preset_assignment_removed);assert.equal(preCopy.notes,'Unsaved work');assert(!blueprintEntriesForBlock(b).some(e=>e.id==='pre-entry'));assert(blueprintEntriesForBlock(otherBlock).some(e=>e.id==='pre-entry'));
assert(!blueprintPanel(b).textContent.includes('Preview key ideas'));assert(!state.openBlock.noteDrafts[preCopy.id]);assert(!state.openBlock.placementLayoutDraft[preCopy.id]);assert.equal(JSON.stringify(blueprintEntries()),bankBefore);assert.equal(JSON.stringify(state.store.sessions),historyBefore);assert.equal(JSON.stringify(state.store.tasks),tasksBefore);
assert(normalizeImportedData(JSON.parse(JSON.stringify(state.store))).store.blocks.find(row=>row.id===b.id).blueprint_hidden_entry_ids.includes('pre-entry'));
// Removing an added copy also requires both confirmations and leaves the bank card available.
confirmations=[];confirm=message=>{confirmations.push(message);return confirmations.length===1;};assert.equal(removeBlockBlueprintPlacement(first.id),false);assert(!first.preset_assignment_removed);
confirmations=[];confirm=message=>{confirmations.push(message);return true;};assert(removeBlockBlueprintPlacement(first.id));assert.equal(confirmations.length,2);assert(first.preset_assignment_removed);assert(blueprintEntriesForBlock(b).some(e=>e.id===entry.id));assert.equal(JSON.stringify(blueprintEntries()),bankBefore);
assert(nodes([blueprintPanel(b)]).some(n=>n.attrs['aria-label']==='Remove blueprint from this block'));
console.log('Blueprint double-confirmation cancellation, local removal, draft/history preservation, inheritance and import checks passed');
console.log('Blueprint scope, editor, eligibility, drop, independent copies, adjustments, schedule preservation, import and sync checks passed');
`,context);
