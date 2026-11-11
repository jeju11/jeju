import csv
import hashlib
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import httpx

from jeju_hub import CSV_FIELDS, DISTRICTS, HubError, import_dataset, write_snapshot


def hub_row(**changes):
    return {
        "dtYearMonth": "201711",
        "districtType": DISTRICTS[0],
        "userType": "내국인관광객",
        "dtWeek": "토",
        "useCount": 0,
        "useCost": 0,
    } | changes


def page(*rows, total=None, more=False):
    return httpx.Response(
        200, json={"totCnt": len(rows) if total is None else total, "hasMore": more, "data": rows}
    )


class HubTests(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.addCleanup(directory.cleanup)
        self.output = Path(directory.name) / "608.csv"

    def import_responses(self, *responses):
        pages = iter(responses)
        with httpx.Client(transport=httpx.MockTransport(lambda _: next(pages))) as client:
            return import_dataset(client, "test-key", "2017-11", "2017-11", DISTRICTS[:1])

    def test_pagination_and_visitor_types(self):
        requests = []

        def handle(request):
            requests.append(request)
            number = int(request.url.params["number"])
            if request.url.params["districtType"] == DISTRICTS[1]:
                return page(hub_row(districtType=DISTRICTS[1]))
            if number == 1:
                return page(hub_row(), total=2, more=True)
            return page(hub_row(userType="중국인관광객", useCount="10", useCost=120), total=2)

        with httpx.Client(transport=httpx.MockTransport(handle)) as client:
            rows = import_dataset(client, "test-key", "2017-11", "2017-11")
        self.assertEqual([r.url.params["number"] for r in requests], ["1", "2", "1"])
        self.assertEqual(len(rows), 3)
        self.assertIn(("2017-11", DISTRICTS[0], "domestic", "토요일", 0, 0), rows)
        self.assertIn(("2017-11", DISTRICTS[0], "chinese", "토요일", 10, 120), rows)
        for request in requests:
            self.assertEqual(request.url.host, "open.jejudatahub.net")
            self.assertTrue(request.url.path.endswith("/test-key"))
            self.assertEqual(request.url.params["startDate"], "201711")
            self.assertEqual(request.url.params["endDate"], "201711")
            self.assertEqual(request.url.params["limit"], "100")
            self.assertNotIn("userType", request.url.params)
            self.assertNotIn("dtWeek", request.url.params)

    def test_rejects_duplicate_across_pages(self):
        with self.assertRaisesRegex(HubError, "중복"):
            self.import_responses(page(hub_row(), total=2, more=True), page(hub_row(), total=2))

    def test_rejects_rows_outside_requested_schema_or_range(self):
        for invalid in (
            hub_row(districtType=DISTRICTS[1]),
            hub_row(dtYearMonth="201712"),
            hub_row(dtYearMonth="201713"),
            hub_row(useCost=-1),
            hub_row(useCount=True),
            hub_row(userType="제공되지 않는 유형"),
        ):
            with self.subTest(invalid=invalid), self.assertRaisesRegex(HubError, "행이 올바르지"):
                self.import_responses(page(invalid))

    def test_rejects_truncated_pagination(self):
        with self.assertRaisesRegex(HubError, "총 데이터 수"):
            self.import_responses(page(hub_row(), total=2))

    def test_rejects_empty_and_non_json(self):
        with self.assertRaisesRegex(HubError, "저장할 자료가 없습니다"):
            self.import_responses(page())
        with self.assertRaisesRegex(HubError, "JSON"):
            self.import_responses(httpx.Response(200, text="test-key"))

    def test_does_not_redirect_or_leak_key(self):
        calls = []

        def handle(request):
            calls.append(request.url.host)
            return httpx.Response(302, headers={"Location": "https://example.org/test-key"})

        with httpx.Client(transport=httpx.MockTransport(handle), follow_redirects=True) as client:
            with self.assertRaises(HubError) as error:
                import_dataset(client, "test-key", "2017-11", "2017-11", DISTRICTS[:1])
        self.assertEqual(calls, ["open.jejudatahub.net"])
        self.assertNotIn("test-key", str(error.exception))
        self.assertIn("302", str(error.exception))

    def test_snapshot_has_normalized_csv_and_hash(self):
        rows = self.import_responses(page(hub_row()))
        write_snapshot(rows, self.output, "2017-11", "2017-11")
        with self.output.open(encoding="utf-8", newline="") as file:
            self.assertEqual(list(csv.reader(file)), [list(CSV_FIELDS), [*rows[0][:4], "0", "0"]])
        meta = json.loads(self.output.with_suffix(".json").read_text(encoding="utf-8"))
        self.assertEqual(meta["requested_start_month"], "2017-11")
        self.assertEqual(meta["requested_end_month"], "2017-11")
        self.assertIsNone(meta["amount_unit"])
        self.assertEqual(meta["sha256"], hashlib.sha256(self.output.read_bytes()).hexdigest())

    def test_snapshot_restores_metadata_if_csv_replace_fails(self):
        rows = self.import_responses(page(hub_row()))
        write_snapshot(rows, self.output, "2017-11", "2017-11")
        sidecar = self.output.with_suffix(".json")
        old_csv, old_meta = self.output.read_bytes(), sidecar.read_bytes()
        real_replace = Path.replace

        def fail_csv_replace(path, target):
            if target == self.output:
                raise PermissionError("CSV is open")
            return real_replace(path, target)

        new_rows = self.import_responses(page(hub_row(useCount=15)))
        with patch.object(Path, "replace", fail_csv_replace), self.assertRaises(PermissionError):
            write_snapshot(new_rows, self.output, "2017-11", "2017-11")
        self.assertEqual(self.output.read_bytes(), old_csv)
        self.assertEqual(sidecar.read_bytes(), old_meta)
        self.assertFalse(self.output.with_suffix(".lock").exists())
