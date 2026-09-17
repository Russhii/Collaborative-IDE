import { useEffect, useState } from "react"
import { api, ApiError } from "../lib/api"

export default function Files({ token, project, onSelectFile, onBack }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [name, setName] = useState("")
  const [path, setPath] = useState("")
  const [creating, setCreating] = useState(false)

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await api.listFiles(token, project.id)
      setFiles(res.data || [])
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to load files")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    setError("")
    try {
      const res = await api.createFile(token, project.id, name.trim(), path.trim() || name.trim())
      // backend's create response doesn't include version, refetch full row
      const full = await api.getFile(token, project.id, res.data.id)
      setFiles((prev) => [...prev, full.data])
      setName("")
      setPath("")
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to create file")
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="h-screen w-full bg-gray-950 flex gap-4 p-4">
      <aside className="h-full w-1/3 bg-amber-50 rounded-lg flex flex-col">
        <div className="p-4 border-b border-gray-300 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{project.name}</h2>
            <p className="text-sm text-gray-600">Files</p>
          </div>
          <button onClick={onBack} className="text-sm px-3 py-1 rounded bg-gray-800 text-white">
            Back
          </button>
        </div>

        <form onSubmit={handleCreate} className="p-4 flex flex-col gap-2 border-b border-gray-300">
          <input
            type="text"
            placeholder="File name (e.g. index.js)"
            className="p-2 rounded-lg bg-white text-gray-950 border border-gray-300"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Path (optional)"
            className="p-2 rounded-lg bg-white text-gray-950 border border-gray-300"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          <button
            disabled={creating}
            className="p-2 rounded-lg bg-gray-950 text-amber-50 font-bold disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create file"}
          </button>
        </form>

        {error && <p className="text-red-600 text-sm p-4">{error}</p>}

        <ul className="p-4 flex-1 overflow-auto">
          {loading && <li className="text-gray-600">Loading…</li>}
          {!loading && files.length === 0 && (
            <li className="text-gray-600">No files yet — create one above.</li>
          )}
          {files.map((file) => (
            <li key={file.id}>
              <button
                onClick={() => onSelectFile(file)}
                className="w-full text-left p-2 bg-gray-800 text-white rounded mb-2 hover:bg-gray-700"
              >
                <span className="font-bold">{file.name}</span>
                <span className="block text-sm text-gray-300">{file.path}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="w-2/3 bg-neutral-800 rounded-lg flex items-center justify-center">
        <p className="text-gray-400">Select a file to start editing</p>
      </section>
    </main>
  )
}
