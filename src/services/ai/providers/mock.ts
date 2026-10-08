import { ambiguityDetectionSchema, initialRequirementAnalysisSchema, refinementQuestionsSchema, requirementsGenerationSchema } from "@/services/ai/schemas";
import type { AIProvider, StructuredGenerationRequest, StructuredGenerationResponse } from "@/services/ai/types";

export const MOCK_MODEL = "mock";

type MockDomain = "clothing-store" | "library" | "generic";

const clothingKeywords = ["roupa", "roupas", "vestuário", "vestuario", "moda", "tamanho", "carrinho", "estoque"];
const libraryKeywords = ["biblioteca", "livro", "livros", "acervo"];

function getMockDomain(input: string): MockDomain {
  const normalizedInput = input.trim().toLocaleLowerCase("pt-BR");

  if (clothingKeywords.some((keyword) => normalizedInput.includes(keyword))) return "clothing-store";
  if (libraryKeywords.some((keyword) => normalizedInput.includes(keyword))) return "library";
  return "generic";
}

function mockAnalysisResponse(input: string) {
  const domain = getMockDomain(input);

  if (domain === "clothing-store") {
    return initialRequirementAnalysisSchema.parse({
      summary: "Sistema de gestão para uma loja de roupas, com catálogo, carrinho, pedidos e controle de estoque.",
      userStory: {
        actor: "cliente",
        action: "visualizar produtos, selecionar tamanho e cor, adicionar itens ao carrinho e realizar pedidos",
        benefit: "comprar roupas adequadas às suas preferências",
      },
      observations: ["A descrição inclui produtos, variações de tamanho e cor, carrinho, pedidos e estoque."],
      ambiguities: [
        "Não está definido como o estoque é atualizado após um pedido.",
        "Não está definido se o cliente precisa estar autenticado para realizar um pedido.",
        "Não está definido como funciona a combinação de tamanho e cor de cada produto.",
      ],
      suggestions: ["Definir as regras de atualização de estoque.", "Definir a autenticação necessária para finalizar pedidos."],
    });
  }

  if (domain === "library") {
    return initialRequirementAnalysisSchema.parse({
      summary: "Sistema para gerenciamento de uma biblioteca.",
      userStory: {
        actor: "aluno",
        action: "consultar livros disponíveis",
        benefit: "encontrar livros para estudo",
      },
      observations: ["É necessário definir como será realizada a reserva."],
      ambiguities: ["Não foi informado por quanto tempo um livro pode permanecer reservado."],
      suggestions: ["Definir prazo de reserva.", "Definir regras para retirada e devolução."],
    });
  }

  return initialRequirementAnalysisSchema.parse({
    summary: "Sistema de software baseado na necessidade descrita pelo usuário.",
    userStory: {
      actor: "usuário",
      action: "utilizar as funcionalidades descritas",
      benefit: "atingir o objetivo informado para o sistema",
    },
    observations: ["A necessidade inicial deve ser refinada com regras de negócio e responsabilidades."],
    ambiguities: ["Não estão definidas todas as regras de negócio para a necessidade descrita."],
    suggestions: ["Esclarecer os fluxos principais, as responsabilidades e as regras de validação."],
  });
}

