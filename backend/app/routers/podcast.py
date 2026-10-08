"""Study podcasts: generated two-host scripts, read aloud in the browser."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import services_llm as llm
from .. import services_rag as rag
from ..db import get_session
from ..services_parse import parse_json_response

router = APIRouter(prefix="/api/podcast", tags=["podcast"])


class PodcastIn(BaseModel):
    topic: str = ""
    document_ids: list[int] | None = None
    minutes: int = 5


@router.post("/script")
def make_script(body: PodcastIn, db: Session = Depends(get_session)):
    if not body.topic and not body.document_ids:
        raise HTTPException(400, "Give a topic or pick at least one document.")
    chunks, _ = rag.retrieve(db, body.topic or "overview", k=8, document_ids=body.document_ids)
    material = "\n---\n".join(c.text for c in chunks)
    lines = max(body.minutes * 14, 20)
    prompt = (
        f"Write a ~{body.minutes}-minute two-host study podcast script about "
        f"'{body.topic or 'the material'}'. Hosts ADA (teacher) and BEN (curious student). "
        f"About {lines} short spoken lines, no stage directions.\n"
        'Return JSON {"title":str,"segments":[{"speaker":"ADA"|"BEN","line":str}]}.\n\n'
        "MATERIAL:\n" + (material or "(none)")
    )
    try:
        raw = llm.chat([{"role": "user", "content": prompt}], task="podcast-script",
                       max_tokens=2500, json_mode=True)
        return parse_json_response(raw)
    except llm.LLMUnavailable as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"Podcast script failed: {e}")
