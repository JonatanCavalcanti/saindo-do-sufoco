"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Home, Repeat, Landmark, AlertTriangle, Info, ChevronRight } from "lucide-react";
import CashFlowProjection from "@/components/CashFlowProjection";
import type { MonthProjection } from "@/lib/cash-flow";

type FixedExpense = { id: string; name: string; category: string; amount: number };
type RecurringDebt = { id: string; name: string; amount: number; type: "cartao" | "emprestimo" };

type DashboardData = {
  income: number;
  fixedExpenses: FixedExpense[];
  subscriptions: FixedExpense[];
  recurringDebts: RecurringDebt[];
};

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---------------------------------------------------------------------------
// Elemento-assinatura do dashboard: "Anel do Alívio"
// Mostra visualmente o % da renda já comprometido — a métrica mais importante
// para quem está em sufoco financeiro. A cor e a respiração (animação sutil)
// comunicam o nível de aperto sem usar linguagem alarmista.
// ---------------------------------------------------------------------------
function AnelDoAlivio({ committedPct }: { committedPct: number }) {
  const clamped = Math.min(committedPct, 100);
  const circumference = 2 * Math.PI * 70;
  const offset = circumference - (clamped / 100) * circumference;

  const tone =
    clamped < 50 ? "text-alert-sage" : clamped < 80 ? "text-alert-amber" : "text-alert-brick";
  const label = clamped < 50 ? "Respirando bem" : clamped < 80 ? "Atenção ao ritmo" : "Sufoco alto";

  return (
    <div className="relative flex flex-col items-center justify-center animate-breathe">
      <svg width="180" height="180" viewBox="0 0 180 180" className="-rotate-90">
        <circle cx="90" cy="90" r="70" stroke="#DCE4D8" strokeWidth="14" fill="none" />
        <circle
          cx="90"
          cy="90"
          r="70"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={tone}
          stroke="currentColor"
          style={{ transition: "stroke-dashoffset 700ms ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-4xl text-ink-900">{clamped.toFixed(0)}%</span>
        <span className={`font-body text-xs font-semibold ${tone}`}>{label}</span>
      </div>
    </div>
  );
}

function RecurringBlock({
  icon,
  title,
  items,
  total,
}: {
  icon: React.ReactNode;
  title: string;
  items: { id: string; name: string; amount: number; href?: string }[];
  total: number;
}) {
  return (
    <div className="rounded-card bg-white/70 border border-moss-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-ink-900">
          {icon}
          <h3 className="font-body font-semibold text-sm">{title}</h3>
        </div>
        <span className="font-body text-sm font-semibold text-moss-700">{formatBRL(total)}</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item) =>
          item.href ? (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex justify-between items-center text-sm text-ink-600 font-body"
              >
                <span className="flex items-center gap-1">
                  {item.name}
                  <ChevronRight size={12} className="text-ink-400" />
                </span>
                <span>{formatBRL(item.amount)}</span>
              </Link>
            </li>
          ) : (
            <li key={item.id} className="flex justify-between text-sm text-ink-600 font-body">
              <span>{item.name}</span>
              <span>{formatBRL(item.amount)}</span>
            </li>
          )
        )}
        {items.length === 0 && (
          <li className="text-sm text-ink-400 font-body">Nada cadastrado ainda.</li>
        )}
      </ul>
    </div>
  );
}

