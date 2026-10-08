# Perguntas de refinamento — Fase 10

## Objetivo

Esta fase transforma ambiguidades já detectadas em perguntas claras de esclarecimento. O fluxo é deliberadamente limitado a:

```text
Ambiguidade aberta → pergunta de refinamento → resposta versionada
```

Ela não regenera User Stories, requisitos funcionais, requisitos não funcionais nem critérios de aceitação. Essa reanálise continuará em uma fase posterior.

## Fluxo e autorização

O usuário autenticado seleciona uma sessão e, após detectar ambiguidades, aciona explicitamente **Gerar perguntas de refinamento**. A interface envia apenas `projectId` e `sessionId` para `POST /api/ai/generate-refinement-questions`.

No servidor, `AIService` reutiliza `requireOwnedProject` e `requireOwnedSession`, confirma que a sessão pertence ao projeto e busca apenas ambiguidades com status `OPEN` cujo `AIAnalysis` de origem está associado àquela sessão. Assim, um identificador manipulado no navegador não permite usar projeto, sessão ou ambiguidade de outro usuário ou de outra sessão.

O texto das ambiguidades não vem do frontend. O servidor também recupera a resposta inicial versionada da elicitação e envia ao provider somente essa resposta e a lista mínima de ambiguidades relevantes (`id`, descrição, severidade e contexto disponível). Não é enviada toda a base do projeto.

Quando não há ambiguidades abertas elegíveis, a rota responde `201` com `questions: []`. Uma `AIAnalysis` histórica ainda é registrada como concluída com provider e model `not-invoked`, mas nenhum provider externo é chamado.

## Contrato e prompt

O prompt dedicado é `generate-refinement-questions.ts`, versão `refinement-questions-v1`. O Structured Output é validado com Zod antes de qualquer persistência:

```json
{
  "questions": [
    {
      "ambiguityId": "UUID de uma ambiguidade aberta recebida",
      "question": "Pergunta clara de esclarecimento",
      "reason": "Motivo breve para o esclarecimento"
    }
  ]
}
```

O servidor rejeita UUIDs que não pertençam ao conjunto de ambiguidades elegíveis. Entradas repetidas para o mesmo `ambiguityId` são reduzidas a uma pergunta dentro da mesma execução. O contrato é transportado pela interface genérica `AIProvider`; `GeminiProvider` continua sendo o único componente que conhece o SDK da Google e `MockAIProvider` oferece respostas determinísticas para nenhuma, uma ou várias ambiguidades.

O timeout continua em 30 segundos. A nova operação não adiciona retry nem altera o comportamento de `generate-requirements` ou `detect-ambiguities`.

## Persistência e histórico

Cada execução cria uma `AIAnalysis` do tipo `QUESTION_GENERATION`, vinculada à sessão por `AIAnalysisSession`, com o prompt, versão, entrada mínima, provider/model efetivos, status e saída estruturada.

Cada pergunta é uma `ElicitationQuestion` existente, sem novas tabelas:

- `source = AI` distingue-a das perguntas manuais e de template;
- `generatedByAnalysisId` aponta para a análise que a gerou;
- `sessionId`, `position`, `askedAt`, conteúdo e orientação são persistidos normalmente;
- `guidance` contém o `reason` retornado pela IA.

O modelo aprovado não possui uma FK direta de `ElicitationQuestion` para `Ambiguity`. Por isso, o resultado estruturado da `AIAnalysis` de geração conserva o mapeamento exato `questionId → ambiguityId`, junto à descrição, severidade e contexto da ambiguidade. A pergunta já possui o vínculo direto com a análise; a saída histórica dessa análise preserva o vínculo de origem sem migration, tabela paralela ou correspondência textual frágil.

Nenhuma execução apaga perguntas, ambiguidades ou análises anteriores. Uma nova execução cria uma nova análise e novas perguntas. Atividades `QUESTION_ADDED` e `ANALYSIS_COMPLETED` também são registradas.

## Respostas e interface

Na seção **Refinamento inteligente**, cada card mostra a ambiguidade de origem, severidade, pergunta, motivo e um campo de resposta. O botão usa o endpoint existente `POST /api/questions/:id/answers`.

`appendAnswer` cria uma nova `ElicitationAnswer` com a próxima versão para a pergunta; não atualiza uma resposta anterior. A interface deixa explícito quando uma pergunta está pendente, respondida ou quando todas foram respondidas. Perguntas de origem `AI` permanecem separadas da sequência linear da coleta inicial e não alteram o progresso da sessão.

Não há chamada automática ao abrir a tela, nem uma segunda textarea para descrever o sistema.

## Testes

`tests/api/refinement-questions.test.ts` cobre contrato Zod, MockAIProvider, autenticação, ownership, projeto e sessão inválidos, sessão de outro projeto, ausência/uma/múltiplas ambiguidades, vínculo de origem, deduplicação por execução, histórico de novas execuções, persistência de `AIAnalysis` e perguntas, resposta inválida, timeout do provider e respostas versionadas. Todos usam MockAIProvider ou providers falsos, sem chamada ao Gemini.
