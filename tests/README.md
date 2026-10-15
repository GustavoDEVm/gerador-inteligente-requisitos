# Testes automatizados

Os testes ficam em `tests/api` e são executados pelo script definido no `package.json`:

```bash
npm run test
```

O comando executa `tsx --test tests/api/*.test.ts`.

## Pré-requisitos

Antes de executar os testes, é necessário:

1. Instalar as dependências com `npm install`.
2. Criar `.env` a partir de `.env.example`.
3. Configurar `DATABASE_URL` para um PostgreSQL acessível.
4. Gerar o Prisma Client com `npm run db:generate`.
5. Aplicar as migrations versionadas com:

   ```bash
   npx prisma migrate deploy
   ```

Não é necessário executar o seed para rodar os testes. O seed pode ser usado separadamente para demonstrar a aplicação com dados fictícios.

## Banco de dados usado nos testes

Os testes de API e persistência dependem do banco configurado em `DATABASE_URL`. Eles criam identificadores temporários e removem explicitamente apenas os dados criados pelo próprio teste. Eles não executam migration, seed ou reset do banco e não removem dados fora de seu escopo.

Como precaução, use um banco local de desenvolvimento ou de testes, e não um banco compartilhado de produção.

## IA durante os testes

Os testes automatizados usam providers falsos ou o `MockAIProvider`. Nenhuma chamada real é enviada ao Gemini, nenhuma chave Gemini é necessária e nenhuma quota externa é consumida.

Para demonstração manual sem rede, mantenha no `.env` local:

```env
AI_PROVIDER=mock
```

## Áreas cobertas

- Persistência e contratos de API para usuários, projetos, stakeholders, sessões, perguntas, respostas, requisitos, User Stories, critérios, ambiguidades e sugestões.
- Cadastro, login, logout, sessão e autorização por proprietário.
- Início de sessão de elicitação e versionamento de respostas.
- Geração de requisitos, detecção de ambiguidades, perguntas de refinamento e refinamento dos requisitos com provider simulado.
- Reidratação de análises persistidas e prevenção de duplicação de operações equivalentes de IA.
- Revisões imutáveis de requisitos, User Stories e critérios de aceitação, incluindo arquivamento lógico de critérios e operações concorrentes.

## Validações disponíveis

Execute os comandos abaixo na raiz do projeto:

```bash
npm run db:validate
npx tsc --noEmit
npm run lint
npm run test
npm run build
```

`npm run db:validate` valida o schema Prisma; `npx tsc --noEmit` verifica os tipos; `npm run lint` executa o ESLint; `npm run test` executa os testes automatizados; e `npm run build` produz o build de produção do Next.js.
