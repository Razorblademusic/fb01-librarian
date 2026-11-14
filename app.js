'use strict';
const $ = id => document.getElementById(id);
const sources = [];
let working, midi, busy = false;
let auditionBusy = false, auditionPending = null, keyboardPort = null;
let activeVoicePanel = 'source', navigatorBank = 0, navigatorPatch = 0, navigatorBusy = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Settings are scoped to the persistent Chrome profile and fixed localhost origin.
const PREF_KEY = 'fb01-librarian-v031-settings'; // Retain key for upgrades
function getPrefs() { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; } }
function savePrefs() {
  const p = getPrefs();
  for (const id of ['input','output','keyboard']) {
    const port = midi && (id === 'output' ? midi.outputs : midi.inputs).get($(id).value);
    if (port) p[id] = {id:port.id, name:port.name};
  }
  p.channel = $('channel').value;
  p.auditionChannel = $('auditionChannel').value;
  p.autoAudition = $('autoAudition').checked;
  localStorage.setItem(PREF_KEY, JSON.stringify(p));
}
function restorePort(id) {
  const wanted = getPrefs()[id];
  if (!wanted) return;
  const list = $(id);
  const match = Array.from(list.options).find(o => o.value === wanted.id) ||
    Array.from(list.options).find(o => o.value && o.text === wanted.name);
  if (match) list.value = match.value;
}
function restorePrefs() {
  const p = getPrefs();
  if (p.channel && /^([1-9]|1[0-6])$/.test(p.channel)) $('channel').value = p.channel;
  if (p.auditionChannel && /^([1-9]|1[0-6])$/.test(p.auditionChannel)) $('auditionChannel').value = p.auditionChannel;
  if (typeof p.autoAudition === 'boolean') $('autoAudition').checked = p.autoAudition;
}
// File System Access handles are structured-cloned into IndexedDB, not localStorage.
const folderDb = () => new Promise((resolve,reject) => {
  const req = indexedDB.open('fb01-librarian-folders',1);
  req.onupgradeneeded = () => req.result.createObjectStore('handles');
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
async function folderHandle(value) {
  const db = await folderDb();
  return new Promise((resolve,reject) => {
    const tx=db.transaction('handles', value ? 'readwrite':'readonly');
    const req=value ? tx.objectStore('handles').put(value,'sysex') : tx.objectStore('handles').get('sysex');
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
    tx.oncomplete=()=>db.close();
  });
}
let sysexFolder = null;
async function chooseFolder() {
  if (!window.showDirectoryPicker) { status('Chrome folder access is unavailable. Use normal Open and Save instead.'); return; }
  try {
    sysexFolder = await showDirectoryPicker({id:'fb01-sysex',mode:'readwrite',startIn:sysexFolder || 'documents'});
    await folderHandle(sysexFolder);
    $('folderLabel').textContent = sysexFolder.name;
    status('Default SysEx folder: '+sysexFolder.name);
  } catch(e) { if(e.name!=='AbortError') status('Folder selection failed: '+e.message); }
}
async function usableFolder(write=false) {
  if (!sysexFolder) return null;
  const mode = write ? 'readwrite':'read';
  if ((await sysexFolder.queryPermission({mode})) === 'granted') return sysexFolder;
  // Only request permission from a direct user click, never during startup.
  if ((await sysexFolder.requestPermission({mode})) === 'granted') return sysexFolder;
  return null;
}
async function openFromFolder() {
  try {
    const folder=await usableFolder(false);
    if (!folder) { $('files').click(); return; }
    const handles=[];
    for await (const [name,handle] of folder.entries())
      if(handle.kind==='file' && /\.syx$/i.test(name)) handles.push(handle);
    handles.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
    if (!handles.length) { status('No .syx files in '+folder.name); return; }
    const dialog=$('sysexDialog'), list=$('sysexFileList');
    list.replaceChildren();
    for (const handle of handles) {
      const option=document.createElement('option');
      option.value=handle.name; option.textContent=handle.name;
      list.append(option);
    }
    $('sysexDialogTitle').textContent='Open SysEx bank from '+folder.name;
    dialog.showModal();
    const result=await new Promise(resolve => {
      const done=()=>{dialog.removeEventListener('close',done);resolve(dialog.returnValue);};
      dialog.addEventListener('close',done,{once:true});
    });
    if(result!=='open') return;
    const handle=handles.find(h=>h.name===list.value);
    if(handle) await loadFiles([await handle.getFile()]);
  } catch(e) { status('Folder open failed: '+e.message); }
}
async function saveToFolder(bytes,name) {
  // Chrome's native Windows Save As dialog permits browsing any drive/folder.
  // The picker remembers its previous directory under this stable id.
  if (window.showSaveFilePicker) {
    try {
      const opts = {
        id:'fb01-save-sysex',
        suggestedName:name,
        types:[{description:'Yamaha SysEx bank (*.syx)',accept:{'application/octet-stream':['.syx']}}],
        excludeAcceptAllOption:true
      };
      if (sysexFolder) opts.startIn=sysexFolder;
      let handle;
      try { handle=await window.showSaveFilePicker(opts); }
      catch(e) {
        // A remembered folder may have become unavailable; retry without it.
        if (e.name !== 'TypeError' || !opts.startIn) throw e;
        delete opts.startIn;
        handle=await window.showSaveFilePicker(opts);
      }
      const stream=await handle.createWritable();
      await stream.write(bytes);
      await stream.close();
      status('Saved '+handle.name+' successfully.');
    } catch(e) {
      if (e.name!=='AbortError') status('Save failed: '+e.message);
    }
    return;
  }
  // Fallback for browsers without File System Access support.
  download(bytes,name);
  status('Downloaded '+name+' (choose the destination in browser download settings).');
}
async function initializeSettings() {
  restorePrefs();
  try { sysexFolder=await folderHandle(); if(sysexFolder) $('folderLabel').textContent=sysexFolder.name; }
  catch(e) { status('Saved folder unavailable: '+e.message); }
}

const status = message => { $('status').textContent = message; };
const source = () => sources[$('sources').selectedIndex];
const slot = () => $('hardware').selectedIndex;
const channel = () => {
  const value = Number($('channel').value);
  if (!Number.isInteger(value) || value < 1 || value > 16) throw Error('Enter a system channel from 1 to 16.');
  return value - 1;
};
for (let i=0;i<7;i++) $('hardware').add(new Option('Bank '+(i+1)+(i<2?' (RAM)':' (factory)'), i));

function fillVoices(id, bank, selected) {
  const list = $(id);
  list.replaceChildren();
  bank?.voices.forEach((voice,i) => list.add(new Option(
    String(i+1).padStart(2,'0')+'  '+(FB.name(voice,7) || '(unnamed)'),i)));
  list.selectedIndex = bank ? Math.max(0,selected) : -1;
}
function controls() {
  const selected = $('workingVoices').selectedIndex;
  const enabled = {
    request:!busy && $('input').value && $('output').value,
    listen:!busy && $('input').value,
    send:!busy && working && slot()<2 && $('input').value && $('output').value,
    connect:!busy && !midi, clone:source(), backup:source(), copy:source() && working,
    rename:working, up:selected>0, down:selected>=0 && selected<47, save:working
  };
  enabled.audition = !busy && !auditionBusy && !!(activeVoicePanel === 'working' ? working : source()) && !!$('output').value;
  for (const id of ['navBankPrev','navBankNext','navPatchPrev','navPatchNext']) $(id).disabled = !midi || busy || auditionBusy || navigatorBusy || !$('output').value;
  enabled.panic = !!midi && !!$('output').value;
  for (const [id,on] of Object.entries(enabled)) $(id).disabled = !on;
}
function workingList(index=0) {
  fillVoices('workingVoices', working, index);
  $('name').value = working ? FB.name(working.voices[index],7) : '';
  controls();
}
function addSource(bank, label) {
  sources.push(bank);
  $('sources').add(new Option(label+' · '+(FB.name(bank.header,8)||'Unnamed bank')));
  $('sources').selectedIndex = sources.length-1;
  fillVoices('sourceVoices',bank,0);
  controls();
  if ($('autoAudition').checked && midi) queueAudition();
}
function download(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], {type:'application/octet-stream'}));
  const link = document.createElement('a');
  link.href=url;
  link.download=filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ports() {
  for (const [id, devices] of [['input',midi.inputs],['output',midi.outputs]]) {
    const list=$(id), previous=list.value;
    list.replaceChildren(new Option('Select a port',''));
    for (const port of devices.values()) {
      if (port.state === 'connected') list.add(new Option(port.name || port.id,port.id));
    }
    list.value=previous || 'missing';
    if (list.selectedIndex<0) list.selectedIndex=list.options.length===2 ? 1 : 0;
  }
  restorePort('input'); restorePort('output');
  keyboardPorts();
  controls();
}
const request = (ch,bank) => [240,67,117,ch,32,0,bank,247];
function exchange(input, send, select, seconds=20) {
  return new Promise((resolve,reject) => {
    const timer=setTimeout(() => finish(null,Error('No matching response. Check MIDI ports, cabling and the FB-01 system channel.')),seconds*1000);
    const receive=event => {
      try {
        const result=select(event.data);
        if (result !== undefined) finish(result);
      } catch(error) { finish(null,error); }
    };
    function finish(result,error) {
      clearTimeout(timer);
      input.removeEventListener('midimessage',receive);
      if(error) reject(error); else resolve(result);
    }
    input.addEventListener('midimessage',receive);
    try { send(); } catch(error) { finish(null,error); }
  });
}
function incoming(data, ch, bank) {
  if (data[0]!==240 || data[1]!==67 || data.length<6000) return;
  const decoded=FB.decode(data);
  if (ch===undefined || (ch===decoded.channel && bank===decoded.slot)) return decoded;
}
async function transfer(action) {
  busy=true;
  controls();
  const input=midi.inputs.get($('input').value);
  const output=midi.outputs.get($('output').value);
  try {
    await input.open();
    await action(input,output);
  } catch(error) { status(error.message); }
  finally {
    try { await input.close(); } catch {}
    try { await output?.close(); } catch {}
    busy=false;
    controls();
  }
}

