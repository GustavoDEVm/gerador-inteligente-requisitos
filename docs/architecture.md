# Arquitetura inicial

## Decisão

Adotar Next.js com App Router como interface e backend inicial, organizado como monólito modular. Esta escolha reduz a complexidade de infraestrutura na fase acadêmica inicial, mas mantém fronteiras claras para uma futura separação de serviços se ela se justificar.

## Camadas

| Camada | Responsabilidade | Local futuro |
| --- | --- | --- |
| Apresentação | Páginas, layouts e componentes de UI | `src/app`, `src/components` |
| API | Receber requisições HTTP, validar contratos e mapear respostas | `src/app/api` |
| Aplicação | Orquestrar casos de uso e regras de negócio | `src/services` |
| IA | Prompts, cliente do provedor, schemas e tratamento de erros | `src/services/ai` |
| Infraestrutura | Banco, ORM, configurações e utilitários | `src/lib`, `prisma` |

## Contrato da IA

As respostas do modelo são solicitadas em JSON estruturado e validadas com Zod no backend antes do uso. A análise inicial da Fase 7 entrega resumo, User Story inicial, observações, ambiguidades e sugestões. A geração da Fase 8 entrega User Story, requisitos funcionais/não funcionais e critérios de aceitação, com persistência e rastreabilidade. Perguntas, refinamento e edição permanecem fora desta fase. A implementação concreta inicial é Gemini, isolada atrás da interface `AIProvider` para que as regras de negócio não dependam do SDK.

## Segurança

A interface chama somente as rotas do próprio sistema. Apenas o servidor acessará as variáveis de ambiente e o provedor de IA. As entradas do usuário e saídas do modelo serão validadas no limite da API.

## Implementação — Fase 6

A interface usa App Router e componentes reutilizáveis em `src/components`. As telas de Projetos, detalhe de projeto, Elicitação, Requisitos e User Stories chamam exclusivamente as Route Handlers locais, que acessam PostgreSQL por meio do Prisma. Dashboard e Configurações continuam usando dados de apresentação/mocks até suas respectivas fases.

`src/lib/prisma.ts` concentra o Prisma Client com o adaptador PostgreSQL e lê `DATABASE_URL` apenas no servidor. `src/lib/api` centraliza parsing JSON, validação Zod, envelopes HTTP e mapeamento seguro de erros. `src/services` contém as operações de domínio e transações.

### Autenticação e sessão

O sistema usa autenticação por credenciais sem um provedor externo. A senha é transformada em hash `scrypt` com salt aleatório no servidor. A sessão é um JWE com algoritmo `dir`/`A256GCM`, emitido pela biblioteca `jose` e guardado no cookie `gir_session`.

- O cookie é `HttpOnly`, `SameSite=Lax`, tem `path=/`, prioridade alta, expira em sete dias e usa `Secure` em produção.
- A chave de 32 bytes base64url é lida exclusivamente de `AUTH_SESSION_SECRET` no ambiente do servidor.
- O JWE contém somente `userId`; senha, hash, token e segredo não são retornados pelas APIs nem acessados pelo JavaScript do navegador.
- `src/services/auth.ts` expõe `getCurrentUser` e `requireCurrentUser`. `src/lib/api/auth.ts` aplica essa verificação nas rotas privadas.
- `src/proxy.ts` faz apenas o redirecionamento otimista de páginas sem cookie para `/login`; ele não substitui a verificação de sessão e autorização das APIs.

### Autorização

`requireOwnedProject` em `src/services/shared.ts` é a regra central de propriedade. As verificações derivadas para sessão, pergunta, requisito e User Story percorrem o relacionamento até o projeto e confirmam `project.ownerId === currentUser.id`. Portanto, alterar IDs em URL ou corpo de requisição não permite acessar registros de outro usuário. A autoria de projetos, sessões, respostas, requisitos, User Stories, resoluções e decisões vem da sessão, nunca do frontend.

### Rotas implementadas

| Grupo | Operações principais |
| --- | --- |
| `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/session` | cadastro, login, encerramento e consulta segura da sessão |
| `/api/users` | consulta limitada ao próprio usuário autenticado; cadastro ocorre em `/api/auth/register` |
| `/api/projects` | listar, consultar, criar, atualizar e arquivar logicamente projetos; stakeholders, sessões e atividades aninhados |
| `/api/sessions`, `/api/questions` | consultar/atualizar sessão, listar/criar perguntas e anexar/listar respostas versionadas |
| `/api/requirements` | listar/criar por projeto, consultar e atualizar requisito |
| `/api/user-stories`, `/api/acceptance-criteria` | criar/atualizar User Stories, relacionar requisitos e gerenciar critérios |
| `/api/ambiguities`, `/api/suggestions` | listar/criar por projeto e atualizar decisão/resolução |

As respostas seguem o envelope `{ "data": ... }` em sucesso e `{ "error": { "code", "message" } }` em falhas. Entradas inválidas retornam `400`, sessão ausente retorna `401`, acesso a recurso de outro proprietário retorna `403`, registros ausentes retornam `404`, conflitos de unicidade/associação retornam `409` e falhas inesperadas retornam mensagem genérica `500`. Respostas de elicitação não possuem operação de atualização: um novo `POST` cria a próxima versão.

