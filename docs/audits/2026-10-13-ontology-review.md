# 온톨로지·연결 감사 — 2026-10-13

## 결론

형식 무결성은 정상. 의미와 표시까지 “모두 정확”하지는 않다. 먼저 최신 History의 프로젝트 범위·대상 연결, G65 변형 공정 연결, 공용 NG 경로를 통한 과도한 프로젝트 확장, 맵의 순서·Component 표시를 수정해야 한다.

검토 기준은 로컬 SQLite revision **247**. 객체 **1,043**, 관계 **1,906**. 개인 작업자 한 명과 여러 조회 사용자를 가정했다. 검토는 읽기 전용으로 수행했으며, 이 문서와 재실행 가능한 진단 스크립트만 추가했다. DB·앱 코드·비밀번호·클라우드 데이터·배포는 변경하지 않았다.

## 정상 확인

- SQLite 외래키 오류 0, 관계 ID/형식 검증 오류 0, 동일 type/from/to/scope 관계 중복 0, SQL 열과 JSON 객체 간 불일치 0.
- 활성 프로젝트 LS, MOBIS + HELLA, SMT. 옛 TEM·HELLA 프로젝트는 archived. 활성 프로젝트의 범위 지정 관계에 membership이 빠진 끝점 0.
- 프로젝트에 적용되는 global/scoped 관계를 합쳐 확인한 `precedes`, `part_of`, `reports_to` 순환 0.
- G65 Main 정상 경로는 ICT → FW download → Router → Integration → LAM assembly → Stacking → EOL → Visual inspection → Packing.
- RH Router는 Component 5종, 수량 1+2+2+2+2=9. 생산 이론 산출량이지 WIP 실적이 아니다.
- LAM은 manual로 설명돼 있다. 이전의 LAM 머신 4개와 개별 NG 노드는 archived이며, 관련 옛 관계도 DB에 남아 있다. 현재 활성 맵/AI의 archived 필터와 별개로 보존된 역사 관계 자체를 “실제 활성 설비”로 해석하면 안 된다.
- 공용 NG Storage → 원래 검사 공정의 rework, 미복구 → Scrap 구조 존재.
- 내부 SMT와 Starpro SMT는 별도 객체. SMT의 Line 1/2와 PCB 5개 분리. 수량·설비·제조사 SKU 미확정은 그대로 유지.
- Jose Luis·이정호 및 TEM 팀은 LS와 MOBIS + HELLA에서 canonical ID를 공유. Kakao 계정과 동명 실인물은 자동 병합되지 않았다.
- History 업무 Event와 WIP/Progress는 별도 분류. 계획·보고와 현재 DB 상태 변경은 분리돼 있다.
- 관련 회귀 테스트 **20개 통과**. 테스트 통과는 아래 의미/표시 결함이 없다는 보증이 아니다.

## 우선 수정

### 1. [P1] 최신 History 62건이 프로젝트 맵에 나타나지 않음

`history-store.js:58`에서 library scope로 저장하면 `scope.kind='unassigned'`가 된다. `history.js:38–40`은 unassigned Event를 프로젝트 History에서 제외한다. 최신 62건 모두 이 상태다. 예: `history-event-3522818e-0c4e-4e75-b680-14349d5f0ba7`는 T1XL에 연결돼 있지만 LS History에서는 제외된다.

**영향:** 연결된 공정/Part가 있어도 사용자 프로젝트의 History 숫자·중요 사건 표시가 비어 보인다.

**최소 수정:** 검토된 Event에 명시적 프로젝트 범위를 부여하거나, 실제 공유 사건에만 `shared`를 사용한다. 불확실한 사건은 unassigned를 유지하고 검토 큐에 노출한다. 원문이나 기록 시각은 다시 만들지 않는다.

### 2. [P1] 카톡 방 이름을 실제 사건 라인으로 추정한 연결

