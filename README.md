# Gerador Inteligente de Requisitos

Aplicação web desenvolvida como Trabalho de Conclusão de Curso (TCC) em Ciência da Computação. O projeto apoia a elicitação, a organização, a análise e o refinamento de requisitos de software a partir de descrições em linguagem natural.

## Objetivo acadêmico

A elicitação inicial de requisitos costuma partir de informações incompletas, informais e ambíguas. A aplicação organiza esse contexto em artefatos de requisitos, identifica ambiguidades, conduz perguntas de esclarecimento e permite gerar uma nova versão refinada a partir das respostas registradas pelo usuário.

O projeto foi construído de forma incremental para tornar explícitas as decisões de arquitetura, persistência, autenticação, integração com modelos de linguagem, validação e rastreabilidade dos artefatos produzidos.

## Funcionalidades implementadas

- Cadastro, login, logout e sessão protegida por cookie `HttpOnly`.
- Autorização por proprietário para projetos e seus recursos relacionados.
- Criação, consulta, edição, arquivamento e organização de projetos.
- Sessões de elicitação com contexto inicial, perguntas e respostas versionadas.
- Geração estruturada de User Story, requisitos funcionais e não funcionais e critérios de aceitação.
- Detecção de ambiguidades e geração de perguntas de refinamento.
- Reprocessamento dos requisitos com as respostas de refinamento, preservando a geração anterior.
- Reidratação dos resultados persistidos ao abrir novamente uma sessão, sem executar IA automaticamente.
- Proteção transacional contra duplicação de operações equivalentes de IA em andamento.
- Edição manual de requisitos, User Stories e critérios de aceitação com histórico imutável de revisões. A remoção de critérios é um arquivamento lógico.
- Provider determinístico `mock` para desenvolvimento e testes sem chamadas externas, além do provider opcional Gemini.

A exportação para PDF, DOCX e backlog não faz parte da versão atual.

## Arquitetura

O sistema é um monólito modular:

```text
Interface (Next.js / React)
        ↓
Route Handlers do Next.js
        ↓
Serviços de domínio e de IA
        ↓
Infraestrutura (Prisma / PostgreSQL / LLM)
```

As páginas e Route Handlers ficam em `src/app`; a interface reutilizável, em `src/components`; as regras de negócio, em `src/services`; e utilitários e infraestrutura, em `src/lib`. A integração com IA fica exclusivamente em `src/services/ai`, onde prompts, providers, schemas Zod e orquestração são separados. Credenciais de IA nunca são enviadas ao navegador.

## Tecnologias

- Next.js 16 com App Router, React 19 e TypeScript
- Tailwind CSS e ESLint
- PostgreSQL e Prisma ORM 7
- Zod para validação de contratos HTTP e respostas estruturadas de IA
- `jose` para sessões JWE em cookie
- `crypto.scrypt` nativo do Node.js para hash de senha
- Google GenAI SDK (`@google/genai`) para o provider Gemini opcional

## Estrutura do projeto

```text
src/
  app/          # Páginas, layouts e Route Handlers em app/api
  components/   # Componentes de interface
  lib/          # Cliente Prisma, autenticação e utilitários
  services/     # Casos de uso e integração de IA em services/ai
  types/        # Tipos e contratos compartilhados
docs/           # Documentação técnica e acadêmica
prisma/         # Schema, migrations e seed
tests/          # Testes de API, persistência, IA e autenticação
public/         # Recursos estáticos
generated/      # Prisma Client gerado localmente; não versionado
```

## Pré-requisitos

- Node.js `>=20.9.0`.
- npm.
- Uma instância PostgreSQL acessível e um banco vazio para a aplicação, por exemplo `gerador_requisitos`.

## Instalação e configuração local

### 1. Instalar dependências

```bash
npm install
```

### 2. Criar e configurar o banco PostgreSQL

Crie um banco PostgreSQL vazio em sua instância local ou remota e guarde as credenciais apenas no ambiente local. O projeto não cria usuários nem bancos automaticamente.

### 3. Criar o arquivo de ambiente

Copie o exemplo versionado:

```bash
cp .env.example .env
```

No PowerShell:

```powershell
Copy-Item .env.example .env
```

Edite somente o `.env` local e configure os valores existentes no arquivo de exemplo:

- `DATABASE_URL`: conexão do PostgreSQL com o banco criado.
- `AUTH_SESSION_SECRET`: segredo local da sessão.
- `AI_PROVIDER`: mantenha `mock` para desenvolvimento sem serviço externo ou use `gemini` somente quando a configuração Gemini estiver completa.
- `GEMINI_API_KEY` e `GEMINI_MODEL`: necessários apenas quando `AI_PROVIDER=gemini`.

`AUTH_SESSION_SECRET` deve ser uma chave base64url de 32 bytes. Gere-a localmente:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Copie apenas o resultado para `AUTH_SESSION_SECRET` no `.env`. Nunca versione `.env`, `.env.local`, chaves Gemini, senhas ou strings de conexão reais.

### 4. Validar a configuração e gerar o Prisma Client

```bash
npm run db:validate
npm run db:generate
```

### 5. Aplicar as migrations versionadas

