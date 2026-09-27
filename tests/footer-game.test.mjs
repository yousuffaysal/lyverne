import test from 'node:test';
import assert from 'node:assert/strict';
import {createRound, sliceTarget, loseLife, segmentHitsCircle, createTarget, advanceTarget} from '../public/footer-game-model.js';
test('a fast swipe detects an object between pointer samples, including a zero-length tap',()=>{
  const target={x:50,y:30,radius:12};
  assert.equal(segmentHitsCircle({x:0,y:30},{x:100,y:30},target),true);
  assert.equal(segmentHitsCircle({x:50,y:30},{x:50,y:30},target),true);
  assert.equal(segmentHitsCircle({x:0,y:45},{x:100,y:45},target),false);
});
test('score combos expire, cap at five, and a target cannot score twice',()=>{
  const r=createRound();r.status='playing';const t={};
  assert.equal(sliceTarget(r,t,0).points,10);assert.equal(sliceTarget(r,t,.1),null);
  for(let i=1;i<=6;i++)sliceTarget(r,{},i*.1);
  assert.equal(r.combo,5);assert.equal(r.score,250);
  assert.equal(sliceTarget(r,{},2).points,10);assert.equal(r.combo,1);
});
test('misses and hazards spend three lives and end a round without awarding hazard points',()=>{
  const r=createRound();assert.equal(loseLife(r),false);r.status='playing';
  sliceTarget(r,{},0);sliceTarget(r,{hazard:true},.1);assert.equal(r.score,10);assert.equal(r.combo,0);
  loseLife(r);loseLife(r);assert.equal(r.lives,0);assert.equal(r.status,'over');
  assert.equal(sliceTarget(r,{},1),null);assert.equal(loseLife(r),false);
  assert.equal(createRound().lives,3);
});
test('throws are visible and return below the stage at desktop and mobile sizes',()=>{
  for(const [w,h] of [[1200,440],[320,390]]){
    const t=createTarget(w,h,1,0,()=>.5);let minY=t.y;
    for(let i=0;i<210;i++){advanceTarget(t,1/60);minY=Math.min(minY,t.y);}
    assert.ok(minY>t.radius && minY<h*.5);assert.ok(t.y>h+t.radius*2);assert.equal(t.hazard,false);
  }
});
test('projectile motion is independent of frame rate',()=>{
  const a=createTarget(800,440,1,0,()=>.4),b={...a};
  for(let i=0;i<60;i++)advanceTarget(a,1/60);
  for(let i=0;i<30;i++)advanceTarget(b,1/30);
  assert.ok(Math.abs(a.y-b.y)<1e-8);assert.ok(Math.abs(a.x-b.x)<1e-8);
});
