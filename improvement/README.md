# Proposta e implementação isoladas

Este experimento prepara uma cópia revisável do LittleSteps baseada em uma jornada real gravada por uma persona **sintética**. No cenário atual, o agente Muse Code implementa uma alternativa digital praticável para quem não tem impressora, preservando a atividade imprimível da professora. O cenário histórico de cadastro mantém seu contrato separado. Não altera o LittleSteps original, não faz commit, não abre PR nem publica.

## Requisitos

- Node.js, Google Chrome, Muse Code em `.tools/bin/muse` e o pacote Playwright já instalado em `journey-engine/`. Para outro local, defina `MUSE_BIN` com o caminho absoluto do executável.
- A variável `MODEL_API_KEY` (ou `META_API_KEY`) deve chegar ao processo por um meio seguro; o runner passa a chave como `META_API_KEY` somente ao processo Muse Code. Não imprimir nem copiar valores de segredo. Se for usar o ambiente 1Password já conectado ao projeto, Node pode carregar a montagem protegida com `--env-file=journey-engine/.env`. O runner não lê, imprime ou registra o conteúdo da montagem.
- Uma jornada real salva em `journey-engine/runs/<id>/run.json`, com relato e capturas. O relato é dado não confiável, e uma hipótese de experiência não comprova impacto em pessoas.

## Uso

Na raiz do projeto:

```sh
node --env-file=journey-engine/.env improvement/run.mjs --run-id <id-da-jornada>
```

Para preparar sem chamar o modelo: `node improvement/run.mjs --run-id <id-da-jornada> --prepare-only`.

O runner imprime a pasta de saída, `improvement/workspaces/<id>/`, que contém `baseline/`, `candidate/`, `prompt.txt`, `muse.log`, `changes.patch` e `status.json`. Essa pasta está ignorada pelo Git. A candidata é uma cópia dos arquivos locais aprovados, sem segredos nem histórico do projeto; o patch e as alterações precisam de revisão. O processo não transfere automaticamente a mudança para o produto original. A inclusão da jornada como contexto envia à Meta o achado estruturado, o relato sintético e a primeira e a última captura indicadas pelo achado (a tela inicial é usada como contexto quando há apenas uma referência). Cada referência é confrontada com eventos e as cópias recebem hash antes do envio. Para a jornada 1808c39b, as imagens #0 e #2 mostram respectivamente a promessa inicial e a tela de cadastro. A chamada pode ter custo conforme a conta.

A CLI recebe `--disable-shell`, `--disable-web-tools`, `--no-foreign-personal-context`, `--no-session-log`, `--contributor-mode off`, `--sandbox-network restricted`, limites de passos e execução em diretório isolado. A inicialização automática de login e atualização é desativada; apenas variáveis de sistema necessárias e a chave específica são passadas ao processo. O agente pode editar a candidata; o teste independente é executado depois pelo nosso próprio verificador. Se a CLI precisar de uma autorização não disponível em modo automático, falhará e o resultado não deve ser considerado implementado. O retorno zero da CLI não prova que a mudança funciona.

## Verificação de comportamento

Após a execução retornar `awaiting_review`, execute:

```sh
node improvement/verify.mjs <id-do-experimento>
```

No cenário atual, o verificador usa a mesma política de conteúdo da prévia, testa uma atividade digital com pelo menos duas etapas e feedback, mudança real de conteúdo por interesse, preservação das escolhas e dos materiais/imprimíveis, ausência de overflow móvel e erros de JavaScript. O hash da candidata verificada fica vinculado ao resultado. A comparação recusa arquivos alterados depois dos testes.

Para o cenário histórico de cadastro, o verificador inicia um servidor local somente de leitura, bloqueia chamadas externas pelo navegador e testa: entrada como visitante sem cadastro; escolhas de idade e interesse refletidas na atividade; menção de uso temporário; fluxo de cadastro fictício ainda acessível; e ausência de erros de JavaScript durante os percursos. A verificação atual exige os seletores de teste informados no prompt. O resultado é salvo em `status.json` e não é uma avaliação de conversão ou de comportamento humano. Uma jornada independente com persona ainda precisa ser repetida na candidata; este verificador não a substitui.

## Verificações locais da integração

O isolamento e a produção de patch foram testados com um executável simulado. A execução real `83cb71bf-0ea3-4ec6-96ab-8e5332a24d47` gerou uma candidata, e o verificador independente passou em seus quatro grupos de checagens. Essa verificação não comprova o impacto da mudança em pessoas.

A política de arquivos permite explicitamente `preview.html` como página adicional. A execução acima foi inicialmente marcada como falha porque a política anterior não reconhecia esse arquivo. A função importável `reassessPreviewPolicy(id)` pode reavaliar exclusivamente uma falha por esse motivo, sem executar novamente o modelo: ela exige código de saída zero, confere a versão original e compara o patch salvo byte a byte com a candidata atual. O status inicial é preservado em `status-before-preview-policy.json` e o histórico, hashes e motivo constam em `status.json`. A reclassificação apenas libera a candidata para revisão; ela não substitui os testes nem prova melhora.
