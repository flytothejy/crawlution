# Crawlution (가제)

곤충 진화 스네이크 — 애벌레로 시작해 먹고, 감싸고, 탈피하며 최종 곤충까지 진화하는 io 스타일 게임.

## 실행

```bash
npm install
npm run dev      # 개발 서버
npm test         # 게임 로직 자동 점검(화면 없이)
npm run build    # dist/index.html 한 파일로 빌드
```

## 구조

- `src/shared/` — 게임 로직(시뮬레이션). 화면을 모르며 Web Worker·서버·테스트에서 그대로 돈다.
  - `config.ts` 밸런스 값, `sim.ts` 시뮬레이션, `bot.ts` 봇 AI, `rng.ts` 시드 고정 난수
- `src/client/` — 화면(PixiJS)과 조작. 시뮬레이션이 보낸 상태를 보간해서 그리기만 한다.
- `test/` — 로직 자동 점검
