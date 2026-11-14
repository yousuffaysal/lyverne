import * as THREE from 'three';
// A lightweight depth-deformed image mesh: photographic cloth, spatial motion,
// and alpha edges. This is not a downloadable garment CAD/GLB model.
export async function initProductScene({paused:initialPaused=false}={}){
 const canvas=document.getElementById('product-canvas');
 const stage=document.getElementById('shirt-stage');
 const story=document.querySelector('.product-story');
 const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setClearColor(0x000000,0);
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 const scene=new THREE.Scene();
 const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,3000);camera.position.z=1500;
 const texture=await new THREE.TextureLoader().loadAsync('/assets/hero-tee.png');texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
 const geometry=new THREE.PlaneGeometry(1,1,48,48);
 const vertices=geometry.attributes.position;
 for(let i=0;i<vertices.count;i++){const x=vertices.getX(i),y=vertices.getY(i);vertices.setZ(i,.10*Math.cos(x*3.8)+.017*Math.sin(y*12+x*10))}geometry.computeVertexNormals();
 const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.035,side:THREE.DoubleSide,depthWrite:false});
 const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);
 let w=innerWidth,h=innerHeight,scrollY=window.scrollY,paused=initialPaused,visible=true,pointer={x:0,y:0},target={x:0,y:0},time=0,last=0,raf=0;
 let dimensions={hero:0,essence:0,detail:0,end:0,slot:0};
 // On a phone the tee is as wide as the screen, so it cannot hang in the
 // viewport while the headline scrolls past -- it would sit on the words. The
 // essence headline leaves a gap between its two halves; this is the middle of
 // that gap, measured from the top of the section, and the tee docks there.
 const essenceEl=document.querySelector('.essence');
 function essenceSlot(){const halves=essenceEl.querySelectorAll('.split-title>span');if(halves.length<2)return essenceEl.offsetHeight/2;const top=essenceEl.getBoundingClientRect().top;return (halves[0].getBoundingClientRect().bottom+halves[1].getBoundingClientRect().top)/2-top}
 let docked=null;
 function resize(){w=stage.clientWidth;h=stage.clientHeight;renderer.setSize(w,h,false);camera.left=-w/2;camera.right=w/2;camera.top=h/2;camera.bottom=-h/2;camera.updateProjectionMatrix();dimensions={hero:document.querySelector('.hero').offsetHeight,essence:essenceEl.offsetTop,detail:document.querySelector('.details').offsetTop,end:story.offsetHeight,slot:essenceSlot()};render(performance.now())}
 const lerp=(a,b,t)=>a+(b-a)*t;
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
 function frame(now){raf=requestAnimationFrame(frame);if(!visible||document.hidden||paused)return;if(now-last<28)return;render(now)}
 function render(now){const dt=Math.min((now-last)/1000,.05)||.016;last=now;if(!paused)time+=dt;const mobile=w<=650;let x=.52,y=.53,size=Math.min(w*.54,h*.90),angle=-.04,tilt=.06;
   if(mobile){x=.51;y=Math.min(486,h*.64)/h;size=Math.min(w*.97,460);angle=-.06}
   const p1=smooth((scrollY-dimensions.essence*.25)/(dimensions.essence*.70));
   const p2=smooth((scrollY-dimensions.essence-.10*h)/(dimensions.detail-dimensions.essence-.1*h));
   let m1=p1,m2=p2;
   if(mobile){
    // Three stations, each scrolling with its own section: the tee waits at its
    // hero height until the essence gap rises to meet it, rides that gap off the
    // top of the screen, then comes up with the details and settles there. The
    // change of station happens while it is out of sight.
    const heroY=y*h,slotY=dimensions.essence+dimensions.slot-scrollY,slotSize=Math.min(w*.96,460);
    const isDocked=slotY<=heroY+12;
    if(isDocked!==docked){docked=isDocked;essenceEl.classList.toggle('is-docked',isDocked)}
    if(slotY+slotSize/2>-10){x=lerp(x,.50,p1);y=Math.min(heroY,slotY)/h;size=lerp(size,slotSize,p1);m2=0}
    else{x=.68;y=.76+Math.max(0,dimensions.detail-scrollY)/h;size=w*.66;m1=1;m2=1}
   }
   else{x=lerp(x,.5,p1);y=lerp(y,.52,p1);size=lerp(size,Math.min(w*.47,h*.81),p1);x=lerp(x,.73,p2);y=lerp(y,.47,p2);size=lerp(size,Math.min(w*.52,h*.85),p2)}
   angle=lerp(angle,.10,m1);angle=lerp(angle,-.08,m2);tilt=lerp(tilt,-.22,m1);tilt=lerp(tilt,.18,m2);
   pointer.x=lerp(pointer.x,target.x,.07);pointer.y=lerp(pointer.y,target.y,.07);
   const float=paused?0:Math.sin(time*.85)*5;
   mesh.position.set((x-.5)*w,(.5-y)*h+float,0);mesh.scale.setScalar(size);
   mesh.rotation.set(paused?0:pointer.y*.10,tilt+(paused?0:pointer.x*.20),angle+(paused?0:Math.sin(time*.55)*.025));
   renderer.render(scene,camera);
 }
 window.addEventListener('resize',resize,{passive:true});window.addEventListener('scroll',()=>{scrollY=window.scrollY;if(paused)render(performance.now())},{passive:true});
 window.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'){target.x=e.clientX/w-.5;target.y=e.clientY/h-.5}},{passive:true});
 window.addEventListener('lyverne-motion',e=>{paused=e.detail.paused;render(performance.now())});
 new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)last=performance.now()},{rootMargin:'100px'}).observe(story);
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(raf);document.body.classList.remove('webgl-ready')});
 canvas.addEventListener('webglcontextrestored',()=>location.reload());
 resize();document.fonts?.ready.then(resize);window.addEventListener('load',resize,{once:true});document.body.classList.add('webgl-ready');raf=requestAnimationFrame(frame);
}
