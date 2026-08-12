#!/usr/bin/env node
/**
 * 9. 정비공 — 주 1회, 그 주 실패를 모아 원인별로 진단하고 처방을 제안한다.
 *
 *   node scripts/triage.mjs
 *
 * 두 가지를 지킨다:
 *  1) 처방은 제안까지만. config를 자동으로 고쳐 쓰지 않는다 — 사람이 승인한다.
 *  2) 고칠 게 없어도 보고한다. 아무 소리도 안 나는 자동화는
 *     잘 돌아가는 것과 죽은 것을 구분할 수 없다.
 */
import { listIds, loadMeta, readText, splitRaw, paths, config, green, red, yellow, dim, bold } from './lib/util.mjs';

const 처방 = {
  내용_부족: {
    진단: '본문이 하한에 못 미침',
    제안: 'config/gate.json 의 수집_계속_하한을 확인하세요. 리더 폴백이 실제로 돌았는지 raw.md의 수집경로를 보세요. 폴백이 돌았는데도 짧다면 그 사이트는 구조적으로 못 읽습니다.',
  },
  화면요소만: {
    진단: '메뉴·버튼 문자열만 추출됨',
    제안: 'config/gate.json 의 화면요소_표지에 이 사이트의 UI 문구를 추가하면 더 일찍 걸러집니다.',
  },
  봇_차단: {
    진단: '보안 확인 페이지',
    제안: '실행 위치(IP)를 바꿔보세요. 국내 사이트가 해외 IP를 막는 경우가 흔합니다. 재시도로는 안 풀립니다.',
  },
  로그인_필요: { 진단: '로그인해야 열림', 제안: '구조적 실패입니다. 복구 불가 목록에 넣고 사람이 직접 입력하세요.' },
  빈_게시판: { 진단: '글 내용이 없음', 제안: '주소에 글 번호가 빠졌을 수 있습니다. 제보 단계에서 주소를 다시 받으세요.' },
  이미지_전용: { 진단: '포스터·전단 이미지', 제안: '구조적 실패입니다. 이미지 안 글자를 읽으려면 OCR이 필요합니다 — 별도 과업입니다.' },
};

async function main() {
  const ids = listIds();
  const 실패 = [];
  const 미실행 = [];

  for (const id of ids) {
    const m = loadMeta(id) ?? {};
    if (m.단계 === '반려') 실패.push({ id, 사유: m.반려사유, 출처: m.출처 });
    else if (!m.단계) 미실행.push({ id, 출처: m.출처 });
  }

  console.log(bold(`정비 보고  (전체 ${ids.length}건)`));
  console.log('');

  if (!실패.length && !미실행.length) {
    // 이 줄이 이 스크립트의 존재 이유 절반이다.
    console.log(`${green('✓ 이번 주 수정사항 없음')} — 전 건이 통과했거나 이미 처리됐습니다.`);
    console.log(dim('  (고칠 게 없어도 보고합니다. 침묵은 고장과 구분되지 않습니다.)'));
    return;
  }

  const 묶음 = {};
  for (const f of 실패) (묶음[f.사유] ??= []).push(f);

  for (const [사유, list] of Object.entries(묶음)) {
    const p = 처방[사유] ?? { 진단: '알 수 없음', 제안: '사람이 직접 봐야 합니다.' };
    console.log(`${red('■')} ${bold(사유)}  ${list.length}건 — ${p.진단}`);
    for (const f of list.slice(0, 5)) console.log(dim(`    ${f.id}  ${f.출처 ?? ''}`));
    if (list.length > 5) console.log(dim(`    … 외 ${list.length - 5}건`));
    console.log(`    ${yellow('처방')} ${p.제안}`);
    console.log('');
  }

  if (미실행.length) {
    console.log(`${yellow('■')} ${bold('기록 없음')}  ${미실행.length}건 — 실패가 아니라 아예 실행되지 않았습니다`);
    console.log(`    ${yellow('처방')} node scripts/retry.mjs --run 으로 주워 담으세요.`);
    console.log('');
  }

  console.log(dim('※ 이 스크립트는 config를 고치지 않습니다. 제안만 하고 판단은 사람이 합니다.'));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
