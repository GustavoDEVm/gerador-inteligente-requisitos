# Geração inteligente de requisitos — Fase 8

## Escopo

A Fase 8 implementa o primeiro fluxo completo de IA do TCC: descrição em linguagem natural, validação, geração estruturada, persistência rastreável e visualização. Ela não inclui edição, aprovação, refinamento, perguntas automáticas, detecção avançada de ambiguidades ou exportação.

## Fluxo

```text
Resposta inicial persistida da elicitação
        ↓
POST /api/ai/generate-requirements
        ↓
Autenticação e autorização do projeto/sessão
        ↓
AIService → AIProvider (Mock ou Gemini)
        ↓
Prompt requirements-v2 + JSON Schema simplificado + validação Zod
        ↓
Transação de persistência
        ↓
AIAnalysis, UserStory, Requirements e AcceptanceCriteria
```

O corpo da requisição exige somente `projectId` e `sessionId`. A identidade do autor vem exclusivamente do cookie de sessão. Antes de iniciar a análise, o serviço confirma que o projeto pertence ao usuário autenticado e que a sessão pertence àquele projeto. Em seguida, busca a versão mais recente da resposta da pergunta inicial (posição 1); ela deve ter pelo menos 20 caracteres. O contrato é estrito e rejeita um campo `input`, evitando que uma descrição não persistida seja analisada.

## Contrato do provider

```json
{
  "userStory": "Como aluno, quero consultar e reservar livros disponíveis, para encontrar obras necessárias para os estudos.",
  "functionalRequirements": [
    "O sistema deve permitir a consulta de livros disponíveis."
  ],
  "nonFunctionalRequirements": [
    "A consulta deve apresentar informações compreensíveis."
  ],
  "acceptanceCriteria": [
    "Quando houver livros encontrados, o sistema deve apresentá-los ao aluno."
  ]
}
```

Os quatro campos são obrigatórios. A geração exige ao menos um requisito funcional e um critério de aceitação; requisitos não funcionais podem ser uma lista vazia quando não houver base suficiente. Todos os itens de arrays são strings: o provider não retorna códigos, categorias ou objetos aninhados.

Depois da validação, o backend atribui os códigos sequenciais do projeto e normaliza o resultado para o contrato já consumido pela interface. A User Story textual é solicitada no formato “Como [ator], quero [ação], para [benefício]” e é separada no servidor para preencher os campos existentes. Se o formato vier diferente, o texto é preservado e o servidor usa valores neutros, sem rejeitar uma resposta válida do schema simplificado.

## Prompt e qualidade

O prompt versionado `requirements-v2` fica em `src/services/ai/prompts/generate-requirements.ts`. Ele orienta o modelo a analisar somente a descrição fornecida, não inventar fatos, diferenciar RF de RNF, evitar duplicidade e produzir critérios verificáveis em valores textuais simples. O Gemini recebe o JSON Schema simplificado derivado do Zod; a resposta é validada novamente no servidor antes de qualquer persistência.

## Persistência e rastreabilidade

Cada chamada cria uma nova `AIAnalysis` do tipo `REQUIREMENT_EXTRACTION`, associada à sessão por `AIAnalysisSession`. A análise armazena prompt, versão, snapshot da resposta efetivamente usada, provider, modelo, status e a saída estruturada efetivamente persistida. O snapshot inclui o `sourceAnswerId`, preservando o vínculo com a versão imutável da elicitação.

- Uma `UserStory` é criada com `generatedByAnalysisId`; a string gerada é preservada em `title` e `description`, enquanto o formato convencional permite preencher `actor`, `objective` e `benefit` sem alterar o banco.
- Cada RF cria um `Requirement` do tipo `FUNCTIONAL`; cada RNF cria um `Requirement` do tipo `NON_FUNCTIONAL`. Como o contrato do provider não possui categoria, o backend usa o rótulo interno padrão `Geral` em `Requirement.title` para manter a compatibilidade com o domínio atual.
- `RequirementAnalysisSource` preserva a origem de todo requisito na análise geradora.
- `RequirementAnswerSource` associa todo requisito à resposta versionada que serviu de entrada para a geração.
- `RequirementUserStory` relaciona todos os requisitos gerados à User Story daquela execução.
- Cada critério cria um `AcceptanceCriterion` posicionado sob a User Story.

Os identificadores retornados pelo provider são validados, mas o servidor os numera no contexto do projeto antes de salvar. Isso mantém as restrições únicas `[projectId, code]` em reexecuções, por exemplo `RF-001`/`RF-002` na primeira geração e `RF-003`/`RF-004` na próxima. As análises anteriores e seus artefatos não são alterados ou removidos.

Os relacionamentos existentes comportam esse fluxo, portanto não houve alteração em `schema.prisma` nem migration na Fase 8.

## Mock e Gemini

Com `AI_PROVIDER=mock`, o `MockAIProvider` retorna sempre a mesma resposta completa, validada pelo mesmo schema Zod, sem rede, chave Gemini ou consumo de quota. Esse é o modo recomendado para desenvolvimento e testes.

Com `AI_PROVIDER=gemini`, o `GeminiProvider` recebe somente a solicitação genérica do `AIService`; as regras de requisitos permanecem no prompt e no schema. Não existe fallback automático para Mock se o Gemini falhar. Chamadas reais devem ser feitas manualmente, após configurar as variáveis locais de ambiente, e nunca durante a suíte automatizada.

## Teste manual com Mock

1. Mantenha `AI_PROVIDER=mock` no `.env`, sem configurar `GEMINI_API_KEY`.
2. Execute `npm.cmd run dev`, faça login, abra um projeto e clique em **Iniciar elicitação**.
3. Informe o título opcional e uma descrição de pelo menos 20 caracteres para criar a sessão. Essa etapa apenas persiste a coleta inicial; ela não chama IA.
4. Após a sessão ser criada, clique em **Gerar requisitos com IA** no painel lateral. O painel não recebe uma segunda descrição: o serviço usa automaticamente a resposta inicial já persistida.
5. Confirme User Story, RF, RNF e critérios no painel.
6. No Prisma Studio, confira a nova `AIAnalysis`, sua sessão, a User Story, os critérios, os requisitos e os vínculos de origem.

O teste automatizado cobre o mesmo fluxo pela Route Handler com Mock e limpa apenas seus dados temporários `example.test` ao final.
