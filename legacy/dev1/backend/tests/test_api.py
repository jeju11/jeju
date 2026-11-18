import json
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from agent import DEFAULT_MODEL, NVIDIA_URL, NvidiaAgent
from analytics import Analytics
from main import create_app


QUERY = {
    "district": "제주시 구도심",
    "visitor_type": "domestic",
    "start_month": "2025-01",
    "end_month": "2025-03",
    "metric": "transactions",
}
GROUP_QUERY = {name: QUERY[name] for name in ("start_month", "end_month", "metric")}


def tool_response(name, arguments):
    return httpx.Response(
        200,
        request=httpx.Request("POST", NVIDIA_URL),
        json={"choices": [{"message": {"tool_calls": [{
            "function": {"name": name, "arguments": json.dumps(arguments)},
        }]}}]},
    )


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.analytics = Analytics()
        self.addCleanup(self.analytics.close)

    def test_no_key_still_allows_manual_comparison(self):
        with TestClient(create_app(self.analytics, NvidiaAgent(""))) as client:
            options = client.get("/api/options").json()
            self.assertEqual(options["mode"], "demo")
            self.assertFalse(options["ai_available"])
            response = client.post("/api/compare", json=QUERY)
            self.assertEqual(response.status_code, 200)
            result = response.json()
            self.assertEqual(result["included_months"], ["2025-01", "2025-02", "2025-03"])
            self.assertEqual(result["comparison_basis"], "daily_average")
            self.assertEqual([row["days"] for row in result["rows"]], [13, 13])
            self.assertEqual(client.post("/api/agent", json={"question": "비교해줘"}).status_code, 503)

    def test_group_comparison_uses_months_available_to_every_group(self):
        with TestClient(create_app(self.analytics, NvidiaAgent(""))) as client:
            options = client.get("/api/options").json()
            months = options["comparison_months"]
            response = client.post("/api/compare-groups", json={
                "start_month": months[0], "end_month": months[-1], "metric": "transactions",
            })
            self.assertEqual(response.status_code, 200)
            result = response.json()
            self.assertEqual(result["included_months"], months)
            self.assertEqual(len(result["groups"]), 4)
            for group in result["groups"]:
                self.assertEqual([row["month"] for row in group["months"]], months)
            unavailable = client.post("/api/compare-groups", json={
                "start_month": "2026-01", "end_month": "2026-02", "metric": "transactions",
            })
            self.assertEqual(unavailable.status_code, 422)

    def test_nvidia_selects_parameters_and_backend_computes_result(self):
        params = {**QUERY, "district": "서귀포시 구도심"}
        with TestClient(create_app(self.analytics, NvidiaAgent("test-key"))) as client:
            expected = client.post("/api/compare", json=params).json()
            with patch("agent.httpx.post", return_value=tool_response("compare_weekdays", params)) as post:
                response = client.post("/api/agent", json={"question": "그럼 서귀포는?", "context": QUERY})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"status": "ok", "analysis": "compare_weekdays", "result": expected, "params": params})
            self.assertEqual(post.call_args.args[0], NVIDIA_URL)
            payload = post.call_args.kwargs["json"]
            sent_context = json.loads(payload["messages"][1]["content"])
            self.assertEqual({name: sent_context["current_selection"][name] for name in QUERY}, QUERY)
            self.assertRegex(sent_context["current_month"], r"^\d{4}-\d{2}$")
            self.assertIn("catalog", sent_context)

    def test_agent_group_comparison_and_scoped_trend_match_manual_results(self):
        with TestClient(create_app(self.analytics, NvidiaAgent("test-key"))) as client:
            with patch("agent.httpx.post", return_value=tool_response("compare_groups", GROUP_QUERY)):
                first = client.post("/api/agent", json={
                    "question": "두 구도심을 비교해줘", "context": QUERY, "group_context": GROUP_QUERY,
                }).json()
            self.assertEqual(first["analysis"], "compare_groups")
            self.assertEqual(len(first["result"]["groups"]), 4)
            params = {**GROUP_QUERY, "district": "서귀포시 구도심", "visitor_type": None}
            tool_params = {**params, "visitor_type": "none"}
            with patch("agent.httpx.post", return_value=tool_response("monthly_trend", tool_params)):
                second = client.post("/api/agent", json={
                    "question": "서귀포만 월별로 보여줘", "context": {**first["params"], "analysis": first["analysis"]},
                }).json()
            self.assertEqual(second["analysis"], "monthly_trend")
            self.assertEqual(second["params"], params)
            self.assertEqual(len(second["result"]["groups"]), 2)
            self.assertEqual(second["result"], client.post("/api/compare-groups", json=params).json())

    def test_agent_reports_observed_period_for_future_questions(self):
        requested = {"start_month": "2026-01", "end_month": "2026-11", "district": "서귀포시 구도심"}
        with TestClient(create_app(self.analytics, NvidiaAgent("test-key"))) as client:
            for name, args in (
                ("inspect_coverage", requested),
                ("inspect_coverage", {**requested, "visitor_type": "none"}),
                ("compare_groups", {**requested, "metric": "transactions"}),
            ):
                with self.subTest(name=name), patch("agent.httpx.post", return_value=tool_response(name, args)):
                    result = client.post("/api/agent", json={"question": "올해도 그래?"}).json()
                    self.assertEqual(result["status"], "coverage")
                    self.assertEqual(result["result"]["available_months"], [])
                    self.assertEqual(result["result"]["observed_end_month"], "2025-03")
                    self.assertEqual(result["result"]["requested_start_month"], "2026-01")

    def test_followup_preserves_visitor_type_when_tool_omits_it(self):
        context = {**QUERY, "visitor_type": "chinese"}
        arguments = {key: value for key, value in context.items() if key != "visitor_type"}
        arguments["district"] = "서귀포시 구도심"
        with TestClient(create_app(self.analytics, NvidiaAgent("test-key"))) as client:
            with patch("agent.httpx.post", return_value=tool_response("compare_weekdays", arguments)):
                response = client.post("/api/agent", json={"question": "그럼 서귀포는?", "context": context})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["params"]["visitor_type"], "chinese")
            self.assertEqual(response.json()["result"]["visitor_type"], "chinese")

    def test_nvidia_can_ask_for_missing_period(self):
        with TestClient(create_app(self.analytics, NvidiaAgent("test-key"))) as client:
            with patch("agent.httpx.post", return_value=tool_response("clarify", {"reason": "period"})):
                response = client.post("/api/agent", json={"question": "구도심 주말 비교"})
            self.assertEqual(response.json()["status"], "clarify")
            self.assertIn("YYYY-MM", response.json()["message"])

    def test_invalid_tool_arguments_fail_without_execution(self):
        params = {**QUERY, "metric": "visitor_count"}
        with TestClient(create_app(self.analytics, NvidiaAgent("test-key", "test-model"))) as client:
            with patch("agent.httpx.post", return_value=tool_response("compare_weekdays", params)) as post:
                response = client.post("/api/agent", json={"question": "방문객 수 비교"})
            post.assert_called_once()
            self.assertEqual(response.status_code, 503)
            self.assertIn("직접 선택", response.json()["detail"])

    def test_unavailable_configured_model_retries_with_default_model(self):
        with TestClient(create_app(self.analytics, NvidiaAgent("test-key", "test-model"))) as client:
            expected = client.post("/api/compare", json=QUERY).json()
            for status_code in (502, 503, 504):
                unavailable = httpx.Response(status_code, request=httpx.Request("POST", NVIDIA_URL))
                replies = [unavailable, tool_response("compare_weekdays", QUERY)]
                with self.subTest(status_code=status_code), patch("agent.httpx.post", side_effect=replies) as post:
                    response = client.post("/api/agent", json={"question": "비교해줘", "context": QUERY})
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.json()["result"], expected)
                    first, second = [call.kwargs for call in post.call_args_list]
                    self.assertEqual(first["json"]["model"], "test-model")
                    self.assertEqual(second["json"], {**first["json"], "model": DEFAULT_MODEL})
                    self.assertEqual(second["headers"], first["headers"])

    def test_unavailable_model_has_no_more_than_one_retry(self):
        unavailable = httpx.Response(503, request=httpx.Request("POST", NVIDIA_URL))
        for model, expected_models in ((DEFAULT_MODEL, [DEFAULT_MODEL]), ("test-model", ["test-model", DEFAULT_MODEL])):
            with self.subTest(model=model), TestClient(create_app(self.analytics, NvidiaAgent("test-key", model))) as client:
                with patch("agent.httpx.post", return_value=unavailable) as post:
                    response = client.post("/api/agent", json={"question": "비교해줘"})
                self.assertEqual(response.status_code, 503)
                self.assertIn("일시적으로 지연", response.json()["detail"])
                self.assertEqual([call.kwargs["json"]["model"] for call in post.call_args_list], expected_models)

    def test_authentication_and_rate_limits_do_not_retry(self):
        with TestClient(create_app(self.analytics, NvidiaAgent("test-key", "test-model"))) as client:
            for status_code, message in ((401, "인증에 실패"), (403, "인증에 실패"), (429, "호출 한도")):
                rejected = httpx.Response(status_code, request=httpx.Request("POST", NVIDIA_URL))
                with self.subTest(status_code=status_code), patch("agent.httpx.post", return_value=rejected) as post:
                    response = client.post("/api/agent", json={"question": "비교해줘"})
                    post.assert_called_once()
                    self.assertEqual(response.status_code, 503)
                    self.assertIn(message, response.json()["detail"])
