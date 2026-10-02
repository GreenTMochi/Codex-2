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

function nodes(fields){return fields.filter(Boolean).flatMap(node=>[node,...nodes(node.children||[])]);}
const findButton=(root,text)=>nodes([root]).find(n=>n.tagName==='BUTTON'&&n.textContent===text);
state.store={notebook:'',subjects:[{id:'s',name:'Math'}],units:[{id:'u',subject_id:'s',name:'Exam unit',assessment_mode:'pre_assessment',manual_pre_assessment:true},{id:'p',subject_id:'s',name:'After exam',assessment_mode:'post_assessment'}],blocks:[],tasks:[],sessions:[],usage:[],techniques:[],placements:[],presets:[],preset_links:[],preset_exclusions:[],piles:[],pile_sessions:[],extra_sessions:[],stage_history:[],notifications:[]};
localStorage.setItem(appSettingsKey,JSON.stringify({cycle_start_week:'2026-08-30',cycle_start_phase:0,end_week_start:5,end_week_end:0,timezone:'America/New_York'}));
function addBlock(id,unit,extra={}){const b={id,name:id,subject_id:'s',unit_id:unit,mle_date:'2026-08-31',...extra};state.store.blocks.push(b);['pre_study','mle'].forEach(stage=>state.store.tasks.push({id:id+stage,block_id:id,stage,cycle:1,status:'completed',window_start:'2026-08-31',window_end:'2026-08-31'}));return b;}
function addTask(b,stage,date,status='planned'){const t={id:b.id+stage,block_id:b.id,stage,cycle:1,status,window_start:date,window_end:date};state.store.tasks.push(t);return t;}
const pre=addBlock('Pre dated','u'),empty=addBlock('Pre empty','u'),post=addBlock('Post dated','p'),normal=addBlock('Normal revision','',{assessment_mode:'normal'}),archived=addBlock('Archived pre','u',{archived:true}),paused=addBlock('Paused pre','u'),waiting=addBlock('Waiting pre','u');
writeManualAssessmentDates(pre,[{date:'2099-09-10'}],'u');
addTask(post,'post_assessment','2099-09-11');addTask(normal,'zero_two','2026-09-01');addTask(paused,'pre_assessment','2099-09-12','paused');addTask(waiting,'pre_assessment','2099-09-13','waiting_for_mle');
state.store.tasks.find(t=>t.id===waiting.id+'mle').status='planned';
assert.deepEqual(studyGroups().revisions.map(t=>t.block_id),[normal.id]);
assert.equal(studyGroups().pausedRevisions.length,0);
assert(studyGroups().mles.some(t=>t.block_id===waiting.id),'core preparation stays in Study');
assert.deepEqual(assessmentBlocks('pre_assessment').map(b=>b.id).sort(),[pre.id,empty.id,paused.id,waiting.id].sort());
assert.deepEqual(assessmentBlocks('post_assessment').map(b=>b.id),[post.id]);
state.page='Assessment';let view=Assessment();
assert(view.textContent.includes('Math · Exam unit'));
assert(view.textContent.includes('Needs dates'));
assert(view.textContent.includes('2099'));
assert(view.textContent.includes('waiting for MLE'));
assert(!view.textContent.includes(normal.name));assert(!view.textContent.includes(archived.name));
assert(findButton(view,'Complete '+taskLabel(pendingAssessmentDates(pre)[0])),'future assessment dates can be completed early');
let opened;open=(type,options)=>{opened={type,...options};};render=()=>{};
findButton(assessmentBlockCard(pre,'pre_assessment'),'Revision dates').listeners.click();assert.deepEqual(opened,{type:'assessmentDates',blockId:pre.id,assessmentMode:'pre_assessment'});
findButton(view,'Complete '+taskLabel(pendingAssessmentDates(pre)[0])).listeners.click();assert.equal(opened.type,'complete');
assessmentScheduleButton(post,'post_assessment').listeners.click();assert.deepEqual(opened,{type:'assessmentDates',blockId:post.id,assessmentMode:'post_assessment'});
post.assessment_mode='post_assessment';assessmentScheduleButton(post,'post_assessment').listeners.click();assert.deepEqual(opened,{type:'assessmentDates',blockId:post.id,assessmentMode:'post_assessment'});
findButton(view,'Post-assessment (1)').listeners.click();assert.equal(state.assessmentTab,'post_assessment');assert(Assessment().textContent.includes(post.name));assert(!Assessment().textContent.includes(pre.name));
state.assessmentTab='pre_assessment';startPileSelection();assert.equal(state.page,'Assessment');findButton(pileSelectionBar(),'Select all').listeners.click();assert.deepEqual([...state.pileSelection.selected].sort(),[pre.id,empty.id,paused.id,waiting.id].sort());cancelPileSelection();
state.store.piles.push({id:'full',name:'Exam pass',pile_type:'full_pass',block_ids:[pre.id,empty.id],window_keys:['all_revisions']});assert(Assessment().textContent.includes('Exam pass'),'assessment pile work is accessible');
state.store.extra_sessions.push({id:'extra',block_id:pre.id,name:'Extra exam practice',date:'2099-09-09',status:'planned',position:'before',anchor_stage:'pre_assessment',anchor_cycle:1});
assert.equal(customSessionsForStudySlot(-Infinity,Infinity).length,0,'assessment custom sessions leave Study');assert(findButton(Assessment(),'Complete Custom Session'),'custom work remains available in Assessment');
state.store.extra_sessions[0].status='completed';
const scheduled=pendingAssessmentDates(pre)[0];completeTaskById(scheduled.id,{confidence:3,completion_percent:75,minutes:12,completed_date:'2026-09-08'});
assert.equal(pendingAssessmentDates(pre).length,0);assert(assessmentBlocks('pre_assessment').some(b=>b.id===pre.id));assert(assessmentBlockCard(pre,'pre_assessment').textContent.includes('Needs dates'),'exhausted schedule stays visible');assert.equal(state.store.sessions.at(-1).completion_percent,75);


