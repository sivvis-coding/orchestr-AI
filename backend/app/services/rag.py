"""
RAG service: file chunking, local embeddings via sentence-transformers,
cosine similarity retrieval.
"""

import io
import re
import csv
import json
import numpy as np
import pandas as pd
from typing import List, Tuple, Optional

from sentence_transformers import SentenceTransformer
from sqlalchemy.orm import Session

from ..models import Document, DocumentChunk, CsvRow

# ---------------------------------------------------------------------------
# Local embedding model (singleton — loaded once at startup)
# ---------------------------------------------------------------------------
# paraphrase-multilingual-mpnet-base-v2: ~420 MB, 768 dims, 50+ languages.
# Trained for semantic similarity across languages — essential for Spanish
# queries and passages. Works for both symmetric and asymmetric retrieval.
_EMBED_MODEL_NAME = "paraphrase-multilingual-mpnet-base-v2"
_embed_model: Optional[SentenceTransformer] = None


def _get_model() -> SentenceTransformer:
    global _embed_model
    if _embed_model is None:
        _embed_model = SentenceTransformer(_EMBED_MODEL_NAME)
    return _embed_model


# mpnet handles up to 512 tokens (~2 000 chars); keep chunks comfortably under
MAX_CHARS_PER_CHUNK = 1500

# Cell values longer than this are treated as free-form text — excluded from
# the identifier index chunk (loaded only when the user selects a record).
_MIN_TEXT_CELL_LEN = 250

# How many short-value columns to include in the per-row identifier chunk
_CSV_ID_COLS = 4

# Sentence-window chunking parameters for plain text
# Overlap ensures a phrase near a chunk boundary is fully captured in one chunk
_CHUNK_WINDOW_SENTENCES = 10  # sentences per chunk
_CHUNK_OVERLAP_SENTENCES = 3  # sentences re-used in the next chunk

# Split on end-of-sentence punctuation followed by whitespace, OR on newlines
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+|\n+")

# ---------------------------------------------------------------------------
# Chunking helpers
# ---------------------------------------------------------------------------


def _split_sentences(text: str) -> List[str]:
    """Split text into individual sentences (works for Spanish and English)."""
    return [s.strip() for s in _SENTENCE_RE.split(text) if s.strip()]


def _chunk_plain_text(text: str) -> List[str]:
    """
    Split text into overlapping sentence-window chunks.

    Uses a sliding window of _CHUNK_WINDOW_SENTENCES sentences with
    _CHUNK_OVERLAP_SENTENCES sentences of overlap between consecutive chunks.
    This guarantees that any phrase in the original text is fully captured
    inside at least one chunk, even if it would otherwise fall at a boundary.
    """
    sentences = _split_sentences(text)
    if not sentences:
        return [text[:MAX_CHARS_PER_CHUNK]] if text.strip() else []

    chunks: List[str] = []
    step = max(1, _CHUNK_WINDOW_SENTENCES - _CHUNK_OVERLAP_SENTENCES)
    i = 0
    while i < len(sentences):
        window = sentences[i : i + _CHUNK_WINDOW_SENTENCES]
        chunk = " ".join(window)
        if chunk:
            chunks.append(chunk[:MAX_CHARS_PER_CHUNK])
        i += step

    return chunks or [text[:MAX_CHARS_PER_CHUNK]]


def _normalize_cell(val: str) -> str:
    """Collapse internal newlines inside a CSV cell into a single space."""
    val = re.sub(r"\r?\n[ \t]*\r?\n", " ", val)
    val = re.sub(r"\r?\n", " ", val)
    val = re.sub(r" {2,}", " ", val)
    return val.strip()


def _chunk_csv(content: str) -> List[Tuple[str, int]]:
    """
    Hybrid CSV indexing: ONE lightweight identifier chunk per row.

    Each chunk contains only the first _CSV_ID_COLS short-value columns:
        [row: <first_val>] col1: v1 | col2: v2 | col3: v3

    The row_index (0-based DataFrame position) is returned alongside the
    chunk text so the full row can be retrieved on demand via
    get_full_csv_row().  Long text cells are intentionally excluded from
    the index — they are only loaded when the user selects a specific record.
    """
    content = content.lstrip("\ufeff")
    result: List[Tuple[str, int]] = []
    try:
        df = pd.read_csv(io.StringIO(content), sep=None, engine="python")
        for row_idx, (_, row) in enumerate(df.iterrows()):
            if row.isna().all():
                continue

            first_val = str(row.iloc[0]).strip() if len(row) > 0 else ""
            if not first_val or first_val == "nan":
                first_val = str(row_idx)
            row_prefix = f"[row: {first_val}]"

            id_parts: List[str] = []
            for col, val in row.items():
                if len(id_parts) >= _CSV_ID_COLS:
                    break
                if pd.isna(val) or str(val).strip() in ("", "nan"):
                    continue
                val_str = _normalize_cell(str(val))
                if not val_str or val_str == "nan":
                    continue
                # Skip long text cells — they live in the full row only
                if len(val_str) >= _MIN_TEXT_CELL_LEN:
                    continue
                id_parts.append(f"{col}: {val_str}")

            chunk = (
                f"{row_prefix} " + (" | ".join(id_parts) if id_parts else row_prefix)
            )
            result.append((chunk[:MAX_CHARS_PER_CHUNK], row_idx))

    except Exception:
        reader = csv.DictReader(io.StringIO(content))
        for row_idx, row in enumerate(reader):
            parts = [f"{k}: {v}" for k, v in row.items() if v not in (None, "")]
            chunk = " | ".join(parts)
            if chunk:
                result.append((chunk[:MAX_CHARS_PER_CHUNK], row_idx))

    return result


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


