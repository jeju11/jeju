# 프론트엔드 · 제주 상권 비교

제주데이터허브 608번 자료를 지역·관광객 구분·기간별로 나눠 토요일과 일요일의 카드 이용을 비교하는 화면입니다. HTML, CSS, 브라우저 자바스크립트로 구성했습니다.

## 실행

1. [프로젝트 README](../README.md)의 방법으로 백엔드를 실행합니다.
2. 브라우저에서 `http://127.0.0.1:8000/`을 엽니다.

백엔드가 `/`에서 화면을, `/assets/`에서 CSS와 자바스크립트를 제공합니다. 같은 주소의 `/api/` 경로를 호출하므로 브라우저에서 HTML 파일을 직접 여는 대신 백엔드 주소로 접속합니다.

## 화면 사용법

1. 질문을 입력하고 **비교하기**를 누릅니다. `Enter`로 보내고 `Shift+Enter`로 줄을 바꿀 수 있습니다. **예시로 비교하기**는 두 지역의 마지막 공통 관측 월을 바로 비교합니다.
2. 자유 질문은 NVIDIA 키가 필요합니다. **조건 직접 선택**에서는 키 없이도 지역·관광객 유형·기간·지표를 선택해 비교할 수 있습니다. 결과에서 **다시 비교하기**를 누르면 이전 분석에 이어 질문할 수 있습니다.
3. 결과의 핵심 결론, 숫자 카드, 차트, 분석 조건과 출처를 차례로 확인합니다. 지역을 비교할 때는 공통 관측 월과 관광객 유형의 토·일 수치를 합산합니다. 한 달 비교에는 막대 차트, 여러 달의 월별 수치가 있으면 선 차트를 표시합니다. 정확한 월별 값은 표에서 확인할 수 있습니다.
4. 질문에 지역이나 기간이 빠져 확인이 필요하면 선택지가 표시됩니다. 자료가 없는 기간은 실제 조회 가능 범위와 출처를 안내합니다. 요청 오류가 나면 입력한 질문과 조건을 유지한 채 **다시 시도**할 수 있습니다.
5. **회의용 요약 복사**는 대상·기간·수치·출처를 복사합니다. 608번 자료는 업종을 구분하지 않으며, 확인되지 않은 금액 단위는 **원자료 단위**로 표시합니다. 합성 데이터로 실행할 때는 데모임을 표시합니다.

## 파일

| 파일 | 역할 |
|---|---|
| `index.html` | 질문, 예시, 직접 선택과 분석 결과 영역 |
| `assets/styles.css` | 반응형 화면, 입력·버튼과 상태 표시, 수치·차트 스타일 |
| `assets/app.js` | API 요청, 대화 조건, 보충 질문과 재시도 |
| `assets/results.js` | API 수치를 연결한 결과 카드·차트·표·출처와 요약 복사 |

v0의 JSX와 스타일시트를 기존 HTML·CSS·JavaScript 구조에 옮겼습니다. 화면의 지역과 수치는 기존 API 응답을 사용합니다. [v0 원본](https://v0.app/yutaaa/chat/jeju-commercial-area-comparison-mY4jLHnnQSo)

<details>
<summary>이전 디자인의 제주 이미지 생성 프롬프트</summary>

이전 디자인에서 사용한 이미지는 Codex 내장 이미지 생성 도구로 만든 뒤 WebP로 저장했습니다.

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
