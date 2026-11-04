import {runSecureLauncher} from './start-secure.mjs';
const controller=new AbortController();for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>controller.abort());
const result=await runSecureLauncher({signal:controller.signal,env:{...process.env,JOURNEY_LOCAL_MODEL_URL:'http://127.0.0.1:1234/v1',JOURNEY_LOCAL_MODEL:'muse-glimmer'}});process.exitCode=result.code||0;
