'use strict';

// ── Sample data ──────────────────────────────────────────────────────────────
const STATUSES = ['active', 'fallow', 'harvest'];
const STATUS_LABELS = { active: 'Active', fallow: 'Jachère', harvest: 'Récolte' };
const CROPS = ['Blé', 'Maïs', 'Colza', 'Tournesol', 'Orge', 'Soja', 'Betterave', 'Pomme de terre'];

function seedRng(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function generateParcels(count = 18) {
  const rng = seedRng(42);
  const parcels = [];
  for (let i = 0; i < count; i++) {
    const status = STATUSES[Math.floor(rng() * STATUSES.length)];
    const area   = +(2 + rng() * 48).toFixed(1);
    const crop   = CROPS[Math.floor(rng() * CROPS.length)];
    const yield_ = status === 'harvest' ? +(3 + rng() * 7).toFixed(1) : null;
    parcels.push({
      id:       i + 1,
      name:     `Parcelle ${String(i + 1).padStart(2, '0')}`,
      status,
      area,
      crop,
      yield:    yield_,
      updated:  new Date(Date.now() - Math.floor(rng() * 86400 * 1000 * 7)).toISOString(),
      x: rng(), // relative canvas position [0,1]
      y: rng(),
      w: 0.06 + rng() * 0.12,
      h: 0.06 + rng() * 0.10,
    });
  }
  return parcels;
}

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  parcels:        generateParcels(),
  filter:         'all',
  search:         '',
  selectedId:     null,
  zoom:           1,
  panX:           0,
  panY:           0,
  isDragging:     false,
  dragStartX:     0,
  dragStartY:     0,
  lastPanX:       0,
  lastPanY:       0,
  sidebarOpen:    false,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvas         = document.getElementById('map-canvas');
const ctx            = canvas.getContext('2d');
const parcelList     = document.getElementById('parcel-list');
const searchInput    = document.getElementById('search');
const summaryEl      = document.getElementById('summary');
const mapStatusEl    = document.getElementById('map-status');
const detailPanel    = document.getElementById('detail-panel');
const detailTitle    = document.getElementById('detail-title');
const detailBody     = document.getElementById('detail-body');
const detailClose    = document.getElementById('detail-close');
const sidebar        = document.getElementById('sidebar');
const sidebarToggle  = document.getElementById('sidebar-toggle');
const sidebarClose   = document.getElementById('sidebar-close');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const toastContainer = document.getElementById('toast-container');
const btnRefresh     = document.getElementById('btn-refresh');
const btnAdd         = document.getElementById('btn-add');
const zoomIn         = document.getElementById('zoom-in');
const zoomOut        = document.getElementById('zoom-out');
const zoomReset      = document.getElementById('zoom-reset');
const chips          = document.querySelectorAll('.chip');

// ── Colour helpers ────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  active:  { fill: '#52b788', stroke: '#2d6a4f' },
  fallow:  { fill: '#e9c46a', stroke: '#b5830a' },
  harvest: { fill: '#e76f51', stroke: '#9a3412' },
};

function getColor(status) { return STATUS_COLORS[status] || STATUS_COLORS.active; }

// ── Canvas drawing ─────────────────────────────────────────────────────────────
function resizeCanvas() {
  const container = canvas.parentElement;
  canvas.width  = container.clientWidth;
  canvas.height = container.clientHeight;
  drawMap();
}

function worldToScreen(xRel, yRel) {
  const cw = canvas.width;
  const ch = canvas.height;
  const sx = xRel * cw * state.zoom + state.panX;
  const sy = yRel * ch * state.zoom + state.panY;
  return [sx, sy];
}

function screenToWorld(sx, sy) {
  const cw = canvas.width;
  const ch = canvas.height;
  const xRel = (sx - state.panX) / (cw * state.zoom);
  const yRel = (sy - state.panY) / (ch * state.zoom);
  return [xRel, yRel];
}

function drawMap() {
  const cw = canvas.width;
  const ch = canvas.height;
  ctx.clearRect(0, 0, cw, ch);

  // Background grid
  ctx.save();
  ctx.translate(state.panX, state.panY);
  ctx.scale(state.zoom, state.zoom);

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth   = 0.5 / state.zoom;
  const cols = 10, rows = 10;
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c / cols * cw, 0);
    ctx.lineTo(c / cols * cw, ch);
    ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r / rows * ch);
    ctx.lineTo(cw, r / rows * ch);
    ctx.stroke();
  }

  // Draw parcels
  state.parcels.forEach(p => {
    const px = p.x * cw;
    const py = p.y * ch;
    const pw = p.w * cw;
    const ph = p.h * ch;
    const color   = getColor(p.status);
    const isSelected = p.id === state.selectedId;

    // Shadow for selected
    if (isSelected) {
      ctx.shadowColor   = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur    = 12 / state.zoom;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 4 / state.zoom;
    }

    // Fill
    ctx.fillStyle = color.fill;
    ctx.globalAlpha = 0.85;
    roundRect(ctx, px, py, pw, ph, 4 / state.zoom);
    ctx.fill();

    // Border
    ctx.globalAlpha = 1;
    ctx.strokeStyle = isSelected ? '#fff' : color.stroke;
    ctx.lineWidth   = (isSelected ? 2.5 : 1.5) / state.zoom;
    roundRect(ctx, px, py, pw, ph, 4 / state.zoom);
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;

    // Label (only if large enough in screen pixels)
    const screenW = pw * state.zoom;
    const screenH = ph * state.zoom;
    if (screenW > 48 && screenH > 20) {
      ctx.fillStyle  = '#fff';
      ctx.font       = `bold ${Math.min(13 / state.zoom, pw / 5)}px system-ui`;
      ctx.textAlign  = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor  = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur   = 2 / state.zoom;
      ctx.fillText(p.name, px + pw / 2, py + ph / 2);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur  = 0;
    }
  });

  ctx.restore();

  // Status bar
  mapStatusEl.textContent = `Zoom : ${Math.round(state.zoom * 100)} % · ${state.parcels.length} parcelles`;
}

function roundRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + w - r, y);
  context.quadraticCurveTo(x + w, y, x + w, y + r);
  context.lineTo(x + w, y + h - r);
  context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  context.lineTo(x + r, y + h);
  context.quadraticCurveTo(x, y + h, x, y + h - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

// ── Canvas interactions ───────────────────────────────────────────────────────
function hitTest(sx, sy) {
  const cw = canvas.width;
  const ch = canvas.height;
  const [wx, wy] = screenToWorld(sx, sy);
  for (let i = state.parcels.length - 1; i >= 0; i--) {
    const p = state.parcels[i];
    if (wx >= p.x && wx <= p.x + p.w && wy >= p.y && wy <= p.y + p.h) return p;
  }
  return null;
}

canvas.addEventListener('click', e => {
  const rect = canvas.getBoundingClientRect();
  const parcel = hitTest(e.clientX - rect.left, e.clientY - rect.top);
  if (parcel) {
    selectParcel(parcel.id);
  } else {
    clearSelection();
  }
});

canvas.addEventListener('mousemove', e => {
  if (state.isDragging) {
    state.panX = state.lastPanX + (e.clientX - state.dragStartX);
    state.panY = state.lastPanY + (e.clientY - state.dragStartY);
    drawMap();
    return;
  }
  const rect   = canvas.getBoundingClientRect();
  const parcel = hitTest(e.clientX - rect.left, e.clientY - rect.top);
  canvas.style.cursor = parcel ? 'pointer' : 'crosshair';
});

canvas.addEventListener('mousedown', e => {
  state.isDragging = true;
  state.dragStartX = e.clientX;
  state.dragStartY = e.clientY;
  state.lastPanX   = state.panX;
  state.lastPanY   = state.panY;
  canvas.style.cursor = 'grabbing';
});

window.addEventListener('mouseup', () => {
  state.isDragging = false;
  canvas.style.cursor = 'grab';
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const rect   = canvas.getBoundingClientRect();
  const mx     = e.clientX - rect.left;
  const my     = e.clientY - rect.top;
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  applyZoom(factor, mx, my);
}, { passive: false });

// Touch support
let lastTouchDist = null;
canvas.addEventListener('touchstart', e => {
  if (e.touches.length === 2) {
    lastTouchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY,
    );
  } else if (e.touches.length === 1) {
    state.isDragging = true;
    state.dragStartX = e.touches[0].clientX;
    state.dragStartY = e.touches[0].clientY;
    state.lastPanX   = state.panX;
    state.lastPanY   = state.panY;
  }
}, { passive: true });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 2 && lastTouchDist !== null) {
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY,
    );
    const rect = canvas.getBoundingClientRect();
    const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
    const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
    applyZoom(dist / lastTouchDist, mx, my);
    lastTouchDist = dist;
  } else if (e.touches.length === 1 && state.isDragging) {
    state.panX = state.lastPanX + (e.touches[0].clientX - state.dragStartX);
    state.panY = state.lastPanY + (e.touches[0].clientY - state.dragStartY);
    drawMap();
  }
}, { passive: false });

canvas.addEventListener('touchend', e => {
  if (e.touches.length < 2) lastTouchDist = null;
  if (e.touches.length === 0) {
    state.isDragging = false;
    // Tap detection
    if (Math.abs(state.panX - state.lastPanX) < 5 && Math.abs(state.panY - state.lastPanY) < 5) {
      const t = e.changedTouches[0];
      const rect = canvas.getBoundingClientRect();
      const parcel = hitTest(t.clientX - rect.left, t.clientY - rect.top);
      if (parcel) selectParcel(parcel.id);
      else clearSelection();
    }
  }
}, { passive: true });

function applyZoom(factor, cx, cy) {
  const newZoom = Math.min(Math.max(state.zoom * factor, 0.3), 5);
  state.panX = cx - (cx - state.panX) * (newZoom / state.zoom);
  state.panY = cy - (cy - state.panY) * (newZoom / state.zoom);
  state.zoom = newZoom;
  drawMap();
}

