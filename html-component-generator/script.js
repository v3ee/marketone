let lastGeneratedHtml = "";
let activeController = null;

const contentInput = document.getElementById("contentInput");
const layoutSelect = document.getElementById("layoutSelect");
const designSelect = document.getElementById("designSelect");
const toneInput = document.getElementById("toneInput");
const generateBtn = document.getElementById("generateBtn");
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const statusEl = document.getElementById("status");
const tokenCountEl = document.getElementById("tokenCount");
const outputCodeEl = document.getElementById("outputCode");
const currentYear = document.getElementById("currentYear");

currentYear.textContent = new Date().getFullYear();

const desktopToggle = document.getElementById("desktopToggle");
const mobileToggle = document.getElementById("mobileToggle");
const desktopPreviewWrap = document.getElementById("desktopPreviewWrap");
const mobilePreviewWrap = document.getElementById("mobilePreviewWrap");

if (desktopToggle && mobileToggle) {
  desktopToggle.addEventListener("click", () => {
    desktopPreviewWrap.classList.add("active");
    mobilePreviewWrap.classList.remove("active");
    desktopToggle.classList.add("active");
    mobileToggle.classList.remove("active");
  });
  mobileToggle.addEventListener("click", () => {
    mobilePreviewWrap.classList.add("active");
    desktopPreviewWrap.classList.remove("active");
    mobileToggle.classList.add("active");
    desktopToggle.classList.remove("active");
  });
}

const API_KEY = "AIzaSyAoxzPHwhsT1UtoEndHlATrH878yiVtI2g";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(API_KEY);

function setStatus(text) {
  statusEl.textContent = text;
}

function updateTokenEstimate() {
  const text = contentInput.value.trim();
  const estimate = text ? Math.ceil(text.length / 4) : 0;
  tokenCountEl.textContent = estimate ? "Approx. input tokens: " + estimate : "";
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function isRetryable(status) {
  return status === 429 || status === 500 || status === 503;
}

async function fetchWithRetry(url, options, attempts) {
  attempts = attempts || 3;
  var lastErr = null;
  for (var i = 0; i < attempts; i++) {
    try {
      var res = await fetch(url, options);
      if (res.ok) return res;
      var text = await res.text().catch(function() { return ""; });
      if (!isRetryable(res.status) || i === attempts - 1) {
        throw new Error("Gemini error " + res.status + (text ? ": " + text : ""));
      }
      console.warn("Attempt " + (i + 1) + " failed (" + res.status + "), retrying...");
      await sleep(800 * Math.pow(2, i));
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1) throw err;
      await sleep(800 * Math.pow(2, i));
    }
  }
  throw lastErr || new Error("Request failed.");
}

