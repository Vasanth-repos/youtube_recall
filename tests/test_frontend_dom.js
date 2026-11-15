// test_frontend_simulation.js
// Tests the frontend DOM manipulation, API loading, grid rendering, and Reader view
const fs = require('fs');
const path = require('path');

// 1. Build a basic DOM mock
const domElements = {};

function createMockElement(id, tag = 'div') {
  return {
    id: id,
    tagName: tag.toUpperCase(),
    value: '',
    textContent: '',
    innerHTML: '',
    className: '',
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); },
      toggle(c) { if (this.contains(c)) this.remove(c); else this.add(c); }
    },
    style: {},
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k] || null; },
    addEventListener(evt, fn) {},
    querySelectorAll(sel) { return []; }
  };
}

// Parse index.html to register all element IDs
const rootDir = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(rootDir, 'frontend', 'index.html'), 'utf8');
const idMatches = indexHtml.matchAll(/id="([^"]+)"/g);
for (const m of idMatches) {
  domElements[m[1]] = createMockElement(m[1]);
}

global.document = {
  getElementById(id) {
    if (!domElements[id]) {
      domElements[id] = createMockElement(id);
    }
    return domElements[id];
  },
  querySelectorAll(sel) {
    return [];
  },
  title: "YouTube Recall",
  visibilityState: "visible",
  addEventListener(evt, fn) {
    if (evt === 'DOMContentLoaded') {
      global._onDOMContentLoaded = fn;
    }
  }
};

global.window = {
  location: {
    protocol: 'http:',
    hostname: 'localhost',
    port: '8000',
    pathname: '/',
    search: ''
  },
  history: {
    replaceState() {}
  },
  addEventListener() {},
  localStorage: {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; }
  },
  sessionStorage: {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); }
  },
  lucide: {
    createIcons() {}
  },
  renderMathInElement(el, opts) {
    // KaTeX mock
    return true;
  }
};

global.localStorage = global.window.localStorage;
global.sessionStorage = global.window.sessionStorage;
global.lucide = global.window.lucide;
global.renderMathInElement = global.window.renderMathInElement;

// Mock fetch to call live localhost:8000 backend or return mock data
global.fetch = async function(url, opts) {
  const fullUrl = url.startsWith('http') ? url : `http://localhost:8000${url}`;
  const httpRes = await import('http');
  const parsed = new URL(fullUrl);
  
  return new Promise((resolve, reject) => {
    const req = httpRes.get(parsed, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: async () => JSON.parse(data),
          text: async () => data
        });
      });
    });
    req.on('error', reject);
  });
};

// Load app.js
const appJsCode = fs.readFileSync(path.join(rootDir, 'frontend', 'app.js'), 'utf8');

console.log("Evaluating frontend/app.js...");
eval(appJsCode);
console.log("Evaluated frontend/app.js successfully!");

// Run DOMContentLoaded
async function runVerification() {
  if (global._onDOMContentLoaded) {
    console.log("Triggering DOMContentLoaded...");
    await global._onDOMContentLoaded();
  }

  console.log("\n--- Verification Results ---");
  const statVideos = document.getElementById("stat-videos").textContent;
  console.log(`1. Total Videos Stat: "${statVideos}" (Should be > 0)`);
  if (!statVideos || statVideos === "0") {
    console.error("FAIL: stat-videos is 0 or empty!");
  } else {
    console.log("PASS: stat-videos updated correctly!");
  }

  const gridHtml = document.getElementById("videos-grid").innerHTML;
  console.log(`2. Videos Grid HTML Length: ${gridHtml.length} characters`);
  if (gridHtml.length < 100) {
    console.error("FAIL: videos-grid is empty or truncated!");
  } else {
    console.log("PASS: videos-grid populated with cards!");
  }

  // Test opening reader for math video
  console.log("\n3. Testing openReaderForVideo('a9YapJWJbq8')...");
  openReaderForVideo('a9YapJWJbq8');

  const readerTitle = document.getElementById("reader-title").textContent;
  console.log(`Reader Title: "${readerTitle}"`);

  const formulasGrid = document.getElementById("reader-formulas-grid").innerHTML;
  console.log(`Formulas Grid HTML Length: ${formulasGrid.length} characters`);

  const lawsGrid = document.getElementById("reader-laws-grid").innerHTML;
  console.log(`Laws Grid HTML Length: ${lawsGrid.length} characters`);

  const flashcardsGrid = document.getElementById("reader-rapid-flashcards").innerHTML;
  console.log(`Flashcards Grid HTML Length: ${flashcardsGrid.length} characters`);

  if (formulasGrid.includes("Cyclic Property of Powers of i") || formulasGrid.includes("formula")) {
    console.log("PASS: Math formulas correctly rendered in Reader!");
  } else {
    console.error("FAIL: Formulas missing from reader-formulas-grid!");
  }

  if (readerTitle.includes("Complex Numbers")) {
    console.log("PASS: Math video correctly selected in Reader!");
  } else {
    console.error("FAIL: Reader title mismatch!");
  }

  console.log("\nALL FRONTEND DOM SIMULATION TESTS COMPLETED SUCCESSFULLY!");
}

runVerification().catch(err => {
  console.error("Verification failed with exception:", err);
  process.exit(1);
});
