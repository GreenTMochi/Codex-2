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

lab=(text,input)=>el('label',{text},[input]);form=(title,fields,submit)=>({title,fields,submit});
function nodes(fields){return fields.filter(Boolean).flatMap(node=>[node,...nodes(node.children||[])]);}
const field=(root,label)=>nodes(root.fields||[root]).find(n=>n.tagName==='LABEL'&&n._text===label)?.children[0];
const click=(root,text)=>nodes(root.fields||[root]).find(n=>n.tagName==='BUTTON'&&n.textContent===text).listeners.click();
state.store={subjects:[{id:'s',name:'Biology'},{id:'other',name:'Chemistry'}],units:[{id:'u',name:'Cells',subject_id:'s'},{id:'sub',name:'Membranes',subject_id:'s',parent_unit_id:'u'},{id:'other-u',name:'Atoms',subject_id:'other'}],blocks:[{id:'b',name:'Transport',subject_id:'s',unit_id:'sub',mle_date:'2026-09-01',pre_study_date:'2026-09-01'},{id:'loose',name:'Standalone',subject_id:'s',unit_id:''}],tasks:[],sessions:[],usage:[],notifications:[],techniques:[],placements:[],presets:[],preset_links:[],preset_exclusions:[],piles:[],pile_sessions:[],extra_sessions:[],stage_history:[]};
const [subject,other]=state.store.subjects,[unit,sub,otherUnit]=state.store.units,[block,loose]=state.store.blocks;
const setZone=(item,start,end)=>{item.testing_zone_start=start;item.testing_zone_end=end;};
today=()=> '2026-09-08';
setZone(subject,'2026-09-08','2026-09-20');
assert.equal(effectiveTestingZone('block',block).item.id,'s');assert.equal(effectiveTestingZone('unit',sub).item.id,'s');assert.equal(effectiveTestingZone('block',loose).item.id,'s');
assert(testingZoneActive(ownTestingZone(subject),'2026-09-08'));assert(testingZoneActive(ownTestingZone(subject),'2026-09-20'));assert(!testingZoneActive(ownTestingZone(subject),'2026-09-07'));assert(!testingZoneActive(ownTestingZone(subject),'2026-09-21'));
setZone(unit,'2026-09-10','2026-09-18');assert.equal(effectiveTestingZone('block',block).item.id,'u');assert.equal(testingZoneMismatch('unit',unit).parent.item.id,'s');assert.equal(testingZoneMismatch('block',block),null);
setZone(sub,'2026-09-10','2026-09-18');assert.equal(testingZoneMismatch('unit',sub),null,'identical override does not warn');
setZone(block,'2026-09-08','2026-09-09');assert.equal(effectiveTestingZone('block',block).item.id,'b');assert.equal(testingZoneMismatch('block',block).parent.item.id,'sub');assert(testingZoneStatus('block',block).textContent.includes('Zone differs from Membranes'));
assert.equal(testingZoneChildConflicts('subject',subject).length,2,'parent sees distinct conflicting descendants');
let editor=testingZoneEditor('block',block);assert(editor.node.textContent.includes('Inherited from unit Membranes'));assert(editor.node.textContent.includes('Warning: this block'));
click(editor.node,'Use inherited zone');assert.equal(editor.values(),null);editor.apply(editor.values());assert.equal(effectiveTestingZone('block',block).item.id,'sub');assert.equal(testingZoneMismatch('block',block),null);
editor=testingZoneEditor('unit',sub);click(editor.node,'Use inherited zone');editor.apply(editor.values());assert.equal(effectiveTestingZone('block',block).item.id,'u');
editor=testingZoneEditor('unit',unit);click(editor.node,'Use inherited zone');editor.apply(editor.values());assert.equal(effectiveTestingZone('block',block).item.id,'s');
assert.equal(testingZoneChildConflicts('subject',subject).length,0);
// Preview proposed parent dates and validate both endpoints before mutation.
setZone(block,'2026-09-08','2026-09-20');editor=testingZoneEditor('subject',subject);assert(!editor.node.textContent.includes('Warning: more specific'));
field(editor.node,'Testing zone start').value='2026-09-07';field(editor.node,'Testing zone start').oninput();assert(editor.node.textContent.includes('Transport'));assert(editor.node.textContent.includes('more specific zones differ'));assert.equal(subject.testing_zone_start,'2026-09-08','typing does not mutate saved state');
field(editor.node,'Testing zone end').value='2026-09-06';assert.throws(()=>editor.values(),/end date/);field(editor.node,'Testing zone end').value='';assert.throws(()=>editor.values(),/both/);field(editor.node,'Testing zone start').value='2026-02-30';field(editor.node,'Testing zone end').value='2026-03-02';assert.throws(()=>editor.values(),/valid/);
assert(!validTestingZoneDate('2026-02-30'));assert(validTestingZoneDate('2028-02-29'));assert(!ownTestingZone({testing_zone_start:'bad',testing_zone_end:'bad'}));
// Every real Edit dialog saves the zone. Invalid input leaves the store intact.
for(const [type,item] of [['subject',subject],['unit',unit],['block',block]]){
 state.modal={itemType:type,itemId:item.id};let edit=editModal();assert(field(edit,'Testing zone start'));field(edit,'Testing zone start').value='2026-10-10';field(edit,'Testing zone end').value='2026-10-11';edit.submit();assert.equal(item.testing_zone_start,'2026-10-10');assert.equal(item.testing_zone_end,'2026-10-11');
 const snapshot=JSON.stringify(state.store);edit=editModal();field(edit,'Testing zone start').value='2026-10-12';field(edit,'Testing zone end').value='2026-10-11';assert.throws(()=>edit.submit(),/end date/);assert.equal(JSON.stringify(state.store),snapshot);
}

