# Modelo de dados definitivo — revisão de domínio

## Escopo e decisões desta revisão

Este documento fecha a modelagem lógica para PostgreSQL e Prisma. O schema físico correspondente está em `prisma/schema.prisma`, com configuração em `prisma.config.ts` e seed em `prisma/seed.ts`. A migration `20260908002456_init_domain_model` foi aplicada ao PostgreSQL de desenvolvimento e a conexão foi validada. A proposta foi comparada com `src/types/domain.ts`, `src/lib/mock-data.ts` e as telas da Fase 2.

Os mocks confirmam que o fluxo real é `Projeto → Sessão → Perguntas/Respostas → Análise futura → Requisitos/User Stories`. Por isso, `Project`, `ElicitationSession`, `ElicitationQuestion`, `ElicitationAnswer`, `Requirement`, `UserStory` e `AcceptanceCriterion` são centrais. Os campos visuais `progress`, `requirementsCount`, `elicitationSessions`, `updatedAt` textual e `origin` textual **não devem ser persistidos como estão**: os três primeiros são derivados e os dois últimos devem ser representados por datas e relações estruturadas.

## Entidades finais

| Entidade | Necessidade e responsabilidade |
| --- | --- |
| `User` | Proprietário do projeto e autor de ações, respostas e artefatos. Contas cadastradas possuem `passwordHash`; o campo permanece opcional somente para preservar usuários históricos do seed sem senha atribuída. |
| `Project` | Agregado principal: concentra contexto, objetivo, status e todos os artefatos de elicitação. |
| `Stakeholder` | Normaliza a lista multivalorada de stakeholders que hoje é um `string[]` no mock. Não representa uma conta de acesso. |
| `ElicitationSession` | Delimita uma coleta de informações de um projeto, com contexto e ciclo de vida próprios. |
| `ElicitationQuestion` | Pergunta ordenada de uma sessão, manual, de template ou futuramente sugerida por IA. |
| `ElicitationAnswer` | Resposta imutável e versionada de uma pergunta. Mantém respostas anteriores quando o usuário a refina. |
| `AIAnalysis` | Uma execução de análise futura por IA, com entrada, prompt, resultado e estado. É um histórico de processamento, não uma conversa. |
| `AIAnalysisSession` | Associação N:N entre análise e sessões: uma análise pode consolidar várias sessões e uma sessão pode participar de várias análises. |
| `Requirement` | Requisito identificado ou criado manualmente dentro de um projeto; seu estado atual é acompanhado por revisões imutáveis. |
| `RequirementRevision` | Snapshot tipado e imutável de cada estado conhecido de um requisito. |
| `RequirementAnswerSource` | Associação N:N que preserva quais respostas de elicitação sustentam um requisito. |
| `RequirementAnalysisSource` | Associação N:N que preserva quais análises de IA geraram ou refinaram um requisito. |
| `UserStory` | História de usuário de um projeto, estruturada em ator, objetivo e benefício; seu estado atual é acompanhado por revisões imutáveis. |
| `UserStoryRevision` | Snapshot tipado e imutável de cada estado conhecido de uma User Story. |
| `RequirementUserStory` | Associação N:N entre requisitos e User Stories. Um requisito pode apoiar mais de uma história, e uma história pode reunir vários requisitos. |
| `AcceptanceCriterion` | Critério de aceitação ordenado de uma User Story, com versionamento e arquivamento lógico. |
| `AcceptanceCriterionRevision` | Snapshot tipado e imutável de cada estado conhecido de um critério, inclusive seu arquivamento. |
| `Ambiguity` | Ambiguidade identificada manualmente ou por uma análise, com severidade e resolução. Faz parte do escopo original do TCC. |
| `Suggestion` | Sugestão gerada ou registrada para um projeto, com decisão de aceite ou descarte. |
| `ActivityLog` | Registro de atividade e auditoria para o Dashboard e preservação de alterações relevantes. |

`AIMessage`/`AIInteraction` não é necessário neste momento. O caso de uso previsto é processamento estruturado em lote, e `AIAnalysis` já preserva a execução completa. Se no futuro houver uma conversa multi-turno com o modelo, uma entidade de mensagens poderá ser adicionada conscientemente nessa fase.

## Campos, cardinalidades e obrigatoriedade

Todos os identificadores são UUIDs, todos os textos de conteúdo usam `TEXT` no PostgreSQL e os registros temporais usam `DateTime` em UTC.

### User

- `id` (PK), `name`, `email` (UNIQUE), `passwordHash` (opcional), `createdAt`, `updatedAt`.
- Um usuário possui `0..N` projetos e pode ser autor de sessões, respostas, requisitos, histórias e atividades.
- O e-mail é normalizado na aplicação antes de persistir. Senhas de contas cadastradas são armazenadas somente como hash `scrypt`; chaves de API nunca pertencem a esta entidade.

### Project

- `id` (PK), `ownerId` (FK obrigatória), `name`, `description`, `objective`, `context`, `status`, `archivedAt` (opcional), `createdAt`, `updatedAt`.
- Um projeto possui `0..N` stakeholders, sessões, análises, requisitos, User Stories, ambiguidades, sugestões e atividades.
- `name`, `description`, `objective` e `context` são obrigatórios, seguindo a validação visual já apresentada na Fase 2.
- `progress`, quantidades de requisitos e de sessões são calculados por consulta; não são colunas para evitar inconsistência.

