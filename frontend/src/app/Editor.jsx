import { Editor as MonacoEditor } from "@monaco-editor/react"
import { MonacoBinding } from "y-monaco"
import { useEffect, useMemo, useRef, useState } from "react"
import * as Y from "yjs"
import { api, ApiError, WS_BASE } from "../lib/api"
import { applyRemoteSnapshot } from "../lib/diff"

const REMOTE_ORIGIN = "remote-sync"
const SAVE_DEBOUNCE_MS = 500
const CURSOR_THROTTLE_MS = 150

export default function Editor({
  token,
  user,
  project,
  file,
  onBack,
}) {
  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const socketRef = useRef(null)
  const decorationsRef = useRef(null)
  const saveTimerRef = useRef(null)
  const cursorTimerRef = useRef(null)
  const versionRef = useRef(file.version)
  const pendingSendRef = useRef(false)

  const [selectedFile, setSelectedFile] = useState(file)
  const [files, setFiles] = useState([])
  const [filesLoading, setFilesLoading] = useState(true)

  const [fileName, setFileName] = useState("")
  const [filePath, setFilePath] = useState("")
  const [creatingFile, setCreatingFile] = useState(false)
  const [deletingFileId, setDeletingFileId] = useState(null)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [status, setStatus] = useState("connecting")

  const [error, setError] = useState("")

  const [onlineUserIds, setOnlineUserIds] = useState(
    () => new Set()
  )

  const [userNames, setUserNames] = useState(() => ({
    [user.id]: user.name,
  }))

  const [remoteCursors, setRemoteCursors] = useState({})

  const ydoc = useMemo(() => new Y.Doc(), [])
  const yText = useMemo(
    () => ydoc.getText("monaco"),
    [ydoc]
  )

  /*
   * ---------------------------------------------------------
   * LOAD PROJECT FILES
   * ---------------------------------------------------------
   */

  const loadFiles = async () => {
    setFilesLoading(true)
    setError("")

    try {
      const res = await api.listFiles(
        token,
        project.id
      )

      const projectFiles = res.data || []

      setFiles(projectFiles)

      /*
       * Make sure the currently opened file exists
       * in the file explorer.
       */
      const current = projectFiles.find(
        (item) => item.id === selectedFile.id
      )

      if (current) {
        setSelectedFile(current)
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : "Failed to load files"
      )
    } finally {
      setFilesLoading(false)
    }
  }

  useEffect(() => {
    loadFiles()

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  /*
   * ---------------------------------------------------------
   * INITIALIZE / CHANGE FILE CONTENT
   * ---------------------------------------------------------
   */

  useEffect(() => {
    const content = selectedFile.content || ""

    ydoc.transact(() => {
      yText.delete(0, yText.length)

      if (content) {
        yText.insert(0, content)
      }
    }, "init")

    versionRef.current = selectedFile.version
    pendingSendRef.current = false

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile.id])

  /*
   * ---------------------------------------------------------
   * SEND FILE UPDATE
   * ---------------------------------------------------------
   */

  const sendFileUpdate = () => {
    const socket = socketRef.current

    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      return
    }

    pendingSendRef.current = false

    socket.send(
      JSON.stringify({
        type: "file_update",
        file_id: selectedFile.id,
        version: versionRef.current,
        content: yText.toString(),
      })
    )
  }

  const scheduleSend = () => {
    pendingSendRef.current = true

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = setTimeout(
      sendFileUpdate,
      SAVE_DEBOUNCE_MS
    )
  }

  /*
   * ---------------------------------------------------------
   * YJS CHANGES
   * ---------------------------------------------------------
   */

  useEffect(() => {
    const handler = (_events, transaction) => {
      if (
        transaction.origin === REMOTE_ORIGIN ||
        transaction.origin === "init"
      ) {
        return
      }

      scheduleSend()
    }

    yText.observe(handler)

    return () => {
      yText.unobserve(handler)

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yText, selectedFile.id])

  /*
   * ---------------------------------------------------------
   * WEBSOCKET
   * ---------------------------------------------------------
   */

  useEffect(() => {
    setStatus("connecting")

    const socket = new WebSocket(
      `${WS_BASE}/ws/projects/${project.id}?token=${encodeURIComponent(
        token
      )}`
    )

    socketRef.current = socket

    socket.onopen = () => {
      setStatus("online")
    }

    socket.onclose = () => {
      setStatus("offline")
    }

    socket.onerror = () => {
      setStatus("offline")
    }

    socket.onmessage = async (event) => {
      let data

      try {
        data = JSON.parse(event.data)
      } catch {
        return
      }

      switch (data.type) {
        case "online_users":
          setOnlineUserIds(
            new Set(data.users)
          )
          break

        case "user_joined":
          setOnlineUserIds((prev) => {
            const next = new Set(prev)
            next.add(data.user_id)
            return next
          })
          break

        case "user_left":
          setOnlineUserIds((prev) => {
            const next = new Set(prev)
            next.delete(data.user_id)
            return next
          })

          setRemoteCursors((prev) => {
            const next = { ...prev }
            delete next[data.user_id]
            return next
          })

          break

        case "cursor_moved":
          if (data.user_id === user.id) {
            break
          }

          setUserNames((prev) => ({
            ...prev,
            [data.user_id]: data.user_name,
          }))

          if (
            data.file_id === selectedFile.id
          ) {
            setRemoteCursors((prev) => ({
              ...prev,
              [data.user_id]: {
                user_name: data.user_name,
                line: data.line,
                column: data.column,
              },
            }))
          }

          break

        case "file_updated":
          if (
            data.file_id !== selectedFile.id
          ) {
            break
          }

          versionRef.current = data.version

          if (data.updated_by !== user.id) {
            applyRemoteSnapshot(
              ydoc,
              yText,
              data.content,
              REMOTE_ORIGIN
            )
          }

          setFiles((prev) =>
            prev.map((item) =>
              item.id === data.file_id
                ? {
                    ...item,
                    content: data.content,
                    version: data.version,
                  }
                : item
            )
          )

          setSelectedFile((prev) => ({
            ...prev,
            content: data.content,
            version: data.version,
          }))

          break

        case "conflict":
          try {
            const fresh = await api.getFile(
              token,
              project.id,
              selectedFile.id
            )

            versionRef.current =
              fresh.data.version

            applyRemoteSnapshot(
              ydoc,
              yText,
              fresh.data.content,
              REMOTE_ORIGIN
            )

            setSelectedFile(fresh.data)

            setFiles((prev) =>
              prev.map((item) =>
                item.id === fresh.data.id
                  ? fresh.data
                  : item
              )
            )
          } catch (err) {
            console.error(
              "Failed to resolve conflict",
              err
            )
          }

          if (pendingSendRef.current) {
            sendFileUpdate()
          }

          break

        case "error":
          console.warn(
            "WebSocket error:",
            data.message
          )
          break

        default:
          break
      }
    }

    return () => {
      socket.close()
      socketRef.current = null

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }

      if (cursorTimerRef.current) {
        clearTimeout(cursorTimerRef.current)
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    project.id,
    selectedFile.id,
    token,
  ])

  /*
   * ---------------------------------------------------------
   * REMOTE CURSORS
   * ---------------------------------------------------------
   */

  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current

    if (!editor || !monaco) {
      return
    }

    const decorations = Object.values(
      remoteCursors
    ).map((cursor) => ({
      range: new monaco.Range(
        cursor.line,
        cursor.column,
        cursor.line,
        cursor.column + 1
      ),

      options: {
        className: "remote-cursor",

        hoverMessage: {
          value: cursor.user_name,
        },

        stickiness:
          monaco.editor.TrackedRangeStickiness
            .NeverGrowsWhenTypingAtEdges,
      },
    }))

    decorationsRef.current =
      editor.deltaDecorations(
        decorationsRef.current || [],
        decorations
      )
  }, [remoteCursors])

  /*
   * ---------------------------------------------------------
   * MONACO
   * ---------------------------------------------------------
   */

  const handleMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    new MonacoBinding(
      yText,
      editor.getModel(),
      new Set([editor]),
      null
    )

    editor.onDidChangeCursorPosition(
      (e) => {
        if (cursorTimerRef.current) {
          return
        }

        cursorTimerRef.current =
          setTimeout(() => {
            cursorTimerRef.current = null

            const socket =
              socketRef.current

            if (
              !socket ||
              socket.readyState !==
                WebSocket.OPEN
            ) {
              return
            }

            socket.send(
              JSON.stringify({
                type: "cursor_move",
                file_id: selectedFile.id,
                line: e.position.lineNumber,
                column: e.position.column,
              })
            )
          }, CURSOR_THROTTLE_MS)
      }
    )
  }

  /*
   * ---------------------------------------------------------
   * CREATE FILE
   * ---------------------------------------------------------
   */

  const handleCreateFile = async (e) => {
    e.preventDefault()

    if (!fileName.trim()) {
      return
    }

    setCreatingFile(true)
    setError("")

    try {
      const name = fileName.trim()
      const path =
        filePath.trim() || name

      const res = await api.createFile(
        token,
        project.id,
        name,
        path
      )

      const created = await api.getFile(
        token,
        project.id,
        res.data.id
      )

      setFiles((prev) => [
        ...prev,
        created.data,
      ])

      setSelectedFile(created.data)

      setFileName("")
      setFilePath("")
      setSidebarOpen(false)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : "Failed to create file"
      )
    } finally {
      setCreatingFile(false)
    }
  }

  /*
   * ---------------------------------------------------------
   * DELETE FILE
   * ---------------------------------------------------------
   */

  const handleDeleteFile = async (
    e,
    fileId
  ) => {
    e.stopPropagation()

    const confirmed = window.confirm(
      "Are you sure you want to delete this file?"
    )

    if (!confirmed) {
      return
    }

    setDeletingFileId(fileId)
    setError("")

    try {
      await api.deleteFile(
        token,
        project.id,
        fileId
      )

      const remaining = files.filter(
        (item) => item.id !== fileId
      )

      setFiles(remaining)

      if (selectedFile.id === fileId) {
        if (remaining.length > 0) {
          setSelectedFile(
            remaining[0]
          )
        } else {
          setSelectedFile({
            id: null,
            name: "",
            path: "",
            content: "",
            version: 1,
          })
        }
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : "Failed to delete file"
      )
    } finally {
      setDeletingFileId(null)
    }
  }

  /*
   * ---------------------------------------------------------
   * SELECT FILE
   * ---------------------------------------------------------
   */

  const handleSelectFile = async (
    nextFile
  ) => {
    if (
      nextFile.id === selectedFile.id
    ) {
      setSidebarOpen(false)
      return
    }

    setError("")

    try {
      const res = await api.getFile(
        token,
        project.id,
        nextFile.id
      )

      setSelectedFile(res.data)

      setRemoteCursors({})

      setSidebarOpen(false)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : "Failed to open file"
      )
    }
  }

  const onlineUsers =
    Array.from(onlineUserIds).map(
      (id) => ({
        id,
        name:
          userNames[id] ||
          `User #${id}`,
      })
    )

  const getFileExtension = (name) => {
    const parts = name.split(".")

    if (parts.length === 1) {
      return "FILE"
    }

    return parts
      .pop()
      .slice(0, 4)
      .toUpperCase()
  }

  return (
    <main className="relative h-screen w-full overflow-hidden bg-slate-950 text-white">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <button
          aria-label="Close sidebar"
          onClick={() =>
            setSidebarOpen(false)
          }
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      <div className="flex h-full w-full">

        {/* ================================================= */}
        {/* SIDEBAR */}
        {/* ================================================= */}

        <aside
          className={`
            fixed inset-y-0 left-0 z-40
            flex w-[min(86vw,340px)] flex-col
            border-r border-slate-800
            bg-slate-900
            shadow-2xl shadow-black/40
            transition-transform duration-200
            lg:static lg:z-auto lg:w-80
            lg:translate-x-0
            ${
              sidebarOpen
                ? "translate-x-0"
                : "-translate-x-full"
            }
          `}
        >

          {/* Sidebar header */}
          <div className="border-b border-slate-800 p-5">

            <div className="mb-5 flex items-center justify-between">

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-300 text-lg font-black text-slate-950">
                {"</>"}
              </div>

              <button
                onClick={onBack}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-amber-300 hover:bg-slate-800 hover:text-white"
              >
                Back
              </button>

            </div>

            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">
              Collaborative IDE
            </p>

            <h1 className="mt-2 truncate text-xl font-bold">
              {project.name}
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Explorer
            </p>

          </div>

          {/* ================================================= */}
          {/* FILE EXPLORER */}
          {/* ================================================= */}

          <div className="border-b border-slate-800">

            <div className="flex items-center justify-between px-5 pb-2 pt-5">

              <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">
                Files
              </h2>

              <span className="rounded-full bg-slate-950 px-2 py-1 text-xs font-semibold text-amber-300">
                {files.length}
              </span>

            </div>

            <form
              onSubmit={handleCreateFile}
              className="space-y-2 px-5 pb-5"
            >

              <input
                type="text"
                value={fileName}
                onChange={(e) =>
                  setFileName(e.target.value)
                }
                placeholder="File name"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300"
              />

              <input
                type="text"
                value={filePath}
                onChange={(e) =>
                  setFilePath(e.target.value)
                }
                placeholder="Path (optional)"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300"
              />

              <button
                type="submit"
                disabled={creatingFile}
                className="w-full rounded-lg bg-amber-300 px-3 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingFile
                  ? "Creating…"
                  : "+ New file"}
              </button>

            </form>

          </div>

          {/* File list */}
          <div className="min-h-0 flex-1 overflow-auto px-4 py-3">

            {filesLoading && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-500">
                Loading files…
              </div>
            )}

            {!filesLoading &&
              files.length === 0 && (
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-500">
                  No files yet.
                </div>
              )}

            {!filesLoading &&
              files.map((item) => {
                const selected =
                  item.id ===
                  selectedFile.id

                return (
                  <div
                    key={item.id}
                    className="mb-1 flex items-center gap-1"
                  >

                    <button
                      onClick={() =>
                        handleSelectFile(
                          item
                        )
                      }
                      className={`
                        flex min-w-0 flex-1
                        items-center gap-3
                        rounded-lg px-3 py-2.5
                        text-left
                        transition
                        ${
                          selected
                            ? "bg-slate-800 text-white ring-1 ring-amber-300/40"
                            : "text-slate-400 hover:bg-slate-800/70 hover:text-white"
                        }
                      `}
                    >

                      <span
                        className={`
                          flex h-8 w-8 shrink-0
                          items-center justify-center
                          rounded-md text-[9px]
                          font-black
                          ${
                            selected
                              ? "bg-amber-300 text-slate-950"
                              : "bg-slate-950 text-slate-500"
                          }
                        `}
                      >
                        {getFileExtension(
                          item.name
                        )}
                      </span>

                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {item.name}
                        </span>

                        <span className="block truncate text-xs text-slate-600">
                          {item.path}
                        </span>
                      </span>

                    </button>

                    <button
                      onClick={(e) =>
                        handleDeleteFile(
                          e,
                          item.id
                        )
                      }
                      disabled={
                        deletingFileId ===
                        item.id
                      }
                      title="Delete file"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-900/50 bg-red-950/30 text-red-400 transition hover:border-red-500 hover:bg-red-950/60 disabled:opacity-50"
                    >
                      {deletingFileId ===
                      item.id
                        ? "…"
                        : "×"}
                    </button>

                  </div>
                )
              })}

          </div>

          {/* ================================================= */}
          {/* COLLABORATORS */}
          {/* ================================================= */}

          <div className="border-t border-slate-800">

            <div className="flex items-center justify-between px-5 pb-2 pt-4">

              <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">
                Collaborators
              </h2>

              <span className="rounded-full bg-slate-950 px-2 py-1 text-xs font-semibold text-amber-300">
                {onlineUsers.length}
              </span>

            </div>

            <div className="max-h-32 overflow-auto px-5 pb-4">

              {onlineUsers.map((u) => (
                <div
                  key={u.id}
                  className="mb-1 flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-2"
                >

                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-300 text-xs font-black text-slate-950">
                    {u.name
                      .charAt(0)
                      .toUpperCase()}
                  </span>

                  <div className="min-w-0">

                    <p className="truncate text-xs font-semibold text-slate-200">
                      {u.name}

                      {u.id ===
                        user.id && (
                        <span className="ml-1 text-slate-500">
                          (you)
                        </span>
                      )}
                    </p>

                    <p className="text-[10px] text-emerald-400">
                      Online
                    </p>

                  </div>

                </div>
              ))}

              {onlineUsers.length === 0 && (
                <p className="py-2 text-xs text-slate-600">
                  No collaborators online
                </p>
              )}

            </div>

          </div>

          {/* Sidebar footer */}
          <div className="border-t border-slate-800 px-5 py-3">
            <p className="text-[10px] text-slate-600">
              Your ideas. Your team. One workspace.
            </p>
          </div>

        </aside>

        {/* ================================================= */}
        {/* MAIN EDITOR */}
        {/* ================================================= */}

        <section className="flex min-w-0 flex-1 flex-col bg-slate-950">

          {/* Top bar */}
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-3 sm:px-5">

            <div className="flex min-w-0 items-center gap-3">

              {/* Mobile menu */}
              <button
                onClick={() =>
                  setSidebarOpen(true)
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-300 transition hover:border-amber-300 hover:bg-slate-800 hover:text-white lg:hidden"
                aria-label="Open file explorer"
              >
                ☰
              </button>

              {/* File icon */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-300 text-[9px] font-black text-slate-950">
                {selectedFile.name
                  ? getFileExtension(
                      selectedFile.name
                    )
                  : "FILE"}
              </div>

              <div className="min-w-0">

                <p className="truncate text-sm font-semibold text-slate-200">
                  {selectedFile.name ||
                    "No file selected"}
                </p>

                <p className="hidden truncate text-xs text-slate-500 sm:block">
                  {selectedFile.path ||
                    project.name}
                </p>

              </div>

            </div>

            {/* Status */}
            <div className="flex shrink-0 items-center gap-2">

              <span
                className={`
                  h-2 w-2 rounded-full
                  ${
                    status === "online"
                      ? "bg-emerald-400"
                      : status ===
                        "connecting"
                        ? "bg-amber-300"
                        : "bg-red-400"
                  }
                `}
              />

              <span className="hidden text-xs text-slate-400 sm:block">
                {status === "online"
                  ? "Live"
                  : status ===
                      "connecting"
                    ? "Connecting"
                    : "Offline"}
              </span>

            </div>

          </header>

          {/* Error */}
          {error && (
            <div className="border-b border-slate-800 bg-slate-900 px-4 py-2">
              <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            </div>
          )}

          {/* Monaco */}
          <div className="min-h-0 flex-1 overflow-hidden bg-slate-950">

            {selectedFile.id ? (
              <MonacoEditor
                height="100%"
                defaultLanguage="javascript"
                theme="vs-dark"
                onMount={handleMount}
                options={{
                  minimap: {
                    enabled: false,
                  },

                  fontSize: 14,

                  padding: {
                    top: 16,
                    bottom: 16,
                  },

                  smoothScrolling: true,

                  cursorBlinking:
                    "smooth",

                  scrollBeyondLastLine:
                    false,

                  automaticLayout: true,

                  wordWrap: "on",

                  renderWhitespace:
                    "selection",

                  bracketPairColorization: {
                    enabled: true,
                  },
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6">

                <div className="text-center">

                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-xl font-black text-amber-300">
                    {"</>"}
                  </div>

                  <h2 className="text-lg font-bold text-slate-200">
                    No file selected
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Open the explorer and
                    select a file.
                  </p>

                </div>

              </div>
            )}

          </div>

          {/* Bottom status bar */}
          <footer className="flex h-8 shrink-0 items-center justify-between border-t border-slate-800 bg-slate-900 px-3 sm:px-4">

            <div className="flex items-center gap-3 text-[10px] text-slate-500 sm:gap-4 sm:text-xs">

              <span>
                v{versionRef.current}
              </span>

              <span>
                {selectedFile.name
                  ? getFileExtension(
                      selectedFile.name
                    )
                  : "FILE"}
              </span>

            </div>

            <div className="text-[10px] text-slate-600 sm:text-xs">
              <span className="hidden sm:inline">
                Real-time sync enabled
              </span>

              <span className="sm:hidden">
                Sync
              </span>
            </div>

          </footer>

        </section>

      </div>
    </main>
  )
}