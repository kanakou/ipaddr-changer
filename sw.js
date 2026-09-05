/**
 * sw.js - Service Worker for IP Address Converter PWA
 * Network-First（ネットワーク優先）戦略による最新アセット配信とオフライン対応
 */

const CACHE_NAME = 'ipaddr-changer-v1.1.0';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/ip-utils.js',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// インストール時に全アセットを事前キャッシュ & 即時有効化
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// アクティベーション時に旧バージョンのキャッシュを自動完全削除 & 即時クライアント制御
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First 戦略: ネットワークから最新を取得し、失敗時のみキャッシュを使用
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // 外部オリジン（Google Analyticsなど）はService Workerでキャッシュしない
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    // 1. まずネットワークから最新データを取得
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // 2. ネットワーク取得失敗時（オフライン環境等）にキャッシュを返す
        return caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // HTMLナビゲーション時のオフラインフォールバック
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html') || caches.match('./');
          }
        });
      })
  );
});
