"use client";

import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// ---------------------------------------------------------------------------
// Em produção: agrupar `transactions` (não pagas) por `invoices.reference_month`
// + parcelas futuras de `external_debts` + `fixed_expenses` recorrentes.
// Aqui: gera 6 meses de exemplo com parcelas decrescendo (comportamento típico
// de quem já não está fazendo novas compras parceladas).
// ---------------------------------------------------------------------------
type MonthProjection = {
  month: string;
  income: number;
  committed: number; // soma de parcelas de cartão + empréstimos + fixas essenciais
};

function buildMockProjection(): MonthProjection[] {
  const monthNames = ["Ago", "Set", "Out", "Nov", "Dez", "Jan"];
  const baseCommitted = [4890, 4610, 4200, 3800, 3800, 3210];
  return monthNames.map((month, i) => ({
    month,
    income: 6200,
    committed: baseCommitted[i],
  }));
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const committed = payload.find((p: any) => p.dataKey === "committed")?.value ?? 0;
  const income = payload.find((p: any) => p.dataKey === "income")?.value ?? 0;
  const pct = ((committed / income) * 100).toFixed(0);
  return (
    <div className="bg-white border border-moss-200 rounded-lg px-3 py-2 shadow-sm">
      <p className="font-body text-xs font-semibold text-ink-900">{label}</p>
      <p className="font-body text-xs text-ink-600">Comprometido: {formatBRL(committed)}</p>
      <p className="font-body text-xs text-ink-400">{pct}% da renda</p>
    </div>
  );
}

export default function CashFlowProjection() {
  const data = useMemo(() => buildMockProjection(), []);

  return (
    <div className="rounded-card bg-white border border-moss-200 p-4">
      <h3 className="font-body font-semibold text-sm text-ink-900 mb-1">
        Projeção dos próximos 6 meses
      </h3>
      <p className="font-body text-xs text-ink-400 mb-3">
        Parcelas já assumidas em cartões, empréstimos e despesas fixas essenciais
      </p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="committedFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4C6B58" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#4C6B58" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#DCE4D8" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "#7C897F" }}
              axisLine={{ stroke: "#DCE4D8" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#7C897F" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="income"
              stroke="#C4D6C1"
              strokeDasharray="4 4"
              fill="none"
              strokeWidth={1.5}
            />
            <Area
              type="monotone"
              dataKey="committed"
              stroke="#4C6B58"
              strokeWidth={2}
              fill="url(#committedFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 mt-2 font-body text-xs text-ink-400">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-moss-500 inline-block" /> Comprometido
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-0.5 border-t-2 border-dashed border-moss-200 inline-block" /> Renda
        </span>
      </div>
    </div>
  );
}
