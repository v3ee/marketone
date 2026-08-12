// ==========================================================
// app.js — security-exam/index.html
// ==========================================================

const formStep = document.getElementById("form-step");
const instructionsStep = document.getElementById("instructions-step");
const startForm = document.getElementById("start-form");
const formError = document.getElementById("form-error");
const beginError = document.getElementById("begin-error");
const beginBtn = document.getElementById("begin-btn");

let pendingName = "";
let pendingEmail = "";

sessionStorage.removeItem("exam_session");
sessionStorage.removeItem("exam_result");

startForm.addEventListener("submit", (e) => {
  e.preventDefault();
  formError.classList.remove("visible");

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();

  if (name.length < 2) {
    showError(formError, "Please enter your full name.");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError(formError, "Please enter a valid email address.");
    return;
  }

  pendingName = name;
  pendingEmail = email;

  formStep.classList.add("hidden");
  instructionsStep.classList.remove("hidden");
});

beginBtn.addEventListener("click", async () => {
  beginError.classList.remove("visible");
  setLoading(true);

  try {
    const data = await API.startExam(pendingName, pendingEmail);

    sessionStorage.setItem(
      "exam_session",
      JSON.stringify({
        session_id: data.session_id,
        name: data.name,
        exam_deadline: data.exam_deadline,
        sections: data.sections,
        completed: [],
        section_results: {},
      })
    );

    window.location.href = "exam.html";
  } catch (err) {
    showError(beginError, err.message || "Could not start the assessment. Please try again.");
    setLoading(false);
  }
});

function setLoading(isLoading) {
  beginBtn.disabled = isLoading;
  beginBtn.textContent = isLoading ? "Starting..." : "Begin assessment";
}

function showError(el, message) {
  el.textContent = message;
  el.classList.add("visible");
}
