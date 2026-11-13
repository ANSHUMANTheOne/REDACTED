// Multi-epoch mover finder. Works on per-epoch robust-normalised images of ONE detector at a time.
// 1) subtract the per-pixel median over epochs  2) find compact residual peaks per epoch
// 3) link peaks that move on a straight line at constant speed across >=3 epochs  4) also report stationary variables.
const med=a=>{const b=a.filter(Number.isFinite).sort((x,y)=>x-y);return b.length?b[b.length>>1]:NaN};
function peaksOf(res,N,e,t){
 const v=[];for(const x of res)if(x===x)v.push(x);if(v.length<500)return [];
 const m=med(v),sg=1.4826*med(v.map(x=>Math.abs(x-m)))||1,out=[];
 for(let y=3;y<N-3;y++)for(let x=3;x<N-3;x++){const i=y*N+x;if(!(res[i]>m))continue;
  let s=0,c=0,wx=0,top=true;
  for(let dy=-2;dy<=2&&top;dy++)for(let dx=-2;dx<=2;dx++){const r=res[i+dy*N+dx];if(r>res[i]||(r===res[i]&&(dy<0||(dy===0&&dx<0)))){top=false;break}}
  if(!top)continue;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const r=res[i+dy*N+dx];if(r===r){s+=r-m;c++;wx+=Math.max(0,r-m)}}
  const score=s/(sg*Math.sqrt(Math.max(c,1)));if(c>=7&&score>=6&&wx>0)out.push({x:cx(0,res,i,N,x,y,'x'),y:cx(0,res,i,N,x,y,'y'),s:score,g:e,t})}
 return out.sort((a,b)=>b.s-a.s).slice(0,60)}
function cx(_,res,i,N,x,y,ax){let w=0,sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const r=res[i+dy*N+dx];if(r>0){w+=r;sum+=r*(ax==='x'?x+dx:y+dy)}}return w?sum/w:(ax==='x'?x:y)}
export function findMovers(groups,N,{tol=2.5,minSpan=2.5,minEpochs=3}={}){
 const tracks=[],still=[];
 for(let d=1;d<=6;d++){
  const idx=groups.map((g,i)=>g.det===d?i:-1).filter(i=>i>=0);if(idx.length<minEpochs)continue;
  const ref=new Float32Array(N*N),col=[];
  for(let p=0;p<N*N;p++){col.length=0;for(const i of idx){const z=groups[i].z[p];if(z===z)col.push(z)}ref[p]=col.length>=2?med(col):NaN}
  let pk=[],neg=[];for(const i of idx){const z=groups[i].z,res=new Float32Array(N*N),inv=new Float32Array(N*N);for(let p=0;p<res.length;p++){res[p]=z[p]-ref[p];inv[p]=-res[p]}pk.push(...peaksOf(res,N,i,groups[i].t));neg.push(...peaksOf(inv,N,i,groups[i].t))}
  pk=pk.sort((a,b)=>b.s-a.s).slice(0,220);const found=[];
  for(let a=0;a<pk.length;a++)for(let b=0;b<pk.length;b++){const A=pk[a],B=pk[b];if(!(B.t>A.t)||B.g===A.g)continue;const dist=Math.hypot(B.x-A.x,B.y-A.y);if(dist<1||dist>70)continue;
   const vx=(B.x-A.x)/(B.t-A.t),vy=(B.y-A.y)/(B.t-A.t),best=new Map([[A.g,A],[B.g,B]]);
   for(const R of pk){if(best.has(R.g)&&best.get(R.g)!==R){const o=best.get(R.g);if(o===A||o===B)continue}
    const dt=R.t-A.t,err=Math.hypot(R.x-(A.x+vx*dt),R.y-(A.y+vy*dt));if(err>tol)continue;const o=best.get(R.g);if(!o||err<Math.hypot(o.x-(A.x+vx*dt),o.y-(A.y+vy*dt)))best.set(R.g,R)}
   const m=[...best.values()].sort((p,q)=>p.t-q.t);if(m.length<minEpochs)continue;
   const span=Math.hypot(m.at(-1).x-m[0].x,m.at(-1).y-m[0].y);if(span<minSpan)continue;
   found.push({m,score:m.length*100+m.reduce((s,p)=>s+p.s,0)/m.length})}
  found.sort((a,b)=>b.score-a.score);const used=new Set();
  for(const f of found){if(f.m.some(p=>used.has(p)))continue;f.m.forEach(p=>used.add(p));tracks.push({det:d,m:f.m,kind:'mover'})}
  // stationary variables: same pixel flagged in >=3 epochs
  const pool=[...pk,...neg];for(const A of pool){if(used.has(A))continue;const hits=pool.filter(B=>!used.has(B)&&Math.hypot(B.x-A.x,B.y-A.y)<1.6);if(new Set(hits.map(h=>h.g)).size>=minEpochs&&!still.some(s=>s.det===d&&Math.hypot(s.m[0].x-A.x,s.m[0].y-A.y)<3)){hits.forEach(h=>used.add(h));still.push({det:d,m:hits.sort((p,q)=>p.t-q.t),kind:'variable'})}}
 }
 return [...tracks,...still]}
