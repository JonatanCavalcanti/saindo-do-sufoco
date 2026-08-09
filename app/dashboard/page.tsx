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

function parseSelectedMonth(param: string | undefined): string {
  if (param && /^\d{4}-\d{2}$/.test(param)) return `${param}-01`;
  return firstDayOfMonth(new Date());
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const selectedMonth = parseSelectedMonth(month);
  const todayMonth = firstDayOfMonth(new Date());

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

  // ---------------------------------------------------------------------
  // Resumo do mês selecionado (navegável — não necessariamente o mês atual)
  // ---------------------------------------------------------------------
  const { data: monthInvoices } = await supabase
    .from("invoices")
    .select("id,card_id,total_amount,status")
    .eq("user_id", user.id)
    .eq("reference_month", selectedMonth)
    .neq("status", "paga");

  const cardIds = [...new Set((monthInvoices ?? []).map((inv) => inv.card_id))];
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

  const externalDebtIds = (externalDebts ?? []).map((d) => d.id);
  const nextMonthAfterSelected = addMonthsISO(selectedMonth, 1);
  const { data: monthDebtInstallments } =
    externalDebtIds.length > 0
      ? await supabase
          .from("debt_installments")
          .select("debt_id,amount,due_date")
          .in("debt_id", externalDebtIds)
          .gte("due_date", selectedMonth)
          .lt("due_date", nextMonthAfterSelected)
      : { data: [] as { debt_id: string; amount: number; due_date: string }[] };

  const debtIdsWithScheduleThisMonth = new Set((monthDebtInstallments ?? []).map((i) => i.debt_id));

  function monthDebtAmount(debt: { id: string; installment_amount: number | null }) {
    if (debtIdsWithScheduleThisMonth.has(debt.id)) {
      return (monthDebtInstallments ?? [])
        .filter((i) => i.debt_id === debt.id)
        .reduce((sum, i) => sum + i.amount, 0);
    }
    return debt.installment_amount ?? 0;
  }

  const recurringDebts = [
    ...(monthInvoices ?? []).map((inv) => ({
      id: inv.id,
      name: `Fatura ${cardNicknameById[inv.card_id] ?? "cartão"}`,
      amount: inv.total_amount,
      type: "cartao" as const,
    })),
    ...(externalDebts ?? []).map((d) => ({
      id: d.id,
      name: d.creditor_name,
      amount: monthDebtAmount(d),
      type: "emprestimo" as const,
    })),
  ];

  // ---------------------------------------------------------------------
  // Projeção de fluxo de caixa: sempre os próximos 6 meses a partir de hoje,
  // independente do mês selecionado acima no resumo.
  // ---------------------------------------------------------------------
  const sixMonthsFromToday = addMonthsISO(todayMonth, 6);
  const { data: futureInvoices } = await supabase
    .from("invoices")
    .select("reference_month,total_amount,status")
    .eq("user_id", user.id)
    .gte("reference_month", todayMonth)
    .lt("reference_month", sixMonthsFromToday);

  const { data: futureDebtInstallments } =
    externalDebtIds.length > 0
      ? await supabase
          .from("debt_installments")
          .select("debt_id,amount,due_date")
          .in("debt_id", externalDebtIds)
          .eq("is_paid", false)
          .gte("due_date", todayMonth)
          .lt("due_date", sixMonthsFromToday)
      : { data: [] as { debt_id: string; amount: number; due_date: string }[] };

  const debtIdsWithAnyFutureSchedule = new Set((futureDebtInstallments ?? []).map((i) => i.debt_id));

  const recurringMonthly =
    (fixedRows ?? []).reduce((sum, r) => sum + r.amount, 0) +
    (externalDebts ?? [])
      .filter((d) => !debtIdsWithAnyFutureSchedule.has(d.id))
      .reduce((sum, d) => sum + (d.installment_amount ?? 0), 0);

  const projection = buildCashFlowProjection({
    income,
    invoicesByMonth: (futureInvoices ?? []).map((inv) => ({
      referenceMonth: inv.reference_month,
      totalAmount: inv.total_amount,
      status: inv.status,
    })),
    installmentsByMonth: (futureDebtInstallments ?? []).map((i) => ({
      dueDate: i.due_date,
      amount: i.amount,
    })),
    recurringMonthly,
  });

  return (
    <DashboardClient
      data={{ income, fixedExpenses, subscriptions, recurringDebts }}
      projection={projection}
      selectedMonth={selectedMonth}
    />
  );
}