Com PostgreSQL em execução e `DATABASE_URL` válida, aplique as migrations já presentes em `prisma/migrations`:

```bash
npx prisma migrate deploy
```

Atualmente, o repositório possui as migrations `20260908002456_init_domain_model` e `20261014003323_immutable_artifact_revisions`. O comando acima aplica ambas quando ainda estiverem pendentes.

`npm run db:migrate` executa `prisma migrate dev --name init_domain_model`. Ele é destinado a uma mudança intencional de schema durante o desenvolvimento e pode criar uma nova migration; não deve ser usado apenas para reproduzir as migrations versionadas.

### 6. Carregar dados fictícios de desenvolvimento (opcional)

```bash
npm run db:seed
```

O seed é idempotente e usa somente dados fictícios com domínio `example.test`. Ele não configura uma senha de login para os usuários de exemplo; crie uma conta pela tela de cadastro para autenticar-se.

### 7. Iniciar a aplicação

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Para executar a versão de produção localmente, gere o build e use:

```bash
npm run build
npm run start
```

Os scripts `dev` e `start` iniciam o Node com `--use-system-ca`, utilizando as autoridades certificadoras confiáveis do sistema sem desativar a validação TLS.

## Cadastro e acesso

1. Acesse `/cadastro` e crie uma conta com nome, e-mail e senha válidos.
2. Entre em `/login` com a conta criada.
3. Crie ou abra um projeto em `/projetos`.

As senhas são persistidas somente como hash `scrypt` com salt aleatório. A sessão usa cookie JWE `HttpOnly`, `SameSite=Lax`, com validade de sete dias e flag `Secure` em produção. Nenhum token é exposto pela API ou armazenado em `localStorage`.

## IA: modo mock e Gemini opcional

### Demonstração sem chamadas externas

Após copiar `.env.example`, o ambiente usa:

```env
AI_PROVIDER=mock
```

Nesse modo, o `MockAIProvider` é determinístico, não usa chave de API e não realiza chamadas de rede. É o modo recomendado para demonstrações locais e testes funcionais do fluxo.

### Gemini

O Gemini é opcional. Para usá-lo, altere apenas o `.env` local:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=sua_chave_local
GEMINI_MODEL=gemini-3.8-flash
```

Não use variáveis com prefixo `NEXT_PUBLIC_` para esses valores e não publique a chave. Quando o provider Gemini falha ou está incompleto, a aplicação retorna um erro controlado; não há fallback automático para outro provider.

## Fluxo de elicitação

1. Crie ou selecione um projeto.
2. Em `/elicitacao`, inicie uma sessão e informe o título opcional e a descrição inicial.
3. Gere os requisitos estruturados a partir da resposta inicial persistida.
4. Detecte ambiguidades e gere perguntas de refinamento.
5. Responda às perguntas apresentadas para a execução relevante da sessão.
6. Execute o refinamento para gerar uma nova análise e novos artefatos, preservando os anteriores.

Ao recarregar a sessão, a aplicação recupera as análises, perguntas, respostas e resultados persistidos sem disparar uma nova chamada de IA. Requisitos, User Stories e critérios de aceitação preservam revisões imutáveis das edições manuais; respostas de elicitação também são versionadas.

## Páginas principais

- `/`: dashboard com indicadores derivados dos dados persistidos do usuário autenticado.
- `/configuracoes`: informações sobre persistência e a camada de IA já disponíveis.
- `/projetos`, `/projetos/novo` e `/projetos/[id]`: gerenciamento dos projetos do usuário.
- `/elicitacao`: sessão, geração de requisitos, ambiguidades, perguntas e refinamento.
- `/requisitos` e `/user-stories`: consulta e organização dos artefatos persistidos.
- `/login` e `/cadastro`: autenticação.

## Banco de dados e rastreabilidade

O modelo relacional está documentado em [docs/data-model.md](docs/data-model.md) e implementado em `prisma/schema.prisma`. Projetos, sessões, perguntas, respostas, análises de IA, requisitos, User Stories, critérios, ambiguidades, sugestões e atividades são persistidos no PostgreSQL.

Cada geração ou refinamento cria uma `AIAnalysis` independente. As fontes relevantes dos requisitos são associadas às respostas de elicitação e às análises que os originaram. Alterações manuais de requisitos, User Stories e critérios geram snapshots imutáveis com número de revisão, operação, autor quando disponível e data; critérios excluídos são arquivados logicamente.

## Testes e validações

Com `DATABASE_URL` configurada e migrations aplicadas, execute:

```bash
npm run db:validate
npx tsc --noEmit
npm run lint
npm run test
npm run build
```

Os testes automatizados não fazem chamadas reais ao Gemini. Consulte [tests/README.md](tests/README.md) para pré-requisitos, áreas cobertas e comportamento de limpeza dos dados temporários.

## Documentação complementar

- [Arquitetura](docs/architecture.md)
- [Modelo de dados](docs/data-model.md)
- [Integração com IA](docs/ai-integration.md)
- [Geração de requisitos](docs/requirements-generation.md)
- [Perguntas de refinamento](docs/refinement-questions.md)
- [Refinamento de requisitos](docs/requirements-refinement.md)
