// Screenshots, tool history and opaque encrypted reasoning stay in memory only.
// Replay never sends a server-side response or reasoning identifier.
function replayItems(output) {
  const items=[];let missingReasoning=false;
  const outputs=Array.isArray(output)?output:[];
  for(let i=0;i<outputs.length;i++) {
    const item=outputs[i];
    if(item?.type==='reasoning') {
      if(typeof item.encrypted_content==='string' && item.encrypted_content.length) items.push({type:'reasoning',summary:[],encrypted_content:item.encrypted_content});
      else missingReasoning=true;
    } else if(item?.type==='function_call') {
      items.push({type:'function_call',name:item.name,call_id:item.call_id,arguments:item.arguments});
    } else if(item?.type==='message' && item.role==='assistant') {
      const message={type:'message',role:'assistant',content:item.content};
      if(item.phase!==undefined) message.phase=item.phase;
      else if(outputs.slice(i+1).some(next=>next?.type==='function_call')) message.phase='commentary';
      items.push(message);
    }
  }
  return {items,missingReasoning};
}
export function createModelConversation(invoke, {onContextLimited = async()=>{}} = {}) {
  let transcript=[];
  return async function send(body) {
    if(!Array.isArray(body?.input))throw new Error('Entrada da conversa inválida.');
    const next=[...transcript,...body.input];
    const {previous_response_id, ...request}=body;
    const response=await invoke({...request,input:next,store:false,include:['reasoning.encrypted_content']});
    const {items,missingReasoning}=replayItems(response?.output);
    transcript=[...next,...items];
    if(missingReasoning) await onContextLimited();
    return response;
  };
}
