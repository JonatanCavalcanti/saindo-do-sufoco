// public/sw.js
//
// Estratégia simples e previsível, adequada a um protótipo:
// - App shell (rotas de navegação e assets estáticos): cache-first com
//   atualização em segundo plano (stale-while-revalidate).
// - Chamadas de API (/api/..., Supabase REST): network-first — dados
//   financeiros nunca devem mostrar informação desatualizada silenciosamente.
// - Sem rede e sem cache: cai na página /offline.
//
// Sincronização de escrita offline (ex: lançar uma compra sem internet) é
// tratada separadamente pela fila em lib/offline-queue.ts, que grava no
// IndexedDB e sincroniza quando a conexão volta — o service worker aqui cuida
// só de leitura/cache de navegação.

const CACHE_NAME = "sufoco-shell-v2";
const APP_SHELL = ["/dashboard", "/cartoes", "/plano-de-resgate", "/faturas/importar", "/offline", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return; // POST/PUT (ex: /api/purchases) não passam pelo cache

  // Requests internas do App Router (RSC): o Next usa isso para buscar dado
  // fresco em router.refresh() e navegação por <Link>. Cachear aqui fazia
  // telas mostrarem dado velho depois de salvar algo, até um reload manual
  // completo — mesmo bug de fundo do "preciso atualizar pra ver a mudança".
  const isRSCRequest = request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");

  // Dados de API: sempre tenta rede primeiro, sem cache de valores financeiros
  if (url.pathname.startsWith("/api/") || url.hostname.includes("supabase.co") || isRSCRequest) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: "Sem conexão no momento." }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // Navegação e assets: stale-while-revalidate com fallback offline
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached || caches.match("/offline"));

      return cached || networkFetch;
    })
  );
});
