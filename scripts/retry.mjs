#!/usr/bin/env node
/**
 * 8. 재시도 담당 — "기다리면 되는가"만 판단한다. 코드는 건드리지 않는다.
 *
 *   node scripts/retry.mjs           대상만 보여준다 (기본: 안전)
 *   node scripts/retry.mjs --run     실제로 다시 수집한다
 *
 * 핵심 두 가지:
 *  1) 구조적 실패(로그인 필요·빈 게시판)는 재시도 대상이 아니다. 백 번 해도 같다.
 *  2) "기록 없음"은 실패가 아니라 미실행이다. 대상은 '실패한 것'이 아니라 '성공하지 않은 것'.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { listIds, loadMeta, saveMeta, ROOT, green, red, yellow, dim, bold } from './lib/util.mjs';

/** 재시도해도 결과가 같은 사유 — 상한만 소진한다 */
const 구조적_실패 = new Set(['로그인_필요', '빈_게시판', '이미지_전용']);
const 최대시도 = 24;

export function 대상선별(ids) {
  const 대상 = [], 제외 = [];
  for (const id of ids) {
    const m = loadMeta(id) ?? {};
    const 단계 = m.단계 ?? null;

    if (단계 === '통과' || 단계 === '확정' || 단계 === '발행') continue; // 이미 성공

    if (단계 === '반려' && 구조적_실패.has(m.반려사유)) {
      제외.push({ id, 이유: `구조적 실패(${m.반려사유})` });
      continue;
    }
    if ((m.시도횟수 ?? 0) >= 최대시도) {
      제외.push({ id, 이유: `상한 ${최대시도}회 소진` });
      continue;
    }
    // 단계가 null = 기록 없음 = 미실행. 이것도 주워야 한다.
    대상.push({ id, 출처: m.출처, 단계: 단계 ?? '기록 없음(미실행)', 시도: m.시도횟수 ?? 0 });
  }
  return { 대상, 제외 };
}

async function main() {
  const 실행 = process.argv.includes('--run');
  const { 대상, 제외 } = 대상선별(listIds());

  console.log(bold('재시도 대상'));
  if (!대상.length) console.log(dim('  없음 — 전부 성공했거나 구조적 실패입니다'));
  for (const t of 대상) console.log(`  ${yellow('↻')} ${t.id}  [${t.단계}] 시도 ${t.시도}회`);

  if (제외.length) {
    console.log(`\n${bold('제외')} ${dim('(재시도해도 같은 결과)')}`);
    for (const e of 제외) console.log(`  ${red('×')} ${e.id}  ${e.이유}`);
  }

  if (!실행) {
    console.log(dim(`\n실제로 다시 수집하려면: node scripts/retry.mjs --run`));
    return;
  }

  for (const t of 대상) {
    if (!t.출처) { console.log(dim(`  ${t.id}: 출처가 없어 건너뜀`)); continue; }
    saveMeta(t.id, { 시도횟수: t.시도 + 1 });
    try {
      execFileSync('node', [join(ROOT, 'scripts', 'collect.mjs'), t.출처, '--id', t.id], { stdio: 'inherit' });
      execFileSync('node', [join(ROOT, 'scripts', 'gate.mjs'), t.id], { stdio: 'inherit' });
    } catch {
      console.log(red(`  ${t.id}: 재시도 실패`));
    }
  }
  console.log(green('\n재시도 완료'));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
