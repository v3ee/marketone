// ==========================================================
// admin.js — security-exam/admin.html
// ==========================================================

const SECTION_LABELS = {
  phishing: "Phishing",
  password_security: "Password Security",
  social_engineering: "Social Engineering",
  data_protection: "Data Protection",
  ai_threats: "AI Threats",
};
const SECTION_ORDER = Object.keys(SECTION_LABELS);

const tokenCard = document.getElementById("token-card");
const dashboard = document.getElementById("dashboard");
const tokenForm = document.getElementById("token-form");
const tokenInput = document.getElementById("token");
const tokenError = document.getElementById("token-error");
const accessBtn = document.getElementById("access-btn");
const logoutBtn = document.getElementById("logout-btn");
const refreshBtn = document.getElementById("refresh-btn");

const searchInput = document.getElementById("search-input");
const resultCountEl = document.getElementById("result-count");
const employeeListEl = document.getElementById("employee-list");
const paginationBar = document.getElementById("pagination-bar");
const paginationInfo = document.getElementById("pagination-info");
const paginationControls = document.getElementById("pagination-controls");
const pageSizeSelect = document.getElementById("page-size-select");

let adminToken = sessionStorage.getItem("admin_token") || "";
let allEmployees = [];
let filteredEmployees = [];
let currentPage = 1;
let pageSize = 20;
let openAccordionKeys = new Set(); // preserves open/closed state across re-renders

if (adminToken) {
  attemptLoad(adminToken);
}

tokenForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = tokenInput.value.trim();
  if (!token) return;
  await attemptLoad(token);
});

logoutBtn.addEventListener("click", () => {
  sessionStorage.removeItem("admin_token");
  adminToken = "";
  dashboard.classList.add("hidden");
  tokenCard.classList.remove("hidden");
  tokenInput.value = "";
});

refreshBtn.addEventListener("click", () => {
  if (adminToken) attemptLoad(adminToken);
});

searchInput.addEventListener("input", () => {
  currentPage = 1;
  applyFilter();
  renderList();
});

pageSizeSelect.addEventListener("change", () => {
  pageSize = parseInt(pageSizeSelect.value, 10);
  currentPage = 1;
  renderList();
});

async function attemptLoad(token) {
  tokenError.classList.remove("visible");
  accessBtn.disabled = true;
  accessBtn.textContent = "Checking...";

  try {
    const data = await API.adminResults(token);
    sessionStorage.setItem("admin_token", token);
    adminToken = token;
    tokenCard.classList.add("hidden");
    dashboard.classList.remove("hidden");
    render(data);
  } catch (err) {
    const message = err.status === 401 ? "Invalid security token." : err.message || "Could not load results.";
    tokenError.textContent = message;
    tokenError.classList.add("visible");
  } finally {
    accessBtn.disabled = false;
    accessBtn.textContent = "Access results";
  }
}

function render(data) {
  const { employees, stats } = data;
  allEmployees = employees;
  currentPage = 1;
  openAccordionKeys = new Set();

  document.getElementById("stat-employees").textContent = stats.total_employees;
  document.getElementById("stat-average").textContent = `${stats.average_overall}%`;
  document.getElementById("stat-risk").textContent = stats.below_threshold;
  document.getElementById("stat-risk-label").textContent = `Below ${stats.risk_threshold}%`;

  // const avgContainer = document.getElementById("section-averages");
  // avgContainer.innerHTML = "";
  // SECTION_ORDER.forEach((key) => {
  //   const avg = stats.section_averages[key];
  //   const row = document.createElement("div");
  //   row.className = "score-row";
  //   row.innerHTML = `
  //     <div class="name">${SECTION_LABELS[key]}</div>
  //     <div class="pct ${avg === null ? "" : scoreClass(avg)}">${avg === null ? "—" : avg + "%"}</div>`;
  //   avgContainer.appendChild(row);
  // });

  applyFilter();
  renderList();
}

function applyFilter() {
  const q = searchInput.value.trim().toLowerCase();
  filteredEmployees = !q
    ? allEmployees
    : allEmployees.filter(
        (e) =>
          (e.name || "").toLowerCase().includes(q) ||
          (e.email || "").toLowerCase().includes(q)
      );
}

function renderList() {
  employeeListEl.innerHTML = "";

  resultCountEl.textContent = allEmployees.length
    ? `${filteredEmployees.length} of ${allEmployees.length} employee${allEmployees.length === 1 ? "" : "s"}`
    : "";

  if (!allEmployees.length) {
    employeeListEl.innerHTML = `<div class="exam-card"><p style="margin:0;">No completed assessments yet.</p></div>`;
    paginationBar.classList.add("hidden");
    return;
  }

  if (!filteredEmployees.length) {
    employeeListEl.innerHTML = `<div class="exam-card"><p style="margin:0;">No employees match "${escapeHtml(searchInput.value.trim())}".</p></div>`;
    paginationBar.classList.add("hidden");
    return;
  }

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);

  const start = (currentPage - 1) * pageSize;
  const pageItems = filteredEmployees.slice(start, start + pageSize);

  pageItems.forEach((emp) => {
    employeeListEl.appendChild(buildAccordionItem(emp));
  });

  renderPagination(totalPages, start, pageItems.length);
}

