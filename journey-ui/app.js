const $ = (selector) => document.querySelector(selector);
const runButton = $('#run');
const runPersona = $('#run-persona');
const scenarioId = 'print-context-v1';
const personaProfiles = {
  teacher: {label:'Professora',context:'Computador · Impressora disponível',objective:'Preparar uma atividade de espaço para a aula',avatar:'P'},
  mother: {label:'Mãe sem impressora',context:'Celular · 10 min · Sem impressora',objective:'Começar uma atividade de espaço agora',avatar:'M'},
};
function personaName(persona,id){return personaProfiles[id || persona?.id]?.label || persona?.label || 'Persona';}
function renderPersona(persona,scenario){
  const profile=scenario===scenarioId?personaProfiles[persona?.id]:null;
  $('#persona-name').textContent=profile?.label || persona?.label || 'Persona sintética';
  $('#persona-context').textContent=profile?.context || 'Perspectiva sintética';
  $('#persona-objective').textContent=profile?.objective || persona?.mission || 'Explore a jornada selecionada';
  $('#persona-objective').title=persona?.mission || '';
  $('#persona-avatar').textContent=profile?.avatar || (persona?.label || 'P').slice(0,1).toUpperCase();
  $('#persona-avatar').dataset.persona=persona?.id || '';
}
const statusEl = $('#status');
const alertEl = $('#alert');
const eventsEl = $('#events');
const countEl = $('#count');
const emptyEl = $('#empty');
const summaryEl = $('#summary');
const preview = $('#capture-preview');
const placeholder = $('#capture-placeholder');
const caption = $('#capture-caption');
const captureLink = $('#latest-capture-link');
const videoSlot = $('#recorded-video-slot');
const videoLink = $('#video-link');
const runMeta = $('#run-meta');
const setupStatus = $('#setup-status');
const resetButton = $('#reset-view');
const historySelect = $('#history-select');
const historyRefresh = $('#refresh-history');
const findingEvidence = document.createElement('div'); findingEvidence.className = 'finding-evidence'; findingEvidence.setAttribute('aria-label', 'Capturas citadas pelo relato'); document.querySelector('.insight-card').append(findingEvidence);
const STORAGE_KEY = 'journey-lab.current-run';
const names = { queued: 'Preparando execução', running: 'Jornada em andamento', finalizing: 'Salvando evidências', interrupted: 'Execução interrompida', finished: 'Relato recebido', blocked: 'Execução interrompida', failed: 'Falha na execução', incomplete: 'Execução incompleta', cancelled: 'Jornada interrompida', invalidated:'Jornada invalidada' };
const labels = { click_control:'Clique no controle', select_option:'Seleção por acessibilidade', click:'Clique', double_click:'Clique duplo', move:'Movimento do cursor', scroll:'Rolagem', type:'Texto inserido', keypress:'Tecla pressionada', wait:'Aguardou', screenshot:'Captura solicitada' };
const terminal = new Set(['finished','blocked','failed','incomplete','interrupted','cancelled','invalidated']);
const safePath = (path) => typeof path === 'string' && /^\/runs\/[\w-]+\/[\w.-]+$/.test(path);
let currentId = null, selectedScreenshot = null, lastScreenshot = null, timer = null, busy = false, health = null, videoPath = null;
let comparisonRunning = false, comparisonActiveTimer = null, comparisonActiveId = null, comparisonCancelling = false;
let selectedImprovementJob = null;
let historyRuns = [];
let selectedRun = null, improvementRunId = null, improvementId = null, improvementTimer = null, improvementList = null, improvementStarting = false, improvementRequestVersion = 0;
let healthNotice='';
function notify(message,scope='action') { if(scope==='health')healthNotice=message||'';alertEl.textContent = message || ''; alertEl.hidden = !message; alertEl.dataset.scope=scope; }
function clearRunNotice(){if(alertEl.dataset.scope==='run')notify(healthNotice,'health');}
function time(value) { if (!value) return ''; const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
function setCapture(path, label) {
  if (!safePath(path)) return;
  selectedScreenshot = path;
  preview.src = path; preview.alt = label || 'Captura da execução'; preview.hidden = false;
  placeholder.hidden = true; caption.textContent = label || 'Captura da jornada';
  captureLink.href = path; captureLink.hidden = false;
  for (const button of eventsEl.querySelectorAll('button[data-screenshot]')) button.setAttribute('aria-pressed', String(button.dataset.screenshot === path));
}
function clearRun() {
  clearTimeout(timer); timer = null; currentId = null; selectedScreenshot = null; lastScreenshot = null; videoPath = null;
  localStorage.removeItem(STORAGE_KEY); eventsEl.replaceChildren(); emptyEl.hidden = false; countEl.textContent = '0 eventos';
  statusEl.textContent = 'Aguardando execução'; runMeta.textContent = 'Nenhuma jornada selecionada';
  summaryEl.textContent = 'O relato do modelo aparecerá aqui após uma execução. É uma perspectiva sintética e precisa de revisão humana.';
  preview.hidden = true; preview.removeAttribute('src'); placeholder.hidden = false; caption.textContent = 'Nenhuma captura disponível'; captureLink.hidden = true;
  showEmptyVideo(videoSlot, 'Sem gravação selecionada', 'Escolha uma jornada no histórico.'); $('#before-original').hidden=true; clearComparisonView(); videoLink.hidden = true; findingEvidence.replaceChildren(); resetButton.hidden = true; historySelect.value = ''; notify(''); updateControls(); selectedRun = null; improvementRunId = null; resetImprovement(); renderPersona({id:runPersona.value},scenarioId);
}
function updateControls() {
  const ready = Boolean(health?.modelConfigured) && health?.targetAvailable !== false;
  runButton.disabled = busy || comparisonRunning || !ready || Boolean(health?.activeRun && health.activeRun !== currentId);
  runButton.textContent = comparisonRunning ? 'Comparação em andamento' : busy ? 'Jornada em andamento' : '+ Nova jornada';
  runPersona.disabled=busy || comparisonRunning;
}
function showEvent(event, index) {
  const item = document.createElement('article'); item.className = 'event';
  const title = document.createElement('div'); title.className = 'event-title';
  const name = event.type === 'screenshot' ? 'Captura da tela' : event.type === 'action' ? (labels[event.action?.type] || 'Ação no navegador') : event.type === 'model_summary' ? 'Relato do modelo' : event.type === 'safety_stop' ? 'Interrupção para revisão' : event.type === 'error' ? 'Erro' : 'Evento';
  const label = document.createElement('strong'); label.textContent = name;
  const stamp = document.createElement('time'); stamp.textContent = time(event.at); if (event.at) stamp.dateTime = event.at;
  title.append(label, stamp); item.append(title);
  const text = event.type === 'action' ? (event.action?.type === 'keypress' ? (event.action.keys || []).join(' + ') : event.action?.type === 'type' ? 'Texto fictício inserido' : event.action?.type === 'select_option' ? (event.action.label || event.accessibility?.optionLabel || '') : '') : (event.label || event.message || (event.type === 'model_summary' ? 'Veja o relato abaixo.' : ''));
  if (text) { const p = document.createElement('p'); p.textContent = text; item.append(p); }
  if (event.type === 'action' && event.click?.target?.label) { const p = document.createElement('p'); p.textContent = `Alvo: ${event.click.target.label}`; item.append(p); }
  if (safePath(event.screenshot)) {
    const button = document.createElement('button'); button.className = 'capture-select'; button.type = 'button'; button.dataset.screenshot = event.screenshot; button.textContent = 'Ver captura';
    button.setAttribute('aria-label', `Ver captura do evento ${index + 1}`); button.setAttribute('aria-pressed', String(selectedScreenshot === event.screenshot));
    button.addEventListener('click', () => setCapture(event.screenshot, `${event.label || 'Captura da jornada'}${event.at ? ` · ${time(event.at)}` : ''}`)); item.append(button);
  }
  return item;
}
function render(run) {
  if (run.id !== currentId) { clearComparisonView(); currentId = run.id; selectedScreenshot = null; lastScreenshot = null; videoPath = null; videoSlot.replaceChildren(); $('#before-original').hidden=true; videoLink.hidden = true; summaryEl.textContent = 'O relato do modelo aparecerá aqui após uma execução. É uma perspectiva sintética e precisa de revisão humana.'; }
  localStorage.setItem(STORAGE_KEY, run.id);
  if(!comparisonId)renderPersona(run.persona,run.scenarioId);
  resetButton.hidden = false; if(!comparisonId)statusEl.textContent = names[run.status] || 'Estado desconhecido';
  const events = Array.isArray(run.events) ? run.events : [];
  countEl.textContent = `${events.length} ${events.length === 1 ? 'evento' : 'eventos'}`;
  runMeta.textContent = `${run.createdAt ? `Iniciada ${new Date(run.createdAt).toLocaleString('pt-BR')} · ` : ''}${run.model || 'Muse Wonder'}`;
  emptyEl.hidden = events.length > 0;
  const latest = [...events].reverse().find(e => safePath(e.screenshot));
  const previousLatest = lastScreenshot;
  if (latest) { lastScreenshot = latest.screenshot; if (!selectedScreenshot || selectedScreenshot === previousLatest) setCapture(latest.screenshot, `${latest.label || 'Captura da jornada'}${latest.at ? ` · ${time(latest.at)}` : ''}`); }
  eventsEl.replaceChildren(...events.map(showEvent));
  findingEvidence.replaceChildren();
  for (const evidence of run.finding?.evidence || []) {
    if (!safePath(evidence.screenshot)) continue;
    const button = document.createElement('button'); button.type = 'button'; button.textContent = `Ver evidência #${evidence.index}`;
    button.addEventListener('click', () => { setCapture(evidence.screenshot, `Evidência #${evidence.index} · confira a captura`); preview.scrollIntoView({block:'nearest'}); }); findingEvidence.append(button);
  }
  if (run.finalMessage) summaryEl.textContent = String(run.finalMessage);
  else if (run.error) summaryEl.textContent = 'Nenhum relato final disponível. Consulte o registro e o aviso para entender a interrupção.';
  if (!comparisonId) { $('#evidence-heading').textContent='Evidências e registro · jornada selecionada'; renderRunVideo(run, videoSlot, $('#before-experience'), 'Antes'); }
  if (safePath(run.video)) { videoLink.href = run.video; videoLink.hidden = false; }
  busy = !terminal.has(run.status);
  selectedRun = run;
  if (improvementRunId !== run.id) { improvementRunId = run.id; resetImprovement(); loadImprovements(run.id); }
  updateImprovementControls();
  if(!comparisonId && run.error)notify(typeof run.error==='string'?run.error:'A jornada foi interrompida.','run');else clearRunNotice();
  if (!busy) { clearTimeout(timer); timer = null; loadHistory(); }
  updateControls();
}
async function refresh(id) {
  try {
    const response = await fetch(`/api/runs/${encodeURIComponent(id)}`, {cache:'no-store'});
    if (!response.ok) throw new Error('Não foi possível recuperar essa jornada.');
    const run = await response.json(); if (currentId && id !== currentId) return; render(run);
    if (!terminal.has(run.status)) timer = setTimeout(() => refresh(id), 1500);
  } catch (error) { busy = false; updateControls(); if(!comparisonId)notify(`${error.message} A execução pode continuar no serviço; atualize o histórico para reconectar.`,'run'); }
}
async function loadHistory() {
  try {
    const response = await fetch('/api/runs', {cache:'no-store'}); if (!response.ok) return;
    const data = await response.json(); const runs = Array.isArray(data) ? data : (data.runs || []); historyRuns=runs;
    const chosen = currentId || historySelect.value; historySelect.replaceChildren(new Option('Selecionar jornada', ''));
    for (const run of runs) { if (!run.id) continue; const text = `${run.createdAt ? new Date(run.createdAt).toLocaleString('pt-BR') : run.id.slice(0,8)} · ${run.scenarioId===scenarioId?personaName(run.persona,run.personaId)+' · ':''}${names[run.status] || run.status}`; historySelect.add(new Option(text, run.id)); }
    if (chosen) historySelect.value = chosen;
  } catch { /* Histórico não disponível: o experimento atual continua visível. */ }
}
async function checkHealth() {
  try {
    const response = await fetch('/api/health', {cache:'no-store'}); if (!response.ok) throw new Error('Serviço indisponível'); health = await response.json();
    const missing = !health.modelConfigured; const targetDown = health.targetAvailable === false;
    setupStatus.textContent = missing ? 'Chave da Meta necessária' : targetDown ? 'LittleSteps indisponível' : 'Pronto para executar';
    if (missing) notify('Configure a chave da Meta Model API no servidor para iniciar. Nenhuma execução foi simulada. Não compartilhe a chave no chat.','health');
    else if (targetDown) notify('O LittleSteps não está disponível. Inicie o produto local antes de executar a jornada.','health');
    else{healthNotice='';if(alertEl.dataset.scope==='health')notify('','health');}
    const saved = health.activeRun || localStorage.getItem(STORAGE_KEY); if (saved && !currentId) { currentId = saved; await refresh(saved); }
    updateControls();
  } catch { health = null; setupStatus.textContent = 'Serviço indisponível'; notify('Não foi possível conectar ao serviço local. Verifique se ele está em execução.','health'); updateControls(); }
}
runButton.addEventListener('click', async () => {
  notify(''); busy = true; updateControls();
  try {
    const response = await fetch('/api/runs', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({scenarioId,personaId:runPersona.value})}); const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível iniciar a jornada.');
    currentId = null; render(data); await refresh(data.id);
  } catch (error) { busy = false; updateControls(); notify(error.message); }
});
runPersona.addEventListener('change',()=>{if(!currentId&&!comparisonId)renderPersona({id:runPersona.value},scenarioId);});
resetButton.addEventListener('click', () => { if (busy) { notify('A execução continua em andamento. Aguarde antes de limpar a visualização.'); return; } clearRun(); });
historyRefresh.addEventListener('click', async () => { await checkHealth(); await loadHistory(); if (currentId) { clearTimeout(timer); await refresh(currentId); } });
historySelect.addEventListener('change', async () => { if (!historySelect.value) return; clearComparisonView(); clearTimeout(timer); notify(''); currentId = null; await refresh(historySelect.value); });
Promise.all([checkHealth(), loadHistory()]).then(async () => { await loadComparisons(true); if (!currentId && !comparisonId && historySelect.options.length > 1) await refresh(historySelect.options[1].value); });

