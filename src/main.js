import maplibregl from "maplibre-gl";

const PLANET_TILE_URL_TEMPLATE =
  "https://tiles0.planet.com/data/v1/PSScene/{item_id}/{z}/{x}/{y}.png?api_key={apiKey}";

const JAWG_STYLE_URL = `https://api.jawg.io/styles/jawg-streets.json?access-token=${import.meta.env.VITE_JAWG_API_KEY}`;

const SOURCE_ID = "parcelles";
const LAYER_FILL = "parcelles-fill";
const LAYER_OUTLINE = "parcelles-outline";
const LAYER_LABEL = "parcelles-label";

/* ── State ───────────────────────────────────────── */
let map;
let geojsonData = null;

/* ── Map Initialisation ──────────────────────────── */
function initMap() {
  map = new maplibregl.Map({
    container: "map",
    style: JAWG_STYLE_URL,
    center: [2.3, 46.7], // France
    zoom: 5,
  });

  map.addControl(new maplibregl.NavigationControl(), "top-right");
  map.addControl(
    new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }),
    "bottom-right",
  );
  map.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    }),
    "top-right",
  );
  map.addControl(new maplibregl.FullscreenControl(), "top-right");

  map.on("load", () => {
    if (geojsonData) addParcelsToMap();
  });

  map.on("click", LAYER_FILL, (e) => {
    const props = e.features[0]?.properties ?? {};
    showFeatureInfo(props);
  });

  map.on("mouseenter", LAYER_FILL, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", LAYER_FILL, () => {
    map.getCanvas().style.cursor = "";
  });
}

/* ── Planet Basemap & API ────────────────────────── */
function buildPlanetStyle(itemId, apiKey) {
  const tilesUrl = PLANET_TILE_URL_TEMPLATE.replace(
    "{item_id}",
    itemId,
  ).replace("{apiKey}", apiKey);
  return {
    version: 8,
    sources: {
      planet: {
        type: "raster",
        tiles: [tilesUrl],
        tileSize: 256,
        attribution: "© Planet Labs PBC",
        maxzoom: 18,
      },
    },
    layers: [{ id: "planet", type: "raster", source: "planet" }],
  };
}

/**
 * Re-apply the current style while preserving existing parcel layers.
 */
function applyBasemap(style) {
  const hadParcels = geojsonData !== null;

  // Preserve the viewport
  const center = map.getCenter();
  const zoom = map.getZoom();
  const bearing = map.getBearing();
  const pitch = map.getPitch();

  map.setStyle(style);

  map.once("styledata", () => {
    map.jumpTo({ center, zoom, bearing, pitch });
    if (hadParcels) addParcelsToMap();
  });
}

function updateBasemap() {
  const itemId = document.getElementById("planetImageSelect").value;
  const apiKey = import.meta.env.VITE_PLANET_API_KEY;

  if (itemId === "__osm__") {
    applyBasemap(JAWG_STYLE_URL);
    return;
  }

  if (!apiKey) {
    showNotification(
      "Clé API Planet introuvable. Affichage de Jawg Maps.",
      "warn",
    );
    document.getElementById("planetImageSelect").value = "__osm__";
    applyBasemap(JAWG_STYLE_URL);
    return;
  }

  applyBasemap(buildPlanetStyle(itemId, apiKey));
}

