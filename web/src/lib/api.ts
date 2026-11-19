export type LatLng = [number, number]
export type Zone =
  | { type: "polygon"; name: string; points: LatLng[] }
  | { type: "circle"; name: string; lat: number; lng: number; km: number }

export type Params = {
  checkin: string
  checkout: string
  adults: number
  bedrooms: number
  pets: number
  maxPerPersonNight: number
  pages: number
  amenities: string[]
  providers: ("booking" | "airbnb")[]
  freeCancellation?: boolean
  zones: Zone[]
}

export type Result = {
  id: number
  zone: string
  provider: "booking" | "airbnb"
  url: string
  title: string
  location: string | null
  total_price: number | null
  per_person_night: number | null
  private_rooms: number | null
  bathrooms: number | null
  beds: number | null
  rating: number | null
  reviews: number | null
  fits_budget: 0 | 1
  fits_privacy: 0 | 1
  lat: number | null
  lng: number | null
  free_cancellation: 0 | 1 | null
  is_new: 0 | 1 | null
  guest_favorite: 0 | 1 | null
}

export type Status = "queued" | "running" | "done" | "cancelled" | "error"
export type Search = {
  id: number
  created_at: string
  params: Params
  status: Status
  progress: string | null
  error: string | null
  failures: { zone: string; provider: string; error: string; searchUrl?: string }[]
  results: Result[]
}
export type SearchSummary = Omit<Search, "results" | "failures"> & { total: number; fitting: number }
export type Meta = {
  defaults: Omit<Params, "zones">
  origin: { name: string; lat: number; lng: number }
  presets: { name: string; hours: number; lat: number; lng: number }[]
  amenities: { key: string; label: string; only: "booking" | "airbnb" | null }[]
}

export type Filters = { max: number; privacy: boolean; freeOnly: boolean; minRating: number; provider: string; sort: string }
export type Prefs = {
  origin?: { name: string; lat: number; lng: number }
  form?: Omit<Params, "zones">
  filters?: Omit<Filters, "max">
}
export type User = { username: string; name: string; prefs: Prefs; createdAt: string; lastLoginAt: string | null; sessionExpiresAt: string }
export type Favorite = Omit<Result, "id"> & { id: number; list_id: number; created_at: string }
export type SavedList = { id: number; name: string; count: number; created_at: string }
// de dónde se copia al guardar: un resultado de búsqueda o un alojamiento ya guardado en otra lista
export type SaveSource = { resultId: number } | { favoriteId: number }

// si la sesión caduca en mitad del uso, la app vuelve a la pantalla de entrada
let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn: () => void) => void (onUnauthorized = fn)

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: { "content-type": "application/json" }, ...init })
  const body = await r.json().catch(() => ({}))
  if (r.status === 401 && url !== "/api/login" && url !== "/api/me") onUnauthorized()
  if (!r.ok) throw Object.assign(new Error((body.errors ?? ["Error del servidor"]).join(" · ")), { status: r.status })
  return body
}

export const api = {
  me: () => call<User>("/api/me"),
  login: (username: string, password: string) => call<User>("/api/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => call("/api/logout", { method: "POST" }),
  updateMe: (body: { name?: string; prefs?: Prefs; reset?: boolean }) => call<User>("/api/me", { method: "PUT", body: JSON.stringify(body) }),
  changePassword: (current: string, next: string) => call("/api/me/password", { method: "POST", body: JSON.stringify({ current, next }) }),
  favorites: () => call<Favorite[]>("/api/favorites"),
  addFavorite: (listId: number, source: SaveSource) => call<Favorite>("/api/favorites", { method: "POST", body: JSON.stringify({ listId, ...source }) }),
  lists: () => call<SavedList[]>("/api/lists"),
  createList: (name: string) => call<SavedList>("/api/lists", { method: "POST", body: JSON.stringify({ name }) }),
  renameList: (id: number, name: string) => call<SavedList>(`/api/lists/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteList: (id: number) => call(`/api/lists/${id}`, { method: "DELETE" }),
  removeFavorite: (id: number) => call(`/api/favorites/${id}`, { method: "DELETE" }),
  meta: () => call<Meta>("/api/meta"),
  list: () => call<SearchSummary[]>("/api/searches"),
  get: (id: number) => call<Search>(`/api/searches/${id}`),
  create: (p: Params) => call<{ id: number }>("/api/searches", { method: "POST", body: JSON.stringify(p) }),
  cancel: (id: number) => call(`/api/searches/${id}/cancel`, { method: "POST" }),
  remove: (id: number) => call(`/api/searches/${id}`, { method: "DELETE" }),
}

export const active = (s?: { status: Status } | null) => !!s && (s.status === "queued" || s.status === "running")
export const nights = (p: Pick<Params, "checkin" | "checkout">) =>
  Math.max(0, Math.round((Date.parse(p.checkout) - Date.parse(p.checkin)) / 86400000))
export const eur = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : n.toLocaleString("es-ES", { maximumFractionDigits: digits }) + " €"

// Nominatim (OpenStreetMap): solo cuando el usuario busca un lugar o cierra una zona
const osm = (path: string) => fetch(`https://nominatim.openstreetmap.org/${path}&format=jsonv2&accept-language=es`).then((r) => r.json())
export async function geocode(q: string) {
  const [r] = await osm(`search?q=${encodeURIComponent(q)}&limit=1`)
  return r ? { name: r.name as string, lat: Number(r.lat), lng: Number(r.lon) } : null
}
export async function placeName(lat: number, lng: number) {
  const a = (await osm(`reverse?lat=${lat}&lon=${lng}&zoom=10`).catch(() => ({})))?.address ?? {}
  return (a.city || a.town || a.village || a.municipality || a.county || null) as string | null
}
