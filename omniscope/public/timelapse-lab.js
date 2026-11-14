// OmniScope Time-lapse Lab: SPHEREx multi-epoch movie, stack/subtract, 102 bands, spectra, Gaia/AllWISE overlays.
// Self-contained add-on: nothing in the existing views is modified.
import {parseFits,spectralProject,worldToPixel,outputToWorld} from './sky-engine.js';
import {findMovers} from './mover-finder.js';
const API=(location.hostname.endsWith('github.io')?'https://beaconofunity.com/omniscope/api':location.pathname.startsWith('/omniscope')?'/omniscope/api':'/api');
// To add a new SPHEREx data release, append its IRSA collection name here (archive.js accepts spherex_qrN[_deep]).
const COLLECTIONS=['spherex_dr1','spherex_dr1_deep','spherex_qr3','spherex_qr3_deep']; // DR1 reprocesses QR2 and pairs with QR3 (IRSA, Nov 2026); QR2 omitted to avoid duplicates
const DET=[[.75,1.12],[1.10,1.65],[1.63,2.43],[2.40,3.85],[3.81,4.43],[4.41,5.01]],COL=['#7aa2ff','#5fd4c4','#9be37a','#e9c46a','#f4a261','#e76f51'];
const BANDS=DET.flatMap(([lo,hi],d)=>Array.from({length:17},(_,c)=>{const e=i=>lo*(hi/lo)**(i/17);return {d:d+1,c:c+1,lo:e(c),hi:e(c+1)}}));
const PRESETS=[
 {n:"Barnard's Star",ra:269.45208,dec:4.69339,pm:[-798.6,10328.9],ep:2000},
 {n:'Epsilon Indi B',ra:331.0437,dec:-56.7828,pm:[3966,-2536],ep:2000,q:'eps Ind B'},
 {n:'WISE 0855',ra:133.79513,dec:-7.24515,pm:[-8118,680],ep:2014},
 {n:'RW Aurigae',ra:76.95654,dec:30.40144,q:'RW Aur'},
 {n:'R Draconis',ra:248.1722,dec:66.7547,q:'R Dra'}];
