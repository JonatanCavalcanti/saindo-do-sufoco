"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Plus, Trash2, Pencil, Wallet, Home, Landmark, ChevronDown, ChevronUp, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

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

type DebtInstallment = {
  id: string;
  debt_id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  is_paid: boolean;
};

function formatDate(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

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
  installmentsByDebt,
}: {
  email: string;
  monthlyIncome: number;
  fixedExpenses: FixedExpense[];
  externalDebts: ExternalDebt[];
  installmentsByDebt: Record<string, DebtInstallment[]>;
}) {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-base-50 pb-24 px-5 pt-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl text-ink-900">Perfil</h1>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1 text-ink-400 font-body text-xs font-semibold"
        >
          <LogOut size={14} /> Sair
        </button>
      </div>
      <p className="font-body text-sm text-ink-400 mb-5">{email}</p>

      <RendaSection initialIncome={monthlyIncome} />
      <DespesasFixasSection expenses={fixedExpenses} />
      <DividasExternasSection debts={externalDebts} installmentsByDebt={installmentsByDebt} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Renda mensal
// ---------------------------------------------------------------------------
function RendaSection({ initialIncome }: { initialIncome: number }) {
  const router = useRouter();
  const supabase = createClient();
  const showToast = useToast();
  const [income, setIncome] = useState(initialIncome ? String(initialIncome) : "");
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const numericIncome = parseFloat(income.replace(",", ".")) || 0;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      showToast("Sessão expirada — faça login novamente.", "error");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, monthly_income: numericIncome });
    setSaving(false);
    if (error) {
      showToast("Erro ao salvar renda.", "error");
      return;
    }
    showToast("Renda atualizada.");
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
          {saving ? "Salvando…" : "Salvar"}
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
  const showToast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("moradia");
  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [isEssential, setIsEssential] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setCategory("moradia");
    setAmount("");
    setDueDay("");
    setIsEssential(true);
    setEditingId(null);
  }

  function openForNew() {
    resetForm();
    setFormOpen(true);
  }

  function toggleForm() {
    if (formOpen) {
      setFormOpen(false);
      resetForm();
    } else {
      openForNew();
    }
  }

  function openForEdit(item: FixedExpense) {
    setEditingId(item.id);
    setName(item.name);
    setCategory(item.category);
    setAmount(String(item.amount));
    setDueDay(item.due_day ? String(item.due_day) : "");
    setIsEssential(item.is_essential);
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numericAmount = parseFloat(amount.replace(",", ".")) || 0;
    if (!name || numericAmount <= 0) return;

    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      showToast("Sessão expirada — faça login novamente.", "error");
      return;
    }

    const payload = {
      name,
      category,
      amount: numericAmount,
      due_day: dueDay ? Number(dueDay) : null,
      is_essential: isEssential,
    };

    const { error } = editingId
      ? await supabase.from("fixed_expenses").update(payload).eq("id", editingId)
      : await supabase.from("fixed_expenses").insert({ user_id: user.id, ...payload });

    setSaving(false);
    if (error) {
      showToast(editingId ? "Erro ao salvar alterações." : "Erro ao adicionar despesa.", "error");
      return;
    }

    resetForm();
    setFormOpen(false);
    showToast(editingId ? "Despesa atualizada." : "Despesa adicionada.");
    router.refresh();
  }

  async function handleRemove(id: string, name: string) {
    if (!window.confirm(`Remover "${name}" das despesas fixas?`)) return;
    setRemovingId(id);
    const { error } = await supabase.from("fixed_expenses").update({ active: false }).eq("id", id);
    setRemovingId(null);
    if (error) {
      showToast("Erro ao remover despesa.", "error");
      return;
    }
    showToast("Despesa removida.");
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
          onClick={toggleForm}
          className="flex items-center gap-1 text-moss-700 font-body text-xs font-semibold"
        >
          {formOpen ? <X size={14} /> : <Plus size={14} />} {formOpen ? "Fechar" : "Adicionar"}
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
              <button onClick={() => openForEdit(item)} aria-label="Editar">
                <Pencil size={13} className="text-ink-400" />
              </button>
              <button
                onClick={() => handleRemove(item.id, item.name)}
                disabled={removingId === item.id}
                aria-label="Remover"
              >
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
        <form onSubmit={handleSubmit} className="space-y-2 pt-2 border-t border-moss-200">
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
            disabled={saving}
            className="w-full rounded-lg bg-moss-500 disabled:bg-moss-200 text-white font-body font-semibold text-sm py-2"
          >
            {saving ? "Salvando…" : editingId ? "Salvar alterações" : "Salvar despesa"}
          </button>
        </form>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dívidas externas (empréstimos, financiamentos...)
// ---------------------------------------------------------------------------
function DividasExternasSection({
  debts,
  installmentsByDebt,
}: {
  debts: ExternalDebt[];
  installmentsByDebt: Record<string, DebtInstallment[]>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const showToast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);
  const [creditorName, setCreditorName] = useState("");
  const [debtType, setDebtType] = useState("emprestimo_pessoal");
  const [originalPrincipal, setOriginalPrincipal] = useState("");
  const [currentBalance, setCurrentBalance] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [installmentsTotal, setInstallmentsTotal] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function resetDebtForm() {
    setCreditorName("");
    setDebtType("emprestimo_pessoal");
    setOriginalPrincipal("");
    setCurrentBalance("");
    setInterestRate("");
    setInstallmentAmount("");
    setInstallmentsTotal("");
    setDueDay("");
    setEditingId(null);
  }

  function toggleForm() {
    if (formOpen) {
      setFormOpen(false);
      resetDebtForm();
    } else {
      resetDebtForm();
      setFormOpen(true);
    }
  }

  function openForEdit(debt: ExternalDebt) {
    setEditingId(debt.id);
    setCreditorName(debt.creditor_name);
    setDebtType(debt.debt_type);
    setOriginalPrincipal(String(debt.original_principal));
    setCurrentBalance(String(debt.current_balance));
    setInterestRate(String(debt.interest_rate_monthly * 100));
    setInstallmentAmount(debt.installment_amount ? String(debt.installment_amount) : "");
    setInstallmentsTotal(debt.installments_total ? String(debt.installments_total) : "");
    setDueDay(debt.due_day ? String(debt.due_day) : "");
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numericBalance = parseFloat(currentBalance.replace(",", ".")) || 0;
    if (!creditorName || numericBalance <= 0) return;

    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      showToast("Sessão expirada — faça login novamente.", "error");
      return;
    }

    const payload = {
      creditor_name: creditorName,
      debt_type: debtType,
      original_principal: parseFloat(originalPrincipal.replace(",", ".")) || numericBalance,
      current_balance: numericBalance,
      interest_rate_monthly: (parseFloat(interestRate.replace(",", ".")) || 0) / 100,
      installment_amount: installmentAmount ? parseFloat(installmentAmount.replace(",", ".")) : null,
      installments_total: installmentsTotal ? Number(installmentsTotal) : null,
      due_day: dueDay ? Number(dueDay) : null,
    };

    const { error } = editingId
      ? await supabase.from("external_debts").update(payload).eq("id", editingId)
      : await supabase.from("external_debts").insert({ user_id: user.id, ...payload });

    setSaving(false);
    if (error) {
      showToast(editingId ? "Erro ao salvar alterações." : "Erro ao adicionar dívida.", "error");
      return;
    }

    resetDebtForm();
    setFormOpen(false);
    showToast(editingId ? "Dívida atualizada." : "Dívida adicionada.");
    router.refresh();
  }

  async function handleStatusChange(id: string, status: string) {
    setBusyId(id);
    const { error } = await supabase.from("external_debts").update({ status }).eq("id", id);
    setBusyId(null);
    if (error) {
      showToast("Erro ao atualizar status.", "error");
      return;
    }
    showToast("Status atualizado.");
    router.refresh();
  }

  async function handleDelete(id: string, creditorName: string) {
    if (!window.confirm(`Remover a dívida com "${creditorName}"?`)) return;
    setBusyId(id);
    const { error } = await supabase.from("external_debts").delete().eq("id", id);
    setBusyId(null);
    if (error) {
      showToast("Erro ao remover dívida.", "error");
      return;
    }
    showToast("Dívida removida.");
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
          onClick={toggleForm}
          className="flex items-center gap-1 text-moss-700 font-body text-xs font-semibold"
        >
          {formOpen ? <X size={14} /> : <Plus size={14} />} {formOpen ? "Fechar" : "Adicionar"}
        </button>
      </div>

      <ul className="space-y-2 mb-2">
        {debts.map((debt) => {
          const isExpanded = expandedDebtId === debt.id;
          const installments = installmentsByDebt[debt.id] ?? [];
          return (
            <li key={debt.id} className="rounded-lg bg-base-100 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-body font-semibold text-sm text-ink-900">{debt.creditor_name}</p>
                  <p className="font-body text-xs text-ink-400">
                    {formatBRL(debt.current_balance)} · {(debt.interest_rate_monthly * 100).toFixed(1)}% a.m.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openForEdit(debt)} aria-label="Editar">
                    <Pencil size={14} className="text-ink-400" />
                  </button>
                  <button
                    onClick={() => handleDelete(debt.id, debt.creditor_name)}
                    disabled={busyId === debt.id}
                    aria-label="Remover"
                  >
                    <Trash2 size={14} className="text-ink-400" />
                  </button>
                </div>
              </div>
              <select
                value={debt.status}
                onChange={(e) => handleStatusChange(debt.id, e.target.value)}
                disabled={busyId === debt.id}
                className="mt-2 rounded-lg border border-moss-200 px-2 py-1 font-body text-xs"
              >
                {DEBT_STATUS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>

              <button
                onClick={() => setExpandedDebtId(isExpanded ? null : debt.id)}
                className="w-full flex items-center justify-between mt-2 pt-2 border-t border-moss-200 font-body text-xs text-moss-700 font-semibold"
              >
                <span>
                  Parcelas cadastradas{installments.length > 0 ? ` (${installments.length})` : ""}
                </span>
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {isExpanded && (
                <ParcelasDaDivida
                  debtId={debt.id}
                  installments={installments}
                  supabase={supabase}
                  showToast={showToast}
                  onChanged={() => router.refresh()}
                />
              )}
            </li>
          );
        })}
        {debts.length === 0 && (
          <li className="font-body text-xs text-ink-400">Nenhuma dívida externa cadastrada ainda.</li>
        )}
      </ul>

      {formOpen && (
        <form onSubmit={handleSubmit} className="space-y-2 pt-2 border-t border-moss-200">
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
            disabled={saving}
            className="w-full rounded-lg bg-moss-500 disabled:bg-moss-200 text-white font-body font-semibold text-sm py-2"
          >
            {saving ? "Salvando…" : editingId ? "Salvar alterações" : "Salvar dívida"}
          </button>
        </form>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cronograma de parcelas de uma dívida — número, valor e vencimento próprios
// (financiamentos com parcelas variáveis: entrada de imóvel, obra...)
// ---------------------------------------------------------------------------
function ParcelasDaDivida({
  debtId,
  installments,
  supabase,
  showToast,
  onChanged,
}: {
  debtId: string;
  installments: DebtInstallment[];
  supabase: ReturnType<typeof createClient>;
  showToast: (message: string, type?: "success" | "error") => void;
  onChanged: () => void;
}) {
  const [number, setNumber] = useState(String(installments.length + 1));
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function resetForm() {
    setNumber(String(installments.length + 1));
    setAmount("");
    setDueDate(new Date().toISOString().slice(0, 10));
    setEditingId(null);
  }

  function openForEdit(inst: DebtInstallment) {
    setEditingId(inst.id);
    setNumber(String(inst.installment_number));
    setAmount(String(inst.amount));
    setDueDate(inst.due_date);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numericAmount = parseFloat(amount.replace(",", ".")) || 0;
    if (numericAmount <= 0 || !dueDate) return;

    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      showToast("Sessão expirada — faça login novamente.", "error");
      return;
    }

    const payload = {
      installment_number: Number(number) || installments.length + 1,
      amount: numericAmount,
      due_date: dueDate,
    };

    const { error } = editingId
      ? await supabase.from("debt_installments").update(payload).eq("id", editingId)
      : await supabase.from("debt_installments").insert({ user_id: user.id, debt_id: debtId, ...payload });

    setSaving(false);
    if (error) {
      showToast(editingId ? "Erro ao salvar parcela." : "Erro ao adicionar parcela.", "error");
      return;
    }

    resetForm();
    showToast(editingId ? "Parcela atualizada." : "Parcela adicionada.");
    onChanged();
  }

  async function handleTogglePaid(installment: DebtInstallment) {
    setBusyId(installment.id);
    const { error } = await supabase
      .from("debt_installments")
      .update({ is_paid: !installment.is_paid })
      .eq("id", installment.id);
    setBusyId(null);
    if (error) {
      showToast("Erro ao atualizar parcela.", "error");
      return;
    }
    onChanged();
  }

  async function handleRemove(installmentId: string) {
    setBusyId(installmentId);
    const { error } = await supabase.from("debt_installments").delete().eq("id", installmentId);
    setBusyId(null);
    if (error) {
      showToast("Erro ao remover parcela.", "error");
      return;
    }
    showToast("Parcela removida.");
    onChanged();
  }

  return (
    <div className="mt-2 pt-2 space-y-2">
      {installments.length === 0 && (
        <p className="font-body text-xs text-ink-400">Nenhuma parcela cadastrada ainda.</p>
      )}
      <ul className="space-y-1">
        {installments.map((inst) => (
          <li key={inst.id} className="flex items-center justify-between font-body text-xs">
            <button
              onClick={() => handleTogglePaid(inst)}
              disabled={busyId === inst.id}
              className={`flex items-center gap-1.5 ${inst.is_paid ? "text-moss-700" : "text-ink-600"}`}
            >
              <span
                className={`flex items-center justify-center w-4 h-4 rounded-full border ${
                  inst.is_paid ? "bg-moss-500 border-moss-500" : "border-moss-200"
                }`}
              >
                {inst.is_paid && <Check size={10} className="text-white" />}
              </span>
              Parcela {inst.installment_number} · {formatDate(inst.due_date)}
            </button>
            <span className="flex items-center gap-2">
              <span className={inst.is_paid ? "text-ink-400 line-through" : "text-ink-900"}>
                {formatBRL(inst.amount)}
              </span>
              <button onClick={() => openForEdit(inst)} aria-label="Editar parcela">
                <Pencil size={12} className="text-ink-400" />
              </button>
              <button
                onClick={() => handleRemove(inst.id)}
                disabled={busyId === inst.id}
                aria-label="Remover parcela"
              >
                <Trash2 size={12} className="text-ink-400" />
              </button>
            </span>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="grid grid-cols-3 gap-1.5 pt-1">
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          type="number"
          min={1}
          placeholder="Nº"
          className="rounded-lg border border-moss-200 px-2 py-1.5 font-body text-xs"
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="Valor"
          className="rounded-lg border border-moss-200 px-2 py-1.5 font-body text-xs"
        />
        <input
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          type="date"
          className="rounded-lg border border-moss-200 px-2 py-1.5 font-body text-xs"
        />
        <button
          type="submit"
          disabled={saving}
          className={`rounded-lg bg-moss-500 disabled:bg-moss-200 text-white font-body text-xs font-semibold py-1.5 ${
            editingId ? "col-span-2" : "col-span-3"
          }`}
        >
          {saving ? "Salvando…" : editingId ? "Salvar parcela" : "Adicionar parcela"}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={resetForm}
            className="rounded-lg border border-moss-200 text-ink-600 font-body text-xs font-semibold py-1.5"
          >
            Cancelar
          </button>
        )}
      </form>
    </div>
  );
}
