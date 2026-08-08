import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCardsWithAvailableLimit } from "@/lib/data/cards";
import { CARD_MINIMUM_PAYMENT_RATE, UnifiedDebt, EssentialExpense } from "@/lib/rescue-plan";
import RescuePlanClient from "@/components/RescuePlanClient";

export default async function RescuePlanPage() {
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

  const { data: essentialRows } = await supabase
    .from("fixed_expenses")
    .select("id,name,amount")
    .eq("user_id", user.id)
    .eq("is_essential", true)
    .eq("active", true);

  const essentialExpenses: EssentialExpense[] = essentialRows ?? [];

  const cards = await getCardsWithAvailableLimit(supabase, user.id);
  const cardDebts: UnifiedDebt[] = cards
    .map((c) => ({
      id: c.id,
      source: "cartao" as const,
      name: `${c.nickname} (rotativo)`,
      balance: c.usedLimit,
      monthlyRate: c.revolvingInterestRate,
      minimumPayment: c.usedLimit * CARD_MINIMUM_PAYMENT_RATE,
    }))
    .filter((d) => d.balance > 0);

  const { data: externalRows } = await supabase
    .from("external_debts")
    .select("id,creditor_name,current_balance,interest_rate_monthly,installment_amount")
    .eq("user_id", user.id)
    .eq("status", "ativa");

  const externalDebts: UnifiedDebt[] = (externalRows ?? []).map((d) => ({
    id: d.id,
    source: "emprestimo" as const,
    name: d.creditor_name,
    balance: d.current_balance,
    monthlyRate: d.interest_rate_monthly ?? 0,
    minimumPayment: d.installment_amount ?? 0,
  }));

  const debts = [...cardDebts, ...externalDebts];

  return <RescuePlanClient income={income} essentialExpenses={essentialExpenses} debts={debts} />;
}
