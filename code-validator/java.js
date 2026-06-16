// =========================
// JS TYPO MAP
// =========================
const JS_TYPOS = {
    'functoin': 'function',
    'fucntion': 'function',
    'funciton': 'function',
    'fnuction': 'function',
    'cosnt': 'const',
    'ocnst': 'const',
    'retrun': 'return',
    'reutrn': 'return',
    'retrn': 'return',
    'treu': 'true',
    'flase': 'false',
    'fasle': 'false',
    'nul': 'null',
    'undefiend': 'undefined',
    'undefied': 'undefined',
    'lenght': 'length',
    'lentgh': 'length',
    'widht': 'width',
    'heigth': 'height',
    'conosle': 'console',
    'consoel': 'console',
    'consle': 'console',
    'consloe': 'console',
    'docuemnt': 'document',
    'documnet': 'document',
    'doucment': 'document',
    'widnow': 'window',
    'winodw': 'window',
    'appedn': 'append',
    'apepnd': 'append',
    'appendChidl': 'appendChild',
    'addEvetnListener': 'addEventListener',
    'addEventLisener': 'addEventListener',
    'removeEvetnListener': 'removeEventListener',
    'querySleector': 'querySelector',
    'querySelectorAl': 'querySelectorAll',
    'getElemetById': 'getElementById',
    'getElementByID': 'getElementById',
    'innerHMTL': 'innerHTML',
    'innerHTMl': 'innerHTML',
    'classNmae': 'className',
    'classname': 'className',
    'stlye': 'style',
    'styel': 'style',
};

// =========================
// FIX JS
// =========================
async function fixJS(code) {

    let lines = code.split("\n");

    // =========================
    // STEP 1: FIX TYPOS
    // =========================
    lines = lines.map(line => {
        const trimmed = line.trim();
        // Skip comments and strings (basic check)
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return line;

        Object.entries(JS_TYPOS).forEach(([typo, fix]) => {
            // Use word boundary to avoid partial replacements
            try {
                line = line.replace(new RegExp('\\b' + typo + '\\b', 'g'), fix);
            } catch(e) {}
        });
        return line;
    });

    // =========================
    // STEP 2: FIX var → let
    // =========================
    lines = lines.map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//")) return line;
        return line.replace(/\bvar\b/g, 'let');
    });

    // =========================
    // STEP 3: FIX == → === (not !== or already ===)
    // =========================
    lines = lines.map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//")) return line;
        // Match == not preceded by ! < > = and not followed by =
        line = line.replace(/([^!<>=])={2}([^=])/g, '$1===$2');
        // Fix != → !==
        line = line.replace(/!=([^=])/g, '!==$1');
        return line;
    });

    // =========================
    // STEP 4: FIX MISSING SEMICOLONS
    // =========================
    lines = lines.map(line => {
        const trimmed = line.trim();

        // Skip empty, comments, block lines
        if (
            trimmed === '' ||
            trimmed.startsWith('//') ||
            trimmed.startsWith('/*') ||
            trimmed.startsWith('*') ||
            trimmed.endsWith('{') ||
            trimmed.endsWith('}') ||
            trimmed.endsWith(';') ||
            trimmed.endsWith(',') ||
            trimmed.endsWith('(') ||
            trimmed.endsWith('[') ||
            trimmed.endsWith('&&') ||
            trimmed.endsWith('||') ||
            trimmed.endsWith('?') ||
            trimmed.endsWith(':') ||
            trimmed.endsWith('\\')
        ) return line;

        // Lines that need semicolons
        const needsSemi = (
            /^(const|let|var|return|throw|break|continue)\b/.test(trimmed) ||
            /^(import|export)\b/.test(trimmed) ||
            /\)$/.test(trimmed) ||   // ends with ) — function call or condition close
            /^[a-zA-Z_$][\w$.]*\s*(=|\+=|-=|\*=|\/=)/.test(trimmed)  // assignment
        );

        if (needsSemi) return line.trimEnd() + ';';
        return line;
    });

    // =========================
    // STEP 5: FIX MISSING CLOSING BRACES
    // Count { vs } and add missing }
    // =========================
    code = lines.join('\n');

    let depth = 0;
    let inSingleString = false;
    let inDoubleString = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < code.length; i++) {
        const c = code[i];
        const next = code[i + 1];

        // Track comments
        if (!inSingleString && !inDoubleString && !inTemplate && !inBlockComment) {
            if (c === '/' && next === '/') { inLineComment = true; continue; }
            if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }
        }
        if (inLineComment && c === '\n') { inLineComment = false; continue; }
        if (inBlockComment && c === '*' && next === '/') { inBlockComment = false; i++; continue; }
        if (inLineComment || inBlockComment) continue;

        // Track strings
        if (!inSingleString && !inDoubleString && !inTemplate) {
            if (c === "'") { inSingleString = true; continue; }
            if (c === '"') { inDoubleString = true; continue; }
            if (c === '`') { inTemplate = true; continue; }
        }
        if (inSingleString && c === "'" && code[i-1] !== '\\') { inSingleString = false; continue; }
        if (inDoubleString && c === '"' && code[i-1] !== '\\') { inDoubleString = false; continue; }
        if (inTemplate && c === '`' && code[i-1] !== '\\') { inTemplate = false; continue; }
        if (inSingleString || inDoubleString || inTemplate) continue;

        if (c === '{') depth++;
        if (c === '}') depth--;
    }

    // Add missing closing braces
    while (depth > 0) {
        code += '\n}';
        depth--;
    }

    // =========================
    // STEP 6: FORMAT WITH PRETTIER
    // =========================
    try {
        const formatted = await prettier.format(code, {
            parser: "babel",
            plugins: prettierPlugins,
            tabWidth: 2,
            useTabs: false,
            semi: true,
            singleQuote: false,
            trailingComma: "es5"
        });
        return formatted;
    } catch (error) {
        return code;
    }
}

// =========================
// MINIFY JS
// =========================
async function minifyJS(code) {
    try {
        const minified = await prettier.format(code, {
            parser: "babel",
            plugins: prettierPlugins,
            printWidth: 100000,
            tabWidth: 0,
            useTabs: false,
            semi: true,
            singleQuote: true
        });
        return minified
            .replace(/\n/g, " ")
            .replace(/\s{2,}/g, " ")
            .trim();
    } catch (error) {
        return code;
    }
}

// =========================
// UNMINIFY JS
// =========================
async function unminifyJS(code) {
    try {
        const formatted = await prettier.format(code, {
            parser: "babel",
            plugins: prettierPlugins,
            tabWidth: 2,
            useTabs: false,
            semi: true,
            singleQuote: false
        });
        return formatted;
    } catch (error) {
        return code;
    }
}

// =========================
// UNMINIFY CSS
// =========================
async function unminifyCSS(code) {
    try {
        const formatted = await prettier.format(code, {
            parser: "scss",
            plugins: prettierPlugins,
            tabWidth: 2,
            useTabs: false
        });
        return formatted;
    } catch (error) {
        return code;
    }
}

// =========================
// DETECT IF CODE IS MINIFIED
// Minified = very long lines, no newlines, compressed
// =========================
function isMinified(code) {
    const lines = code.split("\n").filter(l => l.trim() !== "");
    if (lines.length === 0) return false;
    const avgLen = code.length / lines.length;
    // If average line length > 100 chars, likely minified
    return avgLen > 100;
}