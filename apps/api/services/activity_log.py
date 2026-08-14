"""
Shared helper for writing to activity_log. Wrapped so a logging failure
never breaks the actual request it's logging — this is instrumentation,
not a critical path.

Wired into a representative starting set of endpoints (organizations
create, users create/update/status/delete) rather than exhaustively
every endpoint in the API — expand as needed.
"""
from typing import Any


def log_activity(
    supa,
    user_id: str | None,
    org_id: str | None,
    module: str,
    action: str,
    details: dict[str, Any] | None = None,
) -> None:
    try:
        supa.table("activity_log").insert({
            "user_id": user_id,
            "org_id": org_id,
            "module": module,
            "action": action,
            "details": details or {},
        }).execute()
    except Exception:
        pass
