import type { ComponentType } from "react"
import { AnimatePresence, m } from "motion/react"
import {
  AirVent, Bath, BedDouble, CalendarCheck, Building, Car, CircleDot, CookingPot, Drumstick, Flame, Heater, Loader2, Minus,
  PawPrint, Pentagon, Plus, Search, Users, WashingMachine, Waves, Wifi, X, type LucideProps,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { eur, nights, type Meta, type Params, type Zone } from "@/lib/api"
import { cn } from "@/lib/utils"

const ICONS: Record<string, ComponentType<LucideProps>> = {
  parking: Car, wifi: Wifi, kitchen: CookingPot, ac: AirVent, heating: Heater, fireplace: Flame,
  pool: Waves, jacuzzi: Bath, bbq: Drumstick, washer: WashingMachine, balcony: Building,
}
const DEPTH = [
  { value: "1", label: "Rápida (1 página por zona)" },
  { value: "2", label: "Normal (2 páginas)" },
  { value: "3", label: "Amplia (3 páginas)" },
  { value: "5", label: "A fondo (5 páginas)" },
]

type Form = Omit<Params, "zones">
type Props = {
  meta: Meta
  form: Form
  setForm: (f: Form) => void
  zones: Zone[]
  onRemoveZone: (i: number) => void
  onSubmit: () => void
  submitting: boolean
  onSaveDefaults: () => void
}

function Stepper({ icon: Icon, label, hint, value, min, max, onChange }: {
  icon: ComponentType<LucideProps>; label: string; hint?: string; value: number; min: number; max: number; onChange: (n: number) => void
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Icon className="size-5 shrink-0 text-pine" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon-sm" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Menos ${label.toLowerCase()}`}>
          <Minus />
        </Button>
        <span className="w-8 text-center text-base font-semibold tabular-nums" aria-live="polite">{value}</span>
        <Button type="button" variant="outline" size="icon-sm" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Más ${label.toLowerCase()}`}>
          <Plus />
        </Button>
      </div>
    </div>
  )
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function SearchForm({ meta, form, setForm, zones, onRemoveZone, onSubmit, submitting, onSaveDefaults }: Props) {
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v })
  const n = nights(form)
  const total = form.maxPerPersonNight * form.adults * n
  const steps = zones.length * form.providers.length
  const minutes = Math.ceil((steps * (8 + 6 * form.pages)) / 60)
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <form
      className="space-y-7"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <Section title="Zonas" aside={<span className="text-xs text-muted-foreground">{zones.length || "ninguna"}</span>}>
        {zones.length === 0 ? (
          <p className="rounded-xl border border-dashed border-input p-4 text-sm text-muted-foreground">
            Dibuja en el mapa dónde queréis ir con <Pentagon className="inline size-4 align-[-3px] text-pine" /> <b className="text-foreground">Dibujar zona</b>, o
            añade de golpe las ciudades a ≤ 6 h de Sueca con el botón del pin.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            <AnimatePresence initial={false}>
              {zones.map((z, i) => (
                <m.li
                  key={`${z.type}-${z.type === "polygon" ? z.points[0].join() : `${z.lat},${z.lng}`}`}

                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="flex items-center gap-1.5 rounded-full bg-pine-soft py-1 pr-1 pl-2.5 text-sm text-pine"
                >
                  {z.type === "polygon" ? <Pentagon className="size-3.5" /> : <CircleDot className="size-3.5" />}
                  <span className="font-medium">{z.name || "Buscando nombre…"}</span>
                  {z.type === "circle" && <span className="text-pine/70">{z.km} km</span>}
                  <button type="button" onClick={() => onRemoveZone(i)} className="rounded-full p-0.5 hover:bg-pine/10" aria-label={`Quitar ${z.name}`}>
                    <X className="size-3.5" />
                  </button>
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </Section>

      <Section title="Fechas" aside={n > 0 && <span className="text-xs text-muted-foreground">{n} {n === 1 ? "noche" : "noches"}</span>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="checkin">Llegada</Label>
            <Input id="checkin" type="date" value={form.checkin} onChange={(e) => set("checkin", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="checkout">Salida</Label>
            <Input id="checkout" type="date" value={form.checkout} min={form.checkin} onChange={(e) => set("checkout", e.target.value)} required />
          </div>
        </div>
      </Section>

      <Section title="El grupo">
        <div className="divide-y divide-border rounded-xl border border-border bg-card px-3">
          <Stepper icon={Users} label="Personas" value={form.adults} min={1} max={30} onChange={(v) => set("adults", v)} />
          <Stepper icon={BedDouble} label="Dormitorios" hint="Uno por pareja" value={form.bedrooms} min={0} max={15} onChange={(v) => set("bedrooms", v)} />
          <Stepper icon={PawPrint} label="Mascotas" value={form.pets} min={0} max={5} onChange={(v) => set("pets", v)} />
        </div>
      </Section>

      <Section title="Presupuesto">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="font-heading text-3xl font-semibold tabular-nums">
            {form.maxPerPersonNight} €<span className="ml-1.5 font-sans text-sm font-normal text-muted-foreground">por persona y noche, como mucho</span>
          </p>
          <Slider className="my-4" value={[form.maxPerPersonNight]} min={20} max={200} step={5} onValueChange={(v) => set("maxPerPersonNight", Array.isArray(v) ? v[0] : v)} aria-label="Precio máximo por persona y noche" />
          <p className="text-sm text-muted-foreground">
            Hasta <b className="text-foreground">{eur(total)}</b> en total para {form.adults} {form.adults === 1 ? "persona" : "personas"} y {n} {n === 1 ? "noche" : "noches"}.
          </p>
        </div>
      </Section>

      <Section title="Dónde buscar">
        <div className="grid grid-cols-2 gap-3">
          {(["booking", "airbnb"] as const).map((p) => (
            <label key={p} className={cn("flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors", form.providers.includes(p) ? "border-pine bg-pine-soft" : "border-border bg-card")}>
              <span className="text-sm font-medium">{p === "booking" ? "Booking" : "Airbnb"}</span>
              <Switch checked={form.providers.includes(p)} onCheckedChange={() => set("providers", toggle(form.providers, p))} />
            </label>
          ))}
        </div>
      </Section>

      <label className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition-colors", form.freeCancellation ? "border-pine bg-pine-soft" : "border-border bg-card")}>
        <span className="flex items-center gap-3">
          <CalendarCheck className="size-5 shrink-0 text-pine" aria-hidden />
          <span>
            <span className="block text-sm font-medium">Solo con cancelación gratis</span>
            <span className="block text-xs text-muted-foreground">Lo filtran Booking y Airbnb al buscar</span>
          </span>
        </span>
        <Switch checked={!!form.freeCancellation} onCheckedChange={(v) => set("freeCancellation", v)} />
      </label>

      <Section title="Comodidades" aside={form.amenities.length > 0 && <button type="button" className="text-xs text-pine hover:underline" onClick={() => set("amenities", [])}>Quitar todas</button>}>
        <div className="flex flex-wrap gap-1.5">
          {meta.amenities.map((a) => {
            const Icon = ICONS[a.key] ?? Plus
            const on = form.amenities.includes(a.key)
            return (
              <button
                key={a.key}
                type="button"
                aria-pressed={on}
                onClick={() => set("amenities", toggle(form.amenities, a.key))}
                title={a.only ? `Solo se puede filtrar en ${a.only === "airbnb" ? "Airbnb" : "Booking"}` : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-[background-color,border-color,transform] active:scale-95 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  on ? "border-pine bg-pine text-primary-foreground" : "border-border bg-card hover:border-pine/50"
                )}
              >
                <Icon className="size-4" aria-hidden />
                {a.label}
                {a.only && <span className={cn("text-[11px]", on ? "text-primary-foreground/75" : "text-muted-foreground")}>{a.only === "airbnb" ? "Airbnb" : "Booking"}</span>}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Profundidad">
        <Select value={String(form.pages)} onValueChange={(v) => set("pages", Number(v))} items={DEPTH}>
          <SelectTrigger className="w-full" aria-label="Profundidad de la búsqueda">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEPTH.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>

      <div className="sticky bottom-0 -mx-5 border-t border-border bg-card/95 px-5 pt-4 pb-5 backdrop-blur">
        <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={submitting || !steps}>
          {submitting ? <Loader2 className="animate-spin" /> : <Search />}
          {zones.length ? `Buscar en ${zones.length} ${zones.length === 1 ? "zona" : "zonas"}` : "Marca una zona para buscar"}
        </Button>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{steps > 0 ? `${steps} búsquedas, unos ${minutes} min` : "\u00a0"}</span>
          <button type="button" onClick={onSaveDefaults} className="font-medium text-pine hover:underline">Guardar como mis valores</button>
        </div>
      </div>
    </form>
  )
}
