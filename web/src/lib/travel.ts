import { useEffect, useState } from "react"

// Distancia y tiempo en coche desde el punto de salida hasta cada alojamiento.
// Primero la distancia en línea recta (instantánea) y luego la ruta real con OSRM (servidor público de demo:
// una petición por cada 80 alojamientos, y solo de los que aún no conocemos).
export type Travel = { km: number; minutes: number | null } // minutes null = solo línea recta
type Point = { lat: number | null; lng: number | null }
type Origin = { lat: number; lng: number }

const cache = new Map<string, Travel>()
const keyOf = (o: Origin, p: { lat: number; lng: number }) => `${o.lat.toFixed(3)},${o.lng.toFixed(3)}>${p.lat.toFixed(4)},${p.lng.toFixed(4)}`
const rad = (d: number) => (d * Math.PI) / 180
function straightKm(a: Origin, b: Origin) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export function travelKey(o: Origin, p: Point) {
  return p.lat == null || p.lng == null ? null : keyOf(o, { lat: p.lat, lng: p.lng })
}

export function useTravel(origin: Origin, points: Point[]) {
  const [, bump] = useState(0)
  const located = points.filter((p): p is { lat: number; lng: number } => p.lat != null && p.lng != null)
  const signature = located.map((p) => keyOf(origin, p)).join("|")

  useEffect(() => {
    let cancelled = false
    const pending = located.filter((p) => !cache.get(keyOf(origin, p))?.minutes)
    for (const p of pending) if (!cache.has(keyOf(origin, p))) cache.set(keyOf(origin, p), { km: straightKm(origin, p), minutes: null })
    bump((n) => n + 1)
    ;(async () => {
      for (let i = 0; i < pending.length && !cancelled; i += 80) {
        const chunk = pending.slice(i, i + 80)
        const coords = [origin, ...chunk].map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";")
        try {
          const r = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=duration,distance`)
          const j = await r.json()
          if (j.code !== "Ok") continue
          chunk.forEach((p, k) => {
            const sec = j.durations[0][k + 1]
            const m = j.distances[0][k + 1]
            if (sec != null && m != null) cache.set(keyOf(origin, p), { km: m / 1000, minutes: sec / 60 })
          })
          if (!cancelled) bump((n) => n + 1)
        } catch {
          // sin red o servidor caído: nos quedamos con la línea recta
        }
      }
    })()
    return () => void (cancelled = true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.lat, origin.lng, signature])

  return (p: Point) => {
    const k = travelKey(origin, p)
    return k ? cache.get(k) ?? null : null
  }
}

export function formatTravel(t: Travel) {
  const km = `${Math.round(t.km).toLocaleString("es-ES")} km`
  if (t.minutes == null) return `${km} en línea recta`
  const total = Math.round(t.minutes) // redondear antes de partir: 59,6 min es 1 h 0 min, no «0 h 60 min»
  const h = Math.floor(total / 60)
  const m = total % 60
  const time = h && !m ? `${h} h` : h ? `${h} h ${m} min` : `${m} min`
  return `${time} en coche · ${km}`
}
