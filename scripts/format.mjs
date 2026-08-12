#!/usr/bin/env node
/**
 * 4-b. 초안가의 형식 조립·부호 강제 — AI가 아니라 코드가 한다.
 *
 *   node scripts/format.mjs <id>
 *
 * 왜 코드인가: 오렌지레터 실측에서 사람이 초안을 고친 편집의 75%가 문체가 아니라
 * 형식·필드 교정이었다. 특히 마감일을 사람이 붙인 138건 중 128건은 날짜가 이미
 * 추출돼 있었다 — 뽑기는 했는데 문장에 끼우지 못한 것이다.
 * 프롬프트를 더 잘 쓸 일이 아니라 AI에게서 뺏어올 일이다.
 */
import { readText, readJson, writeText, paths, config, green, yellow, dim, bold } from './lib/util.mjs';

/** 유사 파이프 문자를 표준 '|'로. 이게 어긋나면 뒤의 모든 형식 판정이 깨진다. */
const normalizePipes = (s) => s.replace(/[ㅣ｜│]/g, '|').replace(/\s*\|\s*/g, ' | ');

/**
 * 설정값은 `[...]` 또는 `{ "_설명": "...", "값": [...] }` 두 형태를 모두 허용한다.
 * 설명을 붙일 수 있어야 받은 사람이 무엇을 고치는지 안다.
 */
const val = (x) => (Array.isArray(x) ? x : (x?.값 ?? x));

/**
 * 조직명이 들어 있는 칸의 위치. 채용은 `경력구분 | 조직명 | 직무` 라 두 번째다.
 * 이걸 틀리면 R1이 엉뚱한 칸의 공백을 지운다.
 */
const 조직명칸 = (분류) => (분류 === '채용' ? 1 : 0);

export function applyFormat(draft, fields, rules) {
  const 기록 = [];
  let t = normalizePipes(draft.trim());
  if (t !== draft.trim()) 기록.push('유사 파이프 문자를 | 로 통일');

  // R6) 해시태그·이모지 제거
  const r6 = t.replace(/#[^\s|]+/g, '').replace(/\p{Extended_Pictographic}/gu, '');
  if (r6 !== t) { t = r6; 기록.push('R6 해시태그·이모지 제거'); }

  // R2) 큰따옴표 → 작은따옴표
  const r2 = t.replace(/[""]/g, "'").replace(/"/g, "'");
  if (r2 !== t) { t = r2; 기록.push('R2 큰따옴표 → 작은따옴표'); }

  // R1·R3) 조직명 칸: 내부 공백 제거 + 나열 기호를 가운뎃점으로
  const 칸 = t.split('|').map((s) => s.trim());
  const i = 조직명칸(fields?.분류);
  if (칸.length > i + 1) {
    const 전 = 칸[i];
    let 후 = 전.replace(/\s*[xX&]\s+|\s+[xX&]\s*/g, '·').replace(/\s*,\s*/g, '·');
    후 = 후.replace(/\s+/g, ''); // R1 — 나열 기호 처리 뒤에 공백을 지운다
    if (후 !== 전) {
      칸[i] = 후;
      t = 칸.join(' | ');
      기록.push(`R1·R3 조직명 정리: "${전}" → "${후}"`);
    }
  }

  // R4-a) 문장 끝 마침표 제거 (중간 마침표는 유지)
  const before = t;
  t = t.replace(/\.\s*$/, '');
  if (t !== before) 기록.push('R4 끝 마침표 제거');

  // R4-b) 느낌표 제거 — 단, 인용부호 안은 남긴다 (인터뷰 인용)
  if (/!/.test(t)) {
    t = t.replace(/!+/g, (m, off) => {
      const before = t.slice(0, off);
      const quotes = (before.match(/["'"']/g) || []).length;
      return quotes % 2 === 1 ? m : ''; // 홀수면 따옴표 안
    });
    기록.push('R4 느낌표 제거(인용 안은 유지)');
  }

  // R14) 부제 대시 → 작은따옴표.
  // 반드시 R4 뒤에 온다. 먼저 감싸면 끝의 느낌표까지 따옴표 안으로 들어가고,
  // 그러면 R4가 그걸 인용문으로 오인해 살려둔다. (실제로 낸 버그다.)
  const r14 = t.replace(/\s+[-–—]\s+([^|'"()]+?)\s*$/, " '$1'");
  if (r14 !== t) { t = r14; 기록.push('R14 부제를 작은따옴표로'); }

  // R5) 마감일 조립 — 날짜가 있는데 문장에 없으면 끝에 붙인다
  const 마감 = fields?.마감일;
  const 마감표현 = fields?.마감표현;
  if ((val(rules.마감_붙일_분류) ?? []).includes(fields?.분류)) {
    const 이미있음 = /\(\s*~/.test(t);
    if (!이미있음 && 마감) {
      const [, m, d] = 마감.match(/^\d{4}-(\d{2})-(\d{2})$/) ?? [];
      if (m) {
        t = `${t} (~${Number(m)}/${Number(d)})`;
        기록.push(`R5 마감일 조립: (~${Number(m)}/${Number(d)})`);
      }
    } else if (!이미있음 && 마감표현) {
      t = `${t} (${마감표현})`;
      기록.push(`R5 마감 표현 조립: (${마감표현})`);
    } else if (!이미있음 && !마감 && !마감표현) {
      기록.push('⚠ 마감일 없음 — 사람이 확인해야 합니다');
    }
  }

  // 4) 공백 정리
  t = t.replace(/[ \t]{2,}/g, ' ').trim();

  return { 결과: t, 기록 };
}

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error('사용법: node scripts/format.mjs <id>');
    process.exit(1);
  }
  const p = paths(id);
  const draft = readText(p.draft);
  if (!draft) {
    console.error('draft.md가 없습니다. 초안가를 먼저 돌리세요.');
    process.exit(1);
  }
  const fields = readJson(p.fields, {}) ?? {};
  const rules = config('format.json');

  const { 결과, 기록 } = applyFormat(draft, fields, rules);
  writeText(p.draft, 결과 + '\n');

  console.log(`${green('✓')} ${bold(id)} 형식 조립 완료`);
  if (기록.length) for (const l of 기록) console.log(`    ${l.startsWith('⚠') ? yellow(l) : l}`);
  else console.log(dim('    고칠 것 없음'));
  console.log(`\n  ${결과}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
