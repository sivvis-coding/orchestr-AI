from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ── Project schemas ──────────────────────────────────────────────

class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    model: str = Field(default="gemini-2.5-flash")
    api_key: str = Field(..., min_length=1)
    system_prompt: Optional[str] = ""
    context_data: Optional[str] = ""


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    model: Optional[str] = None
    system_prompt: Optional[str] = None
    context_data: Optional[str] = None


class ProjectResponse(ProjectBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Auth schemas ─────────────────────────────────────────────────

class ValidateKeyRequest(BaseModel):
    api_key: str = Field(..., min_length=1)
    model: str = Field(default="gemini-2.5-flash")


class ValidateKeyResponse(BaseModel):
    valid: bool
    message: str


# ── Message schemas ──────────────────────────────────────────────

class MessageBase(BaseModel):
    role: str = Field(..., pattern="^(user|model)$")
    content: str = Field(..., min_length=1)


class MessageResponse(MessageBase):
    id: int
    project_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatRequest(BaseModel):
    project_id: int
    message: str = Field(..., min_length=1)
    history: Optional[List[MessageBase]] = []


class ChatResponse(BaseModel):
    reply: str
    message: MessageResponse
