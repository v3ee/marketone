document.getElementById("currentYear").textContent = new Date().getFullYear();

const textarea = document.querySelector(".chat-input");
const sendBtn = document.getElementById("sendBtn");
const messagesContainer = document.querySelector(".messages-container");
const fileInput = document.getElementById("fileInput");
const attachBtn = document.querySelector(".attach-btn");
const heroSection = document.querySelector(".hero-section");

let uploadedContent = "";
let isSending = false;

const ENDPOINT = "https://proud-sunset-cc1d.vijaykumarkvl-b.workers.dev";

// Auto-resize textarea
textarea.addEventListener('input', function() {
    this.style.height = '96px';
    this.style.height = (this.scrollHeight) + 'px';
});

/* ADD MESSAGE */
function addMessage(type, text) {
    const message = document.createElement("div");
    message.classList.add("message", type);
    const bubble = document.createElement("div");
    bubble.classList.add("bubble");
    
    // MARKDOWN RENDER
    bubble.innerHTML = marked.parse(text);
    message.appendChild(bubble);
    messagesContainer.appendChild(message);

    // HIGHLIGHT CODE & ADD COPY BUTTON
    document.querySelectorAll("pre code").forEach((block) => {
        hljs.highlightElement(block);
    });
    
    document.querySelectorAll("pre").forEach(pre => {
        if (pre.querySelector(".copy-btn")) return;
        
        const button = document.createElement("button");
        button.innerText = "Copy";
        button.classList.add("copy-btn");
        button.onclick = () => {
            const code = pre.querySelector("code")?.innerText || pre.innerText;
            navigator.clipboard.writeText(code);
            button.innerText = "Copied!";
            setTimeout(() => button.innerText = "Copy", 1500);
        };
        pre.appendChild(button);
    });

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/* TYPE MESSAGE (Streaming effect) */
/* TYPE MESSAGE (Streaming effect) */
async function typeMessage(text) {
    const message = document.createElement("div");
    message.classList.add("message", "ai");
    
    const bubble = document.createElement("div");
    bubble.classList.add("bubble");
    message.appendChild(bubble);
    messagesContainer.appendChild(message);

    let currentText = "";
    for (let i = 0; i < text.length; i++) {
        currentText += text[i];
        bubble.innerHTML = marked.parse(currentText);
        
        // Highlight code as it appears
        document.querySelectorAll("pre code").forEach((block) => {
            hljs.highlightElement(block);
        });
        
        document.querySelectorAll("pre").forEach(pre => {
            if (pre.querySelector(".copy-btn")) return;
            
            const button = document.createElement("button");
            button.innerText = "Copy";
            button.classList.add("copy-btn");
            button.onclick = () => {
                const code = pre.querySelector("code")?.innerText || pre.innerText;
                navigator.clipboard.writeText(code);
                button.innerText = "Copied!";
                setTimeout(() => button.innerText = "Copy", 1500);
            };
            pre.appendChild(button);
        });

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        await new Promise(resolve => setTimeout(resolve, 15)); // Increased from 8ms to 15ms
    }
    
    // Re-enable inputs ONLY after typing completes
    isSending = false;
    sendBtn.disabled = false;
    attachBtn.disabled = false;
    textarea.disabled = false;
    sendBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send`;
}

/* SEND MESSAGE */
async function sendMessage() {
    if (isSending) return;
    
    const value = textarea.value.trim();
    if (value === "") return;

    // USER MESSAGE
    addMessage("user", value);

    if (heroSection) heroSection.style.display = "none";

    textarea.value = "";
    textarea.style.height = "96px";
    isSending = true;
    
    // Disable inputs
    sendBtn.disabled = true;
    attachBtn.disabled = true;
    textarea.disabled = true;
    sendBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Thinking`;

    try {
        // FINAL PROMPT
        const finalPrompt = uploadedContent
            ? `
You are Marketone AI Studio, an enterprise AI assistant.

Capabilities:
- Validate HTML/email code
- Fix frontend code
- Analyze documents
- Answer from uploaded files
- Compare QA checklists
- Generate HTML email templates
- Summarize SOP/process documents
- Explain technical content

IMPORTANT: Answer ONLY from uploaded document if relevant.

User Request:
${value}

Uploaded Document Content:
${uploadedContent.substring(0, 15000)}
`
            : `
You are Marketone AI Studio, an enterprise AI assistant.

Capabilities:
- Validate HTML/email code
- Fix frontend code
- Generate HTML email templates
- Explain technical content
- Answer questions accurately

User Request:
${value}
`;

        const response = await fetch(ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: finalPrompt }]
                }]
            })
        });

        const data = await response.json();
        console.log("AI Response:", JSON.stringify(data, null, 2));

        // ERROR HANDLING
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            const errorMsg = data.error?.message || "No AI response received.";
            addMessage("ai", `❌ Error: ${errorMsg}`);
            isSending = false;
            sendBtn.disabled = false;
            attachBtn.disabled = false;
            textarea.disabled = false;
            sendBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send`;
            return;
        }

        const aiText = data.candidates[0].content.parts[0].text;

        // AI MESSAGE (typing effect keeps button disabled)
        await typeMessage(aiText);

    } catch (error) {
        console.error("Error:", error);
        isSending = false;
        sendBtn.disabled = false;
        attachBtn.disabled = false;
        textarea.disabled = false;
        sendBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send`;
        
        addMessage("ai", `❌ Error: ${error.message || "Something went wrong. Please try again."}`);
    }
}