const N=220,$=s=>root.querySelector(s),yr=m=>2000+(m-51544.5)/365.25,iso=m=>new Date((m-40587)*864e5).toISOString().slice(0,10);
let movers=[],root,frames=[],groups=[],k=0,timer=null,field=null,hdr=null,pin=null,target=null,cats={},busy=0,cache=new Map();
const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./timelapse-lab.css',import.meta.url).href;document.head.append(css);
const btn=Object.assign(document.createElement('button'),{id:'tlOpen',textContent:'▶ Time-lapse lab',title:'SPHEREx multi-epoch movie, stacking and spectra'});
root=Object.assign(document.createElement('dialog'),{id:'tlLab'});
root.innerHTML=`<div class="tl-head"><div><span class="tl-o">OMNISCOPE / SPHEREx TIME-LAPSE</span><h2>Watch the sky change.</h2></div><button class="tl-x" aria-label="Close">×</button></div>
<ol class="tl-steps"><li>Choose a target or enter coordinates</li><li>Press ▶ to watch it change</li><li>Click a star to see its spectrum</li></ol><div class="tl-grid"><div class="tl-view"><div class="tl-stage"><canvas id="tlImg" width="${N}" height="${N}"></canvas><canvas id="tlOv" width="${N*2}" height="${N*2}"></canvas><div id="tlBusy" hidden></div><div id="tlEmpty"><b>Nothing loaded yet</b><span>Choose a target like Barnard's Star, or enter coordinates and press “Open sky field”.</span></div></div>
<div class="tl-play"><button id="tlPlay" aria-label="Play or pause time-lapse">▶</button><input id="tlSlide" aria-label="Observation timeline" type="range" min="0" max="0" value="0"><select id="tlFps" aria-label="Playback speed"><option value="1">1 fps</option><option value="3" selected>3 fps</option><option value="8">8 fps</option></select></div>
<div id="tlInfo" class="tl-info" role="status">Pick a target to begin.</div><details class="tl-frame-details"><summary>Observation details</summary><p id="tlFrameSource">Open a field to see its source.</p></details><canvas id="tlSpec" width="520" height="150"></canvas><div id="tlPix" class="tl-info">Click the image to pin a source and see its spectrum.</div></div>
<div class="tl-ctl"><label>Choose a target</label><div class="tl-chips">${PRESETS.map((p,i)=>`<button data-p="${i}">${p.n}</button>`).join('')}</div>
<div class="tl-row"><input id="tlName" placeholder="Name (SIMBAD)"><button id="tlRes">Find</button></div>
<div class="tl-row"><input id="tlRa" type="number" step="any" placeholder="RA °"><input id="tlDec" type="number" step="any" placeholder="Dec °"></div>
<label>Spectral band: all 102 channels (click one)</label><div class="tl-map"><button class="tl-all on" data-b="">All wavelengths</button>${DET.map((_,d)=>`<div class="tl-mrow"><span style="color:${COL[d]}">D${d+1}</span>${BANDS.filter(b=>b.d==d+1).map(b=>`<button data-b="${b.d}-${b.c}" style="--c:${COL[d]}" title="Band ${d*17+b.c} of 102 · ${b.lo.toFixed(2)}–${b.hi.toFixed(2)} μm"></button>`).join('')}</div>`).join('')}</div><div id="tlBandLabel" class="tl-info">All wavelengths (broadband)</div><select id="tlBand" hidden><option value="">All wavelengths</option>${DET.map((_,d)=>`<optgroup label="Detector ${d+1}">${BANDS.filter(b=>b.d==d+1).map(b=>`<option value="${b.d}-${b.c}">D${b.d} ch${b.c} · ${b.lo.toFixed(2)}–${b.hi.toFixed(2)} μm</option>`).join('')}</optgroup>`).join('')}</select><label>Field of view (bigger = follows faster movers)</label><select id="tlFov"><option value=".05">0.05° (3′)</option><option value=".1">0.1°</option><option value=".2" selected>0.2°</option><option value=".4">0.4°</option><option value=".7">0.7° (fast movers)</option></select><button id="tlLoad" class="tl-main">Open sky field</button><label>② How to show them</label><select id="tlMode"><option value="movie">Time-lapse</option><option value="trail">Trail (new on top of old)</option><option value="sum">Running sum</option><option value="first">Subtract: first epoch</option><option value="prev">Subtract: previous epoch</option></select>
<details class="tl-adv"><summary>More options: detector, stacking</summary><label>Detector</label><select id="tlDet"><option value="0">All six (1–5 μm)</option>${DET.map((r,i)=>`<option value="${i+1}"${i==2?' selected':''}>D${i+1} · ${r[0]}–${r[1]} μm</option>`).join('')}</select>

<label>Stack frames</label><select id="tlBin"><option value="0">Each exposure</option><option value="7">Add: 7-day bins</option><option value="30">Add: 30-day bins</option><option value="-1">Add: one per detector</option></select></details>

<div class="tl-checks"><label><input type="checkbox" id="tlGaia">Gaia DR3</label><label><input type="checkbox" id="tlWise">AllWISE</label><label><input type="checkbox" id="tlFlag" checked>Mask flagged</label></div>
<div class="tl-row"><button id="tlLink">Copy share link</button><button id="tlPng">Save frame</button></div>
<p class="tl-note">Real IRSA Level 2 cutouts, registered by their WCS. Detectors are never subtracted from each other. Band edges are nominal; pixels are filtered by their true FITS wavelength. Gaia positions are moved by proper motion to each frame's date.</p></div></div>`;
const actions = document.querySelector('.mission-stage-actions');
if (!actions) document.body.append(btn);
document.body.append(root);
root.addEventListener('close',stop);
root.querySelector('.tl-grid').prepend(root.querySelector('.tl-ctl'));
root.querySelector('.tl-row:has(#tlDec)').after(root.querySelector('#tlLoad'));
const set=(t,e)=>{const i=$('#tlInfo');i.textContent=t;i.classList.toggle('err',!!e)};
btn.onclick=()=>root.showModal();$('.tl-x').onclick=()=>root.close();
async function api(path,asJson=1){const r=await fetch(API+path,{signal:AbortSignal.timeout(70000)});if(!r.ok){let m='Service error '+r.status;try{m=(await r.json()).error||m}catch{}throw Error(m)}return asJson?r.json():r.arrayBuffer()}
async function sia(ra,dec){const out=new Map();await Promise.all(COLLECTIONS.map(async c=>{try{const r=await fetch(API+'/archive?'+new URLSearchParams({ra,dec,collection:c}),{signal:AbortSignal.timeout(12000)});if(!r.ok)return;const d=new DOMParser().parseFromString(await r.text(),'application/xml'),f=[...d.getElementsByTagName('FIELD')].map(x=>x.getAttribute('name'));for(const tr of d.getElementsByTagName('TR')){const o=Object.fromEntries([...tr.getElementsByTagName('TD')].map((td,i)=>[f[i],td.textContent]));if(o.access_url&&Number.isFinite(+o.t_min))out.set(o.access_url,o)}}catch{}}));return [...out.values()].sort((a,b)=>a.t_min-b.t_min)}
async function loadAll(showLatest=false){
 if(busy)return;const ra=$('#tlRa').valueAsNumber,dec=$('#tlDec').valueAsNumber,fov=+$('#tlFov').value;
 if(!Number.isFinite(ra)||ra<0||ra>=360||!Number.isFinite(dec)||Math.abs(dec)>90)return set('Enter RA 0–360° and Dec −90…90°.',1);
 busy=1;$('#tlLoad').disabled=true;stop();frames=[];groups=[];cache.clear();cats={};pin=null;movers=[];renderMovers();$('#tlEmpty').hidden=false;$('#tlSlide').max=0;$('#tlSlide').value=0;overlay();spectrum();field={ra,dec,fov};hdr={CRVAL1:ra,CRVAL2:dec,CRPIX1:(N+1)/2,CRPIX2:(N+1)/2,CDELT1:-fov/(N-1),CDELT2:-fov/(N-1)};
 try{set('Searching the SPHEREx archive…');let rows=await sia(ra,dec);const d=bandSel()?.d || +$('#tlDet').value;if(d)rows=rows.filter(r=>r.energy_bandpassname===`SPHEREx-D${d}`);
  if(!rows.length)throw Error('No SPHEREx observations here for this selection. Try another detector or direction.');
  const MAX=24;if(rows.length>MAX){const all=rows;rows=Array.from({length:MAX},(_,i)=>all[Math.round(i*(all.length-1)/(MAX-1))]);}
  let done=0,lastPublished=0;
  const starters=[rows[0],rows.at(-1),rows[Math.floor(rows.length/3)],rows[Math.floor(rows.length*2/3)]];
  const queue=[...new Set([...starters,...rows])];
  $('#tlBusy').hidden=false;
  $('#tlBusy').textContent='Preparing the first exposures…';
  function publish(){
   const current=groups[k]?.m[0];
   frames.sort((a,b)=>a.t-b.t);
   build(current);
   if(groups.length){$('#tlEmpty').hidden=true;spectrum();}
   lastPublished=frames.length;
  }
  await Promise.all(Array.from({length:4},async()=>{while(queue.length){const r=queue.shift();try{const p=parseFits(await api('/archive?'+new URLSearchParams({ra,dec,file:new URL(r.access_url).pathname,size:Math.min(.8,fov*1.15)}),0)),s=spectralProject(p,ra,dec,fov,N);frames.push({t:+r.t_min,det:+String(r.energy_bandpassname).slice(-1),v:s.values,w:s.wavelength,f:s.flags,url:r.access_url,date:p.h['DATE-AVG']||iso(+r.t_min)})}catch(e){console.warn(e)}done++;
   if(frames.length>lastPublished&&(groups.length<2||frames.length-lastPublished>=4))publish();
   $('#tlBusy').textContent=`Loading exposures ${done}/${rows.length}`}}));
  $('#tlBusy').hidden=true;if(!frames.length)throw Error('Could not read any cutouts. Retry in a moment.');
  publish();if(showLatest&&!timer&&groups.length){k=groups.length-1;draw();}fetchCats();if(!groups.length)set('No usable pixels for this wavelength. Try a wider range.',1)}
 catch(e){set(e.message,1);$('#tlBusy').hidden=true}finally{busy=0;$('#tlLoad').disabled=false}}
