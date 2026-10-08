# Regras permanentes do projeto

## Objetivo

O **Gerador Inteligente de Requisitos** é o produto de um TCC em Ciência da Computação. A aplicação web apoia a elicitação, organização, análise e refinamento de requisitos de software a partir de descrições em linguagem natural.

## Arquitetura e tecnologias

- Manter a aplicação como um monólito modular com Next.js, React e TypeScript.
- Usar o App Router do Next.js. As futuras rotas HTTP devem ficar em `src/app/api`.
- Separar apresentação (`src/app`, `src/components`), regras de negócio (`src/services`), infraestrutura e utilitários (`src/lib`) e contratos compartilhados (`src/types`).
- PostgreSQL e Prisma serão introduzidos somente na fase de banco de dados, após aprovação do modelo.
- Integrações com LLM pertencem exclusivamente a `src/services/ai` e devem ser independentes do fornecedor.

## Segurança

- Nunca inserir API keys, senhas, tokens ou dados pessoais no código, no Git ou no frontend.
- Usar variáveis de ambiente no servidor; manter somente chaves fictícias em `.env.example`.
- Manter `.env`, `.env.local` e demais arquivos de ambiente reais ignorados pelo Git.
- Validar toda entrada externa no backend e validar a estrutura retornada por modelos de IA antes de usá-la.
- Quando autenticação for implementada, armazenar senhas somente com hash forte. Nunca armazenar chaves de provedores de IA no banco.

## Regras de desenvolvimento

- Antes de implementar uma tarefa, analisar o estado atual e informar arquivos a criar/modificar, dependências e estratégia de validação.
- Não recriar arquivos, duplicar funcionalidades ou alterar comportamento funcional sem necessidade.
- Nunca destruir funcionalidades existentes sem autorização explícita do usuário.
- Nunca substituir a arquitetura do projeto inteiro sem autorização explícita do usuário.
- Explicar e aguardar aprovação antes de decisões que alterem significativamente arquitetura, tecnologias, banco de dados ou funcionamento.
- Manter mudanças pequenas, coesas e alinhadas à fase atual do desenvolvimento.
- Usar TypeScript estrito e nomes claros. Evitar dependências sem necessidade justificada.

## Banco de dados

- Modelar e revisar relacionamentos, enums, índices, restrições e regras de exclusão antes de criar migrações.
- Preservar rastreabilidade entre projeto, análise e artefatos gerados.
- Não criar tabelas ou migrações fora da fase de banco de dados sem aprovação.

## Inteligência artificial

- A chave do provedor só pode ser lida no servidor.
- Manter prompts por finalidade, clientes de provedores, schemas de resposta e orquestração separados.
- Exigir respostas estruturadas e validá-las com schemas antes de persistir ou apresentar dados.
- Tratar timeout, falha do provedor e resposta inválida de forma explícita e sem expor detalhes sensíveis.

## Testes e qualidade

- Adicionar testes junto às funcionalidades nas fases apropriadas.
- Cobrir entradas válidas, vazias, incompletas e ambíguas, além de erros, timeout e respostas inválidas da IA quando esses fluxos existirem.
- Executar lint, testes e build relevantes antes de concluir uma alteração, quando o ambiente permitir.

## Documentação

- Atualizar README e documentos em `docs/` sempre que uma decisão ou comportamento relevante for introduzido.
- Registrar decisões tecnológicas de modo compreensível e justificável para o TCC.
- Não declarar como implementada uma funcionalidade apenas planejada.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
