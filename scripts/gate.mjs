#!/usr/bin/env node
/**
 * 2. 문지기 — AI에 넣을 가치가 있는지 판정한다.
 *
 *   node scripts/gate.mjs <id>          한 건
 *   node scripts/gate.mjs --all         work/ 전체
 *
 * 이 판정은 일부러 LLM을 쓰지 않는다. 규칙이 닫혀 있어 기계로 끝나고,
 * LLM에 물으면 "넣어도 될까요?"를 LLM이 답하는 순환이 된다.
 *
 * 반려는 실패가 아니라 정상 경로다. 사람에게 직접 입력을 요청하는 갈래로 간다.
 */
import { readText, splitRaw, saveMeta, paths, config, listIds, green, red, yellow, dim, bold } from './lib/util.mjs';

const 사유설명 = {
  로그인_필요: '로그인해야 열리는 페이지입니다',
  빈_게시판: '게시판 틀만 있고 글 내용이 없습니다',
  봇_차단: '보안 확인·차단 페이지입니다',
  내용_부족: '본문이 하한에 못 미칩니다',
  화면요소만: '메뉴·버튼 같은 화면 문자열만 추출됐습니다',
  이미지_전용: '본문 없이 이미지만 있습니다 (포스터·전단)',
};

export function judge(raw, gate) {
  const { meta, body } = splitRaw(raw);
  const 본문 = body.replace(/\s+/g, ' ').trim();
  const 설명 = (meta.설명 || '').trim();
  const 이미지수 = Number(meta.이미지수 || 0);
  const 검사대상 = 본문.toLowerCase();

  const hit = (list) => list.filter((w) => 검사대상.includes(w.toLowerCase()));

  // 순서가 곧 우선순위다. 구체적인 사유를 먼저 붙여야 재시도 담당이 올바로 판단한다.
  if (hit(gate.봇차단_표지).length) return { 판정: '반려', 사유: '봇_차단', 본문길이: 본문.length };
  if (hit(gate.로그인월_표지).length && 본문.length < gate.수집_계속_하한.값)
    return { 판정: '반려', 사유: '로그인_필요', 본문길이: 본문.length };
  if (hit(gate.빈게시판_표지).length) return { 판정: '반려', 사유: '빈_게시판', 본문길이: 본문.length };

  const ui = hit(gate.화면요소_표지);
  if (본문.length < gate.화면요소_판정.최대길이 && ui.length >= gate.화면요소_판정.최소일치)
    return { 판정: '반려', 사유: '화면요소만', 본문길이: 본문.length, 걸린표지: ui };

  if (본문.length < gate.이미지전용_판정.본문최대 && 이미지수 >= gate.이미지전용_판정.이미지최소)
    return { 판정: '반려', 사유: '이미지_전용', 본문길이: 본문.length };

  // 본문 하한은 메타데이터로 면제되지 않는다.
  // 잘린 페이지 설명을 본문으로 합산하면 '충분' 오판이 나고, 그 오판이 곧 환각으로 이어진다.
  if (본문.length < gate.본문_하한.값)
    return { 판정: '반려', 사유: '내용_부족', 본문길이: 본문.length, 설명길이: 설명.length };

  return { 판정: '통과', 본문길이: 본문.length };
}

function run(id, gate) {
  const raw = readText(paths(id).raw);
  if (!raw) {
    console.log(`${yellow('?')} ${id}  raw.md 없음 — 먼저 수집하세요`);
    return null;
  }
  const r = judge(raw, gate);
  if (r.판정 === '통과') {
    console.log(`${green('✓ 통과')} ${bold(id)}  본문 ${r.본문길이}자`);
    saveMeta(id, { 단계: '통과', 반려사유: null });
  } else {
    console.log(`${red('✗ 반려')} ${bold(id)}  ${r.사유} — ${사유설명[r.사유]} (본문 ${r.본문길이}자)`);
    console.log(dim('        → 사람에게 직접 입력을 요청하세요. 이건 실패가 아니라 정상 경로입니다.'));
    saveMeta(id, { 단계: '반려', 반려사유: r.사유 });
  }
  return r;
}

async function main() {
  const args = process.argv.slice(2);
  const gate = config('gate.json');
  const ids = args.includes('--all') ? listIds() : args.filter((a) => !a.startsWith('--'));
  if (!ids.length) {
    console.error('사용법: node scripts/gate.mjs <id> | --all');
    process.exit(1);
  }
  const results = ids.map((id) => run(id, gate)).filter(Boolean);
  if (ids.length > 1) {
    const pass = results.filter((r) => r.판정 === '통과').length;
    console.log(`\n${bold('합계')} 통과 ${pass} / 반려 ${results.length - pass}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
