"""Import weekday card data (Jeju Data Hub dataset 608) as a local snapshot."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import sys
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from time import monotonic
from urllib.parse import quote

import httpx
from dotenv import dotenv_values

BASE_DIR = Path(__file__).resolve().parent
SOURCE_URL = "https://jejudatahub.net/data/view/data/608"
ENDPOINT = "https://open.jejudatahub.net/api/proxy/868ttD1tbDb8tbt00tDtaba6t0Db1110"
DEFAULT_OUTPUT = BASE_DIR / "data" / "jeju_608.csv"
DISTRICTS = ("제주시 구도심", "서귀포시 구도심")
VISITOR_TYPES = {"내국인관광객": "domestic", "중국인관광객": "chinese"}
WEEKDAYS = {day: f"{day}요일" for day in "월화수목금토일"}
CSV_FIELDS = ("month", "district", "visitor_type", "weekday", "transactions", "amount")
PAGE_SIZE = 100
MAX_PAGES = 250
REQUEST_TIMEOUT = 10
IMPORT_TIMEOUT = 120
MAX_SAFE_INTEGER = 9_007_199_254_740_991

CardRow = tuple[str, str, str, str, int, int]


class HubError(ValueError):
    """Import failure with a message that excludes the credential and URL."""


def _month(value: str) -> str:
    if not re.fullmatch(r"[0-9]{4}-(0[1-9]|1[0-2])", value) or value.startswith("0000-"):
        raise HubError("시작월과 종료월은 YYYY-MM 형식이어야 합니다.")
    return value


def _nonnegative_integer(value: object) -> int:
    if isinstance(value, str) and re.fullmatch(r"[0-9]{1,16}", value):
        value = int(value)
    if type(value) is not int or not 0 <= value <= MAX_SAFE_INTEGER:
        raise ValueError("Expected an integer within the supported range")
    return value


def _normalize(raw: dict, district: str, start_month: str, end_month: str) -> CardRow:
    compact = raw["dtYearMonth"]
    if not isinstance(compact, str) or not re.fullmatch(r"[0-9]{6}", compact):
        raise ValueError("Invalid month field")
    month = _month(f"{compact[:4]}-{compact[4:]}")
    if not start_month <= month <= end_month or raw["districtType"] != district:
        raise ValueError("Response row outside requested district or period")
    return (
        month,
        district,
        VISITOR_TYPES[raw["userType"]],
        WEEKDAYS[raw["dtWeek"]],
        _nonnegative_integer(raw["useCount"]),
        _nonnegative_integer(raw["useCost"]),
    )


def _request_page(client: httpx.Client, url: str, params: dict, timeout: float) -> tuple[int, bool, list]:
    try:
        response = client.get(url, params=params, timeout=timeout, follow_redirects=False)
    except httpx.RequestError:
        raise HubError("제주데이터허브에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.") from None
    if response.status_code in (401, 403):
        raise HubError("제주데이터허브 인증에 실패했습니다. 프로젝트키와 608번 데이터 등록을 확인해 주세요.")
    if response.status_code == 429:
        raise HubError("제주데이터허브 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.")
    if response.status_code != 200:
        raise HubError(f"제주데이터허브 요청이 실패했습니다(HTTP {response.status_code}).")
    try:
        body = response.json()
    except ValueError:
        raise HubError("제주데이터허브가 JSON 응답을 반환하지 않았습니다.") from None
    if not isinstance(body, dict):
        raise HubError("제주데이터허브 응답 구조가 올바르지 않습니다.")
    total, more, data = body.get("totCnt"), body.get("hasMore"), body.get("data")
    if type(total) is not int or total < 0 or type(more) is not bool or not isinstance(data, list):
        raise HubError("제주데이터허브 응답의 totCnt, hasMore, data 형식을 확인할 수 없습니다.")
    if len(data) > PAGE_SIZE:
        raise HubError("제주데이터허브 응답이 요청한 페이지 크기를 초과했습니다.")
    return total, more, data


def import_dataset(
    client: httpx.Client,
    project_key: str,
    start_month: str,
    end_month: str,
    districts: tuple[str, ...] = DISTRICTS,
) -> list[CardRow]:
    start_month, end_month = _month(start_month), _month(end_month)
    if start_month > end_month:
        raise HubError("시작월은 종료월보다 늦을 수 없습니다.")
    if not districts or len(set(districts)) != len(districts) or not set(districts) <= set(DISTRICTS):
        raise HubError("제주시 구도심과 서귀포시 구도심 중 중복 없이 지정해 주세요.")
    project_key = project_key.strip()
    if not project_key or re.search(r"\s", project_key):
        raise HubError("backend/.env의 JEJU_HUB_PROJECT_KEY를 확인해 주세요.")

    url = f"{ENDPOINT}/{quote(project_key, safe='')}"
    rows: list[CardRow] = []
    keys: set[tuple[str, str, str, str]] = set()
    deadline = monotonic() + IMPORT_TIMEOUT
    for district in districts:
        params = {
            "startDate": start_month.replace("-", ""),
            "endDate": end_month.replace("-", ""),
            "districtType": district,
            "limit": PAGE_SIZE,
        }
        expected_total = None
        district_count = 0
        for number in range(1, MAX_PAGES + 1):
            remaining = deadline - monotonic()
            if remaining <= 0:
                raise HubError("전체 수집 시간이 초과됐습니다. 조회 기간을 줄여 주세요.")
            total, more, raw_rows = _request_page(
                client, url, {**params, "number": number}, min(REQUEST_TIMEOUT, remaining)
            )
            if expected_total is None:
                expected_total = total
            if total != expected_total or (more and not raw_rows):
                raise HubError(f"{district} 응답의 페이지 수가 일치하지 않습니다.")

            for position, raw in enumerate(raw_rows, start=1):
                try:
                    row = _normalize(raw, district, start_month, end_month)
                except (KeyError, TypeError, ValueError):
                    raise HubError(f"{district}의 {number}페이지 {position}번째 행이 올바르지 않습니다.") from None
                row_key = row[:4]
                if row_key in keys:
                    raise HubError(f"{district}의 {number}페이지에 월·지구·관광객 구분·요일이 중복된 행이 있습니다.")
                keys.add(row_key)
                rows.append(row)

            district_count += len(raw_rows)
            if more != (district_count < expected_total) or district_count > expected_total:
                raise HubError(f"{district}의 총 데이터 수와 페이지 응답이 일치하지 않습니다.")
            if not more:
                break
        else:
            raise HubError("최대 페이지 수를 초과했습니다. 조회 기간을 줄여 주세요.")

    if not rows:
        raise HubError("조회 기간에 저장할 자료가 없습니다. 기존 스냅샷을 유지했습니다.")
    return sorted(rows)


def write_snapshot(rows: list[CardRow], output: Path, start_month: str, end_month: str) -> None:
    if output.suffix.lower() != ".csv":
        raise HubError("저장 경로의 확장자는 .csv여야 합니다.")
    if not rows:
        raise HubError("빈 자료로 기존 스냅샷을 갱신할 수 없습니다.")
    output.parent.mkdir(parents=True, exist_ok=True)
    sidecar = output.with_suffix(".json")
    lock = output.with_suffix(".lock")
    try:
        with lock.open("xb"):
            pass
    except FileExistsError:
        raise HubError("같은 스냅샷을 저장 중입니다. 실행 중인 수집이 있는지 확인해 주세요.") from None

    try:
        with TemporaryDirectory(prefix=".jeju-608-", dir=output.parent) as temp:
            staged = Path(temp)
            staged_csv = staged / "snapshot.csv"
            staged_json = staged / "snapshot.json"
            previous_json = staged / "previous.json"
            with staged_csv.open("w", encoding="utf-8", newline="") as file:
                writer = csv.writer(file, lineterminator="\n")
                writer.writerow(CSV_FIELDS)
                writer.writerows(rows)
            metadata = {
                "source_url": SOURCE_URL,
                "captured_at": datetime.now(UTC).isoformat(timespec="seconds"),
                "requested_start_month": start_month,
                "requested_end_month": end_month,
                "amount_unit": None,
                "sha256": hashlib.sha256(staged_csv.read_bytes()).hexdigest(),
            }
            staged_json.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            if sidecar.exists():
                previous_json.write_bytes(sidecar.read_bytes())

            # The CSV replacement is the commit. Readers validate the sidecar hash.
            staged_json.replace(sidecar)
            try:
                staged_csv.replace(output)
            except OSError:
                if previous_json.exists():
                    previous_json.replace(sidecar)
                else:
                    sidecar.unlink()
                raise
    finally:
        lock.unlink()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="제주데이터허브 608번 데이터를 로컬 CSV로 가져옵니다.")
    parser.add_argument("--start", required=True, metavar="YYYY-MM", help="조회 시작월")
    parser.add_argument("--end", required=True, metavar="YYYY-MM", help="조회 종료월")
    parser.add_argument("--district", choices=DISTRICTS, action="append", help="반복 지정 가능. 기본값은 두 구도심입니다.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="CSV 저장 경로")
    args = parser.parse_args(argv)
    key = os.getenv("JEJU_HUB_PROJECT_KEY")
    if key is None:
        config = dotenv_values(BASE_DIR / ".env", encoding="utf-8-sig", interpolate=False)
        key = config.get("JEJU_HUB_PROJECT_KEY") or ""
    try:
        with httpx.Client(trust_env=False) as client:
            rows = import_dataset(client, key, args.start, args.end, tuple(args.district) if args.district else DISTRICTS)
        write_snapshot(rows, args.output, args.start, args.end)
    except HubError as error:
        print(f"가져오기 실패: {error}", file=sys.stderr)
        return 1
    except OSError:
        print("저장에 실패했습니다. CSV가 열린 상태인지와 저장 권한을 확인해 주세요.", file=sys.stderr)
        return 1

    print(f"608번 데이터 {len(rows)}행 저장: {args.output}")
    print(f"실제 관측월: {rows[0][0]} ~ {rows[-1][0]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
