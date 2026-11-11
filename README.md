# 제주 상권 주말 소비 비교

제주데이터허브 608번 자료로 제주시·서귀포시 구도심의 과거 주말 카드 이용을 비교하는 MVP입니다. 지역·관광객 구분·기간을 골라 토요일과 일요일을 비교합니다.

| 폴더 | 내용 |
| --- | --- |
| [frontend](frontend/README.md) | 한국어 대시보드, 조건 선택, 비교 차트와 계산 근거, 자연어 질문 |
| [backend](backend/README.md) | FastAPI, DuckDB 집계, 608번 API 수집과 로컬 저장, NVIDIA NIM 도구 호출 |

## Windows에서 실행

저장소 루트에서 Python 3.12로 실행 환경을 준비합니다.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r .\backend\requirements.txt
.\backend\start.cmd
```

브라우저에서 `http://127.0.0.1:8000`을 엽니다. 실제 데이터를 수집해 CSV 경로를 설정하면 **실제 데이터**로 실행되고, 경로가 비어 있으면 **합성 데모**로 실행됩니다. 수집 명령과 NVIDIA 설정은 [백엔드 README](backend/README.md)를 참고하세요.
