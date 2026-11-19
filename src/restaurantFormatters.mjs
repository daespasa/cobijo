function sanitize(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function restaurantContext(restaurant) {
  return [
    `Nombre: ${sanitize(restaurant.name)}`,
    `Ciudad: ${sanitize(restaurant.city)}`,
    restaurant.rating ? `Valoracion: ${sanitize(restaurant.rating)} (${sanitize(restaurant.review_count)} reseñas)` : null,
    restaurant.price_range ? `Precio: ${sanitize(restaurant.price_range)}` : null,
    restaurant.category ? `Tipo: ${sanitize(restaurant.category)}` : null,
    restaurant.address ? `Direccion: ${sanitize(restaurant.address)}` : null,
    restaurant.distance_from_stop_km !== null && restaurant.distance_from_stop_km !== undefined
      ? `Distancia aprox. a la parada: ${sanitize(restaurant.distance_from_stop_km)} km`
      : null,
    restaurant.open_info ? `Horario visible: ${sanitize(restaurant.open_info)}` : null,
    restaurant.reservation_available ? "Reserva: aparece opcion de reservar mesa" : null,
    restaurant.review_snippet ? `Comentario destacado: ${sanitize(restaurant.review_snippet)}` : null,
    restaurant.url ? `Maps: ${sanitize(restaurant.url)}` : null
  ].filter(Boolean).join("\n");
}

export function buildRestaurantExport(results) {
  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    source: "google_maps_visible_results",
    route: "Camino de Santiago",
    count_stops: results.length,
    stops: results.map((stop) => ({
      city: stop.city,
      city_id: stop.city_id,
      status: stop.status,
      error: stop.error || null,
      restaurants: stop.restaurants.map((restaurant) => ({
        ...restaurant,
        chatbot_context: restaurantContext(restaurant)
      }))
    }))
  };
}

export function restaurantsToMarkdown(results) {
  const blocks = [];
  for (const stop of results) {
    blocks.push(`## ${sanitize(stop.city)}`);
    if (stop.error) blocks.push(`Error: ${sanitize(stop.error)}`);
    if (!stop.restaurants.length) {
      blocks.push("Sin restaurantes extraidos.");
      continue;
    }

    for (const restaurant of stop.restaurants) {
      blocks.push([
        `### ${sanitize(restaurant.name)}`,
        `- Valoracion: ${sanitize(restaurant.rating)} (${sanitize(restaurant.review_count)} reseñas)`,
        restaurant.price_range ? `- Precio: ${sanitize(restaurant.price_range)}` : null,
        restaurant.category ? `- Tipo: ${sanitize(restaurant.category)}` : null,
        restaurant.address ? `- Direccion: ${sanitize(restaurant.address)}` : null,
        restaurant.distance_from_stop_km !== null && restaurant.distance_from_stop_km !== undefined
          ? `- Distancia aprox. a la parada: ${sanitize(restaurant.distance_from_stop_km)} km`
          : null,
        restaurant.open_info ? `- Horario visible: ${sanitize(restaurant.open_info)}` : null,
        restaurant.reservation_available ? "- Reserva: aparece opcion de reservar mesa" : null,
        restaurant.review_snippet ? `- Comentario destacado: ${sanitize(restaurant.review_snippet)}` : null,
        restaurant.url ? `- Maps: ${sanitize(restaurant.url)}` : null
      ].filter(Boolean).join("\n"));
    }
  }

  return ["# Restaurantes Camino de Santiago", "", ...blocks].join("\n\n");
}