async function fetchCats(){const r=field.fov*.75;for(const s of ['gaia','wise'])api(`/catalog?src=${s}&ra=${field.ra}&dec=${field.dec}&r=${r}`).then(d=>{cats[s]=d.rows;overlay()}).catch(()=>{cats[s]=[];});}
const bandSel=()=>{const v=$('#tlBand').value;if(!v)return null;const [d,c]=v.split('-').map(Number);return BANDS.find(b=>b.d===d&&b.c===c)};
function zImage(f){ // robust-normalised image (σ units) after flag and band masks
 const key=$('#tlBand').value+':'+$('#tlFlag').checked;const cached=cache.get(f);if(cached?.key===key)return cached.z;const b=bandSel(),m=$('#tlFlag').checked,n=N*N,z=new Float32Array(n).fill(NaN),ok=[];
 for(let i=0;i<n;i++){const v=f.v[i];if(Number.isFinite(v)&&f.f[i]>=0&&(!m||f.f[i]===0)&&(!b||(f.w[i]>=b.lo&&f.w[i]<=b.hi)))ok.push(i)}
 if(ok.length>200){const a=Float32Array.from(ok,i=>f.v[i]).sort(),med=a[a.length>>1],dev=Float32Array.from(a,x=>Math.abs(x-med)).sort(),sg=(dev[dev.length>>1]*1.4826)||1;for(const i of ok)z[i]=(f.v[i]-med)/sg}
 cache.set(f,{key,z});return z}
function mean(list){const n=N*N,o=new Float32Array(n),c=new Uint8Array(n);for(const z of list)for(let i=0;i<n;i++)if(z[i]===z[i]){o[i]+=z[i];c[i]++}for(let i=0;i<n;i++)o[i]=c[i]?o[i]/c[i]:NaN;return o}
function build(current=groups[k]?.m[0]){
 const bin=+$('#tlBin').value,list=frames.filter(f=>zImage(f).some(Number.isFinite)),g=new Map();
 for(const f of list){const key=bin===-1?'d'+f.det:bin>0?f.det+'|'+Math.floor((f.t-frames[0].t)/bin):frames.indexOf(f);(g.get(key)||g.set(key,[]).get(key)).push(f)}
 groups=[...g.values()].map(m=>({m,t:m.reduce((a,f)=>a+f.t,0)/m.length,det:new Set(m.map(f=>f.det)).size==1?m[0].det:0,z:null})).sort((a,b)=>a.t-b.t);
 for(const x of groups)x.z=x.m.length>1?mean(x.m.map(zImage)):zImage(x.m[0]);
 const selected=groups.findIndex(group=>group.m.includes(current));
 k=selected>=0?selected:Math.max(0,Math.min(k,groups.length-1));$('#tlSlide').max=Math.max(0,groups.length-1);$('#tlSlide').value=k;draw()}
const gray=v=>{const u=Math.max(0,Math.min(1,(v+1)/9));return Math.asinh(u*12)/Math.asinh(12)};
function paint(z,tint,alpha,diff,ctx){const o=new ImageData(N,N);for(let i=0;i<N*N;i++){const v=z[i];if(v!==v)continue;const j=i*4;if(diff){const a=Math.min(1,Math.asinh(Math.abs(v)/2)/Math.asinh(12));o.data[j]=v>0?40+215*a:20;o.data[j+1]=30+90*a;o.data[j+2]=v<0?40+215*a:20}else{const g=gray(v)*255;o.data[j]=g*tint[0];o.data[j+1]=g*tint[1];o.data[j+2]=g*tint[2]}o.data[j+3]=255*alpha}
 const c=document.createElement('canvas');c.width=c.height=N;c.getContext('2d').putImageData(o,0,0);ctx.drawImage(c,0,0)}
