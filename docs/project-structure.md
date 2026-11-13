# Estrutura do Projeto

O Gerador Inteligente de Requisitos foi organizado para separar responsabilidades de interface, regras de negócio, Inteligência Artificial, persistência de dados, testes e documentação. A aplicação é um monólito modular em Next.js: as partes são executadas no mesmo projeto, mas cada pasta possui uma responsabilidade definida.

Esta organização facilita a apresentação do TCC porque permite localizar rapidamente onde cada decisão foi implementada, sem misturar a interface com regras de negócio, acesso a dados ou chamadas a modelos de linguagem.

## Visão Geral

```text
TCC-APP-REQUISITOS/
│
├── src/                         # Código-fonte principal da aplicação
│   ├── app/                     # Páginas, layouts e Route Handlers da API
│   ├── components/              # Componentes de interface reutilizáveis
│   ├── lib/                     # Infraestrutura, autenticação e utilitários
│   ├── services/                # Regras de negócio e casos de uso
│   │   └── ai/                  # Integração desacoplada com provedores de IA
│   ├── types/                   # Tipos e contratos compartilhados
│   └── proxy.ts                 # Redirecionamento otimista de páginas protegidas
│
├── prisma/                      # Modelagem, migrations e seed do PostgreSQL
│   ├── migrations/              # Histórico versionado da estrutura do banco
│   ├── schema.prisma            # Modelo relacional Prisma
│   └── seed.ts                  # Dados fictícios opcionais de desenvolvimento
│
├── tests/                       # Testes automatizados
│   ├── api/                     # API, autorização, persistência e transações
│   ├── components/              # Componentes React com JSDOM
│   ├── helpers/                 # Infraestrutura compartilhada de testes
│   └── README.md                # Instruções específicas dos testes
│
├── docs/                        # Documentação técnica e acadêmica
├── public/                      # Arquivos estáticos públicos (atualmente, .gitkeep)
├── generated/                   # Prisma Client gerado localmente
├── node_modules/                # Dependências instaladas pelo npm
├── .next/                       # Artefatos gerados pelo Next.js
│
├── package.json                 # Dependências e scripts do projeto
├── package-lock.json            # Versões resolvidas pelo npm
├── prisma.config.ts             # Configuração do Prisma e do seed
├── next.config.ts               # Configuração do Next.js
├── tsconfig.json                # Configuração do TypeScript
├── eslint.config.mjs            # Configuração do ESLint
├── postcss.config.mjs           # Configuração do PostCSS/Tailwind CSS
├── .env.example                 # Modelo seguro de variáveis de ambiente
├── .gitignore                   # Arquivos locais e gerados fora do Git
├── AGENTS.md                    # Regras permanentes de desenvolvimento
└── README.md                    # Documentação principal do projeto
```

## Código Principal: `src/`

`src/` concentra o código escrito para a aplicação. A separação interna evita que componentes de tela consultem diretamente o banco ou conheçam detalhes de provedores de IA.

### Páginas, layouts e API: `src/app/`

O projeto usa o **App Router** do Next.js. Nesta pasta estão as rotas visuais e as rotas HTTP da aplicação.

- `layout.tsx` define o layout raiz.
- `globals.css` contém os estilos globais.
- `page.tsx` representa o dashboard inicial.
- As pastas `cadastro`, `login`, `projetos`, `elicitacao`, `requisitos`, `user-stories` e `configuracoes` representam as páginas da interface.
- `api/` contém os Route Handlers executados no servidor.

Os principais grupos de API existentes são:

| Grupo | Responsabilidade |
| --- | --- |
| `api/auth` | Cadastro, login, logout e consulta da sessão autenticada. |
| `api/projects` | Projetos, stakeholders, sessões, atividades, requisitos, User Stories, ambiguidades, sugestões e arquivamento. |
| `api/sessions` e `api/questions` | Sessões de elicitação, perguntas e respostas versionadas. |
| `api/ai` | Análise de descrição, geração de requisitos, detecção de ambiguidades, perguntas de refinamento e refinamento de requisitos. |
| `api/requirements`, `api/user-stories`, `api/acceptance-criteria` | Manutenção dos artefatos de requisitos. |
| `api/ambiguities` e `api/suggestions` | Revisão de ambiguidades e sugestões persistidas. |

Os Route Handlers validam a entrada e delegam as regras de negócio para `src/services`. Eles não concentram a lógica de persistência ou de IA.

### Interface: `src/components/`

`src/components/` reúne a interface reutilizável e os componentes específicos de cada área do sistema.

