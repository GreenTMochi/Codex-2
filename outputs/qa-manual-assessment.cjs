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
lab=(text,input)=>el("label",{text},[input]);
form=(title,fields,submit)=>({title,fields,submit});
function nodes(fields){return fields.filter(Boolean).flatMap(node=>[node,...nodes(node.children||[])]);}
function fixture(){
  state.store={notebook:"",subjects:[{id:"s",name:"Math"}],units:[{id:"u",subject_id:"s",name:"Unit",assessment_mode:"normal",custom_spacing:[]},{id:"child",subject_id:"s",parent_unit_id:"u",name:"Subunit",assessment_mode:"normal",custom_spacing:[]}],
    blocks:[{id:"a",name:"A",subject_id:"s",unit_id:"u",mle_date:"2026-08-31"},{id:"b",name:"B",subject_id:"s",unit_id:"child",mle_date:"2026-08-31"},{id:"c",name:"Archived",subject_id:"s",unit_id:"u",archived:true}],
    tasks:["a","b"].flatMap(id=>[{id:id+"-pre",block_id:id,stage:"pre_study",cycle:1,status:"completed",window_start:"2026-08-30",window_end:"2026-08-30"},{id:id+"-mle",block_id:id,stage:"mle",cycle:1,status:"completed",window_start:"2026-08-31",window_end:"2026-08-31"},{id:id+"-normal",block_id:id,stage:"two_week_review",cycle:1,status:"planned",window_start:"2026-09-11",window_end:"2026-09-13"}]),sessions:[],usage:[],techniques:[],placements:[],presets:[],preset_links:[],preset_exclusions:[],piles:[],pile_sessions:[],extra_sessions:[],stage_history:[],notifications:[]};
  localStorage.setItem(appSettingsKey,JSON.stringify({cycle_start_week:"2026-08-30",cycle_start_phase:0,end_week_start:5,end_week_end:0,timezone:"America/New_York"}));
}
fixture();
state.modal={unitId:"u"}; let modeForm=assessmentModeModal();
const mode=nodes(modeForm.fields).find(n=>n.tagName==="SELECT");mode.value="pre_assessment";mode.onchange();
let editors=nodes(modeForm.fields).filter(n=>n.className?.includes("manual-assessment-block"));
assert.equal(editors.length,2,"unit editor includes nested blocks but excludes archives");
let input=nodes([editors[0]]).find(n=>n.tagName==="INPUT");input.value="2026-09-10";input.oninput();
const add=nodes([editors[1]]).find(n=>n.tagName==="BUTTON"&&n.textContent==="Add date");add.listeners.click();
let dates=nodes([editors[1]]).filter(n=>n.tagName==="INPUT");dates[0].value="2026-09-12";dates[0].oninput();dates[1].value="2026-09-15";dates[1].oninput();
modeForm.submit();
let a=state.store.blocks[0],b=state.store.blocks[1];
assert(manualPreAssessment(a)&&manualPreAssessment(b));
assert.deepEqual(pendingAssessmentDates(a).map(t=>t.window_start),["2026-09-10"]);
assert.deepEqual(pendingAssessmentDates(b).map(t=>t.window_start),["2026-09-12","2026-09-15"]);
assert.equal(state.store.tasks.find(t=>t.id==="a-normal").status,"superseded","switch replaces automatic tasks without deleting them");
assert.equal(state.store.blocks[2].assessment_mode,undefined,"archived block stays untouched");
assert.equal(state.store.units[0].assessment_date,"","manual dates do not require an exam anchor");
const newBlock={id:"new",name:"New block",subject_id:"s",unit_id:"u"};state.store.blocks.push(newBlock);assert(manualPreAssessment(newBlock),"new blocks in a manual unit can immediately use date lists");
syncAssessmentModes();syncAssessmentModes();
assert.equal(pendingAssessmentDates(a).length,1,"refresh does not duplicate dates");
const taskA=pendingAssessmentDates(a)[0],taskB=pendingAssessmentDates(b)[0];
completeTaskById(taskA.id,{confidence:3,completion_percent:75,minutes:12,completed_date:"2026-09-08"});
assert.equal(pendingAssessmentDates(a).length,0,"finishing the only date creates no extra review");
assert.equal(state.store.sessions[0].completion_percent,75);
assert(blockStage(a).label.includes("add revision dates"));
const history=JSON.stringify(state.store.sessions);
writeManualAssessmentDates(a,[{date:"2026-09-20"}]);
assert.equal(JSON.stringify(state.store.sessions),history,"adding dates preserves completed sessions");
assert.equal(pendingAssessmentDates(a)[0].cycle,2,"new dates never reuse a completed cycle");
const bRows=pendingAssessmentDates(b);writeManualAssessmentDates(b,[{task_id:bRows[1].id,date:"2026-09-17"}]);
assert.equal(state.store.tasks.find(t=>t.id===taskB.id).status,"cancelled","removed dates stay inactive on refresh");
syncAssessmentModes();assert.deepEqual(pendingAssessmentDates(b).map(t=>t.window_start),["2026-09-17"]);
assert.equal(pendingAssessmentDates(b)[0].id,bRows[1].id,"rescheduling retains task identity");
assert.throws(()=>writeManualAssessmentDates(a,[{date:"2026-09-20"},{date:"2026-09-20"}]),/only once/);
assert.throws(()=>validateAssessmentDates([{date:"2026-02-30"}]),/valid revision date/);
const beforeMany=JSON.stringify(state.store.sessions);
const many=Array.from({length:400},(_,i)=>({date:addDays("2026-10-01",i)}));writeManualAssessmentDates(a,many);syncAssessmentModes();
assert.equal(pendingAssessmentDates(a).length,400,"no fixed limit on future revision dates");
refresh();refresh();assert.equal(pendingAssessmentDates(a).length,400,"full refresh keeps all explicit dates");assert.deepEqual(pendingAssessmentDates(a).map(t=>t.scheduled_date),many.map(row=>row.date));
assert.equal(JSON.stringify(state.store.sessions),beforeMany);
// An old editor cannot resurrect work completed in another tab.
const stale=manualAssessmentDateEditor(b);completeTaskById(pendingAssessmentDates(b)[0].id,{confidence:4,completed_date:"2026-09-08"});assert.throws(()=>stale.values(),/schedule changed/);
const imported=normalizeImportedData(JSON.parse(JSON.stringify(state.store))).store;
assert.equal(imported.blocks[0].manual_pre_assessment,true);
assert.equal(imported.blocks[0].manual_assessment_unit_id,"u");
assert.equal(imported.units[0].manual_pre_assessment,true,"manual unit behavior survives import");
assert.equal(imported.tasks.filter(t=>t.block_id==="a"&&t.stage==="pre_assessment"&&live.includes(t.status)).length,400,"exact pending dates survive export/import");
// Preparing dates before MLE does not lose them or enable premature revision.
fixture();a=state.store.blocks[0];state.store.tasks.find(t=>t.id==="a-mle").status="planned";
writeManualAssessmentDates(a,[{date:"2026-09-18"},{date:"2026-09-25"}]);
assert(pendingAssessmentDates(a).every(t=>t.status==="waiting_for_mle"));
suppressLaterStagesDuringCore(a);syncAssessmentModes();
assert.equal(pendingAssessmentDates(a).length,2);
state.store.tasks.find(t=>t.id==="a-mle").status="completed";syncAssessmentModes();
assert(pendingAssessmentDates(a).every(t=>t.status==="planned"));
// Pause and archive must not reset manually selected dates.
pauseRevisionScope("block",a.id,"Break");syncAssessmentModes();
assert(pendingAssessmentDates(a).every(t=>t.status==="paused"));
resumeRevisionScope("block",a.id);syncAssessmentModes();
assert(pendingAssessmentDates(a).every(t=>live.includes(t.status)));
const beforeArchive=JSON.stringify(pendingAssessmentDates(a));setHierarchyArchived("block",a,true);syncAssessmentModes();assert.equal(JSON.stringify(pendingAssessmentDates(a)),beforeArchive);setHierarchyArchived("block",a,false);syncAssessmentModes();assert.equal(pendingAssessmentDates(a).length,2);
// Manual schedule controls use the same list and do not offer automatic dates.
state.modal={taskId:pendingAssessmentDates(a)[0].id};modeForm=scheduleModal();
assert.equal(modeForm.title,"Edit pre-assessment dates");
assert(!nodes(modeForm.fields).some(n=>n.textContent?.includes("Automatic scheduling")));
// Revert/reset still replay saved dates, never inferred exam offsets.
const first=pendingAssessmentDates(a)[0],second=pendingAssessmentDates(a)[1];completeTaskById(first.id,{completed_date:"2026-09-08"});
revertRevisionStage(second,"Retry");let replay=pendingAssessmentDates(a)[0];assert.equal(replay.window_start,"2026-09-18");completeTaskById(replay.id,{completed_date:"2026-09-08"});
assert.equal(pendingAssessmentDates(a)[0].window_start,"2026-09-25");
resetRevisionStages(pendingAssessmentDates(a)[0],"Restart");replay=pendingAssessmentDates(a)[0];assert.equal(replay.window_start,"2026-09-18");completeTaskById(replay.id,{completed_date:"2026-09-08"});assert.equal(pendingAssessmentDates(a)[0].window_start,"2026-09-25");completeTaskById(pendingAssessmentDates(a)[0].id,{completed_date:"2026-09-08"});syncAssessmentModes();assert.equal(pendingAssessmentDates(a).length,0);
// A failed multi-block save makes no partial unit or task changes.
fixture();state.modal={unitId:"u"};modeForm=assessmentModeModal();let selector=nodes(modeForm.fields).find(n=>n.tagName==="SELECT");selector.value="pre_assessment";selector.onchange();
editors=nodes(modeForm.fields).filter(n=>n.className?.includes("manual-assessment-block"));
nodes([editors[1]]).find(n=>n.tagName==="BUTTON"&&n.textContent==="Add date").listeners.click();
nodes([editors[1]]).filter(n=>n.tagName==="INPUT").forEach(input=>{input.value="2026-09-20";input.oninput();});
const unchanged=JSON.stringify(state.store);assert.throws(()=>modeForm.submit(),/only once/);assert.equal(JSON.stringify(state.store),unchanged);
// Switching back to normal and post-assessment remains available.
writeManualAssessmentDates(state.store.blocks[0],[{date:"2026-09-20"}],"u");writeManualAssessmentDates(state.store.blocks[1],[{date:"2026-09-23"}],"u");
state.store.units[0].assessment_mode="pre_assessment";state.modal={unitId:"u"};modeForm=assessmentModeModal();selector=nodes(modeForm.fields).find(n=>n.tagName==="SELECT");selector.value="normal";selector.onchange();modeForm.submit();
assert.equal(blockAssessmentMode(state.store.blocks[0]),"normal");assert.equal(blockAssessmentMode(state.store.blocks[1]),"normal");assert.equal(pendingAssessmentDates(state.store.blocks[0]).length,0);assert(state.store.tasks.some(t=>t.block_id==="a"&&t.stage==="zero_two"&&live.includes(t.status)));
state.modal={unitId:"u"};modeForm=assessmentModeModal();selector=nodes(modeForm.fields).find(n=>n.tagName==="SELECT");selector.value="post_assessment";selector.onchange();

assert(!nodes(modeForm.fields).some(n=>n._text==='Custom spacing in days'||n._text==='Assessment date (optional for pre-assessment)'));
modeForm.submit();assert.equal(blockAssessmentMode(state.store.blocks[0]),'post_assessment');assert.equal(pendingAssessmentDates(state.store.blocks[0]).length,0,'maintenance dates are optional');
writeManualAssessmentDates(state.store.blocks[0],[{date:'2026-09-11'}]);assert(state.store.tasks.some(t=>t.block_id==='a'&&t.stage==='post_assessment'&&t.window_start==='2026-09-11'));
console.log("Manual per-block assessment dates, unlimited lists, history, waiting, pause and replay checks passed");
`,context);
