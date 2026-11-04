import {createHash,randomUUID} from 'node:crypto';

export class ModelBudgetError extends Error {
  constructor(message,code='TOKEN_BUDGET',diagnostics=null){super(message);this.code=code;if(diagnostics)this.diagnostics=safeBudgetDiagnostics(diagnostics);}
}
const budgetReasons=new Set(['estimated_next_request','actual_exhaustion','invalid_budget']);
const budgetNumbers=['actualUsed','remaining','tokenLimit','inputEstimate','textBytes','imageCount','imageAllowance','requestedMaxOutput','maxOutput','minimumOutput','priorInputTokens','deltaTextBytes','deltaImageCount','deltaImageAllowance','appendedItemCount','margin'];
const safeCount=value=>Number.isSafeInteger(value)&&value>=0?value:null;
export function safeBudgetDiagnostics(value){
  if(!value||!budgetReasons.has(value.reason))return null;
  return {reason:value.reason,...(['full','receipt_prefix'].includes(value.estimateMethod)?{estimateMethod:value.estimateMethod}:{}),...Object.fromEntries(budgetNumbers.map(key=>[key,safeCount(value[key])]))};
}
export function modelBudgetStopEvent(error){
  const budget=safeBudgetDiagnostics(error?.diagnostics);
  const message=budget?.reason==='estimated_next_request'
    ?'The conservative estimate for the next request does not fit the remaining token allowance. Actual recorded usage is below the configured limit. Available experience is preserved.'
    :budget?.reason==='actual_exhaustion'
      ?'The configured token budget was reached. Available experience is preserved.'
      :budget?.reason==='invalid_budget'
        ?'The token allowance is invalid. No further model request was made. Available experience is preserved.'
        :'The model request stopped at its token budget. Available experience is preserved.';
  return {type:'budget_stop',message,...(budget?{budget}:{})};
}
export function usageTotal(usage){
  if(!Array.isArray(usage))return 0;
  let total=0;
  for(const item of usage){
    if(!Number.isSafeInteger(item?.total_tokens)||item.total_tokens<0)throw new ModelBudgetError('Provider usage is unavailable. Further model requests are paused.','USAGE_UNAVAILABLE');
    total+=item.total_tokens;
  }
  return total;
}
// Meta does not expose a tokenizer/count endpoint here. Text bytes and an image
// allowance are conservative preflight estimates, not billed token measurements.
// Provider receipts remain the only reported usage; the next request is stopped
// after any receipt exhausts its allowance. No request is automatically retried.
export function estimateRequestBudget(body){
  let images=0;
  const text=JSON.stringify(body,(_key,value)=>{
    if(value&&typeof value==='object'&&value.type==='input_image'){images++;return {type:'input_image'};}
    return value;
  });
  const textBytes=Buffer.byteLength(text||'', 'utf8'),imageAllowance=images*4096;
  return {inputEstimate:textBytes+imageAllowance,textBytes,imageCount:images,imageAllowance};
}
export const estimateRequestTokens=body=>estimateRequestBudget(body).inputEstimate;
function boundEstimatedRequest(body,{remainingTokens,maxOutputTokens=4096,actualUsed=null,tokenLimit=null}={},estimateRequest=()=>({...estimateRequestBudget(body),estimateMethod:'full'})){
  const base={actualUsed,remaining:Number.isSafeInteger(remainingTokens)?Math.max(0,remainingTokens):null,tokenLimit,requestedMaxOutput:maxOutputTokens,minimumOutput:128};
  if(!Number.isSafeInteger(remainingTokens)||remainingTokens<1){
    const diagnostics={...base,reason:Number.isSafeInteger(remainingTokens)?'actual_exhaustion':'invalid_budget'};
    const error=new ModelBudgetError('', 'TOKEN_BUDGET',diagnostics);error.message=modelBudgetStopEvent(error).message;throw error;
  }
  const estimate=estimateRequest(),{inputEstimate}=estimate;
  const output=Math.min(maxOutputTokens,remainingTokens-inputEstimate);
  if(output<128){
    const error=new ModelBudgetError('', 'TOKEN_BUDGET',{...base,...estimate,reason:'estimated_next_request',maxOutput:Math.max(0,Math.floor(output))});error.message=modelBudgetStopEvent(error).message;throw error;
  }
  return {...body,max_output_tokens:Math.floor(output)};
}
export const boundModelRequest=(body,options)=>boundEstimatedRequest(body,options);