assert.equal(completedPreAssessmentCount(pre.id),1,'completed revision counts even with 75% context');
const completedHistory=completedAssessmentDateHistory(pre);
assert(completedHistory.textContent.includes(formatDate('2099-09-10')),'original scheduled date remains visible');
assert(completedHistory.textContent.includes('Completed '+formatDate('2026-09-08')),'different actual completion date is visible');
assert(!nodes([completedHistory]).some(node=>['INPUT','BUTTON'].includes(node.tagName)),'history is read-only');
assert(manualAssessmentDateEditor(pre).node.textContent.includes('Completed revisions'));
assert.equal(completedAssessmentDateHistory(empty),null);
state.store.sessions.push({id:'legacy-dates',block_id:empty.id,stage:'pre_assessment',completed_on:'2026-09-07'}, {id:'partial-dates',block_id:empty.id,stage:'pre_assessment',completed_on:'2026-09-06',stage_completed:false});
const legacyHistory=completedAssessmentDateHistory(empty);assert(legacyHistory.textContent.includes(formatDate('2026-09-07')));assert(!legacyHistory.textContent.includes(formatDate('2026-09-06')));
state.store.sessions=state.store.sessions.filter(row=>!['legacy-dates','partial-dates'].includes(row.id));

assert(assessmentBlockCard(pre,'pre_assessment').textContent.includes('Pre-assessment completed: 1'));
assert(assessmentBlockCard(empty,'pre_assessment').textContent.includes('Pre-assessment completed: 0'));
state.store.sessions.push({id:'count-partial',block_id:pre.id,stage:'pre_assessment',stage_completed:false}, {id:'count-other',block_id:pre.id,stage:'post_assessment'}, {id:'count-custom',block_id:pre.id,stage:'extra_session',anchor_stage:'pre_assessment'}, {id:'count-pile',block_id:pre.id,stage:'pre_assessment',pile_session_id:'pile-example',stage_completed:true});
state.store.tasks.push({id:'count-skipped',block_id:pre.id,stage:'pre_assessment',status:'skipped'});
assert.equal(completedPreAssessmentCount(pre.id),2,'pile completion counts once; partial, custom, post-assessment and skipped work do not');
state.store.sessions=state.store.sessions.filter(row=>!row.id.startsWith('count-'));state.store.tasks=state.store.tasks.filter(row=>row.id!=='count-skipped');
assert(assessmentBlockCard(pre,'pre_assessment').textContent.includes('3/5'),'latest saved confidence is visible after all dates finish');
assert(assessmentBlockCard(empty,'pre_assessment').textContent.includes('Confidence: not yet rated'));
state.store.sessions.push({id:'older-rating',block_id:pre.id,stage:'pre_assessment',confidence:1,completed_at:'2020-01-01'}, {id:'unrated-newer',block_id:pre.id,stage:'pre_assessment',confidence:null,completed_at:'2099-01-01'});
assert(assessmentBlockCard(pre,'pre_assessment').textContent.includes('3/5'),'use the latest rated session by date');
const unitHead=root=>nodes([root]).find(n=>n.className==='assessment-unit-head');
let head=unitHead(Assessment());assert.equal(head.attrs['aria-expanded'],'true');
head.listeners.click();let collapsedView=Assessment();head=unitHead(collapsedView);
assert.equal(head.attrs['aria-expanded'],'false');assert(!nodes([collapsedView]).find(n=>n.className==='stack assessment-unit-body'||n.className==='assessment-unit-body').textContent.includes(pre.name));assert(head.textContent.includes('4 blocks'));
assert.equal(JSON.parse(localStorage.getItem(collapsedKey))['assessment-unit:pre_assessment:s:u'],true);
assert(!isCollapsed('unit','u'),'Assessment collapse does not change Subjects');
state.assessmentTab='post_assessment';assert.equal(unitHead(Assessment()).attrs['aria-expanded'],'true');assert(Assessment().textContent.includes(post.name));
state.assessmentTab='pre_assessment';unitHead(Assessment()).listeners.click();assert(Assessment().textContent.includes(pre.name));
const beforeCollapse=JSON.stringify(state.store);unitHead(Assessment()).listeners.click();assert.equal(JSON.stringify(state.store),beforeCollapse,'collapse preserves dates and history');
unitHead(Assessment()).listeners.click();