/* ── Utilities ───────────────────────────────────── */
function getGeoJSONBounds(geoJson) {
  const coords = [];
  const collect = (geom) => {
    if (!geom) return;
    if (geom.type === "Point") {
      coords.push(geom.coordinates);
    } else if (geom.type === "MultiPoint" || geom.type === "LineString") {
      coords.push(...geom.coordinates);
    } else if (geom.type === "MultiLineString" || geom.type === "Polygon") {
      geom.coordinates.forEach((ring) => coords.push(...ring));
    } else if (geom.type === "MultiPolygon") {
      geom.coordinates.forEach((poly) =>
        poly.forEach((ring) => ring.forEach((c) => coords.push(c))),
      );
    } else if (geom.type === "GeometryCollection") {
      geom.geometries.forEach(collect);
    }
  };

  const features =
    geoJson.type === "FeatureCollection" ? geoJson.features : [geoJson];
  features.forEach((f) => collect(f.geometry ?? f));

  if (coords.length === 0) return null;

  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

async function searchPlanetImages(geoJson) {
  const apiKey = import.meta.env.VITE_PLANET_API_KEY;
  if (!apiKey) return;

  const bounds = getGeoJSONBounds(geoJson);
  if (!bounds) return;

  // For Planet API (Polygon coordinates): [[minLon, minLat], [maxLon, minLat], ...]
  const planetBoundsCoords = [
    [bounds[0][0], bounds[0][1]],
    [bounds[1][0], bounds[0][1]],
    [bounds[1][0], bounds[1][1]],
    [bounds[0][0], bounds[1][1]],
    [bounds[0][0], bounds[0][1]],
  ];

  const hintEl = document.getElementById("planetSearchHint");
  const selectEl = document.getElementById("planetImageSelect");

  hintEl.textContent = "Recherche d'images satellites en cours...";
  hintEl.style.color = "#4f7cff";

  // Format dates: past 3 months
  const now = new Date();
  const past3Months = new Date();
  past3Months.setMonth(now.getMonth() - 3);

  const payload = {
    item_types: ["PSScene"],
    filter: {
      type: "AndFilter",
      config: [
        {
          type: "GeometryFilter",
          field_name: "geometry",
          config: {
            type: "Polygon",
            coordinates: [planetBoundsCoords],
          },
        },
        {
          type: "DateRangeFilter",
          field_name: "acquired",
          config: {
            gte: past3Months.toISOString(),
            lte: now.toISOString(),
          },
        },
        {
          type: "RangeFilter",
          field_name: "cloud_cover",
          config: { lte: 0.2 }, // <= 20% clouds
        },
      ],
    },
  };

  try {
    const response = await fetch(
      "https://api.planet.com/data/v1/quick-search",
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(apiKey + ":"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok)
      throw new Error("Erreur de l'API Planet : " + response.statusText);

    const data = await response.json();
    const features = data.features || [];

    // Clear old options except OSM
    selectEl.innerHTML = `<option value="__osm__">OpenStreetMap</option>`;

    if (features.length === 0) {
      hintEl.textContent =
        "Aucune image récente peu nuageuse trouvée sur cette zone.";
      hintEl.style.color = "#d97706";
      updateBasemap(); // Revert to OSM
      return;
    }

    // Add found items
    features.forEach((f) => {
      const date = new Date(f.properties.acquired).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const clouds = Math.round((f.properties.cloud_cover || 0) * 100);
      const option = document.createElement("option");
      option.value = f.id;
      option.textContent = `${date} (${clouds}% nuages)`;
      selectEl.appendChild(option);
    });

    hintEl.textContent = `${features.length} image(s) trouvée(s).`;
    hintEl.style.color = "#10b981";
    selectEl.disabled = false;

    // Select first (most recent usually)
    selectEl.value = features[0].id;
    updateBasemap();
    showNotification("Image satellite appliquée avec succès.");
  } catch (err) {
    console.error(err);
    hintEl.textContent = "Erreur lors de la recherche Planet.";
    hintEl.style.color = "#e05252";
    updateBasemap();
  }
}

/* ── Parcel Layer ────────────────────────────────── */
function addParcelsToMap() {
  if (!geojsonData) return;

  // Remove old layers/source if they exist
  [LAYER_LABEL, LAYER_OUTLINE, LAYER_FILL].forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);

  map.addSource(SOURCE_ID, { type: "geojson", data: geojsonData });

  map.addLayer({
    id: LAYER_FILL,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color": "#4f7cff",
      "fill-opacity": 0.3,
    },
  });

  map.addLayer({
    id: LAYER_OUTLINE,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": "#a0b4ff",
      "line-width": 2,
    },
  });

  map.addLayer({
    id: LAYER_LABEL,
    type: "symbol",
    source: SOURCE_ID,
    layout: {
      "text-field": [
        "coalesce",
        ["get", "nom"],
        ["get", "name"],
        ["get", "label"],
        ["get", "id"],
        "",
      ],
      "text-size": 12,
      "text-font": ["Open Sans Regular"],
      "text-anchor": "center",
      "text-max-width": 8,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "#000000",
      "text-halo-width": 1.5,
    },
  });

  document.getElementById("layerControls").hidden = false;
  syncToggleStates();
}

function removeParcelLayer() {
  [LAYER_LABEL, LAYER_OUTLINE, LAYER_FILL].forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);

  geojsonData = null;
  const selectEl = document.getElementById("planetImageSelect");
  selectEl.innerHTML = `<option value="__osm__">Jawg Street (par défaut)</option>`;
  selectEl.value = "__osm__";
  selectEl.disabled = true;
  document.getElementById("planetSearchHint").textContent =
    "Glissez un GeoJSON pour rechercher des images satellites récentes.";
  document.getElementById("planetSearchHint").style.color = "";

  updateBasemap();

  document.getElementById("layerControls").hidden = true;
  document.getElementById("featureInfo").hidden = true;
  document.getElementById("fileInfo").textContent = "";
  document.getElementById("dropLabel").innerHTML =
    '<span class="material-symbols-outlined" style="font-size: 2rem; display: block; margin-bottom: 0.5rem">upload_file</span>Glissez un fichier GeoJSON<br />ou cliquez pour parcourir';
}

function zoomToLayer() {
  const bounds = getGeoJSONBounds(geojsonData);
  if (bounds) {
    map.fitBounds(bounds, { padding: 60, maxZoom: 18 });
  }
}

/* ── Feature Info ────────────────────────────────── */
function showFeatureInfo(props) {
  const section = document.getElementById("featureInfo");
  const container = document.getElementById("featureProps");

  const entries = Object.entries(props);
  if (!entries.length) {
    container.textContent = "Aucune propriété.";
  } else {
    const rows = entries
      .map(
        ([k, v]) =>
          `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`,
      )
      .join("");
    container.innerHTML = `<table>${rows}</table>`;
  }

  section.hidden = false;
}