// Zone-only saves preserve manually assigned tasks and completed history.
state.store.tasks.push({id:'manual',block_id:block.id,subject_id:block.subject_id,unit_id:block.unit_id,stage:'zero_two',cycle:1,status:'planned',window_start:'2026-09-09',window_end:'2026-09-11',scheduled_date:'2026-09-25',schedule_source:'manual'});
state.store.sessions.push({id:'history',block_id:block.id,stage:'mle',cycle:1,completed_at:'2026-09-01T12:00:00Z',confidence:3,minutes:20});
const beforeSchedule=JSON.stringify({tasks:state.store.tasks,sessions:state.store.sessions});
for(const [type,item] of [['unit',unit],['block',block]]){state.modal={itemType:type,itemId:item.id};const edit=editModal();field(edit,'Testing zone start').value='2026-10-01';field(edit,'Testing zone end').value='2026-10-05';edit.submit();}
assert.equal(JSON.stringify({tasks:state.store.tasks,sessions:state.store.sessions}),beforeSchedule,'saving only a warning period preserves all revision dates and history');
// Changing parent selectors refreshes inherited guidance.
setZone(other,'2026-12-01','2026-12-12');state.modal={itemType:'block',itemId:block.id};let edit=editModal();field(edit,'Subject').value='other';field(edit,'Subject').onchange();assert(nodes(edit.fields).map(n=>n._text).join(' ').includes('Inherited from subject Chemistry'));
// Clearing an override, reparenting, and export/import all resolve dynamically.
setZone(block,'','');block.subject_id='other';block.unit_id='other-u';assert.equal(effectiveTestingZone('block',block).item.id,'other');
const imported=normalizeImportedData(JSON.parse(JSON.stringify(state.store))).store;assert.equal(imported.subjects[0].testing_zone_start,subject.testing_zone_start);assert.equal(imported.units[0].testing_zone_end,unit.testing_zone_end);assert.equal(imported.blocks[0].testing_zone_start,'');
// Active warning banners list configured scopes once and omit archives/future periods.
setZone(subject,'2026-09-08','2026-09-20');setZone(unit,'2026-09-08','2026-09-09');setZone(block,'2026-09-08','2026-09-10');block.archived=true;
let banner=testingZoneBanner();assert(banner.textContent.includes("You're in the testing zone"));assert(banner.textContent.includes('Biology'));assert(!banner.textContent.includes('Transport'));assert(!banner.textContent.includes('Chemistry'));assert.equal(nodes([banner]).filter(n=>n.className==='testing-zone-entry row').length,2);
unit.archived=true;assert.equal(nodes([testingZoneBanner()]).filter(n=>n.className==='testing-zone-entry row').length,1);subject.archived=true;assert.equal(testingZoneBanner(),null);subject.archived=false;unit.archived=false;
let opened;open=(type,options)=>{opened={type,...options};};click(testingZoneBanner(),'Edit zone');assert.equal(opened.type,'edit');
Home=Study=Assessment=()=>el('div',{text:'Page content'});for(const name of ['Home','Study','Assessment']){state.page=name;assert(page().textContent.includes("You're in the testing zone"));}

let renderCount=0;render=()=>{renderCount++;};testingZoneRenderedDay='2026-09-07';state.modal={type:'edit'};refreshTestingZoneDay();assert.equal(renderCount,0,'date refresh waits for an open editor');state.modal=null;refreshTestingZoneDay();assert.equal(renderCount,1);refreshTestingZoneDay();assert.equal(renderCount,1,'same-day checks do not rerender');
console.log('Testing zone inheritance, overrides, conflict previews, editors, date boundaries, hierarchy moves, archives and import passed');

`,context);
