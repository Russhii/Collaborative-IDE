// Thin REST client around the FastAPI backend in /backend/main.py.
// Every path/shape here is taken directly from that file so the frontend
// actually calls endpoints that exist, with the payloads it expects.

export const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"

// backend/main.py has no ws:// route other than /ws/projects/{id}; derive
// the socket URL from the same host/port as the REST API.
export const WS_BASE = API_BASE.replace(/^http/, "ws")

class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === "string" ? detail : "Request failed")
    this.status = status
    this.detail = detail
  }
}

async function request(path, { method = "GET", token, json, form } = {}) {
  const headers = {}
  if (token) headers["Authorization"] = `Bearer ${token}`

  let body
  if (form) {
    body = new URLSearchParams(form)
    headers["Content-Type"] = "application/x-www-form-urlencoded"
  } else if (json !== undefined) {
    body = JSON.stringify(json)
    headers["Content-Type"] = "application/json"
  }

  const res = await fetch(`${API_BASE}${path}`, { method, headers, body })

  let data = null
  try {
    data = await res.json()
  } catch {
    // no/invalid JSON body
  }

  if (!res.ok) {
    throw new ApiError(res.status, data?.detail || res.statusText)
  }

  return data
}

export const api = {
  // ---- auth (backend: /register, /login, /me) ----
  register: (name, email, password) =>
    request("/register", { method: "POST", json: { name, email, password } }),

  // OAuth2PasswordRequestForm expects "username" (the email) + "password" as form fields
  login: (email, password) =>
    request("/login", { method: "POST", form: { username: email, password } }),

  me: (token) => request("/me", { token }),

  // ---- projects ----
  listProjects: (token) => request("/projects", { token }),
  createProject: (token, name, description) =>
    request("/projects", { method: "POST", token, json: { name, description } }),
  getProject: (token, projectId) => request(`/projects/${projectId}`, { token }),
  addMember: (token, projectId, email, role = "developer") =>
    request(`/projects/${projectId}/members`, {
      method: "POST",
      token,
      json: { email, role },
    }),
  getMembers: (token, projectId) => request(`/projects/${projectId}/members`, { token }),

  // ---- files ----
  listFiles: (token, projectId) => request(`/projects/${projectId}/files`, { token }),
  createFile: (token, projectId, name, path, content = "") =>
    request(`/projects/${projectId}/files`, {
      method: "POST",
      token,
      json: { name, path, content },
    }),
  getFile: (token, projectId, fileId) =>
    request(`/projects/${projectId}/files/${fileId}`, { token }),
  deleteFile: (token, projectId, fileId) =>
    request(`/projects/${projectId}/files/${fileId}`, { method: "DELETE", token }),
}

export { ApiError }
