"""Per-browser sessions: an anonymous id in a cookie that owns uploaded material.

Local-first and account-free — no signup, no password, no email. The token is random
and unguessable, so one browser cannot read or even enumerate another's documents, and
nothing about a session is exposed beyond the fact that it exists.

Sessions expire with the cookie; the material they own is deleted by
`services_retention` after the configured window, whether or not the session is still
around.
"""

import logging
import re
import secrets

from fastapi import Cookie, Response

logger = logging.getLogger(__name__)

COOKIE_NAME = "oep_session"

# How long a browser keeps identifying itself. Longer than the retention window on
# purpose: coming back after a break should still be *your* session, with whatever
# survived.
COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

# What we mint: token_urlsafe(24) is 32 chars of [A-Za-z0-9_-].
_TOKEN = re.compile(r"^[A-Za-z0-9_-]{20,200}$")


def new_token() -> str:
    return secrets.token_urlsafe(24)


def is_well_formed(token: str) -> bool:
    """Reject anything a client made up.

    A cookie is client-controlled, so it is never trusted blindly. This is not the
    security boundary — unpredictability is — but it stops junk values and typos from
    becoming session keys nobody can ever reach.
    """
    return bool(_TOKEN.match(token))


def resolve_session(
    response: Response,
    oep_session: str | None = Cookie(default=None),
) -> str:
    """The current session id, minted on first contact.

    Usable directly as a FastAPI dependency: setting the cookie on the injected
    Response works for ordinary returns, so routes need no extra plumbing to keep a
    visitor's identity stable across their first few requests.
    """
    settings_secure = False
    try:
        from .config import get_settings

        settings_secure = get_settings().session_cookie_secure
    except Exception:  # noqa: BLE001 — a settings problem must not block the request
        logger.warning("could not read session cookie settings; assuming plain HTTP")

    token = (oep_session or "").strip()
    if not is_well_formed(token):
        token = new_token()
        response.set_cookie(
            COOKIE_NAME,
            token,
            max_age=COOKIE_MAX_AGE_SECONDS,
            httponly=True,  # not readable from JS, so a script cannot lift it
            samesite="lax",  # survives normal navigation, not cross-site POSTs
            secure=settings_secure,
            path="/",
        )
    return token