`history-event-8e9584fd-251a-43e0-9b1f-866d36a44f82`는 Push pin 정지 후속 보고인데 `records_on → LDM`이다. 이 Event의 `follows_up` 대상 `history-event-9268e5e2-c27a-43ad-a605-fee540ea7e43`는 Nexlide 전기 패널 작업이고 `records_on → Nexlide`다. 두 보고의 원문 문맥은 동일한 Nexlide 작업이다.

공항 자재 등록 지원 요청 `history-event-7c73a2ff-abb5-42b1-b5fc-8b9ca6af0c5f`도 LS Production 방에서 왔다는 이유로 LDM에 연결돼 있다. 방에서 언급됐다는 사실이 생산 라인 귀속의 근거는 아니다. 최신 Event 중 LDM 직접 대상 연결은 42건이나, 42건 전부 잘못됐다고 단정하지는 않는다.

**영향:** 잘못된 라인에 문제 숫자가 증가하고, 다른 라인 문제를 LDM 책임으로 읽게 된다.

**최소 수정:** 확정된 동일 episode의 후속 문맥과 명시된 대상만 이용한다. `source room`은 출처, `records_on`은 실제 대상, 문맥 연결은 `historyRole:'context'`로 구분한다. NXD의 실제 설비/라인은 명시 확인 전 확정하지 않는다.

### 3. [P1] G65 Upper/Lower·LH/RH 4개가 공정과 끊겨 있음

`obj-muufiui2-mvvq8`, `obj-muufiui3-fn0dr`, `obj-muufiui3-wehtb`, `obj-muufiui3-sgotg`는 G65 family 아래에만 `part_of`로 연결돼 있다. 실제 `progress.steps(LS,variantId)` 결과는 4개 모두 **0개**. G65 Main은 **9개**다. Family 분류 관계는 생산 route 관계를 대신하지 않는다.

**영향:** 사용자가 세부 변형을 선택하면 맵/Progress에 공정이 없거나 입력 공정 매칭이 실패한다.

**최소 수정:** G65 Main 아래의 변형 tier를 정리하고, 확인된 공통 공정을 `applies_to`로 변형마다 연결한다. RH Upper에만 예시가 있는 Component BOM을 LH/Lower까지 자동 복제하지 않는다. 분류 family, route product, 변형, Component는 서로 다른 역할이다.

### 4. [P1] G65 경로 추가가 다른 제품 경로까지 끌어옴

`projects.js:75–86`의 `membershipCandidates(...,includeRoute=true)`는 `on_failure/rework_of`를 양방향으로 계속 따라간다. 공용 NG Storage가 여러 Part 경로를 연결하므로 G65 Main 하나를 새 프로젝트에 추가하는 읽기 전용 재현에서 **164개 객체·72개 공정·18개 archived 객체**가 추가 대상으로 나온다. LQ2, T1XL, T1-2 등 총 16개 product/variant도 따라온다.

**영향:** Part 하나를 연결할 때 프로젝트와 맵이 관련 없는 제품으로 오염된다.

**최소 수정:** 선택 Part의 정상 route를 먼저 정한다. 공용 NG/Scrap은 context로 포함하되 거기서 다른 Part의 검사 route로 확장하지 않는다. archived 객체는 기본 후보에서 제외한다.

### 5. [P1] DB에 기록된 일부 순서 화살표가 맵에서 사라짐

`workflow.js:266`은 개별 Part lane의 edges만 가져온다. LS에서 `tem-smt-step-0`과 `tem-smt-step-1` 모두 보이지만 `precedes` 관계 `rel-muxkffy6-q630m`가 network edges에서 빠진다. 실제 SMT template의 **9개 순서 관계**가 누락된다. 서로 다른 lane에 걸친 실제 공정 의존성도 같은 원리로 누락될 수 있다.

**영향:** DB에 있는 순서가 없거나 미확정처럼 보인다.