function mockRequirementsResponse(input: string) {
  const domain = getMockDomain(input);

  if (domain === "clothing-store") {
    return requirementsGenerationSchema.parse({
      userStory: "Como cliente, quero visualizar produtos de roupas, escolher tamanho e cor, adicionar itens ao carrinho e realizar pedidos, para comprar produtos adequados às minhas preferências.",
      functionalRequirements: [
        "O sistema deve permitir que o cliente consulte produtos de roupas com preço e disponibilidade em estoque.",
        "O sistema deve apresentar os detalhes de cada produto, incluindo tamanho, cor, preço e estoque disponível.",
        "O sistema deve permitir que o cliente selecione uma combinação disponível de tamanho e cor antes de adicionar o produto ao carrinho.",
        "O sistema deve permitir que o cliente adicione, altere a quantidade e remova itens do carrinho.",
        "O sistema deve permitir que o cliente finalize o pedido com os itens selecionados no carrinho.",
        "O sistema deve permitir que o administrador cadastre e atualize produtos, preços, tamanhos, cores e estoque.",
        "O sistema deve atualizar o estoque das combinações de tamanho e cor após a confirmação de um pedido.",
      ],
      nonFunctionalRequirements: [
        "A interface deve apresentar produtos, tamanhos, cores, preços e carrinho de forma clara e responsiva.",
        "O sistema deve proteger os dados do cliente e as informações dos pedidos durante o acesso autenticado.",
      ],
      acceptanceCriteria: [
        "Quando o cliente consultar um produto, o sistema deve exibir preço, tamanhos, cores e disponibilidade em estoque.",
        "Quando o cliente selecionar tamanho e cor disponíveis, o sistema deve permitir adicionar o produto ao carrinho.",
        "Quando o cliente confirmar um pedido, o sistema deve registrar os itens e atualizar o estoque correspondente.",
        "Quando o administrador cadastrar um produto, o sistema deve permitir informar preço, tamanhos, cores e quantidade em estoque.",
      ],
    });
  }

  if (domain === "library") {
    return requirementsGenerationSchema.parse({
      userStory: "Como aluno, quero consultar e reservar livros disponíveis, para encontrar e reservar obras necessárias para os estudos.",
      functionalRequirements: [
        "O sistema deve permitir que o aluno consulte os livros disponíveis no acervo.",
        "O sistema deve permitir que o aluno solicite a reserva de um livro disponível.",
      ],
      nonFunctionalRequirements: [
        "A interface de consulta e reserva deve apresentar informações compreensíveis ao aluno.",
      ],
      acceptanceCriteria: [
        "Quando o aluno consultar um livro existente, o sistema deve apresentar sua disponibilidade para reserva.",
        "Quando o aluno solicitar a reserva de um livro disponível, o sistema deve registrar a solicitação de reserva.",
      ],
    });
  }

  return requirementsGenerationSchema.parse({
    userStory: "Como usuário, quero utilizar as funcionalidades descritas, para atingir o objetivo informado para o sistema.",
    functionalRequirements: [
      "O sistema deve permitir que o usuário execute o fluxo principal descrito na necessidade inicial.",
      "O sistema deve registrar as informações necessárias para acompanhar o fluxo principal.",
    ],
    nonFunctionalRequirements: [
      "A interface deve apresentar as informações do fluxo principal de forma clara e responsiva.",
    ],
    acceptanceCriteria: [
      "Quando o usuário informar os dados necessários, o sistema deve concluir o fluxo principal e registrar o resultado.",
    ],
  });
}

