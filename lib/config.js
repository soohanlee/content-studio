'use strict';
// 설정: config.json 위에 config.local.json(설치 스크립트가 기록하는 이 컴퓨터 전용 값)을 덮어쓴다.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { return {}; }
}

function findClaude() {
  const candidates = [
    process.env.STUDIO_CLAUDE_BIN,
    path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    return execFileSync(cmd, ['claude'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
  } catch { return 'claude'; }
}

function findBrowser(configured) {
  if (configured && fs.existsSync(configured)) return configured;
  const candidates = process.platform === 'win32'
    ? [
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ]
    : ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
  return candidates.find((c) => c && fs.existsSync(c)) || '';
}

function load() {
  // config.json(기본값) < config.local.json(이 컴퓨터 경로) < data 폴더의 settings.json(화면에서 바꾼 값)
  const dataDir = path.resolve(ROOT, process.env.STUDIO_DATA || (process.env.STUDIO_MOCK === '1' ? 'data-mock' : 'data'));
  const cfg = { ...readJson(path.join(ROOT, 'config.json')), ...readJson(path.join(ROOT, 'config.local.json')), ...readJson(path.join(dataDir, 'settings.json')) };
  cfg.claudeBin = process.env.STUDIO_CLAUDE_BIN || cfg.claudeBin || findClaude();
  cfg.browserBin = findBrowser(process.env.STUDIO_BROWSER_BIN || cfg.browserBin);
  cfg.model = process.env.STUDIO_MODEL || cfg.model || '';
  cfg.mock = process.env.STUDIO_MOCK === '1';
  cfg.port = Number(process.env.STUDIO_PORT || cfg.port || 4600);
  return cfg;
}

module.exports = { ROOT, load };