| Pasta | Papel na interface |
| --- | --- |
| `ai/` | Painel de análises, resultados de ambiguidades, requisitos gerados e perguntas de refinamento. |
| `auth/` | Formulários de cadastro e login. |
| `dashboard/` | Conteúdo do dashboard baseado em dados persistidos. |
| `elicitation/` | Sessões, respostas, seleção de sessão e diálogo de exclusão. |
| `layout/` | Estrutura visual comum, cabeçalho, barra lateral e título de páginas. |
| `projects/` | Criação, detalhes, listagem e exclusão de projetos. |
| `requirements/` | Área de organização de requisitos. |
| `user-stories/` | Área de organização de User Stories. |
| `ui/` | Elementos visuais genéricos, como botões, cartões, campos, diálogos e tabelas. |

Os componentes chamam a API local por meio de `src/lib/api-client.ts`; eles não acessam o PostgreSQL nem recebem chaves de provedores de IA.

### Regras de negócio: `src/services/`

`src/services/` contém os casos de uso e as regras que precisam ser aplicadas independentemente da tela que iniciou a operação.

| Arquivo ou área | Responsabilidade real |
| --- | --- |
| `auth.ts` | Cadastro, login, logout e recuperação do usuário autenticado. |
| `projects.ts` | Projetos, stakeholders, arquivamento e autorização por proprietário. |
| `elicitation.ts` | Sessões, perguntas, respostas versionadas e carregamento da coleta. |
| `requirements.ts` | Requisitos, revisões e rastreabilidade. |
| `user-stories.ts` | User Stories, critérios de aceitação, revisões e vínculos com requisitos. |
| `review-artifacts.ts` | Ambiguidades e sugestões persistidas. |
| `deletion.ts` | Exclusão transacional de projetos e sessões. |
| `shared.ts` | Verificações centralizadas de propriedade, logs de atividade e utilitários de ordenação. |
| `users.ts` | Consultas e criação administrativa de usuários. |

Essa camada usa o Prisma e concentra verificações de integridade, transações e autorização. Por exemplo, a propriedade do projeto é confirmada no servidor antes de alterar requisitos, respostas ou sessões.

### Integração com Inteligência Artificial: `src/services/ai/`

`src/services/ai/` é uma camada independente de fornecedor. Ela organiza a integração de IA sem espalhar chamadas ao SDK do Gemini pelo restante do sistema.

| Arquivo ou pasta | Responsabilidade real |
| --- | --- |
| `ai-service.ts` | Orquestra pré-condições, persistência de `AIAnalysis`, chamada ao provider, validação e rastreabilidade dos resultados. |
| `provider.ts` e `types.ts` | Contrato genérico usado por qualquer provider de IA. |
| `config.ts` e `index.ts` | Leitura da configuração do servidor e seleção do provider. |
| `providers/gemini.ts` | Comunicação com o SDK `@google/genai`, timeout, diagnóstico seguro e política limitada de retry. |
| `providers/mock.ts` | Provider determinístico, sem rede e sem API key, usado em desenvolvimento e testes. |
| `prompts/` | Prompts separados para análise, requisitos, ambiguidades, perguntas e refinamento. |
| `schemas.ts` | Schemas Zod das respostas estruturadas esperadas da IA. |
| `errors.ts` e `observability.ts` | Erros controlados e logs técnicos seguros das operações. |

As chaves de IA são lidas apenas por variáveis de ambiente no servidor. A interface conhece resultados validados, mas não conhece a chave Gemini nem acessa o SDK diretamente.

### Infraestrutura e utilitários: `src/lib/`

`src/lib/` contém código de apoio reutilizado pelas outras camadas:

- `prisma.ts`: instancia o Prisma Client para acesso ao PostgreSQL.
- `api/`: respostas HTTP, parsing de body, erros e schemas Zod das rotas.
- `auth/`: hash `scrypt`, criptografia/decodificação da sessão JWE e opções do cookie.
- `api-client.ts`: cliente HTTP utilizado pela interface para consumir a API local.
- `presentation.ts` e `utils.ts`: formatação e utilitários de apresentação.
- `mock-data.ts`: dados de apoio que permanecem no código, sem representar indicadores reais do dashboard.

### Tipos compartilhados: `src/types/`

`src/types/` define contratos TypeScript compartilhados. Os arquivos `ai.ts`, `api.ts` e `domain.ts` descrevem, respectivamente, os dados de IA, contratos de API e conceitos do domínio.

### Proteção de navegação: `src/proxy.ts`

