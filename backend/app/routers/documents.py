from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from typing import List, Optional
import io
import json
import pandas as pd

from ..database import get_db
from ..models import Document, Project
from ..schemas import DocumentResponse, CsvColumnsResponse
from ..services.rag import ingest_document, ingest_csv_structured, reindex_all_documents

router = APIRouter(prefix="/projects", tags=["documents"])

ALLOWED_EXTENSIONS = {
    "txt",
    "md",
    "csv",
    "json",
    "yaml",
    "yml",
    "html",
    "xml",
    "log",
    "py",
    "js",
    "ts",
    "java",
    "cs",
    "cpp",
    "c",
    "go",
    "rs",
    "toml",
    "ini",
    "cfg",
}
MAX_FILE_SIZE_MB = 50


@router.get("/{project_id}/documents", response_model=List[DocumentResponse])
def list_documents(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    return (
        db.query(Document)
        .filter(Document.project_id == project_id)
        .order_by(Document.created_at.desc())
        .all()
    )


@router.post(
    "/{project_id}/documents",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    project_id: int,
    file: UploadFile = File(...),
    id_column: Optional[str] = Form(None),
    index_columns: Optional[str] = Form(None),  # JSON-encoded list
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )

    # Validate extension
    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type '.{ext}' is not supported.",
        )

    # Read and size-check
    raw = await file.read()
    if len(raw) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {MAX_FILE_SIZE_MB} MB limit.",
        )

    try:
        content = raw.decode("utf-8", errors="replace")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot decode file: {exc}")

    try:
        # CSV with structured config takes a dedicated ingestion path
        if ext == "csv" and id_column:
            cols = json.loads(index_columns) if index_columns else [id_column]
            doc = ingest_csv_structured(
                db=db,
                project_id=project_id,
                filename=filename,
                content=content,
                id_column=id_column,
                index_columns=cols,
            )
        else:
            doc = ingest_document(
                db=db,
                project_id=project_id,
                filename=filename,
                content=content,
            )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error generating embeddings: {exc}",
        )

    return doc


@router.post(
    "/{project_id}/documents/csv-columns",
    response_model=CsvColumnsResponse,
    status_code=status.HTTP_200_OK,
)
async def preview_csv_columns(
    project_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Parse the first row of a CSV and return its column names."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    raw = await file.read()
    if len(raw) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large.")

    try:
        content = raw.decode("utf-8", errors="replace").lstrip("\ufeff")
        df = pd.read_csv(io.StringIO(content), sep=None, engine="python", nrows=0)
        return {"columns": list(df.columns)}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot parse CSV: {exc}")


@router.post(
    "/{project_id}/documents/reindex",
    status_code=status.HTTP_200_OK,
)
def reindex_documents(project_id: int, db: Session = Depends(get_db)):
    """Re-chunk and re-embed all documents using current chunking settings."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    result = reindex_all_documents(db, project_id)
    return result


@router.delete(
    "/{project_id}/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_document(project_id: int, doc_id: int, db: Session = Depends(get_db)):
    doc = (
        db.query(Document)
        .filter(Document.id == doc_id, Document.project_id == project_id)
        .first()
    )
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )
    db.delete(doc)
    db.commit()
