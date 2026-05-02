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
    min_score: float = Field(default=0.7, ge=0.0, le=1.0)


class SourceReference(BaseModel):
    document_id: int
    filename: str
    chunk_index: int
    score: float
    row_index: Optional[int] = None
    row_key: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
    message: MessageResponse
    sources: List[SourceReference] = []


# ── Document schemas ─────────────────────────────────────────────


class DocumentResponse(BaseModel):
    id: int
    project_id: int
    filename: str
    chunk_count: int
    csv_id_column: Optional[str] = None
    csv_index_columns: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── CSV structured upload schemas ────────────────────────────────


class CsvColumnsResponse(BaseModel):
    columns: List[str]


class CsvUploadConfig(BaseModel):
    id_column: str
    index_columns: List[str]


# ── Document reindex schema ─────────────────────────────────────


class ReindexResponse(BaseModel):
    reindexed: int
    skipped_no_content: int


# ── RAG debug schemas ────────────────────────────────────────────


class RagDebugChunk(BaseModel):
    score: float
    filename: str
    chunk_index: int
    content: str
    full_row: Optional[str] = (
        None  # full SQLite CsvRow text if chunk belongs to a CSV doc
    )


class RagDebugResponse(BaseModel):
    query: str
    total_chunks_retrieved: int
    min_score_threshold: float
    csv_row_match: Optional[str] = None
    chunks: List[RagDebugChunk]
