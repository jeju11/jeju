"""Load one normalized dataset and compare the two weekend weekdays."""

from __future__ import annotations

import calendar
import csv
import os
import re
from collections import defaultdict
from fractions import Fraction
from hashlib import sha256
from io import StringIO
from pathlib import Path
from threading import Lock
from typing import Annotated, Literal, Self

import duckdb
from pydantic import AfterValidator, AwareDatetime, BaseModel, ConfigDict, Field, ValidationError, model_validator

BASE_DIR = Path(__file__).resolve().parent
DATA_NAME = "관광지 및 상업지구 요일별 카드 데이터"
SOURCE_URL = "https://jejudatahub.net/data/view/data/608"
DEMO_CSV = BASE_DIR / "data" / "demo_608.csv"
LEGACY_CSV_FIELDS = {"month", "district", "weekday", "transactions", "amount"}
CSV_FIELDS = LEGACY_CSV_FIELDS | {"visitor_type"}
VisitorType = Literal["domestic", "chinese", "unspecified"]
VISITOR_TYPE_LABELS = {
    "domestic": "내국인 관광객",
    "chinese": "중국인 관광객",
    "unspecified": "구분 정보 없음",
}
METRICS = {
    "transactions": ("카드 이용 건수", "건"),
    "amount": ("카드 이용 금액", "원"),
}
WEEKDAYS = {
    name: index
    for index, name in enumerate(("월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"))
}
WEEKEND = ("토요일", "일요일")
MAX_MONTHS = 120


class AnalysisError(ValueError):
    """A problem that the analyst can resolve by changing the input."""


def validate_month(value: str) -> str:
    if not re.fullmatch(r"[0-9]{4}-(0[1-9]|1[0-2])", value) or value.startswith("0000-"):
        raise ValueError("월은 YYYY-MM 형식으로 입력해주세요.")
    return value


Month = Annotated[str, AfterValidator(validate_month)]
District = Annotated[str, Field(min_length=1, max_length=100)]
NonnegativeInteger = Annotated[int, Field(ge=0, le=9_007_199_254_740_991)]


def month_index(month: str) -> int:
    return int(month[:4]) * 12 + int(month[5:]) - 1


def period_months(start: str, end: str) -> list[str]:
    months = []
    for month in range(month_index(start), month_index(end) + 1):
        year, offset = divmod(month, 12)
        months.append(f"{year:04d}-{offset + 1:02d}")
    return months


def weekday_count(month: str, weekday: str) -> int:
    first_weekday, days_in_month = calendar.monthrange(int(month[:4]), int(month[5:]))
    full_weeks, remaining_days = divmod(days_in_month, 7)
    offset = (WEEKDAYS[weekday] - first_weekday) % 7
    return full_weeks + int(offset < remaining_days)


class CompareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    district: District
    visitor_type: VisitorType | None = None
    start_month: Month
    end_month: Month
    metric: Literal["transactions", "amount"]

    @model_validator(mode="after")
    def validate_period(self) -> Self:
        count = month_index(self.end_month) - month_index(self.start_month) + 1
        if count < 1:
            raise ValueError("시작 월은 종료 월보다 늦을 수 없습니다.")
        if count > MAX_MONTHS:
            raise ValueError(f"분석 기간은 한 번에 최대 {MAX_MONTHS}개월입니다.")
        return self


