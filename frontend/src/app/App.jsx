import "./App.css"
import { useEffect, useState } from "react"
import { api } from "../lib/api"
import Auth from "./Auth"
import Projects from "./Projects"
import Files from "./Files"
import Editor from "./Editor"

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("ide_token"))
  const [user, setUser] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)

  const [project, setProject] = useState(null)
  const [file, setFile] = useState(null)

  // Rehydrate the session from a stored token on load, matching backend's
  // /me endpoint rather than trusting anything client-side.
  useEffect(() => {
    if (!token) {
      setCheckingSession(false)
      return
    }
    api
      .me(token)
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("ide_token")
        setToken(null)
      })
      .finally(() => setCheckingSession(false))
  }, [token])

  const handleAuthenticated = (nextToken, nextUser) => {
    setToken(nextToken)
    setUser(nextUser)
  }

  const handleLogout = () => {
    localStorage.removeItem("ide_token")
    setToken(null)
    setUser(null)
    setProject(null)
    setFile(null)
  }

  if (checkingSession) {
    return (
      <main className="h-screen w-full bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading…</p>
      </main>
    )
  }

  if (!token || !user) {
    return <Auth onAuthenticated={handleAuthenticated} />
  }

  if (!project) {
    return (
      <Projects
        token={token}
        user={user}
        onSelectProject={setProject}
        onLogout={handleLogout}
      />
    )
  }

  if (!file) {
    return (
      <Files
        token={token}
        project={project}
        onSelectFile={setFile}
        onBack={() => setProject(null)}
      />
    )
  }

  return (
    <Editor
      key={file.id}
      token={token}
      user={user}
      project={project}
      file={file}
      onBack={() => setFile(null)}
    />
  )
}

export default App
