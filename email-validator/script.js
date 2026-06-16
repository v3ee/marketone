const API_URL = "https://flat-snow-1569.vijaykumarkvl-b.workers.dev/validate";

document.getElementById("currentYear").textContent = new Date().getFullYear();

document.getElementById("singleBtn").addEventListener("click", validateEmail);
document.getElementById("bulkBtn").addEventListener("click", processExcel);

async function validateEmail() {
  const email = document.getElementById("email").value.trim();
  const resultDiv = document.getElementById("singleResult");

  if (!email) {
    resultDiv.innerHTML = `<span class="error">Please enter an email address.</span>`;
    return;
  }

  resultDiv.textContent = "Checking...";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (data.valid) {
      resultDiv.innerHTML = `<span class="success">✅ Valid Email</span>`;
    } else {
      resultDiv.innerHTML = `<span class="error">❌ ${escapeHtml(data.message || "Invalid email")}</span>`;
    }
  } catch (error) {
    resultDiv.innerHTML = `<span class="error">Server Error</span>`;
  }
}

async function processExcel() {
  const fileInput = document.getElementById("excelFile");
  const file = fileInput.files[0];

  if (!file) {
    alert("Please select a file");
    return;
  }

  const bulkStatus = document.getElementById("bulkStatus");
  const tbody = document.querySelector("#resultTable tbody");
  const bulkBtn = document.getElementById("bulkBtn");

  bulkBtn.disabled = true;
  tbody.innerHTML = "";
  bulkStatus.textContent = "Reading file...";

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

    const emails = jsonData
      .map(row => {
        const keys = Object.keys(row);
        if (!keys.length) return "";
        return String(row[keys[0]] || "").trim();
      })
      .filter(Boolean);

    if (emails.length === 0) {
      bulkStatus.innerHTML = `<span class="error">No emails found in the file.</span>`;
      bulkBtn.disabled = false;
      return;
    }

    if (emails.length > 200) {
      bulkStatus.innerHTML = `<span class="error">Maximum 200 emails allowed.</span>`;
      bulkBtn.disabled = false;
      return;
    }

    bulkStatus.textContent = `Processing ${emails.length} emails...`;

    for (const email of emails) {
      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
        });

        const result = await response.json();
        const row = document.createElement("tr");

        row.innerHTML = `
          <td>${escapeHtml(email)}</td>
          <td class="${result.valid ? "success" : "error"}">
            ${result.valid ? "VALID" : "INVALID"}
          </td>
        `;

        tbody.appendChild(row);
      } catch (error) {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${escapeHtml(email)}</td>
          <td class="error">ERROR</td>
        `;
        tbody.appendChild(row);
      }
    }

    bulkStatus.innerHTML = `<span class="success">Completed</span>`;
  } catch (error) {
    bulkStatus.innerHTML = `<span class="error">Failed to process file.</span>`;
  } finally {
    bulkBtn.disabled = false;
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}