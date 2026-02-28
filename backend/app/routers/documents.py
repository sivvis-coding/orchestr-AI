from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import Document, Project
from ..schemas import DocumentResponse
from ..services.rag import ingest_document

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
        doc = ingest_document(
            db=db,
            project_id=project_id,
            filename=filename,
            content=content,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error generating embeddings: {exc}",
        )

    return doc


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
