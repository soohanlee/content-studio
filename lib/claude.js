'use strict';
// Claude Code 헤드리스 실행. 구독 로그인으로 돌도록 API 키 환경변수를 지운다.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./config');
const { dirs } = require('./store');

const TOOLS = 'Read,Write,Edit,Glob,Grep,WebSearch,WebFetch';

function runSkill(cfg, { skill, arg, jobId, onProgress, tools }) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY; // 있으면 구독 대신 API로 과금된다
    delete env.ANTHROPIC_AUTH_TOKEN;

    const prompt = `/${skill} ${arg}`;
    // --allowedTools는 값을 여러 개 받으므로 맨 뒤에 둔다.
    // 모델: config.models[스킬] > config.model > Claude Code 기본값
    const model = (cfg.models && cfg.models[skill]) || cfg.model || '';
    const args = ['-p', prompt, '--output-format', 'json', '--permission-mode', 'acceptEdits', '--no-session-persistence'];
    if (model) args.push('--model', model);
    args.push('--allowedTools', tools || TOOLS);

    const started = Date.now();
    // Windows: 기본 설치(claude.exe)는 셸 없이 바로 실행한다. npm 설치(claude.cmd)일 때만 셸을 쓰고 인자를 따옴표로 감싼다.
    const useShell = /\.(cmd|bat)$/i.test(cfg.claudeBin);
    const q = (a) => (/[\s"&|<>^]/.test(a) ? `"${String(a).replace(/"/g, '""')}"` : a);
    const child = spawn(useShell ? q(cfg.claudeBin) : cfg.claudeBin, useShell ? args.map(q) : args, {
      cwd: ROOT,
      env,
      shell: useShell,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => { stdout += b; });
    child.stderr.on('data', (b) => { stderr += b; });

    const ticker = setInterval(() => onProgress && onProgress(Math.round((Date.now() - started) / 1000)), 5000);
    const timeoutMs = (cfg.jobTimeoutMinutes || 25) * 60 * 1000;
    const timer = setTimeout(() => { child.kill('SIGTERM'); }, timeoutMs);

    const finish = (result) => {
      clearInterval(ticker);
      clearTimeout(timer);
      const log = { jobId, skill, arg, args, seconds: Math.round((Date.now() - started) / 1000), ...result, stderr: stderr.slice(-4000) };
      try { fs.writeFileSync(path.join(dirs.logs, `${jobId}.json`), JSON.stringify(log, null, 2)); } catch {}
      resolve(result);
    };

    child.on('error', (err) => finish({ ok: false, error: `claude 실행 실패: ${err.message} (경로: ${cfg.claudeBin})` }));
    child.on('close', (code, signal) => {
      let parsed = null;
      try { parsed = JSON.parse(stdout.trim()); } catch {}
      if (signal) return finish({ ok: false, error: `제한 시간(${cfg.jobTimeoutMinutes}분)이 지나서 멈췄어요.`, raw: stdout.slice(-2000) });
      if (!parsed) return finish({ ok: false, error: `결과를 읽지 못했어요 (종료 코드 ${code}). ${stderr.slice(-300)}`, raw: stdout.slice(-2000) });
      if (parsed.is_error) return finish({ ok: false, error: parsed.result || '스킬 실행 중 오류', meta: parsed });
      const u = parsed.usage || {};
      const stu = u.server_tool_use || {};
      finish({ ok: true, result: parsed.result, meta: {
        num_turns: parsed.num_turns,
        duration_ms: parsed.duration_ms,
        total_cost_usd: parsed.total_cost_usd, // 구독 실행에서는 과금이 아니라 API 정가 환산치
        models: Object.keys(parsed.modelUsage || {}),
        tokens: {
          input: u.input_tokens || 0,
          output: u.output_tokens || 0,
          cache_read: u.cache_read_input_tokens || 0,
          cache_write: u.cache_creation_input_tokens || 0,
        },
        // 웹 검색은 보조 모델이 대신 하는 경우가 많아 모델별 webSearchRequests까지 더한다
        web_search: Math.max(stu.web_search_requests || 0, Object.values(parsed.modelUsage || {}).reduce((n, m) => n + (m.webSearchRequests || 0), 0)),
        web_fetch: stu.web_fetch_requests || 0,
        modelUsage: parsed.modelUsage,
      } });
    });
  });
}

module.exports = { runSkill };