// Audition edits the selected instrument's volatile voice buffer only. No STORE or bank write.
function auditionMidiChannel() {
  const value = Number($('auditionChannel').value);
  if (!Number.isInteger(value) || value < 1 || value > 16) throw Error('Audition MIDI channel must be 1–16.');
  return value - 1;
}
function keyboardPorts() {
  const list = $('keyboard'), previous = list.value;
  list.replaceChildren(new Option('Select USB keyboard', ''));
  if (!midi) return;
  for (const port of midi.inputs.values()) {
    if (port.state === 'connected') list.add(new Option(port.name || port.id, port.id));
  }
  list.value = previous;
  if (list.selectedIndex < 0) list.selectedIndex = 0;
  restorePort('keyboard');
  attachKeyboard();
}
function attachKeyboard() {
  if (keyboardPort) keyboardPort.removeEventListener('midimessage', forwardKeyboard);
  keyboardPort = midi?.inputs.get($('keyboard').value) || null;
  if (keyboardPort) keyboardPort.addEventListener('midimessage', forwardKeyboard);
}
function forwardKeyboard(event) {
  const output = midi?.outputs.get($('output').value);
  if (!output || busy || auditionBusy) return;
  const bytes = event.data;
  if (!bytes?.length || bytes[0] < 0x80 || bytes[0] >= 0xf0) return;
  // Channel voice messages only: note, aftertouch, CC, program change, bend.
  // Program change is excluded: it would replace the auditioned sound.
  const type = bytes[0] & 0xf0;
  if (type === 0xc0) return;
  try { output.send([type | auditionMidiChannel(), ...bytes.slice(1)]); }
  catch (error) { status('Keyboard MIDI error: ' + error.message); }
}
function allNotesOff() {
  const output = midi?.outputs.get($('output').value);
  if (!output) return;
  const ch = auditionMidiChannel();
  output.send([0xb0 | ch, 64, 0]); // sustain off
  output.send([0xb0 | ch, 123, 0]); // all notes off
  output.send([0xb0 | ch, 120, 0]); // all sound off
}
async function auditionVoice(bank, index) {
  if (!bank || index < 0 || index >= 48 || !midi) return;
  const output = midi.outputs.get($('output').value);
  if (!output) { status('Select a MIDI output connected to FB-01 MIDI IN.'); return; }
  const voice = bank.voices[index];
  if (!voice || voice.length !== 64) { status('Invalid voice data.'); return; }
  auditionBusy = true;
  controls();
  try {
    const sys = channel();
    const ch = auditionMidiChannel();
    await output.open();
    allNotesOff();
    status('Loading ' + (FB.name(voice,7) || 'voice') + ' into FB-01 instrument 1 edit buffer…');
    // FB-01 instrument-specific voice parameter changes: F0 43 75 0s 18+i 40+offset loNib hiNib F7.
    // This edits the active buffer, never issues a store-to-RAM operation.
    for (let i = 0; i < 64; i++) {
      const value = voice[i];
      output.send([0xf0,0x43,0x75,sys,0x18,0x40+i,value&15,value>>4,0xf7]);
      await sleep(12); // gentle pacing for 1980s hardware
    }
    status('Audition ready: ' + (FB.name(voice,7) || '(unnamed)') + '. Play your USB keyboard on MIDI channel ' + (ch+1) + '.');
  } catch(error) { status('Audition failed: '+error.message); }
  finally {
    auditionBusy = false;
    controls();
    if (auditionPending) {
      const next = auditionPending;
      auditionPending = null;
      if (next.bank === (next.panel === 'working' ? working : source()) && next.index === $(next.panel === 'working' ? 'workingVoices' : 'sourceVoices').selectedIndex) auditionVoice(next.bank,next.index);
    }
  }
}
function queueAudition(panel = activeVoicePanel) {
  const bank = panel === 'working' ? working : source(), index = $(panel === 'working' ? 'workingVoices' : 'sourceVoices').selectedIndex;
  if (!bank || index < 0) return;
  if (auditionBusy) { auditionPending = {bank,index,panel}; return; }
  auditionVoice(bank,index);
}
$('keyboard').onchange = () => { attachKeyboard(); savePrefs(); };
for (const id of ['auditionChannel','channel','autoAudition']) $(id).addEventListener('change',savePrefs);
$('folder').onclick = chooseFolder;
$('audition').onclick = () => queueAudition();
$('panic').onclick = () => { try { allNotesOff(); status('All notes off sent.'); } catch(error) { status(error.message); } };
$('sourceVoices').onchange = () => { activeVoicePanel='source'; controls(); if ($('autoAudition').checked) queueAudition('source'); };
$('sourceVoices').addEventListener('focus', () => { activeVoicePanel='source'; controls(); });

