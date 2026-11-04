import {useEffect,useRef,useState} from 'react';
import type {FormEvent,ReactNode} from 'react';
import {Button,Field,Modal} from './App';
import {Icon} from './icons';
import {initialSetupForm} from './app-setup';
import type {SetupForm} from './app-setup';
import './app-setup.css';

const steps=[
 {title:'App details',description:'Name and description',icon:'folder'},
 {title:'Repository',description:'Code source',icon:'branch'},
 {title:'Environment',description:'URL and settings',icon:'environments'},
 {title:'Review',description:'Check details',icon:'check'}
];
const sourceModes=[
 {value:'local',title:'Local checkout',detail:'Source on this machine',icon:'folder'},
 {value:'remote',title:'Git repository',detail:'Repository URL + checkout',icon:'branch'},
 {value:'url',title:'App URL only',detail:'Explore a running app',icon:'external'}
] as const;
type Props={close:()=>void};

export function AppSetupModal({close}:Props){
 const [form,setForm]=useState<SetupForm>({...initialSetupForm});
 const [step,setStep]=useState(0),[complete,setComplete]=useState(false);
 const body=useRef<HTMLDivElement>(null);
 const sourceEnabled=form.repositoryMode!=='url';
 const set=<K extends keyof SetupForm>(key:K,value:SetupForm[K])=>setForm(current=>({...current,[key]:value}));
 useEffect(()=>{body.current?.querySelector<HTMLElement>(complete?'[data-preview-complete]':'[data-step-heading]')?.focus();body.current?.scrollTo({top:0});},[step,complete]);
 const input=(key:keyof SetupForm,placeholder='',options:{type?:string;min?:number;max?:number;step?:number;maxLength?:number}={})=><input name={key} value={String(form[key])} onChange={event=>set(key,event.target.value as never)} placeholder={placeholder} autoComplete="off" {...options}/>;
 const textarea=(key:keyof SetupForm,placeholder='',rows=3)=><textarea name={key} value={String(form[key])} onChange={event=>set(key,event.target.value as never)} placeholder={placeholder} rows={rows}/>;
 function goTo(next:number){setComplete(false);setStep(next);}
 function submit(event:FormEvent){event.preventDefault();if(step<3)goTo(step+1);else if(complete)close();else setComplete(true);}
 const review=(title:string,icon:string,editStep:number,children:ReactNode)=><section className="setup-review-card"><header><span><Icon name={icon} size={16}/>{title}</span><button type="button" className="text-button" onClick={()=>goTo(editStep)}>Edit<Icon name="edit" size={12}/></button></header>{children}</section>;
 return <Modal title="Add an app" onClose={close} wide className="app-setup-modal">
  <form onSubmit={submit} noValidate>
   <div className="setup-layout">
    <aside className="setup-sidebar">
     <nav aria-label="App setup steps"><ol>{steps.map((item,index)=><li key={item.title} data-active={step===index}><button type="button" aria-current={step===index?'step':undefined} onClick={()=>goTo(index)}><span className="setup-step-number">{String(index+1).padStart(2,'0')}</span><span><strong>{item.title}</strong><small>{item.description}</small></span></button></li>)}</ol></nav>
    </aside>
    <div className="setup-body" ref={body}>
     <div className="setup-step-heading"><span className="setup-kicker">STEP {String(step+1).padStart(2,'0')} / 04</span><h3 data-step-heading tabIndex={-1}>{['App details','Source code','Environment','Review setup'][step]}</h3><p>{['Name your app and add a short description.','Choose a source for your app.','Set the app URL and journey settings.','Check your details before finishing.'][step]}</p></div>
     <fieldset className="setup-fields">
      {step===0&&<>
       <Field label="App name">{input('name','e.g. Acme customer portal',{maxLength:100})}</Field>
       <Field label="Description (optional)">{textarea('description','What does your app do?')}</Field>
      </>}
      {step===1&&<>
       <div className="setup-source-options" role="group" aria-label="Source connection type">{sourceModes.map(mode=><button type="button" key={mode.value} aria-pressed={form.repositoryMode===mode.value} onClick={()=>set('repositoryMode',mode.value)}><span><Icon name={mode.icon} size={19}/><span className="setup-choice-dot">{form.repositoryMode===mode.value&&<Icon name="check" size={10}/>}</span></span><strong>{mode.title}</strong><small>{mode.detail}</small></button>)}</div>
       {sourceEnabled?<>
        {form.repositoryMode==='remote'&&<Field label="Repository URL" hint="Your Git repository’s HTTPS URL.">{input('repositoryUrl','https://github.com/your-team/your-app',{type:'url'})}</Field>}
        <Field label={form.repositoryMode==='local'?'Local source directory':'Local source directory (optional)'} hint="Absolute path to the app’s source folder.">{input('repositoryPath','/path/to/your-app')}</Field>
        {form.repositoryMode==='local'&&<Field label="Repository URL (optional)">{input('repositoryUrl','https://github.com/your-team/your-app',{type:'url'})}</Field>}
        <Field label="Branch / ref" hint="Branch name or commit reference.">{input('baseRef','main')}</Field>
       </>:<div className="setup-url-only"><Icon name="external" size={24}/><h4>Use an app URL</h4><p>Add the URL in the next step. Source code can be added later.</p></div>}
      </>}
      {step===2&&<>
       <div className="form-grid"><Field label="Environment name">{input('environmentName','Development',{maxLength:100})}</Field><Field label="Health check path">{input('healthPath','/')}</Field></div>
       <Field label="App URL" hint="Must be reachable from the Journey Lab machine.">{input('url','http://127.0.0.1:3000/',{type:'url'})}</Field>
       {sourceEnabled&&<details className="setup-disclosure" open><summary><Icon name="code" size={16}/><span>Build & run commands<small>Commands for testing code changes</small></span><Icon name="down" size={14}/></summary><div>
        <Field label="Build command (optional)">{input('buildCommand','npm run build')}</Field>
        <Field label="Start command (optional)" hint="Use PORT or {port} for server apps. Leave blank for static apps.">{input('startCommand','npm run dev -- --port {port}')}</Field>
        <Field label="Test command (optional)">{input('testCommand','npm test')}</Field>
       </div></details>}
       <details className="setup-disclosure"><summary><Icon name="settings" size={16}/><span>Access & test data<small>Origins, sessions, and data isolation</small></span><Icon name="down" size={14}/></summary><div>
        <Field label="Additional allowed origins" hint="One HTTP(S) origin per line. App origin included.">{textarea('allowedOrigins','https://api.example.com',2)}</Field>
        <Field label="Authenticated session file (optional)" hint="Local browser storage-state file for a test account.">{input('authStatePath','/secure/path/test-session.json')}</Field>
        <Field label="Data isolation"><select name="isolation" value={form.isolation} onChange={event=>set('isolation',event.target.value)}><option value="independent-session">Independent browser session</option><option value="isolated-test-data">Dedicated isolated test data</option><option value="isolated-per-run">Separate test data for every run</option><option value="stateless-demo">Stateless demo app</option></select></Field>
        <Field label="Test-data policy">{textarea('dataPolicy','Dedicated test accounts and seeded data.',2)}</Field>
        <Field label="Fixture version (optional)">{input('fixtureVersion','e.g. onboarding-seed-v1')}</Field>
        <label className="setup-checkbox"><input type="checkbox" checked={form.allowMutations} onChange={event=>set('allowMutations',event.target.checked)}/><span>Allow changes to test data<small>Let personas create or update test data.</small></span></label>
       </div></details>
       <details className="setup-disclosure"><summary><Icon name="runs" size={16}/><span>Capture & journey limits<small>{form.maxSteps} actions · {Number(form.maxTokens).toLocaleString()} tokens · {form.durationMinutes} minutes</small></span><Icon name="down" size={14}/></summary><div>
        <div className="form-grid"><Field label="Action limit">{input('maxSteps','24',{type:'number',min:1,max:60})}</Field><Field label="Time limit (minutes)">{input('durationMinutes','10',{type:'number',min:.5,max:15,step:.5})}</Field></div>
        <Field label="Token budget">{input('maxTokens','250000',{type:'number',min:1000,max:2000000})}</Field>
        <Field label="Fields to mask" hint="One CSS selector per line.">{textarea('redactSelectors','input[type="password"]',2)}</Field>
        <label className="setup-checkbox"><input type="checkbox" checked={form.captureBodies} onChange={event=>set('captureBodies',event.target.checked)}/><span>Capture request and response bodies<small>Include body content in network captures.</small></span></label>
       </div></details>
      </>}
      {step===3&&<div className="setup-review">
       {complete&&<div className="setup-complete" role="status" tabIndex={-1} data-preview-complete><Icon name="check" size={22}/><div><strong>Simulation complete.</strong><p>No app was created or connected.</p></div></div>}
       {review('App','folder',0,<><h4>{form.name.trim()||'No app name'}</h4><p>{form.description||'No description'}</p></>)}
       {review('Source repository','branch',1,<><dl><div><dt>Connection</dt><dd>{sourceModes.find(mode=>mode.value===form.repositoryMode)?.title}</dd></div>{sourceEnabled&&<><div><dt>Repository</dt><dd>{form.repositoryUrl||'Local source only'}</dd></div><div><dt>Source directory</dt><dd>{form.repositoryPath||'Not added'}</dd></div><div><dt>Branch / ref</dt><dd>{form.baseRef||'Not specified'}</dd></div></>}</dl></>)}
       {review('First environment','environments',2,<dl><div><dt>Name</dt><dd>{form.environmentName.trim()||'No environment name'}</dd></div><div><dt>App URL</dt><dd>{form.url.trim()||'No URL'}</dd></div><div><dt>Health path</dt><dd>{form.healthPath||'/'}</dd></div>{sourceEnabled&&[['Build',form.buildCommand],['Start',form.startCommand],['Test',form.testCommand]].map(([name,value])=><div key={name}><dt>{name} command</dt><dd>{value||'Not configured'}</dd></div>)}<div><dt>Session</dt><dd>{form.authStatePath||'Fresh browser session'}</dd></div><div><dt>Test-data changes</dt><dd>{form.allowMutations?'Allowed':'Disabled'}</dd></div><div><dt>Body capture</dt><dd>{form.captureBodies?'Enabled':'Disabled'}</dd></div><div><dt>Journey limits</dt><dd>{form.maxSteps} actions · {Number(form.maxTokens).toLocaleString()} tokens · {form.durationMinutes} min</dd></div></dl>)}
      </div>}
     </fieldset>
    </div>
   </div>
   <footer className="setup-footer"><span>Step {step+1} of 4</span><Button onClick={step===0?close:()=>goTo(step-1)}>{step===0?'Cancel':'Back'}</Button><Button type="submit" kind="primary" icon={step===3?'check':'arrow'}>{complete?'Close':step===3?'Finish':step===2?'Review setup':'Continue'}</Button></footer>
  </form>
 </Modal>;
}
