# orchestr-AI

A full-stack AI project management application powered by Google Gemini.

## Stack

| Layer      | Technology                                         |
|------------|----------------------------------------------------|
| Frontend   | React 18, Material UI (MUI), TanStack React Query  |
| Backend    | Python, FastAPI, SQLAlchemy                        |
| Database   | SQLite                                             |
| AI         | Google Gemini (via `google-genai` SDK)             |
| Deploy     | Docker, docker-compose                             |

## Features

- **Project Management** – create, view, and delete AI projects with a name, Gemini model selection (2.5 Flash / 2.5 Pro), and API key.
- **API Key Validation** – validates the Gemini API key before saving by making a lightweight test call.
- **Context Configuration** – each project has a configurable System Prompt and Context Data that persist in SQLite.
- **Persistent Chat** – full chat history per project, stored in the database and sent to Gemini on each turn.

## Project Structure

```
orchestr-AI/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI entry point
│   │   ├── database.py      # SQLAlchemy engine & session
│   │   ├── models.py        # ORM models (Project, Message)
│   │   ├── schemas.py       # Pydantic request/response schemas
│   │   └── routers/
│   │       ├── projects.py  # CRUD /projects
│   │       ├── auth.py      # POST /auth/validate-key
│   │       └── chat.py      # POST /chat, GET /chat/{id}/history
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api.js           # Axios API client
│   │   ├── hooks/
│   │   │   ├── useValidateKey.js   # useMutation for key validation
│   │   │   ├── useGetProjects.js   # useQuery for projects list
│   │   │   ├── useCreateProject.js # useMutation for create/update/delete
│   │   │   └── useSendMessage.js   # useMutation/useQuery for chat
│   │   ├── components/
│   │   │   ├── ProjectList.jsx
│   │   │   ├── ProjectForm.jsx
│   │   │   └── ChatWindow.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── nginx.conf
│   └── Dockerfile
└── docker-compose.yml
```

## Quick Start (Docker)

```bash
docker-compose up --build
```

- Frontend: http://localhost:80
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## Local Development

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Set `VITE_API_URL=http://localhost:8000` in a `.env.local` file if the backend runs on a different port.
