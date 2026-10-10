// 앱 설치 조건을 채우기 위한 최소 서비스 워커. 캐시하지 않고 항상 서버에서 받는다(로컬 전용 도구).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
