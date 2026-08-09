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
  installmentsByMonth = [],
  recurringMonthly,
  monthsAhead = 6,
  startDate = new Date(),
}: {
  income: number;
  invoicesByMonth: { referenceMonth: string; totalAmount: number; status: string }[];
  // Parcelas de dívidas com cronograma próprio (debt_installments) — cada uma
  // conta só no mês do seu vencimento, ao contrário de `recurringMonthly` que
  // se repete todo mês (usado pra dívidas com parcela fixa simples).
  installmentsByMonth?: { dueDate: string; amount: number }[];
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

    const installmentsTotal = installmentsByMonth
      .filter((inst) => inst.dueDate.slice(0, 7) === key)
      .reduce((sum, inst) => sum + inst.amount, 0);

    const rawLabel = monthDate.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
    const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);

    months.push({
      month: label,
      income,
      committed: invoicesTotal + installmentsTotal + recurringMonthly,
    });
  }

  return months;
}
