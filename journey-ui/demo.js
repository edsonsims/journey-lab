const film=document.querySelector('#demo-film');
const chapters=[...document.querySelectorAll('.chapters button')];
const error=document.querySelector('#media-error');
let readiness=null;
function readyToSeek(){
  if(film.readyState>0)return Promise.resolve();
  if(readiness)return readiness;
  readiness=new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timeout);film.removeEventListener('loadedmetadata',success);film.removeEventListener('error',failure);};
    const success=()=>{cleanup();resolve();};
    const failure=()=>{cleanup();reject(new Error('The demo film could not load.'));};
    const timeout=setTimeout(failure,12000);
    film.addEventListener('loadedmetadata',success,{once:true});film.addEventListener('error',failure,{once:true});film.load();
  }).finally(()=>{readiness=null;});
  return readiness;
}
function markChapter(){
  let active=chapters[0];
  for(const chapter of chapters)if(film.currentTime>=Number(chapter.dataset.time))active=chapter;
  for(const chapter of chapters){chapter.classList.toggle('active',chapter===active);if(chapter===active)chapter.setAttribute('aria-current','step');else chapter.removeAttribute('aria-current');}
}
async function startAt(seconds){
  await readyToSeek();
  film.currentTime=seconds;markChapter();
  film.scrollIntoView({block:'center',behavior:'auto'});
  try{await film.play();}catch{/* Native controls remain available if playback is restricted. */}
}
for(const chapter of chapters)chapter.addEventListener('click',()=>startAt(Number(chapter.dataset.time)).catch(()=>{error.hidden=false;}));
document.querySelector('#restart-film').addEventListener('click',()=>startAt(0).catch(()=>{error.hidden=false;}));
film.addEventListener('timeupdate',markChapter);
film.addEventListener('loadedmetadata',()=>{error.hidden=true;document.querySelector('#film-length').textContent=`${Math.round(film.duration)} SEC · ENGLISH`;});
film.addEventListener('error',()=>{error.hidden=false;});
