import { useState } from "react"
import { api, ApiError } from "../lib/api"

export default function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState("login") // "login" | "register"
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const doLogin = async (emailValue, passwordValue) => {
    const { access_token } = await api.login(emailValue, passwordValue)
    const user = await api.me(access_token)
    localStorage.setItem("ide_token", access_token)
    onAuthenticated(access_token, user)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setBusy(true)
    try {
      if (mode === "register") {
        await api.register(name, email, password)
        // backend has no auto-login on register, so log in right after
        await doLogin(email, password)
      } else {
        await doLogin(email, password)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen w-full bg-slate-950 px-4 py-6 text-white sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/30 lg:grid-cols-[1fr_1.05fr]">
          <section className="hidden flex-col justify-between bg-amber-300 p-8 text-slate-950 lg:flex">
            <div>
              <div className="mb-8 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-lg font-black text-amber-300">
                {"</>"}
              </div>
              <p className="text-xs font-bold uppercase tracking-[0.25em]">Collaborative IDE</p>
              <h1 className="mt-4 max-w-sm text-4xl font-black leading-tight tracking-tight">
                Build together, from anywhere.
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-6 text-slate-800/75">
                Create projects, share files, and collaborate in a real-time coding workspace.
              </p>
            </div>
            <p className="text-xs font-semibold text-slate-800/60">Your ideas. Your team. One workspace.</p>
          </section>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 sm:p-10">
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                Welcome back
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight">
                {mode === "login" ? "Sign in to your workspace" : "Create your account"}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {mode === "login"
                  ? "Continue where you left off."
                  : "Start collaborating on your next idea."}
              </p>
            </div>

            {mode === "register" && (
              <input
                type="text"
                placeholder="Full name"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}

            <input
              type="email"
              placeholder="Email"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <input
              type="password"
              placeholder="Password"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && (
              <p className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-300">
                {error}
              </p>
            )}

            <button
              disabled={busy}
              className="rounded-lg bg-amber-300 px-3 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
            </button>

            <button
              type="button"
              className="text-sm text-slate-400 transition hover:text-white"
              onClick={() => {
                setError("")
                setMode(mode === "login" ? "register" : "login")
              }}
            >
              {mode === "login"
                ? "Need an account? Register"
                : "Already have an account? Sign in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
