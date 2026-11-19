import { useState } from "react"
import { KeyRound, Loader2, LogOut, MapPin, Search, Settings2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { api, geocode, type Meta, type User } from "@/lib/api"

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?"
const day = (iso: string) => new Date(iso.replace(" ", "T") + "Z").toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })

type Props = { user: User; meta: Meta; onUser: (u: User) => void; onLogout: () => void }

export function UserMenu({ user, meta, onUser, onLogout }: Props) {
  const [dialog, setDialog] = useState<"prefs" | "password" | null>(null)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-pine-soft font-heading text-sm font-semibold text-pine transition-colors hover:bg-pine hover:text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              aria-label={`Menú de ${user.name}`}
            />
          }
        >
          {initials(user.name)}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <span className="block text-sm font-semibold text-foreground">{user.name}</span>
              <span className="block text-xs font-normal">{user.username}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDialog("prefs")}>
            <Settings2 /> Preferencias
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog("password")}>
            <KeyRound /> Cambiar contraseña
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onLogout}>
            <LogOut /> Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "prefs"} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog === "prefs" && <PrefsDialog user={user} meta={meta} onUser={onUser} close={() => setDialog(null)} />}
      </Dialog>
      <Dialog open={dialog === "password"} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog === "password" && <PasswordDialog close={() => setDialog(null)} />}
      </Dialog>
    </>
  )
}

function PrefsDialog({ user, meta, onUser, close }: { user: User; meta: Meta; onUser: (u: User) => void; close: () => void }) {
  const [name, setName] = useState(user.name)
  const [origin, setOrigin] = useState(user.prefs.origin ?? meta.origin)
  const [place, setPlace] = useState("")
  const [finding, setFinding] = useState(false)
  const [busy, setBusy] = useState(false)
  const f = user.prefs.form
  const fl = user.prefs.filters

  const find = async () => {
    if (!place.trim()) return
    setFinding(true)
    const r = await geocode(place).catch(() => null)
    setFinding(false)
    if (!r) return void toast.error(`No encontramos «${place}»`)
    setOrigin(r)
    setPlace("")
  }
  const save = async (extra: { reset?: boolean } = {}) => {
    setBusy(true)
    try {
      onUser(await api.updateMe({ name, prefs: { origin }, ...extra }))
      toast.success(extra.reset ? "Valores de búsqueda restablecidos" : "Preferencias guardadas")
      if (!extra.reset) close()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="font-heading text-xl">Preferencias</DialogTitle>
        <DialogDescription>Se aplican cada vez que entras, en cualquier navegador.</DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="pname">Tu nombre</Label>
          <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="porigin">Punto de salida</Label>
          <p className="flex items-center gap-1.5 text-sm">
            <MapPin className="size-4 text-amber" /> <b>{origin.name}</b>
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              find()
            }}
          >
            <Input id="porigin" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Cambiar a otro pueblo o ciudad…" />
            <Button type="submit" variant="outline" disabled={finding} aria-label="Buscar lugar">
              {finding ? <Loader2 className="animate-spin" /> : <Search />}
            </Button>
          </form>
        </div>

        <div className="rounded-xl bg-muted p-3 text-sm">
          <p className="font-medium">Valores de búsqueda por defecto</p>
          {f ? (
            <p className="mt-1 text-muted-foreground">
              {f.adults} personas, {f.bedrooms} dormitorios, {f.pets} mascotas, hasta {f.maxPerPersonNight} € por persona y noche
              {f.amenities.length > 0 && `, ${f.amenities.length} comodidades`}.
              {fl && ` Resultados ordenados por ${fl.sort === "price" ? "precio" : fl.sort === "rating" ? "nota" : "zona"}${fl.privacy ? ", solo con dormitorio por pareja" : ""}.`}
            </p>
          ) : (
            <p className="mt-1 text-muted-foreground">Usas los de serie. Guárdalos desde el formulario con «Guardar como mis valores».</p>
          )}
          {(f || fl) && (
            <button type="button" className="mt-2 text-xs font-medium text-pine hover:underline" onClick={() => save({ reset: true })} disabled={busy}>
              Volver a los valores de serie
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">Sesión abierta hasta el {day(user.sessionExpiresAt)}.</p>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={close}>Cancelar</Button>
        <Button onClick={() => save()} disabled={busy || !name.trim()}>
          {busy && <Loader2 className="animate-spin" />} Guardar preferencias
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

function PasswordDialog({ close }: { close: () => void }) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [repeat, setRepeat] = useState("")
  const [busy, setBusy] = useState(false)
  const problem = next && next.length < 8 ? "Al menos 8 caracteres" : repeat && next !== repeat ? "Las dos contraseñas nuevas no coinciden" : ""

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (problem) return
    setBusy(true)
    try {
      await api.changePassword(current, next)
      toast.success("Contraseña cambiada. Se han cerrado las sesiones de otros dispositivos.")
      close()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogContent className="sm:max-w-sm">
      <form onSubmit={submit} className="space-y-5">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Cambiar contraseña</DialogTitle>
          <DialogDescription>Las sesiones abiertas en otros dispositivos se cerrarán.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="cur">Contraseña actual</Label>
          <Input id="cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new">Nueva contraseña</Label>
          <Input id="new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rep">Repite la nueva</Label>
          <Input id="rep" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
          {problem && <p className="text-xs text-rose">{problem}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>Cancelar</Button>
          <Button type="submit" disabled={busy || !!problem || !current || !next || !repeat}>
            {busy && <Loader2 className="animate-spin" />} Cambiar contraseña
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
