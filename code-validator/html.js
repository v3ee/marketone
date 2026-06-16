require.config({
    paths: {
        vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs"
    }
});

let editor;

require(["vs/editor/editor.main"], function () {
    editor = monaco.editor.create(
        document.getElementById("editor"),
        {
            value: "<!-- Paste your code here -->",
            language: "html",
            theme: "vs-dark",
            automaticLayout: true,
            minimap: { enabled: false }
        }
    );
    editor.onDidChangeModelContent(() => { updateButtons(); });
});

// =========================
// DETECT LANGUAGE
// =========================
function detectLanguage(code) {
    code = code.trim();
    if (
        code.includes("<html") ||
        code.includes("<div") ||
        code.includes("<body") ||
        code.includes("<head") ||
        code.includes("<script") ||
        code.includes("<style")
    ) return "html";

    if (
        code.includes("{") &&
        code.includes(":") &&
        code.includes(";") &&
        !code.includes("function")
    ) return "css";

    return "js";
}

// =========================
// PRE-CLEAN
// MUST run before joinMultilineTags.
// Fixes things that break the tag-joiner:
// 1. </script\n       →  </script>\n   (closing tag missing >)
// 2. href="style.css  →  href="style.css"  (unclosed quote, odd quote count)
// 3. href="../x.png" /\n  →  href="../x.png" />\n  (line ends with / not />)
// =========================
function preClean(code) {
    const lines = code.split("\n");
    return lines.map(line => {
        const trimmed = line.trim();
        if (trimmed === "" || trimmed.startsWith("<!--") || trimmed.startsWith("<!")) return line;

        // FIX 1: closing tag missing > at end of line
        // </script  →  </script>
        if (/<\/[a-zA-Z][a-zA-Z0-9]*\s*$/.test(trimmed)) {
            line = line.replace(/<\/([a-zA-Z][a-zA-Z0-9]*)\s*$/, '</$1>');
        }

        // FIX 2: line ends with / but not /> — self-closing tag missing >
        // <link ... /   →   <link ... />
        if (trimmed.endsWith(" /") || (trimmed.endsWith("/") && !trimmed.endsWith("/>"))) {
            // Only fix if this looks like a tag (starts with <)
            if (trimmed.startsWith("<") && !trimmed.startsWith("<!--")) {
                line = line.trimEnd() + ">";
            }
        }

        // FIX 3: unclosed attribute quote at end of line (odd quote count)
        // href="style.css  →  href="style.css"
        const quoteCount = (line.match(/"/g) || []).length;
        if (
            quoteCount % 2 !== 0 &&
            !trimmed.endsWith(">") &&
            !trimmed.endsWith("/>")
        ) {
            line = line.trimEnd() + '"';
        }

        return line;
    }).join("\n");
}

// =========================
// JOIN MULTILINE TAGS
// Fixes tags split across lines.
// KEY FIX: comments (<!--) also force-close the buffer,
// otherwise a comment after an unclosed tag gets swallowed into it.
// =========================
function joinMultilineTags(code) {
    const lines = code.split("\n");
    const out = [];
    let buffer = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (buffer !== null) {
            // Force-close buffer if a new tag OR comment starts
            if (
                (trimmed.startsWith("<") && !trimmed.startsWith("</")) ||
                trimmed.startsWith("<!--")
            ) {
                out.push(buffer.replace(/\s{2,}/g, " ").trim() + ">");
                buffer = null;
                i--; // re-process this line
            } else {
                buffer += (trimmed === "" ? "" : " " + trimmed);
                if (buffer.includes(">")) {
                    out.push(buffer.replace(/\s{2,}/g, " ").trim());
                    buffer = null;
                }
            }
        } else {
            const isComment = trimmed.startsWith("<!--");
            const isDoctype = trimmed.startsWith("<!");
            const isEmpty = trimmed === "";

            if (!isComment && !isDoctype && !isEmpty && trimmed.startsWith("<")) {
                const opens = (trimmed.match(/</g) || []).length;
                const closes = (trimmed.match(/>/g) || []).length;
                if (opens > closes) {
                    buffer = trimmed;
                } else {
                    out.push(line);
                }
            } else {
                out.push(line);
            }
        }
    }

    if (buffer !== null) {
        out.push(buffer.replace(/\s{2,}/g, " ").trim() + ">");
    }

    return out.join("\n");
}

// =========================
// PRE-CHECK HTML ISSUES
// Catches things HTMLHint silently misses
// =========================
function preCheckHTML(code) {
    const errors = [];
    const lines = code.split("\n");
    lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed === "" || trimmed.startsWith("<!--") || trimmed.startsWith("<!")) return;

        // Unclosed attribute quote at end of line
        const quoteCount = (trimmed.match(/"/g) || []).length;
        if (
            quoteCount % 2 !== 0 &&
            !trimmed.endsWith(">") &&
            !trimmed.endsWith("/>")
        ) {
            errors.push(`❌ Line ${i + 1}<br><br>Unclosed attribute quote — e.g. <code>href="style.css</code> is missing the closing <code>"</code>`);
        }

        // Closing tag missing >
        if (/<\/[a-zA-Z][a-zA-Z0-9]*\s*$/.test(trimmed)) {
            errors.push(`❌ Line ${i + 1}<br><br>Closing tag missing <code>&gt;</code> — e.g. <code>&lt;/script</code> should be <code>&lt;/script&gt;</code>`);
        }

        // Self-closing tag ending with / instead of />
        if (
            trimmed.startsWith("<") &&
            !trimmed.startsWith("<!--") &&
            (trimmed.endsWith(" /") || (trimmed.endsWith("/") && !trimmed.endsWith("/>")))
        ) {
            errors.push(`❌ Line ${i + 1}<br><br>Self-closing tag missing <code>&gt;</code> — e.g. <code>/</code> should be <code>/&gt;</code>`);
        }
    });
    return errors;
}

