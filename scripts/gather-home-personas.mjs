import {pathToFileURL} from 'node:url';

export const GATHER_HOME_PERSONA_IDS=Object.freeze({
  alex:'gather-assistant',
  maya:'gather-coordinator',
  sam:'gather-first-time',
  priya:'gather-second-language',
  jordan:'gather-slow-mobile',
  casey:'gather-keyboard',
});

const common={
  projectId:'gather',role:'client',continuity:'first-time',
  mission:'Book a room for 12 people with a projector for the available one-hour meeting slot. Enter the meeting purpose Quarterly planning. Keep the complete cost at or below $350.',
  initialKnowledge:'You have not used Gather before. You know the meeting requirements, but have no walkthrough, knowledge of its rooms or prices, or prior reservation.',
  constraints:'You need seats for all 12 people and a projector. The complete cost, including any fees and equipment, must not exceed $350. Use only the fictional meeting details.',
  resources:'A desktop browser and fictional meeting details; no real account or payment information.',
  successCriteria:'Verify a visible confirmed reservation with the requested meeting purpose, 12 attendees, a projector, and an all-in total within $350. Report any missing or uncertain detail accurately.',
  stopCriteria:'Stop after a verified suitable reservation, a supported obstacle after reasonable recovery, an unsafe action, or the session limits. Do not book beyond your budget or claim success without visible evidence.',
};

// Home v3 illustrates possible reactions. These briefs define circumstances and
// goals without prescribing an emotion, a product defect, or a journey outcome.
export const GATHER_HOME_PERSONA_DEFINITIONS=Object.freeze([
  {
    ...common,id:GATHER_HOME_PERSONA_IDS.sam,name:'Sam · First-time visitor',role:'First-time visitor',
    description:'A fictional first-time visitor from Home v3 who needs a clear introduction and next steps.',
    context:'You have been asked to arrange the team’s quarterly planning meeting. This is your first room-booking task in Gather, and you need to understand how to get started from the information the app provides.',
    skills:'Comfortable browsing websites and entering ordinary form fields. Unfamiliar with Gather’s navigation and booking terminology.',
    decision:'Read enough introductory information to understand the task, compare suitable room details, and choose using information available in the interface. Look for help if a next step is unclear.',
    expectations:'A useful introduction, recognizable labels, clear next steps, and confirmation of what has been saved.',
    priorities:'Understand the booking process, choose a suitable room, and complete the reservation confidently.',
    devicePresetId:'desktop-1440',networkPresetId:'unthrottled',
  },
  {
    ...common,id:GATHER_HOME_PERSONA_IDS.priya,name:'Priya · Second-language user',role:'Second-language user',
    description:'A fictional Home v3 persona booking in a second language who values plain explanations of costs and conditions.',
    context:'You are arranging a team meeting using English as a second language. You can read everyday English and use web forms, but unfamiliar booking terms and dense conditions can require extra explanation.',
    skills:'Comfortable with ordinary booking forms and everyday English. Uses nearby explanations and context to understand unfamiliar terms.',
    decision:'Read the room details and total carefully. Look for a plain-language explanation of unfamiliar charges or conditions; distinguish what the interface establishes from what remains unclear.',
    expectations:'Plain language, descriptive labels, and explanations of costs and booking conditions before confirming.',
    priorities:'Understand the full cost and what the reservation includes before committing. Do not guess the meaning of a condition that materially changes the booking.',
    devicePresetId:'desktop-1440',networkPresetId:'unthrottled',
  },
  {
    ...common,id:GATHER_HOME_PERSONA_IDS.jordan,name:'Jordan · Mobile, slow connection',role:'Mobile · slow connection',
    description:'A fictional Home v3 persona using a phone on a slow connection who needs clear progress and recovery feedback.',
    context:'You are arranging the team’s meeting on your phone between other tasks. Your connection is slow, so you depend on visible progress and clear feedback to know whether an action has completed.',
    resources:'A phone browser with the assigned slow mobile connection and fictional meeting details; no real account or payment information.',
    skills:'Comfortable with touch controls, mobile forms, and checking whether an action has completed before trying again.',
    constraints:common.constraints+' Use the assigned phone viewport and slow connection throughout; do not switch to a desktop or faster profile.',
    decision:'Choose a suitable room and finish on the phone. Give visible loading a reasonable chance to complete, inspect the current state before retrying, and avoid submitting a duplicate reservation.',
    expectations:'Readable room details, touch-friendly controls, visible loading feedback, and recovery that preserves entered information.',
    priorities:'Complete one correct reservation on mobile and understand whether each action is still loading, failed, or saved.',
    devicePresetId:'Pixel 7',networkPresetId:'slow-mobile',
  },
  {
    ...common,id:GATHER_HOME_PERSONA_IDS.casey,name:'Casey · Keyboard access',role:'Needs keyboard access',
    description:'A fictional Home v3 persona who needs to complete the booking using only the keyboard.',
    context:'You are arranging the team’s quarterly planning meeting and rely on keyboard navigation. You need to reach and operate each required control without using a mouse or touch.',
    resources:'A desktop browser and keyboard, with fictional meeting details. No mouse or touch input, real account, or payment information.',
    skills:'Experienced with Tab navigation, visible focus, Enter and Space activation, arrow keys where supported, and typing into the focused form field.',
    constraints:common.constraints+' Use keyboard navigation and typing only. Do not click coordinates or controls, use touch, select an option through a pointer shortcut, or bypass the visible interface. Type only after establishing keyboard focus.',
    decision:'Follow the visible focus through the booking flow and use keyboard activation for controls. If a required control appears unreachable, attempt reasonable keyboard navigation and report the exact observed barrier without assuming a defect in advance.',
    expectations:'Visible keyboard focus, a sensible focus order, keyboard-operable room selection and forms, and a readable reservation confirmation.',
    priorities:'Complete the reservation independently using the keyboard and identify any observed control that prevents that goal.',
    successCriteria:common.successCriteria+' Reach this outcome through keyboard interaction alone.',
    devicePresetId:'desktop-1440',networkPresetId:'unthrottled',
  },
]);

