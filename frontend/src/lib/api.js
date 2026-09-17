// Thin REST client around the FastAPI backend in /backend/main.py.
// Every path/shape here is taken directly from that file so the frontend
// actually calls endpoints that exist, with the payloads it expects.
//
// In Docker production:
// Browser → Nginx → /api → FastAPI
//
// For local development, you can override this with:
// VITE_API_BASE_URL=http://localhost:8000

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "/api"

// WebSocket:
// Browser → Nginx → /ws → FastAPI
//
// For local development, you can override this with:
// VITE_WS_BASE_URL=ws://localhost:8000

export const WS_BASE =
  import.meta.env.VITE_WS_BASE_URL ||
  `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`


class ApiError extends Error {
  constructor(status, detail) {
    super(
      typeof detail === "string"
        ? detail
        : "Request failed"
    )

    this.status = status
    this.detail = detail
  }
}


async function request(
  path,
  { method = "GET", token, json, form } = {}
) {
  const headers = {}

  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  let body

  if (form) {
    body = new URLSearchParams(form)

    headers["Content-Type"] =
      "application/x-www-form-urlencoded"
  } else if (json !== undefined) {
    body = JSON.stringify(json)

    headers["Content-Type"] =
      "application/json"
  }

  const res = await fetch(
    `${API_BASE}${path}`,
    {
      method,
      headers,
      body
    }
  )

  let data = null

  try {
    data = await res.json()
  } catch {
    // no/invalid JSON body
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.detail || res.statusText
    )
  }

  return data
}


export const api = {

  // =========================================================
  // AUTH
  // Backend:
  // POST /register
  // POST /login
  // GET  /me
  // =========================================================

  register: (name, email, password) =>
    request(
      "/register",
      {
        method: "POST",
        json: {
          name,
          email,
          password
        }
      }
    ),


  // OAuth2PasswordRequestForm expects:
  // username = email
  // password = password

  login: (email, password) =>
    request(
      "/login",
      {
        method: "POST",
        form: {
          username: email,
          password
        }
      }
    ),


  me: (token) =>
    request(
      "/me",
      { token }
    ),


  // =========================================================
  // PROJECTS
  // Backend:
  // POST   /projects
  // GET    /projects
  // GET    /projects/{project_id}
  // PUT    /projects/{project_id}
  // DELETE /projects/{project_id}
  // =========================================================

  listProjects: (token) =>
    request(
      "/projects",
      { token }
    ),


  createProject: (
    token,
    name,
    description
  ) =>
    request(
      "/projects",
      {
        method: "POST",
        token,
        json: {
          name,
          description
        }
      }
    ),


  getProject: (
    token,
    projectId
  ) =>
    request(
      `/projects/${projectId}`,
      { token }
    ),


  updateProject: (
    token,
    projectId,
    name,
    description
  ) =>
    request(
      `/projects/${projectId}`,
      {
        method: "PUT",
        token,
        json: {
          name,
          description
        }
      }
    ),


  deleteProject: (
    token,
    projectId
  ) =>
    request(
      `/projects/${projectId}`,
      {
        method: "DELETE",
        token
      }
    ),


  // =========================================================
  // PROJECT MEMBERS
  // Backend:
  // POST /projects/{project_id}/members
  // GET  /projects/{project_id}/members
  // =========================================================

  addMember: (
    token,
    projectId,
    email,
    role = "developer"
  ) =>
    request(
      `/projects/${projectId}/members`,
      {
        method: "POST",
        token,
        json: {
          email,
          role
        }
      }
    ),


  getMembers: (
    token,
    projectId
  ) =>
    request(
      `/projects/${projectId}/members`,
      { token }
    ),


  // =========================================================
  // FILES
  // Backend:
  // POST   /projects/{project_id}/files
  // GET    /projects/{project_id}/files
  // GET    /projects/{project_id}/files/{file_id}
  // PUT    /projects/{project_id}/files/{file_id}
  // DELETE /projects/{project_id}/files/{file_id}
  // =========================================================

  listFiles: (
    token,
    projectId
  ) =>
    request(
      `/projects/${projectId}/files`,
      { token }
    ),


  createFile: (
    token,
    projectId,
    name,
    path,
    content = ""
  ) =>
    request(
      `/projects/${projectId}/files`,
      {
        method: "POST",
        token,
        json: {
          name,
          path,
          content
        }
      }
    ),


  getFile: (
    token,
    projectId,
    fileId
  ) =>
    request(
      `/projects/${projectId}/files/${fileId}`,
      { token }
    ),


  updateFile: (
    token,
    projectId,
    fileId,
    data
  ) =>
    request(
      `/projects/${projectId}/files/${fileId}`,
      {
        method: "PUT",
        token,
        json: data
      }
    ),


  deleteFile: (
    token,
    projectId,
    fileId
  ) =>
    request(
      `/projects/${projectId}/files/${fileId}`,
      {
        method: "DELETE",
        token
      }
    )
}


export { ApiError }