from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = "sqlite:///./data/orchestr_ai.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    import os

    os.makedirs("./data", exist_ok=True)
    Base.metadata.create_all(bind=engine)
    # Safe migration: add raw_content column if it doesn't exist yet (SQLite)
    with engine.connect() as conn:
        for ddl in [
            "ALTER TABLE documents ADD COLUMN raw_content TEXT",
            "ALTER TABLE documents ADD COLUMN csv_id_column VARCHAR(255)",
            "ALTER TABLE documents ADD COLUMN csv_index_columns TEXT",
            "ALTER TABLE document_chunks ADD COLUMN row_index INTEGER",
        ]:
            try:
                conn.execute(text(ddl))
                conn.commit()
            except Exception:
                pass  # column already exists