function mockRefinedRequirementsResponse(input: string) {
  let parsedInput: unknown;

  try {
    parsedInput = JSON.parse(input);
  } catch {
    parsedInput = undefined;
  }

  const initialElicitationAnswer = parsedInput && typeof parsedInput === "object" && "initialElicitationAnswer" in parsedInput
    ? (parsedInput as { initialElicitationAnswer?: unknown }).initialElicitationAnswer
    : "";
  const refinementAnswers = parsedInput && typeof parsedInput === "object" && "refinementAnswers" in parsedInput
    ? (parsedInput as { refinementAnswers?: unknown }).refinementAnswers
    : [];
  const refinementAnswerEntries = Array.isArray(refinementAnswers)
    ? refinementAnswers.filter((item): item is { question: string; answer: string } => (
      Boolean(item)
      && typeof item === "object"
      && "question" in item
      && typeof item.question === "string"
      && "answer" in item
      && typeof item.answer === "string"
    ))
    : [];
  const answerText = refinementAnswerEntries.map((item) => item.answer).join(" ");
  const refinementContext = `${typeof initialElicitationAnswer === "string" ? initialElicitationAnswer : ""} ${answerText}`;

  if (getMockDomain(refinementContext) !== "clothing-store") {
    return mockRequirementsResponse(typeof initialElicitationAnswer === "string" ? initialElicitationAnswer : input);
  }

  const normalizedAnswers = answerText.toLocaleLowerCase("pt-BR");
  const requiresAuthentication = refinementAnswerEntries.some((item) => mockConfirmsOrderAuthentication(item.question, item.answer));
  const reducesStockAfterConfirmation = normalizedAnswers.includes("estoque")
    && (normalizedAnswers.includes("reduz") || normalizedAnswers.includes("baixa"));
  const controlsSizeAndColorSeparately = normalizedAnswers.includes("tamanho") && normalizedAnswers.includes("cor");

  return requirementsGenerationSchema.parse({
    userStory: requiresAuthentication
      ? "Como cliente autenticado, quero selecionar produtos por tamanho e cor, adicionar itens ao carrinho e finalizar pedidos, para comprar roupas disponíveis com segurança."
      : "Como cliente, quero selecionar produtos por tamanho e cor, adicionar itens ao carrinho e finalizar pedidos, para comprar roupas disponíveis.",
    functionalRequirements: [
      "O sistema deve permitir que o cliente consulte produtos de roupas com preço e disponibilidade.",
      "O sistema deve apresentar as combinações disponíveis de tamanho e cor de cada produto antes de adicioná-lo ao carrinho.",
      "O sistema deve permitir que o cliente adicione, altere a quantidade e remova itens do carrinho.",
      ...(requiresAuthentication ? ["O sistema deve exigir que o cliente esteja autenticado para finalizar um pedido."] : []),
      ...(requiresAuthentication ? ["O sistema deve permitir que o cliente autenticado finalize o pedido com os itens selecionados no carrinho."] : []),
      ...(reducesStockAfterConfirmation ? ["O sistema deve reduzir automaticamente o estoque após a confirmação do pedido."] : []),
      ...(controlsSizeAndColorSeparately ? ["O sistema deve controlar o estoque separadamente para cada combinação específica de tamanho e cor."] : []),
      "O sistema deve permitir que o administrador cadastre produtos, preços, combinações de tamanho e cor e seus estoques.",
    ],
    nonFunctionalRequirements: [
      "A interface deve apresentar produtos, variações, preços e carrinho de forma clara e responsiva.",
      ...(requiresAuthentication ? ["O sistema deve proteger o acesso autenticado do cliente durante a finalização do pedido."] : []),
    ],
    acceptanceCriteria: [
      "Quando o cliente selecionar uma combinação disponível de tamanho e cor, o sistema deve permitir adicioná-la ao carrinho.",
      ...(requiresAuthentication ? ["Quando um cliente não autenticado tentar finalizar um pedido, o sistema deve exigir sua autenticação antes da conclusão."] : []),
      ...(reducesStockAfterConfirmation ? ["Quando um pedido for confirmado, o sistema deve reduzir automaticamente o estoque da combinação comprada."] : []),
      ...(controlsSizeAndColorSeparately ? ["Quando o administrador informar o estoque de um produto, o sistema deve registrar a quantidade para cada combinação de tamanho e cor."] : []),
    ],
  });
}

function mockConfirmsOrderAuthentication(question: string, answer: string) {
  const normalizedQuestion = question.toLocaleLowerCase("pt-BR");
  const normalizedAnswer = answer.trim().toLocaleLowerCase("pt-BR");
  const questionDefinesOrderAuthentication = normalizedQuestion.includes("autentic")
    && normalizedQuestion.includes("pedido")
    && normalizedQuestion.includes("finaliz");
  const answerExplicitlyConfirms = normalizedAnswer.includes("autentic")
    && normalizedAnswer.includes("pedido")
    && normalizedAnswer.includes("finaliz");
  const answerIsAffirmative = !/\bn[aã]o\b/u.test(normalizedAnswer)
    && (/^(sim|s|afirmativo|confirmado|correto|positivo)\b/u.test(normalizedAnswer)
      || normalizedAnswer.includes("deve")
      || normalizedAnswer.includes("obrigat"));

  return questionDefinesOrderAuthentication && (answerExplicitlyConfirms || answerIsAffirmative);
}

const clothingAmbiguities = [
  {
    description: "Não está definido como o estoque é atualizado após um pedido.",
    severity: "high" as const,
  },
  {
    description: "Não está definido se o cliente precisa estar autenticado para realizar um pedido.",
    severity: "medium" as const,
  },
  {
    description: "Não está definido como funciona a combinação de tamanho e cor de cada produto.",
    severity: "low" as const,
  },
];

const libraryAmbiguities = [
  {
    description: "Não está definido quais operações de reserva o usuário poderá realizar.",
    severity: "high" as const,
  },
  {
    description: "Não está definido como a disponibilidade dos itens será atualizada.",
    severity: "medium" as const,
  },
  {
    description: "Não está definido se haverá notificações sobre alterações na solicitação.",
    severity: "low" as const,
  },
];

