import "./App.css"

import { useEffect, useState } from "react"

import { api } from "../lib/api"

import Auth from "./Auth"
import Projects from "./Projects"
import Editor from "./Editor"

function App() {
  const [token, setToken] = useState(() =>
    localStorage.getItem("ide_token")
  )

  const [user, setUser] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)

  const [project, setProject] = useState(null)
  const [file, setFile] = useState(null)

  // Rehydrate the session from the stored token.
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
      .finally(() => {
        setCheckingSession(false)
      })
  }, [token])

  const handleAuthenticated = (
    nextToken,
    nextUser
  ) => {
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

  const handleSelectProject = (nextProject) => {
    setProject(nextProject)

    // The Editor now contains the file explorer,
    // so we no longer navigate to Files.jsx.
    setFile({
      id: null,
      name: "",
      path: "",
      content: "",
      version: 1,
    })
  }

  const handleBackToProjects = () => {
    setProject(null)
    setFile(null)
  }

  if (checkingSession) {
    return (
      <main className="flex h-screen w-full items-center justify-center bg-slate-950">
        <p className="text-sm text-slate-400">
          Loading…
        </p>
      </main>
    )
  }

  if (!token || !user) {
    return (
      <Auth
        onAuthenticated={handleAuthenticated}
      />
    )
  }

  if (!project) {
    return (
      <Projects
        token={token}
        user={user}
        onSelectProject={handleSelectProject}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <Editor
      key={project.id}
      token={token}
      user={user}
      project={project}
      file={file}
      onBack={handleBackToProjects}
    />
  )
}

export default App