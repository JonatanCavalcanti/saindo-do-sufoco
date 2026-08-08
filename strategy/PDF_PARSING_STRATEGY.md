# Estratégia de Leitura de PDF de Faturas — Vercel + Supabase

## Por que não usar OCR como primeira opção

Faturas de cartão brasileiras (Nubank, Itaú, Bradesco, Inter, C6, XP...) quase
sempre são PDFs **gerados digitalmente**, não escaneados. Isso significa que o
texto já existe no arquivo, só precisa ser extraído — muito mais barato e
confiável que OCR. Reserve OCR (Tesseract/Google Vision) apenas como *fallback*
para faturas escaneadas (raras, mas alguns bancos ainda mandam boleto em foto).

## Arquitetura recomendada

```
[Upload no client] → [Supabase Storage: bucket invoice-pdfs]
                              │
                              ▼
              [Vercel Serverless Function /api/parse-invoice]
                              │
              1. Baixa o PDF do Storage (server-side, com senha se houver)
              2. Extrai texto com pdf-parse (ou pdfjs-dist)
              3. Aplica parser específico por banco (regex/heurísticas)
              4. Grava rascunho em pdf_imports.extracted_items (jsonb)
              5. Retorna itens para a tela de VALIDAÇÃO PRÉVIA
                              │
                              ▼
        [Usuário revisa/edita na UI] → confirma → grava em purchases/transactions
```

### Por que essa arquitetura
- **Nunca persiste direto no banco.** PDFs de fatura têm formatação inconsistente;
  o parser erra. A tabela `pdf_imports.extracted_items` guarda um rascunho em
  JSON que só vira `purchases`/`transactions` reais depois que o usuário confirma
  na tela de validação — isso já está modelado no schema.
- **Processamento no servidor, não no browser.** PDFs com senha e parsing de
  texto são mais confiáveis em Node.js do que no client; evita expor lógica de
  parsing e mantém o arquivo fora do bundle do cliente.

## Bibliotecas

| Necessidade | Biblioteca | Observação |
|---|---|---|
| Extração de texto | `pdf-parse` | Simples, roda bem em serverless. Puro JS, sem binário nativo. |
| PDF com senha | `pdf-parse` não suporta nativamente → usar `qpdf` via binário, **ou** trocar por `pdfjs-dist` que aceita `password` no `getDocument()` | `pdfjs-dist` é mantido pela Mozilla e mais robusto para isso |
| OCR (fallback) | `@google-cloud/vision` (API paga) | Só ativar se a extração de texto vier vazia (sinal de PDF escaneado) |

**Recomendação final:** usar `pdfjs-dist` como base (não `pdf-parse`), porque:
1. Suporta PDFs protegidos por senha nativamente (`getDocument({ data, password })`).
2. Não depende de binários nativos problemáticos em ambiente serverless.
3. Permite extrair texto posicionalmente (coordenadas x/y), o que ajuda a
   separar colunas de "Data | Descrição | Valor | Parcela" com mais precisão
   que uma extração de texto corrido.

## Limites do ambiente Vercel a considerar

- **Timeout:** funções serverless no plano Hobby têm 10s; no Pro, até 60s (ou
  300s com `maxDuration` configurado). Faturas grandes (muitas páginas) podem
  estourar isso — processe página por página e considere usar uma **Vercel
  Background Function** ou fila (ex: Supabase Edge Function + `pg_cron`) para
  faturas com mais de ~10 páginas.
- **Tamanho de payload:** limite de ~4.5MB no corpo da requisição em algumas
  rotas. Por isso o upload deve ir **direto para o Supabase Storage** (via
  signed URL) e a função serverless apenas *baixa* o arquivo do Storage, em
  vez de receber o PDF no body da requisição.
- **Múltiplos PDFs:** para upload em lote (histórico de vários meses), dispare
  uma chamada de parsing por PDF em paralelo (`Promise.allSettled`), cada uma
  gravando seu próprio registro em `pdf_imports`, e mostre uma fila de
  progresso na UI.

## Parser por banco (heurística)

Cada banco formata a fatura de um jeito. Estrutura recomendada:

```ts
// lib/pdf-parsers/index.ts
type ParsedItem = { date: string; description: string; amount: number; installment?: string };

interface BankParser {
  detect(rawText: string): boolean;      // identifica o banco pelo cabeçalho
  parse(rawText: string): ParsedItem[];  // aplica regex específico
}

const parsers: BankParser[] = [nubankParser, itauParser, interParser, genericParser];

export function parseInvoiceText(rawText: string) {
  const parser = parsers.find(p => p.detect(rawText)) ?? genericParser;
  return parser.parse(rawText);
}
```

- `genericParser` como último recurso: regex ampla para o padrão comum
  `DD/MM  DESCRIÇÃO ... (\d+/\d+)?  R?\$?\s?[\d.,]+`.
- Cada parser específico melhora a precisão para os bancos mais usados pelos
  usuários (comece por Nubank, Itaú, Inter — cubra os 3 primeiros e evolua).

## Fluxo de validação prévia (obrigatório para superendividados)

Nunca insira dados extraídos automaticamente sem revisão — erros de parsing
em valores poderiam distorcer o diagnóstico financeiro de alguém já em
situação frágil. A tela de validação deve:
1. Listar cada item extraído com campos editáveis (data, descrição, valor, parcela).
2. Marcar com destaque itens que o parser teve baixa confiança (ex: valor sem
   `R$`, data ambígua).
3. Permitir excluir itens antes de confirmar.
4. Só então chamar o endpoint que grava em `purchases` + `transactions`.
