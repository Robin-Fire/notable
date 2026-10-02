const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const tempRoot = path.resolve(os.tmpdir())
const profile = fs.mkdtempSync(path.join(tempRoot, 'notiert-taxonomy-smoke-'))
const output = path.resolve(__dirname, '../tests/.visual')
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ firstRunComplete: true, shortcutEnabled: false, closeToTray: false, captureProtection: false, theme: 'light' }))
app.setPath('userData', profile)
app.commandLine.appendSwitch('disable-gpu')
require('../out/main/index.js')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
app.whenReady().then(async () => {
  let window
  for (let i=0;i<60;i++) {
    window=BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().endsWith('/index.html'))
    if(window&&await window.webContents.executeJavaScript('Boolean(document.querySelector(".sidebar"))'))break
    await wait(100)
  }
  if(!window)throw Error('Notes window did not load')
  window.setSize(1180,800)
  const evaluate=code=>window.webContents.executeJavaScript(code)
  const errors=[]
  window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message)})
  const seeded=await evaluate(`(async()=>{
    const category=await window.notiert.notes.createCategory('Work');if(!category.ok)throw Error(category.message);
    const other=await window.notiert.notes.createCategory('Personal');
    const sub=await window.notiert.notes.createSubcategory({name:'Project Alpha',categoryId:category.value.id});if(!sub.ok)throw Error(sub.message);
    const task=await window.notiert.planner.createTask({body:'Screenshot context',categoryId:category.value.id,subcategoryId:sub.value.id,tags:['waiting','follow-up'],placement:{kind:'backlog'}});if(!task.ok)throw Error(task.message);
    return {category:category.value,other:other.value,sub:sub.value,task:task.value};
  })()`)
  await wait(350)
  await evaluate(`[...document.querySelectorAll('.note-row-open')].find(button=>button.textContent.includes('Screenshot context')).click()`)
  await wait(200)
  await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Edit item').click()`)
  await wait(150)
  await evaluate(`(()=>{
    const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl8n+QAAAAASUVORK5CYII=';
    const bytes=Uint8Array.from(atob(png),value=>value.charCodeAt(0));
    const transfer=new DataTransfer();transfer.items.add(new File([bytes],'snip.png',{type:'image/png'}));
    document.querySelector('.note-editor').dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));
  })()`)
  await wait(200)
  assert.equal(await evaluate(`document.querySelectorAll('.attachment-thumbnail').length`),1)
  const screenshot=async name=>{
    const html=await evaluate(`(()=>{const clone=document.documentElement.cloneNode(true);const selects=clone.querySelectorAll('select');document.querySelectorAll('select').forEach((live,index)=>{[...selects[index].options].forEach((option,position)=>{if(live.options[position].selected)option.setAttribute('selected','selected');else option.removeAttribute('selected')})});const areas=clone.querySelectorAll('textarea');document.querySelectorAll('textarea').forEach((live,index)=>{areas[index].textContent=live.value});return clone.outerHTML})()` )
    const file=path.join(profile,'snapshot.html'),base=pathToFileURL(path.resolve(__dirname,'../out/renderer/index.html')).href
    fs.writeFileSync(file,html.replace('<head>',`<head><base href="${base}">`))
    const preview=new BrowserWindow({width:1180,height:800,show:false,webPreferences:{offscreen:true,javascript:false}})
    try{await preview.loadFile(file);await wait(350);fs.writeFileSync(path.join(output,name),(await preview.webContents.capturePage()).toPNG())}finally{preview.destroy()}
  }
  await screenshot('taxonomy-editor-light.png')
  await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Save').click()`)
  await wait(200)
  let saved=await evaluate(`window.notiert.notes.get(${JSON.stringify(seeded.task.id)})`)
  assert.equal(saved.ok,true);assert.equal(saved.value.images.length,1);assert.equal(saved.value.subcategoryId,seeded.sub.id);assert.deepEqual(new Set(saved.value.tags),new Set(['waiting','follow-up']))
  const image=await evaluate(`window.notiert.notes.image(${JSON.stringify(saved.value.images[0].id)})`);assert.equal(image.ok,true)
  assert.equal(await evaluate(`document.querySelectorAll('.note-row input[type="checkbox"]').length`),1)
  await screenshot('taxonomy-all-items-light.png')
  await evaluate(`[...document.querySelectorAll('.side-nav button')].find(button=>button.textContent.trim().startsWith('Backlog')).click()`)
  await wait(300)
  assert.equal(await evaluate(`document.querySelectorAll('.backlog-category-filters button').length>=2`),true)
  await screenshot('taxonomy-backlog-light.png')
  await evaluate(`document.querySelector('[aria-label="Tag filter for Work: All tags"]').click()`)
  await wait(250)
  await screenshot('taxonomy-tag-filter-light.png')
  await evaluate(`window.notiert.settings.update({theme:'dark'})`)
  await wait(250)
  await screenshot('taxonomy-tag-filter-dark.png')
  await evaluate(`window.notiert.settings.update({theme:'light'})`)
  await wait(150)
  await evaluate(`document.querySelector('[aria-label="Tag filter for Work: All tags"]').click()`)
  await wait(150)
  await evaluate(`[...document.querySelectorAll('.backlog-task-title')].find(button=>button.textContent.includes('Screenshot context')).click()`)
  await wait(200)
  assert.equal(await evaluate(`document.querySelector('[aria-label="Item subcategory"]').value`),seeded.sub.id)
  await evaluate(`(()=>{const select=document.querySelector('[aria-label="Item category"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(seeded.other.id)});select.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  await wait(100)
  assert.equal(await evaluate(`document.querySelector('[aria-label="Item subcategory"]').value`),'')
  await evaluate(`[...document.querySelectorAll('.task-detail-actions button')].find(button=>button.textContent.trim()==='Save').click()`)
  await wait(200)
  saved=await evaluate(`window.notiert.notes.get(${JSON.stringify(seeded.task.id)})`)
  assert.equal(saved.value.categoryId,seeded.other.id);assert.equal(saved.value.subcategoryId,null);assert.equal(saved.value.images.length,1);assert.deepEqual(new Set(saved.value.tags),new Set(['waiting','follow-up']))
  await evaluate(`window.notiert.notes.setCategory({id:${JSON.stringify(seeded.task.id)},categoryId:${JSON.stringify(seeded.category.id)},subcategoryId:${JSON.stringify(seeded.sub.id)}})`)
  await evaluate(`window.notiert.planner.createTask({body:'Later screenshot follow-up',categoryId:${JSON.stringify(seeded.category.id)},tags:['follow-up'],placement:{kind:'later'}})`)
  await evaluate(`[...document.querySelectorAll('.side-nav button')].find(button=>button.textContent.trim()==='Later').click()`)
  await wait(300)
  await screenshot('taxonomy-later-light.png')
  await evaluate(`window.notiert.windows.openCapture()`)
  await wait(250)
  const capture=BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().endsWith('/capture.html'))
  assert.ok(capture)
  const draft=await capture.webContents.executeJavaScript(`window.notiert.capture.updateDraft({body:'Draft with subcategory',generation:0,revision:1,categoryId:${JSON.stringify(seeded.category.id)},subcategoryId:${JSON.stringify(seeded.sub.id)}})`)
  assert.equal(draft.ok,true)
  const state=await capture.webContents.executeJavaScript('window.notiert.capture.getState()')
  assert.equal(state.value.subcategoryId,seeded.sub.id)
  capture.hide();await wait(150)
  await window.reload();await wait(500)
  const persisted=await window.webContents.executeJavaScript(`window.notiert.notes.get(${JSON.stringify(seeded.task.id)})`)
  assert.equal(persisted.value.subcategoryId,seeded.sub.id);assert.equal(persisted.value.images.length,1)
  assert.equal(errors.length,0,errors.join('\n'))
  process.stdout.write('taxonomy_ipc=ok note_image_paste=ok task_category_move=ok independent_tags=ok capture_draft=ok restart=ok screenshots=tests/.visual\n')
  app.exit(0)
}).catch(error=>{process.stderr.write(`${error.stack??error}\n`);app.exit(1)})
app.on('quit',()=>{const target=path.resolve(profile);if(path.dirname(target)!==tempRoot||!path.basename(target).startsWith('notiert-taxonomy-smoke-'))return;try{fs.rmSync(target,{recursive:true,force:true})}catch{}})
