// app/api/parse-invoice/route.ts
//
// Fluxo: o client já fez upload do PDF para o bucket "invoice-pdfs" do
// Supabase Storage (via signed URL) e criou uma linha em `pdf_imports` com
// status "pendente". Esta rota:
//   1. Baixa o arquivo do Storage (server-side, suporta senha)
//   2. Extrai o texto com pdfjs-dist
//   3. Roda o parser adequado (lib/pdf-parsers)
//   4. Grava o rascunho em `pdf_imports.extracted_items` (status "aguardando_validacao")
//   5. Devolve os itens para a tela de validação — NADA é gravado em
//      `purchases`/`transactions` aqui.
//
// maxDuration estendido pois parsing de PDFs multi-página pode passar de 10s
// no plano Hobby da Vercel.
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { parseInvoiceText } from "@/lib/pdf-parsers";

// pdfjs-dist precisa do build "legacy" em ambiente Node serverless (sem DOM)
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

async function extractTextFromPdf(buffer: ArrayBuffer, password?: string): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({ data: buffer, password });
  const pdf = await loadingTask.promise;

  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(" ");
    fullText += pageText + "\n";
  }
  return fullText;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { pdfImportId, password } = await req.json();
  if (!pdfImportId) {
    return NextResponse.json({ error: "pdfImportId é obrigatório." }, { status: 400 });
  }

  // Usa service role para baixar do Storage sem depender de policy de leitura
  // pública no bucket (o bucket "invoice-pdfs" deve ser privado).
  const serviceClient = createServiceRoleClient();

  const { data: importRow, error: importError } = await serviceClient
    .from("pdf_imports")
    .select("*")
    .eq("id", pdfImportId)
    .eq("user_id", user.id) // garante que o usuário só acessa o próprio import
    .single();

  if (importError || !importRow) {
    return NextResponse.json({ error: "Import não encontrado." }, { status: 404 });
  }

  await serviceClient
    .from("pdf_imports")
    .update({ status: "processando" })
    .eq("id", pdfImportId);

  try {
    const { data: fileBlob, error: downloadError } = await serviceClient.storage
      .from("invoice-pdfs")
      .download(importRow.storage_path);

    if (downloadError || !fileBlob) throw new Error("Falha ao baixar o PDF do Storage.");

    const buffer = await fileBlob.arrayBuffer();
    const rawText = await extractTextFromPdf(buffer, password);

    if (!rawText.trim()) {
      // Texto vazio geralmente indica PDF escaneado (imagem) — sinaliza para
      // o client oferecer o caminho de OCR como próximo passo, sem tentar
      // adivinhar aqui.
      await serviceClient
        .from("pdf_imports")
        .update({
          status: "erro",
          error_message:
            "Não foi possível extrair texto do PDF. Ele pode ser uma imagem escaneada — tente o modo OCR.",
        })
        .eq("id", pdfImportId);
      return NextResponse.json(
        { error: "PDF sem texto extraível, possivelmente escaneado." },
        { status: 422 }
      );
    }

    const { bank, items } = parseInvoiceText(rawText);

    await serviceClient
      .from("pdf_imports")
      .update({
        status: "aguardando_validacao",
        extracted_items: items,
      })
      .eq("id", pdfImportId);

    return NextResponse.json({ bank, items });
  } catch (err: any) {
    console.error("Erro em /api/parse-invoice:", err?.message, err?.stack);
    const message = err?.message?.includes("password")
      ? "PDF protegido por senha incorreta ou não informada."
      : "Erro ao processar o PDF.";

    await serviceClient
      .from("pdf_imports")
      .update({ status: "erro", error_message: message })
      .eq("id", pdfImportId);

    return NextResponse.json({ error: message }, { status: 422 });
  }
}