state.store.sessions.push({id:'low-confidence',block_id:paused.id,stage:'pre_assessment',confidence:1,completed_at:'2099-01-02'}, {id:'high-confidence',block_id:waiting.id,stage:'mle',confidence:5,completed_at:'2099-01-02'});
assert.deepEqual(assessmentBlocks('pre_assessment').map(b=>b.id),[pre.id,paused.id,waiting.id,empty.id],'pre-assessment completion count descends before confidence');
const confidenceView=nodes([Assessment()]).find(n=>n.className==='stack assessment-unit-body'||n.className==='assessment-unit-body').textContent;assert(confidenceView.indexOf(pre.name)<confidenceView.indexOf(paused.name),'unit rendering puts more completed revisions first');
state.store.sessions.push({id:'tie-completion',block_id:paused.id,stage:'pre_assessment',confidence:1,completed_at:'2099-01-03'}, {id:'tie-completion-2',block_id:paused.id,stage:'pre_assessment',confidence:1,completed_at:'2099-01-04'});
assert.equal(completedPreAssessmentCount(paused.id),completedPreAssessmentCount(pre.id));
assert.deepEqual(assessmentBlocks('pre_assessment').map(b=>b.id),[paused.id,pre.id,waiting.id,empty.id],'matching completion counts use lowest confidence first');
state.store.sessions=state.store.sessions.filter(row=>!row.id.startsWith('tie-completion'));
const postLow=addBlock('Post low','p');state.store.sessions.push({id:'post-high',block_id:post.id,stage:'post_assessment',confidence:4,completed_at:'2099-01-02'}, {id:'post-low',block_id:postLow.id,stage:'post_assessment',confidence:2,completed_at:'2099-01-02'});
assert.deepEqual(assessmentBlocks('post_assessment').map(b=>b.id),[postLow.id,post.id],'post-assessment uses the same confidence order');

