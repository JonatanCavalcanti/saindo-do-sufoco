import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCardsWithAvailableLimit } from "@/lib/data/cards";
import CreditCardManager from "@/components/CreditCardManager";

function firstDayOfMonth(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

export default async function CartoesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const cards = await getCardsWithAvailableLimit(supabase, user.id);
  const currentMonth = firstDayOfMonth(new Date());

  const initialCards = await Promise.all(
    cards.map(async (c) => {
      const { data: invoice } = await supabase
        .from("invoices")
        .select("total_amount")
        .eq("card_id", c.id)
        .eq("reference_month", currentMonth)
        .maybeSingle();

      return {
        id: c.id,
        nickname: c.nickname,
        brand: c.brand ?? "",
        creditLimit: c.creditLimit,
        usedLimit: c.usedLimit,
        closingDay: c.closingDay,
        dueDay: c.dueDay,
        revolvingInterestRate: c.revolvingInterestRate,
        currentInvoiceTotal: invoice?.total_amount ?? 0,
      };
    })
  );

  return <CreditCardManager initialCards={initialCards} />;
}