// =========================
// VALIDATE CODE
// =========================
async function validateCode() {
    const code = editor.getValue();
    const output = document.getElementById("output");
    output.innerHTML = "";
    const language = detectLanguage(code);

    if (language === "html") {
        const preErrors = preCheckHTML(code);
        if (preErrors.length > 0) {
            preErrors.forEach(e => {
                output.innerHTML += `<div class="error">${e}</div>`;
            });
            document.getElementById("fixBtn").style.display = "inline-block";
            return;
        }

        const result = HTMLHint.HTMLHint.verify(code, {
            "doctype-first": false,
            "tag-pair": true,
            "attr-value-double-quotes": true,
            "spec-char-escape": true
        });

        if (result.length === 0) {
            output.innerHTML = `<div class="success">✅ No HTML errors found</div>`;
            document.getElementById("fixBtn").style.display = "none";
        } else {
            result.forEach(error => {
                let message = error.message;
                if (message.includes("Tag must be paired")) message = "Missing closing tag detected.";
                if (message.includes("Special characters")) message = "Broken HTML syntax detected.";
                output.innerHTML += `<div class="error">❌ Line ${error.line}<br><br>${message}</div>`;
            });
            document.getElementById("fixBtn").style.display = "inline-block";
        }

    } else if (language === "css") {
        validateCSS(code);

    } else {
        const linter = new eslint.Linter();
        const messages = linter.verify(code, {
            rules: {
                semi: 2,
                "no-unused-vars": 1,
                "no-undef": 1,
                "eqeqeq": 1
            }
        });

        if (messages.length === 0) {
            output.innerHTML = `<div class="success">✅ No JS errors found</div>`;
            document.getElementById("fixBtn").style.display = "none";
        } else {
            messages.forEach(msg => {
                output.innerHTML += `<div class="error"><strong>Line ${msg.line}</strong><br>${msg.message}</div>`;
            });
            document.getElementById("fixBtn").style.display = "inline-block";
        }
    }
}

// =========================
// FORMAT CODE
// =========================
async function formatCode() {
    const code = editor.getValue();
    const output = document.getElementById("output");
    const language = detectLanguage(code);

    let parser = "html";
    if (language === "css") parser = "scss";
    if (language === "js") parser = "babel";

    if (language === "html") {
        const result = HTMLHint.HTMLHint.verify(code, {
            "doctype-first": false,
            "tag-pair": true,
            "attr-value-double-quotes": true,
            "spec-char-escape": true
        });
        if (result.length > 0) {
            output.innerHTML = `<div class="error">❌ Fix HTML errors first</div>`;
            return;
        }
    }

    try {
        const formatted = await prettier.format(code, {
            parser,
            plugins: prettierPlugins,
            htmlWhitespaceSensitivity: "ignore"
        });
        editor.getModel().setValue(formatted);
        output.innerHTML = `<div class="success">✅ Code formatted successfully</div>`;
    } catch (error) {
        output.innerHTML = `<div class="error">${error.message}</div>`;
    }
}

