import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Heart, History as HistoryIcon, House, List, Loader2, Search as SearchIcon } from "lucide-react"
import { toast } from "sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MapView, type MapApi } from "@/components/MapView"
import { SearchForm } from "@/components/SearchForm"
import { Results, useFilteredResults } from "@/components/Results"
import { History } from "@/components/History"
import { Login } from "@/components/Login"
import { Saved } from "@/components/Saved"
import { UserMenu } from "@/components/UserMenu"
import { SaveMenu } from "@/components/SaveMenu"
import {
  active, api, placeName, setUnauthorizedHandler,
  type Favorite, type Filters, type Meta, type Params, type Result, type SaveSource, type SavedList, type Search, type SearchSummary, type User, type Zone,
} from "@/lib/api"

type Tab = "buscar" | "resultados" | "guardados" | "historial"
type Form = Omit<Params, "zones">

const centroid = (z: Zone) =>
  z.type === "circle" ? [z.lat, z.lng] : [z.points.reduce((s, p) => s + p[0], 0) / z.points.length, z.points.reduce((s, p) => s + p[1], 0) / z.points.length]

const Spinner = () => (
  <div className="grid h-dvh place-items-center text-muted-foreground">
    <Loader2 className="size-6 animate-spin" />
  </div>
)

// Sesión: sin usuario → pantalla de entrada; con usuario → la app (se reinicia entera al cambiar de usuario)
export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      toast("Tu sesión ha caducado. Vuelve a entrar.")
    })
    api.me().then(setUser).catch(() => setUser(null))
  }, [])
  if (user === undefined) return <Spinner />
  if (!user) return <Login onLogin={setUser} />
  return (
    <Workspace
      key={user.username}
      user={user}
      onUser={setUser}
      onLogout={async () => {
        await api.logout().catch(() => {})
        setUser(null)
      }}
    />
  )
}