function releaseName(url){
 const release=String(url).match(/[/]spherex[/](dr|qr)([0-9]+)[/]/i);
 return release?release[1].toUpperCase()+release[2]:'SPHEREx Level 2';
}
function draw(){
 if(!groups.length)return;const ctx=$('#tlImg').getContext('2d'),g=groups[k],mode=$('#tlMode').value;ctx.globalCompositeOperation='source-over';ctx.fillStyle='#02060b';ctx.fillRect(0,0,N,N);let note='';
 if(mode==='trail'){ctx.globalCompositeOperation='lighter';for(let j=Math.max(0,k-5);j<k;j++)paint(groups[j].z,[1,.55,.2],.18+.1*(j-(k-5)),0,ctx);paint(g.z,[.6,1,1],1,0,ctx);note=' · orange = earlier, cyan = now'}
 else if(mode==='sum'){paint(mean(groups.slice(0,k+1).filter(x=>x.det===g.det||!g.det).map(x=>x.z)),[1,1,1],1,0,ctx);note=' · running mean of epochs 1–'+(k+1)}
 else if(mode==='first'||mode==='prev'){const same=groups.filter((x,i)=>i<k&&x.det===g.det),ref=mode==='first'?same[0]:same.at(-1);if(!ref||!g.det)paint(g.z,[1,1,1],1,0,ctx),note=' · no earlier same-detector epoch to subtract';else{const d=new Float32Array(N*N);for(let i=0;i<d.length;i++)d[i]=g.z[i]-ref.z[i];paint(d,0,1,1,ctx);note=` · red brighter now, blue brighter before (vs ${iso(ref.t)})`}}
 else paint(g.z,[1,1,1],1,0,ctx);
 $('#tlSlide').value=k;
 const releases=[...new Set(g.m.map(frame=>releaseName(frame.url)))].join(' + ');
 $('#tlFrameSource').textContent='Observed '+iso(g.t)+' UTC · '+releases+'. '+(releases.includes('DR1')?'NASA/IPAC announced DR1 on 12 November 2026.':'');
 set(`Epoch ${k+1}/${groups.length} · ${iso(g.t)} · ${g.det?'D'+g.det:'mixed D'} · ${g.m.length} exposure${g.m.length>1?'s':''}${note}`);overlay()}
function toPx(ra,dec){const [x,y]=worldToPixel(hdr,ra,dec);return [x,y]}
function overlay(){
 const c=$('#tlOv'),x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);if(!groups.length)return;const t=groups[k].t,Y=yr(t),S=2,dr=(r,ep,pm)=>[r.ra+(pm[0]||0)*(Y-ep)/3.6e6/Math.cos(r.dec*Math.PI/180),r.dec+(pm[1]||0)*(Y-ep)/3.6e6];
 x.lineWidth=1.5;x.font='11px monospace';
 for(const [s,on,col,ep] of [['gaia',$('#tlGaia').checked,'#ffd166',2016],['wise',$('#tlWise').checked,'#ef6f6c',2010.55]]){if(!on||!cats[s])continue;cats[s].slice(0,s==='gaia'?400:150).forEach((r,i)=>{const [rr,dd]=dr(r,ep,[r.pmra/(s==='wise'?1e3:1)||0,r.pmdec/(s==='wise'?1e3:1)||0]),[px,py]=toPx(rr,dd);if(!(px>=0&&py>=0&&px<N&&py<N))return;x.strokeStyle=col;x.beginPath();x.arc(px*S,py*S,s==='gaia'?9:14,0,7);x.stroke();if(i<10){x.fillStyle=col;x.fillText((s==='gaia'?'G ':'W1 ')+(+r.mag).toFixed(1),px*S+11,py*S-8)}})}
 if(target?.pm){const [px,py]=toPx(...dr({ra:target.ra,dec:target.dec},target.ep,target.pm));if(px>=0&&px<N&&py>=0&&py<N){x.strokeStyle='#8ae5d8';x.setLineDash([4,3]);x.strokeRect(px*S-14,py*S-14,28,28);x.setLineDash([]);x.fillStyle='#8ae5d8';x.fillText(target.n+' (predicted)',px*S+18,py*S+4)}}
 movers.forEach((v,i)=>{const col=v.kind==='variable'?'#b69cff':v.match?'#8ae5d8':'#ff4fd8';x.strokeStyle=x.fillStyle=col;x.setLineDash(v.kind==='variable'?[3,3]:[]);x.beginPath();v.m.forEach((p,j)=>j?x.lineTo(p.x*S,p.y*S):x.moveTo(p.x*S,p.y*S));x.stroke();x.setLineDash([]);v.m.forEach(p=>{x.beginPath();x.arc(p.x*S,p.y*S,p.g===groups.indexOf(groups[k])?5:2.5,0,7);x.fill()});x.fillText('#'+(i+1),v.m[0].x*S+7,v.m[0].y*S-7)});
 if(pin){x.strokeStyle='#fff';x.beginPath();x.moveTo(pin.x*S-12,pin.y*S);x.lineTo(pin.x*S+12,pin.y*S);x.moveTo(pin.x*S,pin.y*S-12);x.lineTo(pin.x*S,pin.y*S+12);x.stroke()}}
function spectrum(){
 const c=$('#tlSpec'),x=c.getContext('2d'),W=c.width,H=c.height;x.clearRect(0,0,W,H);if(!pin||!frames.length)return;const pts=[];
 for(const f of frames){let s=0,n=0,w=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const i=(pin.y+dy)*N+pin.x+dx,v=f.v[i];if(Number.isFinite(v)&&f.f[i]===0&&Number.isFinite(f.w[i])){s+=v;w+=f.w[i];n++}}if(n>4)pts.push([w/n,s/n,f.det])}
 if(!pts.length){x.fillStyle='#8eafbb';x.fillText('No unflagged pixels at this position.',10,20);return}
 const ys=pts.map(p=>p[1]).sort((a,b)=>a-b),lo=ys[Math.floor(ys.length*.02)],hi=ys[Math.ceil(ys.length*.98)-1]||lo+1,px=w=>30+(w-.75)/4.26*(W-40),py=v=>H-18-(v-lo)/((hi-lo)||1)*(H-34);
 x.strokeStyle='#26414a';x.fillStyle='#8eafbb';x.font='10px monospace';for(const w of [1,2,3,4,5]){x.beginPath();x.moveTo(px(w),4);x.lineTo(px(w),H-18);x.stroke();x.fillText(w+'μm',px(w)-10,H-4)}
 for(const [w,v,d] of pts){x.fillStyle=COL[d-1];x.beginPath();x.arc(px(w),Math.max(4,Math.min(H-18,py(v))),3,0,7);x.fill()}x.fillStyle='#8eafbb';x.fillText('MJy/sr (3×3 px mean, incl. sky)',34,12)}
