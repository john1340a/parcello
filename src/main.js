import maplibregl from 'maplibre-gl';

/* ── Constants ──────────────────────────────────── */
const PLANET_TILE_URL_TEMPLATE =
  'https://tiles.planet.com/basemaps/v1/planet-tiles/{quad}/gmap/{z}/{x}/{y}?api_key={apiKey}';

const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const SOURCE_ID = 'parcelles';
const LAYER_FILL = 'parcelles-fill';
const LAYER_OUTLINE = 'parcelles-outline';
const LAYER_LABEL = 'parcelles-label';

/* ── State ───────────────────────────────────────── */
let map;
let currentApiKey = '';
let geojsonData = null;

/* ── Map Initialisation ──────────────────────────── */
function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: OSM_STYLE,
    center: [2.3, 46.7], // France
    zoom: 5,
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-right');
  map.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    }),
    'top-right',
  );
  map.addControl(new maplibregl.FullscreenControl(), 'top-right');

  map.on('load', () => {
    if (geojsonData) addParcelsToMap();
  });

  map.on('click', LAYER_FILL, (e) => {
    const props = e.features[0]?.properties ?? {};
    showFeatureInfo(props);
  });

  map.on('mouseenter', LAYER_FILL, () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', LAYER_FILL, () => {
    map.getCanvas().style.cursor = '';
  });
}

/* ── Planet Basemap ──────────────────────────────── */
function buildPlanetStyle(quad, apiKey) {
  const tilesUrl = PLANET_TILE_URL_TEMPLATE.replace('{quad}', quad).replace('{apiKey}', apiKey);
  return {
    version: 8,
    sources: {
      planet: {
        type: 'raster',
        tiles: [tilesUrl],
        tileSize: 256,
        attribution: '© Planet Labs PBC',
        maxzoom: 18,
      },
    },
    layers: [{ id: 'planet', type: 'raster', source: 'planet' }],
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

  map.once('styledata', () => {
    map.jumpTo({ center, zoom, bearing, pitch });
    if (hadParcels) addParcelsToMap();
  });
}

function updateBasemap() {
  const quad = document.getElementById('planetQuad').value;
  const apiKey = currentApiKey;

  if (quad === '__osm__') {
    document.getElementById('planetAttrib').hidden = true;
    applyBasemap(OSM_STYLE);
    return;
  }

  if (!apiKey) {
    showNotification('⚠️ Veuillez saisir votre clé API Planet pour utiliser le fond satellite.', 'warn');
    document.getElementById('planetQuad').value = '__osm__';
    document.getElementById('planetAttrib').hidden = true;
    applyBasemap(OSM_STYLE);
    return;
  }

  document.getElementById('planetAttrib').hidden = false;
  applyBasemap(buildPlanetStyle(quad, apiKey));
}

/* ── Parcel Layer ────────────────────────────────── */
function addParcelsToMap() {
  if (!geojsonData) return;

  // Remove old layers/source if they exist
  [LAYER_LABEL, LAYER_OUTLINE, LAYER_FILL].forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);

  map.addSource(SOURCE_ID, { type: 'geojson', data: geojsonData });

  map.addLayer({
    id: LAYER_FILL,
    type: 'fill',
    source: SOURCE_ID,
    paint: {
      'fill-color': '#4f7cff',
      'fill-opacity': 0.3,
    },
  });

  map.addLayer({
    id: LAYER_OUTLINE,
    type: 'line',
    source: SOURCE_ID,
    paint: {
      'line-color': '#a0b4ff',
      'line-width': 2,
    },
  });

  map.addLayer({
    id: LAYER_LABEL,
    type: 'symbol',
    source: SOURCE_ID,
    layout: {
      'text-field': ['coalesce', ['get', 'nom'], ['get', 'name'], ['get', 'label'], ['get', 'id'], ''],
      'text-size': 12,
      'text-font': ['Open Sans Regular'],
      'text-anchor': 'center',
      'text-max-width': 8,
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': '#000000',
      'text-halo-width': 1.5,
    },
  });

  document.getElementById('layerControls').hidden = false;
  syncToggleStates();
}

function removeParcelLayer() {
  [LAYER_LABEL, LAYER_OUTLINE, LAYER_FILL].forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);

  geojsonData = null;
  document.getElementById('layerControls').hidden = true;
  document.getElementById('featureInfo').hidden = true;
  document.getElementById('fileInfo').textContent = '';
  document.getElementById('dropLabel').innerHTML =
    '📂 Glissez un fichier GeoJSON<br />ou cliquez pour parcourir';
}

