// app/api/invoices/[id]/pay/route.ts
//
// Marca a fatura como paga. O trigger `release_limit_on_invoice_paid` (schema.sql)
// cuida de marcar as transactions vinculadas como pagas, o que automaticamente
// libera o limite dessas parcelas em get_card_available_limit.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { paymentType, amountPaid } = await req.json();
  // paymentType: 'total' | 'minimo' | 'parcial' | 'rotativo'

  const { data: updated, error } = await supabase
    .from("invoices")
    .update({
      status: "paga",
      payment_type: paymentType ?? "total",
      amount_paid: amountPaid,
    })
    .eq("id", id)
    .select()
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Erro ao registrar pagamento da fatura." }, { status: 500 });
  }

  return NextResponse.json({ invoice: updated });
}
