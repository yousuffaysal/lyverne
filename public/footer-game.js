import { createRound, sliceTarget, loseLife, createTarget, advanceTarget, segmentHitsCircle, clamp } from './footer-game-model.js';

const stage = document.querySelector('[data-footer-game]');
const canvas = stage?.querySelector('canvas');
const ctx = canvas?.getContext('2d');
if (ctx) initGame();

function initGame() {
  const footer = stage.closest('footer');
  const playButton = footer.querySelector('[data-game-play]');
  const pauseButton = footer.querySelector('[data-game-pause]');
  const scoreOutput = footer.querySelector('[data-game-score]');
  const lifeOutput = footer.querySelector('[data-game-lives]');
  const bestOutput = footer.querySelector('[data-game-best]');
  const live = footer.querySelector('[data-game-announcement]');
  const instruction = footer.querySelector('[data-game-instruction]');
  const result = stage.querySelector('[data-game-result]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let round = createRound(), width = 1, height = 1, ratio = 1, nextID = 0;
  let targets = [], fragments = [], particles = [], labels = [], trail = [];
  let clock = 0, nextThrow = 0, previousFrame = 0, frame = null, visible = false;
  let manualPause = false, sitePause = document.body.classList.contains('motion-paused');
  let pointer = null, touchID = null, best = 0, ready = false, lastAnnouncement = 0;
  try { best = Number(localStorage.getItem('lyverne-cut-best')) || 0; } catch {}
  bestOutput.textContent = `PERSONAL BEST ${best}`;
  const images = ['/assets/tee-orange.webp','/assets/tee-cream.webp','/assets/tee-charcoal.webp'].map(src => {
    const image = new Image(); image.src = src; return image;
  });
  Promise.all(images.map(image => image.decode().catch(() => null))).then(() => { ready = true; schedule(); });

  function announce(message) { live.textContent = message; }
  function updateHUD() {
    scoreOutput.value = String(round.score);
    lifeOutput.setAttribute('aria-label', `${round.lives} of 3 lives remaining`);
    [...lifeOutput.children].forEach((dot, i) => dot.classList.toggle('is-lost', i >= round.lives));
    stage.dataset.gameState = round.status;
  }
  function resize() {
    const rect = stage.getBoundingClientRect();
    const oldWidth = width, oldHeight = height;
    width = rect.width; height = rect.height;
    ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    for (const target of targets) { target.x *= width / oldWidth; target.y *= height / oldHeight; target.vx *= width / oldWidth; target.vy *= height / oldHeight; target.gravity *= height / oldHeight; target.radius = clamp(width * .046, 28, 53); }
    fragments = []; particles = []; labels = []; trail = []; pointer = null;
    draw();
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(stage);
  function allowed() {
    return visible && ready && !document.hidden && !manualPause && !sitePause && round.status !== 'over' && (round.status === 'playing' || !reduced.matches);
  }
  function schedule() { if (frame === null && allowed()) { previousFrame = 0; frame = requestAnimationFrame(tick); } }
  function suspend() { if (frame !== null) cancelAnimationFrame(frame); frame = null; pointer = null; touchID = null; trail = []; }
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) schedule(); else suspend();
  }, { threshold: .18 }); visibility.observe(stage);
  document.addEventListener('visibilitychange', () => { document.hidden ? suspend() : schedule(); });
  window.addEventListener('lyverne-motion', event => {
    sitePause = event.detail.paused;
    if (sitePause) { suspend(); announce('Game paused with page motion. Resume page motion to continue.'); }
    else schedule();
    syncPause();
  });
  reduced.addEventListener('change', () => { if (round.status === 'ready' && reduced.matches) { suspend(); targets = []; draw(); } else schedule(); });

  function syncPause() {
    pauseButton.textContent = manualPause ? 'Resume' : 'Pause';
    pauseButton.setAttribute('aria-pressed', String(manualPause || sitePause));
    if (sitePause) instruction.textContent = 'Page motion is paused. Use Play to resume the game.';
  }
  function start(focus = true) {
    round = createRound(); round.status = 'playing'; clock = 0; nextThrow = .15;
    targets = []; fragments = []; particles = []; labels = []; trail = []; pointer = null;
    manualPause = false; lastAnnouncement = -1;
    const first = createTarget(width, height, ++nextID, 0);
    first.x = width * .5; first.y = height * .64; first.vy = -height * .6; first.vx = 20;
    targets.push(first); nextThrow = 1.1;
    // The visitor explicitly requested to play; resume through the existing page control.
    if (sitePause) document.querySelector('.motion-toggle')?.click();
    sitePause = false;
    canvas.classList.add('is-playing');
    result.hidden = true; playButton.textContent = 'Restart'; pauseButton.hidden = false;
    instruction.textContent = 'Slice the flying tees. Avoid ×. Three misses end the round.';
    syncPause(); updateHUD(); announce('Round started. Swipe through tees. Avoid the cross. Keyboard: press Space to slice a tee, P to pause.');
    if (focus) canvas.focus({ preventScroll: true });
    schedule();
  }
  function finish() {
    best = Math.max(best, round.score);
    try { localStorage.setItem('lyverne-cut-best', String(best)); } catch {}
    bestOutput.textContent = `PERSONAL BEST ${best}`;
    canvas.classList.remove('is-playing'); pauseButton.hidden = true; playButton.textContent = 'Play again';
    result.querySelector('p').textContent = `${round.score} points · Best combo ×${round.bestCombo} · Personal best ${best}`;
    result.hidden = false;
    announce(`Round over. ${round.score} points. Your best is ${best}. Play again to restart.`);
    if (document.activeElement === canvas) result.querySelector('button').focus({ preventScroll: true });
    updateHUD();
  }
  playButton.addEventListener('click', () => start());
  result.querySelector('button').addEventListener('click', () => start());
  pauseButton.addEventListener('click', togglePause);
  function togglePause() {
    if (round.status !== 'playing') return;
    if (sitePause) { document.querySelector('.motion-toggle')?.click(); sitePause = false; }
    manualPause = !manualPause; syncPause();
    announce(manualPause ? 'Game paused.' : 'Game resumed.');
    if (manualPause) suspend(); else schedule();
  }

  function point(event) { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top, time: clock }; }
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    if (round.status === 'ready') start(false);
    if (round.status !== 'playing' || manualPause || sitePause) return;
    if (event.pointerType !== 'mouse') { touchID = event.pointerId; canvas.setPointerCapture(event.pointerId); }
    pointer = point(event); cut(pointer, pointer);
  });
  canvas.addEventListener('pointermove', event => {
    if (!allowed()) return;
    if (event.pointerType !== 'mouse' && event.pointerId !== touchID) return;
    const next = point(event);
    if (round.status === 'ready' && pointer && Math.hypot(next.x-pointer.x,next.y-pointer.y)>5) start(false);
    if (round.status !== 'playing') { pointer = next; return; }
    if (pointer) cut(pointer, next);
    pointer = next;
    trail.push(next); if (trail.length > 20) trail.shift();
  });
  function clearPointer(event) { if (event.pointerType !== 'mouse' || event.type !== 'pointerup') pointer = null; touchID = null; }
  canvas.addEventListener('pointerup', clearPointer);
  canvas.addEventListener('pointercancel', clearPointer);
  canvas.addEventListener('lostpointercapture', clearPointer);
  canvas.addEventListener('pointerleave', () => { pointer = null; });
  canvas.addEventListener('keydown', event => {
    if (['Space','Enter','KeyP','Escape'].includes(event.code)) event.preventDefault(); else return;
    if (event.repeat) return;
    if (event.code === 'KeyP' || event.code === 'Escape') { togglePause(); return; }
    if (round.status !== 'playing') { start(); return; }
    if (manualPause || sitePause) return;
    // Keyboard assist uses the same hit and score rules, with a safe visible target.
    const target = targets.filter(t => !t.hazard && !t.sliced && t.y > t.radius && t.y < height-t.radius).sort((a,b)=>b.y-a.y)[0];
    if (target) cut({x:target.x-target.radius*1.4,y:target.y},{x:target.x+target.radius*1.4,y:target.y});
  });
  function cut(from, to) {
    if (round.status !== 'playing') return;
    for (const target of targets) {
      if (target.sliced || !segmentHitsCircle(from,to,target)) continue;
      const hit = sliceTarget(round,target,clock);
      if (!hit) continue;
      if (hit.hazard) {
        labels.push({x:target.x,y:target.y,text:'−1 LIFE',life:1,color:'#f3eee4'});
        announce(`${round.lives} lives remaining. Avoid the cross.`);
      } else {
        labels.push({x:target.x,y:target.y,text:hit.combo>1?`×${hit.combo} COMBO  +${hit.points}`:`+${hit.points}`,life:1,color:'#f26b24'});
        if (!reduced.matches) {
          for (const side of [-1,1]) fragments.push({...target,side,vx:target.vx+side*120,vy:target.vy-45,spin:side*3,life:.8});
          for(let i=0;i<9;i++) particles.push({x:target.x,y:target.y,vx:(Math.random()-.5)*230,vy:-Math.random()*170,life:.6,color:i%2?'#f26b24':'#f3eee4'});
        }
        if (clock-lastAnnouncement>.8) { announce(`${round.score} points${hit.combo>1?`, combo ${hit.combo}`:''}.`); lastAnnouncement=clock; }
      }
      updateHUD();
      if (round.status === 'over') { finish(); break; }
    }
    trail.push({...from,time:clock},{...to,time:clock});
  }
  function tick(timestamp) {
    frame = null;
    if (!allowed()) return;
    const dt = previousFrame ? Math.min((timestamp-previousFrame)/1000,.035) : 0;
    previousFrame = timestamp; clock += dt;
    if (clock >= nextThrow) {
      const count = round.score > 100 && Math.random() > .55 ? 2 : 1;
      for(let i=0;i<count;i++) targets.push(createTarget(width,height,++nextID,round.status==='playing'?round.score:0));
      nextThrow = clock + Math.max(.65,1.18-round.score/1500) + Math.random()*.24;
    }
    for (const target of targets) {
      if (target.sliced) continue;
      advanceTarget(target,dt);
      if (target.entered && target.y > height+target.radius*2) {
        target.sliced = true;
        if (!target.hazard && round.status === 'playing') {
          loseLife(round); updateHUD(); announce(`Missed a tee. ${round.lives} lives remaining.`);
          if (round.status === 'over') { finish(); break; }
        }
      }
    }
    targets = targets.filter(t=>!t.sliced);
    for (const part of fragments) { advanceTarget(part,dt); part.life -= dt; }
    fragments = fragments.filter(p=>p.life>0);
    for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=400*dt;p.life-=dt;}
    particles = particles.filter(p=>p.life>0);
    for(const label of labels){label.y-=36*dt;label.life-=dt;}
    labels = labels.filter(l=>l.life>0);
    trail = trail.filter(p=>clock-p.time<.17);
    draw();
    if (allowed()) frame = requestAnimationFrame(tick);
  }
  function drawTarget(target, side = 0) {
    ctx.save(); ctx.translate(target.x,target.y); ctx.rotate(target.angle);
    const radius = target.radius;
    if (target.hazard) {
      ctx.fillStyle='#20201c';ctx.strokeStyle='#f26b24';ctx.lineWidth=2.5;
      ctx.beginPath();ctx.arc(0,0,radius*.72,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.strokeStyle='#f3eee4';ctx.lineWidth=3;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(-10,-10);ctx.lineTo(10,10);ctx.moveTo(10,-10);ctx.lineTo(-10,10);ctx.stroke();
    } else {
      if(side){ctx.beginPath();ctx.rect(side<0?-radius*1.4:0,-radius*1.4,radius*1.4,radius*2.8);ctx.clip();}
      const image = images[target.image];
      if(image.complete && image.naturalWidth){
        ctx.shadowColor='#0009';ctx.shadowBlur=12;ctx.shadowOffsetY=5;
        ctx.drawImage(image,-radius*1.45,-radius*1.45,radius*2.9,radius*2.9);
      } else {
        // Asset failures remain playable with a simple branded token.
        ctx.fillStyle='#f26b24';ctx.fillRect(-radius*.75,-radius*.75,radius*1.5,radius*1.5);
        ctx.fillStyle='#20201c';ctx.font='700 26px Khand, sans-serif';ctx.textAlign='center';ctx.fillText('LY',0,9);
      }
    }
    ctx.restore();
  }
  function draw() {
    ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,width,height);
    for(const target of targets) drawTarget(target);
    for(const part of fragments){ctx.globalAlpha=Math.min(1,part.life*2);drawTarget(part,part.side);} ctx.globalAlpha=1;
    for(const p of particles){ctx.globalAlpha=p.life/.6;ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,3,5);}ctx.globalAlpha=1;
    if(!reduced.matches && trail.length>1){
      ctx.lineCap='round';ctx.lineJoin='round';
      for(let i=1;i<trail.length;i++){
        const a=trail[i-1],b=trail[i]; if(Math.hypot(b.x-a.x,b.y-a.y)>width*.85)continue;
        ctx.strokeStyle='#f26b24';ctx.lineWidth=1+5*i/trail.length;ctx.globalAlpha=Math.max(0,1-(clock-b.time)/.17);
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
        ctx.strokeStyle='#f3eee4';ctx.lineWidth=1.5;ctx.stroke();
      }ctx.globalAlpha=1;
    }
    for(const label of labels){ctx.globalAlpha=Math.min(1,label.life*2);ctx.fillStyle=label.color;ctx.font='700 25px Khand, sans-serif';ctx.textAlign='center';ctx.fillText(label.text,clamp(label.x,80,width-80),label.y);}ctx.globalAlpha=1;
  }
  canvas.hidden = false; footer.querySelector('[data-game-hud]').hidden = false;
  updateHUD(); resize();
}
