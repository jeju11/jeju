# 제주 상권 브리핑

제주데이터허브 608번 자료로 제주시·서귀포시 구도심 관광객의 토요일과 일요일 카드 이용을 비교합니다. 지역을 직접 선택하거나 자연어로 질문하고, 오른쪽 결과 패널에서 토·일 비교표, 월별 수치, 집계 방식과 출처를 확인할 수 있습니다. 실제 수집본의 관측 기간은 **2016년 9월~2017년 11월**입니다.

| 폴더 | 내용 |
| --- | --- |
| [frontend](frontend/README.md) | 대화 화면, 지역 선택, 결과 패널, 요약 복사 |
| [backend](backend/README.md) | FastAPI, DuckDB 집계, 608번 API 수집과 로컬 저장, NVIDIA NIM 도구 호출 |

## Windows에서 실행

저장소 루트에서 Python 3.12로 실행 환경을 준비합니다.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r .\backend\requirements.txt
.\backend\start.cmd
```

브라우저에서 [제주 상권 브리핑](http://127.0.0.1:8000/)을 엽니다. 별도 설정 없이 실행하면 합성 데모로 지역별 비교와 월별 수치를 볼 수 있습니다.

- **실제 자료**를 사용하려면 608번 데이터를 수집한 뒤 `backend/.env`에 CSV 경로를 설정합니다.
- **자유 질문**을 사용하려면 같은 파일에 NVIDIA API 키를 설정합니다. 지역 메뉴와 월별 비교 버튼은 NVIDIA 키 없이도 작동합니다.

`backend/.env.example`을 복사해 로컬 설정 파일 `backend/.env`를 만들고, 설정 변경 후에는 서버를 다시 시작합니다. 설정 방법과 수집 명령은 [백엔드 README](backend/README.md)를 참고하세요.

## Vercel 배포

저장소 루트에서 Vercel 프로젝트를 연결합니다. 루트의 `app.py`가 FastAPI를 불러오며, 같은 배포 주소에서 화면과 `/api/` 경로를 제공합니다.

1. Vercel 프로젝트의 **Settings → Environment Variables**에서 배포 환경에 `JEJU_DATA_CSV=data/jeju_608.csv`와 `NVIDIA_API_KEY`를 설정합니다. 로컬에서 모델을 별도로 지정했다면 `NVIDIA_MODEL`도 설정합니다.
2. `backend/data/jeju_608.csv`와 수집 정보 파일 `backend/data/jeju_608.json`이 있는 상태에서 루트에서 `npx vercel --prod`를 실행합니다. 실제 데이터 파일은 로컬에 있으므로 CLI가 이 파일들을 배포에 포함합니다. 로컬 `.env`는 배포에서 제외합니다.
3. 배포 주소의 `/api/options`에서 `mode`가 `real`이고 `ai_available`이 `true`인지 확인합니다. 홈에서 예시 질문과 자유 질문을 각각 제출해 결과를 확인합니다.
