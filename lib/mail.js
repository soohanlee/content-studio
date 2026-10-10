'use strict';
// 메일 읽기(IMAP)·보내기(SMTP)·해석(MIME). 외부 패키지 없이 Node 내장 모듈만 쓴다.
// Gmail 앱 비밀번호로 접속한다. 읽기는 EXAMINE(읽기 전용)과 BODY.PEEK을 써서 메일 상태를 바꾸지 않는다.
const tls = require('tls');
const net = require('net');
const crypto = require('crypto');

// ── 공통: 한 줄씩 응답을 받는 소켓
function openSocket({ host, port, secure = true, timeoutMs = 30000 }) {
  return new Promise((resolve, reject) => {
    const sock = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    sock.setTimeout(timeoutMs, () => sock.destroy(new Error('메일 서버 응답이 없어요.')));
    sock.once(secure ? 'secureConnect' : 'connect', () => resolve(sock));
    sock.once('error', reject);
  });
}

// ── MIME 해석
function decodeCharset(buf, charset) {
  const cs = String(charset || 'utf-8').toLowerCase().replace(/^"|"$/g, '');
  try { return new TextDecoder(cs === 'ks_c_5601-1987' ? 'euc-kr' : cs).decode(buf); } catch { return buf.toString('utf8'); }
}
function qpDecode(str) {
  const s = str.replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) { bytes.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; } else bytes.push(s.charCodeAt(i) & 0xff);
  }
  return Buffer.from(bytes);
}
// =?UTF-8?B?...?= 같은 인코딩된 헤더 풀기
function decodeWords(str) {
  return String(str || '')
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, cs, enc, text) => {
      const buf = enc.toUpperCase() === 'B' ? Buffer.from(text, 'base64') : qpDecode(text.replace(/_/g, ' '));
      return decodeCharset(buf, cs);
    });
}
function parseHeaders(text) {
  const out = {};
  for (const line of text.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return out;
}
function headerParam(value, name) {
  const m = String(value || '').match(new RegExp(`${name}\\*?=("([^"]*)"|[^;\\s]+)`, 'i'));
  if (!m) return '';
  let v = m[2] !== undefined ? m[2] : m[1];
  if (/^utf-8''/i.test(v)) v = decodeURIComponent(v.replace(/^utf-8''/i, ''));
  return decodeWords(v);
}
function decodeBody(buf, enc) {
  const e = String(enc || '').toLowerCase();
  if (e === 'base64') return Buffer.from(buf.toString('latin1').replace(/\s+/g, ''), 'base64');
  if (e === 'quoted-printable') return qpDecode(buf.toString('latin1'));
  return buf;
}
function htmlToText(html) {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim();
}
// 메일 한 통(Buffer) → { headers, from, subject, messageId, date, text, attachments }
function parseMessage(raw) {
  const result = { text: '', html: '', attachments: [] };
  const walk = (buf) => {
    const s = buf.toString('latin1');
    let cut = s.indexOf('\r\n\r\n'); let sep = 4;
    if (cut < 0) { cut = s.indexOf('\n\n'); sep = 2; }
    const head = parseHeaders(cut < 0 ? s : s.slice(0, cut));
    const body = cut < 0 ? Buffer.alloc(0) : buf.subarray(cut + sep);
    const ctype = head['content-type'] || 'text/plain';
    const boundary = headerParam(ctype, 'boundary');
    if (/^multipart\//i.test(ctype) && boundary) {
      const parts = body.toString('latin1').split(`--${boundary}`);
      for (const p of parts.slice(1)) {
        if (p.startsWith('--')) break;
        walk(Buffer.from(p.replace(/^\r?\n/, ''), 'latin1'));
      }
      return head;
    }
    const data = decodeBody(body, head['content-transfer-encoding']);
    const disp = head['content-disposition'] || '';
    const filename = headerParam(disp, 'filename') || headerParam(ctype, 'name');
    if (/^attachment/i.test(disp) || (filename && !/^text\//i.test(ctype))) {
      result.attachments.push({ filename, contentType: ctype.split(';')[0].trim(), size: data.length, data });
    } else if (/^text\/plain/i.test(ctype)) result.text += decodeCharset(data, headerParam(ctype, 'charset'));
    else if (/^text\/html/i.test(ctype)) result.html += decodeCharset(data, headerParam(ctype, 'charset'));
    return head;
  };
  const headers = walk(raw);
  const fromRaw = decodeWords(headers.from || '');
  const fromAddr = ((fromRaw.match(/<([^>]+)>/) || [])[1] || fromRaw).trim().toLowerCase();
  return {
    headers,
    from: fromAddr,
    fromName: fromRaw.replace(/<[^>]+>/, '').replace(/"/g, '').trim(),
    subject: decodeWords(headers.subject || '').trim(),
    messageId: (headers['message-id'] || '').trim(),
    date: headers.date ? new Date(headers.date).toISOString() : new Date().toISOString(),
    text: (result.text || htmlToText(result.html)).replace(/\r\n/g, '\n').trim(),
    attachments: result.attachments,
  };
}

// ── MIME 만들기 (첨부파일 포함 메일)
const b64lines = (buf) => buf.toString('base64').replace(/.{1,76}/g, '$&\r\n');
const encWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);
function buildMessage({ from, to, subject, text, attachments = [], inReplyTo = '', references = '' }) {
  const boundary = `cs-${crypto.randomBytes(12).toString('hex')}`;
  const domain = String(from).split('@')[1] || 'localhost';
  const lines = [
    `From: ${from}`, `To: ${to}`, `Subject: ${encWord(subject)}`, `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomBytes(16).toString('hex')}@${domain}>`, 'MIME-Version: 1.0',
  ];
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`, `References: ${(references ? references + ' ' : '') + inReplyTo}`);
  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64lines(Buffer.from(text, 'utf8')));
  for (const a of attachments) {
    const name = encodeURIComponent(a.filename);
    lines.push(`--${boundary}`,
      `Content-Type: ${a.contentType || 'application/octet-stream'}; name="${encWord(a.filename)}"`,
      `Content-Disposition: attachment; filename*=UTF-8''${name}`,
      'Content-Transfer-Encoding: base64', '', b64lines(a.data));
  }
  lines.push(`--${boundary}--`, '');
  return lines.join('\r\n');
}

// ── IMAP (읽기 전용)
class Imap {
  constructor(opts) { this.opts = { host: 'imap.gmail.com', port: 993, secure: true, ...opts }; this.n = 0; this.buf = Buffer.alloc(0); this.waiter = null; }
  async connect() {
    this.sock = await openSocket(this.opts);
    this.sock.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this._check(); });
    this.sock.on('error', (e) => { if (this.waiter) { const w = this.waiter; this.waiter = null; w.reject(e); } });
    await new Promise((resolve, reject) => { this.waiter = { tag: null, resolve, reject }; this._check(); });
    await this.cmd(`LOGIN ${quote(this.opts.user)} ${quote(this.opts.pass)}`).catch(() => { throw new Error('Gmail 로그인에 실패했어요. 주소와 앱 비밀번호를 확인해 주세요.'); });
  }
  _check() {
    const w = this.waiter; if (!w) return;
    const s = this.buf.toString('latin1');
    if (w.tag === null) { // 서버 인사
      const i = s.indexOf('\r\n'); if (i < 0) return;
      this.buf = this.buf.subarray(i + 2); this.waiter = null;
      return /^\* (OK|PREAUTH)/.test(s) ? w.resolve() : w.reject(new Error('메일 서버가 접속을 거부했어요.'));
    }
    const m = s.match(new RegExp(`(^|\\r\\n)${w.tag} (OK|NO|BAD)[^\\r\\n]*\\r\\n$`));
    if (!m) return;
    const out = this.buf; this.buf = Buffer.alloc(0); this.waiter = null;
    m[2] === 'OK' ? w.resolve(out) : w.reject(new Error(out.toString('utf8').split('\r\n').filter(Boolean).pop()));
  }
  cmd(command) {
    const tag = `A${String(++this.n).padStart(3, '0')}`;
    return new Promise((resolve, reject) => {
      this.waiter = { tag, resolve, reject };
      this.sock.write(`${tag} ${command}\r\n`);
    });
  }
  async examine(box = 'INBOX') { await this.cmd(`EXAMINE ${quote(box)}`); }
  // Gmail 검색어(X-GM-RAW). ASCII만 넣는다(한글 제목은 받은 뒤 걸러 낸다).
  async search(raw) {
    const out = (await this.cmd(`UID SEARCH X-GM-RAW ${quote(raw)}`)).toString('latin1');
    const line = (out.match(/^\* SEARCH([^\r\n]*)/m) || [])[1] || '';
    return line.trim().split(/\s+/).filter(Boolean).map(Number);
  }
  // UID 목록의 메일을 가져온다. part 예: 'BODY.PEEK[HEADER.FIELDS (MESSAGE-ID SUBJECT FROM DATE)]', 'BODY.PEEK[]'
  async fetch(uids, part) {
    if (!uids.length) return [];
    const out = await this.cmd(`UID FETCH ${uids.join(',')} (UID ${part})`);
    const s = out.toString('latin1');
    const items = [];
    const re = /\* \d+ FETCH \(/g; let m;
    while ((m = re.exec(s))) {
      const lit = /\{(\d+)\}\r\n/g; lit.lastIndex = m.index;
      const l = lit.exec(s); if (!l) break;
      const start = l.index + l[0].length; const len = Number(l[1]);
      const uid = Number(((s.slice(m.index, start).match(/UID (\d+)/) || s.slice(start + len, start + len + 80).match(/UID (\d+)/) || [])[1]) || 0);
      items.push({ uid, data: out.subarray(start, start + len) });
      re.lastIndex = start + len;
    }
    return items;
  }
  async logout() { try { await this.cmd('LOGOUT'); } catch {} this.sock.end(); }
}
const quote = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// ── SMTP (보내기)
async function sendMail({ host = 'smtp.gmail.com', port = 465, secure = true, user, pass, from, to, raw }) {
  const sock = await openSocket({ host, port, secure, timeoutMs: 60000 });
  let buf = '';
  let waiter = null;
  sock.on('data', (d) => { buf += d.toString('latin1'); check(); });
  sock.on('error', (e) => { if (waiter) { const w = waiter; waiter = null; w.reject(e); } });
  function check() {
    if (!waiter) return;
    const lines = buf.split('\r\n');
    const done = lines.findIndex((l) => /^\d{3} /.test(l));
    if (done < 0) return;
    const reply = lines.slice(0, done + 1).join('\n');
    buf = lines.slice(done + 1).join('\r\n');
    const w = waiter; waiter = null;
    const code = Number(lines[done].slice(0, 3));
    w.ok(code) ? w.resolve(reply) : w.reject(new Error(lines[done]));
  }
  const expect = (ok, line) => new Promise((resolve, reject) => {
    waiter = { ok, resolve, reject };
    if (line !== undefined) sock.write(line + '\r\n');
    check();
  });
  const is2 = (c) => c >= 200 && c < 300;
  try {
    await expect(is2);
    await expect(is2, 'EHLO content-studio.local');
    await expect((c) => c === 334, 'AUTH LOGIN');
    await expect((c) => c === 334, Buffer.from(user).toString('base64'));
    await expect(is2, Buffer.from(pass).toString('base64')).catch(() => { throw new Error('Gmail 로그인에 실패했어요. 주소와 앱 비밀번호를 확인해 주세요.'); });
    await expect(is2, `MAIL FROM:<${from}>`);
    for (const r of [].concat(to)) await expect(is2, `RCPT TO:<${r}>`);
    await expect((c) => c === 354, 'DATA');
    const body = raw.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
    await expect(is2, `${body}\r\n.`);
    await expect(() => true, 'QUIT').catch(() => {});
  } finally { sock.end(); }
}

module.exports = { Imap, sendMail, parseMessage, buildMessage, decodeWords, htmlToText };
