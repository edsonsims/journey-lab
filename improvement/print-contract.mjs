export const PRINT_SCENARIO = 'print-context-v1';

export function printTask() {
  return `Task: use the recorded journeys to address the contextual obstacle in this print-based learning product. Implement a small, real on-screen activity alternative that a parent without a printer can start now. Preserve the teacher's printable worksheet and preparation path. Do not simply remove material warnings, relabel the printed exercise, or claim that printing happened. Preserve the visual identity, accessible names, responsive layout, and age/interest personalization. No accounts, network, external services or dependencies are needed.

Acceptance criteria:
1. A visitor goes directly from the landing page to setup through data-testid="activity-start". Keep #setup-form, select#age, select#interest, and #activity-title/#activity-age/#activity-interest. Keep existing selection values. Selections are local and temporary.
2. Setup offers clearly labeled native radio inputs name="format" value="screen" and value="print". Describe required resources before the choice. The screen alternative requires only the device and no printing/cutting. The print path retains its actual material requirements. Keep the chosen age and interest when changing format. IMPORTANT: actually read the stored selected format when rendering activity.html. The selected format must control the primary activity, not merely be saved. Show data-testid="activity-format" as "On screen" or "Printable". In screen mode hide the entire print materials/worksheet/preparation section and show the real digital activity. In print mode hide the digital start/interaction and preserve the print section. A visible Change choices link lets the visitor change format again.
3. The on-screen result contains a real short learning activity with content appropriate to the selected age and interest. A visible button data-testid="start-screen-activity" starts it. The started area data-testid="screen-activity" shows a concrete learning prompt data-testid="screen-prompt" and multiple actionable buttons data-testid="screen-choice". At least two steps respond visibly to the user's choices, with meaningful feedback data-testid="screen-feedback" and a changing data-testid="screen-progress". Use a reflective activity where any choice receives relevant feedback and can continue. If continuing requires a separate Next button, mark it data-testid="screen-next". Show data-testid="screen-complete" only after finishing all steps. Completion may state only observable actions (for example, three choices explored), never that a person spoke, wrote, understood or learned without observation. Screen-mode follow-ups must be verbal or interactive within this device; do not ask for handwriting unless there is a real writing input. Use accurate concise content: astronauts carry safe drinking water; do not claim that the Moon contains no water. A success card alone is insufficient.
4. Preserve the existing printed worksheet content, the button data-testid="prepare-activity", the section data-testid="printable-worksheet", and the locally saved preparation plan data-testid="activity-ready". Keep the preparation-save button id="save-preparation". In print media hide all new digital controls/sections so the printable worksheet remains clean. Preserve honest wording: a prepared plan is not a physically printed activity. Keep the available account demo path if present.
5. Keep the same allowed static files. Use activity.html and app.js for both formats; do not add libraries or file types. Responsive behavior must work at 390x844 and 1280x800. All controls need visible labels, keyboard support and clear focus states. Audit existing broad form selectors: native radios must retain compact radio dimensions and properly aligned clickable labels, rather than inheriting full-width text-input styling. Use external app.js only; the preview has a restrictive CSP.
6. Write IMPROVEMENT.md with the observed obstacle and source journey IDs, changes, checks actually performed, limitations, and what remains untested. Treat persona reactions as simulated observations, not human satisfaction or conversion measurements. Never commit, push, publish or create a PR.`;
}