// Bulk dates append to selected blocks, preserving unrelated work and history.
const bulkBefore=JSON.stringify(state.store), savedHistory=JSON.stringify(state.store.sessions), untouchedPost=JSON.stringify(assessmentTasks(post,'post_assessment'));
let bulkDraft={selected:[pre.id,empty.id,waiting.id,paused.id],dates:[{date:'2099-10-01'},{date:'2099-10-08'}],signatures:Object.fromEntries([pre,empty,waiting,paused].map(b=>[b.id,bulkAssessmentSignature(b)]))};
applyBulkAssessmentDates(bulkDraft);
for(const block of [pre,empty,waiting,paused]) assert(pendingAssessmentDates(block).some(t=>taskScheduledDate(t)==='2099-10-01'));
assert(pendingAssessmentDates(waiting).every(t=>t.status==='waiting_for_mle'));
assert.equal(JSON.stringify(state.store.sessions),savedHistory);assert.equal(JSON.stringify(assessmentTasks(post,'post_assessment')),untouchedPost);
bulkDraft.signatures=Object.fromEntries([pre,empty,waiting,paused].map(b=>[b.id,bulkAssessmentSignature(b)]));
const countBefore=state.store.tasks.length;applyBulkAssessmentDates(bulkDraft);assert.equal(state.store.tasks.length,countBefore,'existing dates are not duplicated');
const beforeInvalid=JSON.stringify(state.store);bulkDraft.dates=[{date:'invalid'}];assert.throws(()=>applyBulkAssessmentDates(bulkDraft),/valid revision date/);assert.equal(JSON.stringify(state.store),beforeInvalid);
bulkDraft.dates=[{date:'2099-10-15'}];bulkDraft.signatures[empty.id]='stale';assert.throws(()=>applyBulkAssessmentDates(bulkDraft),/schedule changed/);assert.equal(JSON.stringify(state.store),beforeInvalid,'all selected blocks validate before any write');
state.store=JSON.parse(bulkBefore);state.modal={type:'bulkAssessmentDates'};
let capturedForm;const originalForm=form;form=(title,fields,submit,options)=>{capturedForm={title,fields,submit,options};return fields;};
bulkAssessmentDatesModal();assert.equal(capturedForm.options.submitText,'Assign dates');
const selectAll=nodes(capturedForm.fields).find(n=>n.tagName==='BUTTON'&&n.textContent==='Select all');selectAll.listeners.click();assert.equal(state.modal.bulkDatesDraft.selected.length,assessmentBlocks('pre_assessment').length);
const dateInput=nodes(capturedForm.fields).find(n=>n.tagName==='INPUT'&&n.attrs.type==='date');dateInput.listeners.input({target:{value:'2099-11-01'}});assert.equal(state.modal.bulkDatesDraft.dates[0].date,'2099-11-01');
bulkAssessmentDatesModal();assert.equal(state.modal.bulkDatesDraft.dates[0].date,'2099-11-01','draft survives error rerender');form=originalForm;
console.log('Bulk assessment date selection, append, deduplication, validation and draft checks passed');

assert.equal(learningFlowView(),null,'flow starts disabled');setLearningFlowEnabled(true);assert.equal(learningFlowSteps().length,1);
let flow=learningFlowView(),flowInput=nodes([flow]).find(n=>n.tagName==='TEXTAREA');flowInput.listeners.input({target:{value:'Preview the test outline'}});addLearningFlowStep();addLearningFlowStep();
assert.equal(learningFlowSteps().length,3);assert.equal(nodes([learningFlowView()]).filter(n=>n.className==='learning-flow-arrow').length,2);
assert.equal(Home().children[0].className,'card stack learning-flow');assert.equal(Study().children[0].className,'card stack learning-flow');
assert(nodes([Home()]).some(n=>n.tagName==='TEXTAREA'&&n.value==='Preview the test outline'));assert(nodes([Study()]).some(n=>n.tagName==='TEXTAREA'&&n.value==='Preview the test outline'));
const savedFlow=JSON.stringify(learningFlowSteps());setLearningFlowEnabled(false);assert.equal(learningFlowView(),null);assert.equal(JSON.stringify(learningFlowSteps()),savedFlow);setLearningFlowEnabled(true);assert.equal(learningFlowSteps().length,3);
const removeFlowStep=nodes([learningFlowView()]).find(n=>n.attrs?.['aria-label']==='Remove learning flow step 2');removeFlowStep.listeners.click();assert.equal(learningFlowSteps().length,2);assert.equal(nodes([learningFlowView()]).filter(n=>n.className==='learning-flow-arrow').length,1);
assert.equal(normalizeImportedData({store:state.store}).store.learning_flow_steps[0].text,'Preview the test outline');
console.log('Learning flow toggle, shared Home/Study edits, arrows, removal and saved data checks passed');
console.log('Assessment completion ordering, confidence tie-breaks and persistent unit collapse passed');
console.log('Assessment page routing, scheduling, future completion, exhausted dates, custom sessions and piles passed');

`,context);