async function enableMidi() {
  try {
    if (!navigator.requestMIDIAccess) throw Error('Open this app in Microsoft Edge or Chrome.');
    midi=await navigator.requestMIDIAccess({sysex:true});
    midi.onstatechange=ports;
    ports();
    status('MIDI connected. Previous device selections restored where available.');
  } catch(error) { status('MIDI access unavailable: '+error.message+'. Click Enable MIDI to retry.'); }
}
$('connect').onclick=enableMidi;
$('input').onchange=$('output').onchange=()=>{savePrefs();controls();};
$('hardware').onchange=controls;
$('request').onclick=() => transfer(async (input,output) => {
  const ch=channel(), bank=slot();
  await output.open();
  status('Requesting bank '+(bank+1)+'…');
  const received=await exchange(input,()=>output.send(request(ch,bank)),data=>incoming(data,ch,bank));
  addSource(received,'Hardware bank '+(bank+1));
  status('Received 48 voices. Choose Save original .syx to back up this bank.');
});
$('listen').onclick=() => transfer(async input => {
  status('Waiting for an FB-01 front-panel bank dump (30 seconds)…');
  const received=await exchange(input,()=>{},data=>incoming(data),30);
  addSource(received,'Panel dump');
  status('Received 48 voices. Choose Save original .syx to back up this bank.');
});
$('send').onclick=() => {
  let ch;
  try { ch=channel(); } catch(error) { status(error.message); return; }
  const bank=slot();
  if (bank>1 || !confirm('Overwrite all 48 voices in FB-01 RAM bank '+(bank+1)+'? Confirm only after backing it up and switching Memory Protect off on the FB-01.')) return;
  const bytes=FB.encode(working,ch,bank);
  transfer(async (input,output) => {
    await output.open();
    status('Sending 48 voices to RAM bank '+(bank+1)+'…');
    try {
      await exchange(input,()=>output.send(bytes),data=>{
        if (data.length!==5 || data[0]!==240 || data[1]!==67 || data[2] !== (96|ch) || data[4]!==247) return;
        if(data[3]===2) return true;
        if(data[3]===3 || data[3]===4) throw Error('The FB-01 rejected the transfer. Check Memory Protect and the target bank.');
      },12);
    } catch(error) {
      throw Error('Write unverified. '+error.message+' Request the destination bank to check its contents before retrying.');
    }
    status('The FB-01 acknowledged the write to RAM bank '+(bank+1)+'.');
  });
};
$('open').onclick=()=>sysexFolder ? openFromFolder() : $('files').click();
$('files').onchange=async event=>{
  const files=Array.from(event.target.files);
  event.target.value='';
  await loadFiles(files);
};
async function loadFiles(files) {
  let loaded=0;
  const errors=[];
  for (const file of files) {
    try {
      if(file.size>16*1024*1024) throw Error('File exceeds 16 MB.');
      const bytes=new Uint8Array(await file.arrayBuffer());
      let start=-1, count=0;
      bytes.forEach((byte,i)=>{
        if(byte===240) start=i;
        if(byte!==247 || start<0) return;
        const data=bytes.slice(start,i+1);
        start=-1;
        if(data[1]!==67 || (data[2]!==117 && data[3]!==12) || data.length<6000) return;
        try { addSource(FB.decode(data),file.name); loaded++; count++; }
        catch(error) { errors.push(file.name+' · '+error.message); }
      });
      if(!count) errors.push(file.name+' · no valid FB-01 bank found.');
    } catch(error) { errors.push(file.name+' · '+error.message); }
  }
  status('Opened '+loaded+' bank(s). '+errors.join(' '));
}
$('sources').onchange=()=>{fillVoices('sourceVoices',source(),0); controls(); if ($('autoAudition').checked) queueAudition();};
$('workingVoices').onchange=()=> {
  activeVoicePanel='working';
  if ($('autoAudition').checked) queueAudition('working');
  $('name').value=FB.name(working.voices[$('workingVoices').selectedIndex],7);
  controls();
};
$('workingVoices').addEventListener('focus', () => { activeVoicePanel='working'; controls(); });
$('clone').onclick=()=>{
  if(working && !confirm('Replace the working bank? Save it first if you want to keep it.')) return;
  const bank=source();
  working={...bank, header:bank.header.slice(), voices:bank.voices.map(voice=>voice.slice())};
  workingList();
};
$('copy').onclick=()=>{
  const index=$('workingVoices').selectedIndex;
  working.voices[index]=source().voices[$('sourceVoices').selectedIndex].slice();
  workingList(index);
};
$('rename').onclick=()=>{
  const name=$('name').value.trim();
  if(!/^[ -~]{1,7}$/.test(name)) {status('Enter 1–7 printable ASCII characters.'); return;}
  const index=$('workingVoices').selectedIndex;
  working.voices[index].set(Array.from(name.padEnd(7),letter=>letter.charCodeAt(0)));
  workingList(index);
};
for(const [id,step] of [['up',-1],['down',1]]) $(id).onclick=()=>{
  const index=$('workingVoices').selectedIndex, next=index+step;
  [working.voices[index],working.voices[next]]=[working.voices[next],working.voices[index]];
  workingList(next);
};
$('backup').onclick=()=>saveToFolder(source().original,'FB01-bank-'+(source().slot+1)+'-backup.syx');
$('save').onclick=()=>saveToFolder(FB.encode(working),'FB01-working-bank.syx');