function zoomToLayer() {
  if (!geojsonData) return;

  const coords = [];
  const collect = (geom) => {
    if (!geom) return;
    if (geom.type === 'Point') {
      coords.push(geom.coordinates);
    } else if (geom.type === 'MultiPoint' || geom.type === 'LineString') {
      coords.push(...geom.coordinates);
    } else if (geom.type === 'MultiLineString' || geom.type === 'Polygon') {
      geom.coordinates.forEach((ring) => coords.push(...ring));
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach((poly) => poly.forEach((ring) => coords.push(...ring)));
    } else if (geom.type === 'GeometryCollection') {
      geom.geometries.forEach(collect);
    }
  };

  const features =
    geojsonData.type === 'FeatureCollection'
      ? geojsonData.features
      : [geojsonData];

  features.forEach((f) => collect(f.geometry ?? f));

  if (!coords.length) return;

  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const bounds = [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];

  map.fitBounds(bounds, { padding: 60, maxZoom: 18 });
}

/* ── Feature Info ────────────────────────────────── */
function showFeatureInfo(props) {
  const section = document.getElementById('featureInfo');
  const container = document.getElementById('featureProps');

  const entries = Object.entries(props);
  if (!entries.length) {
    container.textContent = 'Aucune propriété.';
  } else {
    const rows = entries
      .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`)
      .join('');
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
        data.type === 'FeatureCollection'
          ? data.features.length
          : 1;

      document.getElementById('fileInfo').textContent =
        `✅ ${file.name} — ${count} entité(s) chargée(s)`;
      document.getElementById('dropLabel').textContent = `📌 ${file.name}`;

      if (map.loaded()) {
        addParcelsToMap();
        zoomToLayer();
      }
    } catch (err) {
      showNotification(`❌ Fichier invalide : ${err.message}`, 'error');
    }
  };
  reader.readAsText(file);
}

function validateGeoJSON(data) {
  const allowed = [
    'FeatureCollection',
    'Feature',
    'Point',
    'MultiPoint',
    'LineString',
    'MultiLineString',
    'Polygon',
    'MultiPolygon',
    'GeometryCollection',
  ];
  if (!data || !allowed.includes(data.type)) {
    throw new Error(`Type GeoJSON non reconnu : "${data?.type}"`);
  }
}

/* ── Layer Toggle Helpers ────────────────────────── */
function syncToggleStates() {
  setLayerVisibility(LAYER_FILL, document.getElementById('toggleFill').checked);
  setLayerVisibility(LAYER_OUTLINE, document.getElementById('toggleOutline').checked);
  setLayerVisibility(LAYER_LABEL, document.getElementById('toggleLabels').checked);
  setFillOpacity(document.getElementById('fillOpacity').value);
}

function setLayerVisibility(layerId, visible) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
  }
}

function setFillOpacity(value) {
  if (map.getLayer(LAYER_FILL)) {
    map.setPaintProperty(LAYER_FILL, 'fill-opacity', Number(value) / 100);
  }
}

/* ── Notification ────────────────────────────────── */
function showNotification(message, type = 'info') {
  const existing = document.getElementById('notification');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'notification';
  el.textContent = message;
  el.style.cssText = `
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === 'error' ? '#e05252' : type === 'warn' ? '#d97706' : '#4f7cff'};
    color: #fff;
    padding: 0.6rem 1.2rem;
    border-radius: 8px;
    font-size: 0.85rem;
    z-index: 9999;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    max-width: 420px;
    text-align: center;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/* ── Utilities ───────────────────────────────────── */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── Event Wiring ────────────────────────────────── */
function wireEvents() {
  /* API key */
  document.getElementById('applyApiKey').addEventListener('click', () => {
    currentApiKey = document.getElementById('apiKey').value.trim();
    if (!currentApiKey) {
      showNotification('⚠️ Veuillez entrer une clé API valide.', 'warn');
      return;
    }
    updateBasemap();
    showNotification('✅ Clé API appliquée. Chargement du fond satellite…');
  });

  document.getElementById('apiKey').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('applyApiKey').click();
  });

  /* Basemap selector */
  document.getElementById('planetQuad').addEventListener('change', updateBasemap);

  /* File drop zone */
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('geojsonFile');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) loadGeojsonFile(file);
  });

  fileInput.addEventListener('change', () => {
    loadGeojsonFile(fileInput.files[0]);
    fileInput.value = '';
  });

  /* Layer controls */
  document.getElementById('toggleFill').addEventListener('change', (e) =>
    setLayerVisibility(LAYER_FILL, e.target.checked),
  );
  document.getElementById('toggleOutline').addEventListener('change', (e) =>
    setLayerVisibility(LAYER_OUTLINE, e.target.checked),
  );
  document.getElementById('toggleLabels').addEventListener('change', (e) =>
    setLayerVisibility(LAYER_LABEL, e.target.checked),
  );
  document.getElementById('fillOpacity').addEventListener('input', (e) =>
    setFillOpacity(e.target.value),
  );

  document.getElementById('clearLayer').addEventListener('click', removeParcelLayer);
  document.getElementById('zoomToLayer').addEventListener('click', zoomToLayer);
}

/* ── Bootstrap ───────────────────────────────────── */
initMap();
wireEvents();
