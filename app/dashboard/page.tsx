import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardClient from "@/components/DashboardClient";
import { buildCashFlowProjection } from "@/lib/cash-flow";

function firstDayOfMonth(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

function addMonthsISO(referenceMonth: string, months: number): string {
  const d = new Date(referenceMonth);
  d.setMonth(d.getMonth() + months);
  return firstDayOfMonth(d);
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("monthly_income")
    .eq("id", user.id)
    .maybeSingle();

  const income = profile?.monthly_income ?? 0;

  const { data: fixedRows } = await supabase
    .from("fixed_expenses")
    .select("id,name,category,amount")
    .eq("user_id", user.id)
    .eq("active", true);

  const fixedExpenses = (fixedRows ?? []).filter((r) => r.category !== "assinatura");
  const subscriptions = (fixedRows ?? []).filter((r) => r.category === "assinatura");

  const currentMonth = firstDayOfMonth(new Date());

  const { data: openInvoices } = await supabase
    .from("invoices")
    .select("id,card_id,total_amount,status")
    .eq("user_id", user.id)
    .eq("reference_month", currentMonth)
    .neq("status", "paga");

  const cardIds = [...new Set((openInvoices ?? []).map((inv) => inv.card_id))];
  const { data: invoiceCards } =
    cardIds.length > 0
      ? await supabase.from("cards").select("id,nickname").in("id", cardIds)
      : { data: [] as { id: string; nickname: string }[] };
  const cardNicknameById = Object.fromEntries(
    (invoiceCards ?? []).map((c) => [c.id, c.nickname])
  );

  const { data: externalDebts } = await supabase
    .from("external_debts")
    .select("id,creditor_name,installment_amount")
    .eq("user_id", user.id)
    .eq("status", "ativa");

  // Dívidas com cronograma próprio (debt_installments) usam o valor real da
  // parcela do mês em vez do installment_amount fixo — algumas dívidas
  // (financiamento com entrada, evolução de obra) têm parcela de valor
  // variável mês a mês, que o campo fixo não representa.
  const sixMonthsOut = addMonthsISO(currentMonth, 6);
  const externalDebtIds = (externalDebts ?? []).map((d) => d.id);
  const { data: debtInstallments } =
    externalDebtIds.length > 0
      ? await supabase
          .from("debt_installments")
          .select("debt_id,amount,due_date")
          .in("debt_id", externalDebtIds)
          .eq("is_paid", false)
          .gte("due_date", currentMonth)
          .lt("due_date", sixMonthsOut)
      : { data: [] as { debt_id: string; amount: number; due_date: string }[] };

  const debtIdsWithSchedule = new Set((debtInstallments ?? []).map((i) => i.debt_id));

  function currentMonthDebtAmount(debt: { id: string; installment_amount: number | null }) {
    if (debtIdsWithSchedule.has(debt.id)) {
      return (debtInstallments ?? [])
        .filter((i) => i.debt_id === debt.id && i.due_date.slice(0, 7) === currentMonth.slice(0, 7))
        .reduce((sum, i) => sum + i.amount, 0);
    }
    return debt.installment_amount ?? 0;
  }

  const recurringDebts = [
    ...(openInvoices ?? []).map((inv) => ({
      id: inv.id,
      name: `Fatura ${cardNicknameById[inv.card_id] ?? "cartão"}`,
      amount: inv.total_amount,
      type: "cartao" as const,
    })),
    ...(externalDebts ?? []).map((d) => ({
      id: d.id,
      name: d.creditor_name,
      amount: currentMonthDebtAmount(d),
      type: "emprestimo" as const,
    })),
  ];

  // Projeção de fluxo de caixa: próximos 6 meses
  const { data: futureInvoices } = await supabase
    .from("invoices")
    .select("reference_month,total_amount,status")
    .eq("user_id", user.id)
    .gte("reference_month", currentMonth)
    .lt("reference_month", sixMonthsOut);

  const recurringMonthly =
    (fixedRows ?? []).reduce((sum, r) => sum + r.amount, 0) +
    (externalDebts ?? [])
      .filter((d) => !debtIdsWithSchedule.has(d.id))
      .reduce((sum, d) => sum + (d.installment_amount ?? 0), 0);

  const projection = buildCashFlowProjection({
    income,
    invoicesByMonth: (futureInvoices ?? []).map((inv) => ({
      referenceMonth: inv.reference_month,
      totalAmount: inv.total_amount,
      status: inv.status,
    })),
    installmentsByMonth: (debtInstallments ?? []).map((i) => ({
      dueDate: i.due_date,
      amount: i.amount,
    })),
    recurringMonthly,
  });

  return (
    <DashboardClient
      data={{ income, fixedExpenses, subscriptions, recurringDebts }}
      projection={projection}
    />
  );
}
