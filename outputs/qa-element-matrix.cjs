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
function button(root,text){return nodes(Array.isArray(root)?root:[root]).find(node=>node.tagName==='BUTTON'&&node.textContent===text);}
function field(root,text){return nodes(root.fields||[root]).find(node=>node.tagName==='LABEL'&&(node._text===text||node.children[0]?.textContent===text))?.children.at(-1);}
state.store={subjects:[{id:'s',name:'Statics'}],units:[{id:'u',subject_id:'s',name:'Beams'},{id:'child',subject_id:'s',parent_unit_id:'u',name:'Cantilevers'}],blocks:[{id:'b',subject_id:'s',unit_id:'child',name:'Reactions'}],tasks:[],sessions:[],usage:[],notifications:[],techniques:[],placements:[],presets:[],preset_links:[],preset_exclusions:[],piles:[],pile_sessions:[],extra_sessions:[],stage_history:[]};
assert(ElementMatrix().textContent.includes('Your first Element Matrix'));
state.modal={type:'matrixMeta'};let editor=matrixModal();field(editor,'Matrix name').value='Beam analysis';editor.submit();const matrix=matrixFind();assert.equal(matrix.name,'Beam analysis');
state.modal={type:'matrixMeta'};editor=matrixModal();assert.equal(editor.title,'Create matrix','Create does not edit selected matrix');
const e=(id,count)=>({id,name:id,settings:Array.from({length:count},(_,i)=>({id:id+i,name:id+' setting '+i}))});matrix.elements=[e('support',2),e('load',3),e('target',3)];
state.modal={type:'matrixSet',matrixId:matrix.id};editor=matrixModal();field(editor,'Set name').value='Set A';editor.submit();const set=matrixSet(matrix);assert.equal(set.name,'Set A');
state.modal={type:'matrixSet',matrixId:matrix.id};assert.equal(matrixModal().title,'Create question set','New set does not rename current set');
for(let i=0;i<3;i++){const suggestion=matrixSuggest(matrix,set.questions);assert(suggestion.route);state.modal={type:'matrixQuestion',matrixId:matrix.id,setId:set.id,suggestedRoute:suggestion.route};editor=matrixModal();field(editor,'Question prompt').value='Find the reactions '+i;field(editor,'Question prompt').oninput();field(editor,'Solution (hidden during practice)').value='Secret solution '+i;field(editor,'Solution (hidden during practice)').oninput();editor.submit();}
let coverage=matrixCoverage(matrix,set.questions);assert.equal(coverage.covered,8);assert.equal(coverage.total,8);assert.equal(coverage.unique,3);assert.equal(coverage.combinations,18n,'individual coverage is separate from combinations');
assert(matrixCoverageView(matrix,set).textContent.includes('before restrictions'));
assert(matrixSetsView(matrix,set).textContent.includes('Find the reactions'));assert(!matrixSetsView(matrix,set).textContent.includes('Secret solution'));
const first=set.questions[0];matrix.rules.push({id:'pair',route:{support:first.route.support,load:first.route.load},reason:'Unstable support and load'});assert(matrixRouteErrors(matrix,first.route).includes('Unstable support and load'));assert.equal(matrixCoverage(matrix,set.questions).invalid,1);assert.throws(()=>matrixStartPractice(matrix,set,true),/Fix incomplete/);
const suggestion=matrixSuggest(matrix,set.questions);assert(suggestion.route);assert.equal(matrixRouteErrors(matrix,suggestion.route).length,0,'suggestions respect forbidden pairs');
matrix.rules=[];const frozen=JSON.stringify(state.store.tasks),practice=matrixStartPractice(matrix,set,true);assert.equal(matrixCanReveal(practice),false);assert.throws(()=>matrixReveal(practice),/Attempt every/);assert(!matrixPracticeView(practice).textContent.includes('Secret solution'),'Full Pass does not render answers early');practice.questions[0].attempted=true;assert(!matrixCanReveal(practice));practice.questions.forEach(question=>question.attempted=true);matrixReveal(practice);assert(matrixPracticeView(practice).textContent.includes('Secret solution'));matrixFinish(practice);assert(practice.finished_at);assert.equal(JSON.stringify(state.store.tasks),frozen,'practice does not advance unrelated SIR revisions');
first.solution='Changed solution';assert.equal(practice.questions[0].solution,'Secret solution 0','practice retains a snapshot');const regular=matrixStartPractice(matrix,set,false);assert(matrixCanReveal(regular));matrixReveal(regular);assert.throws(()=>matrixFinish(regular),/every question/);
// Remove a setting and repair the affected question without changing prior practice.
const removed=matrix.elements[0].settings.shift();assert(matrixRouteErrors(matrix,first.route).length);assert(matrixCoverage(matrix,set.questions).invalid>0);matrix.elements[0].settings.unshift(removed);
const oldElement=matrix.elements.pop();assert(matrixRouteErrors(matrix,first.route).some(message=>message.includes('removed element')));state.modal={type:'matrixQuestion',matrixId:matrix.id,setId:set.id,questionId:first.id};editor=matrixModal();assert(!Object.hasOwn(state.modal.matrixDraft.route,oldElement.id),'editor clears stale element choice');matrix.elements.push(oldElement);
// Exhaustive small constraints and search limits have honest outcomes.
const small={elements:[e('x',2),e('y',2)],sets:[],rules:[{id:'ban',route:{x:'x0'},reason:'Outside scope'}]};let picks=[];for(let i=0;i<2;i++){let next=matrixSuggest(small,picks);assert(next.route);assert.equal(next.route.x,'x1');picks.push({route:next.route});}assert(matrixSuggest(small,picks).error.includes('No unused valid'));assert(matrixSuggest(small,[],1).error.includes('Search limit'));
// Other sets influence suggestions to support rotation.
matrix.sets.push({id:'B',name:'Set B',questions:[]});const other=matrixSuggest(matrix,[]);assert(!set.questions.some(question=>matrixRouteKey(matrix,question.route)===matrixRouteKey(matrix,other.route)));
// Linking a parent unit makes the matrix reachable from nested blocks.
matrix.target_type='unit';matrix.target_id='u';assert(matrixLinkedToBlock(matrix,state.store.blocks[0]));assert(blockMatrixLinks(state.store.blocks[0]).textContent.includes(matrix.name));
const imported=normalizeImportedData(JSON.parse(JSON.stringify(state.store))).store;assert.deepEqual(imported.element_matrices,state.store.element_matrices);assert.deepEqual(imported.matrix_practices,state.store.matrix_practices);
const baseline={store:cloneAccountSnapshot(state.store)},local=cloneAccountSnapshot(baseline),remote=cloneAccountSnapshot(baseline);local.store.element_matrices[0].elements[0].name='Renamed support';remote.store.element_matrices[0].sets[0].questions.push({id:'remote',route:{},prompt:'Remote question'});const merged=mergeAccountSnapshots(baseline,local,remote);assert.equal(merged.store.element_matrices[0].elements[0].name,'Renamed support');assert(merged.store.element_matrices[0].sets[0].questions.some(question=>question.id==='remote'));
state.matrixPracticeId=null;assert(ElementMatrix().textContent.includes('Elements and settings'));state.matrixPracticeId=practice.id;assert(ElementMatrix().textContent.includes('Practice completed'));
// The latest data can be restored from persisted storage without losing the workspace.
matrixSave();assert.equal(loadStore().element_matrices[0].name,matrix.name);

