import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
import google.genai as genai
from google.genai import types as genai_types

from ..database import get_db
from ..models import Project, Message
from ..schemas import (
    ChatRequest,
    ChatResponse,
    MessageResponse,
    RagDebugChunk,
    RagDebugResponse,
    SourceReference,
)
from ..services.rag import retrieve_relevant_chunks, find_csv_row_context
from ..models import CsvRow as CsvRowModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/", response_model=ChatResponse)
def send_message(payload: ChatRequest, db: Session = Depends(get_db)):
    """Send a message to Gemini and persist the exchange."""
    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )

    try:
        client = genai.Client(api_key=project.api_key)

        # Fetch persisted history from DB if no history provided
        if not payload.history:
            db_messages = (
                db.query(Message)
                .filter(Message.project_id == project.id)
                .order_by(Message.created_at.asc())
                .all()
            )
            history_contents = [
                genai_types.Content(
                    role=msg.role,
                    parts=[genai_types.Part(text=msg.content)],
                )
                for msg in db_messages
            ]
        else:
            history_contents = [
                genai_types.Content(
                    role=msg.role,
                    parts=[genai_types.Part(text=msg.content)],
                )
                for msg in payload.history
            ]

        # --- RAG: retrieve relevant chunks for this query ---
        rag_context = ""
        hits = []
        sources: list[SourceReference] = []
        try:
            # 1. Try direct CSV row lookup first (user named a specific record)
            csv_row_ctx = find_csv_row_context(
                db=db, project_id=project.id, user_message=payload.message
            )

            if csv_row_ctx:
                # User asked about a specific identifiable record → inject full data
                rag_context = csv_row_ctx
            else:
                # 2. Semantic search with user-controlled threshold
                hits = retrieve_relevant_chunks(
                    db=db,
                    project_id=project.id,
                    query=payload.message,
                    top_k=20,
                    min_score=payload.min_score,
                )
                if hits:
                    sections = []
                    for score, chunk in hits:
                        # For CSV chunks, load the full row data
                        content_to_inject = chunk.content
                        row_key = None
                        if chunk.row_index is not None:
                            csv_row = (
                                db.query(CsvRowModel)
                                .filter(
                                    CsvRowModel.document_id == chunk.document_id,
                                    CsvRowModel.row_index == chunk.row_index,
                                )
                                .first()
                            )
                            if csv_row:
                                content_to_inject = csv_row.full_text
                                row_key = csv_row.row_key

                        sections.append(
                            f"[{chunk.document.filename} — relevance {score:.2f}]\n{content_to_inject}"
                        )
                        sources.append(
                            SourceReference(
                                document_id=chunk.document_id,
                                filename=chunk.document.filename,
                                chunk_index=chunk.chunk_index,
                                score=round(score, 4),
                                row_index=chunk.row_index,
                                row_key=row_key,
                            )
                        )

                    rag_context = "\n\n---\n\n".join(sections)
        except Exception as rag_exc:
            logger.warning("RAG retrieval failed: %s", rag_exc)

        if hits:
            logger.debug(
                "RAG | project=%s query=%r hits=%d min_score=%.2f",
                project.id,
                payload.message,
                len(hits),
                payload.min_score,
            )
            for _score, _chunk in hits:
                logger.debug(
                    "  score=%.3f  file=%s  chunk#%d  text=%r",
                    _score,
                    _chunk.document.filename,
                    _chunk.chunk_index,
                    _chunk.content[:120],
                )
        else:
            logger.debug(
                "RAG | project=%s query=%r — no chunks above threshold (%.2f)",
                project.id,
                payload.message,
                payload.min_score,
            )

        # Build system instruction
        MARKDOWN_INSTRUCTION = (
            "Always format your responses using Markdown. "
            "Use headings, bullet lists, bold, tables, and code blocks where appropriate. "
            "Reports and structured information must always be presented in Markdown."
        )

        if rag_context:
            # When RAG data is available, ground the model STRICTLY
            GROUNDING_RULE = (
                "REGLA ABSOLUTA: Eres un asistente que SOLO responde con información "
                "de la base de datos interna del proyecto. "
                "PROHIBIDO usar tu conocimiento general o entrenamiento. "
                "PROHIBIDO inventar o complementar con fuentes externas. "
                "Si la información recuperada no es suficiente, responde: "
                "'No tengo suficiente información en la base de datos para responder esto.'\n"
                "Tu ÚNICA fuente de datos es la sección 'DATOS RECUPERADOS' que aparece abajo."
            )
            system_parts = [GROUNDING_RULE, MARKDOWN_INSTRUCTION]
            if project.system_prompt:
                system_parts.append(project.system_prompt)
            system_parts.append(f"--- DATOS RECUPERADOS ---\n{rag_context}")
        else:
            system_parts = [MARKDOWN_INSTRUCTION]
            if project.system_prompt:
                system_parts.append(project.system_prompt)

        system_instruction = "\n\n".join(system_parts)

        chat = client.chats.create(
            model=project.model,
            config=genai_types.GenerateContentConfig(
                system_instruction=system_instruction,
            ),
            history=history_contents,
        )

        response = chat.send_message(payload.message)
        reply_text = response.text

    except Exception as exc:
        exc_str = str(exc)
        if "429" in exc_str or "quota" in exc_str.lower() or "rate" in exc_str.lower():
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Gemini API rate limit exceeded. Wait a moment and try again.",
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gemini API error: {exc}",
        )

    # Persist user message
    user_msg = Message(project_id=project.id, role="user", content=payload.message)
    db.add(user_msg)

    # Persist model reply
    model_msg = Message(project_id=project.id, role="model", content=reply_text)
    db.add(model_msg)
    db.commit()
    db.refresh(model_msg)

    return ChatResponse(
        reply=reply_text,
        message=MessageResponse.model_validate(model_msg),
        sources=sources,
    )


