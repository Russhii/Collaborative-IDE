from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware

from schemas import Project, UserCreate, UserLogin, AddMember, UpdateFile, CreateFile
from database import engine, Base, SessionLocal
import json
import models

from auth import (
    hash_password,
    verify_password,
    create_token,
    verify_token,
    decode_token
)



Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ---------------------------------------------------------
# DATABASE DEPENDENCY
# ---------------------------------------------------------

def get_db():
    """
    Creates a database session for each request
    and closes it after the request is completed.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------
# ACCESS CONTROL HELPER
# ---------------------------------------------------------

def check_project_access(
    project_id: int,
    current_user: dict,
    db: Session
):
    project = db.query(models.Project).filter(
        models.Project.id == project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    # Owner has access
    if project.owner_id == current_user["user_id"]:
        return project

    # Check member
    member = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == project_id,
        models.ProjectMember.user_id == current_user["user_id"]
    ).first()

    if not member:
        raise HTTPException(
            status_code=403,
            detail="You are not a member of this project"
        )

    return project


# ---------------------------------------------------------
# WEBSOCKET CONNECTION MANAGER
# ---------------------------------------------------------
class ConnectionManager:

    def __init__(self):
        self.active_connections = {}

    async def connect(
        self,
        project_id: int,
        websocket: WebSocket,
        user_id: int,
        user_name: str
    ):
        await websocket.accept()

        if project_id not in self.active_connections:
            self.active_connections[project_id] = []

        self.active_connections[project_id].append({
            "user_id": user_id,
            "user_name": user_name,
            "websocket": websocket
        })

    def disconnect(
        self,
        project_id: int,
        websocket: WebSocket
    ):
        connections = self.active_connections.get(
            project_id,
            []
        )

        remaining_connections = [
            connection
            for connection in connections
            if connection["websocket"] != websocket
        ]

        if remaining_connections:
            self.active_connections[project_id] = remaining_connections
        else:
            self.active_connections.pop(project_id, None)

    def get_online_users(self, project_id: int):

        connections = self.active_connections.get(
            project_id,
            []
        )

        return [
            connection["user_id"]
            for connection in connections
        ]

    async def broadcast(
        self,
        project_id: int,
        message: str
    ):
        connections = self.active_connections.get(
            project_id,
            []
        )

        dead_connections = []

        for connection in connections.copy():

            websocket = connection["websocket"]

            try:
                await websocket.send_text(message)

            except Exception as e:

                print(
                    f"Removing dead WebSocket "
                    f"for user {connection['user_id']}: {e}"
                )

                dead_connections.append(websocket)

        for websocket in dead_connections:

            self.disconnect(
                project_id,
                websocket
            )


manager = ConnectionManager()
# ---------------------------------------------------------
# HOME ENDPOINT
# ---------------------------------------------------------

@app.get("/")
def home():
    """
    Basic health-check endpoint.
    """
    return {
        "message": "Hello"
    }

@app.get("/health")
def health_check():
    return {
        "status": "healthy"
    }
# ---------------------------------------------------------
# REGISTER USER
# ---------------------------------------------------------

@app.post("/register")
def register_user(
    user: UserCreate,
    db: Session = Depends(get_db)
):
    """
    Registers a new user.

    Steps:
        1. Check whether email already exists.
        2. Hash the password.
        3. Create the user.
        4. Save the user to the database.
    """
    existing_user = db.query(models.User).filter(
        models.User.email == user.email
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )

    hashed = hash_password(user.password)

    new_user = models.User(
        name=user.name,
        email=user.email,
        password_hash=hashed
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "message": "New user created",
        "data": {
            "id": new_user.id,
            "name": new_user.name,
            "email": new_user.email
        }
    }


# ---------------------------------------------------------
# LOGIN USER
# ---------------------------------------------------------

@app.post("/login")
def login_user(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Authenticates a user and returns a JWT access token.

    OAuth2PasswordRequestForm uses:
        username -> user's email
        password -> user's password
    """
    db_user = db.query(models.User).filter(
        models.User.email == form_data.username
    ).first()

    if not db_user:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    if not verify_password(
        form_data.password,
        db_user.password_hash
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    token = create_token({
        "user_id": db_user.id
    })

    return {
        "access_token": token,
        "token_type": "bearer"
    }


# ---------------------------------------------------------
# GET CURRENT USER
# ---------------------------------------------------------

@app.get("/me")
def get_current_user(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """
    Returns information about the currently authenticated user.
    """
    user_id = payload.get("user_id")

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )

    user = db.query(models.User).filter(
        models.User.id == user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    return {
        "id": user.id,
        "name": user.name,
        "email": user.email
    }


# ---------------------------------------------------------
# CREATE PROJECT
# ---------------------------------------------------------

@app.post("/projects")
def create_project(
    project: Project,
    db: Session = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    """
    Creates a new project.

    The currently authenticated user automatically
    becomes the owner of the project.
    """
    new_project = models.Project(
        name=project.name,
        description=project.description,
        owner_id=current_user["user_id"]
    )

    db.add(new_project)
    db.commit()
    db.refresh(new_project)

    return {
        "message": "Project created successfully",
        "data": new_project
    }


# ---------------------------------------------------------
# GET ALL PROJECTS
# ---------------------------------------------------------

@app.get("/projects")
def get_all(
    db: Session = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    """
    Returns projects that the current user owns
    or is a member of.
    """

    user_id = current_user["user_id"]

    projects = db.query(models.Project).outerjoin(
        models.ProjectMember,
        models.ProjectMember.project_id == models.Project.id
    ).filter(
        (models.Project.owner_id == user_id) |
        (models.ProjectMember.user_id == user_id)
    ).distinct().all()

    return {
        "message": "User Projects",
        "data": projects
    }

# ---------------------------------------------------------
# GET ONE PROJECT
# ---------------------------------------------------------

@app.get("/projects/{project_id}")
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    project = check_project_access(
        project_id,
        current_user,
        db
    )

    return {
        "message": "Project details",
        "data": project
    }


# ---------------------------------------------------------
# UPDATE PROJECT
# ---------------------------------------------------------

@app.put("/projects/{project_id}")
def update_project(
    project_id: int,
    project: Project,
    db: Session = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    """
    Updates the name and description of an existing project.

    Only the project owner can update the project.
    """

    old_project = db.query(models.Project).filter(
        models.Project.id == project_id
    ).first()

    if not old_project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    if old_project.owner_id != current_user["user_id"]:
        raise HTTPException(
            status_code=403,
            detail="Only project owner can update the project"
        )

    old_project.name = project.name
    old_project.description = project.description

    db.commit()
    db.refresh(old_project)

    return {
        "message": "Project updated successfully",
        "data": old_project
    }
# ---------------------------------------------------------
# DELETE PROJECT
# ---------------------------------------------------------

@app.delete("/projects/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    """
    Deletes an existing project.

    Only the project owner can delete the project.
    """

    old_project = db.query(models.Project).filter(
        models.Project.id == project_id
    ).first()

    if not old_project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    if old_project.owner_id != current_user["user_id"]:
        raise HTTPException(
            status_code=403,
            detail="Only project owner can delete the project"
        )

    db.delete(old_project)
    db.commit()

    return {
        "message": "Project deleted successfully"
    }
# ---------------------------------------------------------
# ADD MEMBER TO PROJECT
# ---------------------------------------------------------

@app.post("/projects/{project_id}/members")
def add_member(
    project_id: int,
    member: AddMember,
    db: Session = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    """
    Adds an existing user to a project.

    Only the project owner is allowed to add members.
    """
    project = db.query(models.Project).filter(
        models.Project.id == project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    if project.owner_id != current_user["user_id"]:
        raise HTTPException(
            status_code=403,
            detail="Only project owner can add members"
        )

    user = db.query(models.User).filter(
        models.User.email == member.email
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    existing_member = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == project_id,
        models.ProjectMember.user_id == user.id
    ).first()

    if existing_member:
        raise HTTPException(
            status_code=400,
            detail="User is already a member"
        )

    new_member = models.ProjectMember(
        project_id=project_id,
        user_id=user.id,
        role=member.role
    )

    db.add(new_member)
    db.commit()
    db.refresh(new_member)

    return {
        "message": "Member added successfully",
        "data": {
            "id": new_member.id,
            "project_id": new_member.project_id,
            "user_id": new_member.user_id,
            "role": new_member.role
        }
    }


# ---------------------------------------------------------
# GET PROJECT MEMBERS
# ---------------------------------------------------------

@app.get("/projects/{project_id}/members")
def get_member_working_on_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    """
    Returns all members working on a specific project.

    Only the project owner can view the project members.
    """
    project = db.query(models.Project).filter(
        models.Project.id == project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    if project.owner_id != current_user["user_id"]:
        raise HTTPException(
            status_code=403,
            detail="Only project owner can view members"
        )

    members = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == project_id
    ).all()

    return {
        "message": "Project members",
        "data": members
    }


# ---------------------------------------------------------
# CREATE FILE
# ---------------------------------------------------------

@app.post("/projects/{project_id}/files")
def create_file(
    project_id: int,
    file_data: CreateFile,
    db: Session = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    project = check_project_access(
        project_id,
        current_user,
        db
    )

    new_file = models.ProjectFile(
        project_id=project.id,
        name=file_data.name,
        path=file_data.path,
        content=file_data.content,
        created_by=current_user["user_id"],
        updated_by=current_user["user_id"]
    )

    db.add(new_file)
    db.commit()
    db.refresh(new_file)

    return {
        "message": "File created successfully",
        "data": {
            "id": new_file.id,
            "name": new_file.name,
            "path": new_file.path,
            "content": new_file.content,
            "created_by": new_file.created_by
        }
    }


# ---------------------------------------------------------
# GET PROJECT FILES
# ---------------------------------------------------------

@app.get("/projects/{project_id}/files")
def get_files(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    check_project_access(
        project_id,
        current_user,
        db
    )

    files = db.query(models.ProjectFile).filter(
        models.ProjectFile.project_id == project_id
    ).all()

    return {
        "message": "Project files",
        "data": files
    }


# ---------------------------------------------------------
# GET ONE FILE
# ---------------------------------------------------------

@app.get("/projects/{project_id}/files/{file_id}")
def get_file(
    project_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    check_project_access(
        project_id,
        current_user,
        db
    )

    file = db.query(models.ProjectFile).filter(
        models.ProjectFile.id == file_id,
        models.ProjectFile.project_id == project_id
    ).first()

    if not file:
        raise HTTPException(
            status_code=404,
            detail="File not found"
        )

    return {
        "message": "File details",
        "data": file
    }


# ---------------------------------------------------------
# UPDATE FILE
# ---------------------------------------------------------

@app.put("/projects/{project_id}/files/{file_id}")
def update_file(
    project_id: int,
    file_id: int,
    new_content: UpdateFile,
    db: Session = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    check_project_access(
        project_id,
        current_user,
        db
    )

    file = db.query(models.ProjectFile).filter(
        models.ProjectFile.id == file_id,
        models.ProjectFile.project_id == project_id
    ).first()

    if not file:
        raise HTTPException(
            status_code=404,
            detail="File not found"
        )

    file.content = new_content.content
    file.updated_by = current_user["user_id"]
    file.version += 1

    db.commit()
    db.refresh(file)

    return {
        "message": "File updated successfully",
        "data": file
    }


# ---------------------------------------------------------
# DELETE FILE
# ---------------------------------------------------------

@app.delete("/projects/{project_id}/files/{file_id}")
def delete_file(
    project_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    check_project_access(
        project_id,
        current_user,
        db
    )

    file = db.query(models.ProjectFile).filter(
        models.ProjectFile.id == file_id,
        models.ProjectFile.project_id == project_id
    ).first()

    if not file:
        raise HTTPException(
            status_code=404,
            detail="File not found"
        )

    db.delete(file)
    db.commit()

    return {
        "message": "File deleted successfully"
    }


# ---------------------------------------------------------
# WEBSOCKET — LIVE PROJECT UPDATES
# ---------------------------------------------------------

@app.websocket("/ws/projects/{project_id}")
async def project_websocket(
    websocket: WebSocket,
    project_id: int,
    token: str
):
    db = SessionLocal()
    connected = False

    try:

        # 1. Decode JWT
        payload = decode_token(token)

        # 2. Check project access
        check_project_access(
            project_id,
            payload,
            db
        )

        user = db.query(models.User).filter(
            models.User.id == payload["user_id"]
        ).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        cursor_file_ids = {
            file.id
            for file in db.query(models.ProjectFile).filter(
                models.ProjectFile.project_id == project_id
            ).all()
        }

        # 3. Connect user
        await manager.connect(
            project_id,
            websocket,
            payload["user_id"],
            user.name
        )

        connected = True

        # 4. Get currently online users
        online_users = manager.get_online_users(project_id)

        await websocket.send_text(
            json.dumps({
                "type": "online_users",
                "users": online_users
            })
        )

        # 5. Tell everyone that this user joined
        await manager.broadcast(
            project_id,
            json.dumps({
                "type": "user_joined",
                "user_id": payload["user_id"]
            })
        )

        # 6. Receive messages
        while True:

            message = await websocket.receive_text()

            # Convert JSON string → dictionary
            data = json.loads(message)

            # -----------------------------------
            # CURSOR MOVE
            # -----------------------------------

            if data.get("type") == "cursor_move":

                file_id = data.get("file_id")
                line = data.get("line")
                column = data.get("column")

                if (
                    file_id is None
                    or line is None
                    or column is None
                ):
                    await websocket.send_text(
                        json.dumps({
                            "type": "error",
                            "message": "file_id, line and column are required"
                        })
                    )
                    continue

                if file_id not in cursor_file_ids:
                    await websocket.send_text(
                        json.dumps({
                            "type": "error",
                            "message": "File not found"
                        })
                    )
                    continue

                connection = next(
                    connection
                    for connection in manager.active_connections[project_id]
                    if connection["websocket"] == websocket
                )
                response = {
                    "type": "cursor_moved",
                    "user_id": payload["user_id"],
                    "user_name": connection["user_name"],
                    "file_id": file_id,
                    "line": line,
                    "column": column
                }

                await manager.broadcast(
                    project_id,
                    json.dumps(response)
                )

                continue

            # -----------------------------------
            # FILE UPDATE
            # -----------------------------------

            if data.get("type") != "file_update":

                await websocket.send_text(
                    json.dumps({
                        "type": "error",
                        "message": "Unknown event type"
                    })
                )

                continue

            file_id = data.get("file_id")
            version = data.get("version")
            content = data.get("content")

            if file_id is None or version is None or content is None:

                await websocket.send_text(
                    json.dumps({
                        "type": "error",
                        "message": "file_id and content are required"
                    })
                )

                continue

            # Find file
            file = db.query(models.ProjectFile).filter(
                models.ProjectFile.id == file_id,
                models.ProjectFile.project_id == project_id
            ).first()

            if not file:

                await websocket.send_text(
                    json.dumps({
                        "type": "error",
                        "message": "File not found"
                    })
                )

                continue
            if version != file.version:
                await websocket.send_text(
                    json.dumps({
                        "type": "conflict",
                        "file_id": file.id,
                        "server_version": file.version,
                        "client_version": version
                    })
                )
                continue                

            # Update file
            file.content = content
            file.updated_by = payload["user_id"]
            file.version+=1

            db.commit()
            db.refresh(file)

            # Create response
            response = {
                "type": "file_updated",
                "file_id": file.id,
                "content": file.content,
                "updated_by": file.updated_by,
                "version":file.version
            }

            # Broadcast
            await manager.broadcast(
                project_id,
                json.dumps(response)
            )

    except WebSocketDisconnect:

        if connected:

            manager.disconnect(
                project_id,
                websocket
            )

            await manager.broadcast(
                project_id,
                json.dumps({
                    "type": "user_left",
                    "user_id": payload["user_id"]
                })
            )

    except Exception as e:

        print("WebSocket error:", e)

        if connected:

            manager.disconnect(
                project_id,
                websocket
            )

    finally:

        db.close()