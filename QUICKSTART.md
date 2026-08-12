# 5분 안에 돌려보기

**필요한 것: Node.js 18 이상. 그게 전부입니다.** `npm install` 없습니다. API 키도, 데이터베이스도 없습니다.

```bash
git clone https://github.com/myorange-io/weekly-newsletter-agent
cd weekly-newsletter-agent
node --version   # v18 이상이면 됩니다
```

---

## 1. 문지기가 무엇을 하는지 60초 만에 보기

이게 이 저장소에서 제일 중요한 장면입니다. 저장소에 예제 두 개가 들어 있습니다 —
**정상 공고 페이지**와 **글이 하나도 없는 빈 게시판**입니다.

```bash
node scripts/collect.mjs examples/good-page.html  --id 예제-교육
node scripts/collect.mjs examples/empty-board.html --id 예제-빈게시판
node scripts/gate.mjs --all
```

```
✓ 통과 예제-교육  본문 473자
✗ 반려 예제-빈게시판  빈_게시판 — 게시판 틀만 있고 글 내용이 없습니다 (본문 54자)
        → 사람에게 직접 입력을 요청하세요. 이건 실패가 아니라 정상 경로입니다.
```

빈 게시판이 AI에 닿기 **전에** 멈췄습니다. 이게 없으면 AI는 주소와 재단 이름만 보고
존재하지 않는 사업명과 마감일을 만들어냅니다. 실제로 겪은 일입니다.

## 2. 사실 검증관이 환각을 잡는 것 보기

초안에 **없는 조직 이름**을 일부러 넣어봅니다.

```bash
echo '한국청소년재단 | 청소년 진로 캠프 참가자 모집 (~11/30)' > work/예제-교육/draft.md
node scripts/verify.mjs 예제-교육
```

```
✗ 불일치 예제-교육  원문에서 찾을 수 없는 항목 3건
    숫자: 11
    표현: 한국청소년재단
    표현: 청소년
```

지어낸 재단 이름도, 없는 마감 월도 걸립니다. **LLM 호출 없이, 문자열 대조만으로.**

## 3. 형식 조립이 AI 손을 떠나 있는 것 보기

```bash
echo '예시재단 | 비영리 실무자 데이터 활용 교육 참가자 모집!' > work/예제-교육/draft.md
node scripts/format.mjs 예제-교육
```

```
✓ 예제-교육 형식 조립 완료
    느낌표 제거(인용 안은 유지)
    마감일 조립: (~9/12)

  예시재단 | 비영리 실무자 데이터 활용 교육 참가자 모집 (~9/12)
```

마감일 `2026-09-12`는 분류가가 `fields.json`에 뽑아둔 값입니다. **그걸 문장에 끼우는 일은 코드가 합니다.**
오렌지레터에서 이 조립을 AI에게 맡겼을 때 실패율이 31%였습니다.

## 4. 나머지

```bash
node scripts/publish.mjs --email   # out/newsletter.html — 브라우저로 열어보세요
node scripts/publish.mjs --card    # out/cards.txt
node scripts/status.mjs            # 지금 무엇이 어디까지 왔나
node scripts/retry.mjs             # 다시 시도할 것 (미리보기)
node scripts/triage.mjs            # 이번 주 실패 진단
```

`node scripts/status.mjs`:

```
  수집   게이트  분류   초안   검증   확정     항목
  ──────────────────────────────────────
    ●    ●    ●    ●    ●    ●    예제-교육  확정
    ●    ●    ·    ·    ·    ·    예제-빈게시판  반려: 빈_게시판

  전체 2 · 확정 1 · 반려 1 · 진행중 0
```

---

## 진짜 URL로 해보기

```bash
node scripts/collect.mjs https://실제주소 --id 내첫번째
node scripts/gate.mjs 내첫번째
```

수집가가 2단계를 밟습니다 — 직접 받아보고, 본문이 부족하면 리더 서비스로 재시도합니다.

## AI가 맡는 자리 — Claude Code를 쓴다면

분류·초안·비평 세 자리는 사람의 판단이 필요해서 스크립트로 안 됩니다.
`.claude/agents/`에 정의가 들어 있어서 **클론한 폴더에서 Claude Code를 열면 바로 잡힙니다.**

```
> classifier 에이전트로 예제-교육 분류해줘
> drafter 로 초안 만들어줘
> critic 불러서 초안 봐줘
```

자기 프로젝트에서 쓰려면 `.claude/agents/*.md`와 `scripts/`, `config/`를 통째로 복사하세요.

## AI가 맡는 자리 — ChatGPT·Claude 웹만 쓴다면

각 에이전트 파일의 절차와 지킬 것을 그대로 붙여 쓰면 됩니다. **한 번에 한 명씩** 부르는 게 핵심입니다.
특히 초안가와 비평가는 **반드시 대화창을 새로 열어서** 부르세요. 같은 창에서 이어 물으면 자기 글을 방어합니다.

---

## 그다음 — 내 조직으로 갈아끼우기

파일 세 개만 고치면 됩니다.

| 파일 | 무엇 |
|---|---|
| [`config/categories.md`](config/categories.md) | 분류 체계 — 조직의 분류로 바꾸세요 |
| [`config/voice-rules.md`](config/voice-rules.md) | 문체 규칙 — **오렌지레터 것이 채워져 있습니다. 통째로 지우고 당신 것으로 바꾸세요** |
| [`config/gate.json`](config/gate.json) | 게이트 하한선 — 처음엔 그대로 두고, 반려된 걸 눈으로 본 뒤 조이세요 |

그리고 [PORTING.md](PORTING.md)를 읽으세요. 일을 어디서 잘라야 하는지에 대한 규칙 네 개입니다.

## 예제를 지우고 싶다면

```bash
rm -rf work out
```