/* ── GeoJSON Loading ─────────────────────────────── */
function loadGeojsonFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      validateGeoJSON(data);
      geojsonData = data;

      const count =
        data.type === "FeatureCollection" ? data.features.length : 1;

      document.getElementById("fileInfo").innerHTML =
        `<span class="material-symbols-outlined" style="font-size: 1rem; vertical-align: middle">check_circle</span> ${file.name} — ${count} entité(s) chargée(s)`;
      document.getElementById("dropLabel").innerHTML =
        `<span class="material-symbols-outlined" style="vertical-align: middle">push_pin</span> ${file.name}`;

      if (map.loaded()) {
        addParcelsToMap();
        zoomToLayer();
        searchPlanetImages(data);
      }
    } catch (err) {
      showNotification(`Fichier invalide : ${err.message}`, "error");
    }
  };
  reader.readAsText(file);
}

function validateGeoJSON(data) {
  const allowed = [
    "FeatureCollection",
    "Feature",
    "Point",
    "MultiPoint",
    "LineString",
    "MultiLineString",
    "Polygon",
    "MultiPolygon",
    "GeometryCollection",
  ];
  if (!data || !allowed.includes(data.type)) {
    throw new Error(`Type GeoJSON non reconnu : "${data?.type}"`);
  }
}

/* ── Layer Toggle Helpers ────────────────────────── */
function syncToggleStates() {
  setLayerVisibility(LAYER_FILL, document.getElementById("toggleFill").checked);
  setLayerVisibility(
    LAYER_OUTLINE,
    document.getElementById("toggleOutline").checked,
  );
  setLayerVisibility(
    LAYER_LABEL,
    document.getElementById("toggleLabels").checked,
  );
  setFillOpacity(document.getElementById("fillOpacity").value);
}

function setLayerVisibility(layerId, visible) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }
}

function setFillOpacity(value) {
  if (map.getLayer(LAYER_FILL)) {
    map.setPaintProperty(LAYER_FILL, "fill-opacity", Number(value) / 100);
  }
}

/* ── Notification ────────────────────────────────── */
function showNotification(message, type = "info") {
  const existing = document.getElementById("notification");
  if (existing) existing.remove();

  const icons = {
    info: "info",
    warn: "warning",
    error: "error",
  };

  const el = document.createElement("div");
  el.id = "notification";
  el.innerHTML = `
    <span class="material-symbols-outlined" style="font-size: 1.2rem; vertical-align: middle; margin-right: 0.5rem">${icons[type] || "info"}</span>
    <span style="vertical-align: middle">${message}</span>
  `;
  el.style.cssText = `
    position: fixed;
    top: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === "error" ? "#e05252" : type === "warn" ? "#d97706" : "#4f7cff"};
    color: #fff;
    padding: 0.75rem 1.5rem;
    border-radius: 12px;
    font-size: 0.9rem;
    font-weight: 600;
    z-index: 9999;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    max-width: 90vw;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/* ── Utilities ───────────────────────────────────── */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ── Event Wiring ────────────────────────────────── */
function wireEvents() {
  /* Basemap selector */
  document
    .getElementById("planetImageSelect")
    .addEventListener("change", updateBasemap);

  /* File drop zone */
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("geojsonFile");

  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") fileInput.click();
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () =>
    dropZone.classList.remove("drag-over"),
  );
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) loadGeojsonFile(file);
  });

  fileInput.addEventListener("change", () => {
    loadGeojsonFile(fileInput.files[0]);
    fileInput.value = "";
  });

  /* Layer controls */
  document
    .getElementById("toggleFill")
    .addEventListener("change", (e) =>
      setLayerVisibility(LAYER_FILL, e.target.checked),
    );
  document
    .getElementById("toggleOutline")
    .addEventListener("change", (e) =>
      setLayerVisibility(LAYER_OUTLINE, e.target.checked),
    );
  document
    .getElementById("toggleLabels")
    .addEventListener("change", (e) =>
      setLayerVisibility(LAYER_LABEL, e.target.checked),
    );
  document
    .getElementById("fillOpacity")
    .addEventListener("input", (e) => setFillOpacity(e.target.value));

  document
    .getElementById("clearLayer")
    .addEventListener("click", removeParcelLayer);
  document.getElementById("zoomToLayer").addEventListener("click", zoomToLayer);

  /* Responsive Sidebar Toggle */
  const menuToggle = document.getElementById("menuToggle");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  const toggleSidebar = () => {
    document.body.classList.toggle("sidebar-open");
    // Force map resize after transition
    setTimeout(() => map.resize(), 350);
  };

  menuToggle.addEventListener("click", toggleSidebar);
  sidebarOverlay.addEventListener("click", toggleSidebar);
}

/* ── Bootstrap ───────────────────────────────────── */
initMap();
wireEvents();