$('#tlImg').parentElement.onclick=e=>{if(!hdr)return;const r=$('#tlImg').getBoundingClientRect(),px=Math.max(1,Math.min(N-2,Math.round((e.clientX-r.left)/r.width*(N-1)))),py=Math.max(1,Math.min(N-2,Math.round((e.clientY-r.top)/r.height*(N-1))));pin={x:px,y:py};const [ra,dec]=outputToWorld(px,py,N,field.ra,field.dec,field.fov);$('#tlPix').textContent=`Pinned RA ${ra.toFixed(5)}° Dec ${dec.toFixed(5)}° · spectrum from all ${frames.length} exposures`;overlay();spectrum()};
function stop(){clearInterval(timer);timer=null;$('#tlPlay').textContent='▶'}
$('#tlPlay').onclick=()=>{if(timer)return stop();if(groups.length<2)return;$('#tlPlay').textContent='❚❚';timer=setInterval(()=>{k=(k+1)%groups.length;draw()},1000/+$('#tlFps').value)};
$('#tlFps').onchange=()=>{if(timer){stop();$('#tlPlay').click()}};$('#tlSlide').oninput=e=>{k=+e.target.value;draw()};
for(const id of ['#tlMode','#tlBin','#tlBand','#tlFlag'])$(id).onchange=()=>{build()};for(const id of ['#tlGaia','#tlWise'])$(id).onchange=overlay;
$('#tlLoad').onclick=()=>{target=null;loadAll()};
async function resolve(name){const d=await api('/catalog?name='+encodeURIComponent(name));return d}
$('#tlRes').onclick=async()=>{try{const d=await resolve($('#tlName').value);$('#tlRa').value=d.ra.toFixed(6);$('#tlDec').value=d.dec.toFixed(6);target=null;set('Resolved '+$('#tlName').value)}catch(e){set(e.message,1)}};
async function openPreset(index,showLatest=false){if(busy)return;const p=PRESETS[index];let {ra,dec}=p;if(p.q)try{({ra,dec}=await resolve(p.q))}catch{}
 target={...p,ra,dec};const dy=p.pm?2025.9-p.ep:0; // centre on the expected position in late 2025
 if(p.pm){dec+=p.pm[1]*dy/3.6e6;ra+=p.pm[0]*dy/3.6e6/Math.cos(dec*Math.PI/180)}
 $('#tlName').value=p.n;$('#tlRa').value=ra.toFixed(6);$('#tlDec').value=dec.toFixed(6);$('#tlFov').value=p.pm&&Math.hypot(...p.pm)>5000?'.4':'.2';return loadAll(showLatest);}
root.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>openPreset(Number(b.dataset.p)));
export async function openReleasePreview(){
 if(!root.open)root.showModal();
 if(busy)return;
 busy=1;stop();
 $('#tlLoad').disabled=true;
 $('#tlEmpty').hidden=false;
 set('Opening the bundled DR1 image…');
 try{
  const response=await fetch(new URL('./data/barnard-dr1.fits',import.meta.url));
  if(!response.ok)throw Error('The DR1 preview could not be loaded. Try again.');
  const image=parseFits(await response.arrayBuffer());
  const ra=269.4463,dec=4.7677,fov=.2;
  const sample=spectralProject(image,ra,dec,fov,N);
  const t=Date.parse(image.h['DATE-AVG']+'Z')/86400000+40587;
  $('#tlBand').value='';$('#tlMode').value='movie';$('#tlBin').value='0';
  busy=0;
  openComparison({field:{ra,dec},fov,detector:3,exposures:[{sample,t,url:'https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2026W19_1A/l2b-v27-2026-245/3/level2_2026W19_1A_0403_1D3_spx_l2b-v27-2026-245.fits'}]});
  $('#tlName').value="Barnard's Star";
  set("Barnard’s Star · DR1 · observed "+iso(t)+" UTC");
 }catch(error){set(error.message,1);}
 finally{busy=0;$('#tlLoad').disabled=false;}
}
export function openLatest(){
 if(!root.open)root.showModal();
 if(busy)return;
 $('#tlDet').value='0';$('#tlBand').value='';$('#tlMode').value='movie';$('#tlBin').value='0';
 syncMap();
 return openPreset(0,true);
}
$('#tlLink').onclick=()=>{const q=new URLSearchParams({lab:1,ra:$('#tlRa').value,dec:$('#tlDec').value,fov:$('#tlFov').value,det:$('#tlDet').value,mode:$('#tlMode').value,stack:$('#tlBin').value,gaia:Number($('#tlGaia').checked),wise:Number($('#tlWise').checked),flags:Number($('#tlFlag').checked)});if($('#tlBand').value)q.set('band',$('#tlBand').value);const u=location.origin+location.pathname+'?'+q;navigator.clipboard?.writeText(u);set('Share link copied: '+u)};
$('#tlPng').onclick=()=>{const o=document.createElement('canvas');o.width=o.height=N*2;const c=o.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage($('#tlImg'),0,0,N*2,N*2);c.drawImage($('#tlOv'),0,0);Object.assign(document.createElement('a'),{href:o.toDataURL(),download:`omniscope-${field?.ra?.toFixed(3)}_${field?.dec?.toFixed(3)}.png`}).click()};
const q=new URLSearchParams(location.search);
if(q.get('lab')||q.has('ra')){for(const [p,id] of [['ra','#tlRa'],['dec','#tlDec'],['fov','#tlFov'],['det','#tlDet'],['band','#tlBand'],['mode','#tlMode'],['name','#tlName'],['stack','#tlBin']])if(q.has(p))$(id).value=q.get(p);
 for(const [param,id] of [['gaia','#tlGaia'],['wise','#tlWise'],['flags','#tlFlag']])if(q.has(param))$(id).checked=q.get(param)==='1';
 const openShared=()=>{if(!root.open)root.showModal();if(q.has('ra')&&q.has('dec'))loadAll();else if(q.get('name'))$('#tlRes').click()};
 if(document.readyState==='complete')queueMicrotask(openShared);else addEventListener('load',openShared,{once:true});}
