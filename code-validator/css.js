// =========================
// PSEUDO-CLASS LIST
// =========================
const PSEUDO_CLASSES = [
    ":hover", ":focus", ":active", ":visited", ":checked", ":disabled",
    ":enabled", ":root", ":first-child", ":last-child", ":nth-child",
    ":nth-of-type", ":first-of-type", ":last-of-type", ":not(",
    "::before", "::after", ":before", ":after",
    ":placeholder", ":focus-within", ":focus-visible", ":empty",
    ":target", ":required", ":optional", ":read-only", ":read-write"
];

// =========================
// DETECT PSEUDO-CLASS SELECTOR
// e.g. button:hover  a:focus  input:checked
// =========================
function hasPseudoClass(line) {
    return PSEUDO_CLASSES.some(p => line.includes(p));
}

// =========================
// DETECT BROKEN PSEUDO SELECTOR
// e.g. "button: hover"  "a: focus"  "div: nth-child(2)"
// This is a selector typed with a space after colon
// =========================
function isBrokenPseudoSelector(line) {
    // Matches: word(s): pseudo-keyword
    // e.g. "button: hover"  "a: focus"  ".nav li: hover"
    return /^[\w\s.#*\[\]>+~-]+:\s+(hover|focus|active|visited|checked|disabled|enabled|root|before|after|first-child|last-child|nth-child|nth-of-type|first-of-type|last-of-type|not|placeholder|focus-within|focus-visible|empty|target|required|optional|read-only|read-write)/.test(line);
}

// =========================
// IS CSS PROPERTY
// e.g. color: red;   background: #555;
// =========================
function isCSSProperty(line) {
    line = line.trim();

    // If it has a pseudo-class keyword → it's a selector
    if (hasPseudoClass(line)) return false;

    // If it looks like a broken pseudo selector → it's a selector
    if (isBrokenPseudoSelector(line)) return false;

    // Property pattern: word: value (with actual value, not pseudo keyword)
    return /^[a-zA-Z-]+\s*:\s*\S+/.test(line);
}

// =========================
// IS CSS SELECTOR LINE
// =========================
function isCSSSelectorLine(line) {
    line = line.trim();

    if (isCSSProperty(line)) return false;

    return (
        hasPseudoClass(line) ||
        isBrokenPseudoSelector(line) ||
        line.startsWith(".") ||
        line.startsWith("#") ||
        line.startsWith("*") ||
        line.includes(",") ||
        line.includes(">") ||
        line.includes("+") ||
        line.includes("~") ||
        /^[a-zA-Z]/.test(line)
    );
}

// =========================
// CSS VALIDATION
// =========================
async function validateCSS(code) {
    const output = document.getElementById("output");
    output.innerHTML = "";

    let errors = [];
    const lines = code.split("\n");

    // =========================
    // MISSING ; and other property errors
    // =========================
    lines.forEach((line, index) => {
        const trimmed = line.trim();

        if (trimmed === "") return;

        // Skip selectors and braces
        if (trimmed.endsWith("{") || trimmed.endsWith("}") || trimmed.startsWith("@")) return;

        // Skip pseudo-class selectors (e.g. button:hover)
        if (hasPseudoClass(trimmed)) return;

        // Skip broken pseudo selectors — those get fixed, not flagged as semicolon errors
        if (isBrokenPseudoSelector(trimmed)) {
            errors.push({
                line: index + 1,
                message: "Invalid selector syntax — did you mean " + trimmed.replace(/:\s+/, ":") + " ?"
            });
            return;
        }

        // Missing semicolon on property lines
        if (trimmed.includes(":") && !trimmed.endsWith(";")) {
            errors.push({
                line: index + 1,
                message: "Missing semicolon ;"
            });
        }

        // Double semicolon
        if (trimmed.includes(";;")) {
            errors.push({
                line: index + 1,
                message: "Duplicate semicolon ;;"
            });
        }

        // Missing colon
        if (!trimmed.includes(":") && trimmed.includes(";")) {
            errors.push({
                line: index + 1,
                message: "Missing colon :"
            });
        }
    });

    // =========================
    // MISSING OPENING {
    // =========================
    lines.forEach((line, index) => {
        const trimmed = line.trim();

        if (trimmed === "" || trimmed.includes("{") || trimmed.endsWith(";")) return;

        if (isCSSSelectorLine(trimmed)) {
            const nextLine = (lines[index + 1] || "").trim();
            if (nextLine.includes(":") && isCSSProperty(nextLine)) {
                errors.push({
                    line: index + 1,
                    message: "Missing opening brace {"
                });
            }
        }
    });

    // =========================
    // BLOCK STRUCTURE VALIDATION
    // =========================
    let braceDepth = 0;
    for (let i = 0; i < lines.length; i++) {
        const current = lines[i].trim();

        if (current.endsWith("{")) {
            if (braceDepth > 0) {
                const prev = (lines[i - 1] || "").trim();
                if (prev !== "}") {
                    errors.push({
                        line: i + 1,
                        message: "Missing closing brace } before new selector"
                    });
                }
            }
            braceDepth++;
        }

        if (current === "}") {
            braceDepth--;
            if (braceDepth < 0) {
                errors.push({
                    line: i + 1,
                    message: "Extra closing brace }"
                });
                braceDepth = 0;
            }
        }
    }

    if (braceDepth > 0) {
        errors.push({
            line: lines.length,
            message: "Missing closing brace }"
        });
    }

    // =========================
    // SHOW RESULTS
    // =========================
    if (errors.length === 0) {
        output.innerHTML = `<div class="success">✅ No CSS errors found</div>`;
        document.getElementById("fixBtn").style.display = "none";
    } else {
        errors.forEach(error => {
            output.innerHTML += `
                <div class="error">
                    ❌ Line ${error.line}<br><br>${error.message}
                </div>
            `;
        });
        document.getElementById("fixBtn").style.display = "inline-block";
    }
}

// =========================
// CSS AUTO FIX
// =========================
async function fixCSS(code) {

    // =========================
    // STEP 1: FIX BROKEN PSEUDO SELECTORS
    // "button: hover"  →  "button:hover {"
    // "a: focus"       →  "a:focus {"
    // =========================
    let lines = code.split("\n");
    let fixed = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const trimmed = line.trim();

        if (isBrokenPseudoSelector(trimmed)) {
            // Remove space after colon, e.g. "button: hover" → "button:hover"
            let corrected = trimmed.replace(/:\s+/, ":");

            // Check if next line is a property — if so, add {
            const nextLine = (lines[i + 1] || "").trim();
            if (isCSSProperty(nextLine) && !corrected.endsWith("{")) {
                corrected = corrected + " {";
            }

            // If it already had a { after (e.g. "button: hover{") fix spacing
            if (corrected.includes("{") && !corrected.endsWith("{")) {
                corrected = corrected.replace("{", " {");
            }

            fixed.push(corrected);
        } else {
            fixed.push(line);
        }
    }

    code = fixed.join("\n");

    // =========================
    // STEP 2: REMOVE DOUBLE ;;
    // =========================
    code = code.replace(/;;+/g, ";");

    // =========================
    // STEP 3: FIX MISSING ; ON PROPERTY LINES
    // =========================
    lines = code.split("\n");
    lines = lines.map(line => {
        const trimmed = line.trim();

        // Skip empty, braces, @rules
        if (trimmed === "" || trimmed === "}" || trimmed.endsWith("{") || trimmed.startsWith("@")) {
            return line;
        }

        // Skip pseudo-class selectors
        if (hasPseudoClass(trimmed) || isBrokenPseudoSelector(trimmed)) {
            return line;
        }

        // Fix missing semicolon on property lines
        if (isCSSProperty(trimmed) && !trimmed.endsWith(";")) {
            return line.trimEnd() + ";";
        }

        return line;
    });

    code = lines.join("\n");

    // =========================
    // STEP 4: FIX EXTRA SPACES
    // =========================
    code = code.replace(/[ \t]+/g, " ");

    lines = code.split("\n");

    // =========================
    // STEP 5: REMOVE EXTRA }
    // =========================
    let balance = 0;
    let cleaned = [];

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();

        if (trimmed.endsWith("{")) balance++;

        if (trimmed === "}") {
            if (balance === 0) continue; // skip extra }
            balance--;
        }

        cleaned.push(lines[i]);
    }

    lines = cleaned;

    // =========================
    // STEP 6: FIX MISSING {
    // =========================
    for (let i = 0; i < lines.length; i++) {
        const current = lines[i].trim();
        const next = (lines[i + 1] || "").trim();

        if (
            isCSSSelectorLine(current) &&
            !isCSSProperty(current) &&
            !current.includes("{") &&
            isCSSProperty(next)
        ) {
            lines[i] = current + " {";
        }
    }

    code = lines.join("\n");

    // =========================
    // STEP 7: FIX BLOCK STRUCTURE
    // =========================
    lines = code.split("\n");
    let result = [];
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
        let current = lines[i];
        const trimmed = current.trim();

        const isSelector = trimmed.endsWith("{");
        const isProperty = isCSSProperty(trimmed);

        // Add missing semicolon
        if (isProperty && !trimmed.endsWith(";")) {
            current = current.trimEnd() + ";";
        }

        // Close previous unclosed block before new selector
        if (isSelector && braceDepth > 0) {
            const prev = (lines[i - 1] || "").trim();
            if (prev !== "}") {
                result.push("}");
                braceDepth--;
            }
        }

        result.push(current);

        if (trimmed.endsWith("{")) braceDepth++;

        if (trimmed === "}") {
            braceDepth--;
            if (braceDepth < 0) braceDepth = 0;
        }
    }

    // Close any remaining open blocks
    while (braceDepth > 0) {
        result.push("}");
        braceDepth--;
    }

    code = result.join("\n");

    // =========================
    // STEP 8: FIX BROKEN MEDIA QUERY
    // =========================
    code = code.replace(
        /@media\s*\((.*?)\)\s*([^{])/g,
        "@media ($1) {\n$2"
    );

    // =========================
    // STEP 9: FORMAT WITH PRETTIER
    // =========================
    try {
        const formatted = await prettier.format(code, {
            parser: "scss",
            plugins: prettierPlugins
        });
        return formatted;
    } catch (error) {
        return code;
    }
}

// =========================
// CSS MINIFY
// =========================
async function minifyCSS(code) {
    try {
        const minified = await prettier.format(code, {
            parser: "scss",
            plugins: prettierPlugins,
            printWidth: 100000,
            tabWidth: 0
        });

        return minified
            .replace(/\n/g, "")
            .replace(/\s+/g, " ");
    } catch (error) {
        return code;
    }
}