function buildAccordionItem(emp) {
  const key = emp.session_id || `${emp.email}-${emp.completed_at}`;
  const isOpen = openAccordionKeys.has(key);

  const item = document.createElement("div");
  item.className = "employee-accordion-item" + (isOpen ? " open" : "");

  const rows = SECTION_ORDER.map((k) => {
    const score = emp.scores[k];
    if (score === undefined) {
      return `<div class="score-row"><div class="name">${SECTION_LABELS[k]}</div><div class="pct" style="color:var(--muted)">—</div></div>`;
    }
    return `<div class="score-row"><div class="name">${SECTION_LABELS[k]}</div><div class="pct ${scoreClass(score)}">${score}%</div></div>`;
  }).join("");

  item.innerHTML = `
    <div class="employee-accordion-header">
      <div class="employee-accordion-left">
        <svg class="employee-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        <div class="employee-identity">
          <div class="ename">${escapeHtml(emp.name)}</div>
          <div class="eemail">${escapeHtml(emp.email)}</div>
        </div>
      </div>
      <div class="employee-accordion-right">
        ${emp.completed_all ? "" : '<span class="employee-badge">Partial</span>'}
        <span class="employee-badge">${formatDateShort(emp.completed_at)}</span>
        <span class="employee-overall-pct ${scoreClass(emp.overall_score)}">${emp.overall_score}%</span>
      </div>
    </div>
    <div class="employee-accordion-body">
      <div class="employee-accordion-body-inner">
        ${rows}
        <div class="employee-meta" style="margin-top:14px;">Completed ${formatDate(emp.completed_at)} · ${emp.time_taken_display || "—"}${emp.completed_all ? "" : " · Partial (time expired)"}</div>
      </div>
    </div>
  `;

  const header = item.querySelector(".employee-accordion-header");
  const body = item.querySelector(".employee-accordion-body");

  header.addEventListener("click", () => {
    const nowOpen = !item.classList.contains("open");
    item.classList.toggle("open", nowOpen);
    if (nowOpen) {
      openAccordionKeys.add(key);
      body.style.maxHeight = body.scrollHeight + "px";
    } else {
      openAccordionKeys.delete(key);
      body.style.maxHeight = "0px";
    }
  });

  if (isOpen) {
    // Set after insertion so scrollHeight is measurable.
    requestAnimationFrame(() => {
      body.style.maxHeight = body.scrollHeight + "px";
    });
  }

  return item;
}

function renderPagination(totalPages, start, pageCount) {
  if (totalPages <= 1 && filteredEmployees.length <= pageSize) {
    paginationBar.classList.add("hidden");
    return;
  }
  paginationBar.classList.remove("hidden");

  const rangeStart = filteredEmployees.length ? start + 1 : 0;
  const rangeEnd = start + pageCount;
  paginationInfo.textContent = `Showing ${rangeStart}–${rangeEnd} of ${filteredEmployees.length}`;

  paginationControls.innerHTML = "";

  const addBtn = (label, page, opts = {}) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "page-btn" + (opts.active ? " active" : "");
    btn.textContent = label;
    btn.disabled = !!opts.disabled;
    btn.addEventListener("click", () => {
      currentPage = page;
      renderList();
      employeeListEl.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    paginationControls.appendChild(btn);
  };

  addBtn("‹", currentPage - 1, { disabled: currentPage === 1 });

  const pages = paginationRange(currentPage, totalPages);
  pages.forEach((p) => {
    if (p === "...") {
      const span = document.createElement("span");
      span.textContent = "…";
      span.style.color = "var(--muted)";
      span.style.padding = "0 4px";
      paginationControls.appendChild(span);
    } else {
      addBtn(String(p), p, { active: p === currentPage });
    }
  });

  addBtn("›", currentPage + 1, { disabled: currentPage === totalPages });
}

// Builds a compact page list like: 1 ... 4 5 [6] 7 8 ... 42
function paginationRange(current, total) {
  const delta = 1;
  const range = [];
  const rangeWithDots = [];
  let last;

  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      range.push(i);
    }
  }

  for (const i of range) {
    if (last !== undefined) {
      if (i - last === 2) {
        rangeWithDots.push(last + 1);
      } else if (i - last > 2) {
        rangeWithDots.push("...");
      }
    }
    rangeWithDots.push(i);
    last = i;
  }

  return rangeWithDots;
}

function scoreClass(score) {
  if (score >= 90) return "score-good";
  if (score >= 70) return "score-warn";
  return "score-bad";
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatDateShort(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}