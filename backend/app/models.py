from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, LargeBinary
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from .database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    model = Column(String(100), nullable=False, default="gemini-2.5-flash")
    api_key = Column(String(500), nullable=False)
    system_prompt = Column(Text, nullable=True, default="")
    context_data = Column(Text, nullable=True, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    messages = relationship(
        "Message", back_populates="project", cascade="all, delete-orphan"
    )
    documents = relationship(
        "Document", back_populates="project", cascade="all, delete-orphan"
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    role = Column(String(50), nullable=False)  # "user" or "model"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="messages")


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    chunk_count = Column(Integer, default=0)
    raw_content = Column(Text, nullable=True)  # original file text for re-indexing
    # CSV-specific config (JSON-encoded lists / strings)
    csv_id_column = Column(String(255), nullable=True)  # column used as row key
    csv_index_columns = Column(Text, nullable=True)  # JSON list of cols to embed
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="documents")
    chunks = relationship(
        "DocumentChunk", back_populates="document", cascade="all, delete-orphan"
    )
    csv_rows = relationship(
        "CsvRow", back_populates="document", cascade="all, delete-orphan"
    )


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(LargeBinary, nullable=False)
    chunk_index = Column(Integer, default=0)
    row_index = Column(
        Integer, nullable=True
    )  # CSV rows: original DataFrame row number

    document = relationship("Document", back_populates="chunks")


class CsvRow(Base):
    """Stores the full text of every row in a structured CSV document."""

    __tablename__ = "csv_rows"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    row_key = Column(String(500), nullable=False, index=True)  # value of id_column
    row_index = Column(Integer, nullable=False)  # 0-based DataFrame row
    full_text = Column(Text, nullable=False)  # all col: val pairs

    document = relationship("Document", back_populates="csv_rows")