function buildCardsFromContent() {
  var raw = contentInput.value.trim();
  if (!raw) return [];

  var instructionPhrases = [
    "create html", "generate html", "make html", "build html",
    "create a", "generate a", "make a",
    "with this content", "using this content", "for this content",
    "column layout", "card layout", "grid layout"
  ];

  return raw
    .split(/\n+/)
    .map(function(s) { return s.trim(); })
    .filter(Boolean)
    .filter(function(line) {
      var lower = line.toLowerCase();
      return !instructionPhrases.some(function(phrase) { return lower.indexOf(phrase) !== -1; });
    })
    .map(function(line) {
      return line.replace(/^\d+[.)]\s*/, "").replace(/^[•\-#*]\s*/, "").trim();
    })
    .filter(Boolean);
}

function getStyleRules(style) {
  var map = {
    modern: {
      bodyBg: "#f5f7fb",
      cardBg: "#ffffff",
      border: "1px solid #e5e7eb",
      radius: "16px",
      padding: "30px 24px",
      badgeBg: "#0f62fe",
      badgeColor: "#fff",
      titleColor: "#111827",
      titleSize: "18px",
      titleWeight: "600",
      shadow: "0 12px 30px rgba(0,0,0,0.10)",
      extra: ""
    },
    minimal: {
      bodyBg: "#ffffff",
      cardBg: "#ffffff",
      border: "1px solid #f0f0f0",
      radius: "8px",
      padding: "28px 22px",
      badgeBg: "#111827",
      badgeColor: "#ffffff",
      titleColor: "#374151",
      titleSize: "16px",
      titleWeight: "500",
      shadow: "0 4px 12px rgba(0,0,0,0.06)",
      extra: "letter-spacing:-0.01em;"
    },
    card: {
      bodyBg: "#f0f4ff",
      cardBg: "#ffffff",
      border: "none",
      radius: "20px",
      padding: "32px 28px",
      badgeBg: "#6366f1",
      badgeColor: "#ffffff",
      titleColor: "#1e1b4b",
      titleSize: "17px",
      titleWeight: "600",
      shadow: "0 8px 32px rgba(99,102,241,0.15)",
      extra: "box-shadow:0 2px 8px rgba(0,0,0,0.06);"
    },
    premium: {
      bodyBg: "#0f0f13",
      cardBg: "#1a1a24",
      border: "1px solid rgba(255,255,255,0.08)",
      radius: "18px",
      padding: "32px 26px",
      badgeBg: "#f59e0b",
      badgeColor: "#0f0f13",
      titleColor: "#f1f1f1",
      titleSize: "18px",
      titleWeight: "600",
      shadow: "0 16px 40px rgba(0,0,0,0.4)",
      extra: ""
    }
  };
  return map[style] || map.modern;
}

function buildPrompt(lines, layout, style, tone) {
  var s = getStyleRules(style);
  var cardsCount = lines.length;

  var numberedCards = lines.map(function(line, i) {
    return "CARD " + (i + 1) + ": " + line;
  }).join("\n");

  console.log("Sending " + cardsCount + " cards | " + layout + "-col | style:" + style);
  console.log(numberedCards);

  var cssBlock = [
    "body{margin:0;padding:24px;background:" + s.bodyBg + ";font-family:Arial,sans-serif;box-sizing:border-box}",
    ".grid{display:grid;grid-template-columns:repeat(" + layout + ",1fr);gap:24px;width:100%;box-sizing:border-box}",
    "@media(max-width:992px){.grid{grid-template-columns:repeat(2,1fr)}}",
    "@media(max-width:600px){.grid{grid-template-columns:1fr}}",
    ".card{background:" + s.cardBg + ";border:" + s.border + ";border-radius:" + s.radius + ";padding:" + s.padding + ";transition:transform 0.25s ease,box-shadow 0.25s ease;" + s.extra + "}",
    ".card:hover{transform:translateY(-5px);box-shadow:" + s.shadow + "}",
    ".badge{width:36px;height:36px;background:" + s.badgeBg + ";color:" + s.badgeColor + ";border-radius:50%;font-weight:700;display:flex;justify-content:center;align-items:center;font-size:15px}",
    ".title{font-size:" + s.titleSize + ";font-weight:" + s.titleWeight + ";color:" + s.titleColor + ";margin-top:16px;line-height:1.4}"
  ].join("\n");

  return [
    "Return ONLY a raw HTML document. No markdown, no code fences, no explanation.",
    "Start immediately with <!DOCTYPE html> and end with </html>.",
    "",
    "YOU MUST CREATE EXACTLY " + cardsCount + " CARDS.",
    "One card per CARD line. Do NOT add extra cards. Do NOT invent content.",
    "",
    "CARDS (" + cardsCount + " total):",
    numberedCards,
    "",
    "REQUIRED CSS — use exactly as written:",
    cssBlock,
    "",
    "TONE: " + tone,
    "",
    "HTML STRUCTURE TO USE:",
    "<!DOCTYPE html>",
    "<html><head><meta charset=UTF-8><meta name=viewport content='width=device-width,initial-scale=1'>",
    "<title>Component</title><style>/* paste CSS here */</style></head>",
    "<body><div class=grid>",
    "  <!-- one .card div per CARD above -->",
    "  <div class=card><div class=badge>1</div><div class=title>CARD 1 text</div></div>",
    "</div></body></html>",
    "",
    "Now generate the complete HTML with all " + cardsCount + " cards:"
  ].join("\n");
}

function extractHtml(text) {
  if (!text) return "";
  var s = text.trim()
    .replace(/^```html\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  var di = s.toLowerCase().indexOf("<!doctype html>");
  if (di > -1) {
    s = s.slice(di);
  } else {
    var hi = s.toLowerCase().indexOf("<html");
    if (hi > -1) s = "<!DOCTYPE html>\n" + s.slice(hi);
  }
  var last = s.toLowerCase().lastIndexOf("</html>");
  if (last > -1) s = s.slice(0, last + 7);
  return s.trim();
}

function htmlLooksComplete(html) {
  if (!html || html.length < 300) return false;
  var l = html.toLowerCase();
  return l.indexOf("<!doctype") !== -1 &&
         l.indexOf("<html") !== -1 &&
         l.indexOf("<body") !== -1 &&
         l.indexOf("</html>") !== -1 &&
         l.indexOf("<style") !== -1 &&
         l.indexOf("viewport") !== -1;
}

async function generateHtml(signal) {
  var lines = buildCardsFromContent();
  if (!lines.length) throw new Error("No content — please enter content first.");

  var layout = Number(layoutSelect.value) || 4;
  var style  = designSelect.value || "modern";
  var tone   = toneInput.value.trim() || "clean feature section";
  var prompt = buildPrompt(lines, layout, style, tone);

  console.log("Sending prompt to gemini-2.5-flash...");

  var body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      topP: 0.9,
      maxOutputTokens: 8192
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
    ]
  };

  var res = await fetchWithRetry(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: signal
  });

  var data = await res.json();
  if (data.error) throw new Error(data.error.message || "Gemini API error");

  var parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  var raw = parts.map(function(p) { return p.text || ""; }).join("").trim();

  console.log("Raw response length:", raw.length);
  if (!raw) throw new Error("Empty response from Gemini — try again.");

  var html = extractHtml(raw);
  if (!htmlLooksComplete(html)) throw new Error("Incomplete HTML returned — try again.");

  return { html: html, count: lines.length };
}

function updatePreview(html) {
  var d = document.getElementById("desktopPreview");
  var m = document.getElementById("mobilePreview");
  if (d) d.srcdoc = html;
  if (m) m.srcdoc = html;
}

function updateOutput(html) {
  lastGeneratedHtml = html;
  outputCodeEl.textContent = html;
  updatePreview(html);
}

function setGeneratingState(on) {
  generateBtn.disabled = on;
  generateBtn.textContent = on ? "Generating..." : "Generate HTML";
  generateBtn.style.opacity = on ? "0.7" : "1";
  generateBtn.style.cursor = on ? "not-allowed" : "pointer";
}

generateBtn.addEventListener("click", async function() {
  if (!buildCardsFromContent().length) {
    setStatus("Please enter content first.");
    return;
  }

  if (activeController) activeController.abort();
  activeController = new AbortController();

  setGeneratingState(true);
  setStatus("Generating with gemini-2.5-flash...");

  try {
    var result = await generateHtml(activeController.signal);
    updateOutput(result.html);
    setStatus("Done — " + result.count + " cards, " + layoutSelect.value + "-col " + designSelect.value + " layout.");
  } catch (err) {
    if (err.name === "AbortError") {
      setStatus("Cancelled.");
    } else {
      console.error("Generation error:", err);
      setStatus("Error: " + err.message);
    }
  } finally {
    setGeneratingState(false);
    activeController = null;
  }
});

copyBtn.addEventListener("click", async function() {
  if (!lastGeneratedHtml) { setStatus("Generate HTML first."); return; }
  try {
    await navigator.clipboard.writeText(lastGeneratedHtml);
    setStatus("Copied to clipboard.");
  } catch (e) {
    setStatus("Clipboard copy failed.");
  }
});

downloadBtn.addEventListener("click", function() {
  if (!lastGeneratedHtml) { setStatus("Generate HTML first."); return; }
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lastGeneratedHtml], { type: "text/html;charset=utf-8" }));
  a.download = "component-" + Date.now() + ".html";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setStatus("Downloaded.");
});

contentInput.addEventListener("input", updateTokenEstimate);
updateTokenEstimate();
setStatus("Ready. Enter content and click Generate HTML.");