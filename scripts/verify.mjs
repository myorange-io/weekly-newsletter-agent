#!/usr/bin/env node
/**
 * 5. 사실 검증관 — 상시 층(무비용 문자열 대조).
 *
 *   node scripts/verify.mjs <id>
 *
 * 초안에 나온 고유명사·숫자가 원문에 실제로 있는지만 본다.
 * 문장이 자연스러운지는 비평가의 일이다.
 *
 * ⚠ 이 검증관은 '지어낸 것'을 잡고 '빠뜨린 것'은 잡지 못한다.
 *   빠뜨림은 형식 조립(scripts/format.mjs)에서 잡는다.
 */
import { readText, readJson, writeJson, splitRaw, paths, norm, green, red, yellow, dim, bold } from './lib/util.mjs';

/** 원문에 실재하는지 비교하기 위해 공백·기호를 제거한 검색용 문자열 */
const flat = (s) => (s || '').replace(/[\s.,·|/\-–—()[\]"'"'`~]/g, '').toLowerCase();

export function verify(rawText, draft) {
  const { meta, body } = splitRaw(rawText);
  const haystack = flat(body + ' ' + (meta.제목 || '') + ' ' + (meta.설명 || ''));
  const 초안 = norm(draft);

  const 미확인 = [];

  // 1) 날짜·숫자 — 원문에 없는 숫자를 지어냈는지
  for (const m of 초안.matchAll(/\d[\d,]*/g)) {
    const n = m[0].replace(/,/g, '');
    if (n.length < 2) continue; // 한 자리 숫자는 우연 일치가 많아 제외
    if (!haystack.includes(n)) 미확인.push({ 종류: '숫자', 값: m[0] });
  }

  // 2) 고유명사 후보 — 한글 2자 이상 덩어리 중 원문에 없는 것
  for (const m of 초안.matchAll(/[가-힣]{2,}/g)) {
    const w = m[0];
    if (w.length < 3) continue;
    if (!haystack.includes(flat(w))) 미확인.push({ 종류: '표현', 값: w });
  }

  // 3) 빈칸 표시는 '못 찾았다'는 정직한 신고다. 환각이 아니므로 통과시킨다.
  const 빈칸 = [...초안.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);

  return {
    판정: 미확인.length === 0 ? '통과' : '불일치',
    미확인,
    빈칸,
  };
}

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error('사용법: node scripts/verify.mjs <id>');
    process.exit(1);
  }
  const p = paths(id);
  const raw = readText(p.raw);
  const draft = readText(p.draft);
  if (!raw || !draft) {
    console.error('raw.md 또는 draft.md가 없습니다. 초안까지 만든 뒤 실행하세요.');
    process.exit(1);
  }

  const r = verify(raw, draft);
  const review = readJson(p.review, {}) ?? {};
  writeJson(p.review, { ...review, 사실검증: r });

  if (r.판정 === '통과') {
    console.log(`${green('✓ 통과')} ${bold(id)}  초안의 고유명사·숫자가 모두 원문에 있습니다`);
  } else {
    console.log(`${red('✗ 불일치')} ${bold(id)}  원문에서 찾을 수 없는 항목 ${r.미확인.length}건`);
    for (const u of r.미확인.slice(0, 12)) console.log(`    ${u.종류}: ${u.값}`);
    if (r.미확인.length > 12) console.log(dim(`    … 외 ${r.미확인.length - 12}건`));
    console.log(dim('  ※ 조사·어미가 붙어 갈라진 경우도 걸립니다. 사람이 눈으로 한 번 보세요.'));
  }
  if (r.빈칸.length) {
    console.log(yellow(`  빈칸 ${r.빈칸.length}개: ${r.빈칸.join(', ')}`));
    console.log(dim('  빈칸은 환각이 아니라 "못 찾았다"는 신고입니다. 사람이 채우세요.'));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
