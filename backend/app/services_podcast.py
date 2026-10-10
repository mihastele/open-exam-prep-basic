"""Two-host study podcast: plan the arc, then write one grounded section at a time.

A single prompt cannot produce a long episode that holds together — it runs out of
output budget and drifts off topic. So the episode is built the way a real show is:

1. **Outline** — one call plans the arc: title, blurb, and N sections, each with a
   goal, the search phrase that finds its source material, an opening hook that
   ties back to the previous section, and a handoff into the next one.
2. **Sections** — one grounded call per section. Each one sees its own retrieved
   chunks, the whole outline (so it stays on-arc and never re-explains a point)
   and its hook/handoff (so the seams line up). Sections depend on the *plan*, not
   on each other's text, so they can be written in parallel instead of as one slow
   sequential chain.

That is what makes a long episode sound like one episode rather than a random talk:
the arc is decided once, up front, and every section is written against it.
"""

import concurrent.futures as futures
import re

from sqlalchemy.orm import Session

from . import services_llm as llm
from . import services_rag as rag
from .config import get_settings
from .db import SessionLocal
from .services_parse import parse_json_response

SPEAKERS = ("ADA", "BEN")
WORDS_PER_MINUTE = 150  # spoken pace, used to size sections
WORDS_PER_LINE = 13  # average spoken line
MAX_LINE_CHARS = 320  # longer lines read badly and get truncated by TTS engines

# Stage directions models add even when explicitly told not to.
STAGE_DIRECTION = re.compile(
    r"[\[(]\s*(?:laughs?|laughing|chuckles?|sighs?|pauses?|a beat|beat|music|"
    r"clears? throat|smil\w*|excited\w*|whisper\w*|giggles?)\s*[\])]",
    re.IGNORECASE,
)
SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


class PodcastUnavailable(Exception):
    """No usable script could be produced (usually the provider is unreachable)."""


def section_count(minutes: int) -> int:
    """How many sections a ~`minutes` minute episode is planned as."""
    per = max(get_settings().podcast_section_minutes, 1)
    planned = round(max(minutes, 1) / per)
    return max(2, min(get_settings().podcast_max_sections, planned or 2))


def _as_str(value, default: str = "") -> str:
    return value.strip() if isinstance(value, str) and value.strip() else default


def _material(chunks, limit: int) -> str:
    return "\n---\n".join(c.text for c in chunks)[:limit]


def _split_long(line: str, speaker: str) -> list[dict]:
    """Break an over-long line at sentence boundaries so it stays speakable."""
    if len(line) <= MAX_LINE_CHARS:
        return [{"speaker": speaker, "line": line}]
    out, current = [], ""
    for sentence in SENTENCE_END.split(line):
        if current and len(current) + len(sentence) + 1 > MAX_LINE_CHARS:
            out.append({"speaker": speaker, "line": current.strip()})
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current.strip():
        out.append({"speaker": speaker, "line": current.strip()})
    return out


def _normalize_lines(data) -> list[dict]:
    """Coerce whatever the model returned into clean, alternating two-host lines."""
    raw = data if isinstance(data, list) else (data.get("lines") if isinstance(data, dict) else [])
    lines: list[dict] = []
    previous = ""
    for item in raw or []:
        if isinstance(item, str):
            speaker, text = "", item
        elif isinstance(item, dict):
            speaker = _as_str(item.get("speaker")).upper()
            text = _as_str(item.get("line"))
        else:
            continue
        text = re.sub(r"\s{2,}", " ", STAGE_DIRECTION.sub("", text)).strip()
        if not text or text == previous:
            continue
        if speaker not in SPEAKERS:
            # Keep the two-host illusion even if the model drifts.
            last = lines[-1]["speaker"] if lines else SPEAKERS[1]
            speaker = SPEAKERS[1] if last == SPEAKERS[0] else SPEAKERS[0]
        lines.extend(_split_long(text, speaker))
        previous = text
    # A whole section in one voice does not sound like a conversation.
    if len(lines) > 2 and len({line["speaker"] for line in lines}) == 1:
        for i, line in enumerate(lines):
            line["speaker"] = SPEAKERS[i % 2]
    return lines


