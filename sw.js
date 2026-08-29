/**
 * sw.js - Service Worker for IP Address Converter PWA
 * オフライン環境でも完全動作するように静的アセットをキャッシュ
 */

const CACHE_NAME = 'ipaddr-changer-v1';

const ASSETS_TO_CACHE = [
  './',
  'index.html',
  'css/style.css',
  'js/ip-utils.js',
  'js/app.js',
  'manifest.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

// インストール時に全アセットを事前キャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// アクティベーション時に旧バージョンのキャッシュを削除
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

// リクエストに対してキャッシュ優先で応答（オフライン完全対応）
self.addEventListener('fetch', (event) => {
  // GETリクエストのみキャッシュ処理
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // オフライン時のフォールバック（HTMLリクエストの場合）
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('index.html');
        }
      });
    })
  );
});
