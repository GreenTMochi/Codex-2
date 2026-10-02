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
state.store={subjects:[{id:'s',name:'Math'}],units:[{id:'u',subject_id:'s',name:'Unit'}],blocks:[{id:'pre-block',subject_id:'s',unit_id:'u',name:'Pre-study smoke block',mle_date:today(),pre_study_date:today()}],tasks:[{id:'pre-task',block_id:'pre-block',stage:'pre_study',status:'due',cycle:1,window_start:today(),window_end:today()}],sessions:[],usage:[],techniques:[],placements:[],presets:[],preset_links:[],preset_exclusions:[],piles:[],pile_sessions:[],extra_sessions:[],notifications:[],stage_history:[]};
state.openBlock=null;state.modal=null;state.pileSelection=null;
function nodes(root){return [root,...(root.children||[]).filter(n=>n.nodeType===1).flatMap(nodes)];}
for(const pageName of ['Home','Study']) {
 state.page=pageName;let root;assert.doesNotThrow(()=>{root=pageName==='Home'?Home():Study()},pageName+' must render with an active pre-study task');
 assert(root.textContent.includes('Pre-study smoke block'));assert(nodes(root).some(n=>n.tagName==='BUTTON'&&n.textContent==='Blueprint'));
}
console.log('Home and Study render with active pre-study and blueprint actions');
`, context);
