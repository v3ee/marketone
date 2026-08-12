// ==========================================================
// result.js — security-exam/result.html
// ==========================================================

const SECTION_LABELS = {
  phishing: "Phishing",
  password_security: "Password Security",
  social_engineering: "Social Engineering",
  data_protection: "Data Protection",
  ai_threats: "AI Threats",
};
const SECTION_ORDER = Object.keys(SECTION_LABELS);

const raw = sessionStorage.getItem("exam_result");

if (!raw) {
  document.getElementById("empty-card").classList.remove("hidden");
} else {
  render(JSON.parse(raw));
}

function render(result) {
  document.getElementById("result-card").classList.remove("hidden");
  document.getElementById("employee-name").textContent = result.name;

  const overallEl = document.getElementById("overall-score");
  overallEl.textContent = `${result.overall_score}%`;
  overallEl.className = "value " + scoreClass(result.overall_score);

  const container = document.getElementById("section-scores");
  container.innerHTML = "";
  SECTION_ORDER.forEach((key) => {
    const score = result.scores[key];
    const row = document.createElement("div");
    row.className = "score-row";
    if (score === undefined) {
      row.innerHTML = `
        <div class="name">${SECTION_LABELS[key]}</div>
        <div class="pct" style="color:var(--muted)">Not completed</div>`;
    } else {
      row.innerHTML = `
        <div class="name"> ${SECTION_LABELS[key]}</div>
        <div class="pct ${scoreClass(score)}">${score}%</div>`;
    }
    container.appendChild(row);
  });

  document.getElementById("stat-total").textContent = result.total_questions;
  document.getElementById("stat-correct").textContent = result.total_correct;
  document.getElementById("stat-time").textContent = result.time_taken_display;

  if (!result.completed_all) {
    document.getElementById("partial-note").style.display = "block";
  }
}

function scoreClass(score) {
  if (score >= 90) return "score-good";
  if (score >= 70) return "score-warn";
  return "score-bad";
}
