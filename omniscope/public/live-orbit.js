import './vendor/satellite.min.js';

const tleURL='https://celestrak.org/NORAD/elements/gp.php?CATNR=63182&FORMAT=TLE';
const maxAge=7*86400000;

export function installLiveOrbit({T,scene,caption,toScene,radius}){
 const group=new T.Group();
 const marker=new T.Mesh(new T.SphereGeometry(radius*.038,16,12),new T.MeshBasicMaterial({color:0x90eaff}));
 const track=new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial({color:0x90eaff,transparent:true,opacity:.52}));
 group.add(track,marker);
 scene.add(group);
 group.visible=false;

 const button=document.createElement('button');
 button.type='button';
 button.className='live-orbit-toggle';
 button.textContent='Show current orbit';
 button.setAttribute('aria-pressed','false');
 caption.append(button);

 const status=document.createElement('small');
 status.hidden=true;
 caption.append(status);
 let orbit,enabled=false,loading=false,lastFetch=0,nextUpdate=0;

 function parse(text){
  const lines=text.split(/\r?\n/);
  const first=lines.find(line=>line.startsWith('1 63182'));
  const second=lines.find(line=>line.startsWith('2 63182'));
  if(!first||!second)throw Error('Missing SPHEREx orbit');
  const record=globalThis.satellite.twoline2satrec(first,second);
  const epoch=(record.jdsatepoch-2440587.5)*86400000;
  if(!Number.isFinite(epoch)||Math.abs(Date.now()-epoch)>maxAge)throw Error('Orbit elements are out of date');
  return {record,epoch};
 }

 async function refresh(){
  if(loading)return;
  loading=true;
  lastFetch=Date.now();
  status.textContent='Loading orbit estimate…';
  for(const url of [tleURL,new URL('./data/spherex-orbit.tle',import.meta.url)]){
   try{
    const response=await fetch(url,{signal:AbortSignal.timeout(6000)});
    if(!response.ok)continue;
    orbit=parse(await response.text());
    const points=[];
    const start=Date.now();
    const period=2*Math.PI/orbit.record.no*60000;
    for(let i=0;i<=120;i++){
     const point=position(start+i*period/120);
     if(point)points.push(point);
    }
    track.geometry.setFromPoints(points);
    track.geometry.computeBoundingSphere();
    break;
   }catch{}
  }
  loading=false;
  status.textContent=orbit?'Current estimate · CelesTrak '+new Date(orbit.epoch).toISOString().slice(0,10):'Recent orbit data unavailable';
  nextUpdate=0;
 }

 function position(time){
  const point=globalThis.satellite.propagate(orbit.record,new Date(time)).position;
  return point?toScene([point.x,point.y,point.z]):null;
 }

 button.onclick=()=>{
  enabled=!enabled;
  button.setAttribute('aria-pressed',String(enabled));
  button.textContent=enabled?'Hide current orbit':'Show current orbit';
  status.hidden=!enabled;
  if(enabled&&!orbit)refresh();
 };

 return (earth,visible)=>{
  const now=Date.now();
  if(enabled&&now-lastFetch>2*3600000)refresh();
  group.visible=Boolean(enabled&&visible&&orbit&&Math.abs(now-orbit.epoch)<=maxAge);
  if(!group.visible)return;
  group.position.copy(earth);
  if(now>=nextUpdate){
   nextUpdate=now+1000;
   const point=position(now);
   if(point)marker.position.copy(point);
   marker.visible=Boolean(point);
  }
 };
}
