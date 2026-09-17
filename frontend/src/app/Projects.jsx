import { useEffect, useState } from "react"
import { api, ApiError } from "../lib/api"

export default function Projects({ token, user, onSelectProject, onLogout }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [creating, setCreating] = useState(false)

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await api.listProjects(token)
      setProjects(res.data || [])
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to load projects")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    setError("")
    try {
      const res = await api.createProject(token, name.trim(), description.trim())
      setProjects((prev) => [...prev, res.data])
      setName("")
      setDescription("")
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to create project")
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="min-h-screen w-full bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-8 flex items-center justify-between border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-300 text-lg font-black text-slate-950">
              {"</>"}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
                Collaborative IDE
              </p>
              <h1 className="text-xl font-bold tracking-tight">Your workspace</h1>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 hover:text-white"
          >
            Log out
          </button>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <section className="order-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-2xl shadow-black/20 lg:order-1 lg:p-7">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="mb-1 text-sm text-slate-400">Welcome back, {user.name}</p>
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Projects</h2>
              </div>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-400">
                {projects.length} {projects.length === 1 ? "project" : "projects"}
              </span>
            </div>

            {error && (
              <p className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-300">
                {error}
              </p>
            )}

            {loading && <p className="text-sm text-slate-400">Loading projects…</p>}
            {!loading && projects.length === 0 && (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/40 px-6 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-xl text-amber-300">
                  +
                </div>
                <p className="font-semibold text-slate-200">No projects yet</p>
                <p className="mt-1 max-w-sm text-sm text-slate-500">
                  Create your first project from the panel to start collaborating.
                </p>
              </div>
            )}

            {!loading && projects.length > 0 && (
              <ul className="grid gap-4 sm:grid-cols-2">
                {projects.map((project) => (
                  <li key={project.id}>
                    <button
                      onClick={() => onSelectProject(project)}
                      className="group min-h-32 w-full rounded-xl border border-slate-700 bg-slate-950/60 p-5 text-left transition hover:-translate-y-0.5 hover:border-amber-300/60 hover:bg-slate-800"
                    >
                      <span className="mb-3 flex items-center justify-between">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-300/10 text-amber-300">
                          {"{}"}
                        </span>
                        <span className="text-slate-600 transition group-hover:translate-x-1 group-hover:text-amber-300">
                          →
                        </span>
                      </span>
                      <span className="block truncate font-semibold text-slate-100">{project.name}</span>
                      {project.description && (
                        <span className="mt-1 block truncate text-sm text-slate-400">{project.description}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="order-1 h-fit rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-black/20 lg:order-2">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">New workspace</p>
              <h2 className="mt-1 text-lg font-bold">Create a project</h2>
              <p className="mt-1 text-sm text-slate-400">Start a shared space for your next idea.</p>
            </div>

            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Project name"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                type="text"
                placeholder="Description (optional)"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <button
                disabled={creating}
                className="rounded-lg bg-amber-300 px-3 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create project"}
              </button>
            </form>
          </aside>
        </div>
      </div>
    </main>
  )
}