// ── Zoom controls ─────────────────────────────────────────────────────────────
zoomIn.addEventListener('click',    () => applyZoom(1.25, canvas.width / 2, canvas.height / 2));
zoomOut.addEventListener('click',   () => applyZoom(0.8,  canvas.width / 2, canvas.height / 2));
zoomReset.addEventListener('click', () => { state.zoom = 1; state.panX = 0; state.panY = 0; drawMap(); });

// ── Selection ─────────────────────────────────────────────────────────────────
function selectParcel(id) {
  state.selectedId = id;
  drawMap();
  renderList();
  showDetail(id);
}

function clearSelection() {
  state.selectedId = null;
  detailPanel.classList.remove('is-open');
  drawMap();
  renderList();
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function showDetail(id) {
  const p = state.parcels.find(x => x.id === id);
  if (!p) return;
  detailTitle.textContent = p.name;
  const updated = new Date(p.updated).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  detailBody.innerHTML = `
    <span class="parcel-item__badge status--${p.status}">${STATUS_LABELS[p.status]}</span>
    <div class="detail-grid">
      <div class="detail-field">
        <label>Culture</label>
        <span>${p.crop}</span>
      </div>
      <div class="detail-field">
        <label>Surface</label>
        <span>${p.area} ha</span>
      </div>
      ${p.yield !== null ? `
      <div class="detail-field">
        <label>Rendement</label>
        <span>${p.yield} t/ha</span>
      </div>` : ''}
      <div class="detail-field">
        <label>Mise à jour</label>
        <span>${updated}</span>
      </div>
    </div>`;
  detailPanel.classList.add('is-open');
}

detailClose.addEventListener('click', clearSelection);

// ── Sidebar ────────────────────────────────────────────────────────────────────
function openSidebar() {
  state.sidebarOpen = true;
  sidebar.classList.add('is-open');
  sidebarOverlay.classList.add('is-visible');
  sidebarToggle.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  state.sidebarOpen = false;
  sidebar.classList.remove('is-open');
  sidebarOverlay.classList.remove('is-visible');
  sidebarToggle.setAttribute('aria-expanded', 'false');
}

sidebarToggle.addEventListener('click', () => state.sidebarOpen ? closeSidebar() : openSidebar());
sidebarClose.addEventListener('click',  closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

// ── Parcel list rendering ─────────────────────────────────────────────────────
function filteredParcels() {
  const q = state.search.toLowerCase();
  return state.parcels.filter(p => {
    const matchStatus = state.filter === 'all' || p.status === state.filter;
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.crop.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });
}

function renderList() {
  const parcels = filteredParcels();
  parcelList.innerHTML = '';

  if (parcels.length === 0) {
    parcelList.innerHTML = '<li style="padding:16px;color:var(--color-text-muted);font-size:0.875rem;">Aucune parcelle trouvée.</li>';
  } else {
    parcels.forEach(p => {
      const li = document.createElement('li');
      li.className = 'parcel-item' + (p.id === state.selectedId ? ' parcel-item--selected' : '');
      li.setAttribute('role', 'listitem');
      li.innerHTML = `
        <span class="parcel-item__color color--${p.status}"></span>
        <div class="parcel-item__info">
          <div class="parcel-item__name">${p.name}</div>
          <div class="parcel-item__meta">${p.crop} · ${p.area} ha</div>
        </div>
        <span class="parcel-item__badge status--${p.status}">${STATUS_LABELS[p.status]}</span>`;
      li.addEventListener('click', () => {
        selectParcel(p.id);
        // On mobile, close sidebar after selecting
        if (window.innerWidth < 640) closeSidebar();
      });
      parcelList.appendChild(li);
    });
  }

  renderSummary(parcels);
}

function renderSummary(parcels) {
  const totalArea = parcels.reduce((s, p) => s + p.area, 0);
  summaryEl.innerHTML = `
    <div class="summary-stat"><label>Parcelles</label><strong>${parcels.length}</strong></div>
    <div class="summary-stat"><label>Surface totale</label><strong>${totalArea.toFixed(1)} ha</strong></div>`;
}

// ── Filters & search ──────────────────────────────────────────────────────────
chips.forEach(chip => {
  chip.addEventListener('click', () => {
    chips.forEach(c => c.classList.remove('chip--active'));
    chip.classList.add('chip--active');
    state.filter = chip.dataset.filter;
    renderList();
  });
});

searchInput.addEventListener('input', () => {
  state.search = searchInput.value;
  renderList();
});

// ── Toolbar actions ───────────────────────────────────────────────────────────
btnRefresh.addEventListener('click', () => {
  state.parcels = generateParcels();
  state.selectedId = null;
  detailPanel.hidden = true;
  renderList();
  drawMap();
  showToast('Données actualisées ✓');
});

btnAdd.addEventListener('click', () => {
  showToast('Fonctionnalité à venir : ajout de parcelle');
});

// ── Toast helper ──────────────────────────────────────────────────────────────
function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  resizeCanvas();
});

resizeCanvas();
renderList();
