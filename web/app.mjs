import { analyze, reconstruct, evaluate, presetSamples, parseControlPoints, PRESETS, TAU } from "./math.mjs";

const $ = id => document.getElementById(id);
const state = { preset: "square", samples: presetSamples("square"), cutoff: 8, mode: "partial", muted: new Set(), selected: 1, phase: 0.25, drawing: false, playing: false, lastFrame: 0, model: null, result: null, curve: [] };
const colors = { grid: "#2a3932", muted: "#859b90", text: "#8fa496", teal: "#6cdac4", accent: "#c4ed83", amber: "#f0bb7c" };
const numeric = value => Math.abs(value) < 5e-12 ? "0.0000" : Math.abs(value) < 0.0001 ? value.toExponential(2) : value.toFixed(4);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function announce(text, isError = false) { $("message").textContent = text; $("message").hidden = false; $("message").classList.toggle("error", isError); }
function attempt(action) { return event => { try { action(event); } catch(error) { announce(error.message, true); } }; }
function dimensions(canvas) {
  const rect = canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2);
  const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
  const ctx = canvas.getContext("2d"); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}
function axes(ctx, width, height, extent, ticks = 4) {
  const area = { x: 38, y: 15, width: width - 52, height: height - 42 };
  ctx.font = "9px ui-monospace, monospace"; ctx.fillStyle = colors.text; ctx.strokeStyle = colors.grid; ctx.lineWidth = 1;
  for (let i = 0; i <= ticks; i++) {
    const x = area.x + area.width * i / ticks;
    ctx.beginPath(); ctx.moveTo(x, area.y); ctx.lineTo(x, area.y + area.height); ctx.stroke();
    ctx.textAlign = "center"; ctx.fillText((i / ticks).toFixed(2), x, height - 8);
  }
  for (const value of [-extent, 0, extent]) {
    const y = area.y + area.height * (1 - value / extent) / 2;
    ctx.beginPath(); ctx.moveTo(area.x, y); ctx.lineTo(area.x + area.width, y); ctx.stroke();
    ctx.textAlign = "right"; ctx.fillText(value.toFixed(1), area.x - 8, y + 3);
  }
  return area;
}
function trace(ctx, values, area, extent, color, width = 2, closure = false) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
  values.forEach((value, i) => { const x = area.x + i / (closure ? values.length : values.length - 1) * area.width, y = area.y + (1 - value / extent) * area.height / 2; if (!i) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
  if (closure) ctx.lineTo(area.x + area.width, area.y + (1 - values[0] / extent) * area.height / 2);
  ctx.stroke();
}
function signalExtent() { return Math.max(1.5, ...state.samples.map(Math.abs), ...state.curve.map(Math.abs)) * 1.06; }
function drawSignal() {
  const { ctx, width, height } = dimensions($("signal")), extent = signalExtent(), area = axes(ctx, width, height, extent);
  state.signalArea = { ...area, extent };
  ctx.save(); ctx.beginPath(); ctx.rect(area.x, area.y - 2, area.width, area.height + 4); ctx.clip();
  ctx.setLineDash([3,4]); trace(ctx, state.samples, area, extent, colors.muted, 1.3, true); ctx.setLineDash([]);
  trace(ctx, state.curve, area, extent, colors.teal, 2.2);
  const x = area.x + state.phase * area.width, value = evaluate(state.model, state.phase, state.result.weights), y = area.y + (1 - value / extent) * area.height / 2;
  ctx.strokeStyle = "#c4ed8355"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x,area.y);ctx.lineTo(x,area.y+area.height);ctx.stroke();
  ctx.fillStyle = colors.accent;ctx.beginPath();ctx.arc(x,y,4,0,TAU);ctx.fill();ctx.restore();
  $("point-readout").textContent = `t = ${state.phase.toFixed(3)} · x̂ = ${value.toFixed(3)}`;
}
function drawSpectrum() {
  const { ctx, width, height } = dimensions($("spectrum")), count = Number($("spectrum-view").value), bins = state.model.bins.slice(0,count+1);
  const left = 38, top = 12, innerWidth = width - 52, innerHeight = height - 40, step = innerWidth / bins.length;
  const max = Math.max(0.01,...bins.map(bin=>bin.amplitude)) * 1.12;
  ctx.font = "9px ui-monospace, monospace";ctx.strokeStyle=colors.grid;ctx.fillStyle=colors.text;ctx.lineWidth=1;
  for(let i=0;i<=2;i++){const y=top+innerHeight*i/2;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+innerWidth,y);ctx.stroke();ctx.textAlign="right";ctx.fillText((max*(1-i/2)).toFixed(2),left-7,y+3);}
  for(const bin of bins){const h=bin.amplitude/max*innerHeight,x=left+bin.k*step;ctx.fillStyle=state.result.weights[bin.k]>0?colors.teal:"#425449";ctx.fillRect(x+step*.2,top+innerHeight-h,Math.max(1,step*.6),Math.max(1,h));
    if(bin.k===state.selected){ctx.strokeStyle=colors.amber;ctx.strokeRect(x+1,top+innerHeight-Math.max(5,h)-3,Math.max(1,step-2),Math.max(5,h)+3);}
    if(bin.k%(count===32?8:32)===0){ctx.fillStyle=colors.text;ctx.textAlign="center";ctx.fillText(String(bin.k),x+step/2,height-8);}}
  state.spectrumArea={left,step,count};
}
function drawPhasors() {
  const { ctx, width, height } = dimensions($("phasors"));
  const terms=state.model.bins.slice(1).filter(bin=>state.result.weights[bin.k]>0&&bin.amplitude>1e-10);
  const total=terms.reduce((sum,bin)=>sum+bin.amplitude*state.result.weights[bin.k],0), scale=Math.min(width*.39,height*.38)/Math.max(total,0.1);
  const origin={x:width/2,y:height/2};let x=origin.x,y=origin.y;
  ctx.strokeStyle=colors.grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(15,y);ctx.lineTo(width-15,y);ctx.moveTo(x,12);ctx.lineTo(x,height-18);ctx.stroke();
  for(const bin of terms){const radius=bin.amplitude*state.result.weights[bin.k]*scale,angle=TAU*bin.k*state.phase+(bin.phase??0);const nx=x+radius*Math.cos(angle),ny=y-radius*Math.sin(angle);
    ctx.strokeStyle="#536e5b80";ctx.beginPath();ctx.arc(x,y,radius,0,TAU);ctx.stroke();ctx.strokeStyle=colors.teal;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(nx,ny);ctx.stroke();x=nx;y=ny;}
  ctx.strokeStyle=colors.amber;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,origin.y);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle=colors.accent;ctx.beginPath();ctx.arc(x,y,4,0,TAU);ctx.fill();ctx.fillStyle=colors.amber;ctx.beginPath();ctx.arc(x,origin.y,3,0,TAU);ctx.fill();
  ctx.font="10px ui-monospace, monospace";ctx.textAlign="center";ctx.fillStyle=colors.text;ctx.fillText(`${terms.length} rotating ${terms.length===1?"component":"components"} · DC ${numeric(state.model.mean*state.result.weights[0])}`,width/2,height-3);
}
function updateInspector() {
  const bin=state.model.bins[state.selected], weight=state.result.weights[bin.k];
  $("component").value=String(bin.k);$("component-amplitude").textContent=numeric(bin.amplitude);$("component-phase").textContent=bin.phase===null?"undefined":numeric(bin.phase);
  $("component-energy").textContent=state.model.energy<1e-24?"—":`${(bin.energy/state.model.energy*100).toFixed(2)}%`;
  $("mute").textContent=`${state.muted.has(bin.k)?"Restore":"Mute"} bin ${bin.k}`;
  const term=bin.k===0?`DC = ${numeric(bin.re)}`:bin.phase===null?`Bin ${bin.k}: zero amplitude · phase undefined`:`${numeric(bin.amplitude)} cos(2π·${bin.k}·t ${bin.phase<0?"−":"+"} ${numeric(Math.abs(bin.phase))})`;
  $("component-formula").textContent=`${term} · weight ${weight.toFixed(3)}${bin.k>state.cutoff?" · outside cutoff":""}${state.muted.has(bin.k)?" · muted":""}`;
  $("restore").hidden=state.muted.size===0;
}
function renderPhase() { $("phase-value").textContent=state.phase.toFixed(3);$("phase").value=String(Math.round(state.phase*1000));drawSignal();drawPhasors(); }
function rebuild(analyzeAgain=false) {
  if(analyzeAgain)$("message").hidden=true;
  if(analyzeAgain||!state.model)state.model=analyze(state.samples);
  state.result=reconstruct(state.model,{cutoff:state.cutoff,mode:state.mode,muted:[...state.muted]});
  state.curve=Array.from({length:769},(_,j)=>evaluate(state.model,j/768,state.result.weights));
  $("cutoff-value").textContent=String(state.cutoff);$("cutoff").value=String(state.cutoff);
  document.querySelectorAll("[data-cutoff]").forEach(button=>button.classList.toggle("active",Number(button.dataset.cutoff)===state.cutoff));
  $("rmse").textContent=numeric(state.result.rmse);$("energy").textContent=state.result.energyRatio===null?"—":`${(100*state.result.energyRatio).toFixed(2)}%`;$("dc").textContent=numeric(state.model.mean);
  $("parseval").textContent=state.result.parsevalError.toExponential(2);
  $("method-note").textContent=state.mode==="partial"?"Keeps every component up to the cutoff at its measured amplitude.":"Tapers harmonic amplitudes toward zero. Less ringing, with a softer reconstruction.";
  const info=PRESETS[state.preset];
  $("signal-title").textContent=info?.title||"Your signal";$("signal-subtitle").textContent=info?.subtitle||"A shape made by you. A spectrum measured from it.";
  $("insight-title").textContent=state.preset==="alias"?"Sampling sets a limit.":state.preset==="mixture"?"Three peaks. One signal.":state.preset==="triangle"?"Smoothness leaves a trace.":"The edge tells the story.";
  $("insight-copy").textContent=info?.note||"Your 256 samples are treated as one repeating period. Any mismatch between the last and first values creates an edge at the boundary. Try smoothing that join and compare the high-frequency content.";
  $("experiment-copy").textContent=state.preset==="alias"?"Set the cutoff to 56, then inspect frequency bin 56. The input was generated at 200 cycles, but the samples carry no way to distinguish it.":state.preset==="mixture"?"Set the cutoff to 32. Inspect and mute bin 7, then restore it. The error equals the RMS contribution of the removed sinusoid.":"Compare 8 and 32 harmonics. Then switch to Fejér averaging to trade sharpness for smoother transitions.";
  updateInspector();drawSpectrum();renderPhase();
}
function setDraw(active) { state.drawing=active;$("draw").setAttribute("aria-pressed",String(active));$("draw").firstChild.textContent=active?"Finish drawing ":"Draw your own ";$("signal").classList.toggle("drawing",active);$("drawing-hint").hidden=!active; }
$("preset").addEventListener("change",()=>{state.preset=$("preset").value;state.muted.clear();setDraw(false);if(state.preset!=="custom")state.samples=presetSamples(state.preset);rebuild(true);});
$("draw").addEventListener("click",()=>{setDraw(!state.drawing);if(state.drawing){state.preset="custom";$("preset").value="custom";state.samples=state.samples.map(value=>clamp(value,-1.5,1.5));rebuild(true);announce("Drawing enabled. Drag across the input chart to edit samples. The text editor is an alternative for keyboard input.");}});
$("apply-samples").addEventListener("click",attempt(()=>{const samples=parseControlPoints($("samples").value);state.samples=samples;state.preset="custom";$("preset").value="custom";state.muted.clear();setDraw(false);rebuild(true);announce("Your values were periodically interpolated to 256 samples. The spectrum and reconstruction are updated.");}));
$("cutoff").addEventListener("input",()=>{state.cutoff=Number($("cutoff").value);rebuild();});
document.querySelectorAll("[data-cutoff]").forEach(button=>button.addEventListener("click",()=>{state.cutoff=Number(button.dataset.cutoff);rebuild();}));
$("method-select").addEventListener("change",()=>{state.mode=$("method-select").value;rebuild();});
$("spectrum-view").addEventListener("change",drawSpectrum);
function selectComponent() { const text=$("component").value; if(text==="")return; const value=Number(text);state.selected=Number.isFinite(value)?clamp(Math.round(value),0,128):0;updateInspector();drawSpectrum(); }
$("component").addEventListener("input",selectComponent);
$("component").addEventListener("change",()=>{selectComponent();$("component").value=String(state.selected);});
$("mute").addEventListener("click",()=>{if(state.muted.has(state.selected))state.muted.delete(state.selected);else state.muted.add(state.selected);rebuild();});
$("restore").addEventListener("click",()=>{state.muted.clear();rebuild();});
$("spectrum").addEventListener("click",event=>{const rect=$("spectrum").getBoundingClientRect(),{left,step,count}=state.spectrumArea;state.selected=clamp(Math.floor((event.clientX-rect.left-left)/step),0,count);updateInspector();drawSpectrum();});
$("phase").addEventListener("input",()=>{state.phase=Number($("phase").value)/1000;renderPhase();});
function animate(now){if(!state.playing)return;const dt=state.lastFrame?Math.min((now-state.lastFrame)/1000,.1):0;state.lastFrame=now;state.phase=(state.phase+dt*.12)%1;renderPhase();requestAnimationFrame(animate);}
function stop(){state.playing=false;state.lastFrame=0;$("play").textContent="Play";$("play").setAttribute("aria-pressed","false");}
$("play").addEventListener("click",()=>{if(state.playing)stop();else{state.playing=true;$("play").textContent="Pause";$("play").setAttribute("aria-pressed","true");requestAnimationFrame(animate);}});
document.addEventListener("visibilitychange",()=>{if(document.hidden)stop();});
let previousPoint=null, pendingDraw=false;
function pointerPoint(event){const rect=$("signal").getBoundingClientRect(),area=state.signalArea;return {index:clamp(Math.round((event.clientX-rect.left-area.x)/area.width*256),0,255),value:clamp((1-2*(event.clientY-rect.top-area.y)/area.height)*area.extent,-1.5,1.5)};}
function paint(event){const point=pointerPoint(event);if(previousPoint){const low=Math.min(previousPoint.index,point.index),high=Math.max(previousPoint.index,point.index);for(let j=low;j<=high;j++){const fraction=point.index===previousPoint.index?1:(j-previousPoint.index)/(point.index-previousPoint.index);state.samples[j]=previousPoint.value+(point.value-previousPoint.value)*fraction;}}else state.samples[point.index]=point.value;previousPoint=point;
  if(!pendingDraw){pendingDraw=true;requestAnimationFrame(()=>{pendingDraw=false;rebuild(true);});}}
