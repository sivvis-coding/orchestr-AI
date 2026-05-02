# AGENTS.md

## Architecture

Two independent apps, NOT a monorepo:

- `backend/` — Python 3.12, FastAPI, SQLAlchemy (sync), SQLite
- `frontend/` — React 18 (plain JS, no TypeScript), Vite 5, MUI 7, TanStack Query 5

No shared config, no workspace tooling. Each has its own Dockerfile.

## Dev Environment

Everything runs via Docker Compose with hot-reload:

```sh
docker compose up          # starts both services
docker compose up backend  # backend only at :8000
docker compose up frontend # frontend only at :5173
```

- Backend: uvicorn with `--reload`, source mounted at `/app`
- Frontend: Vite dev server, source mounted with excluded `node_modules` volume
- SQLite persisted in a Docker volume (`sqlite_data` → `/app/data/orchestr_ai.db`)

### Running outside Docker

```sh
# Backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend && npm install && npm run dev
```

Frontend needs `VITE_API_URL` env var pointing to backend (defaults to `http://localhost:8000`).

## Backend Details

- **Entrypoint:** `app/main.py` — FastAPI app with CORS `*`, lifespan calls `init_db()`
- **DB migrations:** Manual `ALTER TABLE` in `app/database.py:init_db()` — no Alembic
- **RAG service:** `app/services/rag.py` — local embeddings via `sentence-transformers` (model: `paraphrase-multilingual-mpnet-base-v2`), cosine similarity retrieval, sentence-window chunking
- **Routers:** `projects`, `auth`, `chat`, `documents` under `app/routers/`
- **No tests exist**

## Frontend Details

- **Plain JavaScript** — no TypeScript, no type checking
- **Custom hooks** in `src/hooks/` wrap TanStack Query with cache invalidation
- **MUI exclusively** for UI components
- **No router** — view state managed via `useState` in `App.jsx`
- **Lint:** `npm run lint` (ESLint flat config, react/hooks/refresh plugins)
- **No tests, no prettier, no formatter**

## Commands

| Task | Command | Where |
|------|---------|-------|
| Lint frontend | `npm run lint` | `frontend/` |
| Build frontend | `npm run build` | `frontend/` |
| Run backend | `uvicorn app.main:app --reload` | `backend/` |
| Full stack (dev) | `docker compose up` | root |

## Gotchas

- Backend Dockerfile pre-downloads the embedding model (~420MB) at build time to avoid cold-start delay
- Backend installs CPU-only PyTorch explicitly to avoid pulling CUDA (~2GB)
- SQLite DB lives inside a Docker volume — `docker compose down -v` destroys data
- Frontend `node_modules` is an anonymous volume — rebuild container after dependency changes (`docker compose up --build frontend`)
- No `.env.example` exists — only env var is `VITE_API_URL` for frontend