export default function DashboardClient({
  data,
  projection,
}: {
  data: DashboardData;
  projection: MonthProjection[];
}) {
  const [privacyMode, setPrivacyMode] = useState(false);

  const totalFixed = useMemo(
    () => data.fixedExpenses.reduce((s, e) => s + e.amount, 0),
    [data.fixedExpenses]
  );
  const totalSubs = useMemo(
    () => data.subscriptions.reduce((s, e) => s + e.amount, 0),
    [data.subscriptions]
  );
  const totalDebts = useMemo(
    () => data.recurringDebts.reduce((s, d) => s + d.amount, 0),
    [data.recurringDebts]
  );
  const totalExpenses = totalFixed + totalSubs + totalDebts;
  const netBalance = data.income - totalExpenses;
  const committedPct = data.income > 0 ? (totalExpenses / data.income) * 100 : 0;

  // Alerta inteligente: dispara quando o comprometimento passa de 70%
  // (referência comum em recuperação de crédito para sinal de alerta)
  const showCommitmentAlert = committedPct >= 70;

  const mask = (formatted: string) => (privacyMode ? "R$ ••••" : formatted);

  return (
    <main className="min-h-screen bg-base-50 pb-24">
      {/* Cabeçalho */}
      <header className="px-5 pt-8 pb-4 flex items-center justify-between">
        <div>
          <p className="font-body text-sm text-ink-400">Boa tarde,</p>
          <h1 className="font-display text-2xl text-ink-900">Como está sua respiração financeira?</h1>
        </div>
        <button
          onClick={() => setPrivacyMode((v) => !v)}
          aria-label={privacyMode ? "Mostrar valores" : "Ocultar valores"}
          className="p-2 rounded-full bg-white border border-moss-200 text-ink-600"
        >
          {privacyMode ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </header>

      {/* Resumo mensal + Anel do Alívio */}
      <section className="px-5">
        <div className="rounded-card bg-white p-6 border border-moss-200 flex flex-col items-center">
          <AnelDoAlivio committedPct={committedPct} />
          <p className="font-body text-xs text-ink-400 mt-2 text-center">
            % da sua renda já comprometido com despesas e dívidas
          </p>

          <div className="grid grid-cols-2 gap-4 w-full mt-6">
            <div className="text-center">
              <p className="font-body text-xs text-ink-400">Receita total</p>
              <p className="font-display text-lg text-moss-700">{mask(formatBRL(data.income))}</p>
            </div>
            <div className="text-center">
              <p className="font-body text-xs text-ink-400">Despesas totais</p>
              <p className="font-display text-lg text-alert-brick">{mask(formatBRL(totalExpenses))}</p>
            </div>
          </div>

          <div className="w-full mt-4 pt-4 border-t border-moss-200 text-center">
            <p className="font-body text-xs text-ink-400">Saldo líquido do mês</p>
            <p
              className={`font-display text-2xl ${
                netBalance >= 0 ? "text-moss-700" : "text-alert-brick"
              }`}
            >
              {mask(formatBRL(netBalance))}
            </p>
          </div>
        </div>
      </section>

      {/* Alerta inteligente */}
      {showCommitmentAlert && (
        <section className="px-5 mt-4">
          <div className="rounded-card bg-alert-amber/10 border border-alert-amber/40 p-4 flex gap-3">
            <AlertTriangle className="text-alert-amber shrink-0 mt-0.5" size={20} />
            <p className="font-body text-sm text-ink-900">
              <strong>{committedPct.toFixed(0)}% da sua renda</strong> já está comprometida este mês.
              Acima de 70% é sinal de alerta — vale abrir o{" "}
              <span className="underline underline-offset-2">Plano de Resgate</span> para reorganizar
              as prioridades antes de assumir novos compromissos.
            </p>
          </div>
        </section>
      )}

      {/* Custos recorrentes */}
      <section className="px-5 mt-6 space-y-3">
        <h2 className="font-display text-lg text-ink-900 px-1">Seus compromissos recorrentes</h2>
        <RecurringBlock
          icon={<Home size={16} />}
          title="Despesas fixas"
          items={data.fixedExpenses}
          total={totalFixed}
        />
        <RecurringBlock
          icon={<Repeat size={16} />}
          title="Assinaturas e serviços"
          items={data.subscriptions}
          total={totalSubs}
        />
        <RecurringBlock
          icon={<Landmark size={16} />}
          title="Dívidas e empréstimos"
          items={data.recurringDebts.map((d) => ({
            ...d,
            href: d.type === "cartao" ? "/cartoes" : undefined,
          }))}
          total={totalDebts}
        />
      </section>

      {/* Projeção de fluxo de caixa */}
      <section className="px-5 mt-6">
        <CashFlowProjection data={projection} />
      </section>

      {/* Dica didática do assistente */}
      <section className="px-5 mt-4">
        <div className="rounded-card bg-moss-50 border border-moss-200 p-4 flex gap-3">
          <Info className="text-moss-700 shrink-0 mt-0.5" size={18} />
          <p className="font-body text-sm text-ink-600">
            Pagar apenas o mínimo da fatura parece aliviar agora, mas os juros rotativos do cartão
            costumam superar 400% ao ano. Toque em um cartão para ver o simulador de perigo antes de
            decidir.
          </p>
        </div>
      </section>
    </main>
  );
}
