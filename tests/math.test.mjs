import test from "node:test";
import assert from "node:assert/strict";
import { analyze, reconstruct, evaluate, weightsFor, presetSamples, parseControlPoints, resamplePeriodic, TAU } from "../web/math.mjs";
const close=(actual,expected,tolerance=1e-10)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} is not close to ${expected}`);
const signal=(f,n=256)=>Array.from({length:n},(_,j)=>f(j/n));

test("DC normalization preserves the mean without the historical a0/2 ambiguity",()=>{
  const model=analyze(signal(()=>2.5));
  close(model.mean,2.5);close(model.bins[0].amplitude,2.5);close(model.bins[0].energy,6.25);
  const result=reconstruct(model,{cutoff:0});result.values.forEach(value=>close(value,2.5));close(result.rmse,0);
});
test("a cosine has its expected amplitude, phase and one-sided energy",()=>{
  const model=analyze(signal(t=>.7*Math.cos(TAU*3*t+.4))),bin=model.bins[3];
  close(bin.amplitude,.7);close(bin.phase,.4);close(bin.energy,.7**2/2);
  close(reconstruct(model,{cutoff:3}).rmse,0);close(reconstruct(model,{cutoff:2}).rmse,.7/Math.sqrt(2));
});
test("a positive sine uses negative pi/2 cosine phase",()=>{
  const model=analyze(signal(t=>Math.sin(TAU*7*t)));
  close(model.bins[7].phase,-Math.PI/2);close(model.bins[7].im,-.5);close(model.bins[7].amplitude,1);
});
test("Nyquist amplitude and energy are not doubled",()=>{
  const model=analyze(Array.from({length:256},(_,j)=>j%2?-1:1));
  close(model.bins[128].amplitude,1);close(model.bins[128].energy,1);
  close(reconstruct(model,{cutoff:127}).rmse,1);close(reconstruct(model,{cutoff:128}).rmse,0);
});
test("full reconstruction round-trips deterministic data and satisfies Parseval",()=>{
  let seed=42;const samples=Array.from({length:256},()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2**32*2-1;});
  const model=analyze(samples),result=reconstruct(model);
  result.values.forEach((value,j)=>close(value,samples[j]));close(result.parsevalError,0);close(result.energyRatio,1);
});
test("muting a tone produces its RMS residual and removes its energy",()=>{
  const model=analyze(presetSamples("mixture"));
  const result=reconstruct(model,{cutoff:32,muted:[7]});
  close(result.rmse,.35/Math.sqrt(2));close(result.outputEnergy,model.energy-.35**2/2);close(result.mseIdentityError,0);
  close(reconstruct(model,{cutoff:32,muted:[0]}).rmse,.2);
});
test("Fejer weights match the average of all partial sums 0 through K",()=>{
  const model=analyze(presetSamples("square")),cutoff=8,result=reconstruct(model,{cutoff,mode:"fejer"});
  close(result.weights[0],1);close(result.weights[8],1/9);
  for(const j of [0,1,31,64,127,255]){
    const mean=Array.from({length:cutoff+1},(_,k)=>evaluate(model,j/256,weightsFor(model,{cutoff:k}))).reduce((a,b)=>a+b,0)/(cutoff+1);
    close(result.values[j],mean);
  }
  close(result.mseIdentityError,0);
});
test("higher orthogonal partial sums cannot increase sample RMSE",()=>{
  const model=analyze(presetSamples("sawtooth"));let previous=Infinity;
  for(const cutoff of [0,1,4,8,16,32,64,128]){const result=reconstruct(model,{cutoff});assert.ok(result.rmse<=previous+1e-12);previous=result.rmse;close(result.mseIdentityError,0);}
});
test("a 200-cycle sine aliases to a negative 56-cycle sine at N=256",()=>{
  const samples=presetSamples("alias"),model=analyze(samples);
  samples.forEach((value,j)=>close(value,-Math.sin(TAU*56*j/256)));
  close(model.bins[56].amplitude,1);close(model.bins[56].phase,Math.PI/2);
  close(reconstruct(model,{cutoff:56}).rmse,0);
});
test("periodic shift preserves amplitudes and rotates phase",()=>{
  const samples=signal(t=>Math.cos(TAU*5*t)),shifted=samples.map((_,j)=>samples[(j+11)%256]);
  const model=analyze(shifted);close(model.bins[5].amplitude,1);close(model.bins[5].phase,TAU*5*11/256);
});
test("zero signal has undefined energy ratio and phase, with zero error",()=>{
  const model=analyze(new Float64Array(256)),result=reconstruct(model);
  assert.equal(result.energyRatio,null);assert.equal(model.bins[0].phase,null);close(result.rmse,0);
});
test("text editing interpolates periodically and rejects invalid data atomically",()=>{
  const samples=parseControlPoints("0, 1, 0, -1");close(samples[0],0);close(samples[64],1);close(samples[192],-1);close(samples[255],-1/64);
  assert.equal(resamplePeriodic([1,1,1,1]).every(x=>x===1),true);
  for(const text of ["", "1,2,3", "1,2,NaN,4", "1,,oops,3", "1,2,3,1e999", "1,2,3,101"])assert.throws(()=>parseControlPoints(text));
  for(const values of [[1,2,3],[1,2,3,Infinity],"1,2,3,4"])assert.throws(()=>analyze(values));
  assert.throws(()=>weightsFor(analyze(samples),{cutoff:129}));
});
