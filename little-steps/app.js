(() => {
  const storageKey = 'littlesteps-activity';
  const readChoice = () => { try { return JSON.parse(sessionStorage.getItem(storageKey) || '{}'); } catch { return {}; } };
  const signup = document.querySelector('#signup-form');
  if (signup) signup.addEventListener('submit', (event) => {
    event.preventDefault();
    // Legacy optional local demonstration: discard fields and create no account.
    window.location.href = 'setup.html';
  });
  const ages = ['3–5 years', '6–8 years', '9–12 years'];
  const activities = {
    Space: { title:'Moon mission', copy:'Plan a trip to the moon. What belongs in your explorer’s kit?', question:'What will you take\nto the moon?', invitation:'Build your moon kit.', method:'Choose three printed supply cards, arrange them on the mission board, and explain each choice.', board:'Our moon kit', cards:['Water', 'Space suit', 'Food', 'Telescope', 'Teddy bear', 'Football'], prompt:'What makes each one useful on the moon?' },
    Animals: { title:'Animal explorer', copy:'Build a home for a woodland visitor. What does it need to feel at home?', question:'A little home.\nA wild idea.', invitation:'Build a woodland home.', method:'Choose three printed habitat cards, arrange them on the animal board, and explain each choice.', board:'Our animal home', cards:['Water', 'Trees', 'Shelter', 'Food', 'Flowers', 'Rocks'], prompt:'How does each choice help your animal?' },
    Art: { title:'Color adventure', copy:'Design an imaginary place. Which shapes will bring it to life?', question:'A world from\nyour imagination.', invitation:'Make a world of shapes.', method:'Choose three printed shape cards, arrange them on the picture board, and tell their story.', board:'Our imaginary place', cards:['Circle', 'Triangle', 'Square', 'Star', 'Wave', 'Spiral'], prompt:'What do these shapes become in your imaginary place?' }
  };
  const setup = document.querySelector('#setup-form');
  if (setup) {
    const previous=readChoice();
    if(ages.includes(previous.age))document.querySelector('#age').value=previous.age;
    if(activities[previous.interest])document.querySelector('#interest').value=previous.interest;
    setup.addEventListener('submit', (event) => {
      event.preventDefault();
      const age=document.querySelector('#age').value, interest=document.querySelector('#interest').value;
      if(!ages.includes(age)||!activities[interest])return;
      sessionStorage.setItem(storageKey, JSON.stringify({age,interest}));
      window.location.href='activity.html';
    });
  }
  const title=document.querySelector('#activity-title');
  if(title){
    const choice=readChoice();
    const interest=activities[choice.interest]?choice.interest:'Space';
    const age=ages.includes(choice.age)?choice.age:'6–8 years';
    const activity=activities[interest];
    title.textContent=activity.title;
    document.querySelector('#activity-copy').textContent=activity.copy;
    document.querySelector('#activity-age').textContent=age;
    document.querySelector('#activity-interest').textContent=interest;
    document.querySelector('#mission-question').textContent=activity.question;
    document.querySelector('#activity-invitation').textContent=activity.invitation;
    document.querySelector('#activity-method').textContent=activity.method;
    document.querySelector('#worksheet-heading').textContent=`${activity.title} · 2 sheets`;
    document.querySelector('#board-heading').textContent=activity.board;
    document.querySelector('#worksheet-prompt').textContent=activity.prompt;
    document.querySelector('#cards-heading').textContent=interest==='Space'?'Choose your supplies':interest==='Animals'?'Choose your habitat':'Choose your shapes';
    const cards=document.querySelector('#cutout-cards');
    for(const [index,label] of activity.cards.entries()){
      const card=document.createElement('div');card.className='cutout-card';
      const marker=document.createElement('span');marker.textContent=['◒','✦','◈','✳','◉','◇'][index];marker.setAttribute('aria-hidden','true');
      const name=document.createElement('strong');name.textContent=label;card.append(marker,name);cards.append(card);
    }
    const ageGuides={'3–5 years':'Ask the questions aloud and let the learner describe their choices. A grown-up handles the scissors.', '6–8 years':'Invite them to explain each choice and write one sentence.', '9–12 years':'Invite them to compare their choices and write a short explanation of their plan.'};
    document.querySelector('#guide-sharing').textContent=ageGuides[age];
    document.querySelector('#guide-choice').textContent=`Ask them to choose three ${interest==='Space'?'supplies':interest==='Animals'?'habitat pieces':'shapes'} and place them on the board.`;
    document.querySelector('#prepare-activity').addEventListener('click',event=>{
      const worksheet=document.querySelector('#printable-worksheet');worksheet.hidden=false;event.currentTarget.setAttribute('aria-expanded','true');
      worksheet.scrollIntoView({behavior:'smooth',block:'start'});
    });
    document.querySelector('#save-preparation').addEventListener('click',event=>{
      sessionStorage.setItem('littlesteps-preparation',JSON.stringify({age,interest}));
      document.querySelector('#activity-ready').hidden=false;
      event.currentTarget.textContent='Plan saved ✓';
    });
  }
})();
