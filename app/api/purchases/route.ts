// app/api/purchases/route.ts
//
// Implementa a regra de negócio central do módulo de cartões:
//   1. Cria a linha em `purchases` com o valor TOTAL (isso já é o que abate o
//      limite disponível, via a função get_card_available_limit no banco).
//   2. Para cada parcela, encontra ou cria a `invoice` do mês correspondente
//      e insere a `transaction` daquela parcela, vinculada a essa invoice.
//   3. O limite é liberado automaticamente parcela a parcela pelo trigger
//      `release_limit_on_invoice_paid` quando cada fatura é marcada como paga.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function firstDayOfMonth(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { cardId, description, category, totalAmount, installments, purchaseDate, startingInstallment } =
    await req.json();

  if (!cardId || !description || !totalAmount || !installments || !purchaseDate) {
    return NextResponse.json({ error: "Campos obrigatórios ausentes." }, { status: 400 });
  }

  // Para itens importados de PDF que já estão no meio de um parcelamento
  // (ex: fatura mostra "3/10"), `purchaseDate` é a data DESTA ocorrência, e
  // `startingInstallment` (>1) evita recriar as parcelas 1 e 2, já cobradas
  // em faturas anteriores não importadas.
  const startIndex = Math.max((startingInstallment ?? 1) - 1, 0);

  // 1. Confere limite disponível no servidor (nunca confiar só na validação do client)
  const { data: card, error: cardError } = await supabase
    .from("cards")
    .select("id, credit_limit, closing_day, due_day")
    .eq("id", cardId)
    .single();

  if (cardError || !card) {
    return NextResponse.json({ error: "Cartão não encontrado." }, { status: 404 });
  }

  const { data: limitRows } = await supabase.rpc("get_card_available_limit", { p_card_id: cardId });
  const availableLimit = Array.isArray(limitRows) ? limitRows[0] : limitRows;

  if (availableLimit != null && totalAmount > availableLimit) {
    return NextResponse.json({ error: "Valor excede o limite disponível do cartão." }, { status: 422 });
  }

  // 2. Determina a fatura de origem (mês da compra, considerando fechamento)
  const purchase = new Date(purchaseDate);
  const dayOfMonth = purchase.getDate();
  // Se a compra ocorreu após o fechamento, ela cai na fatura do mês seguinte
  const firstInvoiceMonth =
    dayOfMonth > card.closing_day ? addMonths(purchase, 1) : purchase;

  const installmentValue = Number((totalAmount / installments).toFixed(2));

  // 3. Cria a compra "mãe"
  const { data: newPurchase, error: purchaseError } = await supabase
    .from("purchases")
    .insert({
      user_id: user.id,
      card_id: cardId,
      description,
      category: category ?? "outros",
      purchase_date: purchaseDate,
      total_amount: totalAmount,
      installments_total: installments,
      created_from: "manual",
    })
    .select()
    .single();

  if (purchaseError || !newPurchase) {
    return NextResponse.json({ error: "Erro ao criar a compra." }, { status: 500 });
  }

  // 4. Para cada parcela (a partir de startIndex), garante a invoice do mês e cria a transaction
  for (let i = startIndex; i < installments; i++) {
    const invoiceMonthDate = addMonths(firstInvoiceMonth, i - startIndex);
    const referenceMonth = firstDayOfMonth(invoiceMonthDate);

    // upsert manual: tenta achar a invoice do mês; cria se não existir
    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select("id")
      .eq("card_id", cardId)
      .eq("reference_month", referenceMonth)
      .maybeSingle();

    let invoiceId = existingInvoice?.id;

    if (!invoiceId) {
      const closingDate = new Date(invoiceMonthDate.getFullYear(), invoiceMonthDate.getMonth(), card.closing_day);
      const dueDate = new Date(invoiceMonthDate.getFullYear(), invoiceMonthDate.getMonth(), card.due_day);

      const { data: createdInvoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          user_id: user.id,
          card_id: cardId,
          reference_month: referenceMonth,
          closing_date: closingDate.toISOString().slice(0, 10),
          due_date: dueDate.toISOString().slice(0, 10),
          status: "aberta",
        })
        .select()
        .single();

      if (invoiceError || !createdInvoice) {
        return NextResponse.json(
          { error: `Erro ao criar fatura para ${referenceMonth}.` },
          { status: 500 }
        );
      }
      invoiceId = createdInvoice.id;
    }

    if (i === startIndex) {
      await supabase.from("purchases").update({ first_invoice_id: invoiceId }).eq("id", newPurchase.id);
    }

    const { error: transactionError } = await supabase.from("transactions").insert({
      user_id: user.id,
      purchase_id: newPurchase.id,
      invoice_id: invoiceId,
      installment_number: i + 1,
      amount:
        i === installments - 1
          ? Number((totalAmount - installmentValue * (installments - 1)).toFixed(2)) // ajusta centavos na última parcela
          : installmentValue,
    });

    if (transactionError) {
      return NextResponse.json({ error: `Erro ao lançar parcela ${i + 1}.` }, { status: 500 });
    }

    // Atualiza o total acumulado da invoice (soma incremental)
    await supabase.rpc("increment_invoice_total", {
      p_invoice_id: invoiceId,
      p_amount: i === installments - 1 ? totalAmount - installmentValue * (installments - 1) : installmentValue,
    });
  }

  return NextResponse.json({ purchase: newPurchase }, { status: 201 });
}
