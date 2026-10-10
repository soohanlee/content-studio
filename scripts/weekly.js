'use strict';
// 예약 실행(월요일 07:00): 최근에 받은 주제 추천이 없으면 새로 받아 둔다.
// 서버가 켜져 있으면 서버에 맡기고, 꺼져 있으면 직접 처리한 뒤 끝낸다.
const http = require('http');
const path = require('path');
const { load } = require('../lib/config');
const cfg = load();

function ping() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: cfg.port, path: '/api/state', timeout: 2000 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}
function post(p) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: cfg.port, path: p, method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => { res.resume(); resolve(); });
    req.on('error', resolve);
    req.end('{}');
  });
}

(async () => {
  const store = require('../lib/store');
  if (!require('../lib/profile').isReady()) { console.log('처음 설정(분야 고정)이 끝나지 않아 건너뜁니다.'); return; }
  const week = require('../lib/week');
  const w = week.current();
  // 최근 3일 안에 받은 추천이 있으면 건너뛴다
  const latest = store.listTopicBatches()[0];
  const t = latest && store.getTopicBatch(latest);
  if (t && Date.now() - Date.parse(t.generated_at || 0) < 3 * 86400000) { console.log(`최근 추천(${latest})이 있어 건너뜁니다.`); return; }
  if (await ping()) { await post('/api/topics/generate'); console.log('서버에 주제 추천을 요청했습니다.'); return; }
  const jobs = require('../lib/jobs');
  jobs.init(cfg);
  const id = store.nextId(store.dirs.topics, `${w.today}-t`);
  jobs.enqueue('topics', id);
  await jobs.drain();
  console.log(`주제 추천(${id})을 마쳤습니다.`);
  process.exit(0);
})();
