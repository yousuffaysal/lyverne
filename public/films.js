// Films start only on request. Native controls keep playback accessible.
document.querySelectorAll('.film-player').forEach(player=>{
 const video=player.querySelector('video'),button=player.querySelector('.film-play');
 button.addEventListener('click',async()=>{try{await video.play()}catch{button.textContent='TRY PLAYING AGAIN ▷'}});
 video.addEventListener('play',()=>{button.hidden=true});
 video.addEventListener('ended',()=>{button.hidden=false});
 video.addEventListener('error',()=>{button.textContent='FILM UNAVAILABLE';button.disabled=true});
 video.addEventListener('pause',()=>{if(!video.currentTime)button.hidden=false});
 window.addEventListener('lyverne-motion',event=>{if(event.detail.paused)video.pause()});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)video.pause()});
});
