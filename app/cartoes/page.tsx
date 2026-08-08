import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCardsWithAvailableLimit } from "@/lib/data/cards";
import CreditCardManager from "@/components/CreditCardManager";

function firstDayOfMonth(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

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
      const { data: invoiceRow } = await supabase
        .from("invoices")
        .select("id,reference_month,closing_date,due_date,status,total_amount")
        .eq("card_id", c.id)
        .eq("reference_month", currentMonth)
        .maybeSingle();

      let invoice = null;
      if (invoiceRow) {
        const { data: transactions } = await supabase
          .from("transactions")
          .select("id,amount,installment_number,purchases(description,installments_total)")
          .eq("invoice_id", invoiceRow.id)
          .order("created_at");

        invoice = {
          monthLabel: MONTH_LABELS[new Date(invoiceRow.reference_month).getMonth()],
          closingDate: invoiceRow.closing_date,
          dueDate: invoiceRow.due_date,
          status: invoiceRow.status,
          totalAmount: invoiceRow.total_amount,
          items: (transactions ?? []).map((t: any) => ({
            id: t.id,
            description: t.purchases?.description ?? "Compra",
            amount: t.amount,
            installmentCurrent: t.installment_number,
            installmentTotal: t.purchases?.installments_total ?? 1,
          })),
        };
      }

      return {
        id: c.id,
        nickname: c.nickname,
        brand: c.brand ?? "",
        creditLimit: c.creditLimit,
        usedLimit: c.usedLimit,
        closingDay: c.closingDay,
        dueDay: c.dueDay,
        revolvingInterestRate: c.revolvingInterestRate,
        currentInvoiceTotal: invoice?.totalAmount ?? 0,
        invoice,
      };
    })
  );

  return <CreditCardManager initialCards={initialCards} />;
}
