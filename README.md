# Gerador Inteligente de Requisitos

Aplicação web desenvolvida como Trabalho de Conclusão de Curso (TCC) em Ciência da Computação.

## 1. Sobre o projeto

O **Gerador Inteligente de Requisitos** apoia a elicitação, a organização, a análise e o refinamento de requisitos de software a partir de descrições em linguagem natural.

Em projetos de software, usuários e desenvolvedores podem interpretar de formas diferentes uma necessidade descrita informalmente. Isso favorece requisitos incompletos ou ambíguos, omite regras relevantes e pode gerar retrabalho. A aplicação usa Inteligência Artificial como apoio para estruturar a informação coletada, identificar ambiguidades, propor perguntas de refinamento e gerar artefatos de requisitos que permanecem revisáveis pelo usuário.

O sistema não substitui a decisão humana: sugestões e análises da IA são apoio à discussão e à validação dos requisitos.

## 2. Principais funcionalidades

- Cadastro, login, logout e sessão autenticada por cookie `HttpOnly`.
- Autorização por proprietário para projetos e recursos relacionados.
- Criação, edição, arquivamento e exclusão confirmada de projetos.
- Cadastro de stakeholders na criação de projeto, em uma operação atômica.
- Múltiplas sessões de elicitação por projeto, com título opcional, status e histórico isolado.
- Registro de descrições e respostas de elicitação em versões imutáveis.
- Geração de User Story, requisitos funcionais e não funcionais e critérios de aceitação.
- Detecção de ambiguidades a partir da resposta inicial persistida.
- Atualização automática da detecção após 1,5 segundo sem edição da ideia inicial.
- Geração de perguntas de refinamento associadas às ambiguidades detectadas.
- Sugestões de resposta geradas por IA, editáveis e nunca salvas automaticamente.
- Refinamento de requisitos com base nas respostas efetivamente registradas pelo usuário.
- Reidratação de análises, perguntas, respostas e resultados ao reabrir uma sessão, sem executar IA no carregamento.
- Edição manual de requisitos, User Stories e critérios de aceitação com histórico imutável de revisões.
- Exclusão confirmada de sessões, preservando artefatos ainda rastreáveis por outras sessões do mesmo projeto.
- Integração com os providers `mock` e Gemini.

Exportação para PDF, DOCX e formato de backlog não faz parte da versão atual.

## 3. Arquitetura

O projeto é um monólito modular construído com Next.js:

```text
Interface (Next.js / React)
        ↓
Route Handlers do Next.js
        ↓
Serviços de domínio e de IA
        ↓
Infraestrutura (Prisma / PostgreSQL / LLM)
```

| Camada | Localização | Responsabilidade |
| --- | --- | --- |
| Apresentação | `src/app`, `src/components` | Páginas, componentes e experiência do usuário. |
| API | `src/app/api` | Route Handlers autenticados e validação de requisições. |
| Domínio | `src/services` | Regras de negócio, autorização, persistência e transações. |
| IA | `src/services/ai` | Prompts, schemas Zod, providers e orquestração das análises. |
| Infraestrutura | `src/lib`, `prisma` | Prisma, autenticação, utilitários e banco de dados. |
| Contratos | `src/types` | Tipos compartilhados entre as camadas. |

As rotas validam entradas com Zod. A autorização é executada no servidor: identificadores enviados pelo navegador não substituem a verificação de propriedade do projeto e dos artefatos associados.

## 4. Tecnologias utilizadas

Versões declaradas no `package.json`:

- Node.js `>=20.9.0`.
- Next.js `16.3.4` com App Router.
- React e React DOM `19.2.8`.
- TypeScript `6.0.3`.
- Tailwind CSS `4.3.3`.
- PostgreSQL, acessado com `pg` `8.23.0`.
- Prisma ORM e Prisma Client `7.10.0`.
- Zod `4.5.4` para validação de payloads HTTP e respostas estruturadas da IA.
- `jose` `6.2.12` para sessões JWE stateless.
- `crypto.scrypt` nativo do Node.js para hash de senhas.
- Google GenAI SDK (`@google/genai` `2.21.0`) para o provider Gemini.
- ESLint `9.39.5`.
- `node:test`, `tsx`, JSDOM e Testing Library para testes automatizados.

