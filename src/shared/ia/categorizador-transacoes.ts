import { requisitarGeminiTextoJson } from './gemini-client';

export interface CategoriaItem {
  chave: string;
  nome: string;
}

export interface TransacaoItemCategorizacao {
  id: number | string;
  descricao: string;
}

interface RetornoClassificacaoIA {
  classificacoes?: Array<{
    id: number | string;
    categoria: string;
  }>;
}

const SYSTEM_PROMPT_CATEGORIZACAO = `Atue como um especialista em finanças pessoais e categorização de despesas bancárias.
Dada uma lista de categorias disponíveis e uma lista de descrições de transações bancárias (extratos/cartões/PIX), determine a categoria mais adequada para cada transação com base no nome do estabelecimento, marca, tipo de comércio ou finalidade do gasto.

REGRAS OBRIGATÓRIAS:
1. Escolha APENAS uma chave de categoria presente na lista de categorias disponíveis fornecida no prompt do usuário.
2. Analise nomes de marcas, estabelecimentos e serviços:
   - Drogarias e farmácias (ex: "DROGALIRA", "DROGASIL", "PACHECO", "FARMACIA", "ULTRAFARMA") -> categoria de saúde/farmácia (ex: "farmacia").
   - Transporte (ex: "UBER", "99APP", "VLT", "METRO", "ESTAPAR", "TARIFA ONIBUS") -> "transporte".
   - Postos e combustíveis (ex: "SHELL", "IPIRANGA", "POSTO", "BR PETROBRAS") -> "combustivel".
   - Alimentação (ex: "IFOOD", "RESTAURANTE", "MERCADO", "SUPERMERCADO", "PADARIA", "CARREFOUR", "NAGUMO") -> "alimentacao" ou "padaria".
   - Serviços/Lazer (ex: "NETFLIX", "SPOTIFY", "CINEMA", "INGRESSO") -> "lazer".
   - Transferências (ex: "PIX ENVIADO", "TED RECEBIDA") -> "transferencia" ou "outros".
3. Se a descrição for ambígua ou sem indício claro de estabelecimento, use a chave "outros".
4. Retorne estritamente um JSON no formato:
{"classificacoes": [{"id": string_ou_number, "categoria": "chave_da_categoria"}]}
Sem markdown, sem explicações fora do JSON.`;

/**
 * Categoriza uma lista de descrições de transações usando a IA (Gemini).
 * Retorna um Map ligando o ID da transação à chave de categoria escolhida.
 */
export async function categorizarTransacoesComIA(
  categorias: CategoriaItem[],
  transacoes: TransacaoItemCategorizacao[]
): Promise<Map<number | string, string>> {
  const mapaResultado = new Map<number | string, string>();
  if (!transacoes || transacoes.length === 0 || !categorias || categorias.length === 0) {
    return mapaResultado;
  }

  const chavesValidas = new Set(categorias.map((c) => c.chave.toLowerCase().trim()));
  const textoCategorias = categorias
    .map((c) => `- ${c.chave}: ${c.nome}`)
    .join('\n');

  // Processa em lotes de no máximo 50 lançamentos por chamada
  const TAMANHO_LOTE = 50;
  for (let i = 0; i < transacoes.length; i += TAMANHO_LOTE) {
    const lote = transacoes.slice(i, i + TAMANHO_LOTE);
    const textoLote = lote
      .map((t) => `ID ${t.id}: "${t.descricao}"`)
      .join('\n');

    const promptUsuario = `Categorias disponíveis:\n${textoCategorias}\n\nLançamentos para categorizar:\n${textoLote}`;

    try {
      const resposta = await requisitarGeminiTextoJson<RetornoClassificacaoIA>(
        SYSTEM_PROMPT_CATEGORIZACAO,
        promptUsuario
      );

      if (resposta && Array.isArray(resposta.classificacoes)) {
        for (const item of resposta.classificacoes) {
          if (item && item.id !== undefined && item.categoria) {
            const catLimpa = String(item.categoria).toLowerCase().trim();
            if (chavesValidas.has(catLimpa)) {
              mapaResultado.set(item.id, catLimpa);
            }
          }
        }
      }
    } catch (err) {
      // Em caso de falha da API da IA (ex: sem chave de API em dev local),
      // ignora o erro e deixa o sistema utilizar o fallback por regras de SQL.
      console.warn('[categorizador-ia] Falha ao categorizar lote via Gemini, usando fallback:', (err as Error).message);
    }
  }

  return mapaResultado;
}
