from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

if __package__:
    from .agent import CLARIFICATIONS, AgentContext, AgentError, Clarification, NvidiaAgent
    from .analytics import AnalysisError, Analytics, CompareRequest, CoverageRequest, ScopedGroupCompareRequest
else:
    from agent import CLARIFICATIONS, AgentContext, AgentError, Clarification, NvidiaAgent
    from analytics import AnalysisError, Analytics, CompareRequest, CoverageRequest, ScopedGroupCompareRequest


BACKEND = Path(__file__).resolve().parent
FRONTEND = BACKEND.parent / "frontend"


class AgentRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    question: str = Field(min_length=1, max_length=300)
    context: AgentContext | None = None
    group_context: ScopedGroupCompareRequest | None = None


def coverage_response(params: CoverageRequest, result: dict) -> dict:
    first = result["observed_start_month"]
    last = result["observed_end_month"]
    period = first if first == last else f"{first}~{last}"
    message = f"이 조건에서 토·일을 비교할 수 있는 관측 기간은 {period}입니다."
    if params.start_month is not None or params.end_month is not None:
        message += f" 요청 기간에서 비교 가능한 달은 {len(result['available_months'])}개월입니다."
    return {
        "status": "coverage",
        "analysis": "inspect_coverage",
        "params": params.model_dump(),
        "result": result,
        "message": message,
    }


def create_app(analytics: Analytics | None = None, agent: NvidiaAgent | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if analytics is None or agent is None:
            load_dotenv(BACKEND / ".env")
        app.state.analytics = analytics if analytics is not None else Analytics.from_env()
        app.state.agent = agent if agent is not None else NvidiaAgent.from_env()
        try:
            yield
        finally:
            if analytics is None:
                app.state.analytics.close()

    app = FastAPI(title="제주 요일별 카드 이용 분석", version="0.1.0", lifespan=lifespan)
    app.mount("/assets", StaticFiles(directory=FRONTEND / "assets", check_dir=False), name="assets")

    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(FRONTEND / "index.html")

    @app.get("/api/options")
    def options():
        return {**app.state.analytics.options(), "ai_available": app.state.agent.available}

    @app.post("/api/compare")
    def compare(params: CompareRequest):
        try:
            return app.state.analytics.compare(params)
        except AnalysisError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post("/api/compare-groups")
    def compare_groups(params: ScopedGroupCompareRequest):
        try:
            return app.state.analytics.compare_groups(params)
        except AnalysisError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post("/api/agent")
    def ask(body: AgentRequest):
        service = app.state.analytics
        try:
            plan = app.state.agent.plan(
                body.question, body.context, service.options()["districts"], group_context=body.group_context,
            )
        except AgentError as exc:
            raise HTTPException(503, str(exc)) from exc
        if isinstance(plan, Clarification):
            return {"status": "clarify", "message": CLARIFICATIONS[plan.reason]}

        params = plan.params
        if isinstance(params, CoverageRequest):
            try:
                return coverage_response(params, service.coverage(params))
            except AnalysisError as exc:
                return {"status": "clarify", "message": str(exc)}

        try:
            if isinstance(params, CompareRequest):
                result = service.compare(params)
            else:
                result = service.compare_groups(params)
        except AnalysisError as exc:
            coverage_params = CoverageRequest(
                district=params.district, visitor_type=params.visitor_type,
                start_month=params.start_month, end_month=params.end_month,
            )
            try:
                coverage = service.coverage(coverage_params)
            except AnalysisError:
                return {"status": "clarify", "message": str(exc)}
            if not coverage["available_months"]:
                return coverage_response(coverage_params, coverage)
            return {"status": "clarify", "message": str(exc)}
        applied = params.model_dump()
        if isinstance(params, CompareRequest):
            applied["visitor_type"] = result["visitor_type"]
        return {
            "status": "ok",
            "analysis": plan.analysis,
            "params": applied,
            "result": result,
        }

    return app


app = create_app()
