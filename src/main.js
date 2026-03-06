import maplibregl from "maplibre-gl";

const PLANET_TILE_URL_TEMPLATE =
  "https://tiles0.planet.com/data/v1/PSScene/{item_id}/{z}/{x}/{y}.png?api_key={apiKey}";

const JAWG_STYLE_URL = `https://api.jawg.io/styles/jawg-streets.json?access-token=${import.meta.env.VITE_JAWG_API_KEY}`;
const ESRI_SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const SOURCE_ID = "parcelles";
const LAYER_FILL = "parcelles-fill";
const LAYER_OUTLINE = "parcelles-outline";
const LAYER_LABEL = "parcelles-label";

/* ── State ───────────────────────────────────────── */
let map;
let geojsonData = null;
let currentPlanetOpacity = 1;

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

  map.on("load", () => {
    if (geojsonData) addParcelsToMap();
  });
}

/* ── Planet Basemap & API ────────────────────────── */
function updateBasemap() {
  const itemId = document.getElementById("planetImageSelect").value;
  const apiKey = import.meta.env.VITE_PLANET_API_KEY;
  const opacityContainer = document.getElementById("planetOpacityContainer");

  if (itemId === "__osm__") {
    if (opacityContainer) opacityContainer.style.display = "none";
    if (map.getLayer("planet-overlay")) map.removeLayer("planet-overlay");
    if (map.getSource("planet")) map.removeSource("planet");
    if (map.getLayer("esri-basemap")) map.removeLayer("esri-basemap");
    if (map.getSource("esri")) map.removeSource("esri");
    return;
  }

  if (opacityContainer) opacityContainer.style.display = "block";

  if (!apiKey) {
    showNotification(
      "Clé API Planet introuvable. Affichage de Jawg Maps.",
      "warn",
    );
    document.getElementById("planetImageSelect").value = "__osm__";
    updateBasemap();
    return;
  }

  const tilesUrl = PLANET_TILE_URL_TEMPLATE.replace(
    "{item_id}",
    itemId,
  ).replace("{apiKey}", apiKey);

  if (!map.getSource("esri")) {
    map.addSource("esri", {
      type: "raster",
      tiles: [ESRI_SATELLITE_URL],
      tileSize: 256,
      attribution: "© Esri, Maxar, Earthstar Geographics, etc.",
      maxzoom: 19,
    });
  }

  const beforeId = map.getLayer(LAYER_FILL) ? LAYER_FILL : undefined;

  if (!map.getLayer("esri-basemap")) {
    map.addLayer(
      { id: "esri-basemap", type: "raster", source: "esri" },
      beforeId,
    );
  }

  if (map.getLayer("planet-overlay")) map.removeLayer("planet-overlay");
  if (map.getSource("planet")) map.removeSource("planet");

  map.addSource("planet", {
    type: "raster",
    tiles: [tilesUrl],
    tileSize: 256,
    attribution: "© Planet Labs PBC",
    maxzoom: 18,
  });

  map.addLayer(
    {
      id: "planet-overlay",
      type: "raster",
      source: "planet",
      paint: {
        "raster-opacity": currentPlanetOpacity,
      },
    },
    beforeId,
  );
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
    // Clear old options except the base style
    selectEl.innerHTML = `<option value="__osm__">Jawg Street</option>`;

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

  // Re-attach interactions (listeners are lost when layers are removed/re-added during style changes)
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
  return new Promise((resolve) => {
    const bounds = getGeoJSONBounds(geojsonData);
    if (!bounds) {
      resolve();
      return;
    }

    // If map is already moving, wait or handle? Usually just fitBounds
    map.once("moveend", () => resolve());
    map.fitBounds(bounds, { padding: 60, maxZoom: 18 });

    // Fallback if 'moveend' doesn't fire for some reason
    setTimeout(resolve, 3000);
  });
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
async function loadGeojsonFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
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
        // Wait for zoom to finish BEFORE searching Planet images
        await zoomToLayer();
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
  el.setAttribute("data-type", type);
  el.innerHTML = `
    <div class="icon-wrapper">
      <span class="material-symbols-outlined" style="font-size: 1.25rem;">${icons[type] || "info"}</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 0.25rem;">
      <span style="font-weight: 600;">${type === "error" ? "Erreur" : type === "warn" ? "Attention" : "Information"}</span>
      <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 400;">${message}</span>
    </div>
  `;

  document.body.appendChild(el);

  // Trigger animation after next repaint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.add("show");
    });
  });

  setTimeout(() => {
    el.classList.remove("show");
    el.classList.add("hide");
    setTimeout(() => el.remove(), 300); // Wait for transition to finish
  }, 4000);
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

  /* Planet Opacity Control */
  const planetOpacityEl = document.getElementById("planetOpacity");
  if (planetOpacityEl) {
    planetOpacityEl.addEventListener("input", (e) => {
      currentPlanetOpacity = parseFloat(e.target.value);
      if (map && map.getLayer("planet-overlay")) {
        map.setPaintProperty(
          "planet-overlay",
          "raster-opacity",
          currentPlanetOpacity,
        );
      }
    });
  }

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
