# 프론트엔드 · 제주 상권 브리핑

제주데이터허브 608번 자료를 지역·관광객 구분·기간별로 나눠 토요일과 일요일의 카드 이용을 비교하는 화면입니다. HTML, CSS, 브라우저 자바스크립트로 구성했습니다.

## 실행

1. [프로젝트 README](../README.md)의 방법으로 백엔드를 실행합니다.
2. 브라우저에서 `http://127.0.0.1:8000/`을 엽니다.

백엔드가 `/`에서 화면을, `/assets/`에서 CSS와 자바스크립트를 제공합니다. 같은 주소의 `/api/` 경로를 호출하므로 브라우저에서 HTML 파일을 직접 여는 대신 백엔드 주소로 접속합니다.

## 화면 사용법

1. 화면 위에서 자료의 기간을 확인합니다. 첫 화면의 질문과 답변은 연결된 자료로 실행한 기본 비교입니다. **예시 데이터로 보는 화면입니다**가 표시되면 합성 데모입니다.
2. 왼쪽 메뉴에서 **두 구도심 모두**, **제주시 구도심**, **서귀포시 구도심** 중 하나를 고르면 비교 결과가 대화에 추가됩니다. 휴대폰에서는 **메뉴**에서 지역을 고릅니다.
3. NVIDIA 키를 설정했다면 하단 입력창에서 질문하고 후속 질문을 이어갑니다. `Enter`로 보내고 `Shift+Enter`로 줄을 바꿉니다. **새 질문**은 화면의 대화와 분석 조건을 초기화합니다. **그 차이가 매달 비슷했나요?**는 해당 답변에 쓰인 조건으로 월별 결과를 계산합니다. 지역 메뉴와 이 버튼은 집계 API를 직접 사용합니다.
4. 답변의 **월별 수치와 출처 보기**를 누르면 오른쪽 패널에서 토·일 비교표와 출처를 바로 확인할 수 있습니다. 월별 수치, 막대 차트, 집계 방식은 필요한 항목을 펼쳐서 봅니다. **회의용 요약 복사**로 대상·기간·요일별 수치·계산 방식·출처를 복사합니다. 브라우저가 클립보드를 제한하면 복사할 텍스트를 표시합니다.
5. 메뉴의 **비교 조건**에서 지역·관광객 구분·기간·지표를 바꿉니다. 한 지역의 한 관광객 유형을 보려면 **한 지역·관광객 유형 따로 비교하기**를 펼칩니다. **올해도 그래?**처럼 자료 범위를 묻는 답변에서는 **조회 기간과 출처 보기**로 요청 기간과 실제 관측 기간을 확인합니다.

## 파일

| 파일 | 역할 |
|---|---|
| `index.html` | 지역 메뉴, 대화 화면, 질문 입력창과 비교 근거 창 |
| `assets/styles.css` | 반응형 대화 레이아웃, 해안 가장자리의 흰색 그라데이션, 토·일 비교 차트 |
| `assets/app.js` | 대화와 분석 조건, API 요청, 차트·표·요약 복사 |
| `assets/jeju-coast-dialogue.webp`, `assets/hallabong.webp` | 흰 배경에 이어지는 제주 해안·돌하르방과 한라봉 이미지 |

왼쪽 메뉴와 하단 질문창은 사용자가 선택한 대화형 목업을 반영했습니다. 쉬운 질문 문구와 출처를 확인하는 흐름은 [GOV.UK Chat 디자인 사례](https://insidegovuk.blog.gov.uk/2026/08/19/designing-gov-uk-chat-for-the-gov-uk-app/)를 참고했습니다.

<details>
<summary>제주 이미지 생성 프롬프트</summary>

페이지의 이미지는 Codex 내장 이미지 생성 도구로 만든 뒤 WebP로 저장했습니다.

- `assets/jeju-coast-dialogue.webp` — Use case: photorealistic-natural. Create a standalone, unmasked panoramic editorial PHOTOGRAPH asset that recreates only the coastal scene inside the supplied webpage screenshot. The screenshot is a scene/composition reference ONLY. The output must be an edge-to-edge natural photograph, with no web interface, no fruit, no text, no margins and no fade. Very wide and shallow panorama 3:1 if possible, because it will be a white webpage hero with its edges faded in CSS. Place an authentic single Jeju dol hareubang of gray-black porous basalt at approximately 77% of the image width, facing camera slightly turned, the round stone hat and face and hands clearly recognizable at small scale, with a coast footpath on its right. Keep the figure completely within the frame from top of hat to hands; put some sky above it. The left two-thirds is a peaceful Jeju shoreline as in the reference: clear deep blue sea and white surf, black lava rocks, green low volcanic coastal headland in middle distance, a clean light-blue sky; quiet neighborhood buildings only far back. The horizontal coast is prominent with a true straight horizon. Natural midday daylight, finely textured, calm documentary South Korean travel photograph, colors true to life with subtle contrast. Keep useful space around important details to permit CSS fading on top, bottom and edges. No typography, no logo, no fake bokeh, no vignette, no illustration, no collage, no graphic border, no film retouch and no white compositing in the output.
- `assets/hallabong.webp` — Use case: photorealistic-natural. Asset type: square regional selector photo for a Korean community website. A close up editorial photograph of one ripe Jeju Hallabong citrus with its unmistakable prominent raised knob at stem, and one smaller fruit beside it. A single attached muted leaf, fruit resting on cream-colored natural paper in directional soft daylight, simple ample margins, subject centered and fills about three quarters. Fine pores on pebbled orange skin, authentic Hallabong shape, muted natural warm palette, documentary food photography. Recognizable at small size, no text, no logos, no graphics, no border, no 3D render, no unnaturally glossy fruit.

</details>

## 백엔드 연동

| 경로 | 용도 |
|---|---|
| `GET /api/options` | 데이터 모드, 지역·관광객 구분별 비교 가능 월과 공통 비교월, 지표, NVIDIA 키 설정 여부 |
| `POST /api/compare` | 선택한 지역·관광객 구분(`visitor_type`)·기간·지표의 요일별 비교 결과 조회 |
| `POST /api/compare-groups` | 선택한 지역·관광객 구분의 공통 기간으로 그룹별 요일 결과와 월별 추이 조회 |
| `POST /api/agent` | 질문과 직전 분석 조건을 보내 분석 결과, 관측 범위 또는 확인 질문 받기 |

숫자는 백엔드 집계 결과로 표시합니다. NVIDIA API 키와 데이터 접근 설정은 [백엔드 README](../backend/README.md)를 참고합니다.
