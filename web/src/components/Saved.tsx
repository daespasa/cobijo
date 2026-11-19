import { useState } from "react"
import { AnimatePresence, m } from "motion/react"
import { Check, Pencil, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { ResultCard } from "@/components/Results"
import type { Favorite, SavedList } from "@/lib/api"
import { cn } from "@/lib/utils"

type Props = {
  lists: SavedList[]
  items: Favorite[]
  selectedId: number | null
  onSelect: (id: number) => void
  onCreate: (name: string) => Promise<void>
  onRename: (id: number, name: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onLocate: (f: Favorite) => void
  saveButton: (f: Favorite) => React.ReactNode
}

export function Saved({ lists, items, selectedId, onSelect, onCreate, onRename, onDelete, onLocate, saveButton }: Props) {
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState("")
  const list = lists.find((l) => l.id === selectedId) ?? null
  const shown = items.filter((f) => f.list_id === list?.id)

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await onCreate(name.trim())
    setName("")
    setCreating(false)
  }
  const submitRename = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!list || !name.trim()) return
    await onRename(list.id, name.trim())
    setEditing(false)
  }

  return (
    <div className="space-y-5">
      {/* selector de listas */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Tus listas">
        {lists.map((l) => (
          <button
            key={l.id}
            type="button"
            role="tab"
            aria-selected={l.id === list?.id}
            onClick={() => {
              onSelect(l.id)
              setEditing(false)
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              l.id === list?.id ? "border-night bg-night text-white" : "border-border bg-card hover:border-night/40"
            )}
          >
            {l.name}
            <span className={cn("text-xs tabular-nums", l.id === list?.id ? "text-white/70" : "text-muted-foreground")}>{l.count}</span>
          </button>
        ))}
        {creating ? (
          <form onSubmit={submitNew} className="flex items-center gap-1">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la lista" maxLength={60} className="h-8 w-44" aria-label="Nombre de la nueva lista" />
            <Button type="submit" size="icon-sm" disabled={!name.trim()} aria-label="Crear lista"><Check /></Button>
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => setCreating(false)} aria-label="Cancelar"><X /></Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setName("")
              setCreating(true)
            }}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-input px-3 py-1.5 text-sm text-pine hover:border-pine"
          >
            <Plus className="size-4" /> Nueva lista
          </button>
        )}
      </div>

      {!list ? (
        <div className="py-12 text-center">
          <p className="font-heading text-xl font-semibold">Crea tu primera lista</p>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">Por ejemplo «Fin de año» o «Las que votamos». Luego guarda alojamientos con el corazón.</p>
        </div>
      ) : (
        <>
          <header className="flex items-start justify-between gap-3">
            {editing ? (
              <form onSubmit={submitRename} className="flex flex-1 items-center gap-1">
                <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="h-9" aria-label="Nuevo nombre de la lista" />
                <Button type="submit" size="icon-sm" disabled={!name.trim()} aria-label="Guardar nombre"><Check /></Button>
                <Button type="button" size="icon-sm" variant="ghost" onClick={() => setEditing(false)} aria-label="Cancelar"><X /></Button>
              </form>
            ) : (
              <div className="min-w-0">
                <h2 className="truncate font-heading text-2xl font-semibold">{list.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {list.count} {list.count === 1 ? "alojamiento" : "alojamientos"}. El precio es el del día que lo encontraste.
                </p>
              </div>
            )}
            {!editing && (
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Renombrar lista"
                  title="Renombrar"
                  onClick={() => {
                    setName(list.name)
                    setEditing(true)
                  }}
                >
                  <Pencil />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" className="text-rose hover:text-rose" aria-label="Borrar lista" title="Borrar lista" />}>
                    <Trash2 />
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Borrar «{list.name}»?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se quitan sus {list.count} alojamientos de esta lista. Los que estén también en otras listas se quedan allí.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Conservar</AlertDialogCancel>
                      <AlertDialogAction className="bg-rose text-white hover:bg-rose/90" onClick={() => onDelete(list.id)}>Borrar lista</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </header>

          {shown.length === 0 ? (
            <p className="rounded-xl border border-dashed border-input p-6 text-center text-sm text-muted-foreground">
              Esta lista está vacía. En Resultados, pulsa el corazón de un alojamiento y marca «{list.name}».
            </p>
          ) : (
            <ul className="space-y-3">
              <AnimatePresence initial={false}>
                {shown.map((f) => (
                  <m.li key={f.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -24 }} className="group rounded-xl border border-border bg-card p-4">
                    <ResultCard r={f} action={saveButton(f)} onLocate={() => onLocate(f)} />
                    <p className="mt-2 text-xs text-muted-foreground">Guardado el {new Date(f.created_at.replace(" ", "T") + "Z").toLocaleDateString("es-ES", { day: "numeric", month: "long" })}</p>
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </>
      )}
    </div>
  )
}