## 5. Inteligência Artificial e providers

As integrações de IA ficam somente no servidor, em `src/services/ai`. A chave de API nunca é enviada ao frontend. Cada operação usa prompt próprio, Structured Output, validação Zod e persistência rastreável em `AIAnalysis`.

As operações implementadas incluem geração de requisitos, detecção de ambiguidades, geração de perguntas de refinamento e refinamento de requisitos.

### Modo Mock

O `MockAIProvider` é indicado para desenvolvimento e testes: não precisa de API key, não faz chamadas de rede, retorna resultados determinísticos e permite demonstrar os fluxos sem depender de um serviço externo.

```env
AI_PROVIDER=mock
```

### Modo Gemini

O `GeminiProvider` é opcional e permite análise real de linguagem natural, interpretação contextual de domínios de software, detecção de ambiguidades e geração de conteúdo estruturado.

O provider é escolhido pela variável `AI_PROVIDER`. A configuração local validada neste projeto utiliza:

```env
AI_PROVIDER=gemini
GEMINI_MODEL=gemini-3.6-flash
```

Também é necessária uma `GEMINI_API_KEY` válida, definida somente no `.env` local. Verifique no Google AI Studio se o modelo escolhido está disponível para a sua conta. O `.env.example` mostra somente a estrutura das variáveis e não contém credenciais reais.

O timeout do Gemini é de 30 segundos. Apenas `generate-requirements` e `detect-ambiguities` podem fazer uma segunda tentativa após uma primeira resposta HTTP `503`; não há terceira tentativa nem fallback automático para `mock`.

## 6. Pré-requisitos

