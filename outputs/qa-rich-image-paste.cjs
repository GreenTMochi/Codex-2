const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.SIR_PLAYWRIGHT || 'C:/Users/quain/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({executablePath:process.env.SIR_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 let html=fs.readFileSync(path.join(__dirname,'offline.html'),'utf8');html=html.slice(0,html.indexOf('      window.addEventListener("beforeunload"'))+'\n</script></body></html>';
 await page.route('**/*',route=>route.request().url()==='https://sir.test/'?route.fulfill({contentType:'text/html',body:html}):route.abort());
 await page.goto('https://sir.test/');
 await page.evaluate(()=>{
  state.store={subjects:[{id:'s',name:'Test'}],units:[],blocks:[{id:'b',subject_id:'s',name:'Images',assessment_mode:'pre_assessment'},{id:'other',subject_id:'s',name:'Other'}],tasks:[],sessions:[],usage:[],placements:[{id:'p',block_id:'b',technique_id:'t',category:'procedural',level:'LO',notes:'',preset_managed:false},{id:'other-p',block_id:'other',technique_id:'t',category:'procedural',level:'LO',notes:'Other notes'}],techniques:[{id:'t',name:'Practice',categories:['procedural']}],presets:[],preset_links:[],preset_exclusions:[],piles:[],pile_sessions:[],extra_sessions:[],stage_history:[],notifications:[]};
  state.openBlock={blockId:'b',noteDrafts:{},dirtyKeys:{},openNoteIds:['p']};
  window.drawImageNotes=()=>document.body.replaceChildren(techniqueChip(state.store.placements[0],'procedural','LO'));
  render=window.drawImageNotes;drawImageNotes();
  window.pasteTestImage=async()=>{const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=600;const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,1800,600);c.fillStyle='black';c.font='45px Arial';c.fillText('Retrieval practice: x² + y² = r²',60,100);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),file=new File([blob],'screenshot.png',{type:'image/png'}),data=new DataTransfer();data.items.add(file);const editor=document.querySelector('.rich-editor-area');editor.focus();const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);window.getSelection().removeAllRanges();window.getSelection().addRange(range);editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));};
 });
 await page.evaluate(()=>pasteTestImage());
 await page.waitForFunction(()=>document.querySelector('.rich-editor-area img') && !document.querySelector('.rich-editor-area').hasAttribute('aria-busy'));
 assert.equal(await page.locator('.technique-row').getAttribute('data-has-notes'),'true');
 assert(await page.evaluate(()=>richTextHasContent(state.openBlock.noteDrafts.p)));
 assert.equal(await page.evaluate(()=>state.store.placements[0].notes),'');
 await page.getByRole('button',{name:'Save notes',exact:true}).click();
 assert(await page.evaluate(()=>state.store.placements[0].notes.includes('data:image/')));
 await page.evaluate(()=>{state.store=JSON.parse(localStorage.getItem(key));state.openBlock={blockId:'b',noteDrafts:{},dirtyKeys:{},openNoteIds:['p']};drawImageNotes();});
 assert.equal(await page.locator('.rich-editor-area img').count(),1);
 assert(await page.evaluate(()=>richTextDisplay(state.store.placements[0].notes).querySelector('img')!==null));
 // Text remains editable beside the image, and sanitized image-only HTML remains content.
 await page.evaluate(()=>{const editor=document.querySelector('.rich-editor-area');editor.focus();const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);});await page.keyboard.type('More practice');
 await page.getByRole('button',{name:'Save notes',exact:true}).click();
 assert(await page.evaluate(()=>richTextPlain(state.store.placements[0].notes).includes('More practice')));
 assert.equal(await page.locator('.rich-editor-area img').count(),1);
 const safe=await page.evaluate(()=>{const src=document.querySelector('img').src,html=sanitizeRichHtml('<img src="'+src+'" onerror="alert(1)" style="position:fixed" srcset="https://evil.test/x"><img src="javascript:alert(1)"><img src="https://evil.test/x"><svg onload="alert(1)"></svg>'),node=document.createElement('div');node.innerHTML=html;return{images:node.querySelectorAll('img').length,attrs:[...node.querySelector('img').attributes].map(a=>a.name),content:richTextHasContent(encodeRichText(html))};});
 assert.equal(safe.images,1);assert.deepEqual(safe.attrs.sort(),['alt','src']);assert(safe.content);
 // Autosave uses the same data path and never writes into another block's notes.
 await page.evaluate(()=>{const settings=appSettings();settings.autosave.technique_notes=true;localStorage.setItem(appSettingsKey,JSON.stringify(settings));drawImageNotes();});
 await page.evaluate(()=>pasteTestImage());await page.waitForFunction(()=>document.querySelectorAll('.rich-editor-area img').length===2&&!document.querySelector('.rich-editor-area').hasAttribute('aria-busy'));
 assert.equal(await page.evaluate(()=>{const n=document.createElement('div');n.innerHTML=decodeRichText(JSON.parse(localStorage.getItem(key)).placements[0].notes);return n.querySelectorAll('img').length;}),2);
 assert.equal(await page.evaluate(()=>state.store.placements[1].notes),'Other notes');
 // Native undo/redo must remain available for the inserted image.
 await page.locator('.rich-editor-area').focus();await page.keyboard.press('Control+z');
 assert.equal(await page.locator('.rich-editor-area img').count(),1);
 await page.keyboard.press('Control+y');assert.equal(await page.locator('.rich-editor-area img').count(),2);
 // A rejected clipboard file leaves existing notes untouched and reports the failure.
 const beforeBad=await page.evaluate(()=>state.store.placements[0].notes);
 await page.evaluate(()=>{const dt=new DataTransfer();dt.items.add(new File(['<svg/>'],'bad.svg',{type:'image/svg+xml'}));document.querySelector('.rich-editor-area').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));});
 await page.waitForFunction(()=>!document.querySelector('.rich-editor-area').hasAttribute('aria-busy'));
 assert.equal(await page.evaluate(()=>state.store.placements[0].notes),beforeBad);assert(await page.locator('.rich-paste-status').isVisible());
 // Images fit narrow screens.
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>[...document.querySelectorAll('.rich-editor-area img')].every(img=>img.getBoundingClientRect().width<=img.parentElement.getBoundingClientRect().width)));
 // Shared pile notes support the same paste/save path.
 await page.evaluate(()=>{state.store.piles=[{id:'pile',name:'Shared',block_ids:['b','other'],technique_id:'t',category:'procedural',level:'LO',window_keys:['all_revisions'],notes:''}];state.openBlock.openNoteIds=['pile:pile'];render=()=>document.body.replaceChildren(pileTechniqueChip(state.store.piles[0],state.store.blocks[0]));render();});
 await page.evaluate(()=>pasteTestImage());await page.waitForFunction(()=>state.store.piles[0].notes.includes('data:image/'));
 assert(await page.evaluate(()=>richTextHasContent(state.store.piles[0].notes)));
 // Browser undo and deletion can remove an inserted image.
 await page.locator('.rich-editor-area').focus();await page.keyboard.press('Control+a');await page.keyboard.press('Backspace');
 assert.equal(await page.evaluate(()=>state.store.piles[0].notes),'');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('Image paste browser checks passed: image-only content, manual/autosave, reopen, text, sanitizer, invalid files, mobile fit, shared notes, undo/redo and deletion.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
