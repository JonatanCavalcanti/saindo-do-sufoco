// lib/offline-queue.ts
//
// PWAs de finanças precisam continuar úteis sem internet (ex: usuário lança
// uma compra parcelada no metrô). Esta fila grava a operação pendente no
// IndexedDB do navegador e tenta reenviá-la assim que a conexão volta,
// evitando perda de dados. Uso mínimo de dependências (IndexedDB nativo).

const DB_NAME = "sufoco-offline";
const STORE_NAME = "pending-mutations";

type PendingMutation = {
  id?: number;
  url: string;
  method: "POST" | "PUT" | "PATCH";
  body: unknown;
  createdAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Enfileira uma mutação (ex: nova compra) para envio quando a conexão voltar. */
export async function enqueueMutation(mutation: Omit<PendingMutation, "id" | "createdAt">) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add({ ...mutation, createdAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Tenta enviar (via fetch real) e remover da fila todas as mutações pendentes. */
export async function flushQueue(): Promise<{ succeeded: number; failed: number }> {
  const db = await openDb();
  const all: PendingMutation[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as PendingMutation[]);
    req.onerror = () => reject(req.error);
  });

  let succeeded = 0;
  let failed = 0;

  for (const mutation of all) {
    try {
      const res = await fetch(mutation.url, {
        method: mutation.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mutation.body),
      });
      if (!res.ok) throw new Error("Falha ao sincronizar");

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(mutation.id!);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      succeeded++;
    } catch {
      failed++; // mantém na fila para a próxima tentativa
    }
  }

  return { succeeded, failed };
}

/** Chame no layout raiz (client component) para sincronizar assim que a rede voltar. */
export function watchConnectivityAndSync() {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => {
    flushQueue();
  });
}
