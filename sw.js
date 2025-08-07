const CACHE_NAME = '健檢邀約系統-v1.0.1';
const CACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json'
];

// 安裝事件 - 快取資源
self.addEventListener('install', event => {
  console.log('Service Worker 安裝中...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('快取資源中...');
        return cache.addAll(CACHE_URLS);
      })
      .then(() => {
        console.log('Service Worker 安裝完成');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('Service Worker 安裝失敗:', error);
      })
  );
});

// 啟動事件 - 清理舊快取
self.addEventListener('activate', event => {
  console.log('Service Worker 啟動中...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('刪除舊快取:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker 啟動完成');
        return self.clients.claim();
      })
  );
});

// 攔截網路請求 - 優化 iOS 相容性
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // 只處理 GET 請求
  if (request.method !== 'GET') {
    return;
  }
  
  // 忽略 Chrome 擴充套件和其他協議
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // 特別處理根路徑請求（重要：解決 iOS PWA 問題）
  if (url.pathname === '/' || url.pathname === './') {
    event.respondWith(
      caches.match('./index.html')
        .then(response => {
          if (response) {
            return response;
          }
          return fetch('./index.html');
        })
        .catch(() => {
          return caches.match('./index.html');
        })
    );
    return;
  }
  
  // 對於 Google Apps Script API 請求，優先使用網路
  if (url.hostname.includes('script.google.com')) {
    event.respondWith(
      fetch(request)
        .catch(error => {
          console.log('API 請求失敗，系統將在離線模式下運行:', error);
          return new Response(
            JSON.stringify({ 
              error: 'offline', 
              message: '目前處於離線模式，資料將暫存至本地' 
            }),
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }
  
  // 對於應用程式資源，使用快取優先策略
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // 背景更新快取
          fetch(request)
            .then(response => {
              if (response && response.status === 200 && response.type === 'basic') {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME)
                  .then(cache => {
                    cache.put(request, responseToCache);
                  });
              }
            })
            .catch(() => {
              // 背景更新失敗，但不影響使用者體驗
            });
          
          return cachedResponse;
        }
        
        return fetch(request)
          .then(response => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(request, responseToCache);
              });
            
            return response;
          })
          .catch(error => {
            console.log('網路請求失敗:', error);
            
            // 如果是 HTML 請求且網路失敗，返回主頁面
            if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
              return caches.match('./index.html');
            }
            
            throw error;
          });
      })
  );
});

// 同步事件 - 用於背景同步
self.addEventListener('sync', event => {
  if (event.tag === 'health-check-sync') {
    console.log('背景同步觸發');
    event.waitUntil(
      self.clients.matchAll()
        .then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'BACKGROUND_SYNC',
              action: 'sync-pending-invitations'
            });
          });
        })
    );
  }
});

// 推送通知事件
self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || '您有新的邀約通知',
      icon: './icons/icon-192.png',
      badge: './icons/badge-72.png',
      tag: 'health-check-notification',
      requireInteraction: false,
      actions: [
        {
          action: 'view',
          title: '查看詳情'
        },
        {
          action: 'dismiss',
          title: '關閉'
        }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || '健檢邀約系統', options)
    );
  }
});

// 通知點擊事件
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('./')
    );
  }
});

// 處理來自主線程的訊息
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

console.log('Service Worker 載入完成:', CACHE_NAME);