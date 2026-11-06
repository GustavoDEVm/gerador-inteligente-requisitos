# Perguntas de refinamento — Fase 10

## Objetivo

Esta fase transforma ambiguidades já detectadas em perguntas claras de esclarecimento. O fluxo é deliberadamente limitado a:

```text
Ambiguidade aberta → pergunta de refinamento → resposta versionada
```

Essa etapa não regenera artefatos por si só. Depois que as perguntas relevantes forem respondidas, o fluxo de refinamento de requisitos pode usar essas respostas para criar uma nova análise e novos artefatos, preservando a geração anterior.

## Fluxo e autorização

O usuário autenticado seleciona uma sessão e, após detectar ambiguidades, aciona explicitamente **Gerar perguntas de refinamento**. A interface envia apenas `projectId` e `sessionId` para `POST /api/ai/generate-refinement-questions`.

No servidor, `AIService` reutiliza `requireOwnedProject` e `requireOwnedSession`, confirma que a sessão pertence ao projeto e busca apenas ambiguidades com status `OPEN` cujo `AIAnalysis` de origem está associado àquela sessão. Assim, um identificador manipulado no navegador não permite usar projeto, sessão ou ambiguidade de outro usuário ou de outra sessão.

O texto das ambiguidades não vem do frontend. O servidor também recupera a resposta inicial versionada da elicitação e envia ao provider somente essa resposta e a lista mínima de ambiguidades relevantes (`id`, descrição, severidade e contexto disponível). Não é enviada toda a base do projeto.

Quando não há ambiguidades abertas elegíveis, a rota responde `201` com `questions: []`. Uma `AIAnalysis` histórica ainda é registrada como concluída com provider e model `not-invoked`, mas nenhum provider externo é chamado.

## Contrato e prompt

O prompt dedicado é `generate-refinement-questions.ts`, versão `refinement-questions-v3`. O Structured Output é validado com Zod antes de qualquer persistência:

```json
{
  "questions": [
    {
      "ambiguityId": "UUID de uma ambiguidade aberta recebida",
      "question": "Pergunta clara de esclarecimento",
      "reason": "Motivo breve para o esclarecimento",
      "suggestedAnswer": "Proposta contextualizada de resposta para revisão do usuário"
    }
  ]
}
```

`suggestedAnswer` é opcional para preservar a leitura de análises históricas produzidas antes desse contrato. Quando estiver presente, deve responder diretamente à pergunta como hipótese ou proposta, e não repetir o enunciado nem ser tratada como decisão confirmada. O servidor rejeita UUIDs que não pertençam ao conjunto de ambiguidades elegíveis. Entradas repetidas para o mesmo `ambiguityId` são reduzidas a uma pergunta dentro da mesma execução. O contrato é transportado pela interface genérica `AIProvider`; `GeminiProvider` continua sendo o único componente que conhece o SDK da Google e `MockAIProvider` oferece respostas determinísticas para nenhuma, uma ou várias ambiguidades.

O timeout continua em 30 segundos. A nova operação não adiciona retry nem altera o comportamento de `generate-requirements` ou `detect-ambiguities`.

## Persistência e histórico

Cada execução cria uma `AIAnalysis` do tipo `QUESTION_GENERATION`, vinculada à sessão por `AIAnalysisSession`, com o prompt, versão, entrada mínima, provider/model efetivos, status e saída estruturada.

Cada pergunta é uma `ElicitationQuestion` existente, sem novas tabelas:

- `source = AI` distingue-a das perguntas manuais e de template;
- `generatedByAnalysisId` aponta para a análise que a gerou;
- `sessionId`, `position`, `askedAt`, conteúdo e orientação são persistidos normalmente;
- `guidance` contém o `reason` retornado pela IA.

`suggestedAnswer` não cria coluna nem resposta nova: fica no `structuredOutput` validado da análise que gerou a pergunta. Ao listar as perguntas da sessão, o backend o projeta apenas para a pergunta vinculada àquela análise. Assim, a sugestão continua disponível após reload e permanece isolada entre sessões e entre execuções históricas.

O modelo aprovado não possui uma FK direta de `ElicitationQuestion` para `Ambiguity`. Por isso, o resultado estruturado da `AIAnalysis` de geração conserva o mapeamento exato `questionId → ambiguityId`, junto à descrição, severidade e contexto da ambiguidade. A pergunta já possui o vínculo direto com a análise; a saída histórica dessa análise preserva o vínculo de origem sem migration, tabela paralela ou correspondência textual frágil.

Nenhuma execução apaga perguntas, ambiguidades ou análises anteriores. Uma nova execução cria uma nova análise e novas perguntas. Atividades `QUESTION_ADDED` e `ANALYSIS_COMPLETED` também são registradas.

## Respostas e interface

Na seção **Refinamento inteligente**, cada card mostra a ambiguidade de origem, severidade, pergunta, motivo e um campo de resposta. Quando houver sugestão, o campo a apresenta com o aviso de que se trata de conteúdo proposto pela IA. O botão usa o endpoint existente `POST /api/questions/:id/answers`.

`appendAnswer` cria uma nova `ElicitationAnswer` com a próxima versão para a pergunta; não atualiza uma resposta anterior. A criação concorrente é serializada por lock da pergunta no PostgreSQL, preservando versões consecutivas e a atividade correspondente. A interface deixa explícito quando uma pergunta está pendente, respondida ou quando todas foram respondidas. O contador considera somente respostas persistidas: uma sugestão não é salva, não muda o status e não habilita o refinamento até que o usuário a confirme salvando uma resposta.

A prioridade do campo é: rascunho do usuário — inclusive um rascunho vazio —, resposta persistida mais recente, sugestão da IA e campo vazio. Portanto, o usuário pode editar ou apagar a sugestão sem perder o controle da resposta. Perguntas de origem `AI` permanecem separadas da sequência linear da coleta inicial e não alteram o progresso da sessão.

Não há chamada automática ao abrir a tela, nem uma segunda textarea para descrever o sistema.

## Testes

`tests/api/refinement-questions.test.ts` cobre contrato Zod, MockAIProvider, autenticação, ownership, projeto e sessão inválidos, sessão de outro projeto, ausência/uma/múltiplas ambiguidades, vínculo de origem, deduplicação por execução, histórico de novas execuções, persistência de `AIAnalysis` e perguntas, sugestões de resposta, resposta inválida, timeout do provider e respostas versionadas. `tests/components/refinement-suggested-answers.test.ts` cobre a apresentação, edição, remoção do rascunho e o salvamento explícito da sugestão. Todos usam MockAIProvider ou providers falsos, sem chamada ao Gemini.
