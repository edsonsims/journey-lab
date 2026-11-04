# Journey Lab — motor de experimento

## Workspace API (current)

The versioned multi-project application uses `/api/workspace/*`. The older endpoints documented below remain for the preserved demo. Build `../journey-workspace` to serve the new interface at `/`; `/legacy` opens the previous interface.

- `GET /api/workspace/bootstrap?projectId=...` provides project-scoped collections and availability. Run detail includes the full events and recording map.
- Projects, environments, missions and personas have create/edit endpoints. Environment/mission/persona saves append immutable versions. Environment checks report reachability, repository/session availability and remaining configuration separately; a reachable URL does not verify its deployment matches the source checkout.
- `POST /api/workspace/runs` accepts `projectId`, `charterId`, `personaIds`, `environmentId`, optional `name`, and an `Idempotency-Key` header. It returns one atomic Run per selected persona. Each run pins its three configuration versions.
- Findings support review/classification overrides with an audit trail. Issues group Broken occurrences within one project, with distinct Run counts.
- Fixes derive their proposal from the selected finding and source, implement in isolated copies using Muse Code, run configured checks, then retest the required personas independently. Comments retain the exact round, artifact and original timestamp. Requesting changes makes a new round. Approval is bound to the current candidate hash and valid retests; PR delivery remains `approved_connection_required` until a provider is implemented/configured.
- `POST /api/workspace/fixes/:id/preview` with `roundId` explicitly reopens a stopped candidate preview after checking source hashes. Reading a Fix never starts framework commands. Historical recording URLs are stable independently of ephemeral preview ports.

Default capture is video, screenshots, console errors and network metadata. Request/response bodies require environment opt-in. Known sensitive field types and configured selectors are masked; URL query values and common credential fields are redacted. Use approved test data. Retention is keep-all. Interrupted work remains recorded and retries create new Run IDs.

Generic targets must have their permitted origins configured; test-data mutations require the environment flag. Independent browser sessions are automatic; a framework/backend app also needs a configured data-isolation strategy. Static source copies run on separate loopback ports. Environment-level token/time/action budgets stop a run without converting it to success. A final provider response can take usage beyond the token budget before the next check.

## Secure startup and review mode

Run `npm run start:secure` from this directory to use the existing 1Password `.env` mount. For visible browser journeys, use `JOURNEY_SHOW_BROWSER=1 npm run start:secure`. The launcher delegates the mount directly to `node --env-file=.env server.mjs`; it never opens or reads that FIFO itself, copies a key, prints raw startup errors, or unlocks 1Password.

If the secure child does not report readiness within ten seconds, it is stopped before a review-mode child starts. Review mode has provider-key variables removed and clearly reports that Meta is unavailable. Existing journeys, recordings, Library records and reviews remain accessible; paid actions remain unavailable. If a second app already occupies the port or review startup also fails, the launcher stops rather than retrying indefinitely.

To reconnect Meta, unlock 1Password yourself, stop the review-mode app, then run `npm run start:secure` again. Do not read, replace or copy the mounted `.env` file. `npm start` continues to start the server directly using its existing process environment; it does not load the mount. `JOURNEY_START_TIMEOUT_MS` can set a different bounded wait from 100 to 60,000 milliseconds.

Stop with Ctrl-C. The launcher forwards termination and allows the server up to fifteen seconds to finish recording cleanup before forcing the child to stop. Interrupted records and original media remain retained. Launcher tests use simulated child processes and never open the actual mount.

## Original demo API and historical behavior

Protótipo local que registra jornadas de uma persona sintética no LittleSteps com o Muse Wonder. A jornada grava ações, capturas, um vídeo e um relato estruturado. Comentários em primeira pessoa são simulações geradas pelo modelo, não relatos ou medições de pessoas reais. As conclusões e evidências exigem revisão humana.

## Preparação

Requisitos: Node.js, npm, Google Chrome, FFmpeg/FFprobe e uma chave Meta Model API disponível no ambiente como `MODEL_API_KEY`. Não coloque chaves no repositório ou nas capturas. As chamadas à API podem gerar custos. O gravador usa por padrão `/opt/homebrew/bin/ffmpeg` e `/opt/homebrew/bin/ffprobe`; se não conseguir produzir o replay compacto, mantém o vídeo original.

Na pasta `journey-engine`, instale com `npm install` e `npx playwright install ffmpeg`. Inicie o LittleSteps em `http://127.0.0.1:4320/` e rode `npm start` nesta pasta. O painel fica em `http://127.0.0.1:4319/`; `JOURNEY_PORT` muda a porta do painel. Com a chave ausente, chamadas pagas são recusadas. A Meta recebe o contexto da persona, missão e capturas; use somente dados fictícios autorizados.

## Jornadas e melhorias