export function openComparison(data) {
 if(busy || !data.exposures.length) {
  if(!root.open) root.showModal();
  return;
 }
 stop();
 const {ra,dec}=data.field,fov=data.fov;
 field={ra,dec,fov};
 hdr={CRVAL1:ra,CRVAL2:dec,CRPIX1:(N+1)/2,CRPIX2:(N+1)/2,CDELT1:-fov/(N-1),CDELT2:-fov/(N-1)};
 target=null;cats={};pin=null;movers=[];k=0;cache.clear();
 renderMovers();
 $('#tlRa').value=ra;$('#tlDec').value=dec;$('#tlName').value='';
 $('#tlDet').value=String(data.detector);
 if(![...$('#tlFov').options].some(option=>Number(option.value)===fov))$('#tlFov').add(new Option(fov+'°',String(fov)));
 $('#tlFov').value=[...$('#tlFov').options].find(option=>Number(option.value)===fov).value;
 $('#tlBand').value='';$('#tlMode').value='movie';$('#tlBin').value='0';
 syncMap();
 frames=data.exposures.map(({sample,t,url})=>{
  const v=new Float32Array(N*N),w=new Float32Array(N*N),f=new Int32Array(N*N);
  for(let y=0;y<N;y++) for(let x=0;x<N;x++){
   const source=Math.round(y*(sample.n-1)/(N-1))*sample.n+Math.round(x*(sample.n-1)/(N-1));
   const dest=y*N+x;
   v[dest]=sample.values[source];w[dest]=sample.wavelength[source];f[dest]=sample.flags[source];
  }
  return {t,url,det:data.detector,v,w,f};
 });
 $('#tlEmpty').hidden=true;
 $('#tlPix').textContent='Click the image to see its spectrum.';
 spectrum();build();
 if(!root.open) root.showModal();
}
window.omniscopeLab={open:()=>root.showModal(),load:(ra,dec,fov)=>{$('#tlRa').value=ra;$('#tlDec').value=dec;if(fov)$('#tlFov').value=fov;return loadAll()}};

// On-device assistant with a built-in guide for unsupported browsers.
const chat=document.createElement('div');chat.className='tl-chat';
chat.innerHTML=`<div id="tlLog" class="tl-log"><div class="tl-a">Ask about your images, wavelengths, or possible changes. Uses on-device AI where available and the built-in guide elsewhere.</div></div><div class="tl-row"><input id="tlAsk" placeholder="Ask about what you see…"><button id="tlSend">Ask</button></div>`;
root.querySelector('.tl-view').append(chat);
const hist=[];
function context(){
 if(!field)return 'No field loaded yet.';const g=groups[k],top=s=>(cats[s]||[]).slice(0,5).map(r=>`${r.source_id} mag ${(+r.mag).toFixed(1)}`).join('; ')||'none';
 return [`Target: ${target?.n||$('#tlName').value||'custom'} RA ${field.ra.toFixed(4)} Dec ${field.dec.toFixed(4)}, field ${field.fov} deg`,
 `Detector: ${$('#tlDet').value==='0'?'all':'D'+$('#tlDet').value}; band: ${$('#tlBand').value||'all'}; display: ${$('#tlMode').value}; stacking: ${$('#tlBin').value}`,
 `Exposures loaded: ${frames.length}${frames.length?` (${iso(frames[0].t)} to ${iso(frames.at(-1).t)})`:''}; epochs shown: ${groups.length}`,
 g?`Current epoch ${k+1}: ${iso(g.t)}, ${g.det?'D'+g.det:'mixed detectors'}, ${g.m.length} exposure(s)`:'',
 target?.pm?`Target proper motion (mas/yr): ${target.pm.join(', ')}`:'',pin?`User pinned pixel (${pin.x},${pin.y})`:'',
 movers.length?'Mover finder candidates: '+movers.slice(0,4).map((v,i)=>`#${i+1} ${v.kind} D${v.det} ${v.m.length} epochs ${v.rate?v.rate.toFixed(1)+' arcsec/yr':''} ${v.match||'no catalog match'}`).join(' | '):'',`Gaia DR3 sources in field: ${cats.gaia?.length??'loading'} (brightest: ${top('gaia')})`,`AllWISE sources in field: ${cats.wise?.length??'loading'} (brightest: ${top('wise')})`].filter(Boolean).join('\n')}
async function ask(){
 const i=document.getElementById('tlAsk'),q=i.value.trim();if(!q)return;i.value='';const log=document.getElementById('tlLog'),add=(c,t)=>{const d=document.createElement('div');d.className=c;d.textContent=t;log.append(d);log.scrollTop=log.scrollHeight;return d};
 add('tl-u',q);hist.push({role:'user',content:q});const wait=add('tl-a','Thinking…'),done=(t,c)=>{wait.textContent=t;if(c)wait.classList.add(c);hist.push({role:'assistant',content:t})};
 const model=globalThis.LanguageModel;
 let session;
 try {
  if(!model || await model.availability()==='unavailable'){
   done('Offline guide · '+basic(q),'tl-basic');return;
  }
  wait.textContent='Starting on-device AI. Your browser may need to download its model first…';
  session=await model.create({initialPrompts:[{role:'system',content:'You are the OmniScope astronomy assistant. Answer briefly. Use only the supplied context for claims about the current field. Never invent a detection.'}]});
  wait.textContent='Thinking on this device…';
  const reply=await session.prompt('Observation context:\n'+context()+'\n\nQuestion: '+q);
  done(reply.trim() || 'Offline guide · '+basic(q));
 } catch {
  done('Offline guide · '+basic(q),'tl-basic');
 } finally {
  session?.destroy();
 }
}

