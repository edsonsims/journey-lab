export const PRINT_SCENARIO = 'print-context-v1';
export const LEGACY_SCENARIO = 'signup-v1';

const profiles = {
  [LEGACY_SCENARIO]: [{
    id: 'mother', label: 'Responsável avaliando para uma criança', viewport: {width:1280,height:800},
    context: 'Você está conhecendo o LittleSteps pela primeira vez. Quer experimentar uma atividade apropriada antes de decidir se deseja criar uma conta. Não conhece o produto nem suas páginas antecipadamente.',
    mission: 'A partir do site inicial, tente experimentar uma atividade personalizada para uma criança usando apenas informações fictícias. Sua preferência é experimentar antes de decidir criar uma conta. Explore as alternativas visíveis; se não conseguir atingir seu objetivo sem criar a conta, relate a barreira observada sem presumir que afete todas as pessoas ou que não existam outras alternativas.',
  }],
  [PRINT_SCENARIO]: [{
    id:'teacher', label:'Professora preparando a aula', viewport:{width:1280,height:800},
    context:'Você é professora e está conhecendo o LittleSteps pela primeira vez, no computador. Está preparando uma atividade de espaço para uma criança fictícia de seis anos. Tem impressora, papel, tesoura e lápis disponíveis. Não conhece o produto, suas telas ou rotas. Suas informações sobre a atividade devem vir do que conseguir observar na interface.',
    mission:'Encontre e prepare uma atividade de espaço adequada à criança fictícia de seis anos. Explore o percurso visível até obter instruções concretas, conteúdo utilizável e requisitos que você consiga atender. Você pode inspecionar uma folha e organizar um plano de preparação, mas não deve acionar impressão real nem afirmar que imprimiu, recortou ou realizou uma atividade física. Um cartão de atividade criada, sozinho, não prova que a preparação está pronta. Considere alternativas visíveis quando necessário e relate o que realmente conseguiu preparar e o que ainda exige ação fora do navegador.',
  },{
    id:'mother', label:'Mãe sem impressora', viewport:{width:390,height:844},
    context:'Você é mãe e está conhecendo o LittleSteps pela primeira vez pelo celular. Sua criança fictícia de seis anos está ao seu lado e gosta de espaço. Vocês têm dez minutos disponíveis para uma atividade. Você tem o celular e lápis e papel comuns, mas não tem impressora nem tesoura disponíveis. Não conhece o produto, suas telas ou rotas. Não presuma recursos que não estejam disponíveis ou visíveis.',
    mission:'Encontre uma atividade de espaço adequada à criança fictícia de seis anos e tente começar um primeiro passo concreto que vocês possam fazer agora com os recursos disponíveis. Explore alternativas visíveis caso uma opção não sirva. Sua disponibilidade de dez minutos é para a atividade, não um cronômetro sobre a latência do modelo. Um cartão de atividade criada ou uma mensagem de sucesso, sozinho, não significa que você conseguiu começar. Não invente material, conteúdo ou ações fora do navegador. Ao encerrar, relate o que conseguiu começar ou a dificuldade observada, sem generalizar para outras pessoas.',
  }],
};
export function listPersonas(scenarioId = PRINT_SCENARIO) {
  const list=profiles[scenarioId];
  if(!list)throw new Error('Cenário não suportado.');
  return structuredClone(list);
}
export function getPersona(scenarioId = PRINT_SCENARIO, personaId = 'mother') {
  const persona=listPersonas(scenarioId).find(p=>p.id===personaId);
  if(!persona)throw new Error('Persona não disponível neste cenário.');
  return persona;
}
export function parseRunRequest(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!['scenarioId','personaId'].includes(k)))throw new Error('Informe somente scenarioId e personaId.');
  const scenarioId=input.scenarioId ?? PRINT_SCENARIO, personaId=input.personaId ?? 'mother';
  const persona=getPersona(scenarioId,personaId);
  return {scenarioId,personaId,persona,viewport:persona.viewport};
}
