import json
import os
import unittest
from hashlib import sha256
from pathlib import Path
from tempfile import NamedTemporaryFile
from unittest.mock import patch

from pydantic import ValidationError

from analytics import AnalysisError, Analytics, CompareRequest


class AnalyticsTests(unittest.TestCase):
    def demo(self) -> Analytics:
        analytics = Analytics()
        self.addCleanup(analytics.close)
        return analytics

    def compare(self, analytics: Analytics, **overrides) -> dict:
        request = {
            "district": "제주시 구도심",
            "start_month": "2025-01",
            "end_month": "2025-03",
            "metric": "transactions",
        }
        return analytics.compare(CompareRequest(**(request | overrides)))

    def write_csv(self, body: str, *, with_visitor_type: bool = False) -> Path:
        with NamedTemporaryFile(
            mode="w", encoding="utf-8-sig", dir=Path(__file__).resolve().parent, suffix=".csv", delete=False
        ) as file:
            path = Path(file.name)
            self.addCleanup(path.unlink, missing_ok=True)
            fields = "month,district,visitor_type" if with_visitor_type else "month,district"
            file.write(f"{fields},weekday,transactions,amount\n" + body)
        return path

    def write_metadata(self, csv_path: Path, **overrides) -> None:
        path = csv_path.with_suffix(".json")
        self.addCleanup(path.unlink, missing_ok=True)
        metadata = {
            "captured_at": "2026-11-10T09:00:00Z",
            "requested_start_month": "2025-01",
            "requested_end_month": "2025-03",
            "amount_unit": None,
            "sha256": sha256(csv_path.read_bytes()).hexdigest(),
        }
        path.write_text(json.dumps(metadata | overrides), encoding="utf-8")

    def test_demo_uses_calendar_weekday_counts_and_actual_totals(self):
        result = self.compare(self.demo())
        self.assertEqual(result["mode"], "demo")
        self.assertEqual(result["visitor_type"], "domestic")
        self.assertEqual(result["included_months"], ["2025-01", "2025-02", "2025-03"])
        self.assertEqual(result["excluded_months"], [])
        self.assertEqual(result["winner"], "토요일")
        saturday, sunday = result["rows"]
        self.assertEqual((saturday["weekday"], saturday["total"], saturday["days"]), ("토요일", 14020, 13))
        self.assertEqual((sunday["weekday"], sunday["total"], sunday["days"]), ("일요일", 11630, 13))
        self.assertAlmostEqual(saturday["daily_average"], 14020 / 13)
        self.assertAlmostEqual(sunday["daily_average"], 11630 / 13)
        self.assertAlmostEqual(result["difference"], (14020 - 11630) / 13)

    def test_visitor_types_are_compared_separately(self):
        path = self.write_csv(
            "2025-01,제주시 구도심,domestic,토요일,9,90\n"
            "2025-01,제주시 구도심,chinese,일요일,99,990\n"
            "2025-02,제주시 구도심,domestic,토요일,0,0\n"
            "2025-02,제주시 구도심,domestic,일요일,2,20\n"
            "2025-03,제주시 구도심,chinese,토요일,12,120\n"
            "2025-03,제주시 구도심,chinese,일요일,15,150\n",
            with_visitor_type=True,
        )
        analytics = Analytics(path, mode="real")
        self.addCleanup(analytics.close)
        self.assertEqual(
            analytics.options()["districts"][0]["visitor_types"],
            [
                {"id": "domestic", "label": "내국인 관광객", "months": ["2025-02"]},
                {"id": "chinese", "label": "중국인 관광객", "months": ["2025-03"]},
            ],
        )
        domestic = self.compare(analytics)
        self.assertEqual(domestic["visitor_type"], "domestic")
        self.assertEqual(domestic["included_months"], ["2025-02"])
        self.assertEqual(domestic["excluded_months"], ["2025-01", "2025-03"])
        self.assertEqual([row["total"] for row in domestic["rows"]], [0, 2])

        chinese = self.compare(analytics, visitor_type="chinese")
        self.assertEqual(chinese["visitor_type_label"], "중국인 관광객")
        self.assertEqual(chinese["included_months"], ["2025-03"])
        self.assertEqual([row["total"] for row in chinese["rows"]], [12, 15])

    def test_snapshot_with_unknown_amount_unit_does_not_claim_won(self):
        path = self.write_csv(
            "2025-01,제주시 구도심,domestic,토요일,10,3000\n"
            "2025-01,제주시 구도심,domestic,일요일,15,4000\n",
            with_visitor_type=True,
        )
        self.write_metadata(path)
        analytics = Analytics(path, mode="real")
        self.addCleanup(analytics.close)
        result = self.compare(analytics, metric="amount")
        self.assertEqual(result["unit"], "")
        self.assertEqual(result["snapshot"]["captured_at"], "2026-11-10T09:00:00Z")
        self.assertEqual(result["snapshot"]["observed_start_month"], "2025-01")
        self.assertEqual(result["snapshot"]["observed_end_month"], "2025-01")
        self.assertEqual(result["snapshot"]["requested_end_month"], "2025-03")
        self.assertEqual(analytics.options()["metrics"][1]["label"], "카드 이용 금액(원자료 단위)")

    def test_snapshot_rejects_metadata_for_different_csv(self):
        path = self.write_csv("2025-01,제주시 구도심,토요일,100,3000\n")
        self.write_metadata(path, sha256="0" * 64)
        with self.assertRaisesRegex(AnalysisError, "버전이 일치하지 않습니다"):
            Analytics(path, mode="real")

    def test_unequal_weekday_counts_are_normalized_before_comparison(self):
        path = self.write_csv(
            "2025-05,제주시 구도심,토요일,500,5000\n"
            "2025-05,제주시 구도심,일요일,450,4500\n"
        )
        analytics = Analytics(path, mode="real", daily_average_available=True)
        self.addCleanup(analytics.close)
        result = self.compare(analytics, start_month="2025-05", end_month="2025-05")
        self.assertEqual([row["days"] for row in result["rows"]], [5, 4])
        self.assertEqual(result["winner"], "일요일")
        self.assertEqual(result["difference"], 12.5)

    def test_excludes_missing_months_from_both_weekdays_and_defaults_to_totals(self):
        path = self.write_csv(
            "2025-01,제주시 구도심,토요일,100,3000\n"
            "2025-01,제주시 구도심,일요일,80,4000\n"
            "2025-02,제주시 구도심,토요일,400,9999\n"
            "2025-03,제주시 구도심,일요일,100,5000\n"
        )
        relative_path = path.relative_to(Path(__file__).resolve().parents[1])
        with patch.dict(os.environ, {"JEJU_DATA_CSV": str(relative_path)}):
            os.environ.pop("JEJU_FULL_MONTH_COVERAGE", None)
            analytics = Analytics.from_env()
        self.addCleanup(analytics.close)
        self.assertEqual(
            analytics.options()["districts"],
            [{
                "name": "제주시 구도심",
                "months": ["2025-01"],
                "visitor_types": [{"id": "unspecified", "label": "구분 정보 없음", "months": ["2025-01"]}],
            }],
        )
        result = self.compare(analytics, metric="amount")
        self.assertEqual(result["visitor_type"], "unspecified")
        self.assertEqual(result["comparison_basis"], "total")
        self.assertEqual(result["unit"], "원")
        self.assertEqual(result["included_months"], ["2025-01"])
        self.assertEqual(result["excluded_months"], ["2025-02", "2025-03"])
        self.assertEqual(result["winner"], "일요일")
        self.assertEqual(result["difference"], 1000)
        self.assertEqual([row["total"] for row in result["rows"]], [3000, 4000])
        self.assertTrue(all(row["days"] is None and row["daily_average"] is None for row in result["rows"]))

    def test_missing_data_returns_a_useful_error(self):
        with self.assertRaisesRegex(AnalysisError, "자료가 모두 있는 달이 없습니다"):
            self.compare(self.demo(), start_month="2024-01", end_month="2024-02")

    def test_invalid_ranges_are_rejected(self):
        analytics = self.demo()
        for start, end in [("2025-00", "2025-01"), ("2025-02", "2025-01"), ("2014-01", "2025-02")]:
            with self.subTest(start=start, end=end), self.assertRaises(ValidationError):
                self.compare(analytics, start_month=start, end_month=end)

    def test_explicit_csv_failure_is_not_replaced_by_demo(self):
        path = self.write_csv("").with_suffix(".missing")
        with patch.dict(os.environ, {"JEJU_DATA_CSV": str(path), "JEJU_FULL_MONTH_COVERAGE": "false"}):
            with self.assertRaisesRegex(AnalysisError, "열 수 없습니다"):
                Analytics.from_env()

    def test_duplicate_rows_fail_at_load_time(self):
        row = "2025-01,제주시 구도심,토요일,100,3000\n"
        with self.assertRaisesRegex(AnalysisError, "중복"):
            Analytics(self.write_csv(row * 2))

    def test_malformed_rows_fail_at_load_time(self):
        row = "2025-01,제주시 구도심,토요일,오류,3000\n"
        with self.assertRaisesRegex(AnalysisError, "transactions 값"):
            Analytics(self.write_csv(row))
