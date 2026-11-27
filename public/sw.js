/* Service worker do Painel de Planilhas (app instalável).
   - Página: rede primeiro (sempre a versão mais nova); sem internet, abre a última versão guardada.
   - Arquivos do build (/assets/) e bibliotecas de CDN (versões fixas): cache primeiro, para abrir mais rápido.
   - Dados (Firestore, login, APIs) nunca passam por aqui: vão direto para a rede. */
const VERSION = 'pp-v4';
// caminhos relativos ao sw.js: funciona na raiz (Firebase) e em subpasta (GitHub Pages)
const SHELL = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
const ROOT = new URL('./', self.location).href;
const CDN = /^(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|cdn\.sheetjs\.com|www\.gstatic\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/__/')) return; // login do Firebase
    if (req.mode === 'navigate') {
      e.respondWith(fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(ROOT, copy)); }
        return res;
      }).catch(() => caches.match('/')));
      return;
    }
    // arquivos do build (/assets/nome-HASH.js|css): o nome muda a cada versão, então cache primeiro
    if (/\.(png|webmanifest)$/.test(url.pathname) || url.pathname.includes('/assets/')) {
      e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      })));
    }
    return;
  }
  if (CDN.test(url.hostname)) {
    // bibliotecas com impressão digital (SRI) pedem modo cors: uma cópia opaca guardada não serve
    e.respondWith(caches.match(req).then(hit => (hit && !(req.mode === 'cors' && hit.type === 'opaque')) ? hit : fetch(req).then(res => {
      if (res.ok || (res.type === 'opaque' && req.mode !== 'cors')) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});
