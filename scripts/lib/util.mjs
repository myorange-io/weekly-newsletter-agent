/**
 * 공용 유틸. 의존성 없음 (Node 18+ 내장 기능만 사용).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const WORK = join(ROOT, 'work');

export const readJson = (p, fallback = null) =>
  existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback;

export const writeJson = (p, obj) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
};

export const readText = (p, fallback = '') =>
  existsSync(p) ? readFileSync(p, 'utf8') : fallback;

export const writeText = (p, s) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, s, 'utf8');
};

export const config = (name) => readJson(join(ROOT, 'config', name));

/** work/<id>/ 경로들 */
export const paths = (id) => ({
  dir: join(WORK, id),
  meta: join(WORK, id, 'meta.json'),
  raw: join(WORK, id, 'raw.md'),
  fields: join(WORK, id, 'fields.json'),
  draft: join(WORK, id, 'draft.md'),
  review: join(WORK, id, 'review.json'),
  final: join(WORK, id, 'final.md'),
});

export const listIds = () =>
  existsSync(WORK)
    ? readdirSync(WORK, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
        .map((d) => d.name)
        .sort()
    : [];

export const loadMeta = (id) => readJson(paths(id).meta);

export const saveMeta = (id, patch) => {
  const p = paths(id).meta;
  writeJson(p, { ...(readJson(p, {}) ?? {}), ...patch });
};

/**
 * raw.md는 앞부분에 메타 헤더(제목/주소/설명)를, 그 뒤에 본문을 담는다.
 * 문지기가 '메타데이터를 본문으로 오인'하지 않으려면 반드시 분리해서 읽어야 한다.
 */
export function splitRaw(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: text.trim() };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2].trim() };
}

/** 볼드 마커·연속 공백을 지운 비교용 문자열 */
export const norm = (s) => (s || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

/** 터미널 색 (색을 못 쓰는 환경이면 그냥 통과) */
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
export const green = c(32);
export const red = c(31);
export const yellow = c(33);
export const dim = c(2);
export const bold = c(1);
