#!/usr/bin/env node
/**
 * 1. 수집가 — 원자료에서 본문 텍스트를 확보한다.
 *
 *   node scripts/collect.mjs <URL|파일경로> [--id 이름]
 *
 * 2단계 전략:
 *   1차 — 직접 받아서 태그를 걷어낸다 (빠르고 무료)
 *   2차 — 1차 결과가 config/gate.json의 수집_계속_하한에 못 미치면 리더 서비스로 재시도
 *
 * 원문을 요약·가공하지 않는다. 뒤에서 사실 대조를 하려면 원본이 남아 있어야 한다.
 * 잘 뽑혔는지 판정하는 일은 문지기(scripts/gate.mjs)가 한다 — 여기서 하지 않는다.
 */
import { existsSync } from 'node:fs';
import { readText, writeText, saveMeta, paths, config, green, yellow, dim, bold } from './lib/util.mjs';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 추적 파라미터 제거 + 끝 슬래시 정리 */
export function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|igshid|ref$|source$)/i.test(k)) u.searchParams.delete(k);
    }
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return raw;
  }
}

/**
 * 태그를 걷어내고 본문 텍스트만 남긴다. 파서 없이 정규식으로 — 의존성을 만들지 않기 위해.
 *
 * nav·header·footer·aside를 반드시 먼저 제거한다. 이걸 빠뜨리면 "홈으로 로그인 회원가입
 * 검색 사이트맵" 같은 화면 문자열이 본문에 섞여 들어가고, 문지기가 멀쩡한 페이지를
 * '화면요소만'으로 반려하거나 빈 게시판을 '로그인 필요'로 잘못 분류한다.
 * (이 저장소를 만들면서 실제로 두 번 다 냈던 버그다.)
 */
export function stripHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const pick = (html, re) => (html.match(re)?.[1] ?? '').trim();

export function extractMeta(html) {
  return {
    제목:
      pick(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) ||
      stripHtml(pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i)),
    설명: pick(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i),
    이미지수: (html.match(/<img\b/gi) || []).length,
  };
}

async function fetchHtml(url, { reader = false } = {}) {
  const target = reader ? `https://r.jina.ai/${url}` : url;
  const res = await fetch(target, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { html: await res.text(), finalUrl: res.url || target };
}

async function main() {
  const args = process.argv.slice(2);
  const src = args.find((a) => !a.startsWith('--'));
  if (!src) {
    console.error('사용법: node scripts/collect.mjs <URL|파일경로> [--id 이름]');
    process.exit(1);
  }
  const idFlag = args.indexOf('--id');
  const id =
    idFlag >= 0
      ? args[idFlag + 1]
      : (src.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9가-힣]+/g, '-').slice(0, 40) || 'item') +
        '-' + String(Math.abs([...src].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7)) % 10000);

  const gate = config('gate.json');
  const 하한 = gate.수집_계속_하한.값;

  let html, source, url = null;

  if (existsSync(src)) {
    // 로컬 파일 — 오프라인에서도 예제를 돌려볼 수 있게
    html = readText(src);
    source = '로컬 파일';
    console.log(dim(`  로컬 파일에서 읽음: ${src}`));
  } else {
    url = normalizeUrl(src);
    if (url !== src) console.log(dim(`  주소 정리: ${src}\n           → ${url}`));
    try {
      ({ html } = await fetchHtml(url));
      source = '직접 받음';
    } catch (e) {
      console.log(yellow(`  1차 실패(${e.message}) → 리더로 재시도`));
      html = '';
      source = '실패';
    }
  }

  let meta = extractMeta(html);
  let body = stripHtml(html);

  // 2차 — 1차 본문이 하한에 못 미치면 리더 폴백
  if (url && body.length < 하한) {
    console.log(yellow(`  1차 본문 ${body.length}자 < 하한 ${하한}자 → 리더 폴백`));
    try {
      const r = await fetchHtml(url, { reader: true });
      const rbody = stripHtml(r.html);
      if (rbody.length > body.length) {
        body = rbody;
        source = '리더 폴백';
        if (!meta.제목) meta = { ...extractMeta(r.html), 이미지수: meta.이미지수 };
      }
    } catch (e) {
      console.log(yellow(`  리더도 실패: ${e.message}`));
    }
  }

  const p = paths(id);
  // 메타와 본문을 구분자로 나눠 저장한다. 합쳐 두면 문지기가 메타를 본문으로 오인한다.
  writeText(
    p.raw,
    `---\n제목: ${meta.제목 || ''}\n주소: ${url || src}\n설명: ${meta.설명 || ''}\n이미지수: ${meta.이미지수 || 0}\n수집경로: ${source}\n---\n\n${body}\n`
  );
  saveMeta(id, {
    id,
    출처: url || src,
    수집시각: new Date().toISOString(),
    수집경로: source,
    단계: '수집됨',
  });

  console.log(`${green('✓')} ${bold(id)}  본문 ${body.length}자 · ${source}`);
  console.log(dim(`  → ${p.raw}`));
  console.log(dim(`  다음: node scripts/gate.mjs ${id}`));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
