# Jeju Data Agent 백엔드와 데이터 명세

FastAPI가 브라우저 화면과 API를 같은 주소에서 제공합니다. 월별 카드 집계는 DuckDB로 계산하고, 자연어 입력을 쓰는 경우 NVIDIA NIM이 지역·관광객 구분·기간·지표를 선택합니다.

**[심사 및 실행 안내](../README.md) · [사용자 화면](../frontend/README.md) · [운영 시연](https://jeju-data-agent.vercel.app/)**

## 실행

저장소 루트에서 Python 3.12로 준비합니다.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r .\backend\requirements.txt
.\backend\start.cmd
```

앱은 `http://127.0.0.1:8000`, API 문서는 `http://127.0.0.1:8000/docs`에서 열립니다. 중지는 실행 창에서 `Ctrl+C`를 누릅니다.

실제 데이터나 개발용 NVIDIA 키를 사용할 때는 저장소 루트에서 다음 명령으로 설정 파일을 만듭니다.

```powershell
if (-not (Test-Path .\backend\.env)) {
    Copy-Item .\backend\.env.example .\backend\.env
}
```

이미 `backend/.env`가 있다면 기존 파일에서 필요한 항목을 수정합니다. 상대 CSV 경로는 `backend` 폴더를 기준으로 해석합니다. `.env` 변경 사항은 서버를 다시 시작한 뒤 반영됩니다.

## 실제 608번 자료 연결

`JEJU_DATA_CSV`가 비어 있으면 `data/demo_608.csv`를 읽습니다. 이는 제주시·서귀포시 구도심의 2025년 1~3월을 가정한 **합성 데모**입니다.

심사용 ZIP의 실제 수집본을 사용할 때는 `jeju_608.csv`와 `jeju_608.json`을 함께 `backend/data/`에 두고 `backend/.env`에 `JEJU_DATA_CSV=data/jeju_608.csv`를 설정합니다. 데이터 API 키는 재수집할 때 필요합니다. 시작 후 `GET /api/options`의 `mode=real`을 확인합니다.

GitHub 소스에서 새로 수집하는 순서는 다음과 같습니다.

1. [제주데이터허브 608번](https://jejudatahub.net/data/view/data/608)을 프로젝트에 담습니다. `backend/.env`의 `JEJU_HUB_PROJECT_KEY`에 프로젝트키를 설정합니다. [공식 API 안내 HWP](https://www.jejudatahub.net/api/file?fileId=1501&id=1069)
2. 저장소 루트에서 아래 명령으로 두 구도심을 수집합니다. 실제 토·일 관측은 **2016년 9월~2017년 11월**에 두 구도심과 두 관광객 구분 모두 확인됐습니다.

   ```powershell
   .\.venv\Scripts\python.exe -X utf8 .\backend\jeju_hub.py --start 2016-09 --end 2017-11
   ```

3. `backend/.env`에 `JEJU_DATA_CSV=data/jeju_608.csv`를 설정하고 서버를 다시 실행합니다. 수집기는 `data/jeju_608.csv`와 수집일·요청 기간·SHA-256을 기록한 `data/jeju_608.json`을 함께 저장합니다. 앱은 시작할 때 파일을 검증하고 읽습니다.

수집기는 HWP의 월 범위와 `districtType`을 보내고 `hasMore`에 따라 페이지를 읽습니다. 조회·검증 오류가 나면 기존 파일을 보존합니다. 다른 경로에 저장하려면 `--output`, 한 지구만 수집하려면 `--district`를 사용합니다.

## 데이터 스키마와 집계 기준

| CSV 열 | 형식 |
| --- | --- |
| `month` | 관측 월 `YYYY-MM` |
| `district` | 원자료의 지구 이름 |
| `visitor_type` | `domestic` 내국인 관광객 또는 `chinese` 중국인 관광객. 기존 5열 CSV는 `구분 정보 없음`으로 읽습니다. |
| `weekday` | `월요일`부터 `일요일`까지의 전체 이름 |
| `transactions` | 카드 이용 횟수. 쉼표나 단위 없는 0 이상의 정수 |
| `amount` | 원자료의 `useCost`. 0 이상의 정수이며, 수집본은 금액 단위를 확인하기 전까지 원자료 단위로 표시합니다. |

`month,district,visitor_type,weekday` 조합은 고유해야 합니다. 선택한 지구·관광객 구분에서 토요일과 일요일이 모두 있는 달만 비교합니다. 실제 자료는 **기간 합계**로 표시하며, 월 전체 집계가 확인된 경우 `JEJU_FULL_MONTH_COVERAGE=true`로 설정해 일평균을 계산할 수 있습니다. 현재 수집본은 과거 관측 자료입니다.

집단 비교에서는 선택된 모든 집단에 토·일 관측이 있는 공통 월을 사용합니다. 응답의 `group_wins`는 기간 전체에서 토요일·일요일이 우세하거나 동률인 집단 수입니다. 각 집단의 `monthly_wins`는 요일별 우세 월과 동률 월의 수입니다. `monthly_winner`는 더 많은 달에 앞선 요일이며 우세 월 수가 같으면 `null`입니다. 기간 전체와 월별 우세 요일이 모두 있고 서로 다르면 `monthly_reversal`이 참입니다. 일평균을 사용하는 경우 전체 기간 일평균은 기간 합계를 해당 요일의 전체 일수로 나눕니다.

실제 수집본의 420행은 15개 월 × 2개 지역 × 2개 관광객 유형 × 7개 요일의 집계입니다. 이용자나 개별 거래 행 수와 구분합니다. 이용조건은 제주데이터허브 제공 조건을 따르며, 공공데이터포털 동명 항목은 이용허락범위에 제한이 없다고 표시합니다. 참가자는 수집본의 심사용 ZIP 동봉을 운영진에게 확인했습니다. [공공데이터포털](https://www.data.go.kr/data/15094893/openapi.do)

## NVIDIA 자연어 분석

[NVIDIA Build](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b)에서 개발용 API 키를 발급받아 `backend/.env`의 `NVIDIA_API_KEY`에 넣고 서버를 다시 시작합니다. 모델 기본값은 `nvidia/nemotron-3.5-lightning-30b-a3b`입니다. 백엔드는 질문과 현재 선택, 지원 지구·관광객 유형·관측월 목록을 NVIDIA에 전달합니다. 모델은 단일 비교, 집단 비교, 월별 추이, 관측 범위 조회 중 맞는 도구를 고릅니다. 카드 수치는 DuckDB에서 계산합니다.

실제 자료 모드에서는 `두 구도심 모두 토요일 소비가 더 많았어?`에 이어 `그 차이가 매달 비슷했어?`, `그럼 서귀포만 보면?`, `올해도 그래?`를 입력할 수 있습니다. 후속 질문은 직전 분석의 조건을 이어받고, 요청한 시점의 관측이 없으면 조회 가능한 기간을 반환합니다. 키 미설정이나 연결 실패 시 지역 메뉴, 월별 비교 버튼과 **비교 조건**을 사용해 직접 집계할 수 있습니다.

대표 자유 질문은 `2017년 11월 두 구도심 모두 토요일과 일요일 카드 이용 건수를 비교해줘.`입니다. 요청의 지역·기간·지표가 도구 인자로 연결되는지 확인할 수 있습니다. 키 설정 여부와 실제 호출 성공은 각각 설정 응답과 질문 제출로 확인합니다.

`NVIDIA_MODEL`에 기본값과 다른 모델을 설정했다면 해당 모델에 먼저 요청합니다. NVIDIA가 HTTP `502`, `503`, `504`를 반환하면 같은 키와 분석 조건으로 기본 모델에 한 번 더 요청합니다.

Git에는 빈 키가 들어 있는 `.env.example`과 합성 데모 CSV를 포함합니다. 로컬 `.env`, 실제 수집 CSV와 메타데이터 JSON은 Git 제외 목록에 들어 있습니다. 대회 심사용 NVIDIA 키는 공개 저장소와 별도로 준비합니다. [대회 공식 규정](https://daker.ai/public/hackathons/jeju-ai-bigdata-agent-challenge)

## API

| 경로 | 용도 |
| --- | --- |
| `GET /api/options` | 데이터 모드, 지역·관광객 구분별 비교 가능 월과 공통 비교월(`comparison_months`), 지표, NVIDIA 키 설정 여부 |
| `POST /api/compare` | `district`, `visitor_type`, `start_month`, `end_month`, `metric`으로 비교 |
| `POST /api/compare-groups` | `start_month`, `end_month`, `metric`과 선택 사항인 `district`, `visitor_type`으로 집단별 토·일 합계와 월별 추이 조회 |
| `POST /api/agent` | `question`, 직전 분석 조건 `context`, 집단 비교 화면 조건 `group_context`로 분석 실행, 관측 범위 안내 또는 보충 질문 반환 |

`/api/agent`의 `status`는 분석 성공 `ok`, 자료 범위 안내 `coverage`, 보충 질문 `clarify`입니다. 도구는 `compare_weekdays`, `compare_groups`, `monthly_trend`, `inspect_coverage`, `clarify`를 허용합니다. 도구 및 인자 검증 후 수치 계산을 수행합니다.

실제 자료 연결 후 아래 요청으로 대표 수치를 확인할 수 있습니다.

```powershell
$selection = @{
    district = $null
    visitor_type = $null
    start_month = '2017-11'
    end_month = '2017-11'
    metric = 'transactions'
} | ConvertTo-Json
$comparison = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/compare-groups' -Method Post -ContentType 'application/json' -Body $selection
$comparison.groups | Group-Object district | ForEach-Object {
    $total = ($_.Group | ForEach-Object { $_.rows } | Measure-Object -Property total -Sum).Sum
    [pscustomobject]@{ District = $_.Name; Transactions = $total }
}
```

기대값은 제주시 구도심 27,347건과 서귀포시 구도심 22,103건입니다. 합성 데모에서는 해당 기간을 조회할 수 없습니다.

## 테스트와 오류 대응

저장소 루트에서 다음 명령으로 테스트합니다.

```powershell
Push-Location .\backend
..\.venv\Scripts\python.exe -m unittest discover -s tests -v
Pop-Location
```

백엔드 테스트 37개는 CSV 검증과 중복 처리, 공통 관측월 계산, 월별 우세 판정, 모델 도구 호출과 오류·재시도 동작을 포함합니다. 테스트의 모델 응답은 제어된 입력을 사용하며 실제 API 호출은 별도 대표 질문으로 검증합니다.

| 증상 | 확인 방법 |
| --- | --- |
| 서버 시작 실패 | Python 3.12 및 의존성 설치 여부, 8000 포트 사용 여부 확인 |
| 합성 데모 표시 | 환경 변수의 CSV 경로 확인 후 서버 재시작 |
| CSV 해시·검증 오류 | 동일 수집본의 CSV와 JSON을 함께 복원 |
| AI 인증·한도·연결 오류 | 키·할당량·외부 HTTPS 접속 확인. 데이터 둘러보기에서 직접 비교 가능 |
| 조회 조건에 자료 없음 | 지원 지역·관광객 유형·관측 기간을 확인하고 조건 조정 |

로컬 실행에서 카드 집계는 DuckDB가 수행합니다. NVIDIA에 전달하는 정보는 질문과 선택 조건, 조회 가능한 지역·관광객 유형·월 목록입니다. 수집한 카드 집계 행은 로컬에서 계산합니다. 실제 센터 PC의 외부 접속과 평가용 키는 탑재 시 확인합니다.
