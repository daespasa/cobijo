import { useState } from "react"
import { m } from "motion/react"
import { Eye, EyeOff, House, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, type User } from "@/lib/api"

export function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      onLogin(await api.login(username.trim(), password))
    } catch (err) {
      setError((err as Error).message)
      setPassword("")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4">
      <m.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 shadow-sm"
      >
        <span className="grid size-11 place-items-center rounded-xl bg-pine text-primary-foreground">
          <House className="size-5" />
        </span>
        <h1 className="mt-5 font-heading text-3xl font-semibold">Entra en Cobijo</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tus zonas, búsquedas y alojamientos guardados te esperan dentro.</p>

        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Usuario</Label>
            <Input id="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative">
              <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-10 pr-10" />
              <button type="button" onClick={() => setShow(!show)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground" aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}>
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-rose/10 px-3 py-2 text-sm text-rose">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Entrar
          </Button>
        </div>
        <p className="mt-5 text-center text-xs text-muted-foreground">La sesión se queda abierta 30 días en este navegador.</p>
      </m.form>
    </main>
  )
}