def chunk_file(filename: str, content: str) -> List[Tuple[str, Optional[int]]]:
    """
    Dispatch to the right chunker. Returns list of (chunk_text, row_index).
    row_index is set only for CSV rows; None for all other file types.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "csv":
        return _chunk_csv(content)  # already List[Tuple[str, int]]
    if ext == "json":
        return [(text, None) for text in _chunk_json(content)]
    return [(text, None) for text in _chunk_plain_text(content)]


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
    chunks_meta = chunk_file(filename, content)
    if not chunks_meta:
        chunks_meta = [(content[:MAX_CHARS_PER_CHUNK], None)]

    embeddings = _embed_batch([text for text, _ in chunks_meta])

    doc = Document(
        project_id=project_id,
        filename=filename,
        chunk_count=len(chunks_meta),
        raw_content=content,  # stored for future re-indexing
    )
    db.add(doc)
    db.flush()  # populate doc.id before creating chunks

    for idx, ((text, row_index), emb) in enumerate(zip(chunks_meta, embeddings)):
        db.add(
            DocumentChunk(
                document_id=doc.id,
                content=text,
                embedding=_embedding_to_bytes(emb),
                chunk_index=idx,
                row_index=row_index,
            )
        )

    db.commit()
    db.refresh(doc)
    return doc


def reindex_all_documents(db: Session, project_id: int) -> dict:
    """
    Re-chunk and re-embed all documents for a project using the current
    chunking parameters. Requires raw_content to have been stored on upload.
    Returns a summary dict with counts.
    """
    docs = db.query(Document).filter(Document.project_id == project_id).all()
    reindexed = 0
    skipped = 0
    for doc in docs:
        if not doc.raw_content:
            skipped += 1
            continue
        # Delete existing chunks
        db.query(DocumentChunk).filter(DocumentChunk.document_id == doc.id).delete()
        # Re-chunk with current settings
        chunks_meta = chunk_file(doc.filename, doc.raw_content)
        if not chunks_meta:
            chunks_meta = [(doc.raw_content[:MAX_CHARS_PER_CHUNK], None)]
        embeddings = _embed_batch([t for t, _ in chunks_meta])
        for idx, ((text, row_index), emb) in enumerate(zip(chunks_meta, embeddings)):
            db.add(
                DocumentChunk(
                    document_id=doc.id,
                    content=text,
                    embedding=_embedding_to_bytes(emb),
                    chunk_index=idx,
                    row_index=row_index,
                )
            )
        doc.chunk_count = len(chunks_meta)
        reindexed += 1
    db.commit()
    return {"reindexed": reindexed, "skipped_no_content": skipped}


def retrieve_relevant_chunks(
    db: Session,
    project_id: int,
    query: str,
    top_k: int = 20,
    min_score: float = 0.20,
) -> List[Tuple[float, DocumentChunk]]:
    """
    Embed `query`, compute cosine similarity against all chunks for the
    project, and return up to top_k chunks whose score >= min_score.

    The min_score threshold prevents returning irrelevant chunks when nothing
    in the documents is genuinely related to the query.
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
    # Apply minimum relevance threshold before capping at top_k
    scored = [(s, c) for s, c in scored if s >= min_score]
    return scored[:top_k]


# ---------------------------------------------------------------------------
# Hybrid CSV helpers
# ---------------------------------------------------------------------------