// Hardware navigator: volatile instrument-1 bank/voice selection only.
// FB-01 configuration parameter 04 selects bank (0..6); parameter 05 selects voice (0..47).
// This is separate from the SysEx bank dump selector and never stores RAM data.
function navigatorLabel() {
  const found = sources.find(b => b.slot === navigatorBank);
  const voice = found?.voices?.[navigatorPatch];
  $('navBankValue').textContent = `${navigatorBank+1} / 7`;
  $('navPatchValue').textContent = `${navigatorPatch+1} / 48`;
  $('navVoiceName').textContent = voice ? FB.name(voice,7) || '(unnamed)' : 'Voice name unavailable';
}
async function navigateHardware(bankDelta, patchDelta) {
  if (!midi || busy || auditionBusy || navigatorBusy) return;
  const output = midi.outputs.get($('output').value);
  if (!output) { status('Select FB-01 MIDI output first.'); return; }
  const nextBank = Math.max(0,Math.min(6,navigatorBank+bankDelta));
  const nextPatch = Math.max(0,Math.min(47,navigatorPatch+patchDelta));
  if (nextBank === navigatorBank && nextPatch === navigatorPatch) return;
  navigatorBusy=true; controls();
  try {
    await output.open();
    allNotesOff();
    const ch = auditionMidiChannel();
    // Channel-specific configuration messages (Yamaha FB-01 MIDI specification).
    if (nextBank !== navigatorBank) output.send([0xf0,0x43,0x10|ch,0x15,0x04,nextBank,0xf7]);
    // Select voice explicitly, including after a bank change.
    output.send([0xf0,0x43,0x10|ch,0x15,0x05,nextPatch,0xf7]);
    navigatorBank=nextBank; navigatorPatch=nextPatch;
    navigatorLabel();
    status(`Hardware navigator: bank ${nextBank+1}, patch ${nextPatch+1}. Play your USB keyboard.`);
  } catch(error) { status('Hardware navigation failed: '+error.message); }
  finally { navigatorBusy=false; controls(); }
}
for (const [id,db,dp] of [['navBankPrev',-1,0],['navBankNext',1,0],['navPatchPrev',0,-1],['navPatchNext',0,1]]) {
  $(id).onclick=()=>navigateHardware(db,dp);
}
$('hardwareNavigator').addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const moves = {ArrowUp:[1,0],ArrowDown:[-1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};
  const move=moves[event.key];
  if (!move) return;
  event.preventDefault();
  navigateHardware(...move);
});
navigatorLabel();

controls();

// Restore stored preferences before attempting MIDI access. Chrome may require a
// user gesture for its initial SysEx permission; the Enable MIDI button remains.
initializeSettings().then(() => enableMidi());
