import json
import os
import unittest
from hashlib import sha256
from pathlib import Path
from tempfile import NamedTemporaryFile
from unittest.mock import patch

from pydantic import ValidationError

from analytics import AnalysisError, Analytics, CompareRequest, CoverageRequest, GroupCompareRequest, ScopedGroupCompareRequest


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

    def test_group_comparison_matches_months_and_reports_reversals_and_ties(self):
        path = self.write_csv(
            "2025-01,제주시 구도심,domestic,토요일,4,40\n"
            "2025-01,제주시 구도심,domestic,일요일,0,0\n"
            "2025-02,제주시 구도심,domestic,토요일,1000,10000\n"
            "2025-02,제주시 구도심,domestic,일요일,2000,20000\n"
            "2025-03,제주시 구도심,domestic,토요일,1,10\n"
            "2025-03,제주시 구도심,domestic,일요일,6,60\n"
            "2025-01,제주시 구도심,chinese,토요일,1,10\n"
            "2025-01,제주시 구도심,chinese,일요일,3,30\n"
            "2025-02,제주시 구도심,chinese,토요일,8000,80000\n"
            "2025-03,제주시 구도심,chinese,토요일,8,80\n"
            "2025-03,제주시 구도심,chinese,일요일,1,10\n"
            "2025-01,서귀포시 구도심,domestic,토요일,0,0\n"
            "2025-01,서귀포시 구도심,domestic,일요일,0,0\n"
            "2025-03,서귀포시 구도심,domestic,토요일,7,70\n"
            "2025-03,서귀포시 구도심,domestic,일요일,7,70\n"
            "2025-01,서귀포시 구도심,chinese,일요일,99,990\n",
            with_visitor_type=True,
        )
        analytics = Analytics(path, mode="real")
        self.addCleanup(analytics.close)
        result = analytics.compare_groups(GroupCompareRequest(
            start_month="2025-01", end_month="2025-03", metric="transactions"
        ))
        self.assertEqual(analytics.options()["comparison_months"], ["2025-01", "2025-03"])
        self.assertEqual(result["included_months"], ["2025-01", "2025-03"])
        self.assertEqual(result["excluded_months"], ["2025-02"])
        self.assertTrue(result["has_reversal"])
        self.assertEqual(result["comparison_basis"], "total")
        groups = {(group["district"], group["visitor_type"]): group for group in result["groups"]}
        self.assertEqual(len(groups), 3)
        domestic = groups[("제주시 구도심", "domestic")]
        chinese = groups[("제주시 구도심", "chinese")]
        tied = groups[("서귀포시 구도심", "domestic")]
        self.assertEqual([domestic["winner"], chinese["winner"], tied["winner"]], ["일요일", "토요일", None])
        self.assertEqual([row["total"] for row in domestic["rows"]], [5, 6])
        self.assertEqual(domestic["monthly_wins"], {"saturday": 1, "sunday": 1, "ties": 0})
        self.assertEqual(tied["monthly_wins"], {"saturday": 0, "sunday": 0, "ties": 2})
        for group in groups.values():
            self.assertEqual([item["month"] for item in group["months"]], result["included_months"])
            for index, row in enumerate(group["rows"]):
                self.assertEqual(sum(item["rows"][index]["total"] for item in group["months"]), row["total"])

    def test_group_comparison_rejects_disjoint_months(self):
        path = self.write_csv(
            "2025-01,제주시 구도심,domestic,토요일,9,90\n"
            "2025-01,제주시 구도심,domestic,일요일,8,80\n"
            "2025-02,서귀포시 구도심,chinese,토요일,2,20\n"
            "2025-02,서귀포시 구도심,chinese,일요일,3,30\n",
            with_visitor_type=True,
        )
        analytics = Analytics(path, mode="real")
        self.addCleanup(analytics.close)
        self.assertEqual(analytics.options()["comparison_months"], [])
        with self.assertRaisesRegex(AnalysisError, "함께 있는 달이 없습니다"):
            analytics.compare_groups(GroupCompareRequest(
                start_month="2025-01", end_month="2025-02", metric="transactions"
            ))

    def test_scope_filters_groups_before_computing_common_months(self):
        available = [
            ("2025-01", "제주시 구도심", "domestic"),
            ("2025-02", "제주시 구도심", "domestic"),
            ("2025-02", "제주시 구도심", "chinese"),
            ("2025-01", "서귀포시 구도심", "domestic"),
            ("2025-03", "서귀포시 구도심", "chinese"),
        ]
        path = self.write_csv(
            "".join(
                f"{month},{district},{visitor_type},{weekday},3,30\n"
                for month, district, visitor_type in available
                for weekday in ("토요일", "일요일")
            ),
            with_visitor_type=True,
        )
        analytics = Analytics(path, mode="real")
        self.addCleanup(analytics.close)
        self.assertEqual(analytics.options()["comparison_months"], [])
        cases = [
            ("제주시 구도심", None, ["2025-02"], 2),
            (None, "domestic", ["2025-01"], 2),
            ("제주시 구도심", "domestic", ["2025-01", "2025-02"], 1),
        ]
        for district, visitor_type, months, group_count in cases:
            with self.subTest(district=district, visitor_type=visitor_type):
                result = analytics.compare_groups(ScopedGroupCompareRequest(
                    start_month="2025-01", end_month="2025-03", metric="transactions",
                    district=district, visitor_type=visitor_type,
                ))
                self.assertEqual(result["district"], district)
                self.assertEqual(result["visitor_type"], visitor_type)
                self.assertEqual(result["included_months"], months)
                self.assertEqual(len(result["groups"]), group_count)
                self.assertEqual(analytics.coverage(CoverageRequest(
                    district=district, visitor_type=visitor_type,
                ))["months"], months)

    def test_coverage_preserves_observed_period_outside_requested_window(self):
        analytics = self.demo()
        request = CoverageRequest(district="제주시 구도심", visitor_type="domestic", start_month="2025-03")
        result = analytics.coverage(request)
        self.assertEqual(result["visitor_type_label"], "내국인 관광객")
        self.assertEqual(result["observed_start_month"], "2025-01")
        self.assertEqual(result["observed_end_month"], "2025-03")
        self.assertEqual(result["requested_start_month"], "2025-03")
        self.assertIsNone(result["requested_end_month"])
        self.assertEqual(result["available_months"], ["2025-03"])

        outside = analytics.coverage(CoverageRequest(start_month="2026-01", end_month="2026-12"))
        self.assertEqual(outside["available_months"], [])
        self.assertEqual(outside["observed_end_month"], "2025-03")

    def test_coverage_rejects_unavailable_scope_and_reversed_range(self):
        analytics = self.demo()
        for request in [CoverageRequest(district="알 수 없는 지역"), CoverageRequest(visitor_type="unspecified")]:
            with self.subTest(request=request), self.assertRaisesRegex(AnalysisError, "함께 비교할 수 있는 달이 없습니다"):
                analytics.coverage(request)
        with self.assertRaises(ValidationError):
            CoverageRequest(start_month="2025-03", end_month="2025-01")

    def test_group_comparison_scores_daily_average_at_month_and_period_levels(self):
        path = self.write_csv(
            "2025-05,제주시 구도심,토요일,500,5000\n"
            "2025-05,제주시 구도심,일요일,400,4000\n"
            "2025-06,제주시 구도심,토요일,400,4000\n"
            "2025-06,제주시 구도심,일요일,500,5000\n"
        )
        analytics = Analytics(path)
        self.addCleanup(analytics.close)
        result = analytics.compare_groups(GroupCompareRequest(
            start_month="2025-05", end_month="2025-06", metric="transactions"
        ))
        group = result["groups"][0]
        self.assertEqual(result["comparison_basis"], "daily_average")
        self.assertFalse(result["has_reversal"])
        self.assertEqual(group["visitor_type"], "unspecified")
        self.assertIsNone(group["winner"])
        self.assertEqual(group["monthly_wins"], {"saturday": 0, "sunday": 0, "ties": 2})
        self.assertEqual([row["daily_average"] for row in group["months"][0]["rows"]], [100.0, 100.0])
        self.assertEqual([row["days"] for row in group["rows"]], [9, 9])

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
