import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

import httpx
from pydantic import BaseModel, ConfigDict

if __package__:
    from .analytics import CompareRequest, CoverageRequest, ScopedGroupCompareRequest
else:
    from analytics import CompareRequest, CoverageRequest, ScopedGroupCompareRequest


NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
DEFAULT_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b"
MODEL_UNAVAILABLE_STATUS_CODES = {502, 503, 504}

SEOUL_TIMEZONE = timezone(timedelta(hours=9))
ComparisonKind = Literal["compare_weekdays", "compare_groups", "monthly_trend"]
AnalysisKind = Literal["compare_weekdays", "compare_groups", "monthly_trend", "inspect_coverage"]

SYSTEM_PROMPT = """제주 카드 이용 질문을 도구 호출 한 건으로 해석한다. 지원 지표는 이용 건수(transactions)와 이용 금액(amount)이다.
- compare_weekdays: 한 지구의 한 관광객 유형에서 토·일 이용을 비교한다.
- compare_groups: 두 구도심 모두, 지역별, 관광객 유형별 등 여러 집단의 토·일을 한 번에 비교한다.
- monthly_trend: '매달', '월별', '꾸준했어?'처럼 월별 수치나 앞선 요일의 반복을 확인한다.
- inspect_coverage: 자료가 있는 기간 또는 요청한 시점의 자료 유무를 확인한다.
지역 이름과 관광객 유형 ID는 catalog에서 사용한다. 내국인은 domestic, 중국인은 chinese다. 날짜는 YYYY-MM 형식이다.
사용자가 명시한 조건을 우선한다. 처음 단일 비교는 current_selection을, 처음 집단 비교는 group_selection을 기본으로 삼는다.
'소비'나 '카드 이용'만 나오면 선택한 지표를 유지하고, 건수는 transactions, 금액이나 소비액은 amount로 지정한다.
current_selection.analysis가 있으면 직전 분석이다. 후속 질문은 직전 기간과 지표를 유지한다.
'그 차이가 매달 비슷했어?'는 직전 비교 범위를 유지해 monthly_trend를 호출한다.
'그럼 서귀포만 보면?'은 지역만 서귀포시 구도심으로 좁히고, 직전 분석이 monthly_trend면 그 도구를 유지한다.
집단·월별 도구에서 모든 지역 또는 관광객 유형을 비교하려면 해당 필드에 JSON null을 넣는다. '두 구도심 모두'는 district=null이다. null을 "none"이나 "null" 문자열로 쓰지 않는다.
'자료가 있는 최근 N개월'은 해당 범위에서 자료의 마지막 관측월을 기준으로 한다. '올해도 그래?'는 current_month의 해 1월부터 current_month까지 inspect_coverage로 확인한다.
실제 최근 기간을 관측된 과거 기간으로 바꾸지 않는다. 해당 기간의 관측이 없으면 inspect_coverage에 요청 기간을 그대로 넘긴다.
해석이 모호하거나 예측, 방문객 수, 행사 효과, 일별·시간대별 분석을 요청하면 clarify를 호출한다. 분석 수치나 답변 문장을 직접 작성하지 않는다.
"""


class AgentContext(ScopedGroupCompareRequest):
    analysis: ComparisonKind | None = None


@dataclass(frozen=True)
class AnalysisPlan:
    analysis: AnalysisKind
    params: CompareRequest | ScopedGroupCompareRequest | CoverageRequest