### Stakeholder

- `id` (PK), `projectId` (FK obrigatória), `name`, `role` (opcional), `createdAt`.
- Um projeto possui `0..N` stakeholders; cada stakeholder pertence a exatamente um projeto.
- `UNIQUE(projectId, name)` evita a repetição de nomes no mesmo projeto.

### ElicitationSession

- `id` (PK), `projectId` (FK obrigatória), `createdById` (FK obrigatória), `sequence`, `title` (opcional), `context`, `status`, `startedAt` (opcional), `completedAt` (opcional), `createdAt`, `updatedAt`.
- Um projeto possui `0..N` sessões; uma sessão pertence a exatamente um projeto.
- `context` registra o foco específico da sessão. O contexto geral continua no projeto.
- `UNIQUE(projectId, sequence)` preserva a ordem das sessões, mostrada hoje como “Sessão #03”.

### ElicitationQuestion

- `id` (PK), `sessionId` (FK obrigatória), `position`, `content`, `guidance` (opcional), `source`, `generatedByAnalysisId` (opcional), `askedAt` (opcional), `createdAt`.
- Uma sessão possui `0..N` perguntas; uma pergunta pertence a uma sessão.
- `UNIQUE(sessionId, position)` preserva a sequência apresentada na tela de elicitação.
- `source` identifica se a pergunta foi manual, de template ou gerada por IA. Quando a origem for IA, `generatedByAnalysisId` deve ser informado pela regra de aplicação.

### ElicitationAnswer

- `id` (PK), `questionId` (FK obrigatória), `authorId` (FK obrigatória), `version`, `content`, `createdAt`.
- Uma pergunta possui `0..N` respostas; cada resposta pertence a uma pergunta e é escrita por um usuário.
- `UNIQUE(questionId, version)` garante uma sequência de versões. O conteúdo não é sobrescrito: editar uma resposta cria a próxima versão. A resposta atual é a de maior versão.

### AIAnalysis e AIAnalysisSession

- `AIAnalysis`: `id` (PK), `projectId` (FK obrigatória), `requestedById` (FK opcional), `type`, `status`, `provider`, `model`, `promptVersion`, `promptText`, `inputSnapshot` (JSON), `responsePayload` (JSON opcional), `structuredOutput` (JSON opcional), `errorCode` (opcional), `startedAt`, `completedAt` (opcional), `createdAt`.
- `AIAnalysisSession`: `analysisId` e `sessionId` formam uma PK composta; possui também `createdAt`.
- Uma análise referencia `1..N` sessões pela associação; uma sessão pode ser usada em `0..N` análises.
- `inputSnapshot` preserva exatamente o contexto estruturado enviado. `structuredOutput` preserva a saída validada. `responsePayload` só é guardado se for necessário para auditoria técnica; nunca inclui chave de API.

### Requirement e suas fontes