// Dragging changes display order while preserving settings, routes and history.
const originalElements=matrix.elements.map(row=>row.id),sourceElement=matrix.elements[0],lastElement=matrix.elements.at(-1),beforeRoutes=JSON.stringify(matrix.sets),beforePractice=JSON.stringify(matrixPractices());
assert(matrixReorder(matrix.id,'element',sourceElement.id,sourceElement.id,lastElement.id,true));assert.equal(matrix.elements.at(-1).id,sourceElement.id);assert.deepEqual(matrix.elements.map(row=>row.id).sort(),[...originalElements].sort());assert.equal(JSON.stringify(matrix.sets),beforeRoutes);assert.equal(JSON.stringify(matrixPractices()),beforePractice);
assert.equal(matrixReorder(matrix.id,'element',sourceElement.id,sourceElement.id,sourceElement.id),false);assert.equal(matrixReorder(matrix.id,'element',sourceElement.id,'missing',lastElement.id),false);
const settings=sourceElement.settings,firstSetting=settings[0],lastSetting=settings.at(-1);assert(matrixReorder(matrix.id,'setting',sourceElement.id,firstSetting.id,lastSetting.id,true));assert.equal(settings.at(-1).id,firstSetting.id);assert.equal(matrixReorder(matrix.id,'setting',lastElement.id,firstSetting.id,lastSetting.id),false,'cannot move a setting into another element');


