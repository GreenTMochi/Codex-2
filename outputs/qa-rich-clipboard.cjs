const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.SIR_PLAYWRIGHT || 'C:/Users/quain/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({executablePath:process.env.SIR_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
  const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']}), page=await context.newPage(), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  let html=fs.readFileSync(path.join(__dirname,'offline.html'),'utf8');html=html.slice(0,html.indexOf('      window.addEventListener("beforeunload"'))+'\n</script></body></html>';
  await page.route('**/*',route=>route.request().url()==='https://sir.test/'?route.fulfill({contentType:'text/html',body:html}):route.abort());
  await page.goto('https://sir.test/');
  await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=20;canvas.height=10;
   const fixture='<p><b>Bold phrase</b> <i>Italic</i> <u>Underline</u> <s>Strike</s></p><p><span style="background-color:#f2dfa0">Yellow highlight</span> <a href="https://example.com">Reference</a></p><ul><li>First bullet</li><li>Second bullet</li></ul><ol><li>First number</li><li>Second number</li></ol><div>Line one<br>Line two</div><img src="'+canvas.toDataURL()+'" alt="Diagram">';
   window.sourceNotes=document.createElement('textarea');sourceNotes.value=encodeRichText(fixture);window.originalNotes=sourceNotes.value;window.inputCount=0;sourceNotes.addEventListener('input',()=>inputCount++);
   const sink=document.createElement('div');sink.id='external';sink.contentEditable='true';sink.style='background:white;color:black;min-height:100px';
   const plain=document.createElement('textarea');plain.id='plain';plain.value='Keep  two spaces\nand a second line';
   document.body.replaceChildren(richTextEditor(sourceNotes,'Notebook test'),sink,plain,richTextDisplay(sourceNotes.value));
   window.selectCopySource=(selector='.rich-editor-area',partial=false)=>{const node=document.querySelector(selector),r=document.createRange();node.focus();if(partial){r.setStart(node.firstChild,0);r.setEnd(node.firstChild,4);}else r.selectNodeContents(node);getSelection().removeAllRanges();getSelection().addRange(r);};
  });
  const clipboard=()=>page.evaluate(async()=>{const item=(await navigator.clipboard.read())[0];return {html:await (await item.getType('text/html')).text(),text:await (await item.getType('text/plain')).text()};});
  await page.evaluate(()=>selectCopySource());await page.keyboard.press('Control+c');
  let copied=await clipboard();
  assert.match(copied.html,/<b[^>]*>/);assert.match(copied.html,/font-weight: ?700/);assert.match(copied.html,/<i[^>]*>/);assert.match(copied.html,/<u[^>]*>/);assert.match(copied.html,/<s[^>]*>/);assert.match(copied.html,/background-color: ?#f2dfa0/);assert.match(copied.html,/https:\/\/example.com/);assert.match(copied.html,/data:image\/png/);
  assert(copied.text.includes('• First bullet\n• Second bullet'));assert(copied.text.includes('1. First number\n2. Second number'));assert(copied.text.includes('Line one\nLine two'));assert(!copied.html.includes('rich-editor'));assert(!copied.text.includes('sir-rich'));
  assert.equal(await page.evaluate(()=>sourceNotes.value),await page.evaluate(()=>originalNotes));assert.equal(await page.evaluate(()=>inputCount),0);
  // Real browser paste into an unrelated editor: no SIR code handles this destination.
  await page.evaluate(()=>{const node=document.querySelector('#external');node.focus();const r=document.createRange();r.selectNodeContents(node);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);});await page.keyboard.press('Control+v');
  assert.equal(await page.locator('#external').getByText('Bold phrase',{exact:true}).evaluate(node=>getComputedStyle(node).fontWeight),'700');assert.equal(await page.locator('#external ul li').count(),2);assert.equal(await page.locator('#external ol li').count(),2);assert.equal(await page.locator('#external img').count(),1);assert.equal(await page.locator('#external a').getAttribute('href'),'https://example.com');
  // Partial selection inherits its surrounding formatting, without unselected text.
  await page.evaluate(()=>selectCopySource('.rich-editor-area b',true));await page.keyboard.press('Control+c');copied=await clipboard();assert.equal(copied.text,'Bold');assert.match(copied.html,/<b[^>]*>Bold<\/b>/);assert(!copied.html.includes('phrase'));
  await page.evaluate(()=>selectCopySource('.rich-editor-area span',true));await page.keyboard.press('Control+c');copied=await clipboard();assert.equal(copied.text,'Yell');assert.match(copied.html,/background-color: ?#f2dfa0/);
  await page.evaluate(()=>selectCopySource('.rich-editor-area li',true));await page.keyboard.press('Control+c');copied=await clipboard();assert.equal(copied.text,'• Firs');assert.match(copied.html,/<ul/);
  // Read-only note displays use the same portable format.
  await page.evaluate(()=>selectCopySource('.rich-text-display'));await page.keyboard.press('Control+c');copied=await clipboard();assert(copied.text.includes('Second number'));assert.match(copied.html,/<b[^>]*>/);
  // Cut syncs notes and remains undoable using native browser history.
  await page.evaluate(()=>selectCopySource('.rich-editor-area b',true));await page.keyboard.press('Control+x');copied=await clipboard();assert.equal(copied.text,'Bold');assert(!(await page.locator('.rich-editor-area').innerText()).includes('Bold phrase'));assert(await page.evaluate(()=>inputCount>0));
  await page.keyboard.press('Control+z');assert((await page.locator('.rich-editor-area').innerText()).includes('Bold phrase'));
  // Plain fields retain native whitespace/newline behavior, and don't use a stale editor selection.
  await page.locator('#plain').focus();await page.keyboard.press('Control+a');await page.keyboard.press('Control+c');assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n'),'Keep  two spaces\nand a second line');
  const nested=await page.evaluate(()=>{const node=document.createElement('div');node.innerHTML='<ul><li>Parent<ul><li>Child</li></ul></li><li>Next</li></ul>';const range=document.createRange();range.selectNodeContents(node);return richClipboardPayload(node,range).text;});
  assert.equal(nested,'• Parent\n  • Child\n• Next');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('Rich clipboard browser checks passed: real copy/paste to an independent editor, lists, styles, highlights, links, images, partial selections, read-only notes, cut/autosave and undo, plain text fields.');
 } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
