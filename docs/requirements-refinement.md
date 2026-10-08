# Refinamento inteligente de requisitos — Fase 11

## Objetivo

A Fase 11 cria uma nova versão de requisitos a partir da resposta inicial da sessão, das respostas versionadas às perguntas de refinamento atuais e dos artefatos da geração anterior. Ela não altera nem remove requisitos, User Stories, critérios, perguntas, respostas ou análises históricas.

## Fluxo

```text
Resposta inicial persistida
        +
Perguntas da execução de refinamento atual + respostas mais recentes
        +
User Story, requisitos e critérios da geração anterior
        ↓
POST /api/ai/refine-requirements
        ↓
Autenticação, ownership e validação de precondições
        ↓
AIService → AIProvider
        ↓
Prompt requirements-refinement-v1 + Structured Output + Zod
        ↓
Nova AIAnalysis (REFINEMENT) + novos artefatos versionados
```

O endpoint recebe somente `projectId` e `sessionId`; a identidade vem do cookie HttpOnly. O servidor confirma propriedade do projeto, vínculo da sessão e recupera todas as fontes diretamente do banco. O frontend não envia respostas, requisitos nem contexto livre para essa operação.

## Precondições e fontes

O refinamento exige:

- uma resposta inicial com ao menos 20 caracteres;
- uma análise de ambiguidades e uma geração de perguntas bem-sucedidas para a sessão;
- respostas para todas as perguntas pertencentes à execução atual de refinamento;
- uma User Story proveniente da geração anterior de requisitos ou de um refinamento anterior.

Para compatibilidade com o histórico e para evitar misturar execuções antigas, o serviço seleciona apenas as perguntas cujo `generatedByAnalysisId` corresponde à última análise `QUESTION_GENERATION` e cujo mapeamento histórico aponta para ambiguidades da última análise `AMBIGUITY_DETECTION` da sessão. De cada pergunta é usada somente a última versão de `ElicitationAnswer`.

O `inputSnapshot` da nova análise preserva IDs e conteúdo da resposta inicial, da análise de perguntas, das respostas de refinamento e do conjunto anterior de requisitos. Isso torna a nova versão explicável e auditável sem criar tabelas extras.

## Contrato e providers

O contrato de saída reutiliza o schema reduzido validado por `requirementsGenerationSchema`:

```json
{
  "userStory": "string",
  "functionalRequirements": ["string"],
  "nonFunctionalRequirements": ["string"],
  "acceptanceCriteria": ["string"]
}
```

O prompt dedicado é `refine-requirements.ts`, versão `requirements-refinement-v1`. As respostas das perguntas de refinamento são regras confirmadas e o prompt determina que elas prevaleçam sobre suposições anteriores.

`AIProvider` continua genérico; a operação é indicada por `metadata.operation = "refine-requirements"`. Não houve alteração no `GeminiProvider`, no modelo configurado, no timeout ou na política de retry. O `MockAIProvider` mantém execução local e determinística, e para o domínio de loja de roupas incorpora explicitamente autenticação para finalizar pedido, redução automática do estoque e controle separado por combinação de tamanho/cor quando essas regras aparecem nas respostas.

## Persistência e rastreabilidade

Cada execução bem-sucedida cria:

- uma `AIAnalysis` do tipo `REFINEMENT`, associada à sessão por `AIAnalysisSession`;
- uma nova `UserStory` com `generatedByAnalysisId` da nova análise;
- novos `Requirement` com novos códigos sequenciais e `RequirementAnalysisSource` para a nova análise;
- novos `AcceptanceCriterion` da nova User Story;
- novos vínculos `RequirementUserStory`;
- `RequirementAnswerSource` para a resposta inicial e cada resposta de refinamento efetivamente usada.

Assim, requisitos anteriores continuam consultáveis e os novos requisitos possuem suas fontes imutáveis e versionadas. O schema existente já contém `AIAnalysisType.REFINEMENT`, `AIAnalysisSession`, `RequirementAnalysisSource` e `RequirementAnswerSource`; por isso esta fase não exige migration.

## Interface e teste manual

Na sessão de elicitação, o botão **Refinar requisitos com IA** é liberado somente quando todas as perguntas atuais de refinamento estiverem respondidas. O resultado aparece com a identificação **Nova versão refinada** e informa que os artefatos anteriores foram preservados.

Para validar localmente sem chamadas externas:

1. Configure `AI_PROVIDER=mock` e inicie a aplicação.
2. Gere requisitos iniciais para uma sessão de loja de roupas.
3. Detecte ambiguidades e gere perguntas de refinamento.
4. Responda às perguntas sobre autenticação, atualização de estoque e combinação tamanho/cor.
5. Clique em **Refinar requisitos com IA**.
6. Verifique os requisitos novos e, no Prisma Studio, a `AIAnalysis` `REFINEMENT`, as novas fontes e os artefatos anteriores preservados.

Os testes automatizados usam o provider Mock e dados temporários. Nenhum teste chama Gemini.
