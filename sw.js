// Service worker: red primero para los archivos de la app, caché como respaldo sin conexión.
// Subir N en CACHE cada vez que cambie cualquier archivo de la app.
const CACHE = 'garaje-v17';
const ARCHIVOS = [
  './', 'index.html', 'manifest.json', 'css/estilos.css',
  'js/main.js', 'js/estado.js', 'js/sync.js', 'js/calc.js', 'js/exportar.js', 'js/foto.js', 'js/util.js',
  'js/ui/componentes.js', 'js/ui/graficos.js', 'vendor/chart.umd.min.js', 'js/ui/inicio.js', 'js/ui/analisis.js', 'js/ui/registrar.js', 'js/ui/historico.js',
  'js/ui/recordatorios.js', 'js/ui/vehiculos.js', 'js/ui/catalogo.js', 'js/ui/ajustes.js', 'js/ui/hoja.js', 'js/ui/mas.js',
  'fonts/barlow-latin-400-normal.woff2', 'fonts/barlow-latin-600-normal.woff2',
  'fonts/barlow-condensed-latin-700-normal.woff2', 'fonts/barlow-condensed-latin-800-normal.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  // Nunca interceptar la API de GitHub ni nada que no sea GET del mismo origen.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(res => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});
