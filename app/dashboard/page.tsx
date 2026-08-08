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
    .select("id,total_amount,status,cards(nickname)")
    .eq("user_id", user.id)
    .eq("reference_month", currentMonth)
    .neq("status", "paga");

  const { data: externalDebts } = await supabase
    .from("external_debts")
    .select("id,creditor_name,installment_amount")
    .eq("user_id", user.id)
    .eq("status", "ativa");

  const recurringDebts = [
    ...(openInvoices ?? []).map((inv: any) => ({
      id: inv.id,
      name: `Fatura ${inv.cards?.nickname ?? "cartão"}`,
      amount: inv.total_amount,
      type: "cartao" as const,
    })),
    ...(externalDebts ?? []).map((d) => ({
      id: d.id,
      name: d.creditor_name,
      amount: d.installment_amount ?? 0,
      type: "emprestimo" as const,
    })),
  ];

  // Projeção de fluxo de caixa: próximos 6 meses
  const sixMonthsOut = addMonthsISO(currentMonth, 6);
  const { data: futureInvoices } = await supabase
    .from("invoices")
    .select("reference_month,total_amount,status")
    .eq("user_id", user.id)
    .gte("reference_month", currentMonth)
    .lt("reference_month", sixMonthsOut);

  const recurringMonthly =
    (fixedRows ?? []).reduce((sum, r) => sum + r.amount, 0) +
    (externalDebts ?? []).reduce((sum, d) => sum + (d.installment_amount ?? 0), 0);

  const projection = buildCashFlowProjection({
    income,
    invoicesByMonth: (futureInvoices ?? []).map((inv) => ({
      referenceMonth: inv.reference_month,
      totalAmount: inv.total_amount,
      status: inv.status,
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
