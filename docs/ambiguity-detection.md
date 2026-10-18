# Detecção de ambiguidades — Fase 9

## Escopo

A detecção de ambiguidades adiciona uma análise estruturada a partir da resposta inicial já persistida em uma sessão de elicitação. Isoladamente, essa operação não cria perguntas de esclarecimento, não executa refinamento e não modifica a geração de requisitos `requirements-v2`; essas etapas são executadas por operações de IA próprias.

```text
ElicitationAnswer (última versão da pergunta inicial)
        ↓
POST /api/ai/detect-ambiguities
        ↓
Autenticação e autorização do projeto e da sessão
        ↓
AIService → AIProvider (Mock ou Gemini)
        ↓
Prompt ambiguities-v1 + JSON Schema + validação Zod
        ↓
AIAnalysis e Ambiguity
        ↓
Resultado estruturado na sessão de elicitação
```

O endpoint aceita somente `projectId` e `sessionId`. O texto não é aceito do frontend: o servidor recupera a versão mais recente da resposta da pergunta de posição 1, que precisa conter ao menos 20 caracteres.

## Contrato estruturado

O provider recebe Structured Output e deve retornar exclusivamente:

```json
{
  "ambiguities": [
    {
      "description": "Não está definido como os horários disponíveis são determinados.",
      "severity": "high",
      "context": "pacientes possam marcar consultas"
    }
  ]
}
```

`severity` só aceita `low`, `medium` ou `high`. O array pode ser vazio quando não houver pontos relevantes a esclarecer. O schema Zod é estrito, limita a lista a 12 itens e valida descrição, severidade e contexto antes de qualquer persistência.

O prompt versionado `ambiguities-v1` orienta o modelo a analisar somente a resposta fornecida, evitar requisitos ou soluções inventadas e não converter toda falta de detalhe em ambiguidade.

## Persistência e histórico

Cada execução cria uma nova `AIAnalysis` do tipo `AMBIGUITY_DETECTION`, associada à sessão por `AIAnalysisSession`. A análise preserva provider, modelo, prompt, versão, snapshot da entrada, status, data de conclusão e saída estruturada.

O `inputSnapshot` registra o conteúdo analisado e o `sourceAnswerId`, mantendo a referência à versão imutável da resposta de elicitação. Cada item persistido cria uma `Ambiguity` com:

- `projectId`;
- `generatedByAnalysisId`;
- descrição;
- severidade convertida para o enum do banco (`LOW`, `MEDIUM` ou `HIGH`);
- status inicial `OPEN`.

O modelo atual não possui uma coluna de contexto por ambiguidade. O contexto individual permanece no `AIAnalysis.structuredOutput`, e cada `Ambiguity` aponta para essa análise por `generatedByAnalysisId`; assim, a execução, sua resposta de origem e o contexto estruturado continuam rastreáveis sem alterar o schema.

Uma nova execução nunca remove ou sobrescreve análises e ambiguidades anteriores. Para impedir repetição dentro da mesma execução, o serviço descarta apenas descrições equivalentes da resposta atual após normalizar espaços e caixa. Ele não compara execuções anteriores, preservando o histórico.

Antes de criar a análise, `AIService` bloqueia a linha da sessão em uma transação curta e verifica se já existe uma análise `AMBIGUITY_DETECTION` da mesma sessão nos estados `PENDING` ou `RUNNING`. Nesse caso, a nova requisição recebe `409 CONFLICT`, sem chamar o provider nem criar ambiguidades duplicadas. Análises ativas do mesmo tipo iniciadas há mais de três minutos são preservadas e marcadas como `FAILED` com o código `AI_OPERATION_ABANDONED`, permitindo uma nova tentativa sem apagar histórico.

## Providers

`AIProvider` já define uma única operação genérica de Structured Output. A detecção usa `metadata.operation = "detect-ambiguities"`, portanto não cria um segundo mecanismo de comunicação.

- `GeminiProvider` apenas transporta a solicitação genérica, o prompt e o JSON Schema ao SDK existente. O timeout permanece em 30 segundos. Para `detect-ambiguities`, uma primeira falha HTTP `503` transitória reconhecida pelo provider recebe somente uma segunda tentativa após um segundo; não há terceira tentativa nem retry para timeout, TLS, erros `4xx`, resposta inválida ou falhas de persistência.
- `MockAIProvider` não usa rede, SDK Gemini ou variáveis Gemini. Para uma entrada comum, retorna três ambiguidades determinísticas, uma para cada severidade. Entradas que contenham `sem ambiguidades` ou `requisitos completos` retornam uma lista vazia, permitindo validar os dois cenários localmente.

## Interface e teste manual

O painel **Análises por IA** da sessão contém a ação **Detectar ambiguidades** ao lado da geração já existente. Não há segunda textarea. Depois da conclusão, uma seção principal abaixo da sessão apresenta:

- estado de carregamento, erro e resultado disponível;
- mensagem positiva quando não houver ambiguidades;
- cards responsivos com severidade, descrição e contexto quando houver itens.

Para testar sem consumo externo, configure `AI_PROVIDER=mock`, inicie a aplicação, registre uma resposta inicial com pelo menos 20 caracteres e clique em **Detectar ambiguidades**. Os testes automatizados usam MockAIProvider ou providers falsos; eles não chamam a Gemini real.
