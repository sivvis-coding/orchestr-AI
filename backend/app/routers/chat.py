from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import google.genai as genai
from google.genai import types as genai_types

from ..database import get_db
from ..models import Project, Message
from ..schemas import ChatRequest, ChatResponse, MessageResponse

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/", response_model=ChatResponse)
def send_message(payload: ChatRequest, db: Session = Depends(get_db)):
    """Send a message to Gemini and persist the exchange."""
    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

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

        # Combine system_prompt and context_data into the system instruction so
        # context is available for the entire conversation, not just the first turn.
        system_parts = []
        if project.system_prompt:
            system_parts.append(project.system_prompt)
        if project.context_data:
            system_parts.append(f"Context:\n{project.context_data}")
        system_instruction = "\n\n".join(system_parts) if system_parts else None

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
    )


@router.get("/{project_id}/history", response_model=list[MessageResponse])
def get_chat_history(project_id: int, db: Session = Depends(get_db)):
    """Return the persisted chat history for a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    db.query(Message).filter(Message.project_id == project_id).delete()
    db.commit()
