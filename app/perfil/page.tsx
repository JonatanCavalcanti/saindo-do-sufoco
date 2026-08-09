import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PerfilManager from "@/components/PerfilManager";

export default async function PerfilPage() {
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

  const { data: fixedExpenses } = await supabase
    .from("fixed_expenses")
    .select("id,name,category,amount,due_day,is_essential")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at", { ascending: false });

  const { data: externalDebts } = await supabase
    .from("external_debts")
    .select(
      "id,creditor_name,debt_type,original_principal,current_balance,interest_rate_monthly,installment_amount,installments_total,due_day,status"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  type InstallmentRow = {
    id: string;
    debt_id: string;
    installment_number: number;
    amount: number;
    due_date: string;
    is_paid: boolean;
  };

  const debtIds = (externalDebts ?? []).map((d) => d.id);
  const { data: installmentRows } =
    debtIds.length > 0
      ? await supabase
          .from("debt_installments")
          .select("id,debt_id,installment_number,amount,due_date,is_paid")
          .in("debt_id", debtIds)
          .order("installment_number")
      : { data: [] as InstallmentRow[] };

  const installmentsByDebt: Record<string, InstallmentRow[]> = {};
  for (const row of (installmentRows ?? []) as InstallmentRow[]) {
    (installmentsByDebt[row.debt_id] ??= []).push(row);
  }

  return (
    <PerfilManager
      email={user.email ?? ""}
      monthlyIncome={profile?.monthly_income ?? 0}
      fixedExpenses={fixedExpenses ?? []}
      externalDebts={externalDebts ?? []}
      installmentsByDebt={installmentsByDebt}
    />
  );
}
