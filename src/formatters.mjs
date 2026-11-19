function sanitize(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function bulletList(values) {
  const items = (values || []).map(sanitize).filter(Boolean);
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- N/A";
}

function buildChatbotContext(item) {
  const capacity = item.capacity || {};
  const lines = [
    `Proveedor: ${sanitize(item.provider)}`,
    `Titulo: ${sanitize(item.title) || "N/A"}`,
    item.propertyType ? `Tipo: ${sanitize(item.propertyType)}` : null,
    item.address ? `Direccion: ${sanitize(item.address)}` : null,
    item.geo?.latitude || item.geo?.longitude
      ? `Coordenadas: ${sanitize(item.geo?.latitude)}, ${sanitize(item.geo?.longitude)}`
      : null,
    item.price !== null && item.price !== undefined
      ? `Precio: ${sanitize(item.price)}${item.currency ? ` ${sanitize(item.currency)}` : ""}`
      : null,
    item.ratingValue !== null && item.ratingValue !== undefined ? `Rating: ${sanitize(item.ratingValue)}` : null,
    item.reviewCount !== null && item.reviewCount !== undefined ? `Reviews: ${sanitize(item.reviewCount)}` : null,
    capacity.guests || capacity.bedrooms || capacity.beds || capacity.bathrooms
      ? `Capacidad: ${[
          capacity.guests ? `${capacity.guests} viajeros` : null,
          capacity.bedrooms ? `${capacity.bedrooms} dormitorios` : null,
          capacity.beds ? `${capacity.beds} camas` : null,
          capacity.bathrooms ? `${capacity.bathrooms} banos` : null
        ].filter(Boolean).join(", ")}`
      : null,
    item.generalDescription ? `Descripcion general: ${sanitize(item.generalDescription)}` : item.description ? `Descripcion: ${sanitize(item.description)}` : null,
    item.highlights?.length ? `Puntos destacados: ${item.highlights.map(sanitize).join(", ")}` : null,
    item.outdoorFeatures?.length ? `Exterior y vistas: ${item.outdoorFeatures.map(sanitize).join(", ")}` : null,
    item.sleepingArrangement?.length
      ? `Distribucion para dormir: ${item.sleepingArrangement.map((room) => `${sanitize(room.room)}: ${(room.beds || []).map(sanitize).join(", ")}`).join(" | ")}`
      : null,
    item.roomOptions?.length
      ? `Opciones de alojamiento detectadas: ${item.roomOptions.map((room) => `${sanitize(room.name)}${room.max_guests ? `, hasta ${sanitize(room.max_guests)} personas` : ""}${room.bed_count ? `, ${sanitize(room.bed_count)} camas` : ""}${room.beds?.length ? ` (${room.beds.map(sanitize).join(", ")})` : ""}`).join(" | ")}`
      : null,
    item.amenities?.length ? `Servicios: ${item.amenities.map(sanitize).join(", ")}` : null,
    item.locationNotes?.length ? `Notas de ubicacion: ${item.locationNotes.map(sanitize).join(" ")}` : null,
    item.host?.description ? `Anfitrion: ${sanitize(item.host.description)}` : null,
    item.policies?.length ? `Normas y condiciones: ${item.policies.map(sanitize).join(" | ")}` : null,
    item.featuredReviews?.length ? `Comentarios destacados: ${item.featuredReviews.map(sanitize).join(" | ")}` : null,
    item.imageUrls?.length ? `Imagenes: ${item.imageUrls.map(sanitize).join(", ")}` : null,
    item.summary ? `Resumen: ${sanitize(item.summary)}` : null,
    item.status !== "ok" ? `Estado: ${sanitize(item.status)}` : null
  ].filter(Boolean);

  return lines.join("\n");
}

export function toMarkdown(results) {
  const blocks = results.map((item) => {
    const lines = [
      `## ${sanitize(item.title) || sanitize(item.url)}`,
      "",
      `- URL: ${sanitize(item.url)}`,
      `- Proveedor: ${sanitize(item.provider)}`,
      `- Estado: ${sanitize(item.status)}`,
      item.propertyType ? `- Tipo: ${sanitize(item.propertyType)}` : null,
      item.description ? `- Descripcion: ${sanitize(item.description)}` : null,
      item.generalDescription ? `- Descripcion general:\n${sanitize(item.generalDescription)}` : null,
      item.price !== null && item.price !== undefined
        ? `- Precio: ${sanitize(item.price)} ${sanitize(item.currency)}`
        : null,
      item.ratingValue !== null && item.ratingValue !== undefined ? `- Rating: ${sanitize(item.ratingValue)}` : null,
      item.reviewCount !== null && item.reviewCount !== undefined ? `- Reviews: ${sanitize(item.reviewCount)}` : null,
      item.capacity?.guests || item.capacity?.bedrooms || item.capacity?.beds || item.capacity?.bathrooms
        ? `- Capacidad: ${[
            item.capacity.guests ? `${sanitize(item.capacity.guests)} viajeros` : null,
            item.capacity.bedrooms ? `${sanitize(item.capacity.bedrooms)} dormitorios` : null,
            item.capacity.beds ? `${sanitize(item.capacity.beds)} camas` : null,
            item.capacity.bathrooms ? `${sanitize(item.capacity.bathrooms)} banos` : null
          ].filter(Boolean).join(", ")}`
        : null,
      item.address ? `- Direccion: ${sanitize(item.address)}` : null,
      item.geo?.latitude || item.geo?.longitude
        ? `- Geo: ${sanitize(item.geo?.latitude)}, ${sanitize(item.geo?.longitude)}`
        : null,
      item.highlights?.length ? `- Puntos destacados:\n${bulletList(item.highlights)}` : null,
      item.outdoorFeatures?.length ? `- Exterior y vistas:\n${bulletList(item.outdoorFeatures)}` : null,
      item.sleepingArrangement?.length
        ? `- Distribucion para dormir:\n${bulletList(item.sleepingArrangement.map((room) => `${room.room}: ${(room.beds || []).join(", ")}`))}`
        : null,
      item.roomOptions?.length
        ? `- Opciones detectadas:\n${bulletList(item.roomOptions.map((room) => `${room.name}${room.max_guests ? `, hasta ${room.max_guests} personas` : ""}${room.bed_count ? `, ${room.bed_count} camas` : ""}${room.beds?.length ? `: ${room.beds.join(", ")}` : ""}`))}`
        : null,
      item.imageUrls?.length ? `- Imagenes:\n${bulletList(item.imageUrls)}` : null,
      item.amenities?.length ? `- Amenities:\n${bulletList(item.amenities)}` : null,
      item.locationNotes?.length ? `- Ubicacion:\n${bulletList(item.locationNotes)}` : null,
      item.host?.description ? `- Anfitrion: ${sanitize(item.host.description)}` : null,
      item.policies?.length ? `- Normas:\n${bulletList(item.policies)}` : null,
      item.featuredReviews?.length ? `- Comentarios destacados:\n${bulletList(item.featuredReviews)}` : null,
      item.summary ? `- Resumen: ${sanitize(item.summary)}` : null,
      item.scrapedAt ? `- Scraped at: ${sanitize(item.scrapedAt)}` : null
    ].filter(Boolean);

    return lines.join("\n");
  });

  return [`# Listings`, "", ...blocks].join("\n\n");
}

export function buildChatbotExport(results) {
  return {
    schema_version: "2.0",
    generated_at: new Date().toISOString(),
    count: results.length,
    items: results.map((item) => ({
      id: `${item.provider}:${sanitize(item.title || item.url)}`.toLowerCase().replace(/\s+/g, "-"),
      source: {
        url: item.url,
        canonical_url: item.canonical || null,
        provider: item.provider,
        status: item.status
      },
      facts: {
        title: item.title || null,
        property_type: item.propertyType || null,
        description: item.description || null,
        address: item.address || null,
        geo: item.geo || null,
        price: item.price ?? null,
        currency: item.currency || null,
        rating: item.ratingValue ?? null,
        review_count: item.reviewCount ?? null,
        capacity: item.capacity || null,
        room_options: item.roomOptions || [],
        sleeping_arrangement: item.sleepingArrangement || [],
        apartment_profile: item.apartmentProfile || [],
        general_description: item.generalDescription || null,
        highlights: item.highlights || [],
        outdoor_features: item.outdoorFeatures || [],
        amenities: item.amenities || [],
        policies: item.policies || [],
        host: item.host || null,
        location_notes: item.locationNotes || [],
        featured_reviews: item.featuredReviews || [],
        image_urls: item.imageUrls || []
      },
      chatbot_context: buildChatbotContext(item),
      summary: item.summary || "",
      scraped_at: item.scrapedAt,
      error: item.error || null
    }))
  };
}
