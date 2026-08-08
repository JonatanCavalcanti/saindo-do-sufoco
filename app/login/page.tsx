"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Leaf, Mail, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } =
      mode === "entrar"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    router.refresh();
    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-base-50 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-full bg-moss-500 flex items-center justify-center mb-3">
            <Leaf size={26} className="text-white" />
          </div>
          <h1 className="font-display text-2xl text-ink-900">Saindo do Sufoco</h1>
          <p className="font-body text-sm text-ink-400 mt-1 text-center">
            Reorganize sua vida financeira, um passo de cada vez.
          </p>
        </div>

        <div className="flex rounded-lg bg-base-100 p-1 mb-5">
          <button
            type="button"
            onClick={() => setMode("entrar")}
            className={`flex-1 rounded-md py-2 font-body text-sm font-semibold transition ${
              mode === "entrar" ? "bg-white text-ink-900 shadow-sm" : "text-ink-400"
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode("criar")}
            className={`flex-1 rounded-md py-2 font-body text-sm font-semibold transition ${
              mode === "criar" ? "bg-white text-ink-900 shadow-sm" : "text-ink-400"
            }`}
          >
            Criar conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-body text-xs text-ink-600">Email</label>
            <div className="relative mt-1">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-moss-200 pl-9 pr-3 py-2.5 font-body text-sm"
                placeholder="voce@email.com"
              />
            </div>
          </div>

          <div>
            <label className="font-body text-xs text-ink-600">Senha</label>
            <div className="relative mt-1">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-lg border border-moss-200 pl-9 pr-3 py-2.5 font-body text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && <p className="font-body text-xs text-alert-brick">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-moss-500 disabled:bg-moss-200 text-white font-body font-semibold py-3"
          >
            {loading ? "Aguarde…" : mode === "entrar" ? "Entrar" : "Criar conta"}
          </button>
        </form>
      </div>
    </main>
  );
}
