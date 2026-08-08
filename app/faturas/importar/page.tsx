"use client";

import { useEffect, useState } from "react";
import { UploadCloud, FileText, Check, AlertTriangle, Trash2, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ParsedItem } from "@/lib/pdf-parsers";

type ImportStatus = "idle" | "enviando" | "processando" | "validando" | "salvando" | "concluido" | "erro";

type DraftItem = ParsedItem & { included: boolean };

type CardOption = { id: string; nickname: string };

export default function ImportarFaturaPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [pdfImportId, setPdfImportId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cardOptions, setCardOptions] = useState<CardOption[]>([]);
  const [selectedCardId, setSelectedCardId] = useState("");

  const supabase = createClient();

  useEffect(() => {
    supabase
      .from("cards")
      .select("id,nickname")
      .eq("active", true)
      .then(({ data }) => {
        if (data) {
          setCardOptions(data);
          if (data.length > 0) setSelectedCardId(data[0].id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) setFiles(Array.from(e.target.files));
  }

  async function handleUploadAndParse() {
    if (files.length === 0) return;
    setStatus("enviando");
    setErrorMessage(null);

    try {
      const file = files[0]; // suporte multi-arquivo: repetir este fluxo por arquivo, em paralelo
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado.");

      const storagePath = `${user.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("invoice-pdfs")
        .upload(storagePath, file);
      if (uploadError) throw uploadError;

      const { data: importRow, error: insertError } = await supabase
        .from("pdf_imports")
        .insert({
          user_id: user.id,
          card_id: selectedCardId || null,
          file_name: file.name,
          storage_path: storagePath,
        })
        .select()
        .single();
      if (insertError || !importRow) throw insertError ?? new Error("Falha ao registrar import.");

      setPdfImportId(importRow.id);
      setStatus("processando");

      const res = await fetch("/api/parse-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfImportId: importRow.id, password: password || undefined }),
      });

      if (res.status === 422) {
        const body = await res.json();
        if (body.error?.toLowerCase().includes("senha")) {
          setNeedsPassword(true);
          setStatus("idle");
          return;
        }
        throw new Error(body.error);
      }
      if (!res.ok) throw new Error("Falha ao processar o PDF.");

      const { items: parsedItems } = await res.json();
      setItems(parsedItems.map((i: ParsedItem) => ({ ...i, included: true })));
      setStatus("validando");
    } catch (err: any) {
      setErrorMessage(err.message ?? "Erro inesperado ao importar a fatura.");
      setStatus("erro");
    }
  }

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  async function handleConfirm() {
    if (!selectedCardId) {
      setErrorMessage("Selecione o cartão desta fatura antes de confirmar.");
      setStatus("erro");
      return;
    }
    setStatus("salvando");
    try {
      const toSave = items.filter((i) => i.included);

      // Loop sequencial (não Promise.all): evita duas requisições concorrentes
      // disputarem a lógica de "achar/criar invoice do mês" na mesma rota.
      for (const item of toSave) {
        const installmentsTotal = item.installmentTotal ?? 1;
        const res = await fetch("/api/purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cardId: selectedCardId,
            description: item.description,
            totalAmount: item.amount * installmentsTotal,
            installments: installmentsTotal,
            purchaseDate: item.date ?? new Date().toISOString().slice(0, 10),
            startingInstallment: item.installmentCurrent ?? 1,
          }),
        });
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error ?? "Erro ao salvar um dos itens.");
        }
      }

      if (pdfImportId) {
        await supabase.from("pdf_imports").update({ status: "importado" }).eq("id", pdfImportId);
      }

      setStatus("concluido");
    } catch (err: any) {
      setErrorMessage(err.message ?? "Erro ao salvar os itens confirmados.");
      setStatus("erro");
    }
  }

  return (
    <main className="min-h-screen bg-base-50 pb-24 px-5 pt-8">
      <h1 className="font-display text-2xl text-ink-900 mb-1">Importar fatura em PDF</h1>
      <p className="font-body text-sm text-ink-400 mb-5">
        Envie o PDF da fatura e confira os itens antes de salvar — nada é gravado automaticamente.
      </p>

      {status === "idle" && (
        <div className="space-y-4">
          <div>
            <label className="font-body text-xs text-ink-600">Cartão desta fatura</label>
            {cardOptions.length === 0 ? (
              <p className="font-body text-xs text-ink-400 mt-1">
                Nenhum cartão cadastrado ainda — cadastre um em "Cartões" antes de importar.
              </p>
            ) : (
              <select
                value={selectedCardId}
                onChange={(e) => setSelectedCardId(e.target.value)}
                className="w-full mt-1 rounded-lg border border-moss-200 px-3 py-2 font-body text-sm bg-white"
              >
                {cardOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nickname}
                  </option>
                ))}
              </select>
            )}
          </div>

          <label className="flex flex-col items-center justify-center rounded-card border-2 border-dashed border-moss-200 bg-white p-8 cursor-pointer">
            <UploadCloud className="text-moss-500 mb-2" size={28} />
            <span className="font-body text-sm text-ink-600 text-center">
              Toque para selecionar um ou mais PDFs de fatura
            </span>
            <input type="file" accept="application/pdf" multiple className="hidden" onChange={handleFileSelect} />
          </label>

          {files.length > 0 && (
            <ul className="space-y-1.5">
              {files.map((f) => (
                <li key={f.name} className="flex items-center gap-2 font-body text-sm text-ink-600">
                  <FileText size={14} /> {f.name}
                </li>
              ))}
            </ul>
          )}

          {needsPassword && (
            <div className="flex items-center gap-2 bg-alert-amber/10 border border-alert-amber/40 rounded-lg px-3 py-2">
              <Lock size={16} className="text-alert-amber shrink-0" />
              <input
                type="password"
                placeholder="Senha do PDF (geralmente CPF)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 bg-transparent font-body text-sm outline-none"
              />
            </div>
          )}

          <button
            onClick={handleUploadAndParse}
            disabled={files.length === 0 || !selectedCardId}
            className="w-full rounded-lg bg-moss-500 disabled:bg-moss-200 text-white font-body font-semibold py-3"
          >
            Enviar e extrair itens
          </button>
        </div>
      )}

      {(status === "enviando" || status === "processando") && (
        <div className="flex flex-col items-center py-16">
          <div className="w-10 h-10 border-4 border-moss-200 border-t-moss-500 rounded-full animate-spin" />
          <p className="font-body text-sm text-ink-400 mt-4">
            {status === "enviando" ? "Enviando arquivo..." : "Lendo os itens da fatura..."}
          </p>
        </div>
      )}

      {status === "validando" && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-alert-amber" />
            <p className="font-body text-xs text-ink-600">
              Confira cada item antes de confirmar. Itens com baixa confiança estão destacados.
            </p>
          </div>

          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                key={index}
                className={`rounded-card bg-white border p-3 ${
                  item.confidence === "baixa" ? "border-alert-amber" : "border-moss-200"
                } ${!item.included ? "opacity-40" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(index, { description: e.target.value })}
                    className="flex-1 font-body text-sm font-semibold text-ink-900 bg-transparent outline-none"
                  />
                  <button onClick={() => updateItem(index, { included: !item.included })} aria-label="Remover item">
                    <Trash2 size={15} className="text-ink-400" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <input
                    type="date"
                    value={item.date ?? ""}
                    onChange={(e) => updateItem(index, { date: e.target.value })}
                    className="font-body text-xs border border-moss-200 rounded px-2 py-1"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={item.amount}
                    onChange={(e) => updateItem(index, { amount: Number(e.target.value) })}
                    className="font-body text-xs border border-moss-200 rounded px-2 py-1"
                  />
                  <input
                    value={
                      item.installmentCurrent && item.installmentTotal
                        ? `${item.installmentCurrent}/${item.installmentTotal}`
                        : "à vista"
                    }
                    readOnly
                    className="font-body text-xs border border-moss-200 rounded px-2 py-1 text-ink-400"
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleConfirm}
            className="w-full mt-4 flex items-center justify-center gap-2 rounded-lg bg-moss-500 text-white font-body font-semibold py-3"
          >
            <Check size={16} /> Confirmar e salvar {items.filter((i) => i.included).length} itens
          </button>
        </div>
      )}

      {status === "salvando" && (
        <div className="flex flex-col items-center py-16">
          <div className="w-10 h-10 border-4 border-moss-200 border-t-moss-500 rounded-full animate-spin" />
          <p className="font-body text-sm text-ink-400 mt-4">Salvando itens confirmados...</p>
        </div>
      )}

      {status === "concluido" && (
        <div className="flex flex-col items-center py-16 text-center">
          <Check className="text-moss-500 mb-2" size={32} />
          <p className="font-display text-lg text-ink-900">Fatura importada!</p>
          <p className="font-body text-sm text-ink-400 mt-1">
            Os itens já aparecem no seu cartão e na projeção de fluxo de caixa.
          </p>
        </div>
      )}

      {status === "erro" && (
        <div className="rounded-card bg-alert-brick/10 border border-alert-brick/40 p-4">
          <p className="font-body text-sm text-ink-900">{errorMessage}</p>
          <button
            onClick={() => setStatus("idle")}
            className="mt-3 font-body text-sm font-semibold text-moss-700"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </main>
  );
}