document.querySelectorAll=()=>[];document.querySelector=()=>({focus(){}});
const handle=matrixDragHandle(matrix,'element',sourceElement),dropTarget=matrix.elements[0];let payload;
handle.listeners.dragstart({stopPropagation(){},dataTransfer:{setData(type,value){payload=JSON.parse(value);}},currentTarget:{closest(){return null;}},clientX:0,clientY:0});assert.equal(payload.sourceId,sourceElement.id);
let prevented=false;matrixDropEvents(matrix,'element',dropTarget,dropTarget).ondrop({preventDefault(){prevented=true;},stopPropagation(){},clientX:1,currentTarget:{getBoundingClientRect(){return{left:0,width:100};}}});assert(prevented);assert.equal(matrix.elements[0].id,sourceElement.id);assert.equal(matrixDrag,null);
const builder=matrixBuilder(matrix,set),controls=nodes([builder]).filter(node=>node.tagName==='BUTTON');assert(!controls.some(node=>['←','→','↑','↓','Remove element','Add setting'].includes(node.textContent)),'builder uses compact icons instead of arrow and text buttons');assert(controls.some(node=>node.attrs['aria-label']?.startsWith('Add setting to ')));assert(controls.some(node=>node.attrs.draggable==='true'));

const secondMatrix={id:'second-matrix',name:'Second matrix',elements:[],rules:[],sets:[]};matrixRows().push(secondMatrix);const beforeCollapse=JSON.stringify(state.store);
matrixSetExpanded(matrix.id,false);let library=ElementMatrix();let summaries=nodes([library]).filter(node=>node.className==='matrix-summary');assert.equal(summaries.length,2);assert(summaries.every(node=>node.attrs['aria-expanded']==='false'));assert(!library.textContent.includes('Elements and settings'),'collapsed rows do not render editors');
summaries[0].listeners.click();assert(matrixIsExpanded(matrix.id));assert(!matrixIsExpanded(secondMatrix.id));assert.equal(JSON.parse(localStorage.getItem(collapsedKey))['matrix:'+matrix.id],false,'expanded state is saved');
matrixSetExpanded(secondMatrix.id,true);assert(!matrixIsExpanded(matrix.id));assert(matrixIsExpanded(secondMatrix.id));assert.equal(JSON.stringify(state.store),beforeCollapse,'collapsing preserves all matrix and practice data');
state.openBlock=null;state.modal=null;openMatrix(matrix.id);assert(matrixIsExpanded(matrix.id));assert.equal(state.page,'Element Matrix');assert(!matrixIsExpanded(secondMatrix.id));
console.log('Element Matrix creation, routes, coverage, restrictions, suggestions, Full Pass, history, linkage, import and sync passed');

`,context);
