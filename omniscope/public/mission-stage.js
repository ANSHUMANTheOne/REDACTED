// The observation picker stays compact until someone asks to inspect the images.
export function installMissionStage({ui,card,bandPanel,getComparison,scanSample,setStoryState,loadPairChoice,chooseDetector,selectVisit,drawComparison}){
 const $=id=>document.getElementById(id);
 const stage=document.createElement('section');
 stage.className='mission-stage';
 stage.setAttribute('aria-label','Choose a SPHEREx observation');
 stage.innerHTML=`<div class="mission-stage-head"><div><span class="stage-kicker">Planet X</span><h3>SPHEREx observations</h3></div></div>
 <div class="stage-field"><span class="stage-step">01 / SKY FIELD</span><span id="stageField">Opening archive…</span></div>
 <div id="stageBandSlot"></div>
 <details class="stage-visit-details"><summary id="visitSummary">03 / OBSERVATIONS <span>Using the first two visits</span></summary><div class="mission-stage-pickers"><label>Earlier visit<select id="stageDateA" aria-label="Earlier observation date"></select></label><label>Later visit<select id="stageDateB" aria-label="Later observation date"></select></label></div></details>
 <button id="stageLatest" class="stage-latest" type="button">Explore latest SPHEREx images <span aria-hidden="true">↗</span></button>
 <div class="mission-stage-actions"><button id="stageTimeLapse" class="stage-primary">▶ Time-lapse</button><button id="stageVisit" class="stage-secondary">Compare images</button></div>
 <div class="mission-stage-readout" aria-live="off"><strong id="stageWave">Measured wavelength will appear here.</strong><span id="stageTime">Loading the selected visits…</span><span id="stageCoords">Recorded spacecraft position loads with each image.</span></div>
 <p class="mission-stage-note">Position from FITS metadata. Diagram not to scale.</p>`;
 ui.appendChild(stage);
 stage.addEventListener('pointermove',event=>{const rect=stage.getBoundingClientRect();stage.style.setProperty('--glass-x',`${event.clientX-rect.left}px`);stage.style.setProperty('--glass-y',`${event.clientY-rect.top}px`);});
 stage.addEventListener('pointerleave',()=>{stage.style.removeProperty('--glass-x');stage.style.removeProperty('--glass-y');});
 const sceneCaption=document.createElement('aside');sceneCaption.className='mission-scene-caption';sceneCaption.innerHTML='<strong>SPHEREx / Earth</strong>';ui.appendChild(sceneCaption);
 stage.querySelector('#stageBandSlot').appendChild(bandPanel);
 bandPanel.querySelector('.mission-band-top h4').textContent='02 / INFRARED DETECTOR';
 bandPanel.querySelector('.mission-band-top .calm-eyebrow').textContent='CHOOSE THE LIGHT';
 const a=$('stageDateA'),b=$('stageDateB'),band=$('missionBand'),visitButton=$('stageVisit'),stageTimeLapse=$('stageTimeLapse'),toggle=$('missionEnlarge');
 const spectrum=document.createElement('div');spectrum.className='mission-spectrum';spectrum.innerHTML='<div class="mission-spectrum-head"><span>0.75 \u00b5m</span><strong id="missionSpectrumValue">Measured wavelength</strong><span>5.01 \u00b5m</span></div><div class="mission-spectrum-track"><span class="mission-spectrum-band"></span><span class="mission-spectrum-marker" id="missionSpectrumMarker"></span></div><div class="mission-spectrum-guide"><span>Shorter</span><span>Infrared light · \u00b5m = micrometre</span><span>Longer</span></div>';
 bandPanel.appendChild(spectrum);
 const bandChoices=document.createElement('div');bandChoices.className='stage-band-choices';bandChoices.setAttribute('role','group');bandChoices.setAttribute('aria-label','SPHEREx infrared bands');
 const bandRanges=['0.75–1.12','1.10–1.65','1.63–2.43','2.40–3.85','3.81–4.43','4.41–5.01'];
 for(let n=1;n<=6;n++){const button=document.createElement('button');button.type='button';button.dataset.band=String(n);button.innerHTML=`<strong>${String(n).padStart(2,'0')}</strong><small>${bandRanges[n-1]} µm</small>`;button.setAttribute('aria-label',`Detector ${n}, ${bandRanges[n-1]} micrometers`);button.onclick=()=>{if(band.disabled)return;band.value=String(n);band.dispatchEvent(new Event('change',{bubbles:true}));};bandChoices.appendChild(button);}
 bandPanel.querySelector('.mission-band-top').after(bandChoices);
 const bandRange=document.createElement('div');bandRange.className='stage-selected-range';bandRange.innerHTML='<span class="stage-range-text"></span><svg class="stage-wave" viewBox="0 0 92 26" role="img" aria-label="Relative infrared wave spacing"><path class="stage-wave-path"/></svg>';bandChoices.after(bandRange);
 const wavePath=bandRange.querySelector('.stage-wave-path');
 let activeChannel=0,channelText='';
 function syncBandChoices(){for(const button of bandChoices.children){const active=button.dataset.band===band.value;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));button.disabled=band.disabled;}bandRange.querySelector('.stage-range-text').textContent=channelText||`Detector ${band.value} · ${bandRanges[Number(band.value)-1]} µm`;}
 syncBandChoices();
 const bands=[[.75,1.12],[1.10,1.65],[1.63,2.43],[2.40,3.85],[3.81,4.43],[4.41,5.01]];
 let activeBand=0;
 function updateBandRail(){const selected=Number(band.value);if(selected===activeBand)return;activeBand=selected;const [lo,hi]=bands[selected-1]||bands[1];spectrum.style.setProperty('--band-start',`${(lo-.75)/4.26*100}%`);spectrum.style.setProperty('--band-width',`${(hi-lo)/4.26*100}%`);}
 updateBandRail();
 // Approximate wavelength windows within each detector range.
 const chanWrap=document.createElement('details');chanWrap.className='stage-channels';
 chanWrap.innerHTML='<summary>Narrow wavelength</summary><div class="stage-channels-head"><span>Approximate wavelength windows</span><button type="button" data-ch="0" class="active">Reset</button></div><div class="stage-channel-grid"></div>';
 const chanGrid=chanWrap.querySelector('.stage-channel-grid');
 const chEdge=(d,i)=>{const [lo,hi]=bands[d-1]||bands[1];return lo*Math.pow(hi/lo,i/17)};
 function drawChannels(){chanGrid.innerHTML='';const d=Number(band.value)||2;for(let c=1;c<=17;c++){const lo=chEdge(d,c-1),hi=chEdge(d,c),b=document.createElement('button');b.type='button';b.dataset.ch=String(c);b.textContent=String(c);b.title=`Window ${c} \u00b7 ${lo.toFixed(2)}\u2013${hi.toFixed(2)} \u00b5m`;b.setAttribute('aria-label',b.title);b.classList.toggle('active',c===activeChannel);b.onclick=()=>pickChannel(c);chanGrid.appendChild(b);}chanWrap.querySelector('[data-ch="0"]').classList.toggle('active',!activeChannel);}
 function pickChannel(c){if(band.disabled)return;activeChannel=c;const d=Number(band.value)||2,w=$('spectralWavelength'),sw=$('spectralWidth');
  if(c){const lo=chEdge(d,c-1),hi=chEdge(d,c);if(w){w.value=String((lo+hi)/2);w.dispatchEvent(new Event('input',{bubbles:true}));}
   if(sw){let o=sw.querySelector('[data-ch]');if(!o){o=document.createElement('option');o.dataset.ch='1';sw.appendChild(o);}o.value=String(hi-lo);o.textContent='Window width';sw.value=o.value;sw.dispatchEvent(new Event('change',{bubbles:true}));}
   spectrum.style.setProperty('--band-start',`${(lo-.75)/4.26*100}%`);spectrum.style.setProperty('--band-width',`${(hi-lo)/4.26*100}%`);
   channelText=`Window ${c} \u00b7 ${lo.toFixed(2)}\u2013${hi.toFixed(2)} \u00b5m`;syncBandChoices();}
  else{channelText='';const [lo,hi]=bands[d-1]||bands[1];if(sw){sw.value='.14';sw.dispatchEvent(new Event('change',{bubbles:true}));}spectrum.style.setProperty('--band-start',`${(lo-.75)/4.26*100}%`);spectrum.style.setProperty('--band-width',`${(hi-lo)/4.26*100}%`);syncBandChoices();}
  drawChannels();}
 chanWrap.querySelector('[data-ch="0"]').onclick=()=>pickChannel(0);
 bandRange.after(chanWrap);drawChannels();band.addEventListener('change',()=>{activeChannel=0;channelText='';drawChannels();});
 const timeLapse=document.createElement('button');
 timeLapse.type='button';
 timeLapse.textContent='▶ Time-lapse';
 timeLapse.className='mission-time-lapse';
 timeLapse.onclick=async()=>{
  const lab=await import('./timelapse-lab.js');
  lab.openComparison(getComparison());
 };
 toggle.before(timeLapse);
 stageTimeLapse.onclick=timeLapse.onclick;
 $('stageLatest').onclick=async()=>{
  const lab=await import('./timelapse-lab.js');
  lab.openLatest();
 };
 const cardReplay=document.createElement('button');cardReplay.id='missionReplay';cardReplay.type='button';cardReplay.textContent='▶ Motion preview';cardReplay.title='Replay both recorded exposures';cardReplay.setAttribute('aria-label','Replay observation');cardReplay.setAttribute('aria-pressed','false');toggle.before(cardReplay);
 toggle.hidden=false;
 card.classList.add('is-collapsed');
 card.setAttribute('aria-expanded','false');
 const indicator=document.createElement('div');indicator.className='mission-scan-indicator';indicator.hidden=true;
 card.querySelector('.mission-image-area').appendChild(indicator);
 const live=document.createElement('div');live.className='mission-live-readout';live.innerHTML='<strong id="missionLiveWave">Reading detector pixels…</strong><span id="missionLiveOrbit">Reading recorded spacecraft position…</span>';
 card.querySelector('.mission-visit-dates').after(live);
 let playing=false,started=0,lastIndex=-1,lastSignature='',lastPaint=0,busy=false,loadError='';
 function openCard(){card.classList.remove('is-collapsed');card.scrollTop=0;card.setAttribute('aria-expanded','true');toggle.textContent='← Scene';toggle.title='Return to observing scene';toggle.setAttribute('aria-label','Return to observing scene');drawComparison();document.dispatchEvent(new Event('omni-scan-pair'));}
 function closeCard(){card.classList.add('is-collapsed');card.setAttribute('aria-expanded','false');toggle.textContent='← Scene';toggle.title='Return to observing scene';toggle.setAttribute('aria-label','Return to observing scene');indicator.hidden=true;}
 closeCard();
 toggle.onclick=()=>card.classList.contains('is-collapsed')?openCard():closeCard();
 function stop(){playing=false;lastIndex=-1;setStoryState({playing:false,selectedVisit:null,progress:.5});cardReplay.textContent='▶ Motion preview';cardReplay.setAttribute('aria-pressed','false');indicator.hidden=true;}
 function play(){if(playing){stop();return;}if(getComparison().images.length!==2)return;document.dispatchEvent(new Event('omni-stop-blink'));playing=true;started=performance.now();lastIndex=-1;cardReplay.textContent='Ⅱ Pause motion';cardReplay.setAttribute('aria-pressed','true');}
 cardReplay.onclick=play;
 visitButton.onclick=()=>{if(getComparison().images.length!==2)return;openCard();};
 document.addEventListener('omni-stop-replay',stop);
 async function choosePair(event){const ai=Number(a.value),bi=Number(b.value);if(ai===bi){$('stageTime').textContent='Choose two different visits.';return;}document.dispatchEvent(new Event('omni-stop-blink'));stop();busy=true;loadError='';visitButton.disabled=true;replayButton.disabled=true;$('stageTime').textContent='Reading the selected FITS images…';try{if(await loadPairChoice(ai,bi))selectVisit(event?.target===b?'B':'A');else loadError=$('surveyStatus').textContent||'The selected visit could not be opened.';}finally{busy=false;visitButton.disabled=false;replayButton.disabled=false;lastSignature='';drawComparison();}}
 a.onchange=choosePair;b.onchange=choosePair;
 band.onchange=async()=>{document.dispatchEvent(new Event('omni-stop-blink'));stop();busy=true;loadError='';visitButton.disabled=true;replayButton.disabled=true;$('stageTime').textContent=`Reading detector ${band.value}…`;try{if(!await chooseDetector(Number(band.value)))loadError=$('surveyStatus').textContent||'This detector could not be opened.';}finally{busy=false;visitButton.disabled=false;replayButton.disabled=false;lastSignature='';drawComparison();}};
 function choices(data){const signature=data.detector+'|'+data.choices.map(r=>r.id+':'+r.date).join('|');if(signature===lastSignature){if(!busy&&!data.busy)for(const [select,selected] of [[a,data.selectedChoices[0]],[b,data.selectedChoices[1]]])if(selected>=0&&select.value!==String(selected))select.value=String(selected);return;}lastSignature=signature;for(const [select,selected] of [[a,data.selectedChoices[0]],[b,data.selectedChoices[1]]]){select.replaceChildren();for(const item of data.choices){const option=document.createElement('option');option.value=String(item.index);option.textContent=`${item.date} · ${item.id||'observation '+(item.index+1)}`;select.appendChild(option);}select.value=String(selected??'');}
  a.disabled=b.disabled=data.choices.length<2||busy;const first=data.choices.find(item=>item.index===Number(a.value)),second=data.choices.find(item=>item.index===Number(b.value));const summary=$('visitSummary').querySelector('span');summary.textContent=first&&second?`${first.date} → ${second.date}`:'Choose two visits';}
 function update(time){const data=getComparison();choices(data);const first=data.choices.find(item=>item.index===data.selectedChoices[0]),second=data.choices.find(item=>item.index===data.selectedChoices[1]);$('visitSummary').querySelector('span').textContent=first&&second?`${first.date} → ${second.date}`:'Choose two visits';visitButton.disabled=busy||data.busy||data.images.length!==2;stageTimeLapse.disabled=visitButton.disabled;cardReplay.disabled=visitButton.disabled;timeLapse.disabled=visitButton.disabled;band.disabled=busy||data.busy;
  if(data.field){
   const isVela=Math.abs(data.field.ra-127.69444)<.01&&Math.abs(data.field.dec+39.1776)<.01;
   $('stageField').textContent=isVela?'Vela':`RA ${data.field.ra.toFixed(3)}° · Dec ${data.field.dec.toFixed(3)}°`;
   $('stageField').title=`RA ${data.field.ra.toFixed(3)}° · Dec ${data.field.dec.toFixed(3)}°`;
  }
  if(playing&&(data.busy||data.images.length!==2))stop();
  let index=data.visit,progress=.5;
  if(playing){const cycle=(time-started)/4600,indexNow=Math.floor(cycle)%2;progress=cycle%1;index=indexNow;if(lastIndex!==index){lastIndex=index;selectVisit(index?'B':'A');}setStoryState({playing:true,selectedVisit:index,progress});}
  if(time-lastPaint<90)return;lastPaint=time;
  syncBandChoices();
  const pos=data.positions[index];
  if(pos){const xyz=pos.start.map((v,i)=>v+(pos.end[i]-v)*progress);const altitude=Math.hypot(...xyz)-6371;
   $('stageTime').textContent=`${index?'B · later':'A · earlier'} · ${data.observationTimes[index]||data.dates[index]||'archived exposure'} UTC`;
   $('stageCoords').textContent=`Spacecraft from Earth center: X ${Math.round(xyz[0])}, Y ${Math.round(xyz[1])}, Z ${Math.round(xyz[2])} km · ~${Math.round(altitude)} km altitude`;
   $('missionLiveOrbit').textContent=`Recorded position: X ${Math.round(xyz[0])} · Y ${Math.round(xyz[1])} · Z ${Math.round(xyz[2])} km from Earth center · ~${Math.round(altitude)} km altitude`;
  }else if(!busy){$('stageTime').textContent=data.images.length?'No recorded position in this exposure.':'Opening archived observations…';$('stageCoords').textContent='A real position is shown only when the FITS metadata provides it.';$('missionLiveOrbit').textContent='Recorded spacecraft coordinates are unavailable for this exposure.';}
  const pixel=scanSample(progress,index);
  updateBandRail();
  const marker=$('missionSpectrumMarker');marker.hidden=!pixel;
  if(pixel){marker.style.left=`${Math.max(0,Math.min(100,(pixel.wavelength-.75)/4.26*100))}%`;$('missionSpectrumValue').textContent=`${pixel.wavelength.toFixed(3)} \u00b5m`;}
  else $('missionSpectrumValue').textContent='No clean pixel';
  const selectedRange=bands[Number(band.value)-1]||bands[1],shownWave=pixel?.wavelength??(selectedRange[0]+selectedRange[1])/2;
  const period=12+(shownWave-.75)/4.26*19,phase=playing?time*.006:0;
  wavePath.setAttribute('d',Array.from({length:47},(_,i)=>{const x=i*2,y=13-Math.sin(x*Math.PI*2/period-phase)*7;return `${i?'L':'M'}${x} ${y.toFixed(2)}`;}).join(' '));
  if(loadError)$('stageTime').textContent=loadError;
  $('stageWave').textContent=pixel?`Image sample · ${pixel.wavelength.toFixed(3)} µm infrared`:'No clean pixel at this wavelength.';
  $('stageWave').title=pixel?`Measured at image pixel ${pixel.x}, ${pixel.y}`:'';
  $('missionLiveWave').textContent=pixel?`${index?'Later':'Earlier'} exposure · measured infrared ${pixel.wavelength.toFixed(4)} µm at pixel ${pixel.x}, ${pixel.y}`:`${index?'Later':'Earlier'} exposure · no clean wavelength sample in this band`;
  if(playing&&!card.classList.contains('is-collapsed')&&pixel&&Number(card.dataset.imageZoom||1)===1&&card.dataset.stacked!=='true'){const area=card.querySelector('.mission-image-area'),canvas=$('missionCanvas');const areaRect=area.getBoundingClientRect(),rect=canvas.getBoundingClientRect();indicator.hidden=false;indicator.style.left=`${rect.left-areaRect.left+rect.width*(index? .5+pixel.x/280*.5:pixel.x/280*.5)}px`;indicator.dataset.visit=index?'B':'A';}
  else indicator.hidden=true;
 }
 document.addEventListener('omni-comparison-frame',()=>update(performance.now()));
 document.addEventListener('omni-observe-request',e=>{if(e.detail?.comparison)openCard()});
 update(performance.now());
}
