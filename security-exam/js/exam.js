// ==========================================================
// exam.js — security-exam/exam.html
// ==========================================================

const state = loadState();
if (!state) {
  window.location.href = "index.html";
}

const timerEl = document.getElementById("timer");
const sectionTrackEl = document.getElementById("section-track");

const loadingCard = document.getElementById("loading-card");
const loadingLabel = document.getElementById("loading-label");
const questionCard = document.getElementById("question-card");
const sectionCompleteCard = document.getElementById("section-complete-card");
const timeupCard = document.getElementById("timeup-card");

const sectionLabelEl = document.getElementById("section-label");
const qCountEl = document.getElementById("q-count");
const progressFillEl = document.getElementById("progress-fill");
const questionTextEl = document.getElementById("question-text");
const optionsContainer = document.getElementById("options-container");
const questionError = document.getElementById("question-error");
const nextBtn = document.getElementById("next-btn");

const completeLabelEl = document.getElementById("complete-label");
const sectionScoreEl = document.getElementById("section-score");
const sectionScoreDetailEl = document.getElementById("section-score-detail");
const nextSectionBtn = document.getElementById("next-section-btn");

let timerInterval = null;
let timedOut = false;

let currentTest = null;
let currentIndex = 0;
let currentAnswers = {};

init();

async function init() {
  renderSectionTrack();
  startTimer();
  await proceedToNextSection();
}

function loadState() {
  try {
    const raw = sessionStorage.getItem("exam_session");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState() {
  sessionStorage.setItem("exam_session", JSON.stringify(state));
}

// ---------------- Timer ----------------

function startTimer() {
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

function updateTimerDisplay() {
  const remainingMs = state.exam_deadline - Date.now();

  if (remainingMs <= 0) {
    timerEl.textContent = "00:00";
    clearInterval(timerInterval);
    handleTimeUp();
    return;
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  timerEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  timerEl.classList.toggle("warn", remainingMs < 5 * 60 * 1000 && remainingMs >= 60 * 1000);
  timerEl.classList.toggle("bad", remainingMs < 60 * 1000);
}

async function handleTimeUp() {
  if (timedOut) return;
  timedOut = true;

  showOnly(timeupCard);

  try {
    if (currentTest) {
      const result = await API.submitSection(state.session_id, currentTest.test_id, currentAnswers);
      if (!result.time_up) {
        recordSectionResult(result);
      }
    }
  } catch {
    // Fall through to finish with whatever sections were already recorded.
  }

  await finishAndRedirect();
}

// ---------------- Section flow ----------------

function renderSectionTrack() {
  sectionTrackEl.innerHTML = "";
  state.sections.forEach((s) => {
    const seg = document.createElement("div");
    seg.className = "seg";
    if (state.completed.includes(s.key)) seg.classList.add("done");
    sectionTrackEl.appendChild(seg);
  });
}

function nextPendingSectionKey() {
  const next = state.sections.find((s) => !state.completed.includes(s.key));
  return next ? next.key : null;
}

async function proceedToNextSection() {
  if (timedOut) return;

  const nextKey = nextPendingSectionKey();
  if (!nextKey) {
    await finishAndRedirect();
    return;
  }

  const nextConfig = state.sections.find((s) => s.key === nextKey);
  showOnly(loadingCard);
  loadingLabel.textContent = `Preparing ${nextConfig.label} questions...`;

  try {
    const data = await API.generateSection(state.session_id, nextKey);

    if (data.time_up) {
      handleTimeUp();
      return;
    }

    currentTest = data;
    currentIndex = 0;
    currentAnswers = {};
    renderQuestion();
  } catch (err) {
    loadingLabel.textContent = err.message || "Something went wrong. Retrying...";
    setTimeout(() => proceedToNextSection(), 2500);
  }
}

function renderQuestion() {
  showOnly(questionCard);
  questionError.classList.remove("visible");

  const q = currentTest.questions[currentIndex];
  const total = currentTest.questions.length;

  sectionLabelEl.textContent = currentTest.label;
  qCountEl.textContent = `Question ${currentIndex + 1} of ${total}`;
  progressFillEl.style.width = `${((currentIndex + 1) / total) * 100}%`;
  questionTextEl.textContent = q.question;

  optionsContainer.innerHTML = "";
  const letters = ["A", "B", "C", "D"];
  q.options.forEach((optionText, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn";
    if (currentAnswers[q.id] === i) btn.classList.add("selected");
    btn.innerHTML = `<span class="option-letter">${letters[i]}</span><span>${escapeHtml(optionText)}</span>`;
    btn.addEventListener("click", () => selectOption(q.id, i));
    optionsContainer.appendChild(btn);
  });

  nextBtn.disabled = currentAnswers[q.id] === undefined;
  nextBtn.textContent = currentIndex === total - 1 ? `Submit ${currentTest.label}` : "Next";
}

function selectOption(questionId, optionIndex) {
  currentAnswers[questionId] = optionIndex;
  [...optionsContainer.children].forEach((btn, i) => {
    btn.classList.toggle("selected", i === optionIndex);
  });
  nextBtn.disabled = false;
}

nextBtn.addEventListener("click", async () => {
  const total = currentTest.questions.length;

  if (currentIndex < total - 1) {
    currentIndex += 1;
    renderQuestion();
    return;
  }

  nextBtn.disabled = true;
  nextBtn.textContent = "Submitting...";

  try {
    const result = await API.submitSection(state.session_id, currentTest.test_id, currentAnswers);
    if (result.time_up) {
      handleTimeUp();
      return;
    }
    recordSectionResult(result);
    showSectionComplete(result);
  } catch (err) {
    questionError.textContent = err.message || "Could not submit. Please try again.";
    questionError.classList.add("visible");
    nextBtn.disabled = false;
    nextBtn.textContent = `Submit ${currentTest.label}`;
  }
});

function recordSectionResult(result) {
  if (!state.completed.includes(result.section)) {
    state.completed.push(result.section);
  }
  state.section_results[result.section] = result;
  saveState();
  renderSectionTrack();
}

function showSectionComplete(result) {
  showOnly(sectionCompleteCard);
  const label = state.sections.find((s) => s.key === result.section)?.label || result.section;
  completeLabelEl.textContent = `${label} complete`;
  sectionScoreEl.textContent = `${result.score}%`;
  sectionScoreEl.className = "value " + scoreClass(result.score);
  sectionScoreDetailEl.textContent = `${result.correct} of ${result.total} correct`;
  nextSectionBtn.textContent = result.all_complete ? "View results" : "Take next test";
}

nextSectionBtn.addEventListener("click", () => {
  proceedToNextSection();
});

// ---------------- Finish ----------------

async function finishAndRedirect() {
  clearInterval(timerInterval);
  try {
    const result = await API.finishExam(state.session_id);
    sessionStorage.setItem("exam_result", JSON.stringify(result));
    sessionStorage.removeItem("exam_session");
    window.location.href = "result.html";
  } catch (err) {
    showOnly(timeupCard);
    timeupCard.querySelector("p").textContent =
      err.message || "Could not finalize your results. Please contact your administrator.";
  }
}

// ---------------- Helpers ----------------

function showOnly(cardToShow) {
  [loadingCard, questionCard, sectionCompleteCard, timeupCard].forEach((c) => {
    c.classList.toggle("hidden", c !== cardToShow);
  });
}

function scoreClass(score) {
  if (score >= 90) return "score-good";
  if (score >= 70) return "score-warn";
  return "score-bad";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
