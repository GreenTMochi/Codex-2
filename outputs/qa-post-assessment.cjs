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
lab=(text,input)=>el('label',{text},[input]);form=(title,fields,submit)=>({title,fields,submit});render=()=>{};
function nodes(fields){return fields.filter(Boolean).flatMap(node=>[node,...nodes(node.children||[])]);}
function fixture(){
  state.store={notebook:"",subjects:[{id:"s",name:"Math"}],units:[{id:"u",subject_id:"s",name:"Unit",assessment_mode:"normal",custom_spacing:[]},{id:"child",subject_id:"s",parent_unit_id:"u",name:"Subunit",assessment_mode:"normal",custom_spacing:[]}],
    blocks:[{id:"a",name:"A",subject_id:"s",unit_id:"u",mle_date:"2026-08-31"},{id:"b",name:"B",subject_id:"s",unit_id:"child",mle_date:"2026-08-31"},{id:"c",name:"Archived",subject_id:"s",unit_id:"u",archived:true}],
    tasks:["a","b"].flatMap(id=>[{id:id+"-pre",block_id:id,stage:"pre_study",cycle:1,status:"completed",window_start:"2026-08-30",window_end:"2026-08-30"},{id:id+"-mle",block_id:id,stage:"mle",cycle:1,status:"completed",window_start:"2026-08-31",window_end:"2026-08-31"},{id:id+"-normal",block_id:id,stage:"two_week_review",cycle:1,status:"planned",window_start:"2026-09-11",window_end:"2026-09-13"}]),sessions:[],usage:[],techniques:[],placements:[],presets:[],preset_links:[],preset_exclusions:[],piles:[],pile_sessions:[],extra_sessions:[],stage_history:[],notifications:[]};
  localStorage.setItem(appSettingsKey,JSON.stringify({cycle_start_week:"2026-08-30",cycle_start_phase:0,end_week_start:5,end_week_end:0,timezone:"America/New_York"}));
}
fixture();const a=state.store.blocks[0],b=state.store.blocks[1];a.assessment_mode='post_assessment';a.assessment_date='2020-01-01';a.custom_spacing=[1,7,21];b.assessment_mode='post_assessment';
// Existing future dates survive migration; stale spacing never creates new work.
state.store.tasks.push({id:'legacy-post',block_id:a.id,stage:'post_assessment',cycle:1,status:'planned',window_start:'2099-01-10',window_end:'2099-01-10'});
syncAssessmentModes();syncAssessmentModes();assert.equal(pendingAssessmentDates(a).length,1);assert.equal(pendingAssessmentDates(a)[0].window_start,'2099-01-10');assert.equal(pendingAssessmentDates(a)[0].schedule_source,'manual_post_assessment');assert.equal(pendingAssessmentDates(b).length,0);
state.page='Assessment';state.assessmentTab='post_assessment';state.maintenanceMonth='2026-09';
let view=Assessment();assert.equal(nodes([view]).filter(n=>n.className?.includes('assessment-block-card')).length,1,'unscheduled blocks do not appear as work');assert(!view.textContent.includes('Needs dates'));
state.modal={type:'assessmentDates',blockId:a.id};let editor=manualAssessmentBlockModal();assert.equal(editor.title,'Edit post-assessment dates');assert(!nodes(editor.fields).some(n=>n._text==='Custom spacing in days'));
const historyBefore=JSON.stringify(state.store.sessions);writeManualAssessmentDates(a,[]);syncAssessmentModes();assert.equal(pendingAssessmentDates(a).length,0);assert.equal(JSON.stringify(state.store.sessions),historyBefore);assert.equal(nodes([Assessment()]).filter(n=>n.className?.includes('assessment-block-card')).length,0);
// Optional blocks remain selectable for later bulk scheduling.
const draft={mode:'post_assessment',selected:[a.id,b.id],dates:[{date:'2026-09-20'},{date:'2026-09-27'}],signatures:Object.fromEntries([a,b].map(block=>[block.id,bulkAssessmentSignature(block,'post_assessment')]))};applyBulkAssessmentDates(draft);assert.equal(pendingAssessmentDates(a).length,2);assert.equal(pendingAssessmentDates(b).length,2);
pauseRevisionScope('block',a.id,'Break');assert(pendingAssessmentDates(a).every(t=>t.status==='paused'));resumeRevisionScope('block',a.id);assert(pendingAssessmentDates(a).every(t=>live.includes(t.status)));
const first=pendingAssessmentDates(a)[0],second=pendingAssessmentDates(a)[1];completeTaskById(first.id,{completed_date:'2026-09-10',confidence:2,minutes:14});revertRevisionStage(second,'Repeat');let replay=pendingAssessmentDates(a)[0];assert.equal(replay.window_start,'2026-09-20');completeTaskById(replay.id,{completed_date:'2026-09-11',confidence:3,minutes:12});completeTaskById(pendingAssessmentDates(a)[0].id,{completed_date:'2026-09-12',confidence:4,minutes:10});syncAssessmentModes();assert.equal(pendingAssessmentDates(a).length,0,'completion does not generate automatic maintenance');
state.store.sessions.push({id:'old-pre',block_id:a.id,stage:'pre_assessment',completed_on:'2026-09-09',confidence:1,minutes:20},{id:'partial',block_id:a.id,stage:'post_assessment',completed_on:'2026-09-08',stage_completed:false,confidence:5,minutes:99});
assert(maintenanceHistory().some(row=>row.id==='old-pre'));assert(!maintenanceHistory().some(row=>row.id==='partial'));
state.maintenanceDay='2026-09-10';let calendar=maintenanceCalendar();assert(calendar.textContent.includes('2/5'));assert(calendar.textContent.includes('14 min'));assert(calendar.textContent.includes('56 recorded min'));assert(calendar.textContent.includes('September'));
const next=nodes([calendar]).find(n=>n.attrs['aria-label']==='Next history month');next.listeners.click();assert.equal(state.maintenanceMonth,'2026-10');
state.modal={itemType:'block',itemId:a.id};let blockForm=editModal();assert(!nodes(blockForm.fields).some(n=>n._text==='Custom spacing in days'||n._text==='Assessment date'));assert(nodes(blockForm.fields).some(n=>n.textContent==='Edit post-assessment dates'));
// Blank unit mode submission opts into no sessions and has no exam anchor inputs.
fixture();state.modal={unitId:'u'};let modeForm=assessmentModeModal(),selector=nodes(modeForm.fields).find(n=>n.tagName==='SELECT');selector.value='post_assessment';selector.onchange();assert(!nodes(modeForm.fields).some(n=>n._text?.includes('Assessment date')||n._text==='Custom spacing in days'));modeForm.submit();assert.equal(blockAssessmentMode(state.store.blocks[0]),'post_assessment');assert.equal(pendingAssessmentDates(state.store.blocks[0]).length,0);syncAssessmentModes();assert.equal(pendingAssessmentDates(state.store.blocks[0]).length,0);
// History in the mode window includes normal revisions and nested blocks, but no unrelated or partial sessions.
fixture();state.store.blocks.push({id:'outside',name:'Outside',subject_id:'s'});
state.store.sessions.push({id:'normal-history',block_id:'a',stage:'two_week_review',completed_on:'2026-08-15',confidence:2,minutes:17},{id:'nested-history',block_id:'b',stage:'pre_assessment',completed_on:'2026-08-15',confidence:4,minutes:23},{id:'unrelated-history',block_id:'outside',stage:'post_assessment',completed_on:'2026-08-15',confidence:5,minutes:99},{id:'unfinished-history',block_id:'a',stage:'pre_assessment',completed_on:'2026-08-15',stage_completed:false,minutes:77});
state.modal={unitId:'u'};modeForm=assessmentModeModal();selector=nodes(modeForm.fields).find(n=>n.tagName==='SELECT');
let globalRenders=0;render=()=>{globalRenders++};
for(const selectedMode of ['pre_assessment','post_assessment']) {
 selector.value=selectedMode;selector.onchange();
 let historyHost=nodes(modeForm.fields).find(n=>n.className==='revision-history-view');
 assert(historyHost,'both mode choices have a calendar');assert(historyHost.textContent.includes('August'));assert(historyHost.textContent.includes('40 recorded min'));assert(historyHost.textContent.includes('17 min'));assert(historyHost.textContent.includes('23 min'));assert(!historyHost.textContent.includes('99 min'));assert(!historyHost.textContent.includes('77 min'));
 const input=nodes(modeForm.fields).find(n=>n.tagName==='INPUT'&&n.attrs.type==='date');input.value='2099-12-20';input.oninput();
 nodes([historyHost]).find(n=>n.attrs['aria-label']==='Next history month').listeners.click();assert(historyHost.textContent.includes('September'));assert.equal(globalRenders,0,'calendar navigation must not rebuild date drafts');assert.equal(input.value,'2099-12-20');
 nodes([historyHost]).find(n=>n.attrs['aria-label']==='Previous history month').listeners.click();
 nodes([historyHost]).find(n=>n.attrs['aria-label']===formatDate('2026-08-15')+' · 2 completed sessions').listeners.click();assert(historyHost.textContent.includes('17 min'));assert.equal(globalRenders,0);
}
modeForm.submit();assert.equal(pendingAssessmentDates(state.store.blocks[0])[0].window_start,'2099-12-20','the date entered before calendar navigation is saved');
state.modal={blockId:'a',assessmentMode:'post_assessment'};let singleForm=manualAssessmentBlockModal(),singleHistory=nodes(singleForm.fields).find(n=>n.className==='revision-history-view');assert(singleHistory.textContent.includes('17 recorded min'));assert(!singleHistory.textContent.includes('23 min'));
state.assessmentTab='pre_assessment';assert(nodes([Assessment()]).some(n=>n.className==='revision-history-view'),'pre-assessment tab also shows history');
console.log('Scheduling-window history scope, both modes, confidence/time and draft preservation passed');
console.log('Optional post-assessment migration, manual/bulk dates, history calendar, pause, replay and quiet empty schedules passed');
`,context);
