import { Editor as MonacoEditor } from "@monaco-editor/react"
import { MonacoBinding } from "y-monaco"
import { useEffect, useMemo, useRef, useState } from "react"
import * as Y from "yjs"
import { api, WS_BASE } from "../lib/api"
import { applyRemoteSnapshot } from "../lib/diff"

const REMOTE_ORIGIN = "remote-sync"
const SAVE_DEBOUNCE_MS = 500
const CURSOR_THROTTLE_MS = 150

export default function Editor({ token, user, project, file, onBack }) {
  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const socketRef = useRef(null)
  const decorationsRef = useRef(null)
  const saveTimerRef = useRef(null)
  const cursorTimerRef = useRef(null)
  const versionRef = useRef(file.version)
  const pendingSendRef = useRef(false)

  const [status, setStatus] = useState("connecting") // connecting | online | offline
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set())
  const [userNames, setUserNames] = useState(() => ({ [user.id]: user.name }))
  const [remoteCursors, setRemoteCursors] = useState({}) // user_id -> { user_name, line, column }

  // The Yjs doc is the actual CRDT: local edits, undo/redo and concurrent
  // local operations are all still resolved by Yjs/y-monaco exactly as
  // before. Only the sync transport below is new.
  const ydoc = useMemo(() => new Y.Doc(), [])
  const yText = useMemo(() => ydoc.getText("monaco"), [ydoc])

  // Seed the CRDT doc with the file content fetched from the backend.
  useEffect(() => {
    if (yText.toString() !== file.content) {
      ydoc.transact(() => {
        yText.delete(0, yText.length)
        yText.insert(0, file.content || "")
      }, "init")
    }
    versionRef.current = file.version
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id])

  const sendFileUpdate = () => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    pendingSendRef.current = false
    socket.send(
      JSON.stringify({
        type: "file_update",
        file_id: file.id,
        version: versionRef.current,
        content: yText.toString(),
      })
    )
  }

  const scheduleSend = () => {
    pendingSendRef.current = true
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(sendFileUpdate, SAVE_DEBOUNCE_MS)
  }

  // Yjs -> backend: whenever the CRDT doc changes locally (i.e. not because
  // we just applied a remote snapshot), push the resulting text to the
  // backend's version-checked file_update.
  useEffect(() => {
    const handler = (_events, transaction) => {
      if (transaction.origin === REMOTE_ORIGIN || transaction.origin === "init") return
      scheduleSend()
    }
    yText.observe(handler)
    return () => yText.unobserve(handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yText])

  // backend <-> frontend socket bridge
  useEffect(() => {
    const socket = new WebSocket(
      `${WS_BASE}/ws/projects/${project.id}?token=${encodeURIComponent(token)}`
    )
    socketRef.current = socket

    socket.onopen = () => setStatus("online")
    socket.onclose = () => setStatus("offline")
    socket.onerror = () => setStatus("offline")

    socket.onmessage = async (event) => {
      let data
      try {
        data = JSON.parse(event.data)
      } catch {
        return
      }

      switch (data.type) {
        case "online_users": {
          setOnlineUserIds(new Set(data.users))
          break
        }
        case "user_joined": {
          setOnlineUserIds((prev) => new Set(prev).add(data.user_id))
          break
        }
        case "user_left": {
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
        }
        case "cursor_moved": {
          if (data.user_id === user.id) break
          setUserNames((prev) => ({ ...prev, [data.user_id]: data.user_name }))
          if (data.file_id === file.id) {
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
        }
        case "file_updated": {
          if (data.file_id !== file.id) break
          versionRef.current = data.version
          if (data.updated_by !== user.id) {
            applyRemoteSnapshot(ydoc, yText, data.content, REMOTE_ORIGIN)
          }
          break
        }
        case "conflict": {
          // Our optimistic version was stale — pull the latest content,
          // merge it in as a CRDT-safe patch, then resend our pending edit
          // (if any) against the now-current version.
          try {
            const fresh = await api.getFile(token, project.id, file.id)
            versionRef.current = fresh.data.version
            applyRemoteSnapshot(ydoc, yText, fresh.data.content, REMOTE_ORIGIN)
          } catch (err) {
            console.error("Failed to resolve conflict", err)
          }
          if (pendingSendRef.current) sendFileUpdate()
          break
        }
        case "error": {
          console.warn("WebSocket error from server:", data.message)
          break
        }
        default:
          break
      }
    }

    return () => {
      socket.close()
      socketRef.current = null
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, file.id, token])

  // Render remote cursors as Monaco decorations
  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return

    const decorations = Object.values(remoteCursors).map((cursor) => ({
      range: new monaco.Range(cursor.line, cursor.column, cursor.line, cursor.column + 1),
      options: {
        className: "remote-cursor",
        hoverMessage: { value: cursor.user_name },
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    }))

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current || [], decorations)
  }, [remoteCursors])

  const handleMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    new MonacoBinding(yText, editor.getModel(), new Set([editor]), null)

    editor.onDidChangeCursorPosition((e) => {
      if (cursorTimerRef.current) return
      cursorTimerRef.current = setTimeout(() => {
        cursorTimerRef.current = null
        const socket = socketRef.current
        if (!socket || socket.readyState !== WebSocket.OPEN) return
        socket.send(
          JSON.stringify({
            type: "cursor_move",
            file_id: file.id,
            line: e.position.lineNumber,
            column: e.position.column,
          })
        )
      }, CURSOR_THROTTLE_MS)
    })
  }

  const onlineUsers = Array.from(onlineUserIds).map((id) => ({
    id,
    name: userNames[id] || `User #${id}`,
  }))

  return (
    <main className="h-screen w-full bg-slate-950 p-3 text-white sm:p-4">
      <div className="flex h-full flex-col gap-3 lg:flex-row">
      <aside className="flex h-auto w-full flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/20 lg:h-full lg:w-72">
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-300">Editor</p>
            <h2 className="truncate text-xl font-bold">{file.name}</h2>
            <p className="truncate text-xs text-slate-400">{project.name}</p>
          </div>
          <button
            onClick={onBack}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 hover:text-white"
          >
            Back
          </button>
        </div>

        <div className="border-b border-slate-800 px-4 py-3 text-sm text-slate-300">
          <span
            className={
              "mr-2 inline-block h-2 w-2 rounded-full " +
              (status === "online" ? "bg-emerald-400" : "bg-red-400")
            }
          />
          {status === "online" ? "Connected" : status === "connecting" ? "Connecting…" : "Disconnected"}
        </div>

        <h3 className="px-4 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Online collaborators</h3>
        <ul className="p-4 flex-1 overflow-auto">
          {onlineUsers.length === 0 && <li className="text-sm text-slate-500">No collaborators online</li>}
          {onlineUsers.map((u) => (
            <li key={u.id} className="mb-2 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/60 p-2.5 text-sm text-slate-200">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-300 text-xs font-bold text-slate-950">
                {u.name.charAt(0).toUpperCase()}
              </span>
              <span>
                {u.name}
                {u.id === user.id && <span className="text-slate-500"> (you)</span>}
              </span>
            </li>
          ))}
        </ul>
      </aside>

      <section className="min-h-0 flex-1 w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/20 lg:w-3/4">
        <MonacoEditor
          height="100%"
          defaultLanguage="javascript"
          theme="vs-dark"
          onMount={handleMount}
        />
      </section>
      </div>
    </main>
  )
}