const genericAmbiguities = [
  {
    description: "Não está definido quais usuários podem executar o fluxo principal.",
    severity: "high" as const,
  },
  {
    description: "Não está definido como as informações do fluxo principal devem ser atualizadas.",
    severity: "medium" as const,
  },
  {
    description: "Não está definido como o usuário será informado sobre mudanças no fluxo principal.",
    severity: "low" as const,
  },
];

function mockAmbiguityResponse(input: string) {
  const normalizedInput = input.trim().toLocaleLowerCase("pt-BR");
  if (normalizedInput.includes("sem ambiguidades") || normalizedInput.includes("requisitos completos")) {
    return ambiguityDetectionSchema.parse({ ambiguities: [] });
  }

  const context = input.trim().slice(0, 180);
  const domain = getMockDomain(input);
  const ambiguities = domain === "clothing-store"
    ? clothingAmbiguities
    : domain === "library"
      ? libraryAmbiguities
      : genericAmbiguities;

  return ambiguityDetectionSchema.parse({
    ambiguities: ambiguities.map((ambiguity) => ({ ...ambiguity, context })),
  });
}

function getClothingRefinementQuestion(description: string) {
  const normalizedDescription = description.toLocaleLowerCase("pt-BR");

  if (normalizedDescription.includes("estoque")) {
    return {
      question: "Como o estoque do produto deve ser atualizado após a confirmação de um pedido?",
      reason: "A regra é necessária para manter a disponibilidade dos produtos correta após cada pedido.",
    };
  }

  if (normalizedDescription.includes("autentic") && normalizedDescription.includes("pedido")) {
    return {
      question: "O cliente precisa estar autenticado para finalizar um pedido?",
      reason: "A definição é necessária para estabelecer a regra de acesso ao fechamento do pedido.",
    };
  }

  if (normalizedDescription.includes("tamanho") && normalizedDescription.includes("cor")) {
    return {
      question: "Como devem ser cadastradas e controladas as combinações de tamanho e cor de cada produto?",
      reason: "A regra é necessária para apresentar somente as variações de produto disponíveis ao cliente.",
    };
  }

  return undefined;
}

function mockRefinementQuestionsResponse(input: string) {
  let parsedInput: unknown;

  try {
    parsedInput = JSON.parse(input);
  } catch {
    parsedInput = undefined;
  }

  const elicitationAnswer = parsedInput && typeof parsedInput === "object" && "elicitationAnswer" in parsedInput
    ? (parsedInput as { elicitationAnswer?: unknown }).elicitationAnswer
    : undefined;
  const ambiguities = parsedInput && typeof parsedInput === "object" && "ambiguities" in parsedInput
    ? (parsedInput as { ambiguities?: unknown }).ambiguities
    : undefined;
  const isClothingContext = typeof elicitationAnswer === "string" && getMockDomain(elicitationAnswer) === "clothing-store";

  if (!Array.isArray(ambiguities)) return refinementQuestionsSchema.parse({ questions: [] });

  return refinementQuestionsSchema.parse({
    questions: ambiguities.flatMap((ambiguity) => {
      if (!ambiguity || typeof ambiguity !== "object") return [];
      const { id, description } = ambiguity as { id?: unknown; description?: unknown };
      if (typeof id !== "string" || typeof description !== "string") return [];

      const clothingQuestion = isClothingContext ? getClothingRefinementQuestion(description) : undefined;
      return [{
        ambiguityId: id,
        question: clothingQuestion?.question ?? `Qual regra deve ser definida para esclarecer: ${description}`,
        reason: clothingQuestion?.reason ?? "A informação é necessária para reduzir interpretações diferentes do requisito.",
      }];
    }),
  });
}

export class MockAIProvider implements AIProvider {
  readonly name = "mock";

  async generateStructuredResponse<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResponse<T>> {
    const output = request.metadata?.operation === "generate-requirements"
      ? mockRequirementsResponse(request.userInput)
      : request.metadata?.operation === "refine-requirements"
        ? mockRefinedRequirementsResponse(request.userInput)
      : request.metadata?.operation === "detect-ambiguities"
        ? mockAmbiguityResponse(request.userInput)
        : request.metadata?.operation === "generate-refinement-questions"
          ? mockRefinementQuestionsResponse(request.userInput)
          : mockAnalysisResponse(request.userInput);
    return { output: output as T, model: MOCK_MODEL };
  }
}