$("signal").addEventListener("pointerdown",event=>{if(!state.drawing){const rect=$("signal").getBoundingClientRect();state.phase=clamp((event.clientX-rect.left-state.signalArea.x)/state.signalArea.width,0,1);renderPhase();return;}event.preventDefault();stop();$("signal").setPointerCapture(event.pointerId);previousPoint=null;paint(event);});
$("signal").addEventListener("pointermove",event=>{if(state.drawing&&$("signal").hasPointerCapture(event.pointerId))paint(event);});
for(const name of ["pointerup","pointercancel"])$("signal").addEventListener(name,event=>{if($("signal").hasPointerCapture(event.pointerId))$("signal").releasePointerCapture(event.pointerId);previousPoint=null;});
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type})),anchor=document.createElement("a");anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);announce(`${name} exported from the current signal and settings.`);}
$("export-data").addEventListener("click",()=>{const rows=["sample,time_periods,input,reconstruction,residual"];state.samples.forEach((value,j)=>rows.push([j,j/256,value,state.result.values[j],value-state.result.values[j]].join(",")));download(rows.join("\n"),"fourier-samples.csv","text/csv;charset=utf-8");});
$("export-spectrum").addEventListener("click",()=>{const rows=["frequency_cycles_per_period,real,imaginary,one_sided_amplitude,phase_radians,input_mean_square_energy,reconstruction_weight"];state.model.bins.forEach(bin=>rows.push([bin.k,bin.re,bin.im,bin.amplitude,bin.phase??"",bin.energy,state.result.weights[bin.k]].join(",")));download(rows.join("\n"),"fourier-coefficients.csv","text/csv;charset=utf-8");});
$("export-svg").addEventListener("click",()=>{const extent=signalExtent(),path=(values,closed)=>values.map((value,j)=>`${j?"L":"M"}${(60+j/(closed?values.length:values.length-1)*880).toFixed(2)},${(190-value/extent*125).toFixed(2)}`).join(" ")+(closed?` L940,${(190-values[0]/extent*125).toFixed(2)}`:"");const title=PRESETS[state.preset]?.title||"Custom signal";
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="400" viewBox="0 0 1000 400"><title>Fourier Lab — ${title}</title><rect width="1000" height="400" fill="#101716"/><g fill="#eef2df" font-family="sans-serif"><text x="60" y="37" font-size="20">${title} · ${state.cutoff} harmonic cutoff · ${state.mode==="fejer"?"Fejér average":"Partial sum"}</text><text x="60" y="365" font-size="12">256 samples · RMSE ${numeric(state.result.rmse)} · teal: reconstruction · gray: input · normalized time [0, 1]</text></g><path d="M60 190H940" stroke="#35483c"/><path d="${path(state.samples,true)}" fill="none" stroke="#859b90" stroke-width="1.5" stroke-dasharray="4 4"/><path d="${path(state.curve,false)}" fill="none" stroke="#6cdac4" stroke-width="2.5"/></svg>`;
  download(svg,"fourier-signal.svg","image/svg+xml");});
new ResizeObserver(()=>{if(state.model){drawSignal();drawSpectrum();drawPhasors();}}).observe($("signal"));
rebuild(true);