// Improvements are independent jobs; never infer their result from a journey status.
const improveStart = $('#improvement-start');
const improveStatus = $('#improvement-status');
const improveMessage = $('#improvement-message');
const improveHistory = $('#improvement-history');
const improveRefresh = $('#improvement-refresh');
const improveError = $('#improvement-error');
const improveDetails = $('#improvement-details');
const improveChanges = $('#improvement-changes');
const improveTests = $('#improvement-tests');
const improvePreview = $('#improvement-preview');
const improvePatch = $('#improvement-patch');
const improveStatusNames = {prepared:'Preparada',running:'Muse Code trabalhando',verifying:'Verificando a candidata',awaiting_review:'Pronta para revisão',failed:'Falha na proposta',interrupted:'Execução interrompida'};
function improvementStatusName(job){return job.status==='awaiting_review'&&job.verification?.status==='failed'?'Verificação falhou':improveStatusNames[job.status]||'Estado desconhecido';}
const validId = id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const diffDisclosure = document.createElement('details');
const diffLabel = document.createElement('summary'); diffLabel.textContent = 'Examinar diff';
const diffText = document.createElement('pre'); diffText.setAttribute('aria-label','Diff da proposta');
diffDisclosure.append(diffLabel, diffText); improveChanges.after(diffDisclosure); diffDisclosure.hidden = true;
function improveNotify(message) { improveError.textContent = message || ''; improveError.hidden = !message; }
function validFinding(run) {
  if (!run || run.status!=='finished' || run.integrityStatus==='invalidated' || run.finding?.outcome !== 'obstacle_observed' || !Array.isArray(run.finding.evidence) || !run.finding.evidence.length) return false;
  const events = Array.isArray(run.events) ? run.events : [];
  return run.finding.evidence.every(ref => safePath(ref.screenshot) && events.some(e => e.type === 'screenshot' && e.index === ref.index && e.screenshot === ref.screenshot));
}
function resetImprovement() {
  clearTimeout(improvementTimer); improvementTimer = null; improvementRequestVersion++;
  improvementId = null; improvementList = null; improvementStarting = false; selectedImprovementJob = null; updateComparisonControls();
  improveHistory.replaceChildren(new Option('Nenhuma proposta selecionada',''));
  improveDetails.hidden = true; improveChanges.textContent = ''; improveTests.replaceChildren(); diffText.textContent = ''; diffDisclosure.hidden = true;
  improvePreview.hidden = true; improvePatch.hidden = true; improveNotify(''); updateImprovementControls();
}
function updateImprovementControls() {
  const eligible = validFinding(selectedRun);
  const hasActive = Boolean(improvementList?.activeImprovement) || improvementStarting;
  const available = Boolean(improvementList?.museAvailable && improvementList?.modelConfigured);
  improveStart.disabled = !eligible || !available || hasActive || busy || comparisonRunning;
  if (improvementStarting) { improveStart.textContent = 'Preparando…'; return; }
  improveStart.textContent = 'Preparar melhoria ↗';
  // The selected proposal's status remains visible even when new work cannot start.
  if (improvementId) return;
  if (!selectedRun) { improveStatus.textContent = 'Aguardando jornada'; improveMessage.textContent = 'Selecione uma jornada com achado e evidências para preparar uma melhoria.'; }
  else if (!eligible) { improveStatus.textContent = 'Evidência necessária'; improveMessage.textContent = 'Esta jornada precisa de um possível obstáculo e capturas citadas para criar uma proposta.'; }
  else if (!improvementList) { improveStatus.textContent = 'Consultando agente'; improveMessage.textContent = 'Verificando se o Muse Code está disponível.'; }
  else if (!improvementList.modelConfigured) { improveStatus.textContent = 'Chave necessária'; improveMessage.textContent = 'Configure a chave da Meta no serviço antes de preparar uma melhoria.'; }
  else if (!improvementList.museAvailable) { improveStatus.textContent = 'Muse Code indisponível'; improveMessage.textContent = 'O agente de programação ainda não está disponível no serviço.'; }
  else if (!improvementId && hasActive) { improveStatus.textContent = 'Agente ocupado'; improveMessage.textContent = 'Outra proposta está em processamento. Aguarde o encerramento.'; }
  else if (!improvementId) { improveStatus.textContent = 'Pronta para começar'; improveMessage.textContent = 'O Muse Code trabalhará em uma cópia isolada e o resultado precisará de revisão.'; }
}
function safeImprovementLink(link,id,kind) {
  if (!validId(id) || typeof link !== 'string') return null;
  try {
    const u = new URL(link, window.location.href); const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
    if (kind === 'preview' && u.protocol === 'http:' && u.hostname === 'localhost' && u.port === port && u.pathname === `/improvements/${id}/candidate/` && !u.search && !u.hash) return u.href;
    if (kind === 'patch' && u.origin === window.location.origin && u.pathname === `/improvements/${id}/changes.patch` && !u.search && !u.hash) return u.href;
  } catch {} return null;
}
function renderImprovement(job) {
  if (job.runId !== selectedRun?.id || job.id !== improvementId) return;
  selectedImprovementJob = job; updateComparisonControls();
  improveStatus.textContent = improvementStatusName(job);
  const verification = job.verification?.status;
  if (job.status === 'awaiting_review') improveMessage.textContent = verification === 'passed' ? (job.scenarioId===scenarioId ? `Candidata verificada${job.sourceRunIds?.length>1?' · Contexto de '+job.sourceRunIds.length+' personas':''}. Pronta para retestar as duas personas.` : 'Cópia criada e verificações locais passaram. Revise a proposta; o impacto em pessoas não foi medido.') : verification === 'failed' ? 'Cópia criada, mas houve falha nas verificações. Revise antes de usar.' : 'Cópia criada para revisão; as verificações ainda não foram confirmadas.';
  else if (job.status === 'running') improveMessage.textContent = 'O agente está implementando uma proposta na cópia isolada.';
  else if (job.status === 'verifying') improveMessage.textContent = 'O sistema está verificando a candidata. Aguarde para revisar o resultado.';
  else if (job.status === 'failed') improveMessage.textContent = 'A proposta não terminou. Nenhuma melhoria foi confirmada.';
  else if (job.status === 'interrupted') improveMessage.textContent = 'O serviço foi interrompido durante a proposta.';
  else improveMessage.textContent = 'A proposta está preparada para revisão.';
  improveDetails.hidden = !job.summary && !job.diff && !job.verification;
  improveChanges.textContent = job.summary ? `${job.summary}${job.summaryTruncated ? '\n\n[Resumo truncado]' : ''}` : 'Nenhum resumo disponível.';
  diffText.textContent = job.diff ? `${job.diff}${job.diffTruncated ? '\n\n[Diff truncado]' : ''}` : ''; diffDisclosure.hidden = !job.diff;
  improveTests.replaceChildren();
  const checks = Array.isArray(job.verification?.checks) ? job.verification.checks : [];
  if (!checks.length) { const li=document.createElement('li'); li.textContent='Nenhuma verificação disponível.'; improveTests.append(li); }
  for (const check of checks) { const li=document.createElement('li'); li.textContent=`${check.status === 'passed' ? 'Passou' : check.status === 'failed' ? 'Falhou' : 'Não confirmado'}: ${String(check.name || 'verificação')}${check.message ? ` — ${String(check.message)}` : ''}`; improveTests.append(li); }
  if (job.verification?.limitations) { const li=document.createElement('li'); li.textContent=job.verification.limitations; improveTests.append(li); }
  const previewUrl = safeImprovementLink(job.previewUrl,job.id,'preview'); improvePreview.hidden = !previewUrl; if (previewUrl) improvePreview.href = previewUrl;
  const patchUrl = safeImprovementLink(job.diffUrl,job.id,'patch'); improvePatch.hidden = !patchUrl; if (patchUrl) improvePatch.href = patchUrl;
  updateImprovementControls();
}
async function refreshImprovement(id,runId,version) {
  try { const response=await fetch(`/api/improvements/${encodeURIComponent(id)}`,{cache:'no-store'}); if(!response.ok)throw new Error('Não foi possível carregar a proposta.'); const job=await response.json(); if(version!==improvementRequestVersion || runId!==selectedRun?.id || id!==improvementId)return; renderImprovement(job); }
  catch(error){ if(version===improvementRequestVersion) improveNotify(error.message); }
}
async function loadImprovements(runId,selectId) {
  if(!validId(runId))return;
  const version=improvementRequestVersion;
  try {
    const response=await fetch('/api/improvements',{cache:'no-store'}); if(!response.ok)throw new Error('Não foi possível consultar as propostas.');
    const result=await response.json(); if(version!==improvementRequestVersion || selectedRun?.id!==runId)return;
    improvementList=result; const items=(Array.isArray(result.improvements)?result.improvements:[]).filter(item=>item.runId===runId && validId(item.id));
    const previous=selectId || improvementId; improvementId=items.some(item=>item.id===previous)?previous:(items[0]?.id || null);
    improveHistory.replaceChildren(new Option(items.length?'Selecionar proposta':'Nenhuma proposta disponível',''));
    for(const job of items) improveHistory.add(new Option(`${job.createdAt ? new Date(job.createdAt).toLocaleString('pt-BR') : job.id.slice(0,8)} · ${improvementStatusName(job)}`,job.id));
    if(improvementId) {improveHistory.value=improvementId; await refreshImprovement(improvementId,runId,version);} else {improveDetails.hidden=true;updateImprovementControls();}
    clearTimeout(improvementTimer); if(result.activeImprovement) improvementTimer=setTimeout(()=>loadImprovements(runId,improvementId),2000);
  } catch(error){if(version===improvementRequestVersion){improvementList=null;updateImprovementControls();improveNotify(error.message);}}
}
improveStart.addEventListener('click',async()=>{
  if(!validFinding(selectedRun) || !validId(selectedRun.id) || improveStart.disabled)return;
  const runId=selectedRun.id; const version=improvementRequestVersion; improvementStarting=true; improveNotify('');updateImprovementControls();
  try{
    const supportRunIds=[];
    if(selectedRun.scenarioId===scenarioId && selectedRun.persona?.id==='mother' && selectedRun.productFingerprint){
      await loadHistory();
      const candidates=historyRuns.filter(run=>run.id!==runId&&run.scenarioId===scenarioId&&(run.personaId||run.persona?.id)==='teacher'&&run.status==='finished'&&!run.comparisonId);
      const fingerprint=value=>JSON.stringify(Object.entries(value||{}).sort(([a],[b])=>a.localeCompare(b)));
      for(const candidate of candidates.slice(0,3)){
        const response=await fetch(`/api/runs/${encodeURIComponent(candidate.id)}`,{cache:'no-store'});if(!response.ok)continue;
        const teacher=await response.json();
        if(!teacher.comparisonId&&teacher.target==='http://127.0.0.1:4320/'&&teacher.integrityStatus!=='invalidated'&&fingerprint(teacher.productFingerprint)===fingerprint(selectedRun.productFingerprint)){supportRunIds.push(teacher.id);break;}
      }
    }
    if(version!==improvementRequestVersion || selectedRun?.id!==runId){improvementStarting=false;return;}
    const response=await fetch('/api/improvements',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId,...(supportRunIds.length?{supportRunIds}:{})})});const result=await response.json();if(!response.ok)throw new Error(result.error || 'Não foi possível iniciar a proposta.');if(version!==improvementRequestVersion || selectedRun?.id!==runId)return;improvementStarting=false;await loadImprovements(runId,result.id);}
  catch(error){if(version===improvementRequestVersion){improvementStarting=false;improveNotify(error.message);await loadImprovements(runId);}}
});
improveHistory.addEventListener('change',async()=>{clearTimeout(improvementTimer);selectedImprovementJob=null; updateComparisonControls();improvementId=improveHistory.value || null;if(!improvementId){selectedImprovementJob=null; updateComparisonControls(); improveDetails.hidden=true;updateImprovementControls();return;}await loadImprovements(selectedRun?.id,improvementId);});
improveRefresh.addEventListener('click',()=>{if(selectedRun?.id)loadImprovements(selectedRun.id,improvementId);});

