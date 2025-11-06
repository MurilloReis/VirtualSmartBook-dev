// Importa as funções da v2
const {onCall} = require("firebase-functions/v2/https");
const {GoogleGenerativeAI} = require("@google/generative-ai");

// Define e exporta a função usando a sintaxe v2
exports.summarizeText = onCall({secrets: ["GEMINI_KEY"]}, (request) => {
  // Acessa a chave de API das variáveis de ambiente
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

  // Na v2, a autenticação é verificada em 'request.auth'
  if (!request.auth) {
    throw new Error("Você precisa estar autenticado para usar esta função.");
  }

  // O texto enviado pelo cliente fica em 'request.data.text'
  const text = request.data.text;
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    throw new Error("O texto fornecido é inválido.");
  }

  // O uso da API do Gemini continua o mesmo
  try {
    const model = genAI.getGenerativeModel({model: "gemini-2.5-flash"});
    const prompt = `Resuma o seguinte texto em português, focando nos pontos
      principais:\n\n"${text}"`;

    // Retorna a promessa para que a função espere a conclusão
    return model.generateContent(prompt).then((result) => {
      const response = result.response;
      const summary = response.text();
      return {summary: summary};
    });
  } catch (error) {
    console.error("Erro na API do Gemini:", error);
    throw new Error("Não foi possível gerar o resumo.");
  }
});

// Conversor JSON → Markdown ULTRA-ROBUSTO
function jsonToMarkdown(data, level = 1) {
  let result = "";
  const hash = "#".repeat(Math.min(level, 6)); // Máximo 6 níveis

  // String direta
  if (typeof data === "string" && data.trim()) {
    return `${hash} ${data.trim()}\n`;
  }

  // Array
  if (Array.isArray(data)) {
    data.forEach((item) => {
      result += jsonToMarkdown(item, level);
    });
    return result;
  }

  // Objeto
  if (typeof data === "object" && data !== null) {
    // Detecta tópico principal (central, title, name, topic)
    const mainTitle = data.central || data.title ||
                      data.name || data.topic || data.heading;

    if (mainTitle) {
      result += `${hash} ${String(mainTitle).trim()}\n`;
    }

    // Processa arrays de conteúdo (branches, children, items, subtopics)
    const contentArrays = [
      data.branches, data.children, data.items,
      data.subtopics, data.topics, data.content,
    ].filter((arr) => Array.isArray(arr));

    contentArrays.forEach((arr) => {
      arr.forEach((item) => {
        result += jsonToMarkdown(item, level + 1);
      });
    });
  }

  return result;
}

// NOVA FUNÇÃO PARA GERAR MAPAS MENTAIS
exports.generateMindMap = onCall({secrets: ["GEMINI_KEY"]}, (request) => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

  if (!request.auth) {
    throw new Error("Você precisa estar autenticado para usar esta função.");
  }

  const text = request.data.text;
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    throw new Error("O texto fornecido é inválido.");
  }

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const prompt = `Analise o texto e retorne um mapa mental em JSON:

{
  "central": "Tópico Principal",
  "branches": [
    {
      "title": "Ramo 1",
      "children": ["Detalhe A", "Detalhe B"]
    },
    {
      "title": "Ramo 2",
      "children": ["Detalhe C"]
    }
  ]
}

Regras: Máximo 4 níveis. Seja conciso.

Texto: "${text}"`;

    return model.generateContent(prompt).then((result) => {
      const response = result.response;
      let content = response.text().trim();

      console.log("JSON do Gemini:", content);

      try {
        // Parse o JSON
        const jsonData = JSON.parse(content);
        console.log("✅ JSON parseado:", JSON.stringify(jsonData, null, 2));

        // Converte JSON para markdown
        const markdown = jsonToMarkdown(jsonData);
        console.log("✅ Markdown gerado:", markdown);

        if (!markdown || markdown.trim().length === 0) {
          throw new Error("Markdown vazio após conversão");
        }

        return {mindMapData: markdown.trim()};
      } catch (parseError) {
        console.error("❌ Erro ao processar:", parseError);
        console.error("Conteúdo bruto:", content);
        throw new Error("Falha ao converter mapa mental: " + parseError.message);
      }
    });
  } catch (error) {
    console.error("Erro na API do Gemini ao gerar mapa mental:", error);
    throw new Error("Não foi possível gerar o mapa mental.");
  }
});