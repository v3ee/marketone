// ==========================================================
// api.js — MarketOne Security Awareness Exam
// ==========================================================

const WORKER_BASE_URL = "https://marketone-security-exam-api.vijaykumarkvl-b.workers.dev";

async function apiPost(path, body, extraHeaders = {}) {
  const res = await fetch(`${WORKER_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}

async function apiGet(path, extraHeaders = {}) {
  const res = await fetch(`${WORKER_BASE_URL}${path}`, { headers: extraHeaders });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const API = {
  startExam: (name, email) => apiPost("/api/start", { name, email }),

  generateSection: (session_id, section) =>
    apiPost("/api/generate-section", { session_id, section }),

  submitSection: (session_id, test_id, answers) =>
    apiPost("/api/submit-section", { session_id, test_id, answers }),

  finishExam: (session_id) => apiPost("/api/finish", { session_id }),

  adminResults: (token) =>
    apiGet("/api/admin/results", { Authorization: `Bearer ${token}` }),

  adminDeleteResult: (token, session_id) =>
    apiPost("/api/admin/delete-result", { session_id }, { Authorization: `Bearer ${token}` }),
};
