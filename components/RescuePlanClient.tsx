"use client";

import { useMemo, useState } from "react";
import { Shield, Snowflake, TrendingDown, HandCoins, ChevronRight } from "lucide-react";
import { buildRescuePlan, RescueMethod, UnifiedDebt, EssentialExpense } from "@/lib/rescue-plan";
import { simulateRenegotiation } from "@/lib/renegotiation";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function RescuePlanClient({
  income,
  essentialExpenses,
  debts,
}: {
  income: number;
  essentialExpenses: EssentialExpense[];
  debts: UnifiedDebt[];
}) {
  const [method, setMethod] = useState<RescueMethod>("avalanche");
  const [showRenegotiation, setShowRenegotiation] = useState<UnifiedDebt | null>(null);

  const plan = useMemo(
    () =>
      buildRescuePlan({
        income,
        essentialExpenses,
        debts,
        method,
      }),
    [income, essentialExpenses, debts, method]
  );

  return (
    <main className="min-h-screen bg-base-50 pb-24 px-5 pt-8">
      <div className="flex items-center gap-2 mb-1">
        <Shield size={20} className="text-moss-700" />
        <h1 className="font-display text-2xl text-ink-900">Plano de Resgate</h1>
      </div>
      <p className="font-body text-sm text-ink-400 mb-5">
        Primeiro protegemos o essencial. Depois, organizamos o resto para sair da dívida no menor
        tempo possível.
      </p>

      {/* Alerta crítico: nem o essencial cabe na renda */}
      {plan.shortfall > 0 && (
        <div className="rounded-card bg-alert-brick/10 border border-alert-brick/40 p-4 mb-4">
          <p className="font-body text-sm text-ink-900">
            <strong>Atenção:</strong> suas despesas essenciais ({formatBRL(plan.essentialReserve)})
            já superam sua renda em {formatBRL(plan.shortfall)}. Antes de pensar em dívidas, o
            passo 1 é buscar renda extra ou reduzir custo fixo — não há orçamento seguro para
            pagar dívida agora sem colocar em risco moradia ou alimentação.
          </p>
        </div>
      )}

      {/* Reserva essencial x disponível para dívidas */}
      <div className="rounded-card bg-white border border-moss-200 p-5 mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="font-body text-sm text-ink-600">Reserva para o essencial</span>
          <span className="font-body font-semibold text-sm text-ink-900">
            {formatBRL(plan.essentialReserve)}
          </span>
        </div>
        <div className="flex justify-between items-center mb-3">
          <span className="font-body text-sm text-ink-600">Disponível para dívidas</span>
          <span className="font-body font-semibold text-sm text-moss-700">
            {formatBRL(plan.availableForDebts)}
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-base-200 overflow-hidden flex">
          <div
            className="h-full bg-alert-amber"
            style={{ width: `${plan.income > 0 ? Math.min((plan.essentialReserve / plan.income) * 100, 100) : 0}%` }}
          />
          <div className="h-full bg-moss-500 flex-1" />
        </div>
      </div>

      {/* Seletor de método */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          onClick={() => setMethod("bola_de_neve")}
          className={`rounded-card border p-4 text-left transition ${
            method === "bola_de_neve" ? "border-moss-500 bg-moss-50" : "border-moss-200 bg-white"
          }`}
        >
          <Snowflake size={18} className="text-moss-700 mb-1" />
          <p className="font-body font-semibold text-sm text-ink-900">Bola de neve</p>
          <p className="font-body text-xs text-ink-400 mt-1">
            Quita primeiro a menor dívida. Vitórias rápidas, motivação em alta.
          </p>
        </button>
        <button
          onClick={() => setMethod("avalanche")}
          className={`rounded-card border p-4 text-left transition ${
            method === "avalanche" ? "border-moss-500 bg-moss-50" : "border-moss-200 bg-white"
          }`}
        >
          <TrendingDown size={18} className="text-moss-700 mb-1" />
          <p className="font-body font-semibold text-sm text-ink-900">Avalanche</p>
          <p className="font-body text-xs text-ink-400 mt-1">
            Ataca primeiro o maior juro. Menos dinheiro perdido no total.
          </p>
        </button>
      </div>

      {/* Projeção de quitação */}
      <div className="rounded-card bg-moss-50 border border-moss-200 p-4 mb-4 text-center">
        <p className="font-body text-xs text-ink-400">Com esse ritmo, você quita tudo em</p>
        <p className="font-display text-2xl text-moss-700">
          {plan.projectedPayoffMonths ? `${plan.projectedPayoffMonths} meses` : "— (orçamento não fecha)"}
        </p>
      </div>

      {/* Fila de prioridade */}
      <h2 className="font-display text-lg text-ink-900 mb-2 px-1">Ordem de ataque</h2>
      {plan.orderedDebts.length === 0 && (
        <p className="font-body text-sm text-ink-400 px-1">
          Nenhuma dívida cadastrada ainda — cadastre cartões e dívidas externas no seu Perfil.
        </p>
      )}
      <div className="space-y-2">
        {plan.orderedDebts.map((debt) => (
          <div key={debt.id} className="rounded-card bg-white border border-moss-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-moss-500 text-white font-body text-xs font-bold">
                  {debt.priority}
                </span>
                <div>
                  <p className="font-body font-semibold text-sm text-ink-900">{debt.name}</p>
                  <p className="font-body text-xs text-ink-400">
                    Saldo {formatBRL(debt.balance)} · {(debt.monthlyRate * 100).toFixed(1)}% a.m.
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-body text-xs text-ink-400">Pagar este mês</p>
                <p className="font-display text-sm text-moss-700">
                  {formatBRL(debt.suggestedPayment)}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowRenegotiation(debt)}
              className="w-full flex items-center justify-between mt-3 pt-3 border-t border-moss-200 font-body text-xs text-moss-700 font-semibold"
            >
              <span className="flex items-center gap-1.5">
                <HandCoins size={14} /> Simular proposta de renegociação
              </span>
              <ChevronRight size={14} />
            </button>
          </div>
        ))}
      </div>

      {showRenegotiation && (
        <RenegotiationModal debt={showRenegotiation} onClose={() => setShowRenegotiation(null)} />
      )}
    </main>
  );
}