// Every invocation is charged independently. A repeated provider identifier does
// not prove the service avoided billing another stateless request.
export function recordModelReceipt(run,{response,model,startedAt,budget,completedAt=new Date().toISOString()}){
  const receipt={id:randomUUID(),providerResponseId:typeof response?.id==='string'&&/^[a-zA-Z0-9._:-]{1,180}$/.test(response.id)?response.id:null,model,startedAt,completedAt,usage:response?.usage||null,budget};
  run.modelRequests||=[];run.usage||=[];run.modelRequests.push(receipt);run.usage.push(receipt.usage);
  return receipt;
}

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function requestIdentity(body){
  if(!Array.isArray(body?.input))return null;
  // Hash the exact caller serialization before adding a derived output cap. All
  // caller fields, including unknown metadata and explicit output caps, matter.
  const {input,...metadata}=body;
  return {signature:digest(metadata),prefixSHA256:digest(input),inputLength:input.length};
}
function trustedInputReceipt(response,model){
  const usage=response?.usage;
  if(response?.status!=='completed'||response.error||response.model!==undefined&&response.model!==model)return null;
  if(!['input_tokens','output_tokens','total_tokens'].every(key=>safeCount(usage?.[key])!==null)||usage.input_tokens+usage.output_tokens!==usage.total_tokens)return null;
  const cached=usage.input_tokens_details?.cached_tokens,reasoning=usage.output_tokens_details?.reasoning_tokens;
  if(cached!==undefined&&(safeCount(cached)===null||cached>usage.input_tokens)||reasoning!==undefined&&(safeCount(reasoning)===null||reasoning>usage.output_tokens))return null;
  return usage.input_tokens;
}

// An ephemeral tracker for one sequential conversation. Anchors contain hashes
// and counts only and are never reconstructed from persisted token totals.
// Receipt reuse is an estimate, not a provider guarantee. Newly appended opaque
// reasoning still receives the full byte allowance; cached tokens stay counted.
export function createReceiptAwareBudget(){
  let anchor=null,disabled=false,pending=null;
  return {prepare(body,options){
    if(pending){anchor=null;pending=null;}
    const identity=requestIdentity(body),requestModel=body?.model;
    let estimate;
    const request=boundEstimatedRequest(body,options,()=>{
      if(!disabled&&anchor&&identity&&anchor.signature===identity.signature&&identity.inputLength>=anchor.inputLength&&digest(body.input.slice(0,anchor.inputLength))===anchor.prefixSHA256){
        const appended=body.input.slice(anchor.inputLength),delta=estimateRequestBudget({input:appended}),margin=Math.max(1024,Math.ceil(anchor.inputTokens*.10))+64*appended.length;
        estimate={estimateMethod:'receipt_prefix',inputEstimate:anchor.inputTokens+delta.inputEstimate+margin,priorInputTokens:anchor.inputTokens,deltaTextBytes:delta.textBytes,deltaImageCount:delta.imageCount,deltaImageAllowance:delta.imageAllowance,appendedItemCount:appended.length,margin};
      }else estimate={...estimateRequestBudget(body),estimateMethod:'full'};
      return estimate;
    });
    const token={};pending=token;
    // This public receipt contains no hashes, request IDs, body, image or reasoning.
    const receipt={...estimate,actualUsed:safeCount(options?.actualUsed),remaining:safeCount(options?.remainingTokens),tokenLimit:safeCount(options?.tokenLimit),maxOutput:request.max_output_tokens};
    return {request,budget:receipt,abandon(){if(pending===token){pending=null;anchor=null;}},complete(response){
      if(pending!==token)return null;
      pending=null;
      const inputTokens=trustedInputReceipt(response,requestModel);
      if(inputTokens===null||!identity){anchor=null;return null;}
      if(inputTokens>estimate.inputEstimate){disabled=true;anchor=null;return {type:'budget_estimate_drift',message:'Actual provider input usage exceeded its preflight estimate. Receipt-prefix estimation is disabled for the rest of this journey.',budget:{reason:'estimate_drift',estimateMethod:estimate.estimateMethod,inputEstimate:estimate.inputEstimate,actualInputTokens:inputTokens,remaining:safeCount(options?.remainingTokens),actualUsed:safeCount(options?.actualUsed)}};}
      anchor=disabled?null:{...identity,inputTokens,requestId:typeof response.id==='string'?response.id:null};
      return null;
    }};
  }};
}
