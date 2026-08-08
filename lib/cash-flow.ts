// lib/cash-flow.ts
// Projeção dos próximos meses de comprometimento de renda, a partir de
// faturas de cartão já lançadas (invoices.total_amount) mais o valor mensal
// recorrente (despesas fixas + parcelas de dívidas externas).

export type MonthProjection = {
  month: string;
  income: number;
  committed: number;
};

export function buildCashFlowProjection({
  income,
  invoicesByMonth,
  recurringMonthly,
  monthsAhead = 6,
  startDate = new Date(),
}: {
  income: number;
  invoicesByMonth: { referenceMonth: string; totalAmount: number; status: string }[];
  recurringMonthly: number;
  monthsAhead?: number;
  startDate?: Date;
}): MonthProjection[] {
  const months: MonthProjection[] = [];

  for (let i = 0; i < monthsAhead; i++) {
    const monthDate = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
    const key = monthDate.toISOString().slice(0, 7); // "YYYY-MM"

    const invoicesTotal = invoicesByMonth
      .filter((inv) => inv.status !== "paga" && inv.referenceMonth.slice(0, 7) === key)
      .reduce((sum, inv) => sum + inv.totalAmount, 0);

    const rawLabel = monthDate.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
    const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);

    months.push({
      month: label,
      income,
      committed: invoicesTotal + recurringMonthly,
    });
  }

  return months;
}