document.getElementById('tlSend').onclick=ask;document.getElementById('tlAsk').onkeydown=e=>{if(e.key==='Enter')ask()};

// ---- Mover finder UI ----
const mb=document.createElement('button');mb.id='tlMov';mb.className='tl-main';mb.textContent='Find movers (multi-epoch)';root.querySelector('.tl-note').before(mb);
const ml=document.createElement('div');ml.id='tlMovList';ml.className='tl-mov';chat.before(ml);
function renderMovers(){const l=document.getElementById('tlMovList');if(!l)return;l.innerHTML='';movers.forEach((v,i)=>{const b=document.createElement('button');b.className='tl-mv';b.innerHTML=`<b>#${i+1}</b> ${v.kind==='variable'?'variable':'mover'} · D${v.det} · ${v.m.length} epochs${v.rate?' · '+v.rate.toFixed(1)+'″/yr':''}<br><small>${v.match||'no Gaia/AllWISE match — worth checking'} · RA ${v.ra.toFixed(4)} Dec ${v.dec.toFixed(4)}</small>`;b.onclick=()=>{k=v.m[0].g;pin={x:Math.round(v.m[0].x),y:Math.round(v.m[0].y)};draw();spectrum()};l.append(b)})}
mb.onclick=()=>{
 if(!groups.length)return set('Load SPHEREx epochs first.',1);const px=field.fov*3600/(N-1);
 const tracks=findMovers(groups,N);if(!tracks.length){movers=[];renderMovers();overlay();return set('No consistent movers or variables found. Try a larger field, a single detector, or 30-day stacking to raise signal-to-noise.')}
 movers=tracks.map(v=>{const f=v.m[0],l=v.m.at(-1),mx=v.m.reduce((a,p)=>a+p.x,0)/v.m.length,my=v.m.reduce((a,p)=>a+p.y,0)/v.m.length,Y=yr(v.m.reduce((a,p)=>a+p.t,0)/v.m.length);
  const [ra,dec]=outputToWorld(mx,my,N,field.ra,field.dec,field.fov),rate=v.kind==='mover'?Math.hypot(l.x-f.x,l.y-f.y)*px/Math.max(.01,yr(l.t)-yr(f.t)):0;let match=null,bd=2.5;
  for(const [src,ep] of [['gaia',2016],['wise',2010.55]])for(const r of cats[src]||[]){const pm=src==='gaia'?[r.pmra||0,r.pmdec||0]:[0,0],d=r.dec+pm[1]*(Y-ep)/3.6e6,a=r.ra+pm[0]*(Y-ep)/3.6e6/Math.cos(d*Math.PI/180),[qx,qy]=toPx(a,d),dist=Math.hypot(qx-mx,qy-my);if(dist<bd){bd=dist;match=(src==='gaia'?'Gaia DR3 ':'AllWISE ')+r.source_id+' (mag '+(+r.mag).toFixed(1)+')'}}
  return {...v,ra,dec,rate,match}}).sort((a,b)=>(!!a.match-!!b.match)||(b.m.length-a.m.length));
 renderMovers();overlay();set(`${movers.length} candidate${movers.length>1?'s':''} (${movers.filter(v=>!v.match).length} with no catalog match). Pink = unmatched mover, teal = matches a catalog star, dashed violet = stationary variable. Candidates need human review.`)};

// Built-in help for browsers without the on-device model.

