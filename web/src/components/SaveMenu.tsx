import { useState } from "react"
import { Heart, Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { Favorite, SaveSource, SavedList } from "@/lib/api"
import { cn } from "@/lib/utils"

type Props = {
  url: string
  title: string
  source: SaveSource
  lists: SavedList[]
  favorites: Favorite[]
  onToggle: (listId: number, source: SaveSource, url: string) => Promise<void>
  onCreate: (name: string, source: SaveSource) => Promise<void>
}

// Corazón de cada alojamiento: elige en qué listas está, o crea una nueva y guárdalo ahí.
export function SaveMenu({ url, title, source, lists, favorites, onToggle, onCreate }: Props) {
  const [name, setName] = useState("")
  const [busy, setBusy] = useState<number | "new" | null>(null)
  const inLists = new Set(favorites.filter((f) => f.url === url).map((f) => f.list_id))
  const saved = inLists.size > 0

  const toggle = async (listId: number) => {
    setBusy(listId)
    await onToggle(listId, source, url).finally(() => setBusy(null))
  }
  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy("new")
    await onCreate(name.trim(), source)
      .then(() => setName(""))
      .finally(() => setBusy(null))
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={saved ? `Guardado en ${inLists.size} ${inLists.size === 1 ? "lista" : "listas"}. Cambiar` : `Guardar ${title}`}
            title={saved ? "Cambiar listas" : "Guardar en una lista"}
          />
        }
      >
        <Heart className={cn("transition-transform active:scale-125", saved ? "fill-rose text-rose" : "text-muted-foreground")} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <p className="border-b border-border px-3 py-2.5 text-sm font-semibold">Guardar en…</p>
        <ul className="max-h-56 overflow-y-auto py-1">
          {lists.map((l) => (
            <li key={l.id}>
              <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted">
                {busy === l.id ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <Checkbox checked={inLists.has(l.id)} onCheckedChange={() => toggle(l.id)} />
                )}
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{l.count}</span>
              </label>
            </li>
          ))}
          {lists.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Aún no tienes listas. Crea la primera:</li>}
        </ul>
        <form onSubmit={create} className="flex gap-1.5 border-t border-border p-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva lista…" maxLength={60} aria-label="Nombre de la nueva lista" className="h-8" />
          <Button type="submit" size="icon-sm" className="size-8 shrink-0" disabled={!name.trim() || busy === "new"} aria-label="Crear lista y guardar">
            {busy === "new" ? <Loader2 className="animate-spin" /> : <Plus />}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
