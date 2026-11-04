const kinds = ['benefit','friction','uncertainty','unmet_need','routine'];

export const experienceFeedbackSchema = {
  type:'object',additionalProperties:false,
  description:'A public experience takeaway grounded in what this persona has observed. Explain what helped or hurt and why it matters to their goal. Routine click/type intentions are not feedback; use routine with empty summary and why. Do not infer an effect from emotional tone alone or use future knowledge.',
  properties:{
    kind:{type:'string',enum:kinds},
    summary:{type:'string',maxLength:240,description:'Concise experience takeaway naming the specific help, friction, uncertainty or unmet need. Empty for routine narration.'},
    why:{type:'string',maxLength:600,description:'The observed consequence for this persona and their goal or constraint, using only evidence available now. Empty for routine narration.'},
  },
  required:['kind','summary','why'],
};

// Reuse the same boundary for model annotations and retained insight projection.
// Invalid optional metadata must not remove the original observation or reaction.
export function normalizeExperienceFeedback(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['kind','summary','why'].includes(key))||!kinds.includes(value.kind))return null;
  if(typeof value.summary!=='string'||value.summary.length>240||typeof value.why!=='string'||value.why.length>600)return null;
  if(value.kind==='routine')return {kind:'routine',summary:'',why:''};
  const summary=value.summary.trim(),why=value.why.trim();
  return summary&&why?{kind:value.kind,summary,why}:null;
}
