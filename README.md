# Saindo do Sufoco

Protótipo de PWA para reorganização financeira de pessoas superendividadas.
Next.js (App Router) + Tailwind + Supabase, pronto para deploy na Vercel.

## 1. Setup do Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, rode todo o conteúdo de `sql/schema.sql`. Isso cria as
   tabelas, RLS, funções (`get_card_available_limit`, `increment_invoice_total`)
   e o trigger que libera limite quando uma fatura é paga.
3. Em **Storage**, crie um bucket **privado** chamado `invoice-pdfs`
   (upload dos PDFs de fatura passa por ele antes do parsing).
4. Em **Authentication**, habilite o provedor de login que preferir
   (email/senha é suficiente para o protótipo).
5. Copie `.env.example` para `.env.local` e preencha com as chaves do seu
   projeto (`Project Settings → API`).

## 2. Rodando localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000` — a rota raiz redireciona para `/dashboard`.

## 3. Ícones do PWA

O `public/manifest.json` referencia 4 ícones que ainda precisam ser gerados
(qualquer gerador de ícone PWA a partir de uma logo em SVG/PNG serve):

```
public/icons/icon-192.png
public/icons/icon-512.png
public/icons/icon-maskable-192.png
public/icons/icon-maskable-512.png
```

## 4. Deploy na Vercel

1. Suba o projeto para um repositório Git e importe na Vercel.
2. Configure as 3 variáveis de ambiente do `.env.example` no painel do
   projeto (Production e Preview).
3. Nada extra é necessário para o service worker (`public/sw.js`) — arquivos
   em `public/` já são servidos estaticamente pela Vercel.
4. Faturas muito longas podem exceder o timeout padrão de 10s do plano
   Hobby: `app/api/parse-invoice/route.ts` já declara `maxDuration = 60`,
   que só tem efeito em planos Pro ou superiores.

## 5. O que ainda é mock neste protótipo

Para deixar o protótipo navegável sem exigir dados reais logo de cara, estes
pontos usam dados de exemplo em vez de consultar o Supabase — a próxima etapa
natural é trocá-los por hooks reais (`lib/supabase/client.ts`):

- `app/dashboard/page.tsx` — resumo mensal e custos recorrentes
- `components/CreditCardManager.tsx` — lista de cartões
- `components/CashFlowProjection.tsx` — projeção de 6 meses
- `app/plano-de-resgate/page.tsx` — renda, despesas essenciais e dívidas

As regras de negócio (algoritmo do Plano de Resgate em `lib/rescue-plan.ts`,
simulador de renegociação em `lib/renegotiation.ts`, parser de PDF em
`lib/pdf-parsers/`, e as rotas de API em `app/api/`) já são funcionais e não
dependem de dados mockados — só precisam ser conectadas às telas.