export async function verifyPrintCandidate({ browser, origin, pass, results }) {
  let blockedRequests = 0;
  const errors = [];
  async function context(viewport) {
    const ctx = await browser.newContext({ viewport });
    await ctx.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin || route.request().method() !== 'GET') { blockedRequests++; return route.abort(); }
      return route.continue();
    });
    const page = await ctx.newPage(); page.setDefaultTimeout(8000); page.on('pageerror', e => errors.push(e.message));
    return { ctx, page };
  }
  async function configure(page, format, interest = 'Space') {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('activity-start').first().click();
    for (const value of ['screen','print']) { const radio = page.locator(`input[name="format"][value="${value}"]`); const box = await radio.boundingBox(); if(!box || box.width > 40 || box.height > 40) throw Error('Controle de formato não tem dimensões adequadas.'); }
    await page.locator('#age').selectOption({ label: '6–8 years' });
    await page.locator('#interest').selectOption({ label: interest });
    await page.locator(`input[name="format"][value="${format}"]`).check();
    // Switching resource format must not discard the user's earlier work.
    await page.locator(`input[name="format"][value="${format === 'screen' ? 'print' : 'screen'}"]`).check();
    await page.locator(`input[name="format"][value="${format}"]`).check();
    if ((await page.locator('#age option:checked').innerText()).trim() !== '6–8 years' || (await page.locator('#interest option:checked').innerText()).trim() !== interest) throw Error('Trocar formato descartou as escolhas.');
    await page.locator('#setup-form button[type="submit"]').click();
    await page.locator('#activity-title').waitFor({ state: 'visible' });
    const displayedFormat = await page.getByTestId('activity-format').innerText();
    if (!displayedFormat.includes(format === 'screen' ? 'On screen' : 'Printable')) throw Error('O resultado ignora o formato escolhido.');
    if (format === 'screen' && await page.getByTestId('prepare-activity').isVisible()) throw Error('O modo digital ainda apresenta o percurso imprimível como atividade principal.');
    if (format === 'screen' && await page.getByTestId('activity-materials').isVisible()) throw Error('Requisitos de impressão continuam visíveis no modo digital.');
    if (format === 'print' && await page.getByTestId('start-screen-activity').isVisible()) throw Error('O modo imprimível ignora a escolha e mostra os controles digitais.');
    if (!(await page.locator('#activity-age').innerText()).includes('6–8') || !(await page.locator('#activity-interest').innerText()).includes(interest)) throw Error('Personalização não corresponde às escolhas.');
  }
  const mobile = await context({ width: 390, height: 844 });
  try {
    await configure(mobile.page, 'screen');
    await mobile.page.getByTestId('start-screen-activity').click();
    const area = mobile.page.getByTestId('screen-activity');
    await area.waitFor({ state: 'visible' });
    const spacePrompt = await mobile.page.getByTestId('screen-prompt').innerText();
    if ((await area.innerText()).trim().length < 60) throw Error('A atividade digital não contém uma tarefa concreta.');
    if (await mobile.page.getByTestId('screen-complete').isVisible()) throw Error('A atividade aparece concluída antes de interação.');
    const steps = [];
    for (let n = 0; n < 8; n++) {
      if (await mobile.page.getByTestId('screen-complete').isVisible()) break;
      const progress = await mobile.page.getByTestId('screen-progress').innerText();
      const choices = mobile.page.locator('[data-testid="screen-choice"]:visible');
      if (await choices.count() < 2) throw Error('A etapa precisa de escolhas reais.');
      const previous = await area.innerText();
      await choices.first().click();
      await mobile.page.waitForFunction(previous => document.querySelector('[data-testid="screen-activity"]')?.innerText !== previous, previous, {timeout:2000});
      const next = await area.innerText();
      if (previous === next) throw Error('A escolha não produziu resposta visível.');
      const feedback = mobile.page.getByTestId('screen-feedback');
      if (!await feedback.isVisible() || (await feedback.innerText()).trim().length < 15) throw Error('A escolha não recebeu feedback significativo.');
      const advance = mobile.page.getByTestId('screen-next');
      if (await advance.isVisible()) await advance.click();
      steps.push(progress);
    }
    if (new Set(steps).size < 2 || !await mobile.page.getByTestId('screen-complete').isVisible()) throw Error('Não foi possível completar pelo menos duas etapas digitais.');
    await mobile.page.emulateMedia({media:'print'});
    if(await area.isVisible() || await mobile.page.getByTestId('start-screen-activity').isVisible()) throw Error('A impressão inclui controles digitais.');
    await mobile.page.emulateMedia({media:'screen'});
    pass('No celular, atividade digital responde às escolhas e conclui pelo menos duas etapas sem impressão');
    await configure(mobile.page, 'screen', 'Animals');
    await mobile.page.getByTestId('start-screen-activity').click();
    if ((await mobile.page.getByTestId('screen-prompt').innerText()) === spacePrompt) throw Error('A tarefa digital não muda com o interesse.');
    const overflows = await mobile.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (overflows) throw Error('A interface móvel ultrapassa a largura da tela.');
    pass('Personalização e escolhas preservadas ao trocar formato; interface cabe no celular');
  } finally { await mobile.ctx.close(); }
  const desktop = await context({ width: 1280, height: 800 });
  try {
    await configure(desktop.page, 'print');
    await desktop.page.getByTestId('prepare-activity').click();
    const worksheet = desktop.page.getByTestId('printable-worksheet');
    await worksheet.waitFor({ state: 'visible' });
    if ((await worksheet.innerText()).trim().length < 150) throw Error('A atividade imprimível perdeu suas instruções.');
    for (const text of ['Water','Space suit','Food','Telescope','Teddy bear','Football','SHEET 1','SHEET 2']) if (!(await worksheet.innerText()).includes(text)) throw Error('Conteúdo da atividade imprimível original foi perdido: '+text);
    if (!await desktop.page.getByTestId('activity-materials').isVisible() || !/print|imprim/i.test(await desktop.page.getByTestId('activity-materials').innerText())) throw Error('Os materiais de impressão foram ocultados.');
    await desktop.page.locator('#save-preparation').click();
    await desktop.page.getByTestId('activity-ready').waitFor({ state: 'visible' });
    pass('Professora mantém atividade imprimível, requisitos e plano de preparação');
  } finally { await desktop.ctx.close(); }
  if (errors.length || blockedRequests) throw Error(errors[0] || 'A candidata tentou acessar recursos externos.');
  pass('Nenhum erro de JavaScript ou dependência de serviços externos nos dois percursos');
  return { blockedRequests, checks: results };
}