@router.get("/{project_id}/rag-debug", response_model=RagDebugResponse)
def rag_debug(
    project_id: int,
    query: str = Query(
        ..., min_length=1, description="Query to test against the RAG index"
    ),
    top_k: int = Query(default=20, ge=1, le=50),
    min_score: float = Query(default=0.20, ge=0.0, le=1.0),
    db: Session = Depends(get_db),
):
    """Debug endpoint: returns the raw RAG chunks that would be injected into the LLM context."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )

    hits = retrieve_relevant_chunks(
        db=db,
        project_id=project_id,
        query=query,
        top_k=top_k,
        min_score=min_score,
    )

    csv_match = find_csv_row_context(db=db, project_id=project_id, user_message=query)

    chunk_results = []
    for score, chunk in hits:
        # Look up the full SQLite row if this chunk came from a structured CSV
        full_row = None
        if chunk.row_index is not None:
            csv_row = (
                db.query(CsvRowModel)
                .filter(
                    CsvRowModel.document_id == chunk.document_id,
                    CsvRowModel.row_index == chunk.row_index,
                )
                .first()
            )
            if csv_row:
                full_row = csv_row.full_text
        chunk_results.append(
            RagDebugChunk(
                score=round(score, 4),
                filename=chunk.document.filename,
                chunk_index=chunk.chunk_index,
                content=chunk.content,
                full_row=full_row,
            )
        )

    return RagDebugResponse(
        query=query,
        total_chunks_retrieved=len(hits),
        min_score_threshold=min_score,
        csv_row_match=csv_match if csv_match else None,
        chunks=chunk_results,
    )


@router.get("/{project_id}/history", response_model=list[MessageResponse])
def get_chat_history(project_id: int, db: Session = Depends(get_db)):
    """Return the persisted chat history for a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    messages = (
        db.query(Message)
        .filter(Message.project_id == project_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    return messages


@router.delete("/{project_id}/history", status_code=status.HTTP_204_NO_CONTENT)
def clear_chat_history(project_id: int, db: Session = Depends(get_db)):
    """Delete all messages for a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    db.query(Message).filter(Message.project_id == project_id).delete()
    db.commit()
