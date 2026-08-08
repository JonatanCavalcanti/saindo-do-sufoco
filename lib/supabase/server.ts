// lib/supabase/server.ts
// Cliente para Server Components, Route Handlers e Server Actions. Lê/grava
// cookies de sessão via next/headers — necessário para o RLS reconhecer
// auth.uid() nas chamadas feitas do servidor.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // chamado a partir de um Server Component sem permissão de escrita —
            // seguro ignorar se houver middleware renovando a sessão
          }
        },
      },
    }
  );
}

// Cliente com service_role — SOMENTE em Route Handlers server-side (nunca no
// bundle do client). Usado por /api/parse-invoice para baixar PDFs do Storage
// e por rotinas administrativas que precisam ignorar RLS.
import { createClient as createServiceClient } from "@supabase/supabase-js";

export function createServiceRoleClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