export async function createGatherHomePersonas({origin='http://127.0.0.1:4319',fetchImpl=fetch}={}){
  origin=new URL(origin).origin;
  async function api(resource,method='GET',input){
    const response=await fetchImpl(`${origin}/api/workspace/${resource}${resource.includes('?')?'&':'?'}projectId=gather`,{
      method,headers:{'content-type':'application/json'},
      body:input===undefined?undefined:JSON.stringify(input),signal:AbortSignal.timeout(20000),
    });
    const result=await response.json();
    if(!response.ok)throw Object.assign(new Error(result.error||`HTTP ${response.status}`),{status:response.status,code:result.code});
    return result;
  }
  const [people,deviceData,networkData]=await Promise.all([
    api('personas?archived=true'),api('devices'),api('network-profiles'),
  ]);
  const existing=new Map(people.personas.map(persona=>[persona.id,persona]));
  for(const [perspective,id] of Object.entries(GATHER_HOME_PERSONA_IDS)){
    const persona=existing.get(id);
    if(persona&&(persona.projectId!=='gather'||persona.archived))throw new Error(`${id} is unavailable in Gather; it will not be changed.`);
    if(['alex','maya'].includes(perspective)&&!persona)throw new Error(`Existing Gather persona ${id} is required; no personas were created.`);
  }
  // Resolve every required profile before the first write. Existing records,
  // including edits made after an earlier setup, are always left untouched.
  const pending=GATHER_HOME_PERSONA_DEFINITIONS.filter(persona=>!existing.has(persona.id)).map(definition=>{
    const {devicePresetId,networkPresetId,...persona}=definition;
    const device=deviceData.devices.find(item=>item.presetId===devicePresetId&&!item.archived&&item.projectId==='gather');
    const network=networkData['network-profiles'].find(item=>item.presetId===networkPresetId&&!item.archived&&item.projectId==='gather');
    if(!device||!network)throw new Error(`Active Gather profiles ${devicePresetId} and ${networkPresetId} are required; no personas were created.`);
    return {...persona,deviceIds:[device.id],primaryDeviceId:device.id,networkProfileId:network.id,expectedVersion:0};
  });
  const created=[];
  for(const persona of pending){
    // expectedVersion:0 rejects a concurrent creation rather than replacing it.
    const saved=await api('personas','POST',persona);
    existing.set(saved.id,saved);created.push(saved.id);
  }
  return {projectId:'gather',created,personas:Object.entries(GATHER_HOME_PERSONA_IDS).map(([perspective,id])=>({
    perspective,id,name:existing.get(id).name,version:existing.get(id).version,
    status:created.includes(id)?'created':'existing',url:`${origin}/projects/gather/personas/${id}`,
  })),url:`${origin}/projects/gather/personas`};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  createGatherHomePersonas().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