/* SEND BUTTON */
sendBtn.addEventListener("click", sendMessage);

/* ENTER KEY */
textarea.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

/* ATTACH BUTTON */
attachBtn.addEventListener("click", () => {
    fileInput.click();
});

/* FILE UPLOAD */
fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name;
    const extension = fileName.split(".").pop().toLowerCase();
    
    const uploadMessage = document.createElement("div");
    uploadMessage.classList.add("message", "user");
    uploadMessage.innerHTML = `<div class="bubble uploading">📎 Uploading ${fileName}...</div>`;
    messagesContainer.appendChild(uploadMessage);

    try {
        // TXT / HTML
        if (extension === "txt" || extension === "html" || extension === "htm") {
            uploadedContent = await file.text();
        }
        // PDF
        else if (extension === "pdf") {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let text = "";
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const strings = content.items.map(item => item.str);
                text += strings.join(" ");
            }
            uploadedContent = text;
        }
        // DOCX / DOC
        else if (extension === "docx" || extension === "doc") {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            uploadedContent = result.value || "";
        }
        // EXCEL
        else if (extension === "xlsx" || extension === "xls") {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer);
            let excelText = "";
            workbook.SheetNames.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                excelText += JSON.stringify(json);
            });
            uploadedContent = excelText;
        }
        else {
            uploadedContent = "";
        }

        console.log("Uploaded content:", uploadedContent);
        uploadMessage.querySelector(".bubble").innerHTML = `✅ ${fileName} uploaded successfully`;
        
        // Add confirmation message
        addMessage("ai", `📄 I've read your file: **${fileName}**\n\nYou can now ask questions about it!`);
        
    } catch (error) {
        console.error("File error:", error);
        uploadMessage.querySelector(".bubble").innerHTML = `❌ Failed to read ${fileName}`;
        addMessage("ai", `❌ Unable to read this file. Please try another format.`);
    }
    
    // Clear file input
    fileInput.value = "";
});

/* DRAG DROP */
const chatWrapper = document.querySelector(".chat-wrapper");

chatWrapper.addEventListener("dragover", (e) => {
    e.preventDefault();
    chatWrapper.classList.add("dragover");
});

chatWrapper.addEventListener("dragleave", () => {
    chatWrapper.classList.remove("dragover");
});

chatWrapper.addEventListener("drop", (e) => {
    e.preventDefault();
    chatWrapper.classList.remove("dragover");
    
    if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        const event = new Event("change");
        fileInput.dispatchEvent(event);
    }
});