def plan(
    db: Session,
    *,
    topic: str,
    minutes: int,
    document_ids: list[int] | None = None,
    owner_id: str | None = None,
) -> dict:
    """The episode arc: title, blurb and the ordered section plan."""
    wanted = section_count(minutes)
    overview, _ = rag.retrieve(
        db, topic or "overview", k=12, document_ids=document_ids, owner_id=owner_id
    )
    prompt = (
        f"Plan a two-host study podcast episode of roughly {minutes} minutes about "
        f"'{topic or 'the course material'}'. Hosts: ADA (the teacher) and BEN (the "
        "curious student).\n\n"
        f"Design exactly {wanted} sections that build on each other in a sensible "
        "teaching order: foundations first, then detail, then connections, ending "
        "with a recap. Every section must be answerable from the MATERIAL below — "
        "if the material does not support a topic, leave it out rather than "
        "inventing it.\n\n"
        "Return JSON exactly in this shape:\n"
        '{"title": str, "blurb": str, "sections": [{"heading": str, "goal": str, '
        '"query": str, "hook": str, "handoff": str}]}\n'
        "- goal: what the listener should understand by the end of the section\n"
        "- query: 3-6 words that retrieve this section's source material\n"
        "- hook: how the section opens, tying back to what came just before\n"
        "- handoff: one closing line that sets up the next section\n\n"
        "MATERIAL:\n"
        + (_material(overview, 6000) or "(none retrieved — plan from the topic alone)")
    )
    raw = llm.chat(
        [{"role": "user", "content": prompt}],
        task="podcast-outline",
        max_tokens=1800,
        json_mode=True,
    )
    data = parse_json_response(raw)
    if not isinstance(data, dict):
        raise PodcastUnavailable("the model returned an unreadable outline")

    sections: list[dict] = []
    for item in (data.get("sections") or [])[:wanted]:
        if not isinstance(item, dict):
            continue
        heading = _as_str(item.get("heading"))
        if not heading:
            continue
        sections.append(
            {
                "heading": heading,
                "goal": _as_str(item.get("goal")),
                "query": _as_str(item.get("query"), heading),
                "hook": _as_str(item.get("hook")),
                "handoff": _as_str(item.get("handoff")),
            }
        )
    if not sections:
        raise PodcastUnavailable("the model returned no usable outline")

    return {
        "title": _as_str(data.get("title"), topic or "Study podcast"),
        "blurb": _as_str(data.get("blurb")),
        "sections": sections,
        "planned_minutes": minutes,
    }


