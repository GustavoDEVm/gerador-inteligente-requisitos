# Integração de IA — Fases 7 a 11

## Escopo

As Fases 7 e 7.1 entregam a infraestrutura inicial de IA do Gerador Inteligente de Requisitos e o provider local determinístico. A Fase 8 acrescenta a geração estruturada de User Story, requisitos funcionais, requisitos não funcionais e critérios de aceitação. A Fase 9 detecta ambiguidades, a Fase 10 as transforma em perguntas de esclarecimento com respostas versionadas e a Fase 11 reprocessa requisitos como uma nova versão rastreável. Chat, RAG, edição e exportação continuam fora do escopo atual.

O Gemini foi adotado como primeiro provider real por disponibilizar SDK oficial para JavaScript/TypeScript (`@google/genai`) e suporte a Structured Outputs com JSON Schema. A Fase 7.1 adiciona `MockAIProvider`, uma implementação determinística e local para desenvolvimento e testes. A escolha não acopla as regras de negócio ao Gemini: ambos implementam o mesmo contrato e o provider é substituível.

Referências oficiais:

- [SDK Google GenAI e migração](https://ai.google.dev/gemini-api/docs/migrate)
- [Structured Outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Modelos Gemini disponíveis](https://ai.google.dev/gemini-api/docs/models)

## Arquitetura

```text
src/components/ai/ai-analysis-panel.tsx
        ↓
src/app/api/ai/analyze/route.ts
        ↓
src/services/ai/ai-service.ts
        ↓
src/services/ai/types.ts (AIProvider)
        ↓
src/services/ai/provider.ts (factory)
        ↓
GeminiProvider ou MockAIProvider
        ↓
Gemini API ou resposta local determinística
```

`AIProvider` recebe uma solicitação genérica com modelo, instrução de sistema, entrada do usuário, JSON Schema, temperatura, timeout e metadados. A interface não contém nomenclatura do Gemini. `GeminiProvider` adapta esse contrato para `GoogleGenAI.models.generateContent` e é o único arquivo que importa `@google/genai`. `MockAIProvider` retorna um resultado fixo, já validado por `initialRequirementAnalysisSchema`, sem importar SDK, acessar rede ou ler variáveis Gemini.

`AIService` é responsável por autorização, rastreabilidade e validação. A Route Handler limita-se a autenticar, validar o corpo HTTP com Zod e chamar o serviço. Componentes React não acessam o SDK, variáveis de ambiente ou credenciais.

## Configuração local

Copie `.env.example` para `.env` se ainda não houver um arquivo local. Para desenvolvimento local e testes manuais sem custo, use:

```env
AI_PROVIDER=mock
```

Nesse modo, `GEMINI_API_KEY` e `GEMINI_MODEL` não são lidos. O resultado é determinístico, não usa data/hora ou aleatoriedade e não envia dados para serviços externos.

Para usar Gemini real, mantenha valores reais exclusivamente no `.env`:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=sua_chave
GEMINI_MODEL=gemini-3.8-flash
```

`GEMINI_MODEL` é configurável porque modelos disponíveis e limites variam por conta. O exemplo usa um identificador estável documentado pela Google na data desta fase; confirme sua disponibilidade no Google AI Studio antes de iniciar a aplicação. Não há fallback automático: se `AI_PROVIDER=gemini`, falhas de configuração ou disponibilidade retornam erro; o sistema só usa `MockAIProvider` quando `AI_PROVIDER=mock` é escolhido explicitamente.

Não use `NEXT_PUBLIC_` para essas variáveis. `.env` e `.env.local` são ignorados pelo Git. Se Gemini estiver selecionado sem chave, modelo ou provider válido, a API retorna um erro controlado `AI_CONFIGURATION` com HTTP `503`, sem revelar qualquer valor de configuração.

Os scripts locais `npm run dev` e `npm run start` executam o Node com `--use-system-ca`. Assim, a cadeia de certificados é validada contra as autoridades confiáveis do sistema operacional — inclusive em redes corporativas com CA instalada — sem desativar TLS nem alterar a configuração `strict-ssl` do npm.

## Endpoint e contrato

`POST /api/ai/analyze` é uma rota privada e aceita:

```json
{
  "projectId": "UUID do projeto do usuário",
  "sessionId": "UUID da sessão pertencente ao projeto",
  "input": "Descrição do sistema com 20 a 8000 caracteres"
}
```

O `userId` nunca é aceito no corpo: vem exclusivamente da sessão JWE. O serviço confirma que o projeto pertence ao usuário e que a sessão pertence ao projeto antes de iniciar a análise.

O resultado tem este contrato inicial:

```json
{
  "summary": "Resumo da ideia analisada.",
  "userStory": {
    "actor": "aluno",
    "action": "consultar e reservar livros disponíveis",
    "benefit": "encontrar obras e reservar antes de ir à biblioteca"
  },
  "observations": ["..."],
  "ambiguities": ["..."],
  "suggestions": ["..."]
}
```

O JSON Schema gerado a partir de `initialRequirementAnalysisSchema` é enviado ao Gemini como Structured Output. A resposta retornada passa novamente por Zod no servidor. A conversão de texto JSON do SDK é apenas a desserialização do transporte após a exigência de Structured Output; Zod é a validação de confiança antes de persistir ou retornar o dado.

## Histórico e integridade

Cada execução cria um registro independente em `AIAnalysis`, inicialmente com status `RUNNING`, e o associa a uma sessão por `AIAnalysisSession`. O registro guarda:

- provider e modelo efetivamente utilizados;
- texto e versão do prompt (`analyze-system-v1`);
- `inputSnapshot` com a descrição e a sessão;
- saída validada em `structuredOutput` quando bem-sucedida;
- status final, instante de conclusão e `errorCode` em falhas.

O registro não é reutilizado ou sobrescrito para uma nova análise. Em sucesso, o sistema também cria `ActivityLog` com `ANALYSIS_COMPLETED`. `responsePayload` permanece vazio nesta fase porque duplicaria a saída validada e poderia reter informações técnicas sem necessidade.

## Erros e limites

| Código | HTTP | Situação |
| --- | --- | --- |
| `AI_CONFIGURATION` | 503 | Provider, chave ou modelo ausente; ou provider ainda não implementado. |
| `AI_PROVIDER_UNAVAILABLE` | 503 | Falha inesperada ou indisponibilidade externa. |
| `AI_RATE_LIMIT` | 429 | Limite temporário informado pelo provider. |
| `AI_TIMEOUT` | 504 | Limite local de 30 segundos atingido. |
| `AI_INVALID_RESPONSE` | 422 | JSON ausente/malformado ou incompatível com o schema Zod. |

Nenhum desses erros devolve stack trace, API key, prompt interno completo ou detalhes brutos do SDK ao frontend. Para investigação operacional, o `GeminiProvider` registra no servidor apenas metadados seguros da falha (operação, modelo, status e códigos/nome do erro e de sua causa), sem chave, prompt ou conteúdo de elicitação. Isso permite identificar, por exemplo, uma falha local de cadeia TLS sem expor detalhes ao navegador.

## Retry limitado para indisponibilidade transitória

Nas operações `generate-requirements` e `detect-ambiguities`, o `GeminiProvider` executa no máximo duas tentativas para uma mesma chamada lógica. Somente uma falha HTTP `503` transitória reconhecida por propriedades estruturadas do SDK (`status` ou `statusCode`, inclusive na causa ou resposta aninhada) agenda uma segunda tentativa após 1 segundo. O SDK não recebe opções próprias de retry; essa única repetição é controlada pela aplicação. As demais operações de IA mantêm o comportamento sem retry.

Timeouts de 30 segundos, erros `400`, `401`, `403`, `404`, `429`, falhas de TLS, respostas inválidas e erros de persistência não são repetidos. O retry ocorre exclusivamente antes da validação Zod e da transação de persistência. Assim, uma segunda tentativa bem-sucedida continua vinculada à mesma `AIAnalysis`, sem duplicar requisitos, User Story ou critérios de aceitação.

## Observabilidade segura

O servidor registra a observabilidade da integração em linhas escalares iniciadas por `[AI_OBSERVABILITY]`, evitando que o log de desenvolvimento do Next reduza metadados a `{}`. Para cada chamada Gemini, o log inclui operação, modelo, timeout configurado, duração, número da tentativa, indicação de retry, indicação de retorno de `generateContent`, indicação de timeout, status HTTP quando existente, nomes/códigos do erro e de sua causa e uma categoria técnica sanitizada.

O serviço também mede as etapas de precondições, recuperação da resposta de elicitação, persistência inicial/final de `AIAnalysis`, chamada ao provider, validação Zod, alocação de códigos, requisitos, User Story, critérios de aceitação e vínculos entre requisitos e histórias. As métricas são emitidas somente no log do servidor; não modificam dados, schema ou migrações.

O contrato de observabilidade não aceita chave de API, cookie, segredo de sessão, prompt, resposta do modelo ou conteúdo de elicitação. A mensagem técnica é categorizada e limitada, sem reproduzir a mensagem bruta do SDK. O timeout permanece em 30.000 ms e nenhuma política de retry é configurada pela aplicação.

## Teste manual

1. Configure `DATABASE_URL`, `AUTH_SESSION_SECRET` e `AI_PROVIDER=mock` no `.env`. Não configure `GEMINI_API_KEY` para este teste.
2. Execute `npm.cmd run dev`.
3. Crie uma conta ou faça login, abra `/elicitacao` e selecione um projeto e uma sessão.
4. Informe ou preserve a resposta inicial da elicitação com pelo menos 20 caracteres. No painel **Geração de requisitos por IA**, clique em **Gerar requisitos com IA**; não há um segundo campo de descrição, pois o servidor usa a resposta versionada já persistida.
5. Verifique a User Story, os requisitos funcionais/não funcionais e os critérios retornados. A execução pode ser consultada no PostgreSQL/Prisma Studio na tabela `ai_analyses` e sua associação em `ai_analysis_sessions`.

Testes automatizados não chamam o Gemini. Eles cobrem tanto `FakeProvider` para cenários de erro quanto `MockAIProvider` pelo fluxo real de endpoint, validando sucesso, resposta inválida, timeout, configuração ausente, autenticação, validação da entrada e persistência. Um teste real depende de uma chave válida e deve ser realizado apenas manualmente com `AI_PROVIDER=gemini`.

## Como adicionar outro provider

1. Crie um provider em `src/services/ai/providers/` que implemente `AIProvider`, como `GeminiProvider` e `MockAIProvider`.
2. Converta `StructuredGenerationRequest` para o SDK desse provider, respeitando JSON Schema, timeout e erros controlados.
3. Mapeie erros externos para `AIProviderError`, sem incluir detalhes sensíveis na resposta.
4. Adicione o caso correspondente em `getAIProvider()`.
5. Crie testes com fake ou mock; não transforme os testes padrão em chamadas pagas a serviços externos.

`AIService`, prompts, rotas e componentes não devem ser reescritos para incluir SDKs ou nomes específicos de providers.

## Geração de requisitos — Fase 8

`POST /api/ai/generate-requirements` é uma operação separada da análise inicial: embora ambas usem o contexto autenticado da mesma sessão, elas possuem propósitos, prompts e contratos diferentes. A geração aceita apenas os IDs do projeto e da sessão, busca no servidor a resposta inicial persistida e usa `generate-requirements.ts`, versão `requirements-v2`, no contrato simplificado descrito em [requirements-generation.md](requirements-generation.md). O provider recebe somente strings para a User Story, requisitos e critérios; o servidor normaliza esse resultado antes de persistir e devolver o formato já consumido pela interface.

A execução bem-sucedida preserva o resultado Zod-validado em `AIAnalysis.structuredOutput` e, em uma única transação, cria uma `UserStory`, seus `AcceptanceCriterion`, os `Requirement` correspondentes e os vínculos de origem N:N com a análise e com a resposta de elicitação. Uma nova execução nunca substitui a análise ou os artefatos da execução anterior. O provider Mock identifica a operação pelos metadados genéricos da solicitação e retorna uma resposta estável; não importa o SDK Google, não lê variáveis Gemini nesse modo e não faz chamadas de rede.

## Detecção de ambiguidades — Fase 9

`POST /api/ai/detect-ambiguities` é uma operação independente, com prompt `ambiguities-v1` e resposta estruturada contendo `description`, `severity` (`low`, `medium` ou `high`) e `context`. Ela aceita somente os IDs do projeto e da sessão, recupera no servidor a resposta inicial persistida e aplica as mesmas validações de autenticação, ownership e vínculo sessão-projeto da geração de requisitos.

Cada chamada registra uma nova `AIAnalysis` do tipo `AMBIGUITY_DETECTION`, vinculada à sessão. As ambiguidades são persistidas com `generatedByAnalysisId`, severidade e status `OPEN`; o contexto individual é retido na saída estruturada da análise vinculada. Não há migration: o modelo aprovado já fornece os vínculos necessários para histórico e rastreabilidade. Consulte [ambiguity-detection.md](ambiguity-detection.md) para o contrato, persistência, comportamento dos providers e teste manual.

## Perguntas de refinamento — Fase 10

`POST /api/ai/generate-refinement-questions` recebe somente `projectId` e `sessionId`. No servidor, a operação confirma autenticação, ownership, vínculo sessão-projeto e recupera ambiguidades abertas cuja análise de origem pertence à sessão. A resposta inicial versionada e esse conjunto mínimo de ambiguidades formam a entrada do provider; a interface nunca envia ambiguidades ou uma nova descrição.

O contrato `refinement-questions-v1` retorna `questions` com `ambiguityId`, `question` e `reason`. Zod valida a estrutura e o serviço confirma que cada ID pertence às ambiguidades elegíveis. Cada execução cria uma `AIAnalysis` `QUESTION_GENERATION` e perguntas `ElicitationQuestion` com `source = AI` e `generatedByAnalysisId`. O mapeamento exato da pergunta persistida para a ambiguidade fica em `AIAnalysis.structuredOutput`, preservando a origem sem mudança no schema. As respostas reutilizam o endpoint versionado de elicitação. A operação não regenera requisitos e não é acionada automaticamente. Consulte [refinement-questions.md](refinement-questions.md) para detalhes e testes.

## Refinamento de requisitos — Fase 11

`POST /api/ai/refine-requirements` recebe somente `projectId` e `sessionId`. A operação exige uma geração anterior de requisitos e todas as respostas mais recentes das perguntas pertencentes à execução atual de refinamento. O servidor monta a entrada com a resposta inicial, perguntas e respostas versionadas e os artefatos da análise anterior; o frontend não envia conteúdo de elicitação.

O prompt `requirements-refinement-v1` usa o mesmo contrato Structured Output simplificado de requisitos e a mesma validação Zod de `generate-requirements`. O resultado cria uma nova `AIAnalysis` do tipo `REFINEMENT`, nova User Story, novos requisitos e novos critérios, sem sobrescrever registros existentes. Todo novo requisito é associado à nova análise, à resposta inicial e às respostas de refinamento usadas por `RequirementAnalysisSource` e `RequirementAnswerSource`. O `GeminiProvider`, modelo, timeout e retry não mudam. Consulte [requirements-refinement.md](requirements-refinement.md) para o fluxo completo.
