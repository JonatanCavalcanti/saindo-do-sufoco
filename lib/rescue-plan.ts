// lib/rescue-plan.ts
//
// Algoritmo do "Plano de Resgate". Regra de ouro do superendividamento:
// NUNCA comprometer despesas essenciais de sobrevivência para pagar dívida.
// Por isso o cálculo sempre reserva o essencial primeiro, e só then distribui
// o que sobrar entre as dívidas, ordenadas pelo método escolhido.

// Heurística de pagamento mínimo de fatura de cartão (~15% do valor), usada
// tanto no simulador de perigo (CreditCardManager) quanto aqui ao montar o
// UnifiedDebt de dívidas de cartão — mesmo número, um único lugar.
export const CARD_MINIMUM_PAYMENT_RATE = 0.15;

export type DebtSource = "cartao" | "emprestimo";

export type UnifiedDebt = {
  id: string;
  source: DebtSource;
  name: string;
  balance: number;          // saldo devedor atual
  monthlyRate: number;      // taxa de juros mensal (decimal, ex: 0.145)
  minimumPayment: number;   // pagamento mínimo exigido este mês
};

export type EssentialExpense = {
  id: string;
  name: string;
  amount: number;
};

export type RescueMethod = "bola_de_neve" | "avalanche";

export type RescuePlanResult = {
  income: number;
  essentialReserve: number;
  availableForDebts: number;
  shortfall: number; // > 0 significa que nem o essencial cabe na renda — sinal crítico
  orderedDebts: (UnifiedDebt & { priority: number; suggestedPayment: number })[];
  projectedPayoffMonths: number | null;
};

/**
 * Ordena as dívidas conforme o método:
 * - Bola de neve: menor saldo devedor primeiro (motivação psicológica — vitórias rápidas)
 * - Avalanche:    maior taxa de juros primeiro (economia matemática — menos juros pagos)
 */
function sortDebts(debts: UnifiedDebt[], method: RescueMethod): UnifiedDebt[] {
  const copy = [...debts];
  if (method === "bola_de_neve") {
    return copy.sort((a, b) => a.balance - b.balance);
  }
  return copy.sort((a, b) => b.monthlyRate - a.monthlyRate);
}

export function buildRescuePlan({
  income,
  essentialExpenses,
  debts,
  method,
}: {
  income: number;
  essentialExpenses: EssentialExpense[];
  debts: UnifiedDebt[];
  method: RescueMethod;
}): RescuePlanResult {
  const essentialReserve = essentialExpenses.reduce((sum, e) => sum + e.amount, 0);
  const shortfall = Math.max(essentialReserve - income, 0);
  const availableForDebts = Math.max(income - essentialReserve, 0);

  const ordered = sortDebts(debts, method);

  // Passo 1: garantir o pagamento mínimo de TODAS as dívidas (evita multa/negativação em cascata)
  const totalMinimums = ordered.reduce((s, d) => s + d.minimumPayment, 0);
  let remaining = Math.max(availableForDebts - totalMinimums, 0);

  // Passo 2: qualquer sobra vai inteira para a dívida prioritária (topo da ordenação),
  // acelerando a quitação dela antes de passar para a próxima — essência do método.
  const orderedDebts = ordered.map((debt, index) => {
    let suggestedPayment = debt.minimumPayment;
    if (index === 0 && remaining > 0) {
      const extra = Math.min(remaining, debt.balance - debt.minimumPayment);
      suggestedPayment += Math.max(extra, 0);
      remaining -= Math.max(extra, 0);
    }
    return { ...debt, priority: index + 1, suggestedPayment };
  });

  // Projeção simplificada de meses até quitação total, assumindo que o valor
  // extra disponível se mantém constante e "rola" para a próxima dívida da
  // fila assim que a atual é quitada (efeito bola de neve/avalanche).
  const projectedPayoffMonths = estimatePayoffMonths(orderedDebts, availableForDebts);

  return {
    income,
    essentialReserve,
    availableForDebts,
    shortfall,
    orderedDebts,
    projectedPayoffMonths,
  };
}

function estimatePayoffMonths(
  debts: { balance: number; monthlyRate: number; minimumPayment: number }[],
  monthlyBudget: number,
  maxMonths = 240
): number | null {
  if (debts.length === 0) return 0;
  if (monthlyBudget <= 0) return null;

  // Simulação mês a mês: aplica juros, paga mínimo em todas, joga a sobra na primeira da fila.
  let balances = debts.map((d) => d.balance);
  const rates = debts.map((d) => d.monthlyRate);
  const minimums = debts.map((d) => d.minimumPayment);

  for (let month = 1; month <= maxMonths; month++) {
    let budget = monthlyBudget;

    // juros do mês
    balances = balances.map((b, i) => (b > 0 ? b * (1 + rates[i]) : 0));

    // paga mínimo em cada uma
    balances = balances.map((b, i) => {
      if (b <= 0) return 0;
      const pay = Math.min(minimums[i], b);
      budget -= pay;
      return b - pay;
    });

    // sobra inteira na primeira dívida ainda ativa (fila já ordenada)
    const targetIndex = balances.findIndex((b) => b > 0);
    if (targetIndex !== -1 && budget > 0) {
      const pay = Math.min(budget, balances[targetIndex]);
      balances[targetIndex] -= pay;
    }

    if (balances.every((b) => b <= 0.01)) return month;
  }
  return null; // não quita dentro do horizonte simulado — sinal de que o orçamento não fecha
}
