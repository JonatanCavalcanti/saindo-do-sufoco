"use client";

import { useMemo, useState } from "react";
import { CreditCard, Plus, X, AlertOctagon } from "lucide-react";

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
};

const MOCK_CARDS: Card[] = [
  {
    id: "card-1",
    nickname: "Nubank Roxinho",
    brand: "Mastercard",
    creditLimit: 3500,
    usedLimit: 2180,
    closingDay: 12,
    dueDay: 19,
    revolvingInterestRate: 0.145,
  },
  {
    id: "card-2",
    nickname: "Inter Black",
    brand: "Visa",
    creditLimit: 6000,
    usedLimit: 4950,
    closingDay: 5,
    dueDay: 12,
    revolvingInterestRate: 0.132,
  },
];

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
  const minimumPayment = invoiceTotal * 0.15; // heurística: mínimo ~15% (ajustável por cartão real)
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
          <span>Pagamento mínimo (~15%)</span>
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
}: {
  card: Card;
  availableLimit: number;
  onClose: () => void;
  onSubmit: (data: { description: string; totalAmount: number; installments: number; purchaseDate: string }) => void;
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

        <button
          type="submit"
          disabled={exceedsLimit || !description || numericTotal <= 0}
          className="w-full rounded-lg bg-moss-500 disabled:bg-moss-200 text-white font-body font-semibold py-3"
        >
          Confirmar compra
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal — lista de cartões
// ---------------------------------------------------------------------------
export default function CreditCardManager() {
  const [cards] = useState<Card[]>(MOCK_CARDS);
  const [formOpenFor, setFormOpenFor] = useState<Card | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const availableLimits = useMemo(() => {
    const map: Record<string, number> = {};
    cards.forEach((c) => (map[c.id] = c.creditLimit - c.usedLimit));
    return map;
  }, [cards]);

  // Em produção: POST /api/purchases → cria a linha em `purchases` e distribui
  // as N linhas em `transactions`, uma por fatura futura (ver schema.sql).
  function handleNewPurchase(
    card: Card,
    data: { description: string; totalAmount: number; installments: number; purchaseDate: string }
  ) {
    console.log("Enviar para /api/purchases", { cardId: card.id, ...data });
    setFormOpenFor(null);
  }

  return (
    <main className="min-h-screen bg-base-50 pb-24 px-5 pt-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl text-ink-900">Seus cartões</h1>
        <button className="flex items-center gap-1 text-moss-700 font-body text-sm font-semibold">
          <Plus size={16} /> Novo cartão
        </button>
      </div>

      <div className="space-y-3">
        {cards.map((card) => {
          const available = availableLimits[card.id];
          const isExpanded = expandedCard === card.id;
          // Fatura de exemplo do mês corrente — em produção vem de `invoices`
          const currentInvoiceTotal = card.usedLimit * 0.4;

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
          onClose={() => setFormOpenFor(null)}
          onSubmit={(data) => handleNewPurchase(formOpenFor, data)}
        />
      )}
    </main>
  );
}
