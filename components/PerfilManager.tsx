"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Plus, Trash2, Wallet, Home, Landmark } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Tipos — espelham public.fixed_expenses e public.external_debts
// ---------------------------------------------------------------------------
type FixedExpense = {
  id: string;
  name: string;
  category: string;
  amount: number;
  due_day: number | null;
  is_essential: boolean;
};

type ExternalDebt = {
  id: string;
  creditor_name: string;
  debt_type: string;
  original_principal: number;
  current_balance: number;
  interest_rate_monthly: number;
  installment_amount: number | null;
  installments_total: number | null;
  due_day: number | null;
  status: string;
};

const FIXED_CATEGORIES = [
  { value: "moradia", label: "Moradia" },
  { value: "contas_basicas", label: "Contas básicas" },
  { value: "assinatura", label: "Assinatura" },
  { value: "saude", label: "Saúde" },
  { value: "transporte", label: "Transporte" },
  { value: "educacao", label: "Educação" },
  { value: "outros", label: "Outros" },
];

const DEBT_TYPES = [
  { value: "emprestimo_pessoal", label: "Empréstimo pessoal" },
  { value: "financiamento", label: "Financiamento" },
  { value: "emprestimo_consignado", label: "Empréstimo consignado" },
  { value: "divida_renegociada", label: "Dívida renegociada" },
  { value: "cheque_especial", label: "Cheque especial" },
  { value: "outros", label: "Outros" },
];

const DEBT_STATUS = [
  { value: "ativa", label: "Ativa" },
  { value: "quitada", label: "Quitada" },
  { value: "em_negociacao", label: "Em negociação" },
];

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PerfilManager({
  email,
  monthlyIncome,
  fixedExpenses,
  externalDebts,
}: {
  email: string;
  monthlyIncome: number;
  fixedExpenses: FixedExpense[];
  externalDebts: ExternalDebt[];
}) {
  const router = useRouter();
  const supabase = createClient();

  return (
    <main className="min-h-screen bg-base-50 pb-24 px-5 pt-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl text-ink-900">Perfil</h1>
        <LogoutButton />
      </div>
      <p className="font-body text-sm text-ink-400 mb-5">{email}</p>

      <RendaSection initialIncome={monthlyIncome} />
      <DespesasFixasSection expenses={fixedExpenses} />
      <DividasExternasSection debts={externalDebts} />
    </main>
  );

  function LogoutButton() {
    async function handleLogout() {
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    }
    return (
      <button
        onClick={handleLogout}
        className="flex items-center gap-1 text-ink-400 font-body text-xs font-semibold"
      >
        <LogOut size={14} /> Sair
      </button>
    );
  }
}