def get_full_csv_row(raw_content: str, row_index: int) -> str:
    """
    Parse the stored CSV and return every column of the row at row_index.
    Kept for backwards-compat; prefer querying CsvRow.full_text directly.
    """
    content = raw_content.lstrip("\ufeff")
    try:
        df = pd.read_csv(io.StringIO(content), sep=None, engine="python")
        if row_index < 0 or row_index >= len(df):
            return ""
        row = df.iloc[row_index]
        parts = []
        for col, val in row.items():
            if pd.isna(val) or str(val).strip() in ("", "nan"):
                continue
            val_str = _normalize_cell(str(val))
            if val_str and val_str != "nan":
                parts.append(f"{col}: {val_str}")
        return "\n".join(parts)
    except Exception:
        return ""


def ingest_csv_structured(
    db: Session,
    project_id: int,
    filename: str,
    content: str,
    id_column: str,
    index_columns: List[str],
) -> Document:
    """
    Structured CSV ingestion with explicit column configuration.

    - id_column:     column whose value becomes CsvRow.row_key (the identifier)
    - index_columns: columns whose values are concatenated and embedded for RAG

    Each CSV row is stored in full in the CsvRow table.  Embeddings are created
    only from the index_columns so the search surface is focused and relevant.
    """
    import json as _json

    content = content.lstrip("\ufeff")
    df = pd.read_csv(io.StringIO(content), sep=None, engine="python")

    available = list(df.columns)
    if id_column not in available:
        raise ValueError(
            f"id_column '{id_column}' not found. Available: {available}"
        )
    missing = [c for c in index_columns if c not in available]
    if missing:
        raise ValueError(f"index_columns not found: {missing}")

    doc = Document(
        project_id=project_id,
        filename=filename,
        raw_content=content,
        csv_id_column=id_column,
        csv_index_columns=_json.dumps(index_columns),
    )
    db.add(doc)
    db.flush()  # get doc.id

    index_texts: List[str] = []
    row_metas: List[Tuple[str, int]] = []  # (row_key, row_index)

    for row_idx, (_, row) in enumerate(df.iterrows()):
        if row.isna().all():
            continue

        # Build full_text (all non-empty columns)
        full_parts = []
        for col, val in row.items():
            if pd.isna(val) or str(val).strip() in ("", "nan"):
                continue
            val_str = _normalize_cell(str(val))
            if val_str and val_str != "nan":
                full_parts.append(f"{col}: {val_str}")
        full_text = "\n".join(full_parts)

        raw_key = row.get(id_column, "")
        row_key = _normalize_cell(str(raw_key)) if pd.notna(raw_key) else str(row_idx)
        if not row_key or row_key == "nan":
            row_key = str(row_idx)

        db.add(
            CsvRow(
                project_id=project_id,
                document_id=doc.id,
                row_key=row_key,
                row_index=row_idx,
                full_text=full_text,
            )
        )

        # Build index text from selected columns only
        idx_parts = []
        for col in index_columns:
            val = row.get(col)
            if pd.isna(val) or str(val).strip() in ("", "nan"):
                continue
            val_str = _normalize_cell(str(val))
            if val_str and val_str != "nan":
                idx_parts.append(f"{col}: {val_str}")
        index_text = f"[row: {row_key}] " + " | ".join(idx_parts)
        index_texts.append(index_text[:MAX_CHARS_PER_CHUNK])
        row_metas.append((row_key, row_idx))

    embeddings = _embed_batch(index_texts) if index_texts else []

    for chunk_idx, (idx_text, (_, row_idx), emb) in enumerate(
        zip(index_texts, row_metas, embeddings)
    ):
        db.add(
            DocumentChunk(
                document_id=doc.id,
                content=idx_text,
                embedding=_embedding_to_bytes(emb),
                chunk_index=chunk_idx,
                row_index=row_idx,
            )
        )

    doc.chunk_count = len(index_texts)
    db.commit()
    db.refresh(doc)
    return doc


def find_csv_row_context(db: Session, project_id: int, user_message: str) -> str:
    """
    Check whether the user message names a specific row_key stored in CsvRow.
    If found, return the full_text of those rows as LLM-ready context.
    Falls back to empty string so the caller uses regular RAG.
    """
    user_lower = user_message.lower()

    csv_rows = (
        db.query(CsvRow)
        .filter(CsvRow.project_id == project_id)
        .all()
    )
    if not csv_rows:
        return ""

    results: List[str] = []
    seen: set = set()
    for row in csv_rows:
        key = row.row_key.strip()
        if not key or key in seen:
            continue
        if key.lower() in user_lower or user_lower in key.lower():
            seen.add(key)
            results.append(
                f"**Complete record** from '{row.document.filename}' "
                f"\u2014 identifier: '{key}':\n{row.full_text}"
            )

    if not results:
        return ""

    return (
        "The user is asking about a specific CSV record. "
        "Below is the COMPLETE record retrieved directly from the database. "
        "Use ALL fields to answer the question thoroughly:\n\n"
        + "\n\n---\n\n".join(results)
    )