// =========================
// APPLY FIX
// =========================
async function applyFix() {
    let code = editor.getValue();
    const output = document.getElementById("output");
    const language = detectLanguage(code);

    // CSS FIXER
    if (language === "css") {
        const fixed = await fixCSS(code);
        editor.getModel().setValue(fixed);
        output.innerHTML = `<div class="success">✅ CSS auto-fixed successfully</div>`;
        return;
    }

    // JS FIXER
    if (language === "js") {
        const fixed = await fixJS(code);
        editor.getModel().setValue(fixed);
        output.innerHTML = `<div class="success">✅ JS auto-fixed successfully</div>`;
        return;
    }

    // HTML FIXER
    try {
        // STEP 1: PRE-CLEAN — must be before joinMultilineTags
        // Fixes: </script (missing >), href="x.png" / (missing >), unclosed quotes
        code = preClean(code);

        // STEP 2: JOIN MULTILINE TAGS
        // Comments now also force-close the buffer
        code = joinMultilineTags(code);

        // STEP 3: NORMALIZE — split only on >< boundaries
        code = code.replace(/></g, ">\n<");


        // STEP 4: FIX EACH LINE
        let lines = code.split("\n");

        lines = lines.map(line => {
            const trimmed = line.trim();
            if (trimmed === "" || trimmed.startsWith("<!--") || trimmed.startsWith("<!")) return line;

            // FIX 1: stray lone >
            if (trimmed === ">") return "";

            // FIX 2: missing < on opening tag at line start
            line = line.replace(/^(\s*)([a-zA-Z][a-zA-Z0-9]*)>/, '$1<$2>');
            line = line.replace(/^(\s*)([a-zA-Z][a-zA-Z0-9]*)\s+([\w-]+=["'])/, (match, indent, tag, rest) => {
                if (line.trim().startsWith('<')) return match;
                return `${indent}<${tag} ${rest}`;
            });

            // FIX 3: missing < on closing tag at line start
            line = line.replace(/^(\s*)\/([a-zA-Z][a-zA-Z0-9]*\s*>)/, '$1</$2');

            // FIX 4: inline /div> after content
            line = line.replace(/([^<])\/(([a-zA-Z][a-zA-Z0-9]*)\s*>)/g, '$1</$2');

            // FIX 5: title>text</title> — missing < inline
            line = line.replace(/(?<![<\/\w])([a-zA-Z][a-zA-Z0-9]*)>([^<]+)<\/\1>/g, '<$1>$2</$1>');

            // FIX 6: invalid tag names
            line = line.replace(/<di>/g, "<div>");
            line = line.replace(/<\/di>/g, "</div>");

            // FIX 7: attr="value />  — unclosed quote before />
            line = line.replace(/(\w+)="([^"]*?)\s*\/>/g, '$1="$2" />');

            // FIX 8: src="url"</tag> — missing > before </
            line = line.replace(/("[^"]*")<\//g, '$1></');

            // FIX 9: onclick="fn()>text — missing closing quote (fn call before >)
            line = line.replace(/(\w+)="([^"]*\))>([^<"]*)</g, '$1="$2">$3<');

            // FIX 10: style="display: none;>  — value ends with ; before >
            // Must come BEFORE generic fixes to avoid over-matching
            line = line.replace(/(\w+)="([^"]*);>/g, '$1="$2;">');

            // FIX 11: attr="val nextattr=  — missing closing quote, no comma
            line = line.replace(/(\w+)="([^",]*?)\s+([\w-]+=)/g, '$1="$2" $3');
            line = line.replace(/(\w+)="([^",]*?)\s+([\w-]+=)/g, '$1="$2" $3');
            line = line.replace(/(\w+)="([^",]*?)\s+([\w-]+=)/g, '$1="$2" $3');

            // FIX 12: class="container> — unclosed quote before >
            line = line.replace(/(class|id)="([^">]+)>/g, '$1="$2">');

            // FIX 13: unquoted attributes
            line = line.replace(/\b(class|id|src|href|type|name|value)=([^\s">]+)/g, '$1="$2"');

            // FIX 14: </tagname without > at end of line
            line = line.replace(/<\/([a-zA-Z0-9]+)\s*$/g, "</$1>");

            // FIX 15: open tag missing closing >
            if (
                line.trim().startsWith("<") &&
                !line.trim().startsWith("</") &&
                !line.trim().startsWith("<!--") &&
                !line.trim().startsWith("<!") &&
                !line.trim().endsWith(">") &&
                !line.trim().endsWith("/>")
            ) line += ">";

            return line;
        });

        code = lines.join("\n");

        // STEP 5: FORMAT WITH PRETTIER
        const formatted = await prettier.format(code, {
            parser: "html",
            plugins: prettierPlugins,
            tabWidth: 2,
            useTabs: false,
            htmlWhitespaceSensitivity: "ignore"
        });

        editor.getModel().setValue(formatted.trim());
        output.innerHTML = `<div class="success">✅ Code auto-fixed successfully</div>`;

    } catch (error) {
        console.log(error);
        output.innerHTML = `<div class="error">❌ Auto-fix failed<br><br>${error.message}</div>`;
    }
}

