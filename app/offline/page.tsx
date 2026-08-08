import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-base-50 flex flex-col items-center justify-center px-8 text-center">
      <WifiOff size={32} className="text-ink-400 mb-3" />
      <h1 className="font-display text-xl text-ink-900">Sem conexão no momento</h1>
      <p className="font-body text-sm text-ink-400 mt-2">
        O que você já abriu continua disponível. Lançamentos novos ficam guardados no aparelho e
        sincronizam sozinhos assim que a internet voltar.
      </p>
    </main>
  );
}
