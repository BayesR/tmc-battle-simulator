// TMC Battle Simulator — Service Worker
// アプリの見た目（HTML/CSS/JS）をキャッシュし、電波が悪い場所でも
// 前回開いた画面をすぐ表示できるようにするための最小限のオフライン対応。
// デッキデータ自体はlocalStorageに保存されるため、このSWでは扱わない。

const CACHE_NAME = "tmc-battle-simulator-v1";
// ビルド後のファイル名はハッシュ付きで変わるため、確実な"/"だけを事前キャッシュし、
// それ以外はアクセス時にキャッシュへ追加していく（ランタイムキャッシュ）方式にする。
const PRECACHE_URLS = ["/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// 基本方針：ネットワーク優先、失敗したらキャッシュにフォールバック。
// （最新版を優先しつつ、オフライン時は直前に開けた画面を表示できるようにする）
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/")))
  );
});