function Workspace({ user, onUser, onLogout }: { user: User; onUser: (u: User) => void; onLogout: () => void }) {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [zones, setZones] = useState<Zone[]>([])
  const [tab, setTab] = useState<Tab>("buscar")
  const [search, setSearch] = useState<Search | null>(null)
  const [history, setHistory] = useState<SearchSummary[]>([])
  const [filters, setFilters] = useState<Filters>({ max: 60, privacy: true, freeOnly: false, minRating: 0, maxCenterKm: 0, provider: "all", sort: "price" })
  const [activeId, setActiveId] = useState<number | null>(null)
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [lists, setLists] = useState<SavedList[]>([])
  const [listId, setListId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const mapApi = useRef<MapApi>(null)
  // punto de salida del usuario (si no ha puesto uno, el de serie)
  const origin = useMemo(() => user.prefs.origin ?? meta?.origin ?? { name: "", lat: 0, lng: 0 }, [user.prefs.origin, meta])
  const list = useFilteredResults(search, filters)

  const refreshHistory = useCallback(() => api.list().then(setHistory).catch(() => {}), [])

  useEffect(() => {
    api
      .meta()
      .then((m) => {
        // los valores guardados por el usuario mandan sobre los de serie
        const f = { ...m.defaults, ...user.prefs.form }
        setMeta(m)
        setForm(f)
        setFilters((x) => ({ ...x, ...user.prefs.filters, max: f.maxPerPersonNight }))
      })
      .catch(() => toast.error("No se puede hablar con el servidor. ¿Está arrancado? (npm start)"))
    refreshHistory()
    api.favorites().then(setFavorites).catch(() => {})
    api.lists().then((ls) => {
      setLists(ls)
      setListId(ls[0]?.id ?? null)
    }).catch(() => {})
    // solo al entrar: las preferencias posteriores se aplican en la próxima sesión o al guardar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshHistory])

  // --- preferencias ---
  const saveDefaults = async () => {
    if (!form) return
    try {
      onUser(await api.updateMe({ prefs: { form } }))
      toast.success("Guardado. Cada vez que entres, el formulario empezará así.")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const saveFilters = async () => {
    const { privacy, freeOnly, minRating, maxCenterKm, sort, provider } = filters
    try {
      onUser(await api.updateMe({ prefs: { filters: { privacy, freeOnly, minRating, maxCenterKm, sort, provider } } }))
      toast.success("Filtros guardados como tus predeterminados")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // --- listas y guardados ---
  const refreshLists = () => api.lists().then(setLists).catch(() => {})
  const fail = (e: unknown) => void toast.error((e as Error).message)
  const toggleInList = async (lid: number, source: SaveSource, url: string) => {
    const existing = favorites.find((f) => f.list_id === lid && f.url === url)
    try {
      if (existing) {
        await api.removeFavorite(existing.id)
        setFavorites((fs) => fs.filter((f) => f.id !== existing.id))
      } else {
        const f = await api.addFavorite(lid, source)
        setFavorites((fs) => [f, ...fs.filter((x) => x.id !== f.id)])
      }
      refreshLists()
    } catch (e) {
      fail(e)
    }
  }
  const createList = async (name: string, source?: SaveSource) => {
    try {
      const l = await api.createList(name)
      setLists((ls) => [...ls, l])
      setListId((id) => id ?? l.id)
      if (source) {
        const f = await api.addFavorite(l.id, source)
        setFavorites((fs) => [f, ...fs])
        refreshLists()
        toast.success(`Guardado en «${l.name}»`)
      } else {
        setListId(l.id)
      }
    } catch (e) {
      fail(e)
      throw e
    }
  }
  const renameList = async (id: number, name: string) => {
    try {
      const l = await api.renameList(id, name)
      setLists((ls) => ls.map((x) => (x.id === id ? l : x)))
    } catch (e) {
      fail(e)
      throw e
    }
  }
  const deleteList = async (id: number) => {
    try {
      await api.deleteList(id)
      const rest = lists.filter((l) => l.id !== id)
      setLists(rest)
      setFavorites((fs) => fs.filter((f) => f.list_id !== id))
      setListId(rest[0]?.id ?? null)
      toast("Lista borrada")
    } catch (e) {
      fail(e)
    }
  }
  const saveButton = (item: Result | Favorite, source: SaveSource) => (
    <SaveMenu url={item.url} title={item.title} source={source} lists={lists} favorites={favorites} onToggle={toggleInList} onCreate={(n, src) => createList(n, src)} />
  )
  const savedCount = new Set(favorites.map((f) => f.url)).size
  const shownFavorites = favorites.filter((f) => f.list_id === listId)

  // --- zonas ---
  const addZone = (z: Zone) => {
    setZones((zs) => [...zs, z])
    if (z.name) return
    const [lat, lng] = centroid(z)
    placeName(lat, lng).then((name) =>
      setZones((zs) => zs.map((x) => (x === z ? { ...x, name: name ?? `Zona ${zs.indexOf(x) + 1}` } : x)))
    )
  }
  const addPresets = () => {
    if (!meta) return
    setZones((zs) => {
      const have = new Set(zs.map((z) => z.name))
      return [...zs, ...meta.presets.filter((d) => !have.has(d.name)).map((d): Zone => ({ type: "circle", name: d.name, lat: d.lat, lng: d.lng, km: 25 }))]
    })
    setTimeout(() => mapApi.current?.fitZones(), 50)
    toast(`Añadidas las ${meta.presets.length} ciudades a ≤ 6 h de Sueca, con 25 km alrededor de cada una`)
  }

  // --- búsquedas ---
  const open = useCallback(async (id: number, loadParams = false) => {
    const s = await api.get(id)
    setSearch(s)
    setActiveId(null)
    setFilters((f) => ({ ...f, max: s.params.maxPerPersonNight }))
    if (loadParams) {
      const { zones: z, ...rest } = s.params
      setForm(rest)
      setZones(z)
      setTimeout(() => mapApi.current?.fitZones(), 50)
    }
    setTab("resultados")
  }, [])

  const submit = async () => {
    if (!form) return
    setSubmitting(true)
    try {
      const { id } = await api.create({ ...form, zones })
      toast.success("Búsqueda en marcha. Puedes seguir mirando el mapa mientras tanto.")
      await open(id)
      refreshHistory()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  // sondeo mientras busca
  const searchId = search?.id
  const running = active(search)
  useEffect(() => {
    if (!running || searchId == null) return
    const t = setInterval(async () => {
      const s = await api.get(searchId).catch(() => null)
      if (!s) return
      setSearch(s)
      if (!active(s)) {
        refreshHistory()
        const fit = s.results.filter((r) => r.fits_budget && r.fits_privacy).length
        if (s.status === "done") toast.success(`Búsqueda terminada: ${fit} de ${s.results.length} alojamientos encajan`)
      }
    }, 3000)
    return () => clearInterval(t)
  }, [running, searchId, refreshHistory])

  const locate = (r: Pick<Result, "id" | "lat" | "lng">) => {
    if (r.lat == null || r.lng == null) return
    mapApi.current?.flyTo(r.lat, r.lng, 14)
    setActiveId(r.id)
  }

  if (!meta || !form) return <Spinner />

  const runningCount = history.filter(active).length

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      <aside className="order-2 flex min-h-0 flex-1 flex-col border-border bg-card lg:order-1 lg:w-[440px] lg:flex-none lg:border-r">
        <header className="flex items-center gap-3 px-5 pt-5 pb-4">
          <span className="grid size-10 place-items-center rounded-xl bg-pine text-primary-foreground">
            <House className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-xl leading-tight font-semibold">Cobijo</h1>
            <p className="truncate text-sm text-muted-foreground">Hola, {user.name}</p>
          </div>
          <UserMenu user={user} meta={meta} onUser={onUser} onLogout={onLogout} />
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex min-h-0 flex-1 flex-col gap-0">
          <div className="px-5 pb-3">
            <TabsList className="w-full">
              <TabsTrigger value="buscar" aria-label="Buscar" className="group/tab"><SearchIcon /> <span className="hidden group-data-active/tab:inline">Buscar</span></TabsTrigger>
              <TabsTrigger value="resultados" aria-label="Resultados" className="group/tab">
                <List /> <span className="hidden group-data-active/tab:inline">Resultados</span>
                {search && <span className="rounded-full bg-pine px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums">{list.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="guardados" aria-label="Guardados" className="group/tab">
                <Heart /> <span className="hidden group-data-active/tab:inline">Guardados</span>
                {savedCount > 0 && <span className="rounded-full bg-rose/15 px-1.5 text-[11px] font-semibold text-rose tabular-nums">{savedCount}</span>}
              </TabsTrigger>
              <TabsTrigger value="historial" aria-label="Historial" className="group/tab">
                <HistoryIcon /> <span className="hidden group-data-active/tab:inline">Historial</span>
                {runningCount > 0 && <Loader2 className="animate-spin text-amber" />}
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-2">
            <TabsContent value="buscar">
              <SearchForm meta={meta} form={form} setForm={setForm} zones={zones} onRemoveZone={(i) => setZones((zs) => zs.filter((_, j) => j !== i))} onSubmit={submit} submitting={submitting} onSaveDefaults={saveDefaults} />
            </TabsContent>
            <TabsContent value="resultados" className="pb-8">
              <Results
                search={search}
                list={list}
                filters={filters}
                setFilters={setFilters}
                activeId={activeId}
                setActiveId={setActiveId}
                onLocate={locate}
                onCancel={() => search && api.cancel(search.id).catch((e) => toast.error(e.message))}
                onNewSearch={() => setTab("buscar")}
                saveButton={(r) => saveButton(r, { resultId: r.id })}
                onSaveFilters={saveFilters}
              />
            </TabsContent>
            <TabsContent value="guardados" className="pb-8">
              <Saved
                lists={lists}
                items={favorites}
                selectedId={listId}
                onSelect={setListId}
                onCreate={(n) => createList(n)}
                onRename={renameList}
                onDelete={deleteList}
                onLocate={(f) => locate({ ...f, id: -f.id })}
                saveButton={(f) => saveButton(f, { favoriteId: f.id })}
              />
            </TabsContent>
            <TabsContent value="historial" className="pb-8">
              <History
                items={history}
                currentId={search?.id ?? null}
                onOpen={(id) => open(id, true)}
                onRepeat={(s) => {
                  const { zones: z, ...rest } = s.params
                  setForm(rest)
                  setZones(z)
                  setTab("buscar")
                  setTimeout(() => mapApi.current?.fitZones(), 50)
                  toast("Búsqueda cargada. Cambia lo que quieras y pulsa Buscar.")
                }}
                onDelete={async (id) => {
                  await api.remove(id).catch((e) => toast.error(e.message))
                  if (search?.id === id) setSearch(null)
                  refreshHistory()
                  toast("Búsqueda borrada")
                }}
              />
            </TabsContent>
          </div>
        </Tabs>
      </aside>

      <main className="order-1 h-[46dvh] shrink-0 lg:order-2 lg:h-auto lg:flex-1">
        <MapView
          ref={mapApi}
          zones={zones}
          onAddZone={addZone}
          onRemoveZone={(i) => setZones((zs) => zs.filter((_, j) => j !== i))}
          onClearZones={() => setZones([])}
          onPresets={addPresets}
          // en Guardados el mapa enseña la lista elegida (id negativo para no chocar con los resultados)
          results={tab === "guardados" ? shownFavorites.map((f) => ({ ...f, id: -f.id })) : list}
          activeId={activeId}
          onPinClick={(id) => {
            setTab(id < 0 ? "guardados" : "resultados")
            setActiveId(id)
          }}
          origin={origin}
        />
      </main>
    </div>
  )
}