function RenegotiationModal({ debt, onClose }: { debt: UnifiedDebt; onClose: () => void }) {
  const [monthsElapsed, setMonthsElapsed] = useState(6);
  const result = simulateRenegotiation({
    currentBalance: debt.balance,
    monthlyRateApplied: debt.monthlyRate,
    monthsElapsed,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40">
      <div className="w-full max-w-md bg-white rounded-t-card p-5 pb-8 space-y-4">
        <h3 className="font-display text-lg text-ink-900">Proposta para {debt.name}</h3>

        <div>
          <label className="font-body text-xs text-ink-600">
            Há quantos meses os juros vêm sendo aplicados?
          </label>
          <input
            type="range"
            min={1}
            max={36}
            value={monthsElapsed}
            onChange={(e) => setMonthsElapsed(Number(e.target.value))}
            className="w-full mt-2"
          />
          <p className="font-body text-xs text-ink-400 text-right">{monthsElapsed} meses</p>
        </div>

        <div className="rounded-lg bg-moss-50 p-4 space-y-2 font-body text-sm">
          <div className="flex justify-between">
            <span className="text-ink-600">Valor cobrado hoje</span>
            <span className="font-semibold text-ink-900">{formatBRL(debt.balance)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-600">Principal estimado (sem juros compostos)</span>
            <span className="font-semibold text-moss-700">{formatBRL(result.estimatedPrincipal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-600">Total já pago em juros</span>
            <span className="text-alert-brick">{formatBRL(result.totalInterestCharged)}</span>
          </div>
          <div className="pt-2 border-t border-moss-200">
            <p className="text-ink-600 mb-1">Faixa sugerida para proposta</p>
            <p className="font-display text-lg text-moss-700">
              {formatBRL(result.suggestedOfferLow)} – {formatBRL(result.suggestedOfferHigh)}
            </p>
          </div>
        </div>

        <p className="font-body text-xs text-ink-400">
          Estimativa educativa para apoiar sua conversa com o credor — não é parecer jurídico.
          Taxa anual equivalente atual: {result.effectiveAnnualRate.toFixed(0)}% a.a.
        </p>

        <button
          onClick={onClose}
          className="w-full rounded-lg bg-moss-500 text-white font-body font-semibold py-3"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