class CardRow(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    month: Month
    district: District
    visitor_type: VisitorType = "unspecified"
    weekday: Literal["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"]
    transactions: NonnegativeInteger
    amount: NonnegativeInteger


class SnapshotMetadata(BaseModel):
    captured_at: AwareDatetime
    requested_start_month: Month
    requested_end_month: Month
    amount_unit: Literal["KRW"] | None
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


def load_snapshot_metadata(path: Path, csv_bytes: bytes) -> dict | None:
    try:
        metadata_bytes = path.with_suffix(".json").read_bytes()
    except FileNotFoundError:
        return None
    except OSError as error:
        raise AnalysisError("데이터 수집 정보를 열 수 없습니다.") from error
    try:
        metadata = SnapshotMetadata.model_validate_json(metadata_bytes)
    except ValidationError as error:
        raise AnalysisError("데이터 수집 정보 형식이 올바르지 않습니다.") from error
    if metadata.sha256 != sha256(csv_bytes).hexdigest():
        raise AnalysisError("데이터 CSV와 수집 정보의 버전이 일치하지 않습니다.")
    return {"source_url": SOURCE_URL, **metadata.model_dump(mode="json")}


def load_csv(path: Path) -> tuple[list[tuple[str, str, str, str, int, int]], dict | None]:
    rows = []
    keys = set()
    try:
        csv_bytes = path.read_bytes()
        with StringIO(csv_bytes.decode("utf-8-sig"), newline="") as file:
            reader = csv.DictReader(file, strict=True)
            header = reader.fieldnames or []
            header_fields = set(header)
            if len(header_fields) != len(header) or header_fields not in (CSV_FIELDS, LEGACY_CSV_FIELDS):
                raise AnalysisError(
                    "CSV 열은 month, district, visitor_type, weekday, transactions, amount가 필요합니다."
                )
            for record in reader:
                if None in record:
                    raise AnalysisError(f"CSV {reader.line_num}행의 열 개수가 맞지 않습니다.")
                try:
                    row = CardRow.model_validate(record)
                except ValidationError as error:
                    field = error.errors(include_input=False)[0]["loc"][0]
                    raise AnalysisError(f"CSV {reader.line_num}행의 {field} 값이 올바르지 않습니다.") from error

                key = (row.month, row.district, row.visitor_type, row.weekday)
                if key in keys:
                    raise AnalysisError(f"CSV {reader.line_num}행에 월·지구·관광객 구분·요일 조합이 중복됐습니다.")
                keys.add(key)
                rows.append((*key, row.transactions, row.amount))
    except OSError as error:
        raise AnalysisError(f"데이터 CSV를 열 수 없습니다: {path}") from error
    except (UnicodeError, csv.Error) as error:
        raise AnalysisError("데이터 파일의 UTF-8 CSV 형식을 확인해주세요.") from error

    if not rows:
        raise AnalysisError("데이터 CSV에 분석할 행이 없습니다.")
    snapshot = load_snapshot_metadata(path, csv_bytes)
    if snapshot is not None:
        months = [row[0] for row in rows]
        snapshot["observed_start_month"] = min(months)
        snapshot["observed_end_month"] = max(months)
    return rows, snapshot


class Analytics:
    """Read a local CSV snapshot once and query it through DuckDB."""

    def __init__(
        self,
        csv_path: Path = DEMO_CSV,
        *,
        mode: Literal["demo", "real"] = "demo",
        daily_average_available: bool | None = None,
    ) -> None:
        rows, self.snapshot = load_csv(csv_path)
        self.mode = mode
        self.metrics = (
            {**METRICS, "amount": ("카드 이용 금액(원자료 단위)", "")}
            if self.snapshot is not None and self.snapshot["amount_unit"] is None
            else METRICS
        )
        self.daily_average_available = (
            mode == "demo" if daily_average_available is None else daily_average_available
        )
        self._lock = Lock()
        self._database = duckdb.connect(":memory:")
        try:
            self._database.execute(
                """
                CREATE TABLE card_data (
                    month VARCHAR NOT NULL,
                    district VARCHAR NOT NULL,
                    visitor_type VARCHAR NOT NULL,
                    weekday VARCHAR NOT NULL,
                    transactions BIGINT NOT NULL,
                    amount BIGINT NOT NULL
                )
                """
            )
            self._database.executemany("INSERT INTO card_data VALUES (?, ?, ?, ?, ?, ?)", rows)
        except duckdb.Error:
            self._database.close()
            raise

    @classmethod
    def from_env(cls) -> Self:
        configured_path = os.getenv("JEJU_DATA_CSV", "").strip()
        if not configured_path:
            return cls()
        flag = os.getenv("JEJU_FULL_MONTH_COVERAGE", "false").strip().lower()
        if flag not in {"true", "false"}:
            raise AnalysisError("JEJU_FULL_MONTH_COVERAGE에는 true 또는 false를 입력해주세요.")
        return cls(BASE_DIR / configured_path, mode="real", daily_average_available=flag == "true")

    def close(self) -> None:
        with self._lock:
            self._database.close()

    def options(self) -> dict:
        with self._lock:
            coverage = self._database.execute(
                """
                SELECT district, visitor_type, month
                FROM card_data
                WHERE weekday IN (?, ?)
                GROUP BY district, visitor_type, month
                HAVING COUNT(*) = 2
                ORDER BY district, visitor_type, month
                """,
                list(WEEKEND),
            ).fetchall()
        districts = defaultdict(dict)
        for district, visitor_type, month in coverage:
            districts[district].setdefault(visitor_type, []).append(month)
        return {
            "mode": self.mode,
            "data_name": DATA_NAME,
            "source_url": SOURCE_URL,
            "snapshot": self.snapshot,
            "districts": [
                {
                    "name": district,
                    "months": sorted({month for months in groups.values() for month in months}),
                    "visitor_types": [
                        {"id": visitor_type, "label": label, "months": groups[visitor_type]}
                        for visitor_type, label in VISITOR_TYPE_LABELS.items()
                        if visitor_type in groups
                    ],
                }
                for district, groups in districts.items()
            ],
            "metrics": [{"id": metric, "label": label} for metric, (label, _) in self.metrics.items()],
            "daily_average_available": self.daily_average_available,
        }

    def compare(self, request: CompareRequest) -> dict:
        with self._lock:
            visitor_type = request.visitor_type
            if visitor_type is None:
                default_group = self._database.execute(
                    """
                    SELECT visitor_type
                    FROM card_data
                    WHERE district = ? AND weekday IN (?, ?)
                    GROUP BY visitor_type, month
                    HAVING COUNT(*) = 2
                    ORDER BY visitor_type <> 'domestic', visitor_type
                    LIMIT 1
                    """,
                    [request.district, *WEEKEND],
                ).fetchone()
                if default_group is not None:
                    visitor_type = default_group[0]
            aggregated = self._database.execute(
                """
                WITH weekend_data AS (
                    SELECT month, weekday,
                           CASE WHEN ? = 'transactions' THEN transactions ELSE amount END AS metric_value
                    FROM card_data
                    WHERE district = ?
                      AND visitor_type = ?
                      AND month BETWEEN ? AND ?
                      AND weekday IN (?, ?)
                ),
                complete_months AS (
                    SELECT month
                    FROM weekend_data
                    GROUP BY month
                    HAVING COUNT(*) = 2
                )
                SELECT weekday, SUM(metric_value), LIST(month ORDER BY month)
                FROM weekend_data
                INNER JOIN complete_months USING (month)
                GROUP BY weekday
                """,
                [request.metric, request.district, visitor_type, request.start_month, request.end_month, *WEEKEND],
            ).fetchall()
        if not aggregated:
            raise AnalysisError("선택한 지구·관광객 구분·기간에 토요일·일요일 자료가 모두 있는 달이 없습니다.")

        totals = {weekday: total for weekday, total, _ in aggregated}
        included = aggregated[0][2]
        included_set = set(included)
        excluded = [
            month for month in period_months(request.start_month, request.end_month)
            if month not in included_set
        ]
        rows = []
        scores = {}
        for weekday in WEEKEND:
            total = totals[weekday]
            days = None
            average = None
            if self.daily_average_available:
                days = sum(weekday_count(month, weekday) for month in included)
                average = Fraction(total, days)
            scores[weekday] = total if average is None else average
            rows.append(
                {
                    "weekday": weekday,
                    "total": total,
                    "days": days,
                    "daily_average": None if average is None else float(average),
                }
            )

        saturday, sunday = WEEKEND
        delta = scores[saturday] - scores[sunday]
        return {
            **request.model_dump(),
            "visitor_type": visitor_type,
            "visitor_type_label": VISITOR_TYPE_LABELS[visitor_type],
            "unit": self.metrics[request.metric][1],
            "rows": rows,
            "included_months": included,
            "excluded_months": excluded,
            "comparison_basis": "daily_average" if self.daily_average_available else "total",
            "winner": max(scores, key=scores.__getitem__) if delta else None,
            "difference": float(abs(delta)) if self.daily_average_available else abs(delta),
            "mode": self.mode,
            "data_name": DATA_NAME,
            "source_url": SOURCE_URL,
            "snapshot": self.snapshot,
        }