function basic(q){
 const t=q.toLowerCase(),has=r=>r.test(t),loaded=field&&frames.length,need='Load a target first (pick a preset or enter RA/Dec, then press Load).';
 const fmt=r=>`${r.source_id} (mag ${(+r.mag).toFixed(1)})`,top=s=>(cats[s]||[]).slice(0,5).map(fmt).join(', ')||'none';
 if(has(/\b(hi|hello|hey|help|what can you)\b/))return 'I can tell you about the loaded field: movers and variables, Gaia and AllWISE sources, dates and epochs, detectors and bands, flags, the pinned source\'s spectrum, and how to confirm a mover. Try "any movers?", "what dates?" or "Gaia sources".';
 if(has(/mover|moving|moved|motion|asteroid|brown dwarf|variable|variab|transient/)){
  if(!loaded)return need;if(!movers.length)return 'No mover results yet. Press "Find movers (multi-epoch)" under the controls. It needs at least 3 epochs from one detector; 30-day stacking and a 0.4° field help slow movers.';
  return `${movers.length} candidate(s):\n`+movers.slice(0,5).map((v,i)=>`#${i+1} ${v.kind} in D${v.det}, ${v.m.length} epochs${v.rate?', ~'+v.rate.toFixed(1)+'″/yr':''}, RA ${v.ra.toFixed(4)} Dec ${v.dec.toFixed(4)}, ${v.match||'no Gaia/AllWISE match, worth checking'}`).join('\n')}
 if(has(/gaia/))return loaded?`Gaia DR3 sources in this field: ${cats.gaia?.length??'still loading'}. Brightest: ${top('gaia')}. They are drawn as yellow rings, moved by proper motion to each frame's date.`:need;
 if(has(/wise/))return loaded?`AllWISE sources in this field: ${cats.wise?.length??'still loading'}. Brightest in W1: ${top('wise')}. Drawn as red rings.`:need;
 if(has(/spectr|flux|brightness|sed/)){
  if(!loaded)return need;if(!pin)return 'Click a source in the image to pin it; I will then summarise its spectrum, and the plot below the image shows every exposure.';
  const pts=[];for(const f of frames){const i=pin.y*N+pin.x;if(Number.isFinite(f.v[i])&&f.f[i]===0&&Number.isFinite(f.w[i]))pts.push([f.w[i],f.v[i]])}
  if(!pts.length)return 'No unflagged measurements at the pinned pixel.';const w=pts.map(p=>p[0]).sort((a,b)=>a-b),v=pts.map(p=>p[1]).sort((a,b)=>a-b);
  return `The pinned pixel has ${pts.length} clean measurements covering ${w[0].toFixed(2)}–${w.at(-1).toFixed(2)} μm. Surface brightness runs ${v[0].toFixed(2)} to ${v.at(-1).toFixed(2)} MJy/sr (median ${v[v.length>>1].toFixed(2)}), including sky background.`}
 if(has(/epoch|date|when|how many|exposure|observ|time/)){
  if(!loaded)return need;const g=groups[k];return `${frames.length} exposures, ${iso(frames[0].t)} to ${iso(frames.at(-1).t)}, shown as ${groups.length} epochs after stacking.${g?` You are on epoch ${k+1}: ${iso(g.t)}, ${g.det?'detector D'+g.det:'mixed detectors'}, ${g.m.length} exposure(s).`:''}`}
 if(has(/detector|band|wavelength|channel|micron|μm|infrared/)){
  const b=bandSel(),d=$('#tlDet').value;return `SPHEREx has 6 detectors, each with 17 channels (102 bands): ${DET.map((r,i)=>`D${i+1} ${r[0]}–${r[1]} μm`).join(', ')}. Current selection: ${d==='0'?'all detectors':'D'+d}${b?`, band D${b.d} ch${b.c} (${b.lo.toFixed(2)}–${b.hi.toFixed(2)} μm)`:', all wavelengths'}. Pixels are filtered by their true FITS wavelength.`}
 if(has(/flag|mask|contamin|quality|bad/))return `"Mask flagged" is ${$('#tlFlag').checked?'on':'off'}: pixels with any nonzero quality flag are hidden, so artifacts and contaminated pixels do not look like sources. Turn it off to see everything the archive returned.`;
 if(has(/subtract|difference|stack|sum|add|trail|display|mode/))return 'Display modes: Time-lapse plays epochs; Trail draws the newest epoch (cyan) over older ones (orange); Running sum averages epochs so far; Subtract shows red where the sky is brighter now and blue where it was brighter before, using the same detector only. "Stack frames" adds exposures together in 7-day or 30-day bins, or one per detector, to improve signal-to-noise.';
 if(has(/fov|field of view|size|zoom/))return loaded?`The field is ${field.fov}° wide. Larger fields (up to 0.7°) can follow faster movers but take longer to load.`:'Pick a field of view from 0.05° to 0.7°. Larger fields track faster movers but load more slowly.';
 if(has(/where|coord|ra\b|dec\b|target|position|field/)){
  if(!loaded)return need;let a=`Target: ${target?.n||$('#tlName').value||'custom'}, centre RA ${field.ra.toFixed(5)}°, Dec ${field.dec.toFixed(5)}°, field ${field.fov}°.`;
  if(target?.pm)a+=` Known proper motion ${target.pm[0]}, ${target.pm[1]} mas/yr (dashed box marks where it should be).`;if(pin){const [ra,dec]=outputToWorld(pin.x,pin.y,N,field.ra,field.dec,field.fov);a+=` Pinned source: RA ${ra.toFixed(5)}°, Dec ${dec.toFixed(5)}°.`}return a}
 if(has(/confirm|real|fake|false|artifact|sure|verify|check/))return 'To confirm a mover: (1) it should move in a straight line at steady speed across 3+ epochs; (2) check it in more than one detector or band; (3) make sure it has no Gaia or AllWISE counterpart at that date; (4) keep "Mask flagged" on; (5) remember a star can brighten or fade with wavelength across a detector, which is not motion.';
 if(has(/pin|click|select/))return 'Click anywhere on the image to pin a position. The spectrum plot then shows every exposure at that spot.';
 return 'I did not catch that. In basic mode I can answer about: movers or variables, Gaia, AllWISE, dates and epochs, detectors and bands, flags, display modes, field of view, coordinates, the pinned spectrum, and how to confirm a mover.';
}

// ---- 102-band map ----
function syncMap(){const v=$('#tlBand').value;root.querySelectorAll('.tl-map [data-b]').forEach(b=>b.classList.toggle('on',b.dataset.b===v));const bd=bandSel();$('#tlBandLabel').textContent=bd?`Band ${(bd.d-1)*17+bd.c} of 102 · detector ${bd.d}, channel ${bd.c} · ${bd.lo.toFixed(2)}–${bd.hi.toFixed(2)} μm`:'All wavelengths (broadband)'}
root.querySelectorAll('.tl-map [data-b]').forEach(b=>b.onclick=()=>{const v=b.dataset.b;$('#tlBand').value=v;syncMap();if(v){const d=v.split('-')[0];if($('#tlDet').value!==d){$('#tlDet').value=d;if(frames.length)return loadAll()}}if(frames.length)build()});
$('#tlDet').addEventListener('change',()=>{const bd=bandSel();if(bd&&$('#tlDet').value!=='0'&&bd.d!==+$('#tlDet').value){$('#tlBand').value='';syncMap()}});
syncMap();
