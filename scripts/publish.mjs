#!/usr/bin/env node
/**
 * 7. 발행 담당 — 확정 원고를 채널별 형태로 바꾼다.
 *
 *   node scripts/publish.mjs --email     이메일 HTML (out/newsletter.html)
 *   node scripts/publish.mjs --card      카드뉴스 텍스트 (out/cards.txt)
 *
 * 내용은 바꾸지 않는다. 규격만 맞춘다.
 * 채널 인증·API 연동은 조직마다 다르므로 여기서 다루지 않는다 —
 * "채널이 받을 수 있는 형태"까지가 이 에이전트의 끝이다.
 */
import { join } from 'node:path';
import { readText, readJson, writeText, listIds, paths, loadMeta, ROOT, green, yellow, dim, bold } from './lib/util.mjs';

const GMAIL_한계 = 102 * 1024;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** **볼드** → <strong>. 이메일은 최신 CSS를 못 쓰므로 태그로 직접 표현한다. */
const bold2html = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

function 확정목록() {
  return listIds()
    .map((id) => ({ id, meta: loadMeta(id), fields: readJson(paths(id).fields, {}) ?? {}, text: readText(paths(id).final) || readText(paths(id).draft) }))
    .filter((x) => x.text && x.meta?.단계 !== '반려')
    .map((x) => ({ ...x, text: x.text.trim() }));
}

function 이메일HTML(items) {
  const 분류별 = {};
  for (const it of items) (분류별[it.fields.분류 || '기타'] ??= []).push(it);

  const blocks = Object.entries(분류별)
    .map(
      ([cat, list]) => `
      <tr><td style="padding:24px 20px 8px 20px;font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;font-size:17px;font-weight:700;color:#111;">${esc(cat)}</td></tr>
      ${list
        .map(
          (it) => `<tr><td style="padding:6px 20px;font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;font-size:15px;line-height:1.65;color:#333;">
        • <a href="${esc(it.meta?.출처 || '#')}" style="color:#1a1a1a;text-decoration:underline;">${bold2html(it.text)}</a></td></tr>`
        )
        .join('\n      ')}`
    )
    .join('\n');

  // 레이아웃은 표로 짠다. flexbox·grid는 메일 클라이언트가 대부분 무시한다.
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>뉴스레터</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#fff;border-radius:8px;">
${blocks}
      <tr><td style="padding:28px 20px;font-family:-apple-system,sans-serif;font-size:12px;color:#888;border-top:1px solid #eee;">
        이 메일은 weekly-newsletter-agent 예제로 생성되었습니다.</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function 카드텍스트(items) {
  const 분류별 = {};
  for (const it of items) (분류별[it.fields.분류 || '기타'] ??= []).push(it);
  const 장 = [];
  for (const [cat, list] of Object.entries(분류별)) {
    // 한 장에 4건까지. 자동으로 자르되 어디서 잘렸는지 보이게 한다.
    for (let i = 0; i < list.length; i += 4) {
      장.push(
        `[${cat}${list.length > 4 ? ` ${Math.floor(i / 4) + 1}` : ''}]\n` +
          list.slice(i, i + 4).map((x) => '· ' + x.text.replace(/\*\*/g, '')).join('\n')
      );
    }
  }
  return 장.join('\n\n---\n\n');
}

async function main() {
  const args = process.argv.slice(2);
  const items = 확정목록();
  if (!items.length) {
    console.error('내보낼 항목이 없습니다. 초안까지 만든 뒤 실행하세요.');
    process.exit(1);
  }
  const 채널 = args.includes('--card') ? 'card' : 'email';

  if (채널 === 'email') {
    const html = 이메일HTML(items);
    const out = join(ROOT, 'out', 'newsletter.html');
    writeText(out, html);
    const kb = Buffer.byteLength(html, 'utf8');
    console.log(`${green('✓')} ${bold('이메일 HTML')}  ${items.length}건 · ${(kb / 1024).toFixed(1)}KB`);
    if (kb > GMAIL_한계) console.log(yellow(`  ⚠ ${(GMAIL_한계 / 1024).toFixed(0)}KB를 넘어 일부 메일 서비스에서 잘립니다`));
    console.log(dim(`  → ${out}`));
  } else {
    const txt = 카드텍스트(items);
    const out = join(ROOT, 'out', 'cards.txt');
    writeText(out, txt);
    console.log(`${green('✓')} ${bold('카드뉴스 텍스트')}  ${txt.split('---').length}장`);
    console.log(dim(`  → ${out}`));
    console.log(dim('  ※ 장 나누는 지점은 사람이 다시 보세요. 자동으로 자르면 문장 중간에서 끊깁니다.'));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
