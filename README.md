## Collaborative IDE

A full-stack collaborative coding platform that lets multiple users work together on projects, edit files in real time, and manage project access with authentication.

This project combines a React + Vite frontend with a FastAPI backend and supports live collaborative editing using Yjs/CRDT technology.

## Features

- User registration and login
- JWT-based authentication
- Project creation and member management
- File and folder structure management
- Real-time collaborative editing
- WebSocket-powered project updates
- Online user presence in shared projects
- Modern editor experience with Monaco

## Tech Stack

### Frontend
- React
- Vite
- Monaco Editor
- Yjs
- WebSocket integration for collaboration

### Backend
- FastAPI
- SQLAlchemy
- SQLite database
- JWT authentication
- WebSocket support for live sync

## Project Structure

```text
UML/
├── Frontend/          # React frontend application
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── README.md
├── backend/           # FastAPI backend
│   ├── auth.py
│   ├── database.py
│   ├── main.py
│   ├── models.py
│   ├── schemas.py
│   └── requirements.txt
├── package.json       # Root-level package metadata
├── requirements.txt   # Python dependencies for backend
├── .gitignore
├── .env
└── README.md
```

## Prerequisites

Before running the app, make sure you have:

- Node.js 18+
- npm
- Python 3.10+
- A browser for local development

## Backend Setup

From the project root:

```bash
cd backend
python -m venv venv
# On Windows
venv\Scripts\activate
# On macOS/Linux
# source venv/bin/activate
pip install -r ../requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The backend runs on:

```text
http://127.0.0.1:8000
```

## Frontend Setup

From the project root:

```bash
cd Frontend
npm install
npm run dev
```

The frontend usually runs on:

```text
http://127.0.0.1:5173
```

If needed, set the API base URL in the frontend environment:

```bash
VITE_API_URL=http://127.0.0.1:8000
```

## How It Works

1. Users register or log in with their credentials.
2. A JWT token is generated for authenticated requests.
3. Users create or join projects.
4. Files can be added, edited, and shared with project members.
5. Real-time code updates are synchronized across connected clients using Yjs and WebSocket communication.
6. Project members receive live collaboration updates without reloading the page.

## Typical Workflow

```text
Login/Register -> Dashboard -> Project -> File Explorer -> Editor -> Collaboration
```

## Notes

- The frontend expects the FastAPI backend to be running before use.
- The backend uses SQLite by default for local development.
- The collaboration layer is designed for real-time shared editing across multiple users.

## Development Goals

This project is useful for learning and building:

- collaborative app architecture
- realtime web application patterns
- CRDT-based editing
- JWT-authenticated APIs
- full-stack project organization

## Summary

UML Collaborative IDE is a practical full-stack application that demonstrates collaborative coding workflows, secure authentication, and real-time file synchronization in a single project.
