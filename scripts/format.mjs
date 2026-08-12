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

export function applyFormat(draft, fields, rules) {
  const 기록 = [];
  let t = normalizePipes(draft.trim());
  if (t !== draft.trim()) 기록.push('유사 파이프 문자를 | 로 통일');

  // 1) 문장 끝 마침표 제거 (중간 마침표는 유지)
  const before = t;
  t = t.replace(/\.\s*$/, '');
  if (t !== before) 기록.push('끝 마침표 제거');

  // 2) 느낌표 제거 — 단, 인용부호 안은 남긴다 (인터뷰 인용)
  if (/!/.test(t)) {
    t = t.replace(/!+/g, (m, off) => {
      const before = t.slice(0, off);
      const quotes = (before.match(/["'"']/g) || []).length;
      return quotes % 2 === 1 ? m : ''; // 홀수면 따옴표 안
    });
    기록.push('느낌표 제거(인용 안은 유지)');
  }

  // 3) 마감일 조립 — 날짜가 있는데 문장에 없으면 끝에 붙인다
  const 마감 = fields?.마감일;
  const 마감표현 = fields?.마감표현;
  if ((val(rules.마감_붙일_분류) ?? []).includes(fields?.분류)) {
    const 이미있음 = /\(\s*~/.test(t);
    if (!이미있음 && 마감) {
      const [, m, d] = 마감.match(/^\d{4}-(\d{2})-(\d{2})$/) ?? [];
      if (m) {
        t = `${t} (~${Number(m)}/${Number(d)})`;
        기록.push(`마감일 조립: (~${Number(m)}/${Number(d)})`);
      }
    } else if (!이미있음 && 마감표현) {
      t = `${t} (${마감표현})`;
      기록.push(`마감 표현 조립: (${마감표현})`);
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
