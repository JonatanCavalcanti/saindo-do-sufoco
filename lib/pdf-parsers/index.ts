// lib/pdf-parsers/index.ts
//
// Cada parser recebe o texto já extraído do PDF (via pdfjs-dist) e devolve uma
// lista de itens candidatos. Nada aqui grava no banco — o resultado alimenta
// `pdf_imports.extracted_items` para revisão humana antes de virar dado real.

export type ParsedItem = {
  date: string | null;          // ISO (YYYY-MM-DD) quando possível
  description: string;
  amount: number;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  confidence: "alta" | "media" | "baixa";
};

export interface BankParser {
  name: string;
  detect(rawText: string): boolean;
  parse(rawText: string): ParsedItem[];
}

// Converte "DD/MM" (sem ano, comum em faturas) para ISO usando o ano de referência
function toIsoDate(day: string, month: string, referenceYear: number): string | null {
  const d = Number(day);
  const m = Number(month);
  if (!d || !m || m < 1 || m > 12) return null;
  return `${referenceYear}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseBRLAmount(raw: string): number {
  return parseFloat(raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
}

// ----------------------------------------------------------------------------
// Parser genérico — regex ampla que cobre o padrão comum às faturas brasileiras:
// "12/07  DESCRIÇÃO DA COMPRA  03/10  R$ 123,45"  (parcela é opcional)
// ----------------------------------------------------------------------------
const genericParser: BankParser = {
  name: "generico",
  detect: () => true, // sempre serve de fallback
  parse(rawText: string) {
    const referenceYear = new Date().getFullYear();
    const lineRegex =
      /(\d{2})\/(\d{2})\s+(.+?)\s+(?:(\d{1,2})\/(\d{1,2})\s+)?R?\$?\s?(\d{1,3}(?:\.\d{3})*,\d{2})/g;

    const items: ParsedItem[] = [];
    let match: RegExpExecArray | null;
    while ((match = lineRegex.exec(rawText)) !== null) {
      const [, day, month, description, instCurrent, instTotal, amountRaw] = match;
      items.push({
        date: toIsoDate(day, month, referenceYear),
        description: description.trim(),
        amount: parseBRLAmount(amountRaw),
        installmentCurrent: instCurrent ? Number(instCurrent) : null,
        installmentTotal: instTotal ? Number(instTotal) : null,
        confidence: instTotal ? "alta" : "media",
      });
    }
    return items;
  },
};

// ----------------------------------------------------------------------------
// Parser Nubank — cabeçalho característico "NU PAGAMENTOS" / layout de tabela
// simples "data · estabelecimento · valor". Reaproveita a regex genérica pois
// o layout do Nubank já é bem próximo do padrão comum; ajuste fino conforme
// exemplos reais forem coletados.
// ----------------------------------------------------------------------------
const nubankParser: BankParser = {
  name: "nubank",
  detect: (rawText) => /nu\s?pagamentos|nubank/i.test(rawText),
  parse: (rawText) => genericParser.parse(rawText).map((i) => ({ ...i, confidence: "alta" })),
};

// ----------------------------------------------------------------------------
// Parser Itaú — cabeçalho "ITAÚ UNIBANCO" / costuma repetir "PARC 03/10" junto
// à descrição em vez de coluna separada.
// ----------------------------------------------------------------------------
const itauParser: BankParser = {
  name: "itau",
  detect: (rawText) => /ita[uú]\s?unibanco|cart[aã]o itaú/i.test(rawText),
  parse(rawText) {
    const referenceYear = new Date().getFullYear();
    const lineRegex =
      /(\d{2})\/(\d{2})\s+(.+?)\s*(?:PARC\.?\s*(\d{1,2})\/(\d{1,2}))?\s+R?\$?\s?(\d{1,3}(?:\.\d{3})*,\d{2})/gi;
    const items: ParsedItem[] = [];
    let match: RegExpExecArray | null;
    while ((match = lineRegex.exec(rawText)) !== null) {
      const [, day, month, description, instCurrent, instTotal, amountRaw] = match;
      items.push({
        date: toIsoDate(day, month, referenceYear),
        description: description.trim(),
        amount: parseBRLAmount(amountRaw),
        installmentCurrent: instCurrent ? Number(instCurrent) : null,
        installmentTotal: instTotal ? Number(instTotal) : null,
        confidence: instTotal ? "alta" : "media",
      });
    }
    return items;
  },
};

const parsers: BankParser[] = [nubankParser, itauParser, genericParser];

export function parseInvoiceText(rawText: string): { bank: string; items: ParsedItem[] } {
  const parser = parsers.find((p) => p.detect(rawText)) ?? genericParser;
  return { bank: parser.name, items: parser.parse(rawText) };
}
