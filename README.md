# Gerador Inteligente de Requisitos

Aplicação web desenvolvida como Trabalho de Conclusão de Curso (TCC) em Ciência da Computação. Seu objetivo é apoiar a elicitação, organização, análise e refinamento de requisitos de software a partir de uma descrição em linguagem natural.

## Problema

A identificação inicial de requisitos costuma ser informal, incompleta e sujeita a ambiguidades. O sistema buscará apoiar esse processo, transformando uma ideia de software em artefatos estruturados que possam ser revisados e refinados pelo usuário.

## Funcionalidades planejadas

- Criar e gerenciar projetos.
- Descrever uma ideia de software em linguagem natural.
- Gerar User Stories, requisitos funcionais e não funcionais, critérios de aceitação, ambiguidades, perguntas e sugestões.
- Responder perguntas de refinamento e solicitar nova análise.
- Editar, salvar e exportar os resultados futuramente em PDF, DOCX e formato de backlog.

As Fases 1 a 4 entregaram a fundação, a interface, o modelo de domínio e a persistência PostgreSQL/Prisma. A Fase 5 conectou os principais fluxos à API local. A Fase 6 adicionou cadastro, login, logout, sessão e autorização por proprietário. As Fases 7 e 7.1 entregaram a infraestrutura multi-provider e o provider determinístico `mock`. As Fases 8 a 11 implementaram geração estruturada de requisitos, detecção de ambiguidades, perguntas de refinamento com respostas versionadas e reprocessamento em uma nova versão rastreável de requisitos. Edição e exportação continuam planejadas para fases posteriores.

## Arquitetura proposta

Inicialmente, o projeto será um monólito modular:

```text
Interface (Next.js / React)
        ↓
Rotas de API do Next.js
        ↓
Serviços de domínio e de IA
        ↓
Infraestrutura (Prisma / PostgreSQL / LLM)
```

A integração com modelos de linguagem ocorre exclusivamente no servidor. A camada `src/services/ai` separa prompts, contrato genérico de provider, factory, providers Gemini/Mock, validação Zod e orquestração. Nenhuma chave de API é exposta ao navegador.

## Tecnologias

- Next.js com App Router
- React
- TypeScript
- Tailwind CSS
- ESLint
- PostgreSQL
- Prisma ORM 7.10.0
- Zod 4.5.4 para validar contratos HTTP
- Jose para sessões criptografadas em cookie
- Google GenAI SDK (`@google/genai`) para o provider Gemini inicial

## Estrutura planejada

```text
src/
  app/          # Rotas, layouts, páginas e Route Handlers em app/api
  components/   # Componentes de interface reutilizáveis
  services/     # Casos de uso e integração de IA em services/ai
  lib/          # Clientes, utilitários e infraestrutura
  types/        # Tipos e contratos compartilhados
docs/           # Decisões e documentação acadêmica/técnica
  tests/          # Testes de contrato HTTP e persistência por fase
public/         # Recursos estáticos
prisma/         # Schema e migrações, a partir da Fase 4
generated/      # Prisma Client gerado localmente; não versionado
```

## Interface atual

As rotas abaixo estão disponíveis:

- `/`, `/configuracoes` — interface visual com dados de apresentação/mocks nesta etapa.
- `/projetos`, `/projetos/novo` e `/projetos/[id]` — projetos persistidos por meio da API local.
- `/login` e `/cadastro` — autenticação por e-mail e senha.
- `/elicitacao` — inicia uma sessão com título e descrição inicial persistidos como contexto, pergunta-template e resposta versionada; depois disponibiliza a geração protegida de requisitos por IA para o projeto e a sessão selecionados.
- `/requisitos` e `/user-stories` — leitura dos artefatos persistidos e de seus relacionamentos.

## API local

As Route Handlers ficam em `src/app/api`, as regras/transações em `src/services` e o cliente PostgreSQL/Prisma em `src/lib/prisma.ts`. A API valida todo corpo JSON com Zod e responde com `{ "data": ... }` ou `{ "error": { "code", "message" } }`. Não há rota de edição de respostas: cada novo envio cria uma versão posterior.

Os grupos de recursos incluem autenticação, projetos, stakeholders, sessões, perguntas, respostas, requisitos, User Stories, critérios de aceitação, ambiguidades, sugestões, atividades, análise inicial de IA em `POST /api/ai/analyze`, geração de requisitos em `POST /api/ai/generate-requirements` e refinamento em `POST /api/ai/refine-requirements`. As rotas de domínio exigem sessão válida e verificam se o projeto pertence ao usuário autenticado. A documentação detalhada está em [docs/architecture.md](docs/architecture.md), [docs/ai-integration.md](docs/ai-integration.md), [docs/requirements-generation.md](docs/requirements-generation.md) e [docs/requirements-refinement.md](docs/requirements-refinement.md).

## Autenticação

O cadastro armazena a senha exclusivamente como hash `scrypt`, com salt aleatório. Login e cadastro emitem uma sessão JWE criptografada com `jose`; o navegador recebe somente um cookie `HttpOnly`, `SameSite=Lax`, com duração de sete dias e flag `Secure` em produção. Nenhum token é armazenado em `localStorage` ou retornado pela API.

