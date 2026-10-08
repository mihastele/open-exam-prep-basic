"""Scan-a-question: photo → guided steps (Socratic, no bare answer)."""

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import services_llm as llm
from .. import services_rag as rag
from ..db import get_session
from ..services_parse import ocr_image

router = APIRouter(prefix="/api/solve", tags=["solve"])


@router.post("/photo")
async def solve_photo(file: UploadFile, level: str = "secondary", db: Session = Depends(get_session)):
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "Image too large (10 MB max).")
    try:
        text = ocr_image(data)
    except RuntimeError as e:
        raise HTTPException(501, str(e))
    chunks, _ = rag.retrieve(db, text, k=4)
    context = "\n---\n".join(c.text for c in chunks)
    style = rag.LEVELS.get(level, rag.LEVELS["secondary"])
    prompt = (
        "A student photographed this problem. Guide them to solve it themselves: "
        "restate the problem, give numbered hints/steps with the reasoning, ask a "
        "check question after each key step, and put the final answer LAST under "
        "'Check'. Never just give the answer first.\n"
        f"{style}\n\nPROBLEM:\n{text}\n\nCOURSE MATERIAL:\n{context or '(none)'}"
    )
    try:
        answer = llm.chat([{"role": "user", "content": prompt}], task="solve-photo")
    except llm.LLMUnavailable as e:
        raise HTTPException(503, str(e))
    return {"detected_text": text, "guidance": answer}
