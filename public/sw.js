// Service worker MÍNIMO — existe só pra satisfazer o critério de
// instalabilidade do navegador (Chrome/Edge exigem um SW com handler de
// `fetch` registrado para oferecer "Instalar app"). NÃO cacheia nada de
// propósito: os dados da Carteira mudam o tempo todo (agenda, clientes,
// ações — polling de 60s no app já assume dado sempre fresco), servir uma
// versão cacheada aqui seria pior que não ter PWA nenhum.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handler vazio (sem `respondWith`) = deixa o navegador buscar na rede
// normalmente, exatamente como se não houvesse service worker nenhum.
self.addEventListener('fetch', () => {});