def render_section(
    db: Session,
    *,
    outline: dict,
    index: int,
    minutes: int = 15,
    document_ids: list[int] | None = None,
    owner_id: str | None = None,
) -> dict:
    """Write one section of the episode, grounded in its own retrieved chunks."""
    s = get_settings()
    sections = outline["sections"]
    section = sections[index]
    target_lines = max(int(max(s.podcast_section_minutes, 1) * WORDS_PER_MINUTE / WORDS_PER_LINE), 18)

    chunks, _ = rag.retrieve(db, section.get("query") or section["heading"], k=5,
                             document_ids=document_ids, owner_id=owner_id)
    covered = "\n".join(
        f"- {p['heading']}: {p.get('goal') or 'covered'}" for p in sections[:index]
    )
    is_last = index == len(sections) - 1

    prompt = (
        f"You are writing section {index + 1} of {len(sections)} of a two-host study "
        f"podcast called '{outline.get('title', 'Study podcast')}'.\n"
        f"Episode premise: {outline.get('blurb') or 'a walk through the course material'}\n\n"
        "The whole episode, so you stay on-arc and never repeat a point already made:\n"
        + "\n".join(f"- {p['heading']}: {p.get('goal') or ''}" for p in sections)
        + f"\n\nWrite ONLY this section: '{section['heading']}' — {section.get('goal') or ''}\n"
    )
    if section.get("hook"):
        prompt += f"Open by tying back to what came before. Suggested opening: {section['hook']}\n"
    if is_last:
        prompt += (
            "This is the final section: close the episode with a short recap and one "
            "concrete next step for the listener.\n"
        )
    elif section.get("handoff"):
        prompt += f"Close with this handoff into the next section: {section['handoff']}\n"
    if covered:
        prompt += f"\nAlready covered earlier — do not re-explain it:\n{covered}\n"

    prompt += (
        f"\nTarget about {target_lines} short spoken lines.\n\n"
        "Rules:\n"
        "- ADA is the teacher: explains, gives the example, states the rule.\n"
        "- BEN is the student: asks the question the listener is thinking, gets it "
        "half-right, asks for one more example. He is not a second teacher.\n"
        "- Conversational and specific, with concrete examples from the material.\n"
        "- No stage directions, no laughter cues, no speaker labels inside the line, "
        "no headings, no markdown.\n"
        "- Never invent facts the material does not support; say plainly when "
        "something is not covered.\n\n"
        "Return JSON exactly:\n"
        '{"lines": [{"speaker": "ADA" | "BEN", "line": str}]}\n\n'
        "SOURCE MATERIAL for this section:\n"
        + (_material(chunks, 5000) or "(none retrieved — teach from general knowledge and say so)")
    )

    raw = llm.chat(
        [{"role": "user", "content": prompt}],
        task="podcast-section",
        max_tokens=2400,
        json_mode=True,
    )
    lines = _normalize_lines(parse_json_response(raw))
    if not lines:
        raise PodcastUnavailable(f"section {index + 1} produced no lines")
    return {"heading": section["heading"], "goal": section.get("goal", ""), "segments": lines}


def assemble(outline: dict, rendered: list[dict | None], failed: list[str]) -> dict:
    """Flatten the per-section scripts into one episode the player can read."""
    sections, segments = [], []
    for item in rendered:
        if item is None:
            continue
        sections.append(item)
        segments.extend(
            {"speaker": line["speaker"], "line": line["line"], "section": item["heading"]}
            for line in item["segments"]
        )
    words = sum(len(seg["line"].split()) for seg in segments)
    stats = {
        "sections": len(sections),
        "sections_planned": len(outline["sections"]),
        "lines": len(segments),
        "words": words,
        "est_minutes": round(words / WORDS_PER_MINUTE, 1),
    }
    if failed:
        stats["failed_sections"] = failed
    return {
        "title": outline.get("title", "Study podcast"),
        "blurb": outline.get("blurb", ""),
        "sections": sections,
        "segments": segments,
        "stats": stats,
    }


def _render_with_session(
    outline: dict, index: int, minutes: int, document_ids, owner_id: str | None
) -> dict:
    # Each worker owns its session — SQLAlchemy sessions are not thread-safe.
    db = SessionLocal()
    try:
        return render_section(db, outline=outline, index=index, minutes=minutes,
                             document_ids=document_ids, owner_id=owner_id)
    finally:
        db.close()


def build_episode(
    db: Session,
    *,
    topic: str,
    minutes: int,
    document_ids: list[int] | None = None,
    owner_id: str | None = None,
) -> dict:
    """Whole episode in one call: plan, then write every section in parallel."""
    outline = plan(db, topic=topic, minutes=minutes, document_ids=document_ids,
                   owner_id=owner_id)
    sections = outline["sections"]
    rendered: list[dict | None] = [None] * len(sections)
    failed: list[str] = []
    workers = max(1, min(get_settings().podcast_workers, len(sections)))

    with futures.ThreadPoolExecutor(max_workers=workers) as pool:
        pending = {
            pool.submit(_render_with_session, outline, i, minutes, document_ids, owner_id): i
            for i in range(len(sections))
        }
        for future in futures.as_completed(pending):
            index = pending[future]
            try:
                rendered[index] = future.result()
            except Exception:  # noqa: BLE001 — one bad section must not kill the episode
                failed.append(sections[index]["heading"])

    if not any(rendered):
        raise PodcastUnavailable(
            "no section could be written — the model provider is unreachable or "
            "the material is empty"
        )
    return assemble(outline, rendered, failed)
