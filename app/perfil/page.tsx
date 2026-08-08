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

  return (
    <PerfilManager
      email={user.email ?? ""}
      monthlyIncome={profile?.monthly_income ?? 0}
      fixedExpenses={fixedExpenses ?? []}
      externalDebts={externalDebts ?? []}
    />
  );
}
