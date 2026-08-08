-- ============================================================================
-- SAINDO DO SUFOCO — Schema Supabase/PostgreSQL
-- Cobre: perfis, renda, despesas fixas, cartões, faturas, compras parceladas,
-- dívidas externas (empréstimos/negociações) e plano de resgate.
-- Todas as tabelas usam RLS com política "owner-only" (auth.uid() = user_id).
-- ============================================================================

-- Extensões necessárias
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. PROFILES — dados do usuário, 1:1 com auth.users
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  monthly_income numeric(12,2) not null default 0,
  privacy_mode_default boolean not null default false, -- valores ocultos por padrão
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. FIXED_EXPENSES — despesas fixas recorrentes (aluguel, água, luz...)
-- ----------------------------------------------------------------------------
create table public.fixed_expenses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null check (category in (
    'moradia','contas_basicas','assinatura','saude','transporte','educacao','outros'
  )),
  amount numeric(12,2) not null,
  due_day smallint check (due_day between 1 and 31),
  is_essential boolean not null default true, -- usado pelo Plano de Resgate
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. EXTERNAL_DEBTS — empréstimos, financiamentos, dívidas renegociadas
--    (tudo que não é fatura de cartão, mas compõe o comprometimento de renda)
-- ----------------------------------------------------------------------------
create table public.external_debts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creditor_name text not null,
  debt_type text not null check (debt_type in (
    'emprestimo_pessoal','financiamento','emprestimo_consignado',
    'divida_renegociada','cheque_especial','outros'
  )),
  original_principal numeric(12,2) not null,       -- valor principal sem juros abusivos
  current_balance numeric(12,2) not null,          -- saldo devedor atual
  interest_rate_monthly numeric(6,4) default 0,    -- juros ao mês, ex: 0.0899 = 8,99%
  installment_amount numeric(12,2),
  installments_total smallint,
  installments_paid smallint default 0,
  due_day smallint check (due_day between 1 and 31),
  status text not null default 'ativa' check (status in ('ativa','quitada','em_negociacao')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. CARDS — cadastro dos cartões de crédito
-- ----------------------------------------------------------------------------
create table public.cards (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,           -- "Nubank Roxinho", "Inter Black"...
  brand text,                       -- Visa, Mastercard, Elo...
  credit_limit numeric(12,2) not null,
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  revolving_interest_rate numeric(6,4) not null default 0, -- juros rotativo a.m.
  late_fee_rate numeric(6,4) not null default 0.02,        -- multa por atraso
  late_interest_rate numeric(6,4) not null default 0.01,   -- juros de mora a.m.
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. INVOICES — uma linha por fatura mensal de um cartão
-- ----------------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  reference_month date not null,     -- sempre dia 1, ex: 2026-08-01
  closing_date date not null,
  due_date date not null,
  total_amount numeric(12,2) not null default 0,
  minimum_payment numeric(12,2),
  amount_paid numeric(12,2) not null default 0,
  payment_type text check (payment_type in ('total','minimo','parcial','rotativo','nao_pago')),
  status text not null default 'aberta' check (status in ('aberta','fechada','paga','atrasada')),
  source_pdf_name text,              -- rastreabilidade de importação
  created_at timestamptz not null default now(),
  unique (card_id, reference_month)
);

-- ----------------------------------------------------------------------------
-- 6. PURCHASES — a "compra-mãe" (o que o usuário lançou: R$1.200 em 12x)
-- ----------------------------------------------------------------------------
create table public.purchases (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  description text not null,
  category text default 'outros',
  purchase_date date not null,
  total_amount numeric(12,2) not null,      -- valor total da compra (abate o limite todo)
  installments_total smallint not null default 1,
  first_invoice_id uuid references public.invoices(id),
  created_from text not null default 'manual' check (created_from in ('manual','pdf_import')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. TRANSACTIONS — cada parcela individual, vinculada a uma fatura específica
--    É esta tabela que "consome" o limite mês a mês e é liberada ao ser paga.
-- ----------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  installment_number smallint not null,     -- 1, 2, 3... até installments_total
  amount numeric(12,2) not null,
  is_paid boolean not null default false,   -- true quando a fatura correspondente é paga
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 8. PDF_IMPORTS — auditoria dos uploads e status do parser
-- ----------------------------------------------------------------------------
create table public.pdf_imports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid references public.cards(id) on delete set null,
  file_name text not null,
  storage_path text not null,          -- Supabase Storage: bucket "invoice-pdfs"
  status text not null default 'pendente' check (
    status in ('pendente','processando','aguardando_validacao','importado','erro')
  ),
  extracted_items jsonb,               -- rascunho pré-validação: [{date, desc, amount, installment}]
  error_message text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 9. RESCUE_PLAN_SNAPSHOTS — histórico de simulações do Plano de Resgate
--    (guarda o resultado do algoritmo bola de neve/avalanche num dado momento)
-- ----------------------------------------------------------------------------
create table public.rescue_plan_snapshots (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  method text not null check (method in ('bola_de_neve','avalanche')),
  essential_reserve numeric(12,2) not null,   -- reserva para sobrevivência
  available_for_debts numeric(12,2) not null,
  ordered_debts jsonb not null,               -- [{source, id, name, balance, rate, priority}]
  projected_payoff_months smallint,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- ÍNDICES
-- ============================================================================
create index idx_fixed_expenses_user on public.fixed_expenses(user_id);
create index idx_external_debts_user on public.external_debts(user_id);
create index idx_cards_user on public.cards(user_id);
create index idx_invoices_user_month on public.invoices(user_id, reference_month);
create index idx_purchases_card on public.purchases(card_id);
create index idx_transactions_invoice on public.transactions(invoice_id);
create index idx_transactions_purchase on public.transactions(purchase_id);
create index idx_pdf_imports_user on public.pdf_imports(user_id);

-- ============================================================================
-- ROW LEVEL SECURITY — política padrão "owner-only" em todas as tabelas
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.fixed_expenses enable row level security;
alter table public.external_debts enable row level security;
alter table public.cards enable row level security;
alter table public.invoices enable row level security;
alter table public.purchases enable row level security;
alter table public.transactions enable row level security;
alter table public.pdf_imports enable row level security;
alter table public.rescue_plan_snapshots enable row level security;

-- profiles: id == auth.uid()
create policy "profiles_owner" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Demais tabelas: user_id == auth.uid()
create policy "fixed_expenses_owner" on public.fixed_expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "external_debts_owner" on public.external_debts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cards_owner" on public.cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "invoices_owner" on public.invoices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "purchases_owner" on public.purchases
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transactions_owner" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "pdf_imports_owner" on public.pdf_imports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rescue_plan_owner" on public.rescue_plan_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- FUNÇÃO: limite disponível de um cartão em tempo real
-- Limite disponível = limite total - soma das parcelas futuras não pagas
-- (Isso implementa a regra "abate o valor total, libera conforme paga")
-- ============================================================================
create or replace function public.get_card_available_limit(p_card_id uuid)
returns numeric as $$
  select c.credit_limit - coalesce(sum(t.amount), 0)
  from public.cards c
  left join public.transactions t
    on t.purchase_id in (select id from public.purchases where card_id = p_card_id)
    and t.is_paid = false
  where c.id = p_card_id
  group by c.credit_limit;
$$ language sql stable;

-- ============================================================================
-- FUNÇÃO: incrementa o total acumulado de uma fatura (chamada pela API de
-- compras ao lançar cada parcela em app/api/purchases/route.ts)
-- ============================================================================
create or replace function public.increment_invoice_total(p_invoice_id uuid, p_amount numeric)
returns void as $$
  update public.invoices
  set total_amount = total_amount + p_amount
  where id = p_invoice_id;
$$ language sql security definer;

-- ============================================================================
-- TRIGGER: ao marcar uma invoice como 'paga', libera as transações vinculadas
-- ============================================================================
create or replace function public.release_limit_on_invoice_paid()
returns trigger as $$
begin
  if new.status = 'paga' and old.status is distinct from 'paga' then
    update public.transactions
    set is_paid = true, paid_at = now()
    where invoice_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_release_limit_on_invoice_paid
  after update on public.invoices
  for each row execute function public.release_limit_on_invoice_paid();

-- ============================================================================
-- TRIGGER: updated_at automático em profiles
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================================
-- STORAGE — políticas do bucket privado "invoice-pdfs" (criado manualmente
-- no painel, ver README). Sem isso, upload do client falha com
-- "new row violates row-level security policy": buckets privados negam tudo
-- por padrão até existir uma policy em storage.objects. Convenção: cada
-- arquivo fica em `<user_id>/<nome>`, então a policy só libera a própria pasta.
-- ============================================================================
create policy "invoice_pdfs_owner_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'invoice-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "invoice_pdfs_owner_select" on storage.objects
  for select
  using (
    bucket_id = 'invoice-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
