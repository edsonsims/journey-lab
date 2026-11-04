(() => {
  'use strict';
  const QUICK_BOOKING = true;
  const VERSION = QUICK_BOOKING ? 'proposal' : 'base';
  const ROOMS = [
    {id:'atlas',name:'Atlas',subtitle:'For a room full of possibility.',capacity:12,base:220,projector:35,service:25,type:'Boardroom',mood:'Bright + focused',color:'#c1d2cb'},
    {id:'willow',name:'Willow',subtitle:'Good conversations grow here.',capacity:12,base:235,projector:0,service:10,type:'Workshop room',mood:'Warm + creative',color:'#dfcbb0'}
  ];
  const STORAGE = 'gather-reservations-v1';
  const state = {people:12,projector:true,date:'Tomorrow',slot:'10:00–11:00',room:null,purpose:'',lastReservation:null};
  const app = document.getElementById('app');
  const money = value => '$'+value.toFixed(0);
  const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const roomById = id => ROOMS.find(room=>room.id===id);
  const total = room => room.base + (state.projector?room.projector:0) + room.service;
  const reservations = () => {try {const value=JSON.parse(sessionStorage.getItem(STORAGE)||'[]');return Array.isArray(value)?value:[];}catch{return [];}};
  function scene(room,mini=false) {
    const willow=room.id==='willow', wall=willow?'#e8dac6':'#d3ded8',floor=willow?'#d0b899':'#afbdb4',table=willow?'#a8754f':'#66786a',chair=willow?'#69734f':'#577267';
    return '<svg viewBox="0 0 600 240" role="img" aria-label="'+room.name+' meeting room illustration" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="light-'+room.id+(mini?'-mini':'')+'" x1="0" x2="1"><stop stop-color="'+wall+'"/><stop offset="1" stop-color="#f4f1e5"/></linearGradient></defs><rect width="600" height="240" fill="url(#light-'+room.id+(mini?'-mini':'')+')"/><path d="M0 166H600V240H0Z" fill="'+floor+'"/><path d="M0 165H600" stroke="#fff" opacity=".35"/><rect x="32" y="20" width="155" height="126" rx="2" fill="#f7faf0"/><rect x="39" y="27" width="141" height="112" fill="'+(willow?'#b7c3a3':'#a7c9c4')+'"/><path d="M109 27V139M39 82H180" stroke="#f6f4e9" stroke-width="7"/><path d="M40 120Q75 68 109 108Q146 62 180 110V139H40Z" fill="'+(willow?'#748a69':'#729c89')+'" opacity=".65"/><path d="M32 146H192L241 176H81Z" fill="#ffffed" opacity=".33"/><rect x="379" y="38" width="118" height="72" rx="3" fill="#3d4b43"/><rect x="384" y="43" width="108" height="62" rx="1" fill="#edf0df"/><path d="M401 88L424 68L445 80L476 58" stroke="'+(willow?'#9ba377':'#8ba6a2')+'" stroke-width="5" fill="none"/><path d="M437 110V133M420 134H454" stroke="#7b8778" stroke-width="3"/><ellipse cx="327" cy="213" rx="178" ry="20" fill="#4e594b" opacity=".12"/><path d="M203 150L191 218M426 150L440 216" stroke="#4e594b" stroke-width="9"/><path d="M170 128Q315 98 465 127L438 175Q317 201 194 173Z" fill="'+table+'"/><path d="M194 173Q315 200 438 175V183Q315 208 194 181Z" fill="#465646" opacity=".5"/><path d="M251 133L278 130L293 143L266 147Z" fill="#eeeade"/><path d="M335 145L363 142L377 155L348 159Z" fill="#e8e9db"/><path d="M382 120L401 118L412 129L392 132Z" fill="#d9e2d6"/><ellipse cx="310" cy="133" rx="6" ry="3" fill="#e9e8d9"/><path d="M304 123V133Q310 137 316 133V123Z" fill="#f6f5e8"/><ellipse cx="310" cy="123" rx="6" ry="3" fill="#bbbaa8"/><g fill="'+chair+'" stroke="#425746" stroke-width="2"><path d="M176 164Q148 157 144 171L145 196Q158 205 180 201Z"/><path d="M216 190Q191 184 188 198L191 222Q204 229 226 223Z"/><path d="M290 200Q263 197 261 210L263 234Q278 240 301 232Z"/><path d="M373 196Q347 193 345 206L349 230Q362 236 383 229Z"/><path d="M451 170Q476 163 479 178L476 203Q461 211 441 204Z"/><path d="M211 116Q188 102 187 90L191 71Q209 68 224 80Z"/><path d="M278 106Q254 96 255 84L260 65Q279 62 291 74Z"/><path d="M356 107Q333 98 335 86L340 67Q358 65 371 76Z"/><path d="M426 116Q404 105 407 94L412 76Q431 75 444 89Z"/></g><path d="M540 162L546 211H574L580 162Z" fill="'+(willow?'#bd8a62':'#8e9e84')+'"/><g fill="#597757"><ellipse cx="549" cy="121" rx="12" ry="36" transform="rotate(-25 549 121)"/><ellipse cx="569" cy="117" rx="12" ry="39" transform="rotate(18 569 117)"/><ellipse cx="556" cy="135" rx="11" ry="30" transform="rotate(-45 556 135)"/><ellipse cx="577" cy="137" rx="10" ry="29" transform="rotate(37 577 137)"/></g><path d="M557 106L560 166M573 110L560 166" stroke="#415c40" stroke-width="2"/><path d="M285 0V32M269 32H302L314 48H257Z" fill="#f4f0dc" stroke="#9d9e8a" stroke-width="2"/></svg>';
  }
  function header(){
    return '<nav aria-label="Main navigation"><a class="brand" href="#home" aria-label="Gather home"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>gather<span aria-hidden="true" style="color:var(--blue)">.</span></a><div class="nav-right"><span class="location">Toronto · Downtown</span><a class="nav-link" href="#rooms">Our spaces</a><a class="nav-bookings" href="#bookings">My reservations</a></div></nav>';
  }
  function footer(){return '<footer class="footer"><span class="footer-brand">Made for getting together.</span><span>Demo venue. Reservations are saved only in this browser session.</span></footer>';}
  function progress(step){
    const names=QUICK_BOOKING?['Choose a room','Your meeting','Review']:['Your plans','Choose a room','Your meeting','Review'];
    return '<div class="progress" aria-label="Booking progress">'+names.map(name=>'<span class="'+(name===step?'current':'')+'"'+(name===step?' aria-current="step"':'')+'>'+name+'</span>').join('')+'</div>';
  }
  function strip(change=true){return '<div class="requirements-strip"><span class="requirements-title">Your meeting</span><div class="requirements-items"><span><b>'+escape(state.date)+'</b> · '+escape(state.slot)+'</span><span><b>'+state.people+'</b> people</span><span>'+ (state.projector?'Projector required':'No projector')+'</span></div>'+(change?'<button class="change-link" data-action="requirements">Change</button>':'')+'</div>';}
  function card(room){
    const shown=total(room);
    const projectorFee=state.projector?room.projector:0;
    return '<article class="room" data-room="'+room.id+'"><div class="room-scene">'+scene(room)+'<span class="room-badge '+(room.id==='atlas'?'featured':'')+'">'+(room.id==='atlas'?'Our pick for your team':'A different kind of focus')+'</span><span class="scene-label">'+room.mood+'</span></div><div class="room-body"><div class="room-title"><div><h3>'+room.name+'</h3><p>'+room.subtitle+'</p></div><div class="room-price"><strong>All-in total: '+money(shown)+'</strong><small class="includes-fees"><span aria-hidden="true">ⓘ</span> Includes projector and service fees</small><small>'+money(room.base)+' room rate / hour</small><small>'+money(room.base)+' room + '+money(projectorFee)+' projector + '+money(room.service)+' service</small></div></div><div class="room-features"><span>'+room.capacity+' seats</span><span>'+room.type+'</span><span>Fast Wi-Fi</span>'+(QUICK_BOOKING?'':'<span>'+(state.projector?'Projector':'Display-ready')+'</span>')+'</div><div class="room-foot"><span class="availability">Available '+escape(state.date.toLowerCase())+'</span><button class="primary" data-room-select="'+room.id+'">Choose '+room.name+' <span class="arrow" aria-hidden="true">↗</span></button></div></div></article>';
  }
  function rooms(){return ROOMS.filter(room=>room.capacity>=state.people).map(card).join('');}
  function home(){
    return '<section class="hero"><div><div class="eyebrow">Good things happen in the same room</div><h1>A little room<br>for <em>big ideas.</em></h1><p class="hero-copy">Thoughtful spaces. Everything your team needs.<br>Find your next great meeting, right around the corner.</p>'+(QUICK_BOOKING?'<a class="primary" href="#spaces">Find your space <span class="arrow" aria-hidden="true">↓</span></a>':'<button class="primary" data-action="requirements">Plan a meeting <span class="arrow" aria-hidden="true">↗</span></button>')+'</div><aside class="hero-note"><span class="note-tag">'+(QUICK_BOOKING?'Less planning. More doing.':'Space to make it happen.')+'</span><strong>'+(QUICK_BOOKING?'Your next meeting.<br>Already halfway there.':'Bring the people.<br>We have the room.')+'</strong><p>'+(QUICK_BOOKING?'Your room, your details, you’re booked.':'From the first sketch to the final decision. Make a little space for it.')+'</p><div class="note-foot"><i></i>12 seats. A hundred possibilities.</div></aside></section>'+(QUICK_BOOKING?strip():'')+'<section id="spaces"><div class="section-head"><div><div class="eyebrow">The spaces</div><h2>'+(QUICK_BOOKING?'Meet your next meeting room.':'Two rooms. Room to think.')+'</h2></div><p>'+(QUICK_BOOKING?'Handpicked for your team':'Clear totals. Easy decisions.')+'</p></div><div class="room-grid">'+rooms()+'</div></section>';
  }
  function requirements(){
    return '<div class="page-head"><button class="text-button back" data-action="home">← All spaces</button>'+progress('Your plans')+'<div class="eyebrow">The right room starts here</div><h1>What’s the plan?</h1><p>A few details, and we’ll show you what fits.</p></div><div class="checkout-layout"><form class="panel" id="requirements-form"><h2>Bring your people.</h2><p class="panel-intro">Choose what your meeting needs.</p><div class="field-grid"><div class="field"><label for="meeting-date">When</label><select id="meeting-date" name="date"><option '+(state.date==='Tomorrow'?'selected':'')+'>Tomorrow</option><option '+(state.date==='Next Monday'?'selected':'')+'>Next Monday</option></select></div><div class="field"><label for="meeting-time">Time</label><select id="meeting-time" name="slot"><option '+(state.slot==='10:00–11:00'?'selected':'')+'>10:00–11:00</option><option '+(state.slot==='14:00–15:00'?'selected':'')+'>14:00–15:00</option></select></div></div><div class="field"><label for="meeting-people">People</label><select id="meeting-people" name="people">'+[4,8,12,16].map(number=>'<option value="'+number+'" '+(state.people===number?'selected':'')+'>'+number+' people</option>').join('')+'</select></div><div class="checkbox-field"><input id="meeting-projector" name="projector" type="checkbox" '+(state.projector?'checked':'')+'><label for="meeting-projector">We need a projector<small>Include a projector for presentations and shared work.</small></label></div><div class="form-actions"><span class="form-note">One hour. Plenty of possibility.</span><button class="primary" type="submit">See available rooms <span class="arrow" aria-hidden="true">→</span></button></div></form><aside><div class="panel accent-panel"><h3>A proper meeting place.</h3><p>Every room comes with reliable Wi-Fi, water, comfortable seating, and somewhere to put your good ideas.</p></div></aside></div>';
  }
  function roomList(){
    const content=rooms();
    return '<div class="page-head"><button class="text-button back" data-action="'+(QUICK_BOOKING?'home':'requirements')+'">← '+(QUICK_BOOKING?'Gather home':'Your plans')+'</button>'+progress('Choose a room')+'<div class="eyebrow">Make yourself at home</div><h1>Find your kind of room.</h1><p>'+(QUICK_BOOKING?'Choose a space. We’ll take care of the rest.':'Your meeting requirements, included in every total.')+'</p></div>'+strip()+(content?'<div class="room-grid">'+content+'</div>':'<div class="empty"><h2>A little too much team.</h2><p>Our rooms seat up to 12 people. Try a smaller group.</p><button class="secondary" data-action="requirements">Change meeting details</button></div>');
  }
  function summary(room,withPrice=true){
    return '<aside class="panel summary-panel"><div class="mini-scene">'+scene(room,true)+'</div><div class="summary-title"><h2>'+room.name+'</h2><span class="room-tag">'+room.type+'</span></div><dl class="detail-list"><div><dt>Date</dt><dd>'+escape(state.date)+'</dd></div><div><dt>Time</dt><dd>'+escape(state.slot)+'</dd></div><div><dt>People</dt><dd>'+state.people+'</dd></div><div><dt>Projector</dt><dd>'+(state.projector?'Included in your booking':'Not requested')+'</dd></div></dl>'+(withPrice?price(room):'<p class="summary-note">You’ll review your booking total before confirming.</p>')+'</aside>';
  }
  function price(room){return '<div class="price-lines"><div><span>Room · 1 hour</span><strong>'+money(room.base)+'</strong></div><div><span>Projector</span><strong>'+money(state.projector?room.projector:0)+'</strong></div><div><span>Service charge</span><strong>'+money(room.service)+'</strong></div></div><div class="price-total"><span>Total</span><strong data-booking-total="'+total(room)+'">'+money(total(room))+'</strong></div><div class="price-caption">All charges included · CAD</div>';}
  function details(){
    const room=roomById(state.room);if(!room)return roomList();
    return '<div class="page-head"><button class="text-button back" data-action="rooms">← Choose another room</button>'+progress('Your meeting')+'<div class="eyebrow">Make it yours</div><h1>What brings you together?</h1><p>Give your meeting a name. We’ll make some room for it.</p></div><div class="checkout-layout"><form class="panel" id="details-form"><h2>Your meeting</h2><p class="panel-intro">'+escape(state.people)+' people, one '+room.name+' room, and a fresh perspective.</p><div class="field"><label for="meeting-purpose">Meeting name</label><input id="meeting-purpose" name="purpose" type="text" placeholder="e.g. Quarterly planning" value="'+escape(state.purpose)+'" maxlength="120" required autocomplete="off"><small>This name appears on your reservation.</small></div><div class="form-actions"><span class="form-note">No payment details needed for this demo reservation.</span><button class="primary" type="submit">Review booking <span class="arrow" aria-hidden="true">→</span></button></div></form>'+summary(room,true)+'</div>';
  }
  function review(){
    const room=roomById(state.room);if(!room||!state.purpose.trim())return details();
    return '<div class="page-head"><button class="text-button back" data-action="rooms">← Choose another room</button>'+progress('Review')+'<div class="eyebrow">One last look</div><h1>Ready when you are.</h1><p>Review the details, then make it a meeting.</p></div><div class="checkout-layout"><section class="panel"><h2>Your meeting is almost on the calendar.</h2><div class="review-purpose"><small>Meeting name</small><strong>'+escape(state.purpose)+'</strong></div><p class="review-info">Your reservation includes '+(state.projector?'a projector, ':'')+'Wi-Fi, water, and seating for '+state.people+'. Your room is ready for you at '+escape(state.slot.split('–')[0])+'.</p><div class="form-actions"><button class="secondary" data-action="details">Edit meeting name</button><button class="primary" id="confirm-reservation" data-action="confirm">Confirm reservation <span class="arrow" aria-hidden="true">↗</span></button></div><p class="policy-note">Cancel your test reservation by closing this browser session. No payment is taken.</p></section>'+summary(room,true)+'</div>';
  }
  function confirmed(){
    const reservation=state.lastReservation||reservations().at(-1);if(!reservation)return bookingList();
    const room=roomById(reservation.roomId);
    return '<div class="success-head"><div class="success-mark" aria-hidden="true">✓</div><div class="eyebrow">Your people. Your place.</div><h1>You’ve got a room.</h1><p>'+escape(reservation.purpose)+' is booked at '+escape(room.name)+'.<br>Now, go make something happen.</p></div><section class="panel reservation-card" aria-label="Confirmed reservation"><div class="summary-title"><h2>'+escape(room.name)+'</h2><span class="confirmed-pill">Confirmed</span></div><dl class="detail-list"><div><dt>Meeting</dt><dd>'+escape(reservation.purpose)+'</dd></div><div><dt>Date and time</dt><dd>'+escape(reservation.date)+' · '+escape(reservation.slot)+'</dd></div><div><dt>People</dt><dd>'+reservation.people+'</dd></div><div><dt>Projector</dt><dd>'+(reservation.projector?'Included':'Not requested')+'</dd></div></dl><div class="price-total"><span>Reservation total</span><strong data-reservation-total="'+reservation.total+'">'+money(reservation.total)+'</strong></div><div class="price-caption">All charges included · CAD</div><div class="confirmation-id"><span>Reservation</span><strong>'+escape(reservation.id)+'</strong></div></section><div class="reservation-actions"><a class="secondary" href="#bookings">View my reservations</a><button class="primary" data-action="new">Plan another meeting <span aria-hidden="true">↗</span></button></div>';
  }
  function bookingList(){
    const items=reservations();
    return '<div class="page-head"><div class="eyebrow">Good things on the calendar</div><h1>My reservations.</h1><p>'+items.length+' '+(items.length===1?'meeting':'meetings')+' to look forward to.</p></div>'+(items.length?'<div class="booking-list">'+items.map(item=>'<article class="booking-item"><div><span class="confirmed-pill">Confirmed</span><h2>'+escape(item.purpose)+'</h2><p>'+escape(roomById(item.roomId)?.name||item.roomId)+' · '+item.people+' people'+(item.projector?' · Projector':'')+'<br>'+escape(item.date)+' · '+escape(item.slot)+'</p></div><strong>'+money(item.total)+'</strong></article>').join('')+'</div>':'<section class="empty"><h2>Your next good idea needs a room.</h2><p>When you book a space, you’ll find it here.</p><button class="primary" data-action="home">Find a space <span aria-hidden="true">↗</span></button></section>');
  }
  let currentView='home';
  function go(view){
    location.hash=view;
    if(currentView===view)render();
  }
  function render(){
    let view=location.hash.slice(1)||'home';
    if(view==='spaces'){document.getElementById('spaces')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    if(!['home','requirements','rooms','details','review','confirmed','bookings'].includes(view))view='home';
    currentView=view;
    const content=({home,requirements,rooms:roomList,details,review,confirmed,bookings:bookingList}[view])();
    app.innerHTML=header()+'<main id="main" data-view="'+view+'">'+content+'</main>'+footer();
    bind();
    window.scrollTo(0,0);
    document.title=(view==='home'?'Gather — A little room for big ideas':({requirements:'Your plans',rooms:'Find a room',details:'Your meeting',review:'Review booking',confirmed:'Reservation confirmed',bookings:'My reservations'}[view])+' · Gather');
  }
  function bind(){
    app.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>{
      const action=button.dataset.action;
      if(action==='confirm'){confirmReservation();return;}
      if(action==='new'){state.room=null;state.purpose='';state.lastReservation=null;go(QUICK_BOOKING?'home':'requirements');return;}
      go(action);
    }));
    app.querySelectorAll('[data-room-select]').forEach(button=>button.addEventListener('click',()=>{
      state.room=button.dataset.roomSelect;
      if(!QUICK_BOOKING&&currentView==='home'){go('requirements');return;}
      go('details');
    }));
    document.getElementById('requirements-form')?.addEventListener('submit',event=>{
      event.preventDefault();const form=new FormData(event.currentTarget);
      state.people=Number(form.get('people'));state.date=String(form.get('date'));state.slot=String(form.get('slot'));state.projector=form.has('projector');go('rooms');
    });
    const purpose=document.getElementById('meeting-purpose');
    purpose?.addEventListener('input',()=>{state.purpose=purpose.value;});
    document.getElementById('details-form')?.addEventListener('submit',event=>{event.preventDefault();if(!state.purpose.trim())return;state.purpose=state.purpose.trim();go('review');});
  }
  function confirmReservation(){
    const room=roomById(state.room);if(!room||!state.purpose.trim()||state.people>room.capacity)return;
    const button=document.getElementById('confirm-reservation');if(button?.disabled)return;if(button)button.disabled=true;
    const item={id:'GTH-'+crypto.randomUUID().slice(0,8).toUpperCase(),roomId:room.id,purpose:state.purpose.trim(),people:state.people,projector:state.projector,date:state.date,slot:state.slot,base:room.base,projectorFee:state.projector?room.projector:0,serviceFee:room.service,total:total(room),status:'confirmed'};
    const all=reservations();all.push(item);sessionStorage.setItem(STORAGE,JSON.stringify(all));state.lastReservation=item;go('confirmed');
  }
  window.addEventListener('hashchange',render);
  render();
})();

