'use strict';
const $ = id => document.getElementById(id);
const sources = [];
let working, midi, busy = false;
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
$('connect').onclick=async () => {
  try {
    if (!navigator.requestMIDIAccess) throw Error('Open this app in Microsoft Edge or Chrome.');
    midi=await navigator.requestMIDIAccess({sysex:true});
    midi.onstatechange=ports;
    ports();
    status('Select your MIDI interface input and output.');
  } catch(error) { status('MIDI access failed. '+error.message); }
};
$('input').onchange=$('output').onchange=$('hardware').onchange=controls;
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
$('open').onclick=()=>$('files').click();
$('files').onchange=async event=>{
  const files=Array.from(event.target.files);
  event.target.value='';
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
};
$('sources').onchange=()=>{fillVoices('sourceVoices',source(),0); controls();};
$('workingVoices').onchange=()=> {
  $('name').value=FB.name(working.voices[$('workingVoices').selectedIndex],7);
  controls();
};
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
$('backup').onclick=()=>download(source().original,'FB01-bank-'+(source().slot+1)+'-backup.syx');
$('save').onclick=()=>download(FB.encode(working),'FB01-working-bank.syx');
controls();
