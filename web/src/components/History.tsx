import { AnimatePresence, m } from "motion/react"
import { CircleDot, Loader2, PawPrint, Pentagon, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { active, type SearchSummary } from "@/lib/api"
import { cn } from "@/lib/utils"

const BADGE: Record<SearchSummary["status"], { text: string; cls: string }> = {
  queued: { text: "En cola", cls: "bg-muted text-muted-foreground" },
  running: { text: "Buscando", cls: "bg-amber/20 text-night" },
  done: { text: "Terminada", cls: "bg-pine-soft text-pine" },
  cancelled: { text: "Cancelada", cls: "bg-muted text-muted-foreground" },
  error: { text: "Detenida", cls: "bg-rose/15 text-rose" },
}

type Props = {
  items: SearchSummary[]
  currentId: number | null
  onOpen: (id: number) => void
  onRepeat: (s: SearchSummary) => void
  onDelete: (id: number) => void
}

export function History({ items, currentId, onOpen, onRepeat, onDelete }: Props) {
  if (!items.length) {
    return (
      <div className="py-16 text-center">
        <p className="font-heading text-xl font-semibold">Sin búsquedas guardadas</p>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">Cada búsqueda que hagas se guarda aquí con sus resultados, para compararlas o repetirlas otro día.</p>
      </div>
    )
  }
  return (
    <ul className="space-y-2.5">
      <AnimatePresence initial={false}>
        {items.map((s) => {
          const p = s.params
          const names = p.zones.map((z) => z.name || "Zona")
          const b = BADGE[s.status]
          return (
            <m.li
              key={s.id}

              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -24 }}
              className={cn("rounded-xl border bg-card transition-colors", s.id === currentId ? "border-pine" : "border-border hover:border-pine/40")}
            >
              <button type="button" onClick={() => onOpen(s.id)} className="block w-full p-4 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-xl">
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 font-semibold">
                    {p.zones[0]?.type === "polygon" ? <Pentagon className="mr-1 inline size-4 align-[-2px] text-pine" /> : <CircleDot className="mr-1 inline size-4 align-[-2px] text-pine" />}
                    {names.slice(0, 3).join(", ")}
                    {names.length > 3 && <span className="text-muted-foreground"> y {names.length - 3} más</span>}
                  </p>
                  <Badge className={cn("shrink-0 border-0", b.cls)}>
                    {active(s) && <Loader2 className="animate-spin" />}
                    {b.text}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(p.checkin).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} – {new Date(p.checkout).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}, {p.adults} personas, hasta {p.maxPerPersonNight} €
                  {p.pets > 0 && <>, <PawPrint className="inline size-3.5 align-[-2px]" /> {p.pets}</>}
                </p>
                <p className="mt-2 text-sm">
                  <b className="font-heading text-lg text-pine">{s.fitting}</b> encajan de {s.total}
                  <span className="ml-2 text-xs text-muted-foreground">{new Date(s.created_at + "Z").toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}</span>
                </p>
              </button>
              <div className="flex justify-end gap-1 border-t border-border px-2 py-1.5">
                <Button size="sm" variant="ghost" onClick={() => onRepeat(s)}>
                  <RotateCcw /> Repetir
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger render={<Button size="sm" variant="ghost" className="text-rose hover:text-rose" disabled={active(s)} />}>
                    <Trash2 /> Borrar
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Borrar esta búsqueda?</AlertDialogTitle>
                      <AlertDialogDescription>Se borran también sus {s.total} resultados. No se puede deshacer.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Conservar</AlertDialogCancel>
                      <AlertDialogAction className="bg-rose text-white hover:bg-rose/90" onClick={() => onDelete(s.id)}>Borrar búsqueda</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </m.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}