**최소 수정:** 현재 map에 두 끝점이 있는 실제 `precedes` 관계를 포함하고, 그 근거로 순서 확정 여부를 계산한다. 단순 정렬 순서로 화살표를 만들면 안 된다.

## 표시·검토 구조 수정

### 6. [P2] Router Component 중복 표시·See Components 우회

`workflow.js:278`의 line-output 확장은 `Resource/line`뿐 아니라 이미 map에 있는 Production Step의 `produces`까지 포함한다. G65 Main Router의 5개 Component가 satellite와 별도 support node로 중복 나온다. `obj-muufiui3-dioma` / `rel-muufiui4-7zrs0`가 재현 예다. See Components를 꺼도 support node는 남는다.

**최소 수정:** 이 확장은 실제 line Resource의 output에만 적용. 공정의 Component는 기존 scoped satellite 경로 한 곳에서 표시한다. route ID를 Component 자신의 ID로 잘못 넣지 않는다.

### 7. [P2] 다중 선택이 공용 설비의 다른 occurrence까지 강조

`app.js:600`은 chip의 entity ID로만 관련성을 판단한다. G65 ICT와 Router를 선택하면 공용 ICT `obj-muufiui3-kiome`가 T1XL ICT `ls-step-t1xl-ict` 옆에 표시된 occurrence까지 강조되는데 그 공정/edge는 muted다.

**최소 수정:** canonical entity 선택과 화면 occurrence를 구분한다. satellite의 step/relation ID를 유지하고, 실제 선택된 공정에 incident한 occurrence만 강조한다. 공용 설비 자체를 선택했을 때는 모든 직접 사용 공정을 보여준다.

### 8. [P2] History 인물 연결이 충분하지 않음

최신 62 Event 중 **15개**는 `reported_by`가 없다. **12개**는 서로 다른 authorId의 메시지를 묶었는데 연결된 reporter는 0~1명이다. 원문 sender/authorId는 보존돼 있지만, map의 사람 탐색에서는 일부 보고자·대응자가 보이지 않는다.

**최소 수정:** source authorId 기반 계정 identity를 실인물과 구분해 연결한다. 같은 이름만으로 canonical 사람과 합치지 않는다. 여러 발신자를 묶을 때 primary reporter, 다른 report contributors, 실제 performer, 요청 수신자를 구분한다. `history-store.js`의 `reporterIds`/`performerId`/`recipientId` 기능을 재사용하되 역할을 추정하지 않는다.

### 9. [P2] 확인 필요 9건이 UI에서 보이지 않음

`history-store.js:159`는 최신 30개 job만 반환한다. 현재 확인 필요 9개 중 그 결과에 포함된 것은 1개. `history-view.js:47`은 Event candidate가 0개인 검토 job을 모두 숨긴다. 따라서 unresolved 원문이 보존돼도 사용자가 검토할 경로가 없다.

또한 `history-store.js:45`는 Event 0개로 source-only 처리한 committed job도 새 추출을 막는다. 최신 실행의 source-only 69개는 일반 reprocessing 경로로 다시 검토할 수 없다.

**최소 수정:** pending/unresolved job을 최신 완료 job과 별도로 조회. Event 0개라도 검토 버튼과 원문을 표시. 이미 저장된 Event의 중복을 막으면서 source-only 판정을 재검토하는 명시적 동작을 제공한다.

### 10. [P2] AI 질문에 연결 근거·route scope가 빠짐

`map-assistant.js:2,9–10`은 canonical `context`, `operatorAction`, Resource `resourceKind`, 관계 `evidence`·`routePartId` 등을 AI 입력에서 빼고 있다. 실제 `BL7m PE P · Automatic Router`의 context에는 고객 route/BOM/설비가 unverified라는 설명이 있지만 AI chip에는 이름·planned·productionStage만 남는다. 재사용한 template와 확정된 실공정의 차이를 충분히 전달하지 못한다.

