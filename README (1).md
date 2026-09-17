# Collaborative IDE

A full-stack real-time collaborative development environment where multiple users can work on the same project files simultaneously.

The application combines **React, Monaco Editor, FastAPI, PostgreSQL, WebSockets, and Yjs CRDTs** to provide real-time code collaboration with authentication, project management, file management, remote cursors, and conflict handling.

## Features

- User registration and JWT-based authentication
- Project creation and management
- Project members with roles
- Integrated file explorer
- Monaco Editor for code editing
- Real-time collaboration using WebSockets
- Yjs CRDT-based document synchronization
- Online collaborator presence
- Remote cursor tracking
- File version and conflict handling
- PostgreSQL database
- Dockerized frontend and backend
- Nginx reverse proxy
- AWS-ready deployment with EC2 and RDS PostgreSQL

## Architecture

```text
                         Internet
                            |
                            v
                    +----------------+
                    | Nginx :80      |
                    | React Frontend |
                    +-------+--------+
                            |
                  +---------+---------+
                  |                   |
                HTTP              WebSocket
                /api                  /ws
                  |                   |
                  +---------+---------+
                            |
                            v
                    +----------------+
                    | FastAPI        |
                    | Backend        |
                    +-------+--------+
                            |
                            v
                    +----------------+
                    | PostgreSQL     |
                    +----------------+
```

### Real-Time Collaboration

```text
User A                         User B
  |                              |
  v                              v
Monaco Editor                Monaco Editor
  |                              |
  v                              v
Yjs CRDT                     Yjs CRDT
  |                              |
  +---------- WebSocket ---------+
                 |
                 v
              FastAPI
```

Yjs maintains collaborative document state on the clients, while WebSockets provide the real-time communication channel with the FastAPI backend.

## Tech Stack

### Frontend

- React
- Vite
- Monaco Editor
- Yjs
- Tailwind CSS

### Backend

- Python
- FastAPI
- SQLAlchemy
- PostgreSQL
- JWT authentication
- WebSockets
- Pydantic

### Infrastructure

- Docker
- Docker Compose
- Nginx
- AWS EC2
- AWS RDS PostgreSQL

## Project Structure

```text
Collaborative-IDE/
|
├── backend/
│   ├── auth.py
│   ├── database.py
│   ├── main.py
│   ├── models.py
│   └── schemas.py
|
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── App.jsx
│   │   │   ├── Auth.jsx
│   │   │   ├── Projects.jsx
│   │   │   └── Editor.jsx
│   │   │
│   │   ├── lib/
│   │   │   ├── api.js
│   │   │   └── diff.js
│   │   │
│   │   └── main.jsx
│   │
│   ├── package.json
│   └── vite.config.js
|
├── Dockerfile.backend
├── Dockerfile.frontend
├── docker-compose.yml
├── nginx.conf
├── requirements.txt
├── .dockerignore
├── .gitignore
└── README.md
```

## Backend API

### Authentication

```text
POST /register
POST /login
GET  /me
```

### Projects

```text
POST   /projects
GET    /projects
GET    /projects/{project_id}
PUT    /projects/{project_id}
DELETE /projects/{project_id}
```

### Project Members

```text
POST /projects/{project_id}/members
GET  /projects/{project_id}/members
```

### Project Files

```text
POST   /projects/{project_id}/files
GET    /projects/{project_id}/files
GET    /projects/{project_id}/files/{file_id}
PUT    /projects/{project_id}/files/{file_id}
DELETE /projects/{project_id}/files/{file_id}
```

### WebSocket

```text
/ws/projects/{project_id}
```

The WebSocket endpoint handles collaboration events such as online users, user join/leave events, cursor movement, file updates, version conflicts, and errors.

## Authentication

The application uses JWT-based authentication.

```text
Register
   |
   v
Login
   |
   v
JWT Access Token
   |
   v
Authenticated API Requests
   |
   v
Project/File Access
```

Project access is checked for protected project and file operations.

## CRDT Collaboration

The editor uses **Yjs** to maintain a shared collaborative document.

The collaboration flow is:

```text
Editor Change
     |
     v
Yjs Document
     |
     v
WebSocket
     |
     v
FastAPI
     |
     v
Other Connected Clients
     |
     v
Yjs Document
     |
     v
Monaco Editor
```

This allows multiple users to edit the same document in real time.

## WebSocket Collaboration

WebSockets provide a persistent communication channel between the browser and FastAPI.

The backend manages connections per project and communicates collaboration events to connected users.

The application tracks:

- Connected collaborators
- Cursor positions
- File changes
- File versions
- Disconnected clients

Nginx is configured to forward WebSocket upgrade requests to FastAPI.

## Docker

The application can be run locally using Docker Compose.

```text
Frontend
   |
   v
Nginx
   |
   v
FastAPI
   |
   v
PostgreSQL
```

### Run locally

Clone the repository:

```bash
git clone https://github.com/Russhii/Collaborative-IDE.git
cd Collaborative-IDE
```

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db:5432/IDE
SECRET_KEY=YOUR_SECRET_KEY
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
POSTGRES_PASSWORD=YOUR_PASSWORD
```

Start the application:

```bash
docker compose up --build
```

Open:

```text
http://localhost
```

Stop the application:

```bash
docker compose down
```

To remove the PostgreSQL Docker volume and its stored data:

```bash
docker compose down -v
```

> Never commit `.env` or other files containing secrets to GitHub.

## AWS Deployment

The application is prepared for AWS deployment using EC2 and RDS PostgreSQL.

```text
                         Internet
                            |
                            v
                    +----------------+
                    | AWS EC2        |
                    |                |
                    | Docker         |
                    | |- Nginx       |
                    | `- FastAPI     |
                    +-------+--------+
                            |
                       Private VPC
                            |
                            v
                    +----------------+
                    | AWS RDS        |
                    | PostgreSQL     |
                    +----------------+
```

### AWS Components

- **EC2** runs the Dockerized application.
- **Nginx** serves the React frontend and proxies API/WebSocket traffic.
- **FastAPI** provides the backend and WebSocket server.
- **RDS PostgreSQL** provides persistent database storage.
- RDS is configured for private access from the EC2 environment.

## Environment Variables

The backend expects:

```env
DATABASE_URL=
SECRET_KEY=
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

For local Docker Compose with the PostgreSQL container:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db:5432/IDE
POSTGRES_PASSWORD=YOUR_PASSWORD
```

For AWS with RDS:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@YOUR_RDS_ENDPOINT:5432/IDE
```

Keep all credentials private.

## Development Without Docker

### Backend

Create a virtual environment:

```bash
python -m venv venv
```

Windows:

```bash
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start FastAPI:

```bash
uvicorn backend.main:app --reload
```

Depending on the project's import configuration, the backend can also be started from the `backend` directory:

```bash
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Security Considerations

- Secrets are stored in environment variables.
- `.env` is excluded from Git.
- Project ownership and membership are checked by the backend.
- RDS should not be publicly exposed.
- Production deployments should use HTTPS.
- Use strong JWT secrets and database passwords.
- Production deployments should use appropriate backups and monitoring.

## Future Improvements

- Git repository integration
- Branch and commit management
- Pull request workflow
- AI-powered code assistance
- Codebase/RAG intelligence
- Project-level AI memory
- Code execution sandbox
- Language service integration
- Redis-based collaboration scaling
- Horizontal backend scaling
- CI/CD pipeline
- HTTPS with a custom domain
- Automated testing
- Production observability and monitoring

## Author

**Rushikesh Parit**

GitHub: https://github.com/Russhii
