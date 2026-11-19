import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, m } from "motion/react"
import { Bath, BedDouble, CircleX, ExternalLink, LocateFixed, PawPrint, Star, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { active, eur, nights, type Favorite, type Filters, type Result, type Search } from "@/lib/api"
import { cn } from "@/lib/utils"

const SORTS = [
  { value: "price", label: "Más baratos primero" },
  { value: "rating", label: "Mejor valorados" },
  { value: "zone", label: "Por zona" },
]
const PROVIDERS = [
  { value: "all", label: "Booking y Airbnb" },
  { value: "booking", label: "Solo Booking" },
  { value: "airbnb", label: "Solo Airbnb" },
]
const STATUS: Record<Search["status"], string> = {
  queued: "En cola",
  running: "Buscando",
  done: "Búsqueda terminada",
  cancelled: "Búsqueda cancelada",
  error: "La búsqueda se detuvo",
}
const score = (r: Result) => (r.rating == null ? -1 : r.provider === "airbnb" ? r.rating * 2 : r.rating) // Airbnb puntúa sobre 5


export function useFilteredResults(search: Search | null, f: Filters) {
  return useMemo(() => {
    if (!search) return []
    const sorters: Record<string, (a: Result, b: Result) => number> = {
      price: (a, b) => (a.per_person_night ?? 1e9) - (b.per_person_night ?? 1e9),
      rating: (a, b) => score(b) - score(a),
      zone: (a, b) => a.zone.localeCompare(b.zone) || (a.per_person_night ?? 1e9) - (b.per_person_night ?? 1e9),
    }
    return search.results
      .filter((r) => r.per_person_night != null && r.per_person_night <= f.max)
      .filter((r) => !f.privacy || r.fits_privacy)
      .filter((r) => f.provider === "all" || r.provider === f.provider)
      .sort(sorters[f.sort])
  }, [search, f])
}


// Tarjeta de alojamiento: la usan Resultados y Guardados
export function ResultCard({ r, best = false, action, onLocate }: {
  r: Result | Favorite; best?: boolean; action?: React.ReactNode; onLocate?: () => void
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {best && <p className="mb-1.5 inline-block rounded-full bg-amber px-2 py-0.5 text-xs font-semibold text-night">El más barato que encaja</p>}
          <p className="text-xs text-muted-foreground">
            {r.zone}, en {r.provider === "booking" ? "Booking" : "Airbnb"}
          </p>
          <a href={/^https:\/\//.test(r.url) ? r.url : "#"} target="_blank" rel="noopener noreferrer" className="mt-0.5 line-clamp-2 font-semibold leading-snug hover:text-pine hover:underline">
            {r.title}
            <ExternalLink className="ml-1 inline size-3.5 align-[-2px] opacity-0 transition-opacity group-hover:opacity-60" />
          </a>
          {r.location && <p className="truncate text-sm text-muted-foreground">{r.location}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("font-heading text-2xl font-semibold leading-none tabular-nums", r.fits_budget ? "text-pine" : "text-rose")}>{eur(r.per_person_night)}</p>
          <p className="mt-1 text-xs text-muted-foreground">por persona y noche</p>
          <p className="text-xs text-muted-foreground">{eur(r.total_price)} en total</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className={cn("inline-flex items-center gap-1.5", !r.fits_privacy && "text-rose")}>
          {r.fits_privacy ? <BedDouble className="size-4 text-pine" /> : <TriangleAlert className="size-4" />}
          {r.private_rooms ?? "?"} dormitorios
        </span>
        {r.bathrooms != null && <span className="inline-flex items-center gap-1.5"><Bath className="size-4 text-muted-foreground" />{r.bathrooms}</span>}
        {r.rating != null && (
          <span className="inline-flex items-center gap-1.5">
            <Star className="size-4 fill-amber text-amber" />
            {r.rating.toLocaleString("es-ES")}{r.provider === "airbnb" ? "/5" : "/10"}
            {r.reviews != null && <span className="text-muted-foreground">({r.reviews.toLocaleString("es-ES")})</span>}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {r.lat != null && onLocate && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-pine" onClick={onLocate}>
              <LocateFixed /> Ver en el mapa
            </Button>
          )}
          {action}
        </span>
      </div>
    </>
  )
}

type Props = {
  search: Search | null
  list: Result[]
  filters: Filters
  setFilters: (f: Filters) => void
  activeId: number | null
  setActiveId: (id: number | null) => void
  onLocate: (r: Result) => void
  onCancel: () => void
  onNewSearch: () => void
  saveButton: (r: Result) => React.ReactNode
  onSaveFilters: () => void
}

export function Results({ search, list, filters, setFilters, activeId, setActiveId, onLocate, onCancel, onNewSearch, saveButton, onSaveFilters }: Props) {
  const refs = useRef(new Map<number, HTMLElement>())
  const [cancelling, setCancelling] = useState(false)
  useEffect(() => {
    if (activeId != null) refs.current.get(activeId)?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [activeId])
  useEffect(() => setCancelling(false), [search?.id])

  if (!search) {
    return (
      <div className="py-16 text-center">
        <p className="font-heading text-xl font-semibold">Aún no hay resultados</p>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">Marca una zona, ajusta el grupo y pulsa Buscar. Los alojamientos aparecerán aquí y en el mapa.</p>
        <Button variant="outline" className="mt-5" onClick={onNewSearch}>Ir a buscar</Button>
      </div>
    )
  }

  const p = search.params
  const running = active(search)
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters({ ...filters, [k]: v })
  const bestId = list.find((r) => r.fits_budget && r.fits_privacy)?.id

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl font-semibold">{STATUS[search.status]}</h2>
            <p className="text-sm text-muted-foreground">
              {new Date(p.checkin).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} – {new Date(p.checkout).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}, {nights(p)} noches, {p.adults} personas, {p.bedrooms} dormitorios
              {p.pets > 0 && <>, <PawPrint className="inline size-3.5 align-[-2px]" /> {p.pets}</>}
            </p>
          </div>
          {running && (
            <Button
              size="sm"
              variant="outline"
              disabled={cancelling}
              onClick={() => {
                setCancelling(true)
                onCancel()
              }}
            >
              <CircleX /> {cancelling ? "Cancelando…" : "Cancelar"}
            </Button>
          )}
        </div>
        {running && (
          <div className="space-y-1.5">
            <Progress value={null} aria-label="Buscando" />
            <p className="text-xs text-muted-foreground">{search.progress ?? "Esperando a que termine la búsqueda anterior…"}</p>
          </div>
        )}
        {search.error && <p className="rounded-lg bg-rose/10 p-3 text-sm text-rose">{search.error}. Repite la búsqueda desde el historial.</p>}
      </header>

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="font-medium">Precio por persona y noche</span>
            <span className="font-semibold tabular-nums">hasta {filters.max} €</span>
          </div>
          <Slider value={[filters.max]} min={10} max={250} step={5} onValueChange={(v) => set("max", Array.isArray(v) ? v[0] : v)} aria-label="Precio máximo" />
        </div>
        <label className="flex items-center justify-between gap-3 text-sm sm:col-span-2">
          <span>
            <span className="font-medium">Un dormitorio por pareja</span>
            <span className="block text-xs text-muted-foreground">Al menos {p.bedrooms} dormitorios o apartamentos</span>
          </span>
          <Switch checked={filters.privacy} onCheckedChange={(v) => set("privacy", v)} />
        </label>
        <Select value={filters.provider} onValueChange={(v) => set("provider", String(v))} items={PROVIDERS}>
          <SelectTrigger className="w-full" aria-label="Web"><SelectValue /></SelectTrigger>
          <SelectContent>{PROVIDERS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.sort} onValueChange={(v) => set("sort", String(v))} items={SORTS}>
          <SelectTrigger className="w-full" aria-label="Orden"><SelectValue /></SelectTrigger>
          <SelectContent>{SORTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          <b className="text-foreground">{list.length}</b> de {search.results.length} alojamientos encontrados
        </p>
        <button type="button" onClick={onSaveFilters} className="text-xs text-pine hover:underline">Usar estos filtros siempre</button>
      </div>

      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {list.map((r, i) => (
            <m.li
              key={r.id}

              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.04 } }}
              exit={{ opacity: 0 }}
              ref={(el) => void (el ? refs.current.set(r.id, el) : refs.current.delete(r.id))}
              onMouseEnter={() => setActiveId(r.id)}
              onMouseLeave={() => setActiveId(null)}
              className={cn(
                "group rounded-xl border bg-card p-4 transition-[border-color,box-shadow]",
                r.id === activeId ? "border-night shadow-md" : "border-border",
                r.id === bestId && "ring-2 ring-amber/70"
              )}
            >
              <ResultCard r={r} best={r.id === bestId} action={saveButton(r)} onLocate={() => onLocate(r)} />
            </m.li>
          ))}
        </AnimatePresence>
        {running && list.length === 0 && [0, 1, 2].map((k) => <Skeleton key={k} className="h-32 rounded-xl" />)}
      </ul>

      {!running && list.length === 0 && (
        <div className="rounded-xl border border-dashed border-input p-6 text-center text-sm text-muted-foreground">
          Nada encaja con estos filtros. Sube el precio o desactiva «Un dormitorio por pareja» para ver el resto.
        </div>
      )}

      {search.failures.length > 0 && (
        <details className="rounded-xl border border-border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-medium">{search.failures.length} zonas sin resultados</summary>
          <p className="mt-2 text-muted-foreground">Puede que no haya nada con esos requisitos o que la web haya cambiado. Ábrelas para comprobarlo.</p>
          <ul className="mt-2 space-y-1">
            {search.failures.map((f, i) => (
              <li key={i}>
                {f.zone} en {f.provider === "booking" ? "Booking" : "Airbnb"}
                {f.searchUrl && /^https:\/\//.test(f.searchUrl) && (
                  <a className="ml-2 text-pine hover:underline" href={f.searchUrl} target="_blank" rel="noopener noreferrer">abrir en la web</a>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
