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
  function scene(room) {
    const description=room.id==='atlas'?'Atlas meeting room with an oval table, lilac chairs and a projection screen':'Willow workshop room with an oak table, green chairs and tall windows';
    return '<img src="./assets/'+room.id+'.webp" alt="'+description+'" width="'+(room.id==='atlas'?1536:1672)+'" height="'+(room.id==='atlas'?1024:941)+'" decoding="async">';
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
    const shown=QUICK_BOOKING?room.base:total(room);
    return '<article class="room" data-room="'+room.id+'"><div class="room-scene">'+scene(room)+'<span class="room-badge '+(room.id==='atlas'?'featured':'')+'">'+(room.id==='atlas'?'Our pick for your team':'A different kind of focus')+'</span><span class="scene-label">'+room.mood+'</span></div><div class="room-body"><div class="room-title"><div><h3>'+room.name+'</h3><p>'+room.subtitle+'</p></div><div class="room-price"><strong>'+money(shown)+'</strong><small>'+(QUICK_BOOKING?'room rate / hour':'total for your meeting')+'</small></div></div><div class="room-features"><span>'+room.capacity+' seats</span><span>'+room.type+'</span><span>Fast Wi-Fi</span>'+(QUICK_BOOKING?'':'<span>'+(state.projector?'Projector':'Display-ready')+'</span>')+'</div><div class="room-foot"><span class="availability">Available '+escape(state.date.toLowerCase())+'</span><button class="primary" data-room-select="'+room.id+'">Choose '+room.name+' <span class="arrow" aria-hidden="true">↗</span></button></div>'+(!QUICK_BOOKING?'<p class="total-detail">'+money(room.base)+' room + '+money(state.projector?room.projector:0)+' projector + '+money(room.service)+' service · nothing added later.</p>':'')+'</div></article>';
  }
  function rooms(){return ROOMS.filter(room=>room.capacity>=state.people).map(card).join('');}
  function home(){
    return '<section id="spaces" aria-labelledby="rooms-title"><div class="section-head"><h1 id="rooms-title">Meeting rooms</h1>'+(!QUICK_BOOKING?'<button class="secondary" data-action="requirements">Plan a meeting</button>':'')+'</div>'+(QUICK_BOOKING?strip():'')+'<div class="room-grid">'+rooms()+'</div></section>';
  }
  function requirements(){
    return '<div class="page-head"><button class="text-button back" data-action="home">← All spaces</button>'+progress('Your plans')+'<div class="eyebrow">The right room starts here</div><h1>What’s the plan?</h1><p>A few details, and we’ll show you what fits.</p></div><div class="checkout-layout"><form class="panel" id="requirements-form"><h2>Bring your people.</h2><p class="panel-intro">Choose what your meeting needs.</p><div class="field-grid"><div class="field"><label for="meeting-date">When</label><select id="meeting-date" name="date"><option '+(state.date==='Tomorrow'?'selected':'')+'>Tomorrow</option><option '+(state.date==='Next Monday'?'selected':'')+'>Next Monday</option></select></div><div class="field"><label for="meeting-time">Time</label><select id="meeting-time" name="slot"><option '+(state.slot==='10:00–11:00'?'selected':'')+'>10:00–11:00</option><option '+(state.slot==='14:00–15:00'?'selected':'')+'>14:00–15:00</option></select></div></div><div class="field"><label for="meeting-people">People</label><select id="meeting-people" name="people">'+[4,8,12,16].map(number=>'<option value="'+number+'" '+(state.people===number?'selected':'')+'>'+number+' people</option>').join('')+'</select></div><div class="checkbox-field"><input id="meeting-projector" name="projector" type="checkbox" '+(state.projector?'checked':'')+'><label for="meeting-projector">We need a projector<small>Include a projector for presentations and shared work.</small></label></div><div class="form-actions"><span class="form-note">One hour. Plenty of possibility.</span><button class="primary" type="submit">See available rooms <span class="arrow" aria-hidden="true">→</span></button></div></form><aside><div class="panel accent-panel"><h3>A proper meeting place.</h3><p>Every room comes with reliable Wi-Fi, water, comfortable seating, and somewhere to put your good ideas.</p></div></aside></div>';
  }
  function roomList(){
    const content=rooms();
    return '<div class="page-head"><button class="text-button back" data-action="'+(QUICK_BOOKING?'home':'requirements')+'">← '+(QUICK_BOOKING?'Gather home':'Your plans')+'</button>'+progress('Choose a room')+'<div class="eyebrow">Make yourself at home</div><h1>Find your kind of room.</h1><p>'+(QUICK_BOOKING?'Choose a space. We’ll take care of the rest.':'Your meeting requirements, included in every total.')+'</p></div>'+strip()+(content?'<div class="room-grid">'+content+'</div>':'<div class="empty"><h2>A little too much team.</h2><p>Our rooms seat up to 12 people. Try a smaller group.</p><button class="secondary" data-action="requirements">Change meeting details</button></div>');
  }
  function summary(room,withPrice=true){
    return '<aside class="panel summary-panel"><div class="mini-scene">'+scene(room)+'</div><div class="summary-title"><h2>'+room.name+'</h2><span class="room-tag">'+room.type+'</span></div><dl class="detail-list"><div><dt>Date</dt><dd>'+escape(state.date)+'</dd></div><div><dt>Time</dt><dd>'+escape(state.slot)+'</dd></div><div><dt>People</dt><dd>'+state.people+'</dd></div><div><dt>Projector</dt><dd>'+(state.projector?'Included in your booking':'Not requested')+'</dd></div></dl>'+(withPrice?price(room):'<p class="summary-note">You’ll review your booking total before confirming.</p>')+'</aside>';
  }
  function price(room){return '<div class="price-lines"><div><span>Room · 1 hour</span><strong>'+money(room.base)+'</strong></div><div><span>Projector</span><strong>'+money(state.projector?room.projector:0)+'</strong></div><div><span>Service charge</span><strong>'+money(room.service)+'</strong></div></div><div class="price-total"><span>Total</span><strong data-booking-total="'+total(room)+'">'+money(total(room))+'</strong></div><div class="price-caption">All charges included · CAD</div>';}
  function details(){
    const room=roomById(state.room);if(!room)return roomList();
    return '<div class="page-head"><button class="text-button back" data-action="rooms">← Choose another room</button>'+progress('Your meeting')+'<div class="eyebrow">Make it yours</div><h1>What brings you together?</h1><p>Give your meeting a name. We’ll make some room for it.</p></div><div class="checkout-layout"><form class="panel" id="details-form"><h2>Your meeting</h2><p class="panel-intro">'+escape(state.people)+' people, one '+room.name+' room, and a fresh perspective.</p><div class="field"><label for="meeting-purpose">Meeting name</label><input id="meeting-purpose" name="purpose" type="text" placeholder="e.g. Quarterly planning" value="'+escape(state.purpose)+'" maxlength="120" required autocomplete="off"><small>This name appears on your reservation.</small></div><div class="form-actions"><span class="form-note">No payment details needed for this demo reservation.</span><button class="primary" type="submit">Review booking <span class="arrow" aria-hidden="true">→</span></button></div></form>'+summary(room,!QUICK_BOOKING)+'</div>';
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
    if(QUICK_BOOKING&&view==='rooms'&&['review','details'].includes(currentView))state.purpose='';
    location.hash=view;
    if(currentView===view)render();
  }
  function render(){
    let view=location.hash.slice(1)||'home';
    if(view==='spaces'){document.getElementById('spaces')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    if(!['home','requirements','rooms','details','review','confirmed','bookings'].includes(view))view='home';
    if(QUICK_BOOKING&&view==='rooms'&&['review','details'].includes(currentView))state.purpose='';
    currentView=view;
    const content=({home,requirements,rooms:roomList,details,review,confirmed,bookings:bookingList}[view])();
    app.innerHTML=header()+'<main id="main" data-view="'+view+'">'+content+'</main>'+footer();
    bind();
    window.scrollTo(0,0);
    document.title=(view==='home'?'Gather — Meeting rooms':({requirements:'Your plans',rooms:'Find a room',details:'Your meeting',review:'Review booking',confirmed:'Reservation confirmed',bookings:'My reservations'}[view])+' · Gather');
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

