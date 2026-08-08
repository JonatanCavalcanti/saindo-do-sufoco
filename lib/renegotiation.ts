// lib/renegotiation.ts
//
// Simulador de Renegociação: ajuda o usuário a chegar numa proposta de acordo
// com base no valor PRINCIPAL da dívida, revertendo os juros compostos já
// aplicados — útil como referência em negociação com o credor, não como
// parecer jurídico (o app deixa isso explícito na UI).

export type RenegotiationInput = {
  currentBalance: number;      // valor cobrado hoje pelo credor
  monthlyRateApplied: number;  // taxa mensal que o credor alega ter aplicado (decimal)
  monthsElapsed: number;       // meses desde a origem da dívida / último pagamento
  originalPrincipal?: number;  // se o usuário souber o valor original da compra/empréstimo
};

export type RenegotiationResult = {
  estimatedPrincipal: number;      // principal estimado revertendo juros compostos
  totalInterestCharged: number;    // quanto foi cobrado de juros até hoje
  suggestedOfferLow: number;       // proposta conservadora (principal + pequena margem)
  suggestedOfferHigh: number;      // proposta mais confortável para o credor aceitar
  effectiveAnnualRate: number;     // taxa anual equivalente, para dar contexto ao usuário
};

/**
 * Reverte juros compostos: principal = saldo_atual / (1 + taxa)^meses
 * Se o usuário já sabe o principal original, usamos ele diretamente (mais preciso).
 */
export function simulateRenegotiation(input: RenegotiationInput): RenegotiationResult {
  const { currentBalance, monthlyRateApplied, monthsElapsed, originalPrincipal } = input;

  const estimatedPrincipal =
    originalPrincipal ??
    currentBalance / Math.pow(1 + monthlyRateApplied, Math.max(monthsElapsed, 0));

  const totalInterestCharged = Math.max(currentBalance - estimatedPrincipal, 0);

  // Faixa de proposta: entre o principal puro e principal + 20% (margem de negociação
  // realista — credores raramente aceitam só o principal, mas partir dele é a base legítima)
  const suggestedOfferLow = estimatedPrincipal;
  const suggestedOfferHigh = estimatedPrincipal * 1.2;

  const effectiveAnnualRate = (Math.pow(1 + monthlyRateApplied, 12) - 1) * 100;

  return {
    estimatedPrincipal,
    totalInterestCharged,
    suggestedOfferLow,
    suggestedOfferHigh,
    effectiveAnnualRate,
  };
}