- `GET /api/health` informa disponibilidade sem revelar a chave.
- `GET /api/runs` lista jornadas; `GET /api/runs/:id` traz eventos, relato, capturas, comentários opcionais e vídeo.
- `GET /api/personas` lista os perfis e seus dispositivos.
- `POST /api/runs` aceita `{ "scenarioId": "print-context-v1", "personaId": "teacher" }` ou `mother`; omitir campos usa o cenário atual e a mãe.
- `GET /api/improvements` e `GET /api/improvements/:id` expõem propostas; `POST /api/improvements` com `{ "runId": "...", "supportRunIds": ["..."] }` inicia uma proposta numa cópia isolada. O apoio é opcional (até três jornadas); cenário e hashes precisam corresponder ao produto observado.
- `GET /runs/:id/...` serve os arquivos registrados, incluindo vídeo original e eventual replay, com suporte a intervalos para navegação no vídeo.

`finished` significa que o modelo encerrou com referências a capturas existentes. Isso não garante que a missão foi concluída ou que as capturas sustentem o relato. Uma execução interrompida mantém suas evidências; nenhuma proposta é aplicada ao produto original e a API não cria PR.

## Comparações

`POST /api/comparisons` aceita `{ "improvementId": "..." }` para uma melhoria com estado `awaiting_review` e verificação local aprovada. `GET /api/comparisons` lista metadados, e `GET /api/comparisons/:id` inclui `pairs`, com persona, jornadas `before`/`after` e resultados factuais. `currentPersonaId` identifica quem está executando; os campos no topo permanecem como aliases para compatibilidade com o histórico.

No cenário atual o motor executa professora/antes, professora/depois, mãe/antes e mãe/depois em sequência, cada um em um contexto de navegador novo, com a mesma persona, missão, modelo, instruções, viewport e limite de 24 ações. O modelo não recebe o achado anterior nem a proposta. As variantes são servidas em uma origem de prévia isolada, com acesso restrito ao prefixo da respectiva variante. Arquivos permitidos são identificados por hash e conferidos durante a comparação; uma mudança invalida o resultado. O estado só é `completed` após todas as jornadas do cenário terminarem com relatos estruturados e vídeos originais salvos. Outros estados incluem `queued`, `running_before`, `running_after`, `cancelling`, `cancelled`, `failed`, `invalidated` e `interrupted`. `POST /api/comparisons/:id/cancel` solicita cancelamento cooperativo, interrompe a espera da API e preserva as evidências e o vídeo que puderem ser finalizados.

A comparação atual descreve quatro execuções sintéticas independentes, duas por persona; o cenário antigo mantém duas. Não mede satisfação, conversão ou impacto em pessoas. Cada captura e interpretação precisa ser revisada; os dois resultados podem ser inconclusivos ou contraditórios.

O produto é identificado por hash na descoberta e na cópia. A verificação da candidata usa a mesma política de conteúdo da prévia e salva seu hash; uma mudança posterior impede iniciar a comparação.

## Gravação e navegação

Para acompanhar a navegação na janela real do Chrome, inicie o motor com `JOURNEY_SHOW_BROWSER=1`. A janela usa o mesmo contexto isolado, viewport e gravação da execução sem janela; evite interagir com ela enquanto a persona navega. O painel continua mostrando as capturas durante a execução e os vídeos sincronizados quando a gravação termina.

O modelo recebe o número de tentativas restantes. Ao atingir 24, uma chamada final dispõe apenas de `finish_journey`; só uma conclusão estruturada com referências válidas pode finalizar, inclusive como inconclusiva. O limite fica explícito em `navigationBudgetExhausted` e no vídeo. Recusas e interrupções de segurança continuam sem liberar novas ações.

O driver valida uma ação por resposta e entrega uma captura nova ao modelo. Em links e botões visíveis, o modelo pode solicitar um clique físico pelo nome exato; a ação é recusada se o controle não for único, estiver encoberto ou mudar antes do clique. No clique por coordenadas, o evento informa o alvo observado sob o ponteiro para a persona distinguir ação de intenção. Coordenadas fornecidas pelo modelo são normalizadas de 0 a 1000 e convertidas para pixels do viewport; o evento registra tanto as coordenadas originais quanto as executadas. Quando um seletor nativo visível está em foco, o modelo recebe seu rótulo e opções disponíveis e pode fazer uma seleção explícita pela interface de acessibilidade; a operação real e seu método são registrados, sem simular um clique ou popup. O navegador limita navegação e recursos ao alvo local autorizado. Não são aceitos dados reais, credenciais ou downloads. O conteúdo das páginas é tratado como dado não confiável. O protótipo não é um ambiente para sites arbitrários ou dados de produção.

A gravação original preserva a navegação com indicadores visuais de cursor e clique. Quando a calibração é identificada e há espera suficiente do modelo, um replay separado remove as esperas medidas e o início técnico; o original é mantido. Caso a calibração não seja confiável, o sistema mantém somente o original e não inventa os tempos. Cada comentário opcional separa observação da tela e reação simulada; referências temporais são preenchidas somente quando calibradas. O áudio não é sintetizado pelo motor.

As chamadas usam replay stateless: cada resposta solicita reasoning criptografado e a próxima chamada reenvia o histórico mantido em memória, sem IDs de resposta ou de reasoning. O conteúdo criptografado e as capturas em base64 não são salvos como eventos. Se uma resposta não contiver o conteúdo necessário para preservar o reasoning, o evento `context_limited` registra a limitação sem inventar conteúdo.

Os testes de contrato não executam o modelo. Para testá-lo de verdade é necessária uma jornada separada, usando a chave e créditos autorizados.
