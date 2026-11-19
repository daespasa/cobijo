import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react"
import L from "leaflet"
import { AnimatePresence, m } from "motion/react"
import { CircleDot, Hand, Loader2, MapPin, Pentagon, Search, Trash2, Undo2, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { geocode, eur, type LatLng, type Result, type Zone } from "@/lib/api"
import { toast } from "sonner"

export type Mode = "pan" | "polygon" | "circle"
export type MapApi = { flyTo: (lat: number, lng: number, zoom?: number) => void; fitZones: () => void }

type Props = {
  ref?: Ref<MapApi>
  zones: Zone[]
  onAddZone: (z: Zone) => void
  onRemoveZone: (i: number) => void
  onClearZones: () => void
  onPresets: () => void
  results: Result[]
  activeId: number | null
  onPinClick: (id: number) => void
  origin?: { name: string; lat: number; lng: number }
}

const PINE = "#1f5c4a"
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export function MapView({ ref, zones, onAddZone, onRemoveZone, onClearZones, onPresets, results, activeId, onPinClick, origin }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layers = useRef<{ zones: L.LayerGroup; draft: L.LayerGroup; pins: L.FeatureGroup } | null>(null)
  const rubber = useRef<L.Polyline | null>(null)
  const drawnCount = useRef(0)
  const [mode, setMode] = useState<Mode>("pan")
  const [draft, setDraft] = useState<LatLng[]>([])
  const [km, setKm] = useState(25)
  const [place, setPlace] = useState("")
  const [finding, setFinding] = useState(false)

  // los handlers de Leaflet se crean una vez: leen el estado actual por esta ref
  const live = useRef({ mode, km, draft, onAddZone, onRemoveZone, onPinClick })
  live.current = { mode, km, draft, onAddZone, onRemoveZone, onPinClick }

  const fitZones = () => {
    const shapes = layers.current?.zones.getLayers() as L.Path[] | undefined
    if (shapes?.length) map.current?.fitBounds(L.featureGroup(shapes).getBounds(), { padding: [40, 40], maxZoom: 11 })
  }
  useImperativeHandle(ref, () => ({ flyTo: (lat, lng, zoom = 13) => map.current?.flyTo([lat, lng], Math.min(zoom, 16), { duration: 0.8 }), fitZones }))

  // --- init ---
  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: false, maxZoom: 16 }).setView([40.1, -2.6], 6)
    L.control.zoom({ position: "bottomright" }).addTo(m)
    // base gris claro sin ruido + capa de nombres encima: la zona y los precios son lo que destaca
    const esri = (layer: string) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${layer}/MapServer/tile/{z}/{y}/{x}`
    L.tileLayer(esri("World_Light_Gray_Base"), { maxZoom: 16, attribution: "Mapa © Esri, HERE, Garmin, © OpenStreetMap" }).addTo(m)
    L.tileLayer(esri("World_Light_Gray_Reference"), { maxZoom: 16, pane: "overlayPane" }).addTo(m)
    layers.current = { zones: L.layerGroup().addTo(m), draft: L.layerGroup().addTo(m), pins: L.featureGroup().addTo(m) }
    m.on("click", (e) => {
      const s = live.current
      if (s.mode === "polygon") setDraft((d) => [...d, [e.latlng.lat, e.latlng.lng]])
      if (s.mode === "circle") {
        s.onAddZone({ type: "circle", name: "", lat: e.latlng.lat, lng: e.latlng.lng, km: s.km })
        setMode("pan")
      }
    })
    m.on("mousemove", (e) => {
      const last = live.current.draft.at(-1)
      if (rubber.current && last) rubber.current.setLatLngs([last, e.latlng])
    })
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    if (!origin || !map.current) return
    const pin = L.circleMarker([origin.lat, origin.lng], { radius: 6, color: "#16233b", weight: 2, fillColor: "#e8a33d", fillOpacity: 1 })
      .bindTooltip(`Salís desde ${esc(origin.name)}`, { direction: "top" })
      .addTo(map.current)
    return () => void pin.remove()
  }, [origin])

  // --- modo ---
  useEffect(() => {
    el.current?.classList.toggle("drawing", mode !== "pan")
    if (mode !== "polygon") setDraft([])
  }, [mode])

  const closeDraft = () => {
    if (draft.length < 3) return
    onAddZone({ type: "polygon", name: "", points: draft })
    setDraft([])
    setMode("pan")
  }

  useEffect(() => {
    if (mode === "pan") return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return
      if (e.key === "Escape") setMode("pan")
      if (e.key === "Backspace") setDraft((d) => d.slice(0, -1))
      if (e.key === "Enter") document.getElementById("close-zone")?.click()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mode])

  // --- borrador del polígono ---
  useEffect(() => {
    const g = layers.current?.draft
    if (!g) return
    g.clearLayers()
    rubber.current = null
    if (!draft.length) return
    L.polyline(draft, { color: PINE, weight: 2.5, className: "draft-line", interactive: false }).addTo(g)
    rubber.current = L.polyline([draft.at(-1)!, draft.at(-1)!], { color: PINE, weight: 1.5, opacity: 0.6, dashArray: "4 6", interactive: false }).addTo(g)
    draft.forEach((p, i) => {
      const first = i === 0
      const v = L.circleMarker(p, {
        radius: first ? 8 : 5,
        color: PINE,
        weight: 2,
        fillColor: first && draft.length >= 3 ? PINE : "#fff",
        fillOpacity: 1,
        bubblingMouseEvents: false,
      }).addTo(g)
      if (first && draft.length >= 3) {
        v.bindTooltip("Cerrar zona", { direction: "top" })
        v.on("click", () => document.getElementById("close-zone")?.click())
      }
    })
  }, [draft])

  // --- zonas ---
  useEffect(() => {
    const g = layers.current?.zones
    if (!g) return
    g.clearLayers()
    zones.forEach((z, i) => {
      const style: L.PathOptions = {
        color: PINE,
        weight: 2,
        fillColor: PINE,
        fillOpacity: 0.16,
        className: i >= drawnCount.current ? "zone-shape" : "", // solo la nueva se anima
      }
      const shape = z.type === "polygon" ? L.polygon(z.points, style) : L.circle([z.lat, z.lng], { ...style, radius: z.km * 1000 })
      const box = document.createElement("div")
      box.className = "flex items-center gap-3 text-sm"
      box.innerHTML = `<b>${esc(z.name || "Zona")}</b>`
      const del = document.createElement("button")
      del.textContent = "Quitar"
      del.className = "text-rose font-semibold underline-offset-2 hover:underline"
      del.onclick = () => live.current.onRemoveZone(i)
      box.append(del)
      shape.bindTooltip(esc(z.name || "Zona"), { sticky: true }).bindPopup(box)
      // dibujando, un clic encima de otra zona tiene que poner el punto igual: se lo pasamos al mapa
      shape.on("click", (e) => {
        if (live.current.mode === "pan") return
        shape.closePopup()
        L.DomEvent.stop(e)
        map.current?.fire("click", { latlng: e.latlng })
      })
      shape.addTo(g)
    })
    drawnCount.current = zones.length
  }, [zones])

  // --- pines de precio ---
  useEffect(() => {
    const g = layers.current?.pins
    if (!g) return
    g.clearLayers()
    const fitting = results.filter((r) => r.fits_budget && r.fits_privacy && r.per_person_night != null)
    const bestId = fitting.sort((a, b) => a.per_person_night! - b.per_person_night!)[0]?.id
    for (const r of results) {
      if (r.lat == null || r.lng == null) continue
      const cls = r.id === activeId ? "active" : r.id === bestId ? "best" : r.fits_budget ? "" : "over"
      const icon = L.divIcon({ className: "pin-icon", html: `<span class="price-pin ${cls}">${esc(eur(r.per_person_night))}</span>`, iconSize: [0, 0] })
      L.marker([r.lat, r.lng], { icon, zIndexOffset: r.id === activeId ? 1000 : r.id === bestId ? 500 : 0, keyboard: false })
        .on("click", () => live.current.onPinClick(r.id))
        .addTo(g)
    }
  }, [results, activeId])

  const findPlace = async () => {
    if (!place.trim()) return
    setFinding(true)
    try {
      const r = await geocode(place)
      if (!r) return void toast.error(`No encontramos «${place}». Prueba con el nombre del pueblo o la ciudad.`)
      map.current?.flyTo([r.lat, r.lng], 11, { duration: 0.9 })
      setPlace("")
    } finally {
      setFinding(false)
    }
  }

  return (
    <div className="relative isolate h-full w-full overflow-hidden">
      <div ref={el} className="h-full w-full" />

      {/* barra superior */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex flex-wrap items-start gap-2">
        <form
          className="pointer-events-auto relative w-full sm:w-64"
          onSubmit={(e) => {
            e.preventDefault()
            findPlace()
          }}
        >
          {finding ? (
            <Loader2 className="absolute top-1/2 left-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          )}
          <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Ir a un lugar…" aria-label="Ir a un lugar" className="h-10 bg-card pl-9 shadow-md" />
        </form>

        <div className="pointer-events-auto flex items-center gap-1 rounded-xl bg-card p-1 shadow-md">
          <ToggleGroup value={[mode]} onValueChange={(v) => v[0] && setMode(v[0] as Mode)} spacing={1} aria-label="Herramienta del mapa">
            <ToggleGroupItem value="pan" aria-label="Mover el mapa" className="gap-1.5 px-2.5">
              <Hand /> <span className="hidden md:inline">Mover</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="polygon" aria-label="Dibujar zona" className="gap-1.5 px-2.5 data-pressed:bg-primary data-pressed:text-primary-foreground">
              <Pentagon /> <span>Dibujar zona</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="circle" aria-label="Zona por radio" className="gap-1.5 px-2.5 data-pressed:bg-primary data-pressed:text-primary-foreground">
              <CircleDot /> <span className="hidden md:inline">Radio</span>
            </ToggleGroupItem>
          </ToggleGroup>
          <span className="mx-0.5 h-6 w-px bg-border" />
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={onPresets} aria-label="Añadir ciudades a 6 h o menos de Sueca" />}>
              <MapPin />
            </TooltipTrigger>
            <TooltipContent>Añadir ciudades a ≤ 6 h de Sueca</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={onClearZones} disabled={!zones.length} aria-label="Quitar todas las zonas" />}>
              <Trash2 />
            </TooltipTrigger>
            <TooltipContent>Quitar todas las zonas</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* ayuda contextual del modo */}
      <AnimatePresence>
        {mode !== "pan" && (
          <m.div
            key={mode}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="absolute inset-x-3 bottom-4 z-[500] mx-auto flex max-w-xl flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-night px-4 py-3 text-sm text-white shadow-xl"
          >
            {mode === "polygon" ? (
              <>
                <p className="min-w-0 flex-1">
                  {draft.length === 0 && "Pulsa en el mapa para marcar el primer punto de la zona."}
                  {draft.length > 0 && draft.length < 3 && `Llevas ${draft.length} ${draft.length === 1 ? "punto" : "puntos"}. Hacen falta al menos 3.`}
                  {draft.length >= 3 && "Pulsa el primer punto o «Cerrar zona» para terminar."}
                </p>
                <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setDraft((d) => d.slice(0, -1))} disabled={!draft.length}>
                  <Undo2 /> Deshacer
                </Button>
                <Button id="close-zone" size="sm" className="bg-amber text-night hover:bg-amber/90" onClick={closeDraft} disabled={draft.length < 3}>
                  <Check /> Cerrar zona
                </Button>
              </>
            ) : (
              <>
                <p className="min-w-0 flex-1">Pulsa en el mapa para poner el centro.</p>
                <div className="flex w-44 items-center gap-3">
                  <Slider value={[km]} min={5} max={150} step={5} onValueChange={(v) => setKm(Array.isArray(v) ? v[0] : v)} aria-label="Radio en km" />
                  <span className="w-14 shrink-0 text-right font-semibold tabular-nums">{km} km</span>
                </div>
              </>
            )}
            <Button size="icon-sm" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setMode("pan")} aria-label="Cancelar">
              <X />
            </Button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
