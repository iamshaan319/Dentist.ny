/**
 * NY Dental Directory — Main Application
 * ========================================
 * Data backend: GitHub Raw Content API
 *
 * HOW TO CONNECT YOUR GITHUB REPOSITORY:
 * 1. Create a public GitHub repo (e.g. "ny-dental-data")
 * 2. Upload dentists.json inside a /data/ folder
 * 3. Replace GITHUB_DATA_URL below with your raw file URL:
 *    https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/data/dentists.json
 *
 * The site will always fetch the latest data from GitHub on page load.
 */

// ══════════════════════════════════════════════════════════════════
//  CONFIGURATION — Update this URL after pushing to GitHub
// ══════════════════════════════════════════════════════════════════
const GITHUB_DATA_URL =
  'https://github.com/iamshaan319/Dentist.ny/edit/main/app.js';

// Fallback: load from local data/ folder (works when running locally)
const LOCAL_DATA_URL = 'data/dentists.json';

// ══════════════════════════════════════════════════════════════════
//  State
// ══════════════════════════════════════════════════════════════════
let allDentists = [];
let filtered    = [];
let activeView  = 'grid';

const state = {
  search:    '',
  borough:   '',
  specialty: '',
  sort:      'name',
  accepting: false,
};

// ══════════════════════════════════════════════════════════════════
//  Fetch data from GitHub (with local fallback)
// ══════════════════════════════════════════════════════════════════
async function fetchData() {
  const urls = [GITHUB_DATA_URL, LOCAL_DATA_URL];
  for (const url of urls) {
    try {
      const res = await fetch(url + '?t=' + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json;
    } catch (e) {
      console.warn(`Failed to fetch from ${url}:`, e.message);
    }
  }
  throw new Error('Could not load dentist data from any source.');
}

// ══════════════════════════════════════════════════════════════════
//  Initialise
// ══════════════════════════════════════════════════════════════════
async function init() {
  try {
    showLoader(true);
    const data = await fetchData();
    allDentists = data.dentists || [];

    // Populate specialty filter
    const specialties = [...new Set(allDentists.map(d => d.specialty))].sort();
    const sel = document.getElementById('filter-specialty');
    if (sel) {
      specialties.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = s;
        sel.appendChild(opt);
      });
    }

    // Update stats
    const total = allDentists.length;
    ['total-count', 'stat-total'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = total;
    });

    // Footer date
    const fu = document.getElementById('footer-updated');
    if (fu && data.meta) fu.textContent = `Last updated: ${data.meta.last_updated}`;

    applyFilters();
    attachEventListeners();
    showLoader(false);

    // Map page special init
    if (typeof window.initMap === 'function') {
      window.initMap(allDentists);
    }

  } catch (err) {
    console.error(err);
    showLoader(false);
    const container = document.getElementById('cards-container');
    if (container) {
      container.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:80px 24px;">
          <div style="font-size:2rem;margin-bottom:12px;">⚠️</div>
          <h3 style="font-family:var(--font-display);margin-bottom:8px;">Could not load data</h3>
          <p style="color:var(--muted);margin-bottom:20px;">Check your GitHub URL configuration in app.js</p>
          <code style="font-size:0.8rem;color:var(--muted);background:var(--surface);padding:8px 16px;border-radius:8px;display:inline-block;">${err.message}</code>
        </div>`;
    }
  }
}

// ══════════════════════════════════════════════════════════════════
//  Filter & Sort
// ══════════════════════════════════════════════════════════════════
function applyFilters() {
  const { search, borough, specialty, sort, accepting } = state;
  const q = search.trim().toLowerCase();

  filtered = allDentists.filter(d => {
    if (borough   && d.borough   !== borough)   return false;
    if (specialty && d.specialty !== specialty) return false;
    if (accepting && !d.accepting_new_patients) return false;
    if (q) {
      const haystack = [
        d.name, d.specialty, d.practice_name, d.address,
        d.city, d.borough, ...(d.languages || []),
        ...(d.services || [])
      ].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (sort === 'name')       return a.last_name.localeCompare(b.last_name);
    if (sort === 'rating')     return (b.rating || 0) - (a.rating || 0);
    if (sort === 'experience') return (b.years_experience || 0) - (a.years_experience || 0);
    if (sort === 'reviews')    return (b.review_count || 0) - (a.review_count || 0);
    return 0;
  });

  renderCards();
  updateResultsCount();
}

// ══════════════════════════════════════════════════════════════════
//  Render Cards
// ══════════════════════════════════════════════════════════════════
function renderCards() {
  const container = document.getElementById('cards-container');
  const noResults = document.getElementById('no-results');
  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = '';
    noResults && noResults.classList.remove('hidden');
    return;
  }
  noResults && noResults.classList.add('hidden');

  container.innerHTML = filtered.map((d, i) => buildCard(d, i)).join('');

  // Attach click handlers
  container.querySelectorAll('.dentist-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = parseInt(card.dataset.id);
      openModal(id);
    });
  });
}

function buildCard(d, index) {
  const stars = renderStars(d.rating);
  const delay = Math.min(index * 40, 400);
  const langs = (d.languages || []).slice(0, 3).map(l =>
    `<span class="card-tag lang">${l}</span>`).join('');
  const services = (d.services || []).slice(0, 3).map(s =>
    `<span class="card-tag">${s}</span>`).join('');

  return `
    <article class="dentist-card" data-id="${d.id}" style="animation-delay:${delay}ms">
      <div class="card-top">
        <div class="card-avatar">
          ${d.image_placeholder || initials(d.name)}
          <div class="card-avatar-status ${d.accepting_new_patients ? 'accepting' : 'full'}"
               title="${d.accepting_new_patients ? 'Accepting new patients' : 'Not accepting new patients'}"></div>
        </div>
        <div class="card-info">
          <div class="card-name">${d.name}</div>
          <div class="card-specialty">${d.specialty}</div>
          <div class="card-rating">
            <span class="stars">${stars}</span>
            <span class="rating-num">${d.rating || 'N/A'}</span>
            <span class="rating-count">(${(d.review_count || 0).toLocaleString()} reviews)</span>
          </div>
        </div>
      </div>
      <div class="card-body">
        <div class="card-row">
          <svg class="card-row-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6c0 3.75 4.5 8.5 4.5 8.5s4.5-4.75 4.5-8.5c0-2.5-2-4.5-4.5-4.5z"/>
            <circle cx="8" cy="6" r="1.5"/>
          </svg>
          <span class="card-row-text">${d.address}, ${d.city}, ${d.state} ${d.zip}</span>
        </div>
        <div class="card-row">
          <svg class="card-row-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 3h3l1.5 3.5L5 8c1 2 3 4 5 5l1.5-1.5L15 13v3C9 16.5 0 7.5 0 1.5L2 3z"/>
          </svg>
          <span class="card-row-text">${d.phone}</span>
        </div>
        ${d.years_experience ? `
        <div class="card-row">
          <svg class="card-row-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="8" cy="8" r="6.5"/>
            <path d="M8 4.5v3.5l2.5 2.5"/>
          </svg>
          <span class="card-row-text">${d.years_experience} years experience · ${d.degree}</span>
        </div>` : ''}
      </div>
      <div class="card-tags">${langs}${services}</div>
      <div class="card-footer">
        <span class="card-borough">
          <svg viewBox="0 0 12 12" fill="currentColor" width="12" height="12"><circle cx="6" cy="6" r="4"/></svg>
          ${d.borough}
        </span>
        <button class="card-btn">View Profile</button>
      </div>
    </article>`;
}

// ══════════════════════════════════════════════════════════════════
//  Modal
// ══════════════════════════════════════════════════════════════════
window.openModal = function(id) {
  const d = allDentists.find(x => x.id === id);
  if (!d) return;

  const overlay = document.getElementById('modal-overlay');
  const body    = document.getElementById('modal-body');
  if (!overlay || !body) return;

  const stars = renderStars(d.rating);
  const hoursHTML = d.office_hours
    ? Object.entries(d.office_hours).map(([day, time]) => `
        <div class="hour-item">
          <span class="hour-day">${day.slice(0,3)}</span>
          <span class="hour-time ${time === 'Closed' ? 'closed' : ''}">${time}</span>
        </div>`).join('')
    : '<p style="color:var(--muted);font-size:0.85rem;">Hours not available</p>';

  const insurance = (d.insurance || []).map(i => `<span class="modal-tag insurance">${i}</span>`).join('');
  const services  = (d.services  || []).map(s => `<span class="modal-tag service">${s}</span>`).join('');
  const langs     = (d.languages || []).map(l => `<span class="modal-tag lang">${l}</span>`).join('');

  body.innerHTML = `
    <div class="modal-header">
      <div class="modal-avatar">${d.image_placeholder || initials(d.name)}</div>
      <div class="modal-title-block">
        <div class="modal-name">${d.name}</div>
        <div class="modal-specialty">${d.specialty}</div>
        <div class="modal-rating">
          <span class="stars">${stars}</span>
          <span class="rating-num" style="font-size:0.9rem;font-weight:600;">${d.rating}</span>
          <span class="rating-count" style="font-size:0.82rem;">(${(d.review_count||0).toLocaleString()} reviews)</span>
          <span class="modal-accepting ${d.accepting_new_patients ? 'yes' : 'no'}">
            ${d.accepting_new_patients ? '● Accepting Patients' : '● Not Accepting'}
          </span>
        </div>
      </div>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">Contact & Location</div>
      <div class="modal-info-grid">
        <div class="modal-info-item">
          <div class="modal-info-label">Practice</div>
          <div class="modal-info-value">${d.practice_name || '—'}</div>
        </div>
        <div class="modal-info-item">
          <div class="modal-info-label">Borough</div>
          <div class="modal-info-value">${d.borough}</div>
        </div>
        <div class="modal-info-item">
          <div class="modal-info-label">Address</div>
          <div class="modal-info-value">${d.address}, ${d.city}, ${d.state} ${d.zip}</div>
        </div>
        <div class="modal-info-item">
          <div class="modal-info-label">Phone</div>
          <div class="modal-info-value">
            <a href="tel:${d.phone}">${d.phone}</a>
          </div>
        </div>
        ${d.website ? `
        <div class="modal-info-item">
          <div class="modal-info-label">Website</div>
          <div class="modal-info-value">
            <a href="${d.website}" target="_blank" rel="noopener">Visit website ↗</a>
          </div>
        </div>` : ''}
        ${d.email ? `
        <div class="modal-info-item">
          <div class="modal-info-label">Email</div>
          <div class="modal-info-value">
            <a href="mailto:${d.email}">${d.email}</a>
          </div>
        </div>` : ''}
      </div>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">Credentials</div>
      <div class="modal-info-grid">
        <div class="modal-info-item">
          <div class="modal-info-label">Degree</div>
          <div class="modal-info-value">${d.degree || '—'}</div>
        </div>
        <div class="modal-info-item">
          <div class="modal-info-label">Specialty</div>
          <div class="modal-info-value">${d.specialty}</div>
        </div>
        <div class="modal-info-item">
          <div class="modal-info-label">Experience</div>
          <div class="modal-info-value">${d.years_experience ? d.years_experience + ' years' : '—'}</div>
        </div>
        <div class="modal-info-item">
          <div class="modal-info-label">NPI Number</div>
          <div class="modal-info-value" style="font-family:var(--font-mono);font-size:0.85rem;">${d.npi || '—'}</div>
        </div>
        ${d.certifications ? `
        <div class="modal-info-item">
          <div class="modal-info-label">License</div>
          <div class="modal-info-value">${d.certifications}</div>
        </div>` : ''}
        <div class="modal-info-item">
          <div class="modal-info-label">Gender</div>
          <div class="modal-info-value">${d.gender || '—'}</div>
        </div>
      </div>
    </div>

    ${d.office_hours ? `
    <div class="modal-section">
      <div class="modal-section-title">Office Hours</div>
      <div class="hours-grid">${hoursHTML}</div>
    </div>` : ''}

    ${langs ? `
    <div class="modal-section">
      <div class="modal-section-title">Languages Spoken</div>
      <div class="modal-tags">${langs}</div>
    </div>` : ''}

    ${services ? `
    <div class="modal-section">
      <div class="modal-section-title">Services Offered</div>
      <div class="modal-tags">${services}</div>
    </div>` : ''}

    ${insurance ? `
    <div class="modal-section">
      <div class="modal-section-title">Insurance Accepted</div>
      <div class="modal-tags">${insurance}</div>
    </div>` : ''}

    <div class="modal-actions">
      ${d.phone ? `<a class="modal-btn modal-btn-primary" href="tel:${d.phone}">📞 Call ${d.phone}</a>` : ''}
      ${d.website ? `<a class="modal-btn modal-btn-outline" href="${d.website}" target="_blank" rel="noopener">🌐 Visit Website</a>` : ''}
      ${(d.latitude && d.longitude) ? `
        <a class="modal-btn modal-btn-outline"
           href="https://www.google.com/maps/dir/?api=1&destination=${d.latitude},${d.longitude}"
           target="_blank" rel="noopener">🗺️ Get Directions</a>` : ''}
    </div>`;

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
};

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

// ══════════════════════════════════════════════════════════════════
//  Event Listeners
// ══════════════════════════════════════════════════════════════════
function attachEventListeners() {
  // Search
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      state.search = e.target.value;
      searchClear && searchClear.classList.toggle('visible', state.search.length > 0);
      applyFilters();
    });
  }
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      state.search = '';
      searchClear.classList.remove('visible');
      applyFilters();
    });
  }

  // Borough pills
  const boroughGroup = document.getElementById('filter-borough');
  if (boroughGroup) {
    boroughGroup.querySelectorAll('.pill').forEach(pill => {
      pill.addEventListener('click', () => {
        boroughGroup.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.borough = pill.dataset.value;
        applyFilters();
      });
    });
  }

  // Specialty select
  const specSel = document.getElementById('filter-specialty');
  if (specSel) {
    specSel.addEventListener('change', e => {
      state.specialty = e.target.value;
      applyFilters();
    });
  }

  // Sort select
  const sortSel = document.getElementById('filter-sort');
  if (sortSel) {
    sortSel.addEventListener('change', e => {
      state.sort = e.target.value;
      applyFilters();
    });
  }

  // Accepting toggle
  const acceptToggle = document.getElementById('filter-accepting');
  if (acceptToggle) {
    acceptToggle.addEventListener('change', e => {
      state.accepting = e.target.checked;
      applyFilters();
    });
  }

  // Reset
  ['filter-reset', 'no-results-reset'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', resetFilters);
  });

  // View toggle
  const viewGrid = document.getElementById('view-grid');
  const viewList = document.getElementById('view-list');
  const container = document.getElementById('cards-container');
  if (viewGrid && viewList && container) {
    viewGrid.addEventListener('click', () => {
      activeView = 'grid';
      viewGrid.classList.add('active');
      viewList.classList.remove('active');
      container.classList.remove('list-view');
    });
    viewList.addEventListener('click', () => {
      activeView = 'list';
      viewList.classList.add('active');
      viewGrid.classList.remove('active');
      container.classList.add('list-view');
    });
  }

  // Modal close
  const modalOverlay = document.getElementById('modal-overlay');
  const modalClose   = document.getElementById('modal-close');
  if (modalClose)   modalClose.addEventListener('click', closeModal);
  if (modalOverlay) modalOverlay.addEventListener('click', e => {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // Sticky nav scroll effect
  window.addEventListener('scroll', () => {
    const nav = document.getElementById('nav');
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 20);
  });
}

function resetFilters() {
  state.search = '';
  state.borough = '';
  state.specialty = '';
  state.sort = 'name';
  state.accepting = false;

  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const specSel     = document.getElementById('filter-specialty');
  const sortSel     = document.getElementById('filter-sort');
  const acceptToggle = document.getElementById('filter-accepting');
  const boroughGroup = document.getElementById('filter-borough');

  if (searchInput) searchInput.value = '';
  if (searchClear) searchClear.classList.remove('visible');
  if (specSel)     specSel.value = '';
  if (sortSel)     sortSel.value = 'name';
  if (acceptToggle) acceptToggle.checked = false;
  if (boroughGroup) {
    boroughGroup.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    const all = boroughGroup.querySelector('[data-value=""]');
    if (all) all.classList.add('active');
  }

  applyFilters();
}

// ══════════════════════════════════════════════════════════════════
//  Utilities
// ══════════════════════════════════════════════════════════════════
function renderStars(rating) {
  if (!rating) return '☆☆☆☆☆';
  const full  = Math.floor(rating);
  const half  = rating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

function initials(name) {
  return name.split(' ').filter(Boolean)
    .slice(1, 3).map(w => w[0]).join('').toUpperCase() || '??';
}

function updateResultsCount() {
  const el = document.getElementById('results-count');
  if (el) {
    el.innerHTML = filtered.length === allDentists.length
      ? `Showing <strong>${allDentists.length}</strong> dentists`
      : `Showing <strong>${filtered.length}</strong> of ${allDentists.length} dentists`;
  }
}

function showLoader(show) {
  const loader    = document.getElementById('loader');
  const container = document.getElementById('cards-container');
  if (loader)    loader.classList.toggle('hidden', !show);
  if (container) container.classList.toggle('hidden', show);
}

// ── Boot ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
