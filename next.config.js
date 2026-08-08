/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdfjs-dist usa APIs de canvas/worker que precisam rodar só no server;
  // isso evita que o bundler tente empacotar o parser para o client.
  serverExternalPackages: ["pdfjs-dist"],
};

module.exports = nextConfig;
