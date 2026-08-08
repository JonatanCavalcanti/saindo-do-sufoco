/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdfjs-dist usa APIs de canvas/worker que precisam rodar só no server;
  // isso evita que o bundler tente empacotar o parser para o client.
  // @napi-rs/canvas é binário nativo (Path2D/DOMMatrix reais) — sem ele,
  // pdfjs cai num polyfill manco que quebra em faturas com layout mais
  // complexo (boleto, imagens) mesmo extraindo só texto, não renderizando.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  experimental: {
    // Sem isso, o Router Cache do Next mantém o RSC de páginas dinâmicas
    // (dashboard, cartões, plano de resgate, perfil) por até 30s — depois de
    // uma mutação (salvar renda, lançar compra...) a navegação pra outra aba
    // mostrava dado velho até a próxima atualização forçada. Zerando o
    // "dynamic" stale time, toda navegação busca dado fresco do servidor.
    staleTimes: {
      dynamic: 0,
    },
  },
};

module.exports = nextConfig;