// ---------------------------------------------------------------------------
// Renda mensal
// ---------------------------------------------------------------------------
function RendaSection({ initialIncome }: { initialIncome: number }) {
  const router = useRouter();
  const supabase = createClient();
  const [income, setIncome] = useState(initialIncome ? String(initialIncome) : "");
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const numericIncome = parseFloat(income.replace(",", ".")) || 0;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").upsert({ id: user.id, monthly_income: numericIncome });
    }
    setSaving(false);
    router.refresh();
  }

  return (
    <section className="rounded-card bg-white border border-moss-200 p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Wallet size={16} className="text-moss-700" />
        <h2 className="font-body font-semibold text-sm text-ink-900">Renda mensal</h2>
      </div>
      <form onSubmit={handleSave} className="flex gap-2">
        <input
          value={income}
          onChange={(e) => setIncome(e.target.value)}
          inputMode="decimal"
          placeholder="6200,00"
          className="flex-1 rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-moss-500 disabled:bg-moss-200 text-white font-body font-semibold text-sm px-4"
        >
          Salvar
        </button>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Despesas fixas
// ---------------------------------------------------------------------------
function DespesasFixasSection({ expenses }: { expenses: FixedExpense[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("moradia");
  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [isEssential, setIsEssential] = useState(true);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const numericAmount = parseFloat(amount.replace(",", ".")) || 0;
    if (!name || numericAmount <= 0) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("fixed_expenses").insert({
      user_id: user.id,
      name,
      category,
      amount: numericAmount,
      due_day: dueDay ? Number(dueDay) : null,
      is_essential: isEssential,
    });

    setName("");
    setAmount("");
    setDueDay("");
    setIsEssential(true);
    setFormOpen(false);
    router.refresh();
  }

  async function handleRemove(id: string) {
    await supabase.from("fixed_expenses").update({ active: false }).eq("id", id);
    router.refresh();
  }

  return (
    <section className="rounded-card bg-white border border-moss-200 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Home size={16} className="text-moss-700" />
          <h2 className="font-body font-semibold text-sm text-ink-900">Despesas fixas</h2>
        </div>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="flex items-center gap-1 text-moss-700 font-body text-xs font-semibold"
        >
          <Plus size={14} /> Adicionar
        </button>
      </div>

      <ul className="space-y-1.5 mb-2">
        {expenses.map((item) => (
          <li key={item.id} className="flex items-center justify-between text-sm text-ink-600 font-body">
            <span>
              {item.name}
              {item.is_essential && <span className="text-moss-700 text-xs ml-1">· essencial</span>}
            </span>
            <span className="flex items-center gap-2">
              {formatBRL(item.amount)}
              <button onClick={() => handleRemove(item.id)} aria-label="Remover">
                <Trash2 size={13} className="text-ink-400" />
              </button>
            </span>
          </li>
        ))}
        {expenses.length === 0 && (
          <li className="font-body text-xs text-ink-400">Nenhuma despesa fixa cadastrada ainda.</li>
        )}
      </ul>

      {formOpen && (
        <form onSubmit={handleAdd} className="space-y-2 pt-2 border-t border-moss-200">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome (ex: Aluguel)"
            className="w-full rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
            >
              {FIXED_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="Valor (R$)"
              className="rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
              required
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              type="number"
              min={1}
              max={31}
              placeholder="Dia venc."
              className="w-28 rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
            />
            <label className="flex items-center gap-1.5 font-body text-xs text-ink-600">
              <input
                type="checkbox"
                checked={isEssential}
                onChange={(e) => setIsEssential(e.target.checked)}
              />
              Despesa essencial
            </label>
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-moss-500 text-white font-body font-semibold text-sm py-2"
          >
            Salvar despesa
          </button>
        </form>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dívidas externas (empréstimos, financiamentos...)
// ---------------------------------------------------------------------------
function DividasExternasSection({ debts }: { debts: ExternalDebt[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [formOpen, setFormOpen] = useState(false);
  const [creditorName, setCreditorName] = useState("");
  const [debtType, setDebtType] = useState("emprestimo_pessoal");
  const [originalPrincipal, setOriginalPrincipal] = useState("");
  const [currentBalance, setCurrentBalance] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [installmentsTotal, setInstallmentsTotal] = useState("");
  const [dueDay, setDueDay] = useState("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const numericBalance = parseFloat(currentBalance.replace(",", ".")) || 0;
    if (!creditorName || numericBalance <= 0) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("external_debts").insert({
      user_id: user.id,
      creditor_name: creditorName,
      debt_type: debtType,
      original_principal: parseFloat(originalPrincipal.replace(",", ".")) || numericBalance,
      current_balance: numericBalance,
      interest_rate_monthly: (parseFloat(interestRate.replace(",", ".")) || 0) / 100,
      installment_amount: installmentAmount ? parseFloat(installmentAmount.replace(",", ".")) : null,
      installments_total: installmentsTotal ? Number(installmentsTotal) : null,
      due_day: dueDay ? Number(dueDay) : null,
    });

    setCreditorName("");
    setOriginalPrincipal("");
    setCurrentBalance("");
    setInterestRate("");
    setInstallmentAmount("");
    setInstallmentsTotal("");
    setDueDay("");
    setFormOpen(false);
    router.refresh();
  }

  async function handleStatusChange(id: string, status: string) {
    await supabase.from("external_debts").update({ status }).eq("id", id);
    router.refresh();
  }

  async function handleDelete(id: string) {
    await supabase.from("external_debts").delete().eq("id", id);
    router.refresh();
  }

  return (
    <section className="rounded-card bg-white border border-moss-200 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Landmark size={16} className="text-moss-700" />
          <h2 className="font-body font-semibold text-sm text-ink-900">Dívidas externas</h2>
        </div>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="flex items-center gap-1 text-moss-700 font-body text-xs font-semibold"
        >
          <Plus size={14} /> Adicionar
        </button>
      </div>

      <ul className="space-y-2 mb-2">
        {debts.map((debt) => (
          <li key={debt.id} className="rounded-lg bg-base-100 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-body font-semibold text-sm text-ink-900">{debt.creditor_name}</p>
                <p className="font-body text-xs text-ink-400">
                  {formatBRL(debt.current_balance)} · {(debt.interest_rate_monthly * 100).toFixed(1)}% a.m.
                </p>
              </div>
              <button onClick={() => handleDelete(debt.id)} aria-label="Remover">
                <Trash2 size={14} className="text-ink-400" />
              </button>
            </div>
            <select
              value={debt.status}
              onChange={(e) => handleStatusChange(debt.id, e.target.value)}
              className="mt-2 rounded-lg border border-moss-200 px-2 py-1 font-body text-xs"
            >
              {DEBT_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </li>
        ))}
        {debts.length === 0 && (
          <li className="font-body text-xs text-ink-400">Nenhuma dívida externa cadastrada ainda.</li>
        )}
      </ul>

      {formOpen && (
        <form onSubmit={handleAdd} className="space-y-2 pt-2 border-t border-moss-200">
          <input
            value={creditorName}
            onChange={(e) => setCreditorName(e.target.value)}
            placeholder="Credor (ex: Caixa)"
            className="w-full rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
            required
          />
          <select
            value={debtType}
            onChange={(e) => setDebtType(e.target.value)}
            className="w-full rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
          >
            {DEBT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={currentBalance}
              onChange={(e) => setCurrentBalance(e.target.value)}
              inputMode="decimal"
              placeholder="Saldo devedor (R$)"
              className="rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
              required
            />
            <input
              value={originalPrincipal}
              onChange={(e) => setOriginalPrincipal(e.target.value)}
              inputMode="decimal"
              placeholder="Valor original (R$)"
              className="rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
              inputMode="decimal"
              placeholder="Juros % a.m."
              className="rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
            />
            <input
              value={installmentAmount}
              onChange={(e) => setInstallmentAmount(e.target.value)}
              inputMode="decimal"
              placeholder="Parcela (R$)"
              className="rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={installmentsTotal}
              onChange={(e) => setInstallmentsTotal(e.target.value)}
              type="number"
              min={1}
              placeholder="Nº parcelas"
              className="rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
            />
            <input
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              type="number"
              min={1}
              max={31}
              placeholder="Dia venc."
              className="rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-moss-500 text-white font-body font-semibold text-sm py-2"
          >
            Salvar dívida
          </button>
        </form>
      )}
    </section>
  );
}