- [Git](https://git-scm.com/).
- Node.js `20.9.0` ou superior, com npm.
- PostgreSQL acessível localmente ou pela rede.
- Uma API key do Gemini somente se optar por `AI_PROVIDER=gemini`.

O modo `mock` permite desenvolver, demonstrar e executar a suíte automatizada sem chave Gemini e sem chamadas externas.

## 7. Execução local do zero no Windows (PowerShell)

### Passo 1 — Clonar o repositório

```powershell
git clone https://github.com/GustavoDEVm/gerador-inteligente-requisitos.git
Set-Location gerador-inteligente-requisitos
```

### Passo 2 — Instalar as dependências

```powershell
npm install
```

### Passo 3 — Criar o banco PostgreSQL

Crie um banco vazio no PostgreSQL, por exemplo `gerador_requisitos`. Isso pode ser feito pelo pgAdmin ou pelo `psql` instalado com PostgreSQL. O projeto não cria usuários nem bancos automaticamente.

Use as credenciais da sua instalação local na URL de conexão:

```text
postgresql://SEU_USUARIO:SUA_SENHA@localhost:5432/gerador_requisitos?schema=public
```

### Passo 4 — Criar o arquivo de ambiente

```powershell
Copy-Item .env.example .env
```

Edite apenas o `.env` local:

| Variável | Finalidade |
| --- | --- |
| `DATABASE_URL` | URL de conexão com PostgreSQL. |
| `AUTH_SESSION_SECRET` | Chave base64url de 32 bytes para criptografar a sessão. |
| `AI_PROVIDER` | `mock` para uso sem rede ou `gemini` para o provider real. |
| `GEMINI_API_KEY` | Chave do Gemini; necessária somente com `AI_PROVIDER=gemini`. |
| `GEMINI_MODEL` | Modelo Gemini; necessário somente com `AI_PROVIDER=gemini`. |

Gere `AUTH_SESSION_SECRET` localmente:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Copie somente o resultado para `AUTH_SESSION_SECRET`. Nunca versione `.env`, `.env.local`, senhas, strings de conexão ou chaves de API.

Para começar sem Gemini:

```env
AI_PROVIDER=mock
```

Para usar Gemini, configure somente no `.env` local:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=sua_chave_local
GEMINI_MODEL=gemini-3.6-flash
```

### Passo 5 — Validar o schema e gerar o Prisma Client

```powershell
npm run db:validate
npm run db:generate
```

O Prisma Client é gerado em `generated/prisma` e não deve ser versionado manualmente.

### Passo 6 — Aplicar as migrations existentes

Com PostgreSQL em execução e `DATABASE_URL` válida:

```powershell
npx prisma migrate deploy
```

O repositório contém as migrations:

- `20260908002456_init_domain_model`;
- `20261014003323_immutable_artifact_revisions`.

`npx prisma migrate deploy` aplica migrations já existentes. O script `npm run db:migrate` executa `prisma migrate dev --name init_domain_model` e deve ser usado somente durante uma alteração intencional do schema, pois pode criar uma nova migration.

### Passo 7 — Inserir dados fictícios de desenvolvimento (opcional)

```powershell
npm run db:seed
```

O seed é idempotente e cria apenas dados fictícios com domínio `example.test`. Os usuários inseridos pelo seed não possuem senha para login; crie uma nova conta pela interface para autenticar-se.

### Passo 8 — Iniciar a aplicação

```powershell
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

Para testar o build de produção localmente:

```powershell
npm run build
npm run start
```

Os scripts `dev` e `start` executam o Node com `--use-system-ca`, preservando a validação TLS e usando as autoridades certificadoras confiáveis do sistema.

## 8. Cadastro e primeiro acesso

1. Acesse `http://localhost:3000/cadastro`.
2. Crie uma conta com nome, e-mail e senha válida.
3. Entre em `http://localhost:3000/login`.
4. Crie ou abra um projeto em `/projetos`.

As senhas são armazenadas somente como hash `scrypt` com salt aleatório. A sessão é uma JWE em cookie `HttpOnly`, `SameSite=Lax`, válida por sete dias e marcada como `Secure` em produção. Nenhum token é armazenado em `localStorage`.

## 9. Fluxo de elicitação e refinamento

1. Crie ou selecione um projeto.
2. Em `/elicitacao`, crie uma sessão com título opcional e descrição inicial, ou selecione uma sessão existente.
3. Gere requisitos estruturados a partir da resposta inicial persistida.
4. Detecte ambiguidades manualmente ou altere a resposta inicial e aguarde a atualização automática após 1,5 segundo sem digitação.
5. Gere perguntas de refinamento para as ambiguidades atuais.
6. Revise, edite ou apague a sugestão de resposta. A sugestão só vira resposta versionada após salvamento explícito.
7. Responda às perguntas da execução atual de refinamento.
8. Execute o refinamento para criar nova análise, User Story, requisitos e critérios, preservando os artefatos anteriores.

Quando a ideia inicial é alterada, os resultados de ambiguidades e perguntas de refinamento anteriores ficam visualmente desatualizados até uma nova detecção. Se uma resposta antiga da IA chegar depois de uma edição mais recente, ela não substitui o resultado atual. Ao recarregar a página, o sistema somente reidrata dados persistidos e não inicia uma nova chamada de IA.

## 10. Persistência, histórico e integridade

O modelo está implementado em `prisma/schema.prisma` e documentado em [docs/data-model.md](docs/data-model.md). O banco registra projetos e stakeholders; sessões, perguntas e respostas; análises de IA; requisitos, User Stories e critérios; ambiguidades, sugestões, atividades, fontes e revisões imutáveis.

Cada geração ou refinamento cria uma `AIAnalysis` independente. Respostas de elicitação recebem versões consecutivas. Alterações manuais em requisitos, User Stories e critérios criam snapshots de revisão; a exclusão de critérios é um arquivamento lógico.

Projetos podem ser arquivados logicamente. A exclusão de projeto exige confirmação do nome e é executada em transação. A exclusão de sessão remove dados exclusivos dela, preservando requisitos e User Stories que ainda tenham fontes válidas em outra sessão do mesmo projeto.

## 11. Rotas e páginas principais

As Route Handlers ficam em `src/app/api` e são consumidas pela própria interface. Os grupos principais são:

- `api/auth`: cadastro, login, logout e consulta de sessão.
- `api/projects`: projetos, stakeholders, sessões, atividades, requisitos, User Stories, ambiguidades, sugestões e arquivamento.
- `api/sessions` e `api/questions`: consulta, atualização, respostas versionadas e perguntas de elicitação.
- `api/ai`: análise de descrição, geração de requisitos, detecção de ambiguidades, perguntas de refinamento e refinamento de requisitos.
- `api/requirements`, `api/user-stories`, `api/acceptance-criteria`, `api/ambiguities` e `api/suggestions`: manutenção dos artefatos do projeto.

Páginas disponíveis:

- `/`: dashboard com indicadores derivados dos dados persistidos do usuário autenticado.
- `/projetos`, `/projetos/novo` e `/projetos/[id]`: gerenciamento de projetos.
- `/elicitacao`: criação, seleção e exclusão de sessões; análises e refinamento assistidos por IA.
- `/requisitos` e `/user-stories`: organização dos artefatos persistidos.
- `/login` e `/cadastro`: autenticação.
- `/configuracoes`: informações da persistência e da camada de IA disponíveis no sistema.

## 12. Testes e validações

Os testes de API usam PostgreSQL configurado em `DATABASE_URL`; eles criam e removem somente dados temporários próprios. Use um banco local de desenvolvimento ou testes, não um banco compartilhado de produção.

Os testes automatizados usam `MockAIProvider` ou providers falsos. Nenhuma chamada real ao Gemini é feita durante `npm run test`.

Com dependências instaladas, `.env` configurado e migrations aplicadas:

```powershell
npm run db:validate
npx tsc --noEmit
npm run lint
npm run test
npm run build
npx prisma migrate status
```

Consulte [tests/README.md](tests/README.md) para detalhes sobre infraestrutura, limpeza de dados e áreas cobertas.

## 13. Estrutura de diretórios

- `src/app`: páginas, layouts e Route Handlers em `app/api`.
- `src/components`: componentes de interface.
- `src/lib`: Prisma, autenticação, cliente HTTP e utilitários.
- `src/services`: casos de uso e integração de IA em `services/ai`.
- `src/types`: tipos e contratos compartilhados.
- `prisma`: schema, migrations e seed.
- `docs`: documentação técnica e acadêmica.
- `tests/api`: testes de API, autorização e persistência.
- `tests/components`: testes de componentes com JSDOM.
- `generated`: Prisma Client gerado localmente.

## 14. Documentação complementar

- [Arquitetura](docs/architecture.md)
- [Modelo de dados](docs/data-model.md)
- [Integração com IA](docs/ai-integration.md)
- [Detecção de ambiguidades](docs/ambiguity-detection.md)
- [Geração de requisitos](docs/requirements-generation.md)
- [Perguntas de refinamento](docs/refinement-questions.md)
- [Refinamento de requisitos](docs/requirements-refinement.md)
- [Testes automatizados](tests/README.md)

## Segurança

- Não inclua credenciais, tokens, senhas ou API keys em arquivos versionados.
- Mantenha `.env` e `.env.local` apenas no ambiente local.
- Não exponha `DATABASE_URL`, `AUTH_SESSION_SECRET` ou `GEMINI_API_KEY` no frontend.
- Antes de publicar alterações, confira `git status` e o conteúdo que será incluído no commit.
