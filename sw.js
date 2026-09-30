// Service Worker PhotoAssist : fonctionnement hors-ligne.
// À CHAQUE modification de l'app : augmenter VERSION, sinon l'iPhone garde l'ancienne version.
var VERSION = 'v5';
var CACHE = 'photoassist-' + VERSION;
var FICHIERS = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'data/reglages.json',
  'manifest.json',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'img/styles/bokeh.jpg',
  'img/styles/portrait_net.jpg',
  'img/styles/paysage.jpg',
  'img/styles/panning.jpg',
  'img/styles/sport.jpg',
  'img/styles/nuit.jpg',
  'img/styles/eau.jpg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(FICHIERS.map(function (f) { return new Request(f, { cache: 'reload' }); })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (cles) { return Promise.all(cles.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  // Données de réglage : réseau d'abord (corrections prises en compte), cache si hors-ligne
  if (req.url.indexOf('/data/reglages.json') > -1) {
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then(function (rep) {
          var copie = rep.clone();
          caches.open(CACHE).then(function (c) { c.put('data/reglages.json', copie); });
          return rep;
        })
        .catch(function () { return caches.match('data/reglages.json'); })
    );
    return;
  }

  // Pages : toujours renvoyer l'app (hors-ligne compris)
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(function () { return caches.match('index.html'); }));
    return;
  }

  // Le reste : cache d'abord
  e.respondWith(
    caches.match(req).then(function (rep) { return rep || fetch(req); })
  );
});
