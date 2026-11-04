export type SetupForm = {
 name:string;
 description:string;
 repositoryMode:'local'|'remote'|'url';
 repositoryUrl:string;
 repositoryPath:string;
 baseRef:string;
 environmentName:string;
 url:string;
 buildCommand:string;
 startCommand:string;
 testCommand:string;
 healthPath:string;
 allowedOrigins:string;
 authStatePath:string;
 redactSelectors:string;
 dataPolicy:string;
 isolation:string;
 fixtureVersion:string;
 allowMutations:boolean;
 captureBodies:boolean;
 maxSteps:string;
 maxTokens:string;
 durationMinutes:string;
};

export const initialSetupForm:SetupForm = {
 name:'',description:'',repositoryMode:'local',repositoryUrl:'',repositoryPath:'',baseRef:'main',
 environmentName:'Development',url:'',buildCommand:'',startCommand:'',testCommand:'',healthPath:'/',
 allowedOrigins:'',authStatePath:'',redactSelectors:'input[type="password"]',
 dataPolicy:'Dedicated test accounts and seeded data.',isolation:'independent-session',fixtureVersion:'',
 allowMutations:false,captureBodies:false,maxSteps:'24',maxTokens:'250000',durationMinutes:'10'
};