**최소 수정:** 공개 허용된 짧은 uncertainty/operation 설명과 관계의 evidence·routePartId·reviewState를 포함한다. 원문 카톡·Evidence 전체나 비밀값을 넣는 방식으로 해결하지 않는다.

### 11. [P2] 향후 revision·child line 연결 누락 가능

읽기 전용 synthetic 재현에서 `workflow.js:377`은 parent Part 선택 시 `revision_of`로 연결된 revision material을 satellite에서 누락한다. `workflow.js:300`은 parent TEM 선택 시 child line에만 연결된 `supports_line` 팀·인원을 누락한다. 현재 DB에서 같은 구조가 모두 쓰이는 것은 아니지만 실제 지원하는 관계 규칙과 renderer가 일치하지 않는다.

**최소 수정:** 기존 `part_of/revision_of` closure를 Part/material 필터와 공유한다. line hierarchy를 먼저 정하고 해당 child line의 support 팀을 확장한다.

### 12. [P2] 관계 이름의 의미를 validator가 충분히 강제하지 않음

`ontology-model.js:204–223`은 type 쌍을 확인하지만 `operated_in` 대상이 실제 line인지, `stored_at` 대상이 실제 보관 공간인지 확인하지 않는다. 메모리 테스트에서 공정 `operated_in → machine`, PCB `stored_at → machine`가 모두 허용된다. 현재 DB의 해당 관계가 모두 잘못됐다는 뜻은 아니며, 향후 입력 실수를 막지 못하는 결함이다.

**최소 수정:** 기존 `supports_line` 검증처럼 `operated_in`은 line, `stored_at`은 확인된 storage facility를 요구한다. BOM/family 관계도 별도 용도를 명시하고, 기존 데이터 전수검사를 거친 뒤 규칙을 강화한다.

## 권장 정리 순서

1. 원문·기록 시각을 유지한 채 최신 Event 범위/잘못된 대상 링크와 검토 큐를 먼저 정정.
2. G65 family → Main/Side Marker/Cornering → 변형 tier와 확인된 공통 route 정리.
3. 공용 NG/Scrap의 route 확장을 차단하고 active/historical 관계를 명확히 분리.
4. 기록된 순서·Component 단일 표시·occurrence별 강조 수정.
5. 보고자 계정/실인물 매핑과 AI의 근거 전달 강화.
6. 회귀 테스트, 로컬 사용자 확인. 배포는 별도 승인 후.

## 미확정·검토 한계

- G65 LH/Lower의 자세한 BOM과 수량, 실제 설비 asset ID·SKU, 개별 작업자/shift 배정은 자료·현장 확인 없이 보증할 수 없다.
- 내부 SMT 생산과 Starpro 공급은 혼동하지 않으며, JP-RH를 Jewelry Piece로 임의 확정하지 않는다.
- 보존된 같은 이름의 사람 두 명은 자동 duplicate로 판정하지 않았다. authorId가 다른 Juan Manuel 계정도 같은 사람이라고 가정하지 않았다.
- archived LAM/NG 객체는 역사 보존으로 인정했으며, 활성 맵에 실제 노출되는지와 별개다.
- 실시간 cloud 데이터·실제 사용자 로그인·공장 물리 상태·원문 첨부 이미지 내용은 이번 감사에서 검증하지 않았다.
- private cloud publication은 Event details를 주로 전달하고 unresolved/source-only 검토 큐를 전달하지 않는 한계가 있다. 자동으로 모든 원문을 업로드하라는 권고가 아니며, 별도 개인정보 검토와 명시적 업로드 승인 필요.

## 재실행 근거

`node docs/audits/2026-10-13-connections-audit.js`는 SQLite를 `readOnly:true`로 열고 핵심 결과를 재현한다. 기존 앱의 store 초기화, importer, 배포를 호출하지 않는다. 각 관계의 문서 근거 문자열은 존재하지만, 문자열이 존재한다는 것만으로 현장 사실이 확정되지는 않는다.
