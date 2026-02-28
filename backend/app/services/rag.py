"""
RAG service: file chunking, local embeddings via sentence-transformers,
cosine similarity retrieval.
"""

import io
import csv
import json
import numpy as np
import pandas as pd
from typing import List, Tuple, Optional

from sentence_transformers import SentenceTransformer
from sqlalchemy.orm import Session

from ..models import Document, DocumentChunk

# ---------------------------------------------------------------------------
# Local embedding model (singleton — loaded once at startup)
# ---------------------------------------------------------------------------
# all-MiniLM-L6-v2: 90 MB, 384 dims, max 256 tokens (~1 000 chars), very fast.
_EMBED_MODEL_NAME = "all-MiniLM-L6-v2"
_embed_model: Optional[SentenceTransformer] = None


def _get_model() -> SentenceTransformer:
    global _embed_model
    if _embed_model is None:
        _embed_model = SentenceTransformer(_EMBED_MODEL_NAME)
    return _embed_model


# MiniLM handles ~256 tokens; keep chunks well under that max
MAX_CHARS_PER_CHUNK = 1000

# ---------------------------------------------------------------------------
# Chunking helpers
# ---------------------------------------------------------------------------


def _chunk_plain_text(text: str) -> List[str]:
    """Split plain text by blank lines; keep chunks under MAX_CHARS_PER_CHUNK."""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: List[str] = []
    current = ""
    for para in paragraphs:
        if not current:
            current = para[:MAX_CHARS_PER_CHUNK]
        elif len(current) + 2 + len(para) <= MAX_CHARS_PER_CHUNK:
            current = current + "\n\n" + para
        else:
            chunks.append(current)
            current = para[:MAX_CHARS_PER_CHUNK]
    if current:
        chunks.append(current)
    return chunks or [text[:MAX_CHARS_PER_CHUNK]]


def _row_to_parts(row: "pd.Series") -> List[str]:  # type: ignore[name-defined]
    """Convert a DataFrame row to a list of 'col: val' strings, skipping NaNs."""
    import pandas as _pd

    return [
        f"{col}: {val}"
        for col, val in row.items()
        if _pd.notna(val) and str(val).strip() != ""
    ]


def _chunk_csv(content: str) -> List[str]:
    """
    Each CSV row becomes one or more chunks.

    - If the full row fits in MAX_CHARS_PER_CHUNK it becomes a single chunk.
    - If the row is wider (many columns / long values), it is split into
      column groups so no chunk is truncated.
    """
    chunks: List[str] = []
    try:
        df = pd.read_csv(io.StringIO(content))
        for _, row in df.iterrows():
            parts = _row_to_parts(row)
            if not parts:
                continue
            # Build a row prefix from the first column for sub-chunk context
            first_col = str(row.iloc[0]) if len(row) > 0 else ""
            row_prefix = f"[row: {first_col}] " if first_col else ""

            current_chunk = row_prefix
            for part in parts:
                candidate = (
                    (current_chunk + " | " + part)
                    if current_chunk.strip(" [row:]")
                    else (row_prefix + part)
                )
                if len(candidate) <= MAX_CHARS_PER_CHUNK:
                    current_chunk = candidate
                else:
                    if current_chunk and current_chunk != row_prefix:
                        chunks.append(current_chunk)
                    # Start a new sub-chunk for this row, keeping the row prefix
                    current_chunk = row_prefix + part
            if current_chunk and current_chunk != row_prefix:
                chunks.append(current_chunk)
    except Exception:
        # Fallback: use csv.DictReader
        reader = csv.DictReader(io.StringIO(content))
        for row in reader:
            parts = [f"{k}: {v}" for k, v in row.items() if v not in (None, "")]
            chunk = " | ".join(parts)
            if chunk:
                chunks.append(chunk[:MAX_CHARS_PER_CHUNK])
    return chunks or _chunk_plain_text(content)


def _chunk_json(content: str) -> List[str]:
    """Each top-level JSON element becomes one chunk."""
    try:
        data = json.loads(content)
        if isinstance(data, list):
            return [
                json.dumps(item, ensure_ascii=False)[:MAX_CHARS_PER_CHUNK]
                for item in data
            ]
        if isinstance(data, dict):
            return [
                f"{k}: {json.dumps(v, ensure_ascii=False)[:400]}"
                for k, v in data.items()
            ]
    except Exception:
        pass
    return _chunk_plain_text(content)


def chunk_file(filename: str, content: str) -> List[str]:
    """Dispatch to the right chunker based on file extension."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "csv":
        return _chunk_csv(content)
    if ext == "json":
        return _chunk_json(content)
    return _chunk_plain_text(content)


# ---------------------------------------------------------------------------
# Embedding helpers
# ---------------------------------------------------------------------------


def _embedding_to_bytes(values: List[float]) -> bytes:
    return np.array(values, dtype=np.float32).tobytes()


def _bytes_to_embedding(b: bytes) -> np.ndarray:
    return np.frombuffer(b, dtype=np.float32)


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def _embed_batch(texts: List[str]) -> List[List[float]]:
    """Embed texts locally using sentence-transformers. No API calls, no limits."""
    model = _get_model()
    embeddings = model.encode(texts, batch_size=64, show_progress_bar=False)
    return embeddings.tolist()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def ingest_document(
    db: Session,
    project_id: int,
    filename: str,
    content: str,
) -> Document:
    """Chunk a file, embed all chunks, persist to DB, return the Document record."""
    chunks = chunk_file(filename, content)
    if not chunks:
        chunks = [content[:MAX_CHARS_PER_CHUNK]]

    embeddings = _embed_batch(chunks)

    doc = Document(project_id=project_id, filename=filename, chunk_count=len(chunks))
    db.add(doc)
    db.flush()  # populate doc.id before creating chunks

    for idx, (text, emb) in enumerate(zip(chunks, embeddings)):
        db.add(
            DocumentChunk(
                document_id=doc.id,
                content=text,
                embedding=_embedding_to_bytes(emb),
                chunk_index=idx,
            )
        )

    db.commit()
    db.refresh(doc)
    return doc


def retrieve_relevant_chunks(
    db: Session,
    project_id: int,
    query: str,
    top_k: int = 6,
) -> List[Tuple[float, DocumentChunk]]:
    """
    Embed `query`, compute cosine similarity against all chunks for the
    project, return the top_k most similar (score, chunk) pairs.
    """
    docs = db.query(Document).filter(Document.project_id == project_id).all()
    if not docs:
        return []

    doc_ids = [d.id for d in docs]
    chunks = (
        db.query(DocumentChunk).filter(DocumentChunk.document_id.in_(doc_ids)).all()
    )
    if not chunks:
        return []

    # Embed query
    query_emb = np.array(_embed_batch([query])[0], dtype=np.float32)

    scored = [
        (_cosine_similarity(query_emb, _bytes_to_embedding(c.embedding)), c)
        for c in chunks
    ]
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[:top_k]
