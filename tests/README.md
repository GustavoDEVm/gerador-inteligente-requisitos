# Testes

## Fase 5 — API e persistência

`npm run test` executa testes da camada de API, persistência, autenticação e autorização.

- `route-contracts.test.ts` valida os envelopes HTTP e os códigos `200`, `400` e `404`.
- `persistence.test.ts` cobre criação e atualização de usuário, projeto, stakeholder, sessão, pergunta, respostas versionadas, requisitos, User Stories, critérios, ambiguidades e sugestões.
- `authentication.test.ts` cobre cadastro, duplicidade de e-mail, senha inválida, login, sessão, logout, criação de projeto pelo usuário autenticado e bloqueio de leitura/edição por outro proprietário.
- `ai.test.ts` cobre resposta estruturada válida e inválida, timeout simulado, configuração ausente, persistência de `AIAnalysis`, autenticação, validação do endpoint e o fluxo completo com `MockAIProvider` sem chave Gemini.
- `requirements-refinement.test.ts` cobre o reprocessamento com respostas de refinamento, nova `AIAnalysis` do tipo `REFINEMENT`, preservação dos artefatos anteriores, rastreabilidade das respostas e bloqueio por falta de autorização.

Os testes de persistência e IA criam identificadores temporários e os removem explicitamente ao final. Eles não executam migration, seed, reset ou exclusão de dados fora do escopo criado pelos próprios testes. O provider de IA é falso nos testes automatizados: nenhuma requisição é enviada ao Gemini e nenhuma quota é consumida.

Esta pasta será utilizada quando as funcionalidades começarem a ser implementadas. A estratégia e as dependências de teste serão definidas na fase correspondente, evitando incluir ferramentas sem código para exercitar.
