# 백엔드

FastAPI가 브라우저 화면과 API를 같은 주소에서 제공합니다. 월별 카드 집계는 DuckDB로 계산하고, 자연어 입력을 쓰는 경우 NVIDIA NIM이 지역·관광객 구분·기간·지표를 선택합니다.

## 실행

저장소 루트에서 Python 3.12로 준비합니다.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r .\backend\requirements.txt
.\backend\start.cmd
```

앱은 `http://127.0.0.1:8000`, API 문서는 `http://127.0.0.1:8000/docs`에서 열립니다. 중지는 실행 창에서 `Ctrl+C`를 누릅니다.

## 데이터 연결

`JEJU_DATA_CSV`가 비어 있으면 `data/demo_608.csv`를 읽습니다. 이는 제주시·서귀포시 구도심의 2025년 1~3월을 가정한 **합성 데모**입니다.

1. [제주데이터허브 608번](https://jejudatahub.net/data/view/data/608)을 프로젝트에 담습니다. `backend/.env`의 `JEJU_HUB_PROJECT_KEY`에 프로젝트키를 설정합니다. [공식 API 안내 HWP](https://www.jejudatahub.net/api/file?fileId=1501&id=1069)
2. 저장소 루트에서 아래 명령으로 두 구도심을 수집합니다. 실제 토·일 관측은 **2016년 9월~2017년 11월**에 두 구도심과 두 관광객 구분 모두 확인됐습니다.

   ```powershell
   .\.venv\Scripts\python.exe -X utf8 .\backend\jeju_hub.py --start 2016-09 --end 2017-11
   ```

3. `backend/.env`에 `JEJU_DATA_CSV=data/jeju_608.csv`를 설정하고 서버를 다시 실행합니다. 수집기는 `data/jeju_608.csv`와 수집일·요청 기간·SHA-256을 기록한 `data/jeju_608.json`을 함께 저장합니다. 앱은 시작할 때 파일을 검증하고 읽습니다.

수집기는 HWP의 월 범위와 `districtType`을 보내고 `hasMore`에 따라 페이지를 읽습니다. 조회·검증 오류가 나면 기존 파일을 보존합니다. 다른 경로에 저장하려면 `--output`, 한 지구만 수집하려면 `--district`를 사용합니다.

| CSV 열 | 형식 |
| --- | --- |
| `month` | 관측 월 `YYYY-MM` |
| `district` | 원자료의 지구 이름 |
| `visitor_type` | `domestic` 내국인 관광객 또는 `chinese` 중국인 관광객. 기존 5열 CSV는 `구분 정보 없음`으로 읽습니다. |
| `weekday` | `월요일`부터 `일요일`까지의 전체 이름 |
| `transactions` | 카드 이용 횟수. 쉼표나 단위 없는 0 이상의 정수 |
| `amount` | 원자료의 `useCost`. 0 이상의 정수이며, 수집본은 금액 단위를 확인하기 전까지 원자료 단위로 표시합니다. |

`month,district,visitor_type,weekday` 조합은 고유해야 합니다. 선택한 지구·관광객 구분에서 토요일과 일요일이 모두 있는 달만 비교합니다. 실제 자료는 **기간 합계**로 표시하며, 월 전체 집계가 확인된 경우 `JEJU_FULL_MONTH_COVERAGE=true`로 설정해 일평균을 계산할 수 있습니다. 현재 수집본은 과거 관측 자료입니다.

전체 그룹 비교에서는 모든 그룹에 토·일 관측이 있는 공통 월을 사용합니다. 응답에는 그룹별 기간 집계와 월별 결과, 토요일·일요일·동률로 집계된 월 수가 들어갑니다. 일평균을 사용하는 경우 전체 기간 일평균은 기간 합계를 해당 요일의 전체 일수로 나눕니다.

## NVIDIA 자연어 분석

[NVIDIA Build](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b)에서 개발용 API 키를 발급받아 `backend/.env`의 `NVIDIA_API_KEY`에 넣고 서버를 다시 시작합니다. 모델 기본값은 `nvidia/nemotron-3.5-lightning-30b-a3b`입니다. 백엔드는 질문과 현재 선택, 지원 지구·관광객 유형·관측월 목록을 NVIDIA에 전달합니다. 모델은 단일 비교, 집단 비교, 월별 추이, 관측 범위 조회 중 맞는 도구를 고릅니다. 카드 수치는 DuckDB에서 계산합니다.

실제 자료 모드에서는 `두 구도심 모두 토요일 소비가 더 많았어?`에 이어 `그 차이가 매달 비슷했어?`, `그럼 서귀포만 보면?`, `올해도 그래?`를 입력할 수 있습니다. 후속 질문은 직전 분석의 조건을 이어받고, 요청한 시점의 관측이 없으면 조회 가능한 기간을 반환합니다. 키 미설정이나 연결 실패 시 화면의 조건 선택을 사용합니다.

`.env`와 실제 CSV는 Git 제외 목록에 들어 있습니다. 대회 제출 시 제주데이터허브 데이터 API 키의 발급·설정 방법을 문서에 적고, 심사에 필요한 외부 AI API의 평가용 키는 최신 대회 규정에 따라 별도로 준비합니다. [대회 공식 규정](https://daker.ai/public/hackathons/jeju-ai-bigdata-agent-challenge)

## API와 테스트

| 경로 | 용도 |
| --- | --- |
| `GET /api/options` | 데이터 모드, 지역·관광객 구분별 비교 가능 월과 공통 비교월(`comparison_months`), 지표, NVIDIA 키 설정 여부 |
| `POST /api/compare` | `district`, `visitor_type`, `start_month`, `end_month`, `metric`으로 비교 |
| `POST /api/compare-groups` | `start_month`, `end_month`, `metric`과 선택 사항인 `district`, `visitor_type`으로 집단별 토·일 합계와 월별 추이 조회 |
| `POST /api/agent` | `question`, 직전 분석 조건 `context`, 집단 비교 화면 조건 `group_context`로 분석 실행, 관측 범위 안내 또는 보충 질문 반환 |

저장소 루트에서 다음 명령으로 테스트합니다.

```powershell
Push-Location .\backend
..\.venv\Scripts\python.exe -m unittest discover -s tests -v
Pop-Location
```
