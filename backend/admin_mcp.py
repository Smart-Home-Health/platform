# Smart Home Health
# Copyright (C) 2026 John Carty
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
"""Streamable HTTP endpoint for the patient-scoped administration tools."""
import hmac
import json
import logging
import os
import re

from fastapi import APIRouter
from mcp.server.lowlevel import Server
from mcp.server.transport_security import TransportSecuritySettings
from mcp_types import CallToolResult, ListToolsResult, TextContent, Tool, ToolAnnotations
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from starlette.routing import Route

from crud.medication_plan import TOOLS, PlanError, ReadPlan, execute
from db import SessionLocal
from models.users import AuditLog

logger = logging.getLogger(__name__)


def register_admin_mcp(app, session_factory=SessionLocal):
    token = os.getenv("SHH_MCP_TOKEN", "")
    patient = os.getenv("SHH_MCP_PATIENT_ID", "")
    host = os.getenv("SHH_MCP_HOST", "").strip()
    try:
        patient_id = int(patient)
    except ValueError:
        patient_id = 0

    valid_token = re.fullmatch(r"[a-zA-Z0-9_-]{32,}", token) and token != os.getenv("JWT_SECRET_KEY")
    if not host or not 0 < patient_id <= 2147483647 or not valid_token:
        if token or patient or host:
            logger.warning("Invalid MCP configuration. Medication plan tools are disabled.")

        async def disabled(request):
            return JSONResponse({"detail": "MCP disabled"}, status_code=404)

        app.router.routes.append(Route("/mcp", disabled, methods=["GET", "POST", "DELETE"]))
        return

    tools = {
        name: Tool(name=name, description=model.__doc__, input_schema=model.model_json_schema(),
                   annotations=ToolAnnotations(read_only_hint=model is ReadPlan, open_world_hint=False))
        for name, model in TOOLS.items()
    }

    async def list_tools(context, params):
        return ListToolsResult(tools=list(tools.values()))

    def run(name, arguments):
        model = TOOLS.get(name)
        if model is None:
            raise PlanError("Unknown tool")
        # Strict JSON accepts ISO dates while keeping booleans and strings out
        # of numeric fields such as medication IDs and scheduled dose amounts.
        data = model.model_validate_json(json.dumps(arguments), strict=True)
        with session_factory() as db, db.begin():
            result = execute(db, patient_id, data)
            if model is not ReadPlan:
                db.add(AuditLog(
                    action=f"mcp.{name}", resource_type="patient", resource_id=patient_id,
                    details=json.dumps(result),
                ))
            return result

    async def call_tool(context, params):
        try:
            result = await run_in_threadpool(run, params.name, params.arguments or {})
        except (ValidationError, PlanError) as exc:
            return CallToolResult(is_error=True, content=[TextContent(type="text", text=str(exc))])
        except Exception as exc:
            # Database errors may include a complete statement and medication values.
            logger.error("MCP operation failed (%s)", type(exc).__name__)
            return CallToolResult(is_error=True, content=[TextContent(type="text", text="Medication plan operation failed")])
        return CallToolResult(structured_content=result, content=[TextContent(type="text", text=json.dumps(result))])

    server = Server(
        "Smart Home Health", version="0.7.0",
        instructions="Use get_medication_plan to verify the patient and obtain the current revision before editing.",
        on_list_tools=list_tools, on_call_tool=call_tool,
        get_tool_input_schema=lambda name: tools[name].input_schema if name in tools else None,
    )
    endpoint = server.streamable_http_app(
        stateless_http=True, json_response=True, max_request_body_size=128 * 1024,
        transport_security=TransportSecuritySettings(allowed_hosts=[host], allowed_origins=[]),
    )

    async def authenticate(request, call_next):
        scheme, _, value = request.headers.get("authorization", "").partition(" ")
        if scheme.lower() != "bearer" or not hmac.compare_digest(value.encode(), token.encode()):
            return JSONResponse({"detail": "MCP bearer token required"}, status_code=401,
                                headers={"WWW-Authenticate": "Bearer"})
        return await call_next(request)

    endpoint.add_middleware(BaseHTTPMiddleware, dispatch=authenticate)

    # The SDK owns the /mcp route and its session-manager lifespan. Include the
    # latter in FastAPI's lifespan alongside the existing startup/shutdown hooks.
    app.include_router(APIRouter(lifespan=endpoint.router.lifespan_context))
    app.router.routes.append(Route("/mcp", endpoint))
