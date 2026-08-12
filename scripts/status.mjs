#!/usr/bin/env node
/**
 * 0. 오케스트레이터의 눈 — 지금 무엇이 어디까지 왔는지 한 화면에 보여준다.
 *
 *   node scripts/status.mjs
 */
import { existsSync } from 'node:fs';
import { listIds, loadMeta, paths, readText, green, red, yellow, dim, bold } from './lib/util.mjs';

const 단계표 = ['수집', '게이트', '분류', '초안', '검증', '확정'];

function 진행(id) {
  const p = paths(id);
  const m = loadMeta(id) ?? {};
  const done = [
    existsSync(p.raw),
    m.단계 === '통과' || m.단계 === '반려' || ['확정', '발행'].includes(m.단계),
    existsSync(p.fields),
    existsSync(p.draft),
    existsSync(p.review),
    existsSync(p.final),
  ];
  return { m, done };
}

async function main() {
  const ids = listIds();
  if (!ids.length) {
    console.log(dim('work/ 가 비어 있습니다. 먼저 수집하세요:'));
    console.log('  node scripts/collect.mjs examples/good-page.html --id 예제1');
    return;
  }

  console.log(bold('  ' + 단계표.map((s) => s.padEnd(5)).join('') + '  항목'));
  console.log(dim('  ' + '─'.repeat(38)));

  let 반려 = 0, 완료 = 0;
  for (const id of ids) {
    const { m, done } = 진행(id);
    const 막힘 = m.단계 === '반려';
    if (막힘) 반려++;
    if (done[5]) 완료++;
    const bar = done.map((d, i) => (막힘 && i > 1 ? dim('  ·  ') : d ? green('  ●  ') : dim('  ○  '))).join('');
    const 꼬리 = 막힘 ? red(`  반려: ${m.반려사유}`) : dim(`  ${m.단계 ?? '기록 없음'}`);
    console.log('  ' + bar + '  ' + id + 꼬리);
  }

  console.log('');
  console.log(`  전체 ${ids.length} · 확정 ${완료} · 반려 ${반려} · 진행중 ${ids.length - 완료 - 반려}`);
  if (반려) console.log(dim('  반려 건은 사람이 직접 입력하는 갈래입니다. 실패가 아닙니다.'));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
