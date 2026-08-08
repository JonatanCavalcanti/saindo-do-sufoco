"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Plus, X, AlertOctagon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CARD_MINIMUM_PAYMENT_RATE } from "@/lib/rescue-plan";
import { useToast } from "@/components/Toast";

// ---------------------------------------------------------------------------
// Tipos — espelham public.cards e o resultado de public.get_card_available_limit
// ---------------------------------------------------------------------------
type Card = {
  id: string;
  nickname: string;
  brand: string;
  creditLimit: number;
  usedLimit: number; // soma das transactions não pagas (calculado no backend)
  closingDay: number;
  dueDay: number;
  revolvingInterestRate: number; // ex: 0.145 = 14,5% a.m.
  currentInvoiceTotal: number; // total da fatura do mês corrente (vem de `invoices`)
};

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---------------------------------------------------------------------------
// Barra de limite — verde/âmbar/vermelho conforme % usado, sem gradientes
// chamativos: informação clara, tom calmo mesmo em situação crítica.
// ---------------------------------------------------------------------------
function LimiteBar({ used, total }: { used: number; total: number }) {
  const pct = Math.min((used / total) * 100, 100);
  const tone = pct < 60 ? "bg-alert-sage" : pct < 85 ? "bg-alert-amber" : "bg-alert-brick";
  return (
    <div className="w-full h-2.5 rounded-full bg-base-200 overflow-hidden">
      <div
        className={`h-full ${tone} transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simulador de Perigo — mostra o custo real de pagar só o mínimo
// Fórmula simplificada de juros compostos do rotativo:
// saldo_devedor_mes2 = (fatura - pagamento_minimo) * (1 + taxa_rotativo)
// ---------------------------------------------------------------------------
function SimuladorPerigo({ card, invoiceTotal }: { card: Card; invoiceTotal: number }) {
  const minimumPayment = invoiceTotal * CARD_MINIMUM_PAYMENT_RATE;
  const remainingAfterMinimum = invoiceTotal - minimumPayment;
  const interestCharged = remainingAfterMinimum * card.revolvingInterestRate;
  const nextMonthBalance = remainingAfterMinimum + interestCharged;

  return (
    <div className="rounded-card bg-alert-brick/5 border border-alert-brick/30 p-4 mt-3">
      <div className="flex items-center gap-2 mb-2">
        <AlertOctagon size={16} className="text-alert-brick" />
        <h4 className="font-body font-semibold text-sm text-ink-900">
          Se você pagar só o mínimo este mês
        </h4>
      </div>
      <div className="space-y-1.5 font-body text-sm text-ink-600">
        <div className="flex justify-between">
          <span>Pagamento mínimo (~{(CARD_MINIMUM_PAYMENT_RATE * 100).toFixed(0)}%)</span>
          <span className="font-semibold text-ink-900">{formatBRL(minimumPayment)}</span>
        </div>
        <div className="flex justify-between">
          <span>Fica no rotativo</span>
          <span>{formatBRL(remainingAfterMinimum)}</span>
        </div>
        <div className="flex justify-between">
          <span>Juros do rotativo ({(card.revolvingInterestRate * 100).toFixed(1)}% a.m.)</span>
          <span className="text-alert-brick">+ {formatBRL(interestCharged)}</span>
        </div>
        <div className="flex justify-between pt-1.5 border-t border-alert-brick/20 font-semibold">
          <span>Nova dívida no mês seguinte</span>
          <span className="text-alert-brick">{formatBRL(nextMonthBalance)}</span>
        </div>
      </div>
      <p className="font-body text-xs text-ink-400 mt-2">
        Isso equivale a {(((nextMonthBalance - remainingAfterMinimum) / remainingAfterMinimum) * 100).toFixed(1)}%
        de juros só neste mês. Considere o Plano de Resgate antes de deixar no rotativo.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulário de compra parcelada
// Regra de negócio central do módulo: ao confirmar, o valor TOTAL abate o
// limite disponível imediatamente; as parcelas são distribuídas nas faturas
// futuras (isso é feito no backend, ver POST /api/purchases mais abaixo).
// ---------------------------------------------------------------------------
function NovaCompraForm({
  card,
  availableLimit,
  onClose,
  onSubmit,
  error,
  submitting,
}: {
  card: Card;
  availableLimit: number;
  onClose: () => void;
  onSubmit: (data: { description: string; totalAmount: number; installments: number; purchaseDate: string }) => void;
  error?: string | null;
  submitting?: boolean;
}) {
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [installments, setInstallments] = useState(1);
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));

  const numericTotal = parseFloat(totalAmount.replace(",", ".")) || 0;
  const installmentValue = installments > 0 ? numericTotal / installments : 0;
  const exceedsLimit = numericTotal > availableLimit;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description || numericTotal <= 0 || exceedsLimit) return;
    onSubmit({ description, totalAmount: numericTotal, installments, purchaseDate });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white rounded-t-card p-5 pb-8 space-y-4 animate-[slideUp_0.25s_ease]"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-ink-900">Nova compra parcelada</h3>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-ink-400">
            <X size={20} />
          </button>
        </div>
        <p className="font-body text-xs text-ink-400">{card.nickname}</p>

        <div>
          <label className="font-body text-xs text-ink-600">Descrição</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Geladeira nova"
            className="w-full mt-1 rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-body text-xs text-ink-600">Valor total (R$)</label>
            <input
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              inputMode="decimal"
              placeholder="1200,00"
              className="w-full mt-1 rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
              required
            />
          </div>
          <div>
            <label className="font-body text-xs text-ink-600">Parcelas</label>
            <input
              type="number"
              min={1}
              max={24}
              value={installments}
              onChange={(e) => setInstallments(Number(e.target.value))}
              className="w-full mt-1 rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
            />
          </div>
        </div>

        <div>
          <label className="font-body text-xs text-ink-600">Data da compra</label>
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className="w-full mt-1 rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
          />
        </div>

        {numericTotal > 0 && (
          <div className="rounded-lg bg-base-100 p-3 font-body text-sm text-ink-600">
            <div className="flex justify-between">
              <span>{installments}x de</span>
              <span className="font-semibold text-ink-900">{formatBRL(installmentValue)}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span>Limite disponível após a compra</span>
              <span className={exceedsLimit ? "text-alert-brick font-semibold" : "text-moss-700"}>
                {formatBRL(availableLimit - numericTotal)}
              </span>
            </div>
          </div>
        )}

        {exceedsLimit && (
          <p className="font-body text-xs text-alert-brick flex items-center gap-1">
            <AlertOctagon size={14} /> Essa compra ultrapassa o limite disponível do cartão.
          </p>
        )}

        {error && (
          <p className="font-body text-xs text-alert-brick flex items-center gap-1">
            <AlertOctagon size={14} /> {error}
          </p>
        )}

        <button
          type="submit"
          disabled={exceedsLimit || !description || numericTotal <= 0 || submitting}
          className="w-full rounded-lg bg-moss-500 disabled:bg-moss-200 text-white font-body font-semibold py-3"
        >
          {submitting ? "Salvando…" : "Confirmar compra"}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulário de novo cartão
// ---------------------------------------------------------------------------
function NovoCartaoForm({
  onClose,
  onSubmit,
  submitting,
}: {
  onClose: () => void;
  onSubmit: (data: {
    nickname: string;
    brand: string;
    creditLimit: number;
    closingDay: number;
    dueDay: number;
    revolvingInterestRate: number;
  }) => void;
  submitting?: boolean;
}) {
  const [nickname, setNickname] = useState("");
  const [brand, setBrand] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [closingDay, setClosingDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [interestRate, setInterestRate] = useState("");

  const numericLimit = parseFloat(creditLimit.replace(",", ".")) || 0;
  const isValid =
    nickname && numericLimit > 0 && Number(closingDay) >= 1 && Number(closingDay) <= 31 &&
    Number(dueDay) >= 1 && Number(dueDay) <= 31;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    onSubmit({
      nickname,
      brand,
      creditLimit: numericLimit,
      closingDay: Number(closingDay),
      dueDay: Number(dueDay),
      revolvingInterestRate: (parseFloat(interestRate.replace(",", ".")) || 0) / 100,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white rounded-t-card p-5 pb-8 space-y-4 animate-[slideUp_0.25s_ease]"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-ink-900">Novo cartão</h3>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-ink-400">
            <X size={20} />
          </button>
        </div>

        <div>
          <label className="font-body text-xs text-ink-600">Apelido</label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Ex: Nubank Roxinho"
            className="w-full mt-1 rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-body text-xs text-ink-600">Bandeira</label>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Visa, Mastercard..."
              className="w-full mt-1 rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
            />
          </div>
          <div>
            <label className="font-body text-xs text-ink-600">Limite total (R$)</label>
            <input
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              inputMode="decimal"
              placeholder="3500,00"
              className="w-full mt-1 rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="font-body text-xs text-ink-600">Fecha dia</label>
            <input
              value={closingDay}
              onChange={(e) => setClosingDay(e.target.value)}
              type="number"
              min={1}
              max={31}
              className="w-full mt-1 rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
              required
            />
          </div>
          <div>
            <label className="font-body text-xs text-ink-600">Vence dia</label>
            <input
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              type="number"
              min={1}
              max={31}
              className="w-full mt-1 rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
              required
            />
          </div>
          <div>
            <label className="font-body text-xs text-ink-600">Juros rotativo %</label>
            <input
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
              inputMode="decimal"
              placeholder="14,5"
              className="w-full mt-1 rounded-lg border border-moss-200 px-3 py-2 font-body text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!isValid || submitting}
          className="w-full rounded-lg bg-moss-500 disabled:bg-moss-200 text-white font-body font-semibold py-3"
        >
          {submitting ? "Salvando…" : "Salvar cartão"}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal — lista de cartões
// ---------------------------------------------------------------------------
export default function CreditCardManager({ initialCards }: { initialCards: Card[] }) {
  const router = useRouter();
  const showToast = useToast();
  const [cards] = useState<Card[]>(initialCards);
  const [formOpenFor, setFormOpenFor] = useState<Card | null>(null);
  const [newCardFormOpen, setNewCardFormOpen] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [submittingPurchase, setSubmittingPurchase] = useState(false);
  const [submittingCard, setSubmittingCard] = useState(false);

  const availableLimits = useMemo(() => {
    const map: Record<string, number> = {};
    cards.forEach((c) => (map[c.id] = c.creditLimit - c.usedLimit));
    return map;
  }, [cards]);

  async function handleNewPurchase(
    card: Card,
    data: { description: string; totalAmount: number; installments: number; purchaseDate: string }
  ) {
    setSubmittingPurchase(true);
    setPurchaseError(null);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id, ...data }),
      });
      if (!res.ok) {
        const body = await res.json();
        setPurchaseError(body.error ?? "Erro ao lançar a compra.");
        return;
      }
      setFormOpenFor(null);
      showToast("Compra lançada com sucesso.");
      router.refresh();
    } catch {
      setPurchaseError("Erro de conexão ao lançar a compra.");
    } finally {
      setSubmittingPurchase(false);
    }
  }

  async function handleNewCard(data: {
    nickname: string;
    brand: string;
    creditLimit: number;
    closingDay: number;
    dueDay: number;
    revolvingInterestRate: number;
  }) {
    setSubmittingCard(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSubmittingCard(false);
      showToast("Sessão expirada — faça login novamente.", "error");
      return;
    }

    const { error } = await supabase.from("cards").insert({
      user_id: user.id,
      nickname: data.nickname,
      brand: data.brand || null,
      credit_limit: data.creditLimit,
      closing_day: data.closingDay,
      due_day: data.dueDay,
      revolving_interest_rate: data.revolvingInterestRate,
    });

    setSubmittingCard(false);
    if (error) {
      showToast("Erro ao adicionar cartão.", "error");
      return;
    }

    setNewCardFormOpen(false);
    showToast("Cartão adicionado.");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-base-50 pb-24 px-5 pt-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl text-ink-900">Seus cartões</h1>
        <button
          onClick={() => setNewCardFormOpen(true)}
          className="flex items-center gap-1 text-moss-700 font-body text-sm font-semibold"
        >
          <Plus size={16} /> Novo cartão
        </button>
      </div>

      {cards.length === 0 && (
        <p className="font-body text-sm text-ink-400 mb-4">
          Nenhum cartão cadastrado ainda. Toque em "Novo cartão" para começar.
        </p>
      )}

      <div className="space-y-3">
        {cards.map((card) => {
          const available = availableLimits[card.id];
          const isExpanded = expandedCard === card.id;
          const currentInvoiceTotal = card.currentInvoiceTotal;

          return (
            <div key={card.id} className="rounded-card bg-white border border-moss-200 p-4">
              <button
                className="w-full text-left"
                onClick={() => setExpandedCard(isExpanded ? null : card.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard size={18} className="text-moss-700" />
                    <div>
                      <p className="font-body font-semibold text-sm text-ink-900">{card.nickname}</p>
                      <p className="font-body text-xs text-ink-400">
                        {card.brand} · fecha dia {card.closingDay} · vence dia {card.dueDay}
                      </p>
                    </div>
                  </div>
                  <p className="font-display text-sm text-ink-900">{formatBRL(available)}</p>
                </div>

                <div className="mt-3">
                  <LimiteBar used={card.usedLimit} total={card.creditLimit} />
                  <div className="flex justify-between mt-1 font-body text-xs text-ink-400">
                    <span>{formatBRL(card.usedLimit)} usado</span>
                    <span>{formatBRL(card.creditLimit)} total</span>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-moss-200 space-y-3">
                  <button
                    onClick={() => setFormOpenFor(card)}
                    className="w-full flex items-center justify-center gap-2 rounded-lg border border-moss-500 text-moss-700 font-body font-semibold text-sm py-2.5"
                  >
                    <Plus size={16} /> Lançar compra parcelada
                  </button>
                  <SimuladorPerigo card={card} invoiceTotal={currentInvoiceTotal} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {formOpenFor && (
        <NovaCompraForm
          card={formOpenFor}
          availableLimit={availableLimits[formOpenFor.id]}
          onClose={() => {
            setFormOpenFor(null);
            setPurchaseError(null);
          }}
          onSubmit={(data) => handleNewPurchase(formOpenFor, data)}
          error={purchaseError}
          submitting={submittingPurchase}
        />
      )}

      {newCardFormOpen && (
        <NovoCartaoForm
          onClose={() => setNewCardFormOpen(false)}
          onSubmit={handleNewCard}
          submitting={submittingCard}
        />
      )}
    </main>
  );
}
