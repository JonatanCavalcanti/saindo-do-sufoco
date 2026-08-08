// lib/data/cards.ts
// Helper server-only: busca os cartões ativos de um usuário já com o limite
// disponível calculado via RPC public.get_card_available_limit (ver
// sql/schema.sql). Usado tanto em /cartoes quanto em /plano-de-resgate para
// não duplicar esse loop de RPC-por-cartão.
import type { SupabaseClient } from "@supabase/supabase-js";

export type CardWithLimit = {
  id: string;
  nickname: string;
  brand: string | null;
  creditLimit: number;
  closingDay: number;
  dueDay: number;
  revolvingInterestRate: number;
  availableLimit: number;
  usedLimit: number;
};

export async function getCardsWithAvailableLimit(
  supabase: SupabaseClient,
  userId: string
): Promise<CardWithLimit[]> {
  const { data: cardRows } = await supabase
    .from("cards")
    .select("id,nickname,brand,credit_limit,closing_day,due_day,revolving_interest_rate")
    .eq("user_id", userId)
    .eq("active", true)
    .order("created_at");

  if (!cardRows || cardRows.length === 0) return [];

  return Promise.all(
    cardRows.map(async (c) => {
      const { data: limitData } = await supabase.rpc("get_card_available_limit", {
        p_card_id: c.id,
      });
      const availableLimit = (Array.isArray(limitData) ? limitData[0] : limitData) ?? c.credit_limit;

      return {
        id: c.id,
        nickname: c.nickname,
        brand: c.brand,
        creditLimit: c.credit_limit,
        closingDay: c.closing_day,
        dueDay: c.due_day,
        revolvingInterestRate: c.revolving_interest_rate,
        availableLimit,
        usedLimit: c.credit_limit - availableLimit,
      };
    })
  );
}
