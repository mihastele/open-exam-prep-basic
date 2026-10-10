"""Study podcast: a planned, sectioned, two-host episode built from your material.

Three ways in, sharing one pipeline:

- `POST /api/podcast/outline` — just the episode plan (title + sections).
- `POST /api/podcast/section` — one section, given that plan.
- `POST /api/podcast/script`  — the whole episode orchestrated server-side.

The UI uses outline + section so it can show real progress and reveal sections as
they land, and so no single request has to outlive a serverless timeout. `/script`
stays for scripts and clients that would rather make one call.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import services_llm as llm
from .. import services_podcast as podcast
from ..db import get_session
from ..models import Document
from ..session import resolve_session

router = APIRouter(prefix="/api/podcast", tags=["podcast"])


class EpisodeIn(BaseModel):
    topic: str = ""
    document_ids: list[int] | None = None
    minutes: int = Field(default=15, ge=1, le=90)


class SectionIn(BaseModel):
    outline: dict
    index: int = Field(ge=0)
    minutes: int = Field(default=15, ge=1, le=90)
    document_ids: list[int] | None = None


def _require_target(
    db: Session, topic: str, document_ids: list[int] | None, owner: str
) -> None:
    """A topic, an explicit document pick, or material in the library — else nothing to talk about."""
    if topic or document_ids:
        return
    if not db.scalar(
        select(func.count()).select_from(Document).where(Document.owner_id == owner)
    ):
        raise HTTPException(400, "Upload some material or give a topic first.")


@router.post("/outline")
def make_outline(
    body: EpisodeIn,
    owner: str = Depends(resolve_session),
    db: Session = Depends(get_session),
):
    _require_target(db, body.topic, body.document_ids, owner)
    try:
        return podcast.plan(db, topic=body.topic, minutes=body.minutes,
                            document_ids=body.document_ids, owner_id=owner)
    except llm.LLMUnavailable as e:
        raise HTTPException(503, str(e))
    except podcast.PodcastUnavailable as e:
        raise HTTPException(502, f"Episode plan failed: {e}")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Episode plan failed: {e}")


@router.post("/section")
def make_section(
    body: SectionIn,
    owner: str = Depends(resolve_session),
    db: Session = Depends(get_session),
):
    sections = body.outline.get("sections") or []
    if not sections:
        raise HTTPException(400, "The outline has no sections.")
    if body.index >= len(sections):
        raise HTTPException(
            400, f"index {body.index} is outside the outline ({len(sections)} sections)."
        )
    try:
        return podcast.render_section(db, outline=body.outline, index=body.index,
                                      minutes=body.minutes, document_ids=body.document_ids,
                                      owner_id=owner)
    except llm.LLMUnavailable as e:
        raise HTTPException(503, str(e))
    except podcast.PodcastUnavailable as e:
        raise HTTPException(502, str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Section failed: {e}")


@router.post("/script")
def make_script(
    body: EpisodeIn,
    owner: str = Depends(resolve_session),
    db: Session = Depends(get_session),
):
    _require_target(db, body.topic, body.document_ids, owner)
    try:
        return podcast.build_episode(db, topic=body.topic, minutes=body.minutes,
                                     document_ids=body.document_ids, owner_id=owner)
    except llm.LLMUnavailable as e:
        raise HTTPException(503, str(e))
    except podcast.PodcastUnavailable as e:
        raise HTTPException(502, str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Podcast script failed: {e}")