// =========================
// MINIFY CODE
// =========================
async function minifyCode() {
    const code = editor.getValue();
    const output = document.getElementById("output");
    const language = detectLanguage(code);

    if (language === "css") {
        const minified = await minifyCSS(code);
        editor.getModel().setValue(minified);
        output.innerHTML = `<div class="success">✅ CSS minified successfully</div>`;
        return;
    }

    if (language === "js") {
        const minified = await minifyJS(code);
        editor.getModel().setValue(minified);
        output.innerHTML = `<div class="success">✅ JS minified successfully</div>`;
        updateButtons();
        return;
    }

    try {
        const minified = await prettier.format(code, {
            parser: "html",
            plugins: prettierPlugins,
            printWidth: 100000,
            tabWidth: 0,
            useTabs: false
        });
        editor.getModel().setValue(minified.replace(/\n/g, "").replace(/\s+/g, " "));
        output.innerHTML = `<div class="success">✅ HTML minified successfully</div>`;
    } catch (error) {
        output.innerHTML = `<div class="error">❌ Minify failed</div>`;
    }
}

// =========================
// UNMINIFY CODE
// =========================
async function unminifyCode() {
    const code = editor.getValue();
    const output = document.getElementById("output");
    const language = detectLanguage(code);

    if (language === "css") {
        const unminified = await unminifyCSS(code);
        editor.getModel().setValue(unminified);
        output.innerHTML = `<div class="success">✅ CSS unminified successfully</div>`;
        return;
    }

    if (language === "js") {
        const unminified = await unminifyJS(code);
        editor.getModel().setValue(unminified);
        output.innerHTML = `<div class="success">✅ JS unminified successfully</div>`;
        updateButtons();
        return;
    }

    output.innerHTML = `<div class="error">❌ Unminify is available for CSS and JS only</div>`;
}

// =========================
// UPDATE BUTTONS
// =========================
function updateButtons() {
    const code = editor.getValue();
    const language = detectLanguage(code);
    const minified = isMinified(code);

    const formatBtn = document.getElementById("formatBtn");
    const minifyBtn = document.getElementById("minifyBtn");
    const unminifyBtn = document.getElementById("unminifyBtn");

    if (language === "html") {
        formatBtn.classList.remove("hidden");
        minifyBtn.classList.add("hidden");
        unminifyBtn.classList.add("hidden");
    } else {
        formatBtn.classList.add("hidden");
        if (minified) {
            minifyBtn.classList.add("hidden");
            unminifyBtn.classList.remove("hidden");
        } else {
            minifyBtn.classList.remove("hidden");
            unminifyBtn.classList.add("hidden");
        }
    }
}

// =========================
// CLEAR EDITOR
// =========================
function clearEditor() {
    editor.setValue("");
    document.getElementById("output").innerHTML = "";
}

// =========================
// IS MINIFIED
// Defined here so it works even if java.js is not loaded.
// Minified = very long average line length (no newlines)
// =========================
function isMinified(code) {
    const lines = code.split("\n").filter(l => l.trim() !== "");
    if (lines.length === 0) return false;
    const avgLen = code.length / lines.length;
    return avgLen > 100;
}