// Comparisons contain independently recorded journeys; playback is not a claim of human impact.
const comparisonSelect=$('#comparison-history'), comparisonStart=$('#comparison-start'), comparisonCancel=$('#comparison-cancel'), comparisonStatus=$('#comparison-status'), comparisonMessage=$('#comparison-message'), comparisonError=$('#comparison-error'), comparisonMetrics=$('#comparison-metrics'), afterSlot=$('#after-video-slot'), syncButton=$('#sync-videos');
let comparisonId=null, comparisonTimer=null, comparisonStarting=false, comparisonVersion=0;
let comparisonData=null, selectedPairId=null;
const personaComparison=$('#persona-comparison'), personaTabs=$('#persona-tabs'), pairProgress=$('#pair-progress');
const comparisonNames={cancelling:'Finalizando gravação',cancelled:'Comparação interrompida',invalidated:'Comparação invalidada',queued:'Preparando',running_before:'Gravando antes',running_after:'Gravando depois',completed:'Comparação concluída',failed:'Comparação incompleta',interrupted:'Comparação interrompida'};
function updateComparisonControls(){
  comparisonStart.disabled=!(selectedImprovementJob?.status==='awaiting_review' && selectedImprovementJob?.verification?.status==='passed') || comparisonStarting || Boolean(comparisonTimer) || busy || comparisonRunning;
  comparisonStart.textContent=comparisonStarting?'Iniciando…':selectedImprovementJob?.scenarioId===scenarioId?'Retestar as duas personas':'Comparar jornadas';
  comparisonCancel.hidden=!comparisonRunning;comparisonCancel.disabled=comparisonCancelling || !validId(comparisonActiveId);comparisonCancel.textContent=comparisonCancelling?'Finalizando gravação…':'Interromper';
}
function showEmptyVideo(slot,title,detail){slot.querySelector('video')?.pause();const wrap=document.createElement('div');wrap.className='video-empty';const icon=document.createElement('span');icon.className='play-symbol';icon.setAttribute('aria-hidden','true');icon.textContent='▶';const strong=document.createElement('strong');strong.textContent=title;const text=document.createElement('span');text.textContent=detail;wrap.append(icon,strong,text);slot.replaceChildren(wrap);}
function clearComparisonView(){comparisonData=null;selectedPairId=null;personaComparison.hidden=true;personaTabs.replaceChildren();delete personaTabs.dataset.signature;pairProgress.textContent='';clearTimeout(comparisonTimer);comparisonTimer=null;comparisonId=null;comparisonVersion++;if(comparisonSelect)comparisonSelect.value='';if(afterSlot)showEmptyVideo(afterSlot,'Aguardando comparação','Prepare uma melhoria para comparar.');$('#after-experience').replaceChildren();$('#before-experience').replaceChildren();$('#after-original').hidden=true;comparisonMetrics.hidden=true;comparisonStatus.textContent='Nenhuma comparação selecionada';comparisonMessage.textContent='Compare as jornadas quando uma candidata estiver pronta para revisão.';comparisonError.hidden=true;syncButton.disabled=true;updateComparisonControls();updateControls();updateImprovementControls();}
function showComparedEvidence(run,label){
  const events=Array.isArray(run.events)?run.events:[];
  $('#evidence-heading').textContent=`Evidências e registro · ${label}`;
  countEl.textContent=`${events.length} ${events.length===1?'evento':'eventos'}`;emptyEl.hidden=events.length>0;eventsEl.replaceChildren(...events.map(showEvent));
  const latest=[...events].reverse().find(e=>safePath(e.screenshot));selectedScreenshot=null;if(latest)setCapture(latest.screenshot,`${latest.label||'Captura da jornada'}${latest.at?` · ${time(latest.at)}`:''}`);else{preview.hidden=true;placeholder.hidden=false;caption.textContent='Nenhuma captura disponível';captureLink.hidden=true;}
  summaryEl.textContent=run.finalMessage||run.finding?.observation||'Nenhum relato disponível.';findingEvidence.replaceChildren();
  for(const ref of run.finding?.evidence||[]){if(!safePath(ref.screenshot))continue;const button=document.createElement('button');button.type='button';button.textContent=`Ver evidência #${ref.index}`;button.addEventListener('click',()=>setCapture(ref.screenshot,`Evidência #${ref.index} · ${label}`));findingEvidence.append(button);}
  if(safePath(run.video)){videoLink.href=run.video;videoLink.hidden=false;}else videoLink.hidden=true;
  const evidence=$('#evidence');evidence.open=true;navClickTarget='#evidence';setNav(navClickTarget);evidence.scrollIntoView({behavior:'smooth',block:'start'});
}
function seekRecordedVideo(video,seconds){
  const seek=()=>{if(!video.isConnected)return;video.currentTime=Number.isFinite(video.duration)?Math.min(seconds,video.duration):seconds;};
  if(video.readyState>=1)seek();else video.addEventListener('loadedmetadata',seek,{once:true});
}
function renderRunVideo(run,slot,experienceSlot,label){
  const isBefore=label.toLowerCase()==='antes';
  slot.dataset.orientation=run?.persona?.viewport?.width<run?.persona?.viewport?.height?'portrait':'landscape';const originalLink=$(isBefore?'#before-original':'#after-original');const subtitle=$(isBefore?'#before-subtitle':'#after-subtitle');
  originalLink.hidden=!safePath(run?.video);if(!originalLink.hidden)originalLink.href=run.video;
  const path=safePath(run?.replay?.video)?run.replay.video:(safePath(run?.replay)?run.replay:(safePath(run?.video)?run.video:null));
  subtitle.textContent=path?(path===run.video?'Vídeo original':'Replay compacto'):(isBefore?'Jornada selecionada':'Candidata');
  if(run?.navigationBudgetExhausted)subtitle.textContent+=' · Limite de exploração atingido';
  if(!path){const inProgress=run && !terminal.has(run.status);subtitle.textContent=inProgress?'Gravando…':subtitle.textContent;const latest=inProgress?[...(Array.isArray(run.events)?run.events:[])].reverse().find(e=>safePath(e.screenshot)):null;if(latest){const img=document.createElement('img');img.className='live-capture';img.src=latest.screenshot;img.alt=`Última captura da jornada ${label}, ainda em andamento`;const badge=document.createElement('span');badge.className='live-badge';badge.textContent='Gravando…';slot.replaceChildren(img,badge);}else showEmptyVideo(slot,inProgress?'Gravando…':'Gravação indisponível',inProgress?'Aguardando a primeira captura.':'O vídeo aparecerá quando estiver pronto.');experienceSlot.replaceChildren();delete experienceSlot.dataset.signature;return;}
  let video=slot.querySelector('video');if(!video||video.getAttribute('src')!==path){video=document.createElement('video');video.controls=true;video.preload='metadata';video.src=path;const firstShot=(Array.isArray(run.events)?run.events:[]).find(event=>safePath(event.screenshot));if(firstShot)video.poster=firstShot.screenshot;video.setAttribute('aria-label',`Gravação ${label} · ${run.scenarioId===scenarioId?personaName(run.persona):run.persona?.label || 'Persona'}`);for(const name of ['play','pause','ended'])video.addEventListener(name,updatePlaybackLabel);slot.querySelector('video')?.pause();slot.replaceChildren(video);}
  const experienceSignature=JSON.stringify([run.id,path,run.finding,run.experience,run.navigationBudgetExhausted,(run.events||[]).length]);
  if(experienceSlot.dataset.signature===experienceSignature && experienceSlot.childElementCount)return;
  experienceSlot.replaceChildren();experienceSlot.dataset.signature=experienceSignature;
  if(typeof run.finding?.observation==='string' && run.finding.observation.trim()){const finding=document.createElement('details');finding.className='observed-finding';const summary=document.createElement('summary');const observation=run.finding.observation;summary.textContent=`${outcomeName(run.finding.outcome)} · ${observation.length>110?observation.slice(0,107)+'…':observation}`;const full=document.createElement('p');full.textContent=observation;finding.append(summary,full);experienceSlot.append(finding);}
  const notes=(Array.isArray(run.experience)?run.experience:[]).map(item=>{
    let seconds=Number.isFinite(item.videoMs)&&item.videoMs>=0?item.videoMs/1000:null;
    if(path!==run.video){if(Number.isFinite(item.replayMs)&&item.replayMs>=0)seconds=item.replayMs/1000;else if(seconds!==null){const segments=run.replayMetadata?.segments;if(Array.isArray(segments)){const seg=segments.find(x=>seconds>=x.originalStart&&seconds<=x.originalEnd);seconds=seg?seg.replayStart+seconds-seg.originalStart:null;}else seconds=null;}}
    return {seconds,reaction:typeof item.reaction==='string'?item.reaction.trim():'',observation:typeof item.observation==='string'?item.observation.trim():''};
  }).filter(item=>item.reaction||item.observation);
  if(notes.length){
    const active=document.createElement('div');active.className='active-comment';const activeLabel=document.createElement('span');activeLabel.className='active-label';activeLabel.textContent='PERSONA · SIMULAÇÃO';const reaction=document.createElement('p');reaction.className='active-reaction';const observation=document.createElement('p');observation.className='active-observation';active.append(activeLabel,reaction,observation);experienceSlot.append(active);
    const transcript=document.createElement('details');transcript.className='transcript';const heading=document.createElement('summary');heading.textContent='Ver transcrição';transcript.append(heading);
    const show=(note)=>{activeLabel.textContent='PERSONA · SIMULAÇÃO';reaction.textContent=note.reaction;reaction.hidden=!note.reaction;observation.textContent=note.observation;observation.hidden=!note.observation;};
    const showResult=()=>{if(typeof run.finding?.observation!=='string'||!run.finding.observation.trim()){if(!terminal.has(run.status))return;activeLabel.textContent='ESTADO DA JORNADA';reaction.textContent=names[run.status]||'Resultado indisponível';reaction.hidden=false;observation.textContent=typeof run.error==='string'?run.error:'';observation.hidden=!observation.textContent;return;}activeLabel.textContent='RESULTADO OBSERVADO';reaction.textContent=outcomeName(run.finding.outcome);reaction.hidden=false;const result=run.finding.observation.trim();observation.textContent=result.length>160?`${result.slice(0,157)}…`:result;observation.hidden=false;};
    show(notes[0]);video.ontimeupdate=()=>{if(video.ended){showResult();return;}let current=null;for(const note of notes){if(note.seconds!==null&&note.seconds<=video.currentTime)current=note;}show(current||notes[0]);};video.onended=showResult;
    for(const note of notes){const row=document.createElement('div');row.className='experience-item';const text=document.createElement('p');text.textContent=[note.reaction,note.observation].filter(Boolean).join(' ');if(note.seconds!==null){const stamp=document.createElement('button');stamp.className='experience-time';stamp.type='button';stamp.textContent=`${Math.floor(note.seconds/60)}:${String(Math.floor(note.seconds%60)).padStart(2,'0')}`;stamp.setAttribute('aria-label',`Ir para ${stamp.textContent} no vídeo ${label}`);stamp.addEventListener('click',()=>{seekRecordedVideo(video,note.seconds);show(note);video.focus();});row.append(stamp);}row.append(text);transcript.append(row);}experienceSlot.append(transcript);
  }else {video.ontimeupdate=null;video.onended=null;}
  if(Array.isArray(run.events)&&run.events.length){const evidenceButton=document.createElement('button');evidenceButton.type='button';evidenceButton.className='evidence-button';evidenceButton.textContent='Ver evidências ↗';evidenceButton.addEventListener('click',()=>showComparedEvidence(run,label));experienceSlot.append(evidenceButton);}
}
function comparisonNotify(message){comparisonError.textContent=message||'';comparisonError.hidden=!message;}
function updatePlaybackLabel(){const videos=[videoSlot.querySelector('video'),afterSlot.querySelector('video')].filter(Boolean);syncButton.textContent=videos.some(video=>!video.paused&&!video.ended)?'Pausar ambos':'Reproduzir juntos';}
function metricCard(label,value){const el=document.createElement('div');el.className='metric';const val=document.createElement('strong');val.textContent=value;const cap=document.createElement('span');cap.textContent=label;el.append(val,cap);return el;}
function outcomeName(value){return ({obstacle_observed:'Possível obstáculo',goal_reached:'Objetivo observado',inconclusive:'Inconclusivo',exploration_inconclusive:'Inconclusivo'})[value]||'Não confirmado';}
function comparisonPairs(data){
  if(Array.isArray(data.pairs)&&data.pairs.length)return data.pairs;
  return [{personaId:data.before?.persona?.id || data.after?.persona?.id || 'legacy',persona:data.before?.persona || data.after?.persona,before:data.before,after:data.after,comparison:data.comparison}];
}
function renderPersonaTabs(data,pairs){
  personaComparison.hidden=pairs.length<2;
  if(pairs.length<2){personaTabs.replaceChildren();pairProgress.textContent='';return;}
  const signature=pairs.map(pair=>pair.personaId).join('|');
  if(personaTabs.dataset.signature!==signature){
    personaTabs.replaceChildren();personaTabs.dataset.signature=signature;
    for(const pair of pairs){
      const button=document.createElement('button');button.type='button';button.className='persona-tab';button.dataset.persona=pair.personaId;button.setAttribute('aria-pressed','false');
      const name=document.createElement('strong');name.textContent=personaName(pair.persona,pair.personaId);
      const state=document.createElement('span');state.className='persona-tab-state';button.append(name,state);
      button.addEventListener('click',()=>{selectedPairId=pair.personaId;for(const video of document.querySelectorAll('.video-slot video'))video.pause();renderComparison(comparisonData);});personaTabs.append(button);
    }
  }
  for(const button of personaTabs.querySelectorAll('button')){
    const pair=pairs.find(item=>item.personaId===button.dataset.persona);button.setAttribute('aria-pressed',String(pair.personaId===selectedPairId));
    const status=pair.before?.status==='finished'&&pair.after?.status==='finished'?'Antes e depois':pair.personaId===data.currentPersonaId&&['running_before','running_after'].includes(data.status)?'Em execução':pair.before||pair.after?'Registro parcial':'Aguardando';
    button.querySelector('span').textContent=status;
  }
  const activePair=pairs.find(pair=>pair.personaId===data.currentPersonaId);
  const count=pairs.flatMap(pair=>[pair.before,pair.after]).filter(run=>run?.status==='finished').length;
  pairProgress.textContent=['running_before','running_after'].includes(data.status)?`${personaName(activePair?.persona,data.currentPersonaId)} · ${data.status==='running_before'?'antes':'depois'} · ${count}/${pairs.length*2}`:`${count}/${pairs.length*2} jornadas concluídas`;
}
function renderComparison(data){
  clearRunNotice();
  comparisonData=data;
  const pairs=comparisonPairs(data);
  if(!pairs.some(pair=>pair.personaId===selectedPairId))selectedPairId=pairs.find(pair=>pair.personaId===data.currentPersonaId)?.personaId || pairs[0]?.personaId;
  const pair=pairs.find(pair=>pair.personaId===selectedPairId)||pairs[0];
  renderPersonaTabs(data,pairs);renderPersona(pair?.persona || pair?.before?.persona || pair?.after?.persona,data.scenarioId);
  statusEl.textContent=comparisonNames[data.status]||'Estado desconhecido';
  if(['queued','running_before','running_after','cancelling'].includes(data.status)){comparisonRunning=true;comparisonActiveId=data.id;comparisonCancelling ||= data.status==='cancelling';scheduleActiveComparisonCheck();}else if(comparisonRunning){void refreshActiveComparisonState();}updateControls();updateImprovementControls();
  const selectedOption=comparisonSelect.selectedOptions[0];if(selectedOption && selectedOption.value===data.id)selectedOption.textContent=selectedOption.textContent.replace(/ · [^·]*$/,` · ${comparisonNames[data.status]||data.status}`);
  comparisonStatus.textContent=comparisonCancelling?'Finalizando gravação':comparisonNames[data.status]||'Estado desconhecido';
  const activeLabel=personaName(pairs.find(item=>item.personaId===data.currentPersonaId)?.persona,data.currentPersonaId);
  comparisonMessage.textContent=(data.status==='cancelling'||comparisonCancelling)?'Salvando as gravações.':data.status==='cancelled'?'Interrompida. Registros disponíveis abaixo.':data.status==='completed'?(pairs.length>1?'Duas personas. Sessões independentes em cada versão.':'Duas execuções sintéticas independentes.'):data.status==='running_before'?`${pairs.length>1?activeLabel:'A persona'} está explorando a versão original.`:data.status==='running_after'?`${pairs.length>1?activeLabel:'A persona'} está explorando a candidata.`:data.status==='queued'?'Preparando as jornadas.':'Consulte os registros disponíveis.';
  for(const side of ['before','after']){
    const run=pair?.[side],isBefore=side==='before',slot=isBefore?videoSlot:afterSlot,experienceSlot=$(isBefore?'#before-experience':'#after-experience');
    if(run)renderRunVideo(run,slot,experienceSlot,isBefore?'antes':'depois');
    else{
      const ended=['cancelled','failed','interrupted','invalidated'].includes(data.status),recording=pair?.personaId===data.currentPersonaId&&data.status===`running_${side}`;
      slot.dataset.orientation=pair?.persona?.viewport?.width<pair?.persona?.viewport?.height?'portrait':'landscape';
      $(isBefore?'#before-subtitle':'#after-subtitle').textContent=recording?'Gravando…':isBefore?'Original':'Candidata';
      showEmptyVideo(slot,ended?'Sem gravação':recording?'Gravando…':'Aguardando gravação',ended?'Nenhum vídeo disponível nesta etapa.':recording?'Aguardando a primeira captura.':'Esta jornada ainda não começou.');
      $(isBefore?'#before-original':'#after-original').hidden=true;experienceSlot.replaceChildren();delete experienceSlot.dataset.signature;
    }
  }
  syncButton.disabled=!(videoSlot.querySelector('video')&&afterSlot.querySelector('video'));updatePlaybackLabel();
  comparisonMetrics.replaceChildren();
  const metrics=pair?.comparison || (pairs.length===1?data.comparison:null);
  if(metrics){for(const side of ['before','after']){const m=metrics[side];if(!m)continue;const label=side==='before'?'Antes':'Depois';comparisonMetrics.append(metricCard(`${label} · resultado`,outcomeName(m.outcome)));if(Number.isInteger(m.actionCount))comparisonMetrics.append(metricCard(`${label} · ações`,String(m.actionCount)));}comparisonMetrics.hidden=false;}else comparisonMetrics.hidden=true;
  comparisonNotify(data.error||'');
}
async function refreshComparison(id,version){try{const response=await fetch(`/api/comparisons/${encodeURIComponent(id)}`,{cache:'no-store'});if(!response.ok)throw new Error('Não foi possível carregar a comparação.');const data=await response.json();if(id!==comparisonId||version!==comparisonVersion)return;renderComparison(data);clearTimeout(comparisonTimer);comparisonTimer=null;if(['queued','running_before','running_after','cancelling'].includes(data.status))comparisonTimer=setTimeout(()=>refreshComparison(id,version),2500);updateComparisonControls();}catch(error){if(version===comparisonVersion){comparisonNotify(error.message);clearTimeout(comparisonTimer);comparisonTimer=null;updateComparisonControls();}}}
async function chooseComparison(id,restoreSource=false){if(!validId(id))return;clearRunNotice();if(comparisonId!==id){selectedPairId=null;comparisonData=null;}clearTimeout(comparisonTimer);comparisonId=id;const version=++comparisonVersion;comparisonSelect.value=id;if(restoreSource){try{const r=await fetch(`/api/comparisons/${encodeURIComponent(id)}`,{cache:'no-store'});const c=await r.json();const jr=await fetch(`/api/improvements/${encodeURIComponent(c.improvementId)}`,{cache:'no-store'});const j=await jr.json();if(validId(j.runId)&&j.runId!==currentId){currentId=null;await refresh(j.runId);comparisonId=id;comparisonSelect.value=id;}}catch{/* Comparison remains viewable even if its source cannot be restored. */}}
  await refreshComparison(id,version===comparisonVersion?version:comparisonVersion);
}
function scheduleActiveComparisonCheck(){if(!comparisonActiveTimer)comparisonActiveTimer=setTimeout(refreshActiveComparisonState,5000);}
async function refreshActiveComparisonState(){clearTimeout(comparisonActiveTimer);comparisonActiveTimer=null;try{const response=await fetch('/api/comparisons',{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();const active=(data.comparisons||[]).find(c=>['queued','running_before','running_after','cancelling'].includes(c.status));const wasRunning=comparisonRunning;comparisonRunning=Boolean(active);comparisonActiveId=active?.id||null;if(active?.status==='cancelling')comparisonCancelling=true;if(!active)comparisonCancelling=false;updateControls();updateImprovementControls();updateComparisonControls();if(wasRunning&&!active)void checkHealth();}catch{/* Preserve the last known active state until the service can be reached. */}if(comparisonRunning)scheduleActiveComparisonCheck();}
async function loadComparisons(autoSelect=false){try{const response=await fetch('/api/comparisons',{cache:'no-store'});if(!response.ok)return;const data=await response.json();const list=(Array.isArray(data.comparisons)?data.comparisons:[]).filter(x=>validId(x.id));const active=list.find(c=>['queued','running_before','running_after','cancelling'].includes(c.status));const wasRunning=comparisonRunning;comparisonRunning=Boolean(active);comparisonActiveId=active?.id||null;if(active?.status==='cancelling')comparisonCancelling=true;if(!active)comparisonCancelling=false;if(comparisonRunning)scheduleActiveComparisonCheck();updateControls();updateImprovementControls();updateComparisonControls();if(wasRunning&&!active)void checkHealth();const chosen=comparisonId;comparisonSelect.replaceChildren(new Option('Comparações salvas',''));for(const c of list)comparisonSelect.add(new Option(`${c.createdAt?new Date(c.createdAt).toLocaleString('pt-BR'):c.id.slice(0,8)} · ${comparisonNames[c.status]||c.status}`,c.id));if(chosen)comparisonSelect.value=chosen;else if(autoSelect&&list.length){const latest=list.find(c=>['queued','running_before','running_after','cancelling'].includes(c.status))||list.find(c=>c.status==='completed')||list[0];await chooseComparison(latest.id,true);}}catch{/* Service may not yet expose comparisons. */}}
comparisonStart.addEventListener('click',async()=>{if(comparisonStart.disabled||!validId(selectedImprovementJob?.id))return;comparisonStarting=true;comparisonNotify('');updateComparisonControls();try{const response=await fetch('/api/comparisons',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({improvementId:selectedImprovementJob.id})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Serviço de comparação indisponível.');comparisonStarting=false;await loadComparisons();await chooseComparison(data.id);}catch(error){comparisonStarting=false;comparisonNotify(error.message);updateComparisonControls();}});
comparisonCancel.addEventListener('click',async()=>{if(!comparisonRunning||comparisonCancelling||!validId(comparisonActiveId))return;const id=comparisonActiveId;comparisonCancelling=true;comparisonNotify('');if(comparisonId===id){comparisonStatus.textContent='Finalizando gravação';comparisonMessage.textContent='Salvando o que foi registrado até a interrupção.';}updateComparisonControls();try{const response=await fetch(`/api/comparisons/${encodeURIComponent(id)}/cancel`,{method:'POST'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Não foi possível interromper a comparação.');await refreshActiveComparisonState();if(comparisonId===id)await refreshComparison(id,comparisonVersion);}catch(error){comparisonCancelling=false;comparisonNotify(error.message);updateComparisonControls();await refreshActiveComparisonState();}});
comparisonSelect.addEventListener('change',()=>{if(comparisonSelect.value)chooseComparison(comparisonSelect.value,true);else{clearComparisonView();if(selectedRun)render(selectedRun);}});
$('#comparison-refresh').addEventListener('click',async()=>{await loadComparisons();if(comparisonId)await refreshComparison(comparisonId,comparisonVersion);});
syncButton.addEventListener('click',async()=>{const a=videoSlot.querySelector('video'),b=afterSlot.querySelector('video');if(!a||!b)return;if(!a.paused||!b.paused){a.pause();b.pause();syncButton.textContent='Reproduzir juntos';return;}if(a.ended||b.ended){a.currentTime=0;b.currentTime=0;}try{await Promise.all([a.play(),b.play()]);syncButton.textContent='Pausar ambos';}catch{a.pause();b.pause();syncButton.textContent='Reproduzir juntos';comparisonNotify('Não foi possível reproduzir os dois vídeos. Use os controles individuais.');}});

// Keep navigation in step with the visible section, including expandable evidence.
const navLinks=[...document.querySelectorAll('.side-nav a')];let navClickTarget=null;
function setNav(hash){for(const link of navLinks){const active=link.getAttribute('href')===hash;link.classList.toggle('selected',active);if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');}}
for(const link of navLinks)link.addEventListener('click',()=>{const hash=link.getAttribute('href');if(hash==='#evidence')$('#evidence').open=true;navClickTarget=hash;setNav(hash);});
let navFrame=null;function updateNav(){navFrame=null;if(navClickTarget)return;let hash='#main';for(const id of ['improvement','evidence']){const section=document.getElementById(id);if(section && section.getBoundingClientRect().top<=180)hash=`#${id}`;}setNav(hash);}
for(const eventName of ['wheel','touchstart','keydown'])window.addEventListener(eventName,()=>{navClickTarget=null;},{passive:true});window.addEventListener('pointerdown',event=>{if(!event.target.closest('.side-nav a'))navClickTarget=null;},{passive:true});window.addEventListener('scroll',()=>{if(!navFrame)navFrame=requestAnimationFrame(updateNav);},{passive:true});updateNav();
