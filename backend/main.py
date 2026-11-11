from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from agent import CLARIFICATIONS, AgentError, Clarification, NvidiaAgent
from analytics import AnalysisError, Analytics, CompareRequest


BACKEND = Path(__file__).resolve().parent
FRONTEND = BACKEND.parent / "frontend"


class AgentRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    question: str = Field(min_length=1, max_length=300)
    context: CompareRequest | None = None


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

    @app.post("/api/agent")
    def ask(body: AgentRequest):
        service = app.state.analytics
        try:
            plan = app.state.agent.plan(body.question, body.context, service.options()["districts"])
        except AgentError as exc:
            raise HTTPException(503, str(exc)) from exc
        if isinstance(plan, Clarification):
            return {"status": "clarify", "message": CLARIFICATIONS[plan.reason]}
        try:
            result = service.compare(plan)
        except AnalysisError as exc:
            return {"status": "clarify", "message": str(exc)}
        return {
            "status": "ok",
            "params": {**plan.model_dump(), "visitor_type": result["visitor_type"]},
            "result": result,
        }

    return app


app = create_app()
