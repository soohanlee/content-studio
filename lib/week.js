'use strict';
// 서울 시간 기준 날짜와 ISO 주(YYYY-Www) 계산.
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

function seoulNow(d = new Date()) {
  // UTC 필드로 서울 시각을 읽기 위한 가짜 Date
  return new Date(d.getTime() + SEOUL_OFFSET_MS);
}
const pad = (n) => String(n).padStart(2, '0');
function ymd(s) { return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`; }

function isoWeek(s) {
  const t = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}

function current(d = new Date()) {
  const s = seoulNow(d);
  const { year, week } = isoWeek(s);
  const dow = s.getUTCDay() || 7; // 월=1 … 일=7
  const monday = new Date(s.getTime() - (dow - 1) * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  return {
    weekId: `${year}-W${pad(week)}`,
    today: ymd(s),
    startDate: ymd(monday),
    endDate: ymd(sunday),
    dow,
    hour: s.getUTCHours(),
    isoTime: `${ymd(s)}T${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}:00+09:00`,
  };
}

module.exports = { current };