`src/proxy.ts` faz redirecionamentos otimistas de páginas: visitantes sem cookie de sessão são direcionados para login, e usuários com cookie são redirecionados para fora das páginas de login e cadastro. A proteção efetiva de dados permanece nos Route Handlers e serviços do servidor.

## Persistência e Banco de Dados: `prisma/`

`prisma/` concentra a modelagem do PostgreSQL e o histórico de evolução do banco.

- `schema.prisma` define enums, modelos, chaves, índices e relacionamentos utilizados pela aplicação.
- `migrations/` contém duas migrations versionadas: `20260908002456_init_domain_model` e `20261014003323_immutable_artifact_revisions`.
- `seed.ts` insere dados fictícios opcionais para desenvolvimento. Ele usa operações idempotentes e não fornece senha para os usuários de exemplo.

O banco armazena usuários, projetos, stakeholders, sessões, perguntas, respostas, análises de IA, requisitos, User Stories, critérios de aceitação, ambiguidades, sugestões, logs e revisões. Relações de fonte preservam a rastreabilidade entre requisitos, análises e respostas de elicitação.

## Testes Automatizados: `tests/`

Os testes são separados pela natureza da validação:

- `tests/api/`: testa Route Handlers, autorização, persistência no PostgreSQL, transações, versionamento, concorrência e integração com providers falsos ou Mock.
- `tests/components/`: testa comportamentos relevantes da interface com React, Testing Library e JSDOM, incluindo sessões, sugestões, reidratação e atualização automática de ambiguidades.
- `tests/helpers/dom.ts`: instala e restaura o ambiente DOM usado pelos testes de componentes.
- `tests/README.md`: documenta pré-requisitos, banco de testes e comandos da suíte.

O script `npm run test` executa os arquivos em `tests/api` e `tests/components`. Os testes automatizados não fazem chamadas reais ao Gemini.

## Documentação: `docs/`

`docs/` reúne documentos de apoio para implementação e apresentação acadêmica:

- `architecture.md`: arquitetura modular e decisões técnicas.
- `data-model.md`: modelo de dados e relacionamentos.
- `ai-integration.md`: arquitetura de IA, providers e operações.
- `ambiguity-detection.md`: fluxo de detecção de ambiguidades.
- `requirements-generation.md`: geração estruturada de requisitos.
- `refinement-questions.md`: perguntas e sugestões de refinamento.
- `requirements-refinement.md`: refinamento de requisitos a partir das respostas coletadas.
- `project-structure.md`: este documento, voltado à explicação da organização do repositório durante a banca.

## Arquivos Gerados, Dependências e Configuração

| Item | Classificação | Observação |
| --- | --- | --- |
| `generated/prisma` | Gerado automaticamente | Prisma Client produzido por `npm run db:generate`. |
| `.next` | Gerado automaticamente | Build, cache e tipos produzidos pelo Next.js. |
| `node_modules` | Dependências locais | Pacotes instalados por `npm install`. |
| `next-env.d.ts` | Suporte do framework | Referências de tipos gerenciadas pelo Next.js. |
| `package.json` | Configuração do projeto | Dependências, versão mínima do Node.js e scripts disponíveis. |
| `package-lock.json` | Dependências | Resolução exata das dependências pelo npm. |
| `next.config.ts` | Configuração do framework | Configuração do Next.js. |
| `tsconfig.json` | Configuração de linguagem | Opções de compilação TypeScript. |
| `eslint.config.mjs` | Qualidade de código | Regras do ESLint. |
| `postcss.config.mjs` | Estilos | Integração PostCSS e Tailwind CSS. |
| `prisma.config.ts` | Configuração de persistência | Caminhos de schema, migrations, seed e URL do datasource. |
| `.env.example` | Modelo seguro de ambiente | Nomes e valores exemplificativos das variáveis necessárias. |
| `.env` e `.env.local` | Arquivos locais sensíveis | Não são versionados e não devem conter valores no código. |
| `.gitignore` | Controle de versão | Define arquivos locais, gerados e sensíveis que ficam fora do Git. |
| `AGENTS.md` | Convenções do projeto | Regras permanentes para agentes de desenvolvimento. |

## Fluxo Resumido para Apresentação

Durante a demonstração, o caminho principal pode ser explicado assim:

```text
Usuário
  → página e componente React em src/app e src/components
  → Route Handler em src/app/api
  → regra de negócio em src/services
  → Prisma/PostgreSQL e, quando solicitado, src/services/ai
  → resultado validado e persistido
  → interface atualizada
```

Essa separação permite demonstrar que a interface, as regras de negócio, a persistência e a integração com IA têm responsabilidades distintas, facilitando manutenção, testes e rastreabilidade acadêmica.
