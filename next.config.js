/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdfjs-dist usa APIs de canvas/worker que precisam rodar só no server;
  // isso evita que o bundler tente empacotar o parser para o client.
  serverExternalPackages: ["pdfjs-dist"],
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
