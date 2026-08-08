// lib/supabase/client.ts
// Cliente para Client Components ("use client"). Usa a chave anônima —
// toda a segurança real fica nas políticas RLS do schema (ver sql/schema.sql).
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