Defina `AUTH_SESSION_SECRET` no `.env` local antes de iniciar a aplicação. Gere uma chave base64url de 32 bytes localmente:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Copie somente o resultado para `AUTH_SESSION_SECRET` no `.env`. Não versione esse valor. Os usuários históricos do seed não possuem senha configurada e, por isso, não podem fazer login; crie uma conta pela tela de cadastro para utilizar o ambiente.

## Integração com IA

A análise inicial da Fase 7 continua disponível em `POST /api/ai/analyze`. A geração em `POST /api/ai/generate-requirements` transforma a resposta inicial persistida da sessão em User Story, requisitos funcionais, requisitos não funcionais e critérios de aceitação. Ambas as rotas são autenticadas, exigem `projectId` e `sessionId` pertencentes ao usuário, validam a entrada e registram uma `AIAnalysis` independente por execução.

Para desenvolvimento e testes sem custo, o modo recomendado é:

```env
AI_PROVIDER=mock
```

Nesse modo, `GEMINI_API_KEY` e `GEMINI_MODEL` não são lidos, nenhuma chamada externa é feita e o resultado estruturado é determinístico. Para usar a IA real, altere somente o provider e configure as variáveis Gemini no `.env` local:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=sua_chave_do_google_ai_studio
GEMINI_MODEL=gemini-3.8-flash
```

Não use prefixo `NEXT_PUBLIC_` e não versione a chave. O modelo é configurável porque a disponibilidade depende da conta e do provedor; consulte a documentação do Gemini antes de alterar esse valor. Não existe fallback automático: `AI_PROVIDER=gemini` retorna erro controlado se o Gemini falhar ou estiver incompleto; `AI_PROVIDER=mock` usa exclusivamente o provider simulado.

Para um teste manual, entre na aplicação, abra o projeto e clique em **Iniciar elicitação**. Informe o título opcional e a descrição inicial com pelo menos 20 caracteres; essa ação não chama IA. Após a sessão ser criada, use **Gerar requisitos com IA** no painel lateral. Não há uma segunda descrição nesse painel: o servidor usa a resposta versionada da pergunta inicial. Com `AI_PROVIDER=mock`, o fluxo funciona sem chave Gemini. Consulte [docs/requirements-generation.md](docs/requirements-generation.md) para o contrato, a persistência e o roteiro de validação; [docs/ai-integration.md](docs/ai-integration.md) documenta a infraestrutura multi-provider.

## Banco de dados

O modelo relacional está definido em [docs/data-model.md](docs/data-model.md) e implementado em `prisma/schema.prisma`. A migration `20260908002456_init_domain_model` cria as tabelas do domínio e o seed fornece dados fictícios `example.test`. A conexão fica exclusivamente em `.env`; `.env.example` contém apenas placeholders.

## Como executar

Pré-requisito: Node.js 20.9 ou superior. Instale as dependências do projeto e inicie o servidor de desenvolvimento:

```bash
npm install
npm run dev
```

Depois, abra `http://localhost:3000`.

Os scripts `npm run dev` e `npm run start` iniciam o Node com `--use-system-ca`. Essa configuração usa as autoridades certificadoras confiáveis do sistema operacional para conexões externas, inclusive Gemini, sem desativar a validação TLS nem alterar `strict-ssl` do npm.

### Configurar PostgreSQL e Prisma

Pré-requisito: uma instância PostgreSQL acessível e um banco vazio, por exemplo `gerador_requisitos`. Não é necessário nem recomendado versionar a conexão.

Crie o arquivo de ambiente local a partir do exemplo e informe as credenciais do seu PostgreSQL:

```bash
cp .env.example .env
```

No PowerShell, use `Copy-Item .env.example .env`.

Além de `DATABASE_URL`, configure `AUTH_SESSION_SECRET` conforme a seção de autenticação antes de usar cadastro ou login. Para testar a IA sem serviço externo, use `AI_PROVIDER=mock`. Para Gemini real, configure `AI_PROVIDER=gemini`, `GEMINI_API_KEY` e `GEMINI_MODEL` conforme a seção de integração com IA.

Em seguida, valide e gere o Prisma Client:

```bash
npm run db:validate
npm run db:generate
```

Com o PostgreSQL em execução e `DATABASE_URL` válida, crie e aplique a migration inicial e carregue os dados fictícios de desenvolvimento:

```bash
npm run db:migrate
npm run db:seed
```

Para inspecionar os dados localmente, use `npm run db:studio`.

O seed é idempotente e usa somente usuários e dados fictícios `example.test`; ele não integra IA ou autenticação. A migration já está versionada; novas migrations só devem ser criadas após aprovação de mudanças de modelo.

### Comandos de qualidade

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

## Fases

O desenvolvimento será incremental: configuração, interface, navegação, banco de dados, API, autenticação, projetos e análises, IA, refinamento, edição, exportação, testes, correções e documentação. Não serão antecipadas funcionalidades de fases posteriores sem uma decisão explícita.