- `Requirement`: `id` (PK), `projectId` (FK obrigatória), `createdById` (FK opcional), `code`, `title`, `description`, `type`, `priority`, `status`, `version`, `createdAt`, `updatedAt`, `archivedAt` (opcional).
- Um projeto possui `0..N` requisitos; cada requisito pertence a um projeto.
- `UNIQUE(projectId, code)` permite `RF-001` em projetos distintos, mas não duplicado no mesmo projeto.
- `RequirementAnswerSource`: PK composta (`requirementId`, `answerId`) e `createdAt`.
- `RequirementAnalysisSource`: PK composta (`requirementId`, `analysisId`) e `createdAt`.
- Essas associações representam corretamente a origem que hoje aparece como texto (“Sessão de elicitação #03”). Um requisito pode resultar de várias respostas e de mais de uma análise; uma resposta/análise pode fundamentar vários requisitos. Na geração inicial, o serviço cria ambos os vínculos para a versão da resposta inicial efetivamente analisada e para a `AIAnalysis` correspondente.
- `RequirementRevision`: `id` (PK), `requirementId` (FK), `revisionNumber`, `operation`, `changedById` (FK opcional), `code`, `title`, `description`, `type`, `priority`, `status`, `archivedAt` e `createdAt`.
- `UNIQUE(requirementId, revisionNumber)` garante uma única fotografia recuperável para cada versão. A versão inicial é registrada na criação; toda alteração cria o snapshot completo da nova versão na mesma transação.

### UserStory, RequirementUserStory e AcceptanceCriterion

- `UserStory`: `id` (PK), `projectId` (FK obrigatória), `createdById` (FK opcional), `generatedByAnalysisId` (FK opcional), `code`, `title`, `actor`, `objective`, `benefit`, `description` (opcional), `priority`, `status`, `version`, `createdAt`, `updatedAt`, `archivedAt` (opcional).
- `UNIQUE(projectId, code)` preserva identificadores como `US-001` dentro do projeto.
- A frase “Como [ator], quero [objetivo], para [benefício]” é derivada dos três campos e não deve ser duplicada em coluna.
- `RequirementUserStory`: PK composta (`requirementId`, `userStoryId`), `createdAt`.
- `UserStoryRevision`: `id` (PK), `userStoryId` (FK), `revisionNumber`, `operation`, `changedById` (FK opcional), `code`, `title`, `actor`, `objective`, `benefit`, `description`, `priority`, `status`, `archivedAt`, `generatedByAnalysisId` e `createdAt`.
- `AcceptanceCriterion`: `id` (PK), `userStoryId` (FK obrigatória), `position`, `description`, `version`, `archivedAt`, `createdAt`, `updatedAt`; `UNIQUE(userStoryId, position)`.
- `AcceptanceCriterionRevision`: `id` (PK), `acceptanceCriterionId` (FK), `userStoryId` (FK), `revisionNumber`, `operation`, `changedById` (FK opcional), `description`, `position`, `archivedAt` e `createdAt`; `UNIQUE(acceptanceCriterionId, revisionNumber)`.
- Uma User Story possui `0..N` critérios; um critério pertence a uma única User Story.
- A exclusão pela API de critérios é um arquivamento lógico: cria uma revisão `ARCHIVED`, mantém o registro e o remove somente das listagens normais e dos insumos de refinamento.

### Ambiguity e Suggestion

- `Ambiguity`: `id` (PK), `projectId` (FK obrigatória), `generatedByAnalysisId` (FK opcional), `description`, `severity`, `status`, `resolution` (opcional), `resolvedById` (FK opcional), `resolvedAt` (opcional), `createdAt`, `updatedAt`.
- `Suggestion`: `id` (PK), `projectId` (FK obrigatória), `generatedByAnalysisId` (FK opcional), `description`, `status`, `decidedById` (FK opcional), `decidedAt` (opcional), `createdAt`, `updatedAt`.
- Uma análise pode originar `0..N` ambiguidades e sugestões; ambos também podem ser registrados manualmente.

### ActivityLog

- `id` (PK), `projectId` (FK obrigatória), `actorId` (FK opcional), `action`, `entityType`, `entityId`, `summary`, `metadata` (JSON opcional), `createdAt`.
- Uma atividade sempre pertence a um projeto; o autor pode ser nulo para ações automatizadas do sistema ou da IA.
- `entityId` é uma referência de auditoria polimórfica, deliberadamente sem FK. A integridade do dado principal fica nas relações próprias; o log precisa sobreviver mesmo quando o item estiver arquivado.
- Em atualizações relevantes, `metadata` guarda snapshots mínimo de antes/depois, sem incluir credenciais ou dados que não sejam necessários ao histórico.
- `ActivityLog` é operacional, voltado ao Dashboard. Ele não substitui as entidades de revisão, que são a fonte canônica para recuperar uma versão completa de requisito, User Story ou critério.

## Enums

| Enum | Valores |
| --- | --- |
| `ProjectStatus` | `ACTIVE`, `IN_REVIEW`, `COMPLETED`, `ARCHIVED` |
| `SessionStatus` | `DRAFT`, `ACTIVE`, `COMPLETED`, `CANCELLED` |
| `QuestionSource` | `MANUAL`, `TEMPLATE`, `AI` |
| `RequirementType` | `FUNCTIONAL`, `NON_FUNCTIONAL` |
| `Priority` | `HIGH`, `MEDIUM`, `LOW` |
| `ReviewStatus` | `PENDING`, `IN_REVIEW`, `REVIEWED`, `REJECTED`, `OBSOLETE` |
| `AIAnalysisType` | `REQUIREMENT_EXTRACTION`, `AMBIGUITY_DETECTION`, `QUESTION_GENERATION`, `REFINEMENT`, `SUGGESTION_GENERATION` |
| `AIAnalysisStatus` | `PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`, `INVALID_RESPONSE`, `CANCELLED` |
| `AmbiguitySeverity` | `LOW`, `MEDIUM`, `HIGH` |
| `AmbiguityStatus` | `OPEN`, `RESOLVED`, `DISMISSED` |
| `SuggestionStatus` | `PENDING`, `ACCEPTED`, `DISMISSED` |
| `RevisionOperation` | `BASELINE`, `CREATED`, `UPDATED`, `ARCHIVED` |
| `ActivityAction` | `PROJECT_CREATED`, `PROJECT_UPDATED`, `PROJECT_ARCHIVED`, `SESSION_STARTED`, `SESSION_COMPLETED`, `QUESTION_ADDED`, `ANSWER_RECORDED`, `ANALYSIS_COMPLETED`, `REQUIREMENT_CREATED`, `REQUIREMENT_UPDATED`, `STORY_CREATED`, `STORY_UPDATED`, `CRITERION_CREATED`, `CRITERION_UPDATED`, `CRITERION_ARCHIVED` |
| `ActivityEntityType` | `PROJECT`, `SESSION`, `QUESTION`, `ANSWER`, `ANALYSIS`, `REQUIREMENT`, `USER_STORY`, `ACCEPTANCE_CRITERION`, `AMBIGUITY`, `SUGGESTION` |

Os rótulos exibidos na interface devem ser mapeados desses valores; por exemplo, `IN_REVIEW` é apresentado como “Em revisão”.

## Integridade, índices e exclusão

### Constraints e validações

- PK UUID em todas as entidades principais e FKs em todos os relacionamentos não polimórficos.
- `User.email` é UNIQUE; normalização e validação de formato ficam no serviço de aplicação.
- Os códigos de requisito e User Story são únicos por projeto, não globalmente.
- Ordem de sessão, pergunta e critério de aceitação é protegida pelas constraints compostas já descritas.
- `version >= 1`, `position >= 1` e texto não vazio são validados pela aplicação. A migration inicial já aplicada não inclui `CHECK` adicionais, pois Prisma não os expressa diretamente; adicioná-los exigirá uma migration deliberada em fase futura.
- A aplicação deve garantir, em transação, que uma análise tenha ao menos uma sessão associada e que um requisito gerado possua ao menos uma fonte (`RequirementAnswerSource` ou `RequirementAnalysisSource`). Requisitos manuais podem não ter fonte técnica, mas devem gerar `ActivityLog`.
- `completedAt` só é preenchido para estados finais de sessão/análise; `resolution` e `resolvedAt` só são preenchidos ao resolver uma ambiguidade.

### Índices

- `Project(ownerId, status, updatedAt)` para dashboard e lista de projetos.
- `ElicitationSession(projectId, status, createdAt)` e `UNIQUE(projectId, sequence)`.
- `ElicitationQuestion(sessionId, position)` e `ElicitationAnswer(questionId, version)`.
- `AIAnalysis(projectId, status, createdAt)` e índice inverso de `AIAnalysisSession(sessionId)`.
- `Requirement(projectId, status, priority)`, `Requirement(projectId, type)` e `UNIQUE(projectId, code)`.
- `UserStory(projectId, status, priority)` e `UNIQUE(projectId, code)`.
- Índices inversos em `RequirementAnswerSource(answerId)`, `RequirementAnalysisSource(analysisId)` e `RequirementUserStory(userStoryId)`.
- `Ambiguity(projectId, status, severity)`, `Suggestion(projectId, status)` e `ActivityLog(projectId, createdAt)`.

Busca textual por nome de projeto, requisito e história pode começar com `ILIKE` e esses índices. Caso o volume justifique, uma fase posterior pode adicionar `pg_trgm` e índices GIN; não é requisito inicial.

### Exclusão e atualização

- A exclusão normal de projetos é **arquivamento lógico** (`status = ARCHIVED`, `archivedAt`), pois o TCC precisa preservar a história da elicitação. Não há exclusão física pelo fluxo da interface.
- FKs de agregados principais usam `onDelete: Restrict`: um projeto não pode ser removido fisicamente enquanto possuir dados; sessão, pergunta, resposta, requisito, User Story, análise, ambiguidade e sugestão também não são apagados por rotina.
- `AcceptanceCriterion` é arquivado logicamente no fluxo normal. As revisões usam `onDelete: Cascade` apenas como proteção para uma remoção física administrativa, que não é exposta pela aplicação.
- FKs opcionais para usuário ou análise usam `onDelete: SetNull` quando a referência é de autoria/origem complementar. O histórico textual e o snapshot permanecem.
- IDs, códigos, sequência de sessão e versões de respostas são imutáveis. Alterações em requisito, User Story e critério incrementam a versão corrente, atualizam o estado e criam uma revisão completa na mesma transação, com bloqueio de linha para evitar números duplicados em edições concorrentes.

## Estratégia de histórico e rastreabilidade

1. Perguntas permanecem registradas com sua posição, fonte e instante em que foram feitas.
2. Respostas são append-only e versionadas; nunca se perde a resposta anterior.
3. `AIAnalysis` é imutável depois de concluída e guarda o snapshot de entrada, prompt, versão de prompt, modelo, saída e estado do processamento.
4. As tabelas `RequirementAnswerSource` e `RequirementAnalysisSource` explicitam a evidência que levou a cada requisito. Isso permite explicar um requisito sem depender de texto livre de origem.
5. `RequirementUserStory` permite navegar de uma necessidade a uma história e vice-versa, sem limitar o modelo a um único vínculo.
6. `ActivityLog` registra criação, atualização, conclusão e arquivamento como atividade operacional. Para alterações importantes, `metadata` armazena somente o contexto necessário de antes/depois.
7. `RequirementRevision`, `UserStoryRevision` e `AcceptanceCriterionRevision` são append-only. Cada linha contém o snapshot tipado completo de uma versão e pode ser recuperada sem reproduzir eventos anteriores.
8. A migration `20261014003323_immutable_artifact_revisions` criou um baseline por artefato existente com a operação `BASELINE`. O baseline representa somente o estado conhecido na implantação: versões anteriores sem snapshot não são inventadas.
9. A composição N:N de `RequirementUserStory` continua com histórico operacional no `ActivityLog`, mas este item não introduz uma tabela temporal para cada vínculo criado ou removido. A origem por `AIAnalysis` e por resposta de elicitação permanece preservada nas relações já existentes.

## Diagrama textual

```text
User 1 ── N Project
Project 1 ── N Stakeholder
Project 1 ── N ElicitationSession 1 ── N ElicitationQuestion 1 ── N ElicitationAnswer
Project 1 ── N AIAnalysis N ── N ElicitationSession        (AIAnalysisSession)
AIAnalysis 1 ── N ElicitationQuestion                     (origem opcional de pergunta por IA)

Project 1 ── N Requirement
Requirement 1 ── N RequirementRevision
Requirement N ── N ElicitationAnswer                      (RequirementAnswerSource)
Requirement N ── N AIAnalysis                             (RequirementAnalysisSource)
Requirement N ── N UserStory                              (RequirementUserStory)
Project 1 ── N UserStory 1 ── N AcceptanceCriterion
UserStory 1 ── N UserStoryRevision
AcceptanceCriterion 1 ── N AcceptanceCriterionRevision

Project 1 ── N Ambiguity       N ── 0..1 AIAnalysis
Project 1 ── N Suggestion      N ── 0..1 AIAnalysis
Project 1 ── N ActivityLog     N ── 0..1 User
```

## Implementação em `schema.prisma`

O bloco abaixo corresponde ao schema implementado em `prisma/schema.prisma`. A versão do Prisma ORM utilizada é `7.10.0`. Ele foi validado com `prisma validate` e aplicado ao PostgreSQL de desenvolvimento pelas migrations `20260908002456_init_domain_model` e `20261014003323_immutable_artifact_revisions`.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum ProjectStatus { ACTIVE IN_REVIEW COMPLETED ARCHIVED }
enum SessionStatus { DRAFT ACTIVE COMPLETED CANCELLED }
enum QuestionSource { MANUAL TEMPLATE AI }
enum RequirementType { FUNCTIONAL NON_FUNCTIONAL }
enum Priority { HIGH MEDIUM LOW }
enum ReviewStatus { PENDING IN_REVIEW REVIEWED REJECTED OBSOLETE }
enum AIAnalysisType { REQUIREMENT_EXTRACTION AMBIGUITY_DETECTION QUESTION_GENERATION REFINEMENT SUGGESTION_GENERATION }
enum AIAnalysisStatus { PENDING RUNNING SUCCEEDED FAILED INVALID_RESPONSE CANCELLED }
enum AmbiguitySeverity { LOW MEDIUM HIGH }
enum AmbiguityStatus { OPEN RESOLVED DISMISSED }
enum SuggestionStatus { PENDING ACCEPTED DISMISSED }
enum RevisionOperation { BASELINE CREATED UPDATED ARCHIVED }
enum ActivityAction { PROJECT_CREATED PROJECT_UPDATED PROJECT_ARCHIVED SESSION_STARTED SESSION_COMPLETED QUESTION_ADDED ANSWER_RECORDED ANALYSIS_COMPLETED REQUIREMENT_CREATED REQUIREMENT_UPDATED STORY_CREATED STORY_UPDATED CRITERION_CREATED CRITERION_UPDATED CRITERION_ARCHIVED }
enum ActivityEntityType { PROJECT SESSION QUESTION ANSWER ANALYSIS REQUIREMENT USER_STORY ACCEPTANCE_CRITERION AMBIGUITY SUGGESTION }

model User {
  id                  String               @id @default(uuid()) @db.Uuid
  name                String
  email               String               @unique
  passwordHash        String?              @map("password_hash")
  createdAt           DateTime             @default(now()) @map("created_at")
  updatedAt           DateTime             @updatedAt @map("updated_at")
  ownedProjects       Project[]            @relation("ProjectOwner")
  createdSessions     ElicitationSession[] @relation("SessionCreator")
  answers             ElicitationAnswer[]
  createdRequirements Requirement[]        @relation("RequirementCreator")
  createdUserStories  UserStory[]          @relation("UserStoryCreator")
  changedRequirementRevisions RequirementRevision[] @relation("RequirementRevisionAuthor")
  changedUserStoryRevisions UserStoryRevision[] @relation("UserStoryRevisionAuthor")
  changedAcceptanceCriterionRevisions AcceptanceCriterionRevision[] @relation("AcceptanceCriterionRevisionAuthor")
  requestedAnalyses   AIAnalysis[]         @relation("AnalysisRequester")
  resolvedAmbiguities Ambiguity[]          @relation("AmbiguityResolver")
  decidedSuggestions  Suggestion[]         @relation("SuggestionDecider")
  activities          ActivityLog[]        @relation("ActivityActor")
  @@map("users")
}

model Project {
  id           String               @id @default(uuid()) @db.Uuid
  ownerId      String               @map("owner_id") @db.Uuid
  name         String
  description  String               @db.Text
  objective    String               @db.Text
  context      String               @db.Text
  status       ProjectStatus        @default(ACTIVE)
  archivedAt   DateTime?            @map("archived_at")
  createdAt    DateTime             @default(now()) @map("created_at")
  updatedAt    DateTime             @updatedAt @map("updated_at")
  owner        User                 @relation("ProjectOwner", fields: [ownerId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  stakeholders Stakeholder[]
  sessions     ElicitationSession[]
  analyses     AIAnalysis[]
  requirements Requirement[]
  userStories  UserStory[]
  ambiguities  Ambiguity[]
  suggestions  Suggestion[]
  activities   ActivityLog[]
  @@index([ownerId, status, updatedAt])
  @@map("projects")
}

model Stakeholder {
  id        String   @id @default(uuid()) @db.Uuid
  projectId String   @map("project_id") @db.Uuid
  name      String
  role      String?
  createdAt DateTime @default(now()) @map("created_at")
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  @@unique([projectId, name])
  @@map("stakeholders")
}

model ElicitationSession {
  id          String                @id @default(uuid()) @db.Uuid
  projectId   String                @map("project_id") @db.Uuid
  createdById String                @map("created_by_id") @db.Uuid
  sequence    Int
  title       String?
  context     String                @db.Text
  status      SessionStatus         @default(DRAFT)
  startedAt   DateTime?             @map("started_at")
  completedAt DateTime?             @map("completed_at")
  createdAt   DateTime              @default(now()) @map("created_at")
  updatedAt   DateTime              @updatedAt @map("updated_at")
  project     Project               @relation(fields: [projectId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  createdBy   User                  @relation("SessionCreator", fields: [createdById], references: [id], onDelete: Restrict, onUpdate: Cascade)
  questions   ElicitationQuestion[]
  analyses    AIAnalysisSession[]
  @@unique([projectId, sequence])
  @@index([projectId, status, createdAt])
  @@map("elicitation_sessions")
}

model ElicitationQuestion {
  id                    String              @id @default(uuid()) @db.Uuid
  sessionId             String              @map("session_id") @db.Uuid
  position              Int
  content               String              @db.Text
  guidance              String?             @db.Text
  source                QuestionSource      @default(MANUAL)
  generatedByAnalysisId String?             @map("generated_by_analysis_id") @db.Uuid
  askedAt               DateTime?           @map("asked_at")
  createdAt             DateTime            @default(now()) @map("created_at")
  session               ElicitationSession  @relation(fields: [sessionId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  generatedByAnalysis   AIAnalysis?         @relation("GeneratedQuestions", fields: [generatedByAnalysisId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  answers               ElicitationAnswer[]
  @@unique([sessionId, position])
  @@map("elicitation_questions")
}

model ElicitationAnswer {
  id         String                    @id @default(uuid()) @db.Uuid
  questionId String                    @map("question_id") @db.Uuid
  authorId   String                    @map("author_id") @db.Uuid
  version    Int                       @default(1)
  content    String                    @db.Text
  createdAt  DateTime                  @default(now()) @map("created_at")
  question   ElicitationQuestion       @relation(fields: [questionId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  author     User                      @relation(fields: [authorId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  requirementSources RequirementAnswerSource[]
  @@unique([questionId, version])
  @@index([questionId, createdAt])
  @@map("elicitation_answers")
}

model AIAnalysis {
  id                String                    @id @default(uuid()) @db.Uuid
  projectId         String                    @map("project_id") @db.Uuid
  requestedById     String?                   @map("requested_by_id") @db.Uuid
  type              AIAnalysisType
  status            AIAnalysisStatus          @default(PENDING)
  provider          String
  model             String
  promptVersion     String                    @map("prompt_version")
  promptText        String                    @map("prompt_text") @db.Text
  inputSnapshot     Json                      @map("input_snapshot")
  responsePayload   Json?                     @map("response_payload")
  structuredOutput  Json?                     @map("structured_output")
  errorCode         String?                   @map("error_code")
  startedAt         DateTime                  @default(now()) @map("started_at")
  completedAt       DateTime?                 @map("completed_at")
  createdAt         DateTime                  @default(now()) @map("created_at")
  project           Project                   @relation(fields: [projectId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  requestedBy       User?                     @relation("AnalysisRequester", fields: [requestedById], references: [id], onDelete: SetNull, onUpdate: Cascade)
  sessions          AIAnalysisSession[]
  generatedQuestions ElicitationQuestion[]    @relation("GeneratedQuestions")
  requirementSources RequirementAnalysisSource[]
  generatedStories  UserStory[]               @relation("GeneratedUserStories")
  ambiguities       Ambiguity[]               @relation("GeneratedAmbiguities")
  suggestions       Suggestion[]              @relation("GeneratedSuggestions")
  @@index([projectId, status, createdAt])
  @@map("ai_analyses")
}

model AIAnalysisSession {
  analysisId String             @map("analysis_id") @db.Uuid
  sessionId  String             @map("session_id") @db.Uuid
  createdAt  DateTime           @default(now()) @map("created_at")
  analysis   AIAnalysis         @relation(fields: [analysisId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  session    ElicitationSession @relation(fields: [sessionId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  @@id([analysisId, sessionId])
  @@index([sessionId])
  @@map("ai_analysis_sessions")
}

model Requirement {
  id        String                    @id @default(uuid()) @db.Uuid
  projectId String                    @map("project_id") @db.Uuid
  createdById String?                 @map("created_by_id") @db.Uuid
  code      String
  title     String
  description String                  @db.Text
  type      RequirementType
  priority  Priority                  @default(MEDIUM)
  status    ReviewStatus              @default(PENDING)
  version   Int                       @default(1)
  archivedAt DateTime?                @map("archived_at")
  createdAt DateTime                  @default(now()) @map("created_at")
  updatedAt DateTime                  @updatedAt @map("updated_at")
  project   Project                   @relation(fields: [projectId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  createdBy User?                     @relation("RequirementCreator", fields: [createdById], references: [id], onDelete: SetNull, onUpdate: Cascade)
  answerSources RequirementAnswerSource[]
  analysisSources RequirementAnalysisSource[]
  userStoryLinks RequirementUserStory[]
  revisions RequirementRevision[]
  @@unique([projectId, code])
  @@index([projectId, status, priority])
  @@index([projectId, type])
  @@map("requirements")
}

model RequirementRevision {
  id             String            @id @default(uuid()) @db.Uuid
  requirementId  String            @map("requirement_id") @db.Uuid
  revisionNumber Int               @map("revision_number")
  operation      RevisionOperation
  changedById    String?           @map("changed_by_id") @db.Uuid
  code           String
  title          String
  description    String            @db.Text
  type           RequirementType
  priority       Priority
  status         ReviewStatus
  archivedAt     DateTime?         @map("archived_at")
  createdAt      DateTime          @default(now()) @map("created_at")
  requirement    Requirement       @relation(fields: [requirementId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  changedBy      User?             @relation("RequirementRevisionAuthor", fields: [changedById], references: [id], onDelete: SetNull, onUpdate: Cascade)
  @@unique([requirementId, revisionNumber])
  @@index([requirementId, createdAt])
  @@map("requirement_revisions")
}

model RequirementAnswerSource {
  requirementId String             @map("requirement_id") @db.Uuid
  answerId      String             @map("answer_id") @db.Uuid
  createdAt     DateTime           @default(now()) @map("created_at")
  requirement   Requirement        @relation(fields: [requirementId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  answer        ElicitationAnswer  @relation(fields: [answerId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  @@id([requirementId, answerId])
  @@index([answerId])
  @@map("requirement_answer_sources")
}

model RequirementAnalysisSource {
  requirementId String       @map("requirement_id") @db.Uuid
  analysisId    String       @map("analysis_id") @db.Uuid
  createdAt     DateTime     @default(now()) @map("created_at")
  requirement   Requirement  @relation(fields: [requirementId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  analysis      AIAnalysis   @relation(fields: [analysisId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  @@id([requirementId, analysisId])
  @@index([analysisId])
  @@map("requirement_analysis_sources")
}

model UserStory {
  id                    String                 @id @default(uuid()) @db.Uuid
  projectId             String                 @map("project_id") @db.Uuid
  createdById           String?                @map("created_by_id") @db.Uuid
  generatedByAnalysisId String?                @map("generated_by_analysis_id") @db.Uuid
  code                  String
  title                 String
  actor                 String
  objective             String                 @db.Text
  benefit               String                 @db.Text
  description           String?                @db.Text
  priority              Priority               @default(MEDIUM)
  status                ReviewStatus           @default(PENDING)
  version               Int                    @default(1)
  archivedAt            DateTime?              @map("archived_at")
  createdAt             DateTime               @default(now()) @map("created_at")
  updatedAt             DateTime               @updatedAt @map("updated_at")
  project               Project                @relation(fields: [projectId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  createdBy             User?                  @relation("UserStoryCreator", fields: [createdById], references: [id], onDelete: SetNull, onUpdate: Cascade)
  generatedByAnalysis   AIAnalysis?            @relation("GeneratedUserStories", fields: [generatedByAnalysisId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  requirementLinks      RequirementUserStory[]
  acceptanceCriteria    AcceptanceCriterion[]
  acceptanceCriterionRevisions AcceptanceCriterionRevision[]
  revisions             UserStoryRevision[]
  @@unique([projectId, code])
  @@index([projectId, status, priority])
  @@map("user_stories")
}

model UserStoryRevision {
  id                    String            @id @default(uuid()) @db.Uuid
  userStoryId           String            @map("user_story_id") @db.Uuid
  revisionNumber        Int               @map("revision_number")
  operation             RevisionOperation
  changedById           String?           @map("changed_by_id") @db.Uuid
  code                  String
  title                 String
  actor                 String
  objective             String            @db.Text
  benefit               String            @db.Text
  description           String?           @db.Text
  priority              Priority
  status                ReviewStatus
  archivedAt            DateTime?         @map("archived_at")
  generatedByAnalysisId String?           @map("generated_by_analysis_id") @db.Uuid
  createdAt             DateTime          @default(now()) @map("created_at")
  userStory             UserStory         @relation(fields: [userStoryId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  changedBy             User?             @relation("UserStoryRevisionAuthor", fields: [changedById], references: [id], onDelete: SetNull, onUpdate: Cascade)
  @@unique([userStoryId, revisionNumber])
  @@index([userStoryId, createdAt])
  @@map("user_story_revisions")
}

model RequirementUserStory {
  requirementId String      @map("requirement_id") @db.Uuid
  userStoryId   String      @map("user_story_id") @db.Uuid
  createdAt     DateTime    @default(now()) @map("created_at")
  requirement   Requirement @relation(fields: [requirementId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  userStory     UserStory   @relation(fields: [userStoryId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  @@id([requirementId, userStoryId])
  @@index([userStoryId])
  @@map("requirement_user_stories")
}

model AcceptanceCriterion {
  id          String    @id @default(uuid()) @db.Uuid
  userStoryId String    @map("user_story_id") @db.Uuid
  position    Int
  description String    @db.Text
  version     Int       @default(1)
  archivedAt  DateTime? @map("archived_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  userStory   UserStory @relation(fields: [userStoryId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  revisions   AcceptanceCriterionRevision[]
  @@unique([userStoryId, position])
  @@map("acceptance_criteria")
}

model AcceptanceCriterionRevision {
  id                    String              @id @default(uuid()) @db.Uuid
  acceptanceCriterionId String              @map("acceptance_criterion_id") @db.Uuid
  userStoryId           String              @map("user_story_id") @db.Uuid
  revisionNumber        Int                 @map("revision_number")
  operation             RevisionOperation
  changedById           String?             @map("changed_by_id") @db.Uuid
  description           String              @db.Text
  position              Int
  archivedAt            DateTime?           @map("archived_at")
  createdAt             DateTime            @default(now()) @map("created_at")
  acceptanceCriterion   AcceptanceCriterion @relation(fields: [acceptanceCriterionId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  userStory             UserStory           @relation(fields: [userStoryId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  changedBy             User?               @relation("AcceptanceCriterionRevisionAuthor", fields: [changedById], references: [id], onDelete: SetNull, onUpdate: Cascade)
  @@unique([acceptanceCriterionId, revisionNumber])
  @@index([acceptanceCriterionId, createdAt])
  @@index([userStoryId, createdAt])
  @@map("acceptance_criterion_revisions")
}

model Ambiguity {
  id                    String            @id @default(uuid()) @db.Uuid
  projectId             String            @map("project_id") @db.Uuid
  generatedByAnalysisId String?           @map("generated_by_analysis_id") @db.Uuid
  resolvedById          String?           @map("resolved_by_id") @db.Uuid
  description           String            @db.Text
  severity              AmbiguitySeverity @default(MEDIUM)
  status                AmbiguityStatus   @default(OPEN)
  resolution            String?           @db.Text
  resolvedAt            DateTime?         @map("resolved_at")
  createdAt             DateTime          @default(now()) @map("created_at")
  updatedAt             DateTime          @updatedAt @map("updated_at")
  project               Project           @relation(fields: [projectId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  generatedByAnalysis   AIAnalysis?       @relation("GeneratedAmbiguities", fields: [generatedByAnalysisId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  resolvedBy            User?             @relation("AmbiguityResolver", fields: [resolvedById], references: [id], onDelete: SetNull, onUpdate: Cascade)
  @@index([projectId, status, severity])
  @@map("ambiguities")
}

model Suggestion {
  id                    String           @id @default(uuid()) @db.Uuid
  projectId             String           @map("project_id") @db.Uuid
  generatedByAnalysisId String?          @map("generated_by_analysis_id") @db.Uuid
  decidedById           String?          @map("decided_by_id") @db.Uuid
  description           String           @db.Text
  status                SuggestionStatus @default(PENDING)
  decidedAt             DateTime?        @map("decided_at")
  createdAt             DateTime         @default(now()) @map("created_at")
  updatedAt             DateTime         @updatedAt @map("updated_at")
  project               Project          @relation(fields: [projectId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  generatedByAnalysis   AIAnalysis?      @relation("GeneratedSuggestions", fields: [generatedByAnalysisId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  decidedBy             User?            @relation("SuggestionDecider", fields: [decidedById], references: [id], onDelete: SetNull, onUpdate: Cascade)
  @@index([projectId, status])
  @@map("suggestions")
}

model ActivityLog {
  id         String             @id @default(uuid()) @db.Uuid
  projectId  String             @map("project_id") @db.Uuid
  actorId    String?            @map("actor_id") @db.Uuid
  action     ActivityAction
  entityType ActivityEntityType @map("entity_type")
  entityId   String             @map("entity_id") @db.Uuid
  summary    String
  metadata   Json?
  createdAt  DateTime           @default(now()) @map("created_at")
  project    Project            @relation(fields: [projectId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  actor      User?              @relation("ActivityActor", fields: [actorId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  @@index([projectId, createdAt])
  @@map("activity_logs")
}
```

## Estado da implementação e limites da etapa

- O repositório possui `prisma/schema.prisma`, `prisma.config.ts`, as migrations `20260908002456_init_domain_model` e `20261014003323_immutable_artifact_revisions`, scripts de banco no `package.json` e `prisma/seed.ts`. A URL continua exclusivamente em `.env`, que é ignorado pelo Git; `.env.example` contém somente placeholders.
- PostgreSQL está disponível no ambiente de desenvolvimento, as migrations foram aplicadas e a conexão é validada com `npm run db:validate` e `npx prisma migrate status`.
- As Fases 5 e 6 adicionaram rotas HTTP, validação de payloads, serviços de persistência, autenticação por senha com hash e autorização por proprietário. Projetos, detalhe de projeto, elicitação, requisitos e User Stories consomem a API local sob sessão autenticada.
- As Fases 7 e 8 usam `AIAnalysis` sem alterar o schema físico: cada análise cria um registro por execução, associa exatamente uma sessão, preserva `inputSnapshot`, `promptText`, `promptVersion`, provider, modelo, status e a saída Zod-validada em `structuredOutput`. A geração de requisitos da Fase 8 vincula cada `Requirement` por `RequirementAnalysisSource`, a `UserStory` por `generatedByAnalysisId`, seus critérios por `AcceptanceCriterion` e todos os requisitos à User Story por `RequirementUserStory`. Falhas controladas preservam somente `errorCode`; chaves e payloads brutos desnecessários não são armazenados.
- O início guiado da elicitação usa as entidades já previstas: cria uma `ElicitationSession` ativa, armazena a descrição em `context`, cria uma `ElicitationQuestion` de template na posição 1 e registra a mesma entrada como `ElicitationAnswer` versão 1. O contexto facilita a identificação da sessão; a resposta preserva a entrada original no histórico imutável. Não há nova tabela, campo ou migration.
- O Item 5 da Fase 12.1 introduziu revisões imutáveis para requisitos, User Stories e critérios. Criações manuais e por IA produzem a revisão `CREATED`; edições produzem `UPDATED`; a remoção de critério produz `ARCHIVED`. As revisões podem ser consultadas pelos serviços autenticados de cada artefato. Não existe tela de histórico nesta etapa.
- Migrations posteriores somente devem ser criadas após aprovação explícita de mudança no modelo. Para reproduzir o banco, configure `DATABASE_URL`, execute `npm run db:migrate` e `npm run db:seed`.