O início guiado da coleta usa `POST /api/projects/[id]/elicitation/start`. Em uma transação autenticada e autorizada, ele cria uma sessão `ACTIVE`, registra sua descrição como `context`, insere a pergunta-template de descrição inicial e a primeira `ElicitationAnswer` imutável/versionada. Esse endpoint de caso de uso complementa, sem substituir, as rotas genéricas de sessão, perguntas e respostas.

## Implementação — Fase 7: IA multi-provider

```text
Componente de elicitação
        ↓
POST /api/ai/analyze (sessão autenticada)
        ↓
AIService (autorização, persistência e orquestração)
        ↓
AIProvider (contrato independente de fornecedor)
        ↓
GeminiProvider (@google/genai)
        ↓
Gemini API com JSON Schema
        ↓
Zod no servidor
        ↓
AIAnalysis + ActivityLog
        ↓
Resposta estruturada ao componente
```

`src/services/ai/types.ts` define `AIProvider` e uma solicitação genérica com modelo, instrução de sistema, entrada, JSON Schema, temperatura, timeout e metadados. `src/services/ai/provider.ts` seleciona o provider por `AI_PROVIDER`: `gemini` cria `GeminiProvider` e `mock` cria `MockAIProvider`. Não há fallback automático entre providers. O SDK `@google/genai` é importado somente por `providers/gemini.ts`; `providers/mock.ts` não acessa SDK, rede ou configuração Gemini. A Route Handler continua usando runtime Node.js.

O endpoint `POST /api/ai/analyze` exige `projectId`, `sessionId` e uma descrição entre 20 e 8.000 caracteres. `AIService` confirma que projeto e sessão pertencem ao usuário autenticado e que estão relacionados entre si. Cada chamada cria uma nova `AIAnalysis` em `RUNNING`, associa a sessão, preserva o prompt e sua versão, e termina como `SUCCEEDED`, `FAILED` ou `INVALID_RESPONSE`. A saída validada é guardada apenas em `structuredOutput`; a chave e detalhes brutos do provider não são persistidos. Em sucesso, uma atividade `ANALYSIS_COMPLETED` também é registrada.

Os erros controlados incluem configuração ausente (`503`), provider indisponível (`503`), limite de uso (`429`), timeout (`504`) e resposta inválida (`422`). Nenhuma mensagem enviada ao navegador contém stack trace, chave ou detalhes internos do Gemini. A documentação específica está em `docs/ai-integration.md`.

## Implementação — Fase 8: geração inteligente de requisitos

```text
Painel de elicitação
        ↓
POST /api/ai/generate-requirements (sessão autenticada)
        ↓
AIService (autorização, orquestração e transação)
        ↓
AIProvider configurado (Mock ou Gemini)
        ↓
Prompt requirements-v1 + JSON Schema + Zod
        ↓
AIAnalysis + UserStory + Requirement + AcceptanceCriterion
        ↓
Resultado estruturado apresentado no painel
```

O endpoint possui contrato e prompt próprios: recebe somente `projectId` e `sessionId` e busca a resposta inicial versionada no servidor, evitando uma segunda entrada de descrição no painel. O serviço verifica propriedade do projeto, vínculo da sessão e existência de uma resposta inicial com pelo menos 20 caracteres antes de criar uma nova `AIAnalysis`. Em sucesso, a mesma transação cria a User Story, seus critérios de aceitação, os requisitos e os vínculos N:N `RequirementUserStory`, `RequirementAnalysisSource` e `RequirementAnswerSource`.

Os códigos enviados pelo modelo são validados como `RF-001` e `RNF-001`, mas a persistência os numera novamente dentro do projeto para respeitar as restrições únicas em novas execuções. O campo `category` de um requisito não funcional é persistido no `Requirement.title`, pois o modelo relacional existente já usa esse campo para o rótulo do requisito; a categoria também permanece no `structuredOutput` da análise. Não houve alteração de schema nem migration nesta fase. Consulte `docs/requirements-generation.md` para o contrato completo.

## Implementação — Fase 11: refinamento de requisitos

`POST /api/ai/refine-requirements` reutiliza a mesma separação Route Handler → `AIService` → `AIProvider`, mas cria uma análise independente do tipo `REFINEMENT`. O serviço recupera no servidor a resposta inicial, somente as perguntas da execução de refinamento atual, suas respostas mais recentes e os artefatos da geração anterior. A saída usa o mesmo schema Zod reduzido de requisitos e é persistida como uma nova User Story, novos requisitos e novos critérios.

Os relacionamentos já existentes associam os requisitos novos tanto à análise `REFINEMENT` quanto a todas as versões de resposta usadas como fonte. Nenhum requisito ou artefato anterior é atualizado, e não há migration. A interface libera o refinamento apenas quando todas as perguntas atuais foram respondidas e apresenta o resultado como nova versão. Consulte `docs/requirements-refinement.md` para o contrato e a rastreabilidade.
