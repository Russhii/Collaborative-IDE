import { useEffect, useState } from "react"
import { api, ApiError } from "../lib/api"

export default function Projects({
  token,
  user,
  onSelectProject,
  onLogout
}) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Create project
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [creating, setCreating] = useState(false)

  // Edit project
  const [editingProject, setEditingProject] = useState(null)
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [updating, setUpdating] = useState(false)

  // Members
  const [membersProject, setMembersProject] = useState(null)
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)

  const [memberEmail, setMemberEmail] = useState("")
  const [memberRole, setMemberRole] = useState("developer")
  const [addingMember, setAddingMember] = useState(false)

  const load = async () => {
    setLoading(true)
    setError("")

    try {
      const res = await api.listProjects(token)
      setProjects(res.data || [])
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : "Failed to load projects"
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // =========================================================
  // CREATE PROJECT
  // =========================================================

  const handleCreate = async (e) => {
    e.preventDefault()

    if (!name.trim()) return

    setCreating(true)
    setError("")

    try {
      const res = await api.createProject(
        token,
        name.trim(),
        description.trim()
      )

      setProjects((prev) => [...prev, res.data])

      setName("")
      setDescription("")
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : "Failed to create project"
      )
    } finally {
      setCreating(false)
    }
  }

  // =========================================================
  // EDIT PROJECT
  // =========================================================

  const startEditing = (project) => {
    setEditingProject(project)
    setEditName(project.name || "")
    setEditDescription(project.description || "")
    setError("")
  }

  const cancelEditing = () => {
    setEditingProject(null)
    setEditName("")
    setEditDescription("")
  }

  const handleUpdate = async (e) => {
    e.preventDefault()

    if (!editName.trim()) return

    setUpdating(true)
    setError("")

    try {
      const res = await api.updateProject(
        token,
        editingProject.id,
        editName.trim(),
        editDescription.trim()
      )

      setProjects((prev) =>
        prev.map((project) =>
          project.id === editingProject.id
            ? res.data
            : project
        )
      )

      cancelEditing()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : "Failed to update project"
      )
    } finally {
      setUpdating(false)
    }
  }

  // =========================================================
  // DELETE PROJECT
  // =========================================================

  const handleDelete = async (project) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${project.name}"?`
    )

    if (!confirmed) return

    setError("")

    try {
      await api.deleteProject(
        token,
        project.id
      )

      setProjects((prev) =>
        prev.filter(
          (item) => item.id !== project.id
        )
      )
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : "Failed to delete project"
      )
    }
  }

  // =========================================================
  // LOAD MEMBERS
  // =========================================================

  const openMembers = async (project) => {
    setMembersProject(project)
    setMembers([])
    setMembersLoading(true)
    setError("")

    try {
      const res = await api.getMembers(
        token,
        project.id
      )

      setMembers(res.data || [])
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : "Failed to load members"
      )
    } finally {
      setMembersLoading(false)
    }
  }

  // =========================================================
  // ADD MEMBER
  // =========================================================

  const handleAddMember = async (e) => {
    e.preventDefault()

    if (!memberEmail.trim()) return

    setAddingMember(true)
    setError("")

    try {
      await api.addMember(
        token,
        membersProject.id,
        memberEmail.trim(),
        memberRole
      )

      setMemberEmail("")
      setMemberRole("developer")

      // Refresh members
      const res = await api.getMembers(
        token,
        membersProject.id
      )

      setMembers(res.data || [])
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : "Failed to add member"
      )
    } finally {
      setAddingMember(false)
    }
  }

  return (
    <main className="min-h-screen w-full bg-slate-950 text-white">

      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">

        {/* =====================================================
            HEADER
        ===================================================== */}

        <header className="mb-8 flex items-center justify-between border-b border-slate-800 pb-5">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-300 text-lg font-black text-slate-950">
              {"</>"}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
                Collaborative IDE
              </p>

              <h1 className="text-xl font-bold tracking-tight">
                Your workspace
              </h1>
            </div>

          </div>

          <button
            onClick={onLogout}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 hover:text-white"
          >
            Log out
          </button>

        </header>


        {/* =====================================================
            MAIN GRID
        ===================================================== */}

        <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">

          {/* ===================================================
              PROJECT LIST
          =================================================== */}

          <section className="order-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-2xl shadow-black/20 lg:order-1 lg:p-7">

            <div className="mb-6 flex items-end justify-between gap-4">

              <div>

                <p className="mb-1 text-sm text-slate-400">
                  Welcome back, {user.name}
                </p>

                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Projects
                </h2>

              </div>

              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-400">
                {projects.length}{" "}
                {projects.length === 1
                  ? "project"
                  : "projects"}
              </span>

            </div>


            {/* ERROR */}

            {error && (
              <p className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-300">
                {error}
              </p>
            )}


            {/* LOADING */}

            {loading && (
              <p className="text-sm text-slate-400">
                Loading projects…
              </p>
            )}


            {/* EMPTY */}

            {!loading && projects.length === 0 && (

              <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/40 px-6 text-center">

                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-xl text-amber-300">
                  +
                </div>

                <p className="font-semibold text-slate-200">
                  No projects yet
                </p>

                <p className="mt-1 max-w-sm text-sm text-slate-500">
                  Create your first project from the panel to start collaborating.
                </p>

              </div>

            )}


            {/* PROJECTS */}

            {!loading && projects.length > 0 && (

              <ul className="grid gap-4 sm:grid-cols-2">

                {projects.map((project) => (

                  <li
                    key={project.id}
                    className="rounded-xl border border-slate-700 bg-slate-950/60 p-5"
                  >

                    {/* PROJECT OPEN */}

                    <button
                      onClick={() =>
                        onSelectProject(project)
                      }
                      className="group w-full text-left"
                    >

                      <span className="mb-3 flex items-center justify-between">

                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-300/10 text-amber-300">
                          {"{}"}
                        </span>

                        <span className="text-slate-600 transition group-hover:translate-x-1 group-hover:text-amber-300">
                          →
                        </span>

                      </span>

                      <span className="block truncate font-semibold text-slate-100">
                        {project.name}
                      </span>

                      {project.description && (
                        <span className="mt-1 block truncate text-sm text-slate-400">
                          {project.description}
                        </span>
                      )}

                    </button>


                    {/* ACTIONS */}

                    <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-800 pt-4">

                      <button
                        onClick={() =>
                          startEditing(project)
                        }
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-amber-300 hover:text-amber-300"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() =>
                          handleDelete(project)
                        }
                        className="rounded-lg border border-red-900/60 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-950/40"
                      >
                        Delete
                      </button>

                      <button
                        onClick={() =>
                          openMembers(project)
                        }
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-amber-300 hover:text-amber-300"
                      >
                        Members
                      </button>

                    </div>

                  </li>

                ))}

              </ul>

            )}

          </section>


          {/* ===================================================
              CREATE PROJECT
          =================================================== */}

          <aside className="order-1 h-fit rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-black/20 lg:order-2">

            <div className="mb-5">

              <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                New workspace
              </p>

              <h2 className="mt-1 text-lg font-bold">
                Create a project
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Start a shared space for your next idea.
              </p>

            </div>


            <form
              onSubmit={handleCreate}
              className="flex flex-col gap-3"
            >

              <input
                type="text"
                placeholder="Project name"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300"
                value={name}
                onChange={(e) =>
                  setName(e.target.value)
                }
              />

              <input
                type="text"
                placeholder="Description (optional)"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300"
                value={description}
                onChange={(e) =>
                  setDescription(e.target.value)
                }
              />

              <button
                disabled={creating}
                className="rounded-lg bg-amber-300 px-3 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating
                  ? "Creating…"
                  : "Create project"}
              </button>

            </form>

          </aside>

        </div>

      </div>


      {/* =======================================================
          EDIT PROJECT MODAL
      ======================================================= */}

      {editingProject && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">

          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">

            <h2 className="text-xl font-bold">
              Edit Project
            </h2>

            <form
              onSubmit={handleUpdate}
              className="mt-5 flex flex-col gap-3"
            >

              <input
                type="text"
                placeholder="Project name"
                value={editName}
                onChange={(e) =>
                  setEditName(e.target.value)
                }
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-300"
              />

              <input
                type="text"
                placeholder="Description"
                value={editDescription}
                onChange={(e) =>
                  setEditDescription(e.target.value)
                }
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-300"
              />

              <div className="mt-2 flex gap-2">

                <button
                  type="submit"
                  disabled={updating}
                  className="flex-1 rounded-lg bg-amber-300 px-3 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-200 disabled:opacity-50"
                >
                  {updating
                    ? "Saving…"
                    : "Save changes"}
                </button>

                <button
                  type="button"
                  onClick={cancelEditing}
                  className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>

              </div>

            </form>

          </div>

        </div>

      )}


      {/* =======================================================
          MEMBERS MODAL
      ======================================================= */}

      {membersProject && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">

          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6">

            <div className="flex items-center justify-between">

              <div>

                <p className="text-xs uppercase tracking-wider text-amber-300">
                  Project members
                </p>

                <h2 className="text-xl font-bold">
                  {membersProject.name}
                </h2>

              </div>

              <button
                onClick={() =>
                  setMembersProject(null)
                }
                className="text-xl text-slate-400 hover:text-white"
              >
                ×
              </button>

            </div>


            {/* ADD MEMBER */}

            <form
              onSubmit={handleAddMember}
              className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4"
            >

              <p className="mb-3 text-sm font-semibold">
                Add member
              </p>

              <div className="flex flex-col gap-2 sm:flex-row">

                <input
                  type="email"
                  placeholder="User email"
                  value={memberEmail}
                  onChange={(e) =>
                    setMemberEmail(e.target.value)
                  }
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-300"
                />

                <select
                  value={memberRole}
                  onChange={(e) =>
                    setMemberRole(e.target.value)
                  }
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-300"
                >
                  <option value="developer">
                    Developer
                  </option>

                  <option value="viewer">
                    Viewer
                  </option>
                </select>

              </div>

              <button
                type="submit"
                disabled={addingMember}
                className="mt-3 w-full rounded-lg bg-amber-300 px-3 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-200 disabled:opacity-50"
              >
                {addingMember
                  ? "Adding…"
                  : "Add member"}
              </button>

            </form>


            {/* MEMBER LIST */}

            <div className="mt-5">

              <p className="mb-3 text-sm font-semibold">
                Members
              </p>

              {membersLoading && (
                <p className="text-sm text-slate-400">
                  Loading members…
                </p>
              )}

              {!membersLoading &&
                members.length === 0 && (
                  <p className="text-sm text-slate-500">
                    No members found.
                  </p>
                )}

              {!membersLoading &&
                members.length > 0 && (

                  <div className="space-y-2">

                    {members.map((member) => (

                      <div
                        key={member.id}
                        className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-3 py-2"
                      >

                        <div>
                          <p className="text-sm font-medium text-slate-200">
                            {member.email ||
                              member.name ||
                              `User ${member.user_id}`}
                          </p>
                        </div>

                        <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-400">
                          {member.role || "developer"}
                        </span>

                      </div>

                    ))}

                  </div>

                )}

            </div>

          </div>

        </div>

      )}

    </main>
  )
}