class Clarification(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: Literal["district", "period", "visitor_type", "unsupported"]


CLARIFICATIONS = {
    "district": "어느 지구를 비교할까요? 예를 들어 제주시 구도심이나 서귀포시 구도심을 선택해 주세요.",
    "period": "어느 기간을 비교할까요? 시작월과 종료월을 YYYY-MM 형식으로 알려주세요.",
    "visitor_type": "어느 관광객 구분을 비교할까요? 현재 지구에서 제공되는 구분을 선택해 주세요.",
    "unsupported": "이 화면은 지구별 토요일·일요일 카드 이용 건수와 금액을 월 단위로 비교합니다. 이 범위 안에서 질문해 주세요.",
}

TOOL_MODELS = {
    "compare_weekdays": (CompareRequest, "한 지구와 한 관광객 유형의 토요일·일요일 이용을 비교한다."),
    "compare_groups": (ScopedGroupCompareRequest, "같은 기간의 지구별·관광객 유형별 토요일·일요일을 비교한다."),
    "monthly_trend": (ScopedGroupCompareRequest, "선택한 지구와 관광객 유형의 월별 토요일·일요일 결과를 확인한다."),
    "inspect_coverage": (CoverageRequest, "관측 기간과 요청한 기간에 분석할 자료가 있는지 확인한다."),
    "clarify": (Clarification, "지역, 기간이나 관광객 유형을 확인하거나 지원 범위를 안내한다."),
}


def tool_parameters(model: type[BaseModel]) -> dict:
    schema = model.model_json_schema()
    if model in (CompareRequest, ScopedGroupCompareRequest):
        defaults = ("start_month", "end_month", "metric")
        schema["required"] = [field for field in schema["required"] if field not in defaults]
    return schema


TOOLS = [
    {"type": "function", "function": {"name": name, "description": description, "parameters": tool_parameters(model)}}
    for name, (model, description) in TOOL_MODELS.items()
]


def with_selection_defaults(
    name: str,
    arguments: dict,
    context: AgentContext | None,
    group_context: ScopedGroupCompareRequest | None,
) -> dict:
    selection = context
    if name in ("compare_groups", "monthly_trend") and (context is None or context.analysis is None):
        selection = group_context or context
    if selection is None:
        return arguments

    if name != "inspect_coverage":
        for field in ("start_month", "end_month", "metric"):
            arguments.setdefault(field, getattr(selection, field))
    arguments.setdefault("district", selection.district)
    if name == "compare_weekdays" and arguments.get("visitor_type") is None:
        arguments["visitor_type"] = selection.visitor_type
    else:
        arguments.setdefault("visitor_type", selection.visitor_type)
    return arguments


class AgentError(Exception):
    pass


class NvidiaAgent:
    def __init__(self, api_key: str, model: str = DEFAULT_MODEL):
        self.api_key = api_key
        self.model = model

    @classmethod
    def from_env(cls):
        return cls(
            os.getenv("NVIDIA_API_KEY", "").strip(),
            os.getenv("NVIDIA_MODEL", "").strip() or DEFAULT_MODEL,
        )

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def plan(
        self,
        question: str,
        context: AgentContext | None,
        districts: list[dict],
        group_context: ScopedGroupCompareRequest | None = None,
    ) -> AnalysisPlan | Clarification:
        if not self.available:
            raise AgentError("NVIDIA API 키를 설정하면 질문으로 분석할 수 있습니다. 지금은 조건을 직접 선택해 주세요.")

        user_input = {
            "question": question,
            "current_selection": context.model_dump(exclude_none=True) if context else None,
            "group_selection": group_context.model_dump() if group_context else None,
            "catalog": districts,
            "current_month": datetime.now(SEOUL_TIMEZONE).strftime("%Y-%m"),
        }
        payload = {
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(user_input, ensure_ascii=False)},
            ],
            "tools": TOOLS,
            "tool_choice": "auto",
            "chat_template_kwargs": {"enable_thinking": False},
            "max_tokens": 512,
            "stream": False,
        }
        models = (self.model,) if self.model == DEFAULT_MODEL else (self.model, DEFAULT_MODEL)
        try:
            for model in models:
                response = httpx.post(
                    NVIDIA_URL,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={**payload, "model": model},
                    timeout=httpx.Timeout(25.0, connect=5.0),
                )
                if response.status_code not in MODEL_UNAVAILABLE_STATUS_CODES:
                    break
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in {401, 403}:
                message = "NVIDIA API 인증에 실패했습니다. 키 설정을 확인해 주세요."
            elif exc.response.status_code == 429:
                message = "NVIDIA API 호출 한도에 도달했습니다. 잠시 후 시도하거나 조건을 직접 선택해 주세요."
            elif exc.response.status_code in MODEL_UNAVAILABLE_STATUS_CODES:
                message = "NVIDIA 모델의 응답이 일시적으로 지연되고 있습니다. 잠시 후 다시 시도해 주세요."
            else:
                message = "NVIDIA API가 분석 요청을 처리하지 못했습니다. 조건을 직접 선택해 주세요."
            raise AgentError(message) from exc
        except httpx.TimeoutException as exc:
            raise AgentError("NVIDIA 모델의 응답 시간이 초과됐습니다. 잠시 후 다시 시도해 주세요.") from exc
        except httpx.RequestError as exc:
            raise AgentError("NVIDIA API에 연결할 수 없습니다. 조건을 직접 선택해 주세요.") from exc

        try:
            calls = response.json()["choices"][0]["message"].get("tool_calls")
            if not isinstance(calls, list) or len(calls) != 1:
                raise ValueError("Expected exactly one tool call")
            function = calls[0]["function"]
            name = function["name"]
            if name == "clarify":
                return Clarification.model_validate_json(function["arguments"])
            model = TOOL_MODELS[name][0]
            arguments = json.loads(function["arguments"])
            if not isinstance(arguments, dict):
                raise ValueError("Expected a tool argument object")
            for field in ("district", "visitor_type"):
                value = arguments.get(field)
                if isinstance(value, str) and value.strip().lower() in {"none", "null"}:
                    arguments[field] = None
            params = model.model_validate(with_selection_defaults(name, arguments, context, group_context))
            return AnalysisPlan(analysis=name, params=params)
        except (AttributeError, IndexError, KeyError, TypeError, ValueError) as exc:
            raise AgentError("질문을 분석 조건으로 바꾸지 못했습니다. 질문을 구체화하거나 조건을 직접 선택해 주세요.") from exc
