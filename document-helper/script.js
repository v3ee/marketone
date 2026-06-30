let fullText = "";
let chunks = [];
let fileReady = false;
let chatHistory = [];
let activeAbortController = null;

const fileInput = document.getElementById("fileInput");
const statusEl = document.getElementById("status");
const chatSection = document.getElementById("chatSection");
const messagesEl = document.getElementById("messages");
const questionInput = document.getElementById("questionInput");
const sendBtn = document.getElementById("sendBtn");

document.getElementById("currentYear").textContent = new Date().getFullYear();

const pdfjsLib = window["pdfjs-dist/build/pdf"] || window.pdfjsLib;
if (pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "./assets/pdfjs/pdf.worker.min.js";
}

fileInput.addEventListener("change", handleFileUpload);
sendBtn.addEventListener("click", handleSendGemini);
questionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSendGemini();
  }
});

function setStatus(text) {
  statusEl.textContent = text;
}

function showChat() {
  chatSection.classList.remove("hidden");
}

function scrollMessagesToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeText(text) {
  return String(text ?? "");
}

function addMessage(role, text, opts = {}) {
  const div = document.createElement("div");
  div.className = `msg ${role}${opts.thinking ? " thinking" : ""}`;
  div.textContent = escapeText(text);
  messagesEl.appendChild(div);
  scrollMessagesToBottom();
  return div;
}

function setThinkingState(isThinking) {
  sendBtn.disabled = isThinking;
  questionInput.disabled = isThinking;
  fileInput.disabled = isThinking;
}

function splitIntoChunks(text) {
  return text
    .split(/\n\s*\n|(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function truncateText(text, maxChars) {
  if (!text || text.length <= maxChars) return text || "";
  return text.slice(0, maxChars);
}

function buildDocumentContext() {
  const maxChars = 45000;
  return truncateText(fullText, maxChars);
}

function getSystemInstruction() {
  return `
You are a document QA assistant.
Answer only from the provided document and the conversation history.
If the answer is not present in the document, say you could not find it in the document.
Be concise, factual, and helpful.
If the user asks a follow-up, use prior conversation context to resolve pronouns and references.
Do not invent details.
`.trim();
}

async function handleFileUpload() {
  const file = fileInput.files[0];
  if (!file) return;

  fileReady = false;
  fullText = "";
  chunks = [];
  chatHistory = [];
  messagesEl.innerHTML = "";
  setStatus(`Reading ${file.name}...`);

  try {
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "pdf") {
      fullText = await extractPdfText(file);
    } else if (ext === "docx") {
      fullText = await extractDocxText(file);
    } else if (ext === "xlsx") {
      fullText = await extractXlsxText(file);
    } else {
      throw new Error("Unsupported file type.");
    }

    chunks = splitIntoChunks(fullText);
    fileReady = true;
    setStatus(`Loaded ${file.name}.`);
    showChat();
    chatSection.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => {
      questionInput.focus();
    }, 150);
    addMessage("assistant", "File loaded. Ask your first question.");
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`);
    addMessage("assistant", `Sorry, I could not read that file: ${err.message}`);
  }
}

async function extractPdfText(file) {
  if (!pdfjsLib) throw new Error("PDF library not loaded.");
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  let text = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(" ") + "\n";
  }

  return text.trim();
}

async function extractDocxText(file) {
  if (!window.mammoth) throw new Error("DOCX library not loaded.");
  const data = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: data });
  return (result.value || "").trim();
}

async function extractXlsxText(file) {
  if (!window.XLSX) throw new Error("XLSX library not loaded.");
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });
  const rows = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
    rows.push(`Sheet: ${sheetName}`);
    rows.push(...sheetRows.map(row => row.join(" ")));
  }

  return rows.join("\n").trim();
}

function toGeminiContentsFromHistory(history) {
  return history.map(turn => ({
    role: turn.role,
    parts: [{ text: turn.text }]
  }));
}

function normalizeGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map(p => p.text || "").join("").trim();
  return text || "No answer returned.";
}

function isRetryableStatus(status) {
  return status === 429 || status === 500 || status === 503;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, attempts = 3) {
  let lastErr = null;

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;

      const text = await res.text().catch(() => "");
      if (!isRetryableStatus(res.status) || i === attempts - 1) {
        throw new Error(`Gemini request failed: ${res.status}${text ? ` - ${text}` : ""}`);
      }

      await sleep(800 * Math.pow(2, i));
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1) throw err;
      await sleep(800 * Math.pow(2, i));
    }
  }

  throw lastErr || new Error("Request failed.");
}

async function handleSendGemini() {
  const question = questionInput.value.trim();
  if (!question || !fileReady) return;

  addMessage("user", question);
  questionInput.value = "";

  const thinkingBubble = addMessage("assistant", "Thinking...", { thinking: true });
  setThinkingState(true);

  if (activeAbortController) activeAbortController.abort();
  activeAbortController = new AbortController();

  try {
    const answer = await askGemini(question, activeAbortController.signal);
    thinkingBubble.textContent = answer;
    thinkingBubble.classList.remove("thinking");
  } catch (err) {
    console.error(err);
    thinkingBubble.textContent = `Sorry, something went wrong while calling Gemini. ${err.message}`;
    thinkingBubble.classList.remove("thinking");
  } finally {
    setThinkingState(false);
  }
}

async function askGemini(question, signal) {
  const endpoint = "https://proud-sunset-cc1d.vijaykumarkvl-b.workers.dev";

  const documentContext = buildDocumentContext();

  const historyForApi = [
    {
      role: "user",
      text: `Document text:\n${documentContext}\n\nAnswer questions only from this document.`
    },
    ...chatHistory,
    {
      role: "user",
      text: question
    }
  ];

  const body = {
    systemInstruction: {
      parts: [{ text: getSystemInstruction() }]
    },
    contents: toGeminiContentsFromHistory(historyForApi),
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 700
    }
  };

  const res = await fetchWithRetry(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal
  });

  const data = await res.json();
  const answer = normalizeGeminiText(data);

  chatHistory.push(
    { role: "user", text: question },
    { role: "model", text: answer }
  );

  return answer;
}
