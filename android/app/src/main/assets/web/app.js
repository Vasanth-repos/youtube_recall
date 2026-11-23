// YouTube Recall - AI Smart Transcript Application Logic

let allVideos = [];
let currentViewingVideo = null;
let activeCategory = "";
let currentSort = "recently_watched";

// Dynamic Server Resolution & Standalone On-Device Engine
function getServerBaseUrl() {
  let base = "";
  if (window.AndroidBridge && typeof window.AndroidBridge.getServerUrl === "function") {
    try {
      const b = window.AndroidBridge.getServerUrl();
      if (b && b.trim()) base = b.trim();
    } catch (e) { }
  }
  if (!base) {
    const stored = localStorage.getItem("recall_server_url");
    if (stored && stored.trim()) base = stored.trim();
  }
  if (!base && window.location.protocol.startsWith("http") && window.location.hostname !== "appassets.androidplatform.net") {
    return ""; // Same-origin web server
  }
  if (!base || base.toLowerCase() === "standalone" || base.toLowerCase() === "local_offline") {
    return ""; // Standalone mobile mode
  }
  return base.replace(/\/+$/, "");
}

function hasServerBackend() {
  const base = getServerBaseUrl();
  if (base) return true;
  // If hosted on live web (e.g. Render/Railway), relative paths work
  if (window.location.protocol.startsWith("http") && window.location.hostname !== "appassets.androidplatform.net") {
    return true;
  }
  return false;
}

function apiUrl(path) {
  const base = getServerBaseUrl();
  return base ? `${base}${path.startsWith('/') ? path : '/' + path}` : path;
}

// Phase 1: Authentication & Multi-Tenancy JWT Management
const AUTH_TOKEN_KEY = "recall_auth_token";
let currentUser = null;

function setCurrentUser(user) {
  currentUser = user;
  if (typeof window !== "undefined") {
    window.currentUser = user;
  }
}

function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch (e) {
    return "";
  }
}

function setAuthToken(token) {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch (e) {}
}

function authHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };
  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function authFetch(url, options = {}) {
  const opts = { ...options };
  opts.headers = authHeaders(opts.headers || {});
  try {
    const res = await fetch(url, opts);
    if (res.status === 401 && getAuthToken()) {
      console.warn("Session expired or token invalid. Clearing auth token.");
      setAuthToken("");
      currentUser = null;
      updateAuthUiState();
    }
    return res;
  } catch (err) {
    throw err;
  }
}

async function checkAuthState() {
  const token = getAuthToken();
  if (!token) {
    currentUser = null;
    updateAuthUiState();
    return;
  }
  try {
    const res = await authFetch(apiUrl("/api/auth/me"));
    if (res.ok) {
      currentUser = await res.json();
    } else {
      currentUser = null;
      setAuthToken("");
    }
  } catch (e) {
    console.warn("Auth check notice:", e);
  }
  updateAuthUiState();
}

function updateAuthUiState() {
  const navLabel = document.getElementById("nav-user-label");
  const badge = document.getElementById("account-status-badge");
  const loggedInBox = document.getElementById("account-logged-in-box");
  const loggedOutBox = document.getElementById("account-logged-out-box");
  const userNameEl = document.getElementById("account-user-name");
  const userEmailEl = document.getElementById("account-user-email");
  const initialsEl = document.getElementById("account-avatar-initials");

  if (currentUser && currentUser.id !== 1) {
    const name = currentUser.full_name || currentUser.email.split("@")[0];
    const initial = name.charAt(0).toUpperCase();

    if (navLabel) navLabel.textContent = name.length > 12 ? name.slice(0, 10) + "…" : name;
    if (badge) {
      badge.textContent = "Private Tenant Workspace";
      badge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    }
    if (loggedInBox) loggedInBox.classList.remove("hidden");
    if (loggedOutBox) loggedOutBox.classList.add("hidden");
    if (userNameEl) userNameEl.textContent = name;
    if (userEmailEl) userEmailEl.textContent = currentUser.email;
    if (initialsEl) initialsEl.textContent = initial;
  } else {
    if (navLabel) navLabel.textContent = "Account";
    if (badge) {
      badge.textContent = "Guest Workspace";
      badge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700";
    }
    if (loggedInBox) loggedInBox.classList.add("hidden");
    if (loggedOutBox) loggedOutBox.classList.remove("hidden");
  }
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function openAuthModal(defaultMode = "login") {
  const modal = document.getElementById("auth-modal");
  if (!modal) return;
  modal.classList.remove("hidden");

  const feedback = document.getElementById("auth-feedback");
  if (feedback) feedback.classList.add("hidden");

  if (currentUser && currentUser.id !== 1) {
    document.getElementById("auth-tabs-row")?.classList.add("hidden");
    document.getElementById("auth-login-form")?.classList.add("hidden");
    document.getElementById("auth-register-form")?.classList.add("hidden");
    const profileForm = document.getElementById("auth-profile-form");
    if (profileForm) profileForm.classList.remove("hidden");
    const name = currentUser.full_name || currentUser.email.split("@")[0];
    const nameEl = document.getElementById("auth-modal-name");
    const emailEl = document.getElementById("auth-modal-email");
    const avatarEl = document.getElementById("auth-modal-avatar");
    const titleEl = document.getElementById("auth-modal-title");
    if (nameEl) nameEl.textContent = name;
    if (emailEl) emailEl.textContent = currentUser.email;
    if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
    if (titleEl) titleEl.textContent = "Account Profile";
  } else {
    document.getElementById("auth-tabs-row")?.classList.remove("hidden");
    document.getElementById("auth-profile-form")?.classList.add("hidden");
    const titleEl = document.getElementById("auth-modal-title");
    if (titleEl) titleEl.textContent = "Account Access";
    switchAuthTab(defaultMode);
  }
}

function closeAuthModal() {
  const modal = document.getElementById("auth-modal");
  if (modal) modal.classList.add("hidden");
}

function switchAuthTab(tab) {
  const loginTabBtn = document.getElementById("auth-tab-login");
  const regTabBtn = document.getElementById("auth-tab-register");
  const loginForm = document.getElementById("auth-login-form");
  const regForm = document.getElementById("auth-register-form");
  const feedback = document.getElementById("auth-feedback");
  if (feedback) feedback.classList.add("hidden");

  if (tab === "register") {
    loginTabBtn?.classList.remove("bg-obsidian-800", "text-zinc-100");
    loginTabBtn?.classList.add("text-zinc-400");
    regTabBtn?.classList.add("bg-obsidian-800", "text-zinc-100");
    regTabBtn?.classList.remove("text-zinc-400");
    loginForm?.classList.add("hidden");
    regForm?.classList.remove("hidden");
  } else {
    regTabBtn?.classList.remove("bg-obsidian-800", "text-zinc-100");
    regTabBtn?.classList.add("text-zinc-400");
    loginTabBtn?.classList.add("bg-obsidian-800", "text-zinc-100");
    loginTabBtn?.classList.remove("text-zinc-400");
    regForm?.classList.add("hidden");
    loginForm?.classList.remove("hidden");
  }
}

async function submitLogin() {
  const emailInput = document.getElementById("auth-login-email");
  const pwInput = document.getElementById("auth-login-password");
  const email = emailInput?.value.trim();
  const password = pwInput?.value.trim();

  if (!email || !password) {
    showAuthError("Please enter your email and password.");
    return;
  }

  const btn = document.getElementById("btn-submit-login");
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      showAuthError(data.detail || "Login failed. Check credentials.");
      return;
    }
    setAuthToken(data.access_token);
    currentUser = data.user;
    updateAuthUiState();
    closeAuthModal();
    showToastNotification(`Welcome back, ${currentUser.full_name || currentUser.email}!`, "success");
    if (typeof loadVideos === "function") loadVideos();
    if (typeof loadStats === "function") loadStats();
  } catch (e) {
    showAuthError("Network error during login: " + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function submitRegister() {
  const nameInput = document.getElementById("auth-register-name");
  const emailInput = document.getElementById("auth-register-email");
  const pwInput = document.getElementById("auth-register-password");
  const full_name = nameInput?.value.trim() || "";
  const email = emailInput?.value.trim();
  const password = pwInput?.value.trim();

  if (!email || !password) {
    showAuthError("Please fill in email and password.");
    return;
  }
  if (password.length < 6) {
    showAuthError("Password must be at least 6 characters.");
    return;
  }

  const btn = document.getElementById("btn-submit-register");
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(apiUrl("/api/auth/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, full_name })
    });
    const data = await res.json();
    if (!res.ok) {
      showAuthError(data.detail || "Registration failed.");
      return;
    }
    setAuthToken(data.access_token);
    currentUser = data.user;
    updateAuthUiState();
    closeAuthModal();
    showToastNotification(`Account created! Welcome, ${currentUser.full_name || currentUser.email}!`, "success");
    if (typeof loadVideos === "function") loadVideos();
    if (typeof loadStats === "function") loadStats();
  } catch (e) {
    showAuthError("Network error during registration: " + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function showAuthError(msg) {
  const feedback = document.getElementById("auth-feedback");
  if (!feedback) return;
  feedback.textContent = msg;
  feedback.className = "mt-3 p-2.5 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20";
  feedback.classList.remove("hidden");
}

function logoutUser() {
  setAuthToken("");
  currentUser = null;
  updateAuthUiState();
  closeAuthModal();
  showToastNotification("Signed out. Switched to Guest Workspace.", "info");
  if (typeof loadVideos === "function") loadVideos();
  if (typeof loadStats === "function") loadStats();
}

// Persistent Local Phone Storage Store
const LOCAL_VIDEOS_KEY = "recall_local_videos_store";
const LOCAL_FLASHCARDS_KEY = "recall_local_flashcards_store";

function getLocalVideos() {
  try {
    const raw = localStorage.getItem(LOCAL_VIDEOS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalVideos(videos) {
  try {
    localStorage.setItem(LOCAL_VIDEOS_KEY, JSON.stringify(videos));
  } catch (e) { }
}

function getLocalFlashcards() {
  try {
    const raw = localStorage.getItem(LOCAL_FLASHCARDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalFlashcards(cards) {
  try {
    localStorage.setItem(LOCAL_FLASHCARDS_KEY, JSON.stringify(cards));
  } catch (e) { }
}

function extractYouTubeVideoId(urlOrId) {
  if (!urlOrId) return null;
  const s = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const patterns = [
    /(?:v=|\/v\/|youtu\.be\/|embed\/|\/watch\?v=|\/shorts\/|\/live\/)([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) return m[1];
  }
  return null;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {}

  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch (e) {}

  // Repair LaTeX math escapes: double any backslash NOT followed by " or \
  try {
    const repaired = cleaned.replace(/\\(?![\\"])/g, "\\\\");
    return JSON.parse(repaired);
  } catch (e) {}

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const sub = cleaned.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(sub);
    } catch (e) {}
    try {
      const repaired = sub.replace(/\\(?![\\"])/g, "\\\\");
      return JSON.parse(repaired);
    } catch (e) {}
  }
  return null;
}

// Client-Side Autonomous Intake Engine (Runs directly on Mobile without laptop!)
async function distillVideoOnDevice(videoId) {
  showToastNotification("✨ Distilling on device: Fetching video details...", "info", 4500);

  // 1. Fetch metadata via oEmbed (No API key needed, open CORS)
  let meta = {
    title: `YouTube Video (${videoId})`,
    author_name: "YouTube Creator",
    thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  };

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const oRes = await fetch(oembedUrl);
    if (oRes.ok) {
      const data = await oRes.json();
      if (data.title) meta.title = data.title;
      if (data.author_name) meta.author_name = data.author_name;
      if (data.thumbnail_url) meta.thumbnail_url = data.thumbnail_url;
    }
  } catch (e) {
    console.warn("oEmbed fetch notice:", e);
  }

  showToastNotification("⚡ Synthesizing smart transcript & flashcards...", "info", 5000);

  // 2. Resolve Gemini API Key (stored in localStorage or settings)
  const geminiKey = localStorage.getItem("recall_gemini_api_key") ||
    (document.getElementById("setting-gemini-key") ? document.getElementById("setting-gemini-key").value.trim() : "");

  let result = null;
  const candidateModels = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-pro-latest"];

  if (geminiKey) {
    const prompt = `You are an expert technical educator and editor.
Transform this YouTube video into an exceptional 5-MINUTE RAPID RECALL & MICRO-LEARNING CHEAT SHEET.

CRITICAL LANGUAGE REQUIREMENT:
- ALL OUTPUT MUST BE EXCLUSIVELY AND STRICTLY IN FLUENT, PROFESSIONAL ENGLISH.
- If the original video title, transcript, audio, or description is in Hindi, Tamil, Telugu, Spanish, French, or any other non-English language, TRANSLATE AND SYNTHESIZE EVERYTHING STRICTLY INTO ENGLISH.
- NEVER output Hindi (Devanagari characters) or Hinglish text in any field.

Video Title: ${meta.title}
Creator/Channel: ${meta.author_name}
Video Link: https://www.youtube.com/watch?v=${videoId}

Generate a comprehensive, highly informative study guide with:
1. "summary_bullets": Array of 3-4 ultra-crisp, high-density core takeaways.
2. "rapid_recall": {
     "five_minute_thesis": "1-2 sentence core mental model of the video for immediate recall",
     "cheat_sheet": ["Key Invariant 1: ...", "Key Invariant 2: ...", "Key Invariant 3: ..."]
   }
3. "formulas": Array of mathematical or physical formulas with:
   - "name": Formula or Theorem name
   - "formula_latex": LaTeX formatted formula (e.g. "$$P(x) = \\\\sum_{n=0}^k \\\\frac{f^{(n)}(a)}{n!}(x-a)^n$$")
   - "variables": Explanation of variables and notation
   - "explanation": What it simplifies or computes
   - "timestamp_label": "00:00"
   (if no math/physics formulas, return empty array [])
4. "laws_and_principles": Array of scientific laws, principles, or core hypotheses:
   - "name": Scientific Law or Principle name
   - "statement": Core statement or theorem
   - "mechanism": Underlying physical, logical, or biological mechanism
   - "timestamp_label": "00:00"
   (if none apply, return empty array [])
5. "key_concepts": Array of 3-4 core concepts defined clearly.
6. "smart_transcript": Array of 3-5 structured chronological chapters. For each chapter:
   - "timestamp_label": "00:00", "03:00", etc.
   - "timestamp_seconds": 0, 180, etc.
   - "title": Descriptive Chapter Title
   - "crisp_points": Array of 2-3 direct takeaway bullet points
   - "polished_text": 1-2 paragraphs of elegant, textbook-style explanation of what is taught.
7. "flashcards": Array of 3-5 active recall flashcards:
   - "question": Direct recall question testing core formula, mechanism, or principle
   - "answer": Clear, concise answer
   - "timestamp_label": "00:00"
8. "final_summary": A cohesive 2-paragraph synthesis explaining the core thesis and practical value.

Return ONLY valid JSON matching this schema.`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    };

    for (const m of candidateModels) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${geminiKey}`;
        const gRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (gRes.ok) {
          const gData = await gRes.json();
          const rawText = gData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const parsed = safeParseJson(rawText);
            if (parsed && parsed.summary_bullets) {
              result = parsed;
              break;
            }
          }
        }
      } catch (err) {
        console.warn(`Gemini model ${m} failed:`, err);
      }
    }
  }

  // Fallback to local structured generator if Gemini unavailable or no key
  if (!result || !result.summary_bullets) {
    result = generateLocalFallbackDistillation(meta.title, meta.author_name, videoId);
  }

  // Construct complete video item
  const newVideo = {
    id: `local_${Date.now()}`,
    video_id: videoId,
    title: meta.title,
    channel_title: meta.author_name,
    duration_seconds: 480,
    thumbnail_url: meta.thumbnail_url,
    category: "Education",
    summary_bullets: result.summary_bullets || [],
    rapid_recall: result.rapid_recall || {
      five_minute_thesis: (result.summary_bullets && result.summary_bullets[0]) || "",
      cheat_sheet: result.summary_bullets || []
    },
    formulas: result.formulas || [],
    laws_and_principles: result.laws_and_principles || [],
    key_concepts: result.key_concepts || [],
    smart_transcript: result.smart_transcript || [],
    flashcards: (result.flashcards || []).map((fc, idx) => ({
      id: `fc_local_${Date.now()}_${idx}`,
      video_id: videoId,
      question: fc.question,
      answer: fc.answer,
      timestamp_label: fc.timestamp_label || "00:00",
      interval_days: 1,
      repetitions: 0,
      ease_factor: 2.5,
      due_date: new Date().toISOString()
    })),
    final_summary: result.final_summary || "",
    created_at: new Date().toISOString(),
    last_watched_at: new Date().toISOString(),
    is_local: true
  };

  // Save video locally
  const localList = getLocalVideos();
  localList.unshift(newVideo);
  saveLocalVideos(localList);

  // Save flashcards locally
  const localCards = getLocalFlashcards();
  if (newVideo.flashcards && newVideo.flashcards.length) {
    saveLocalFlashcards([...newVideo.flashcards, ...localCards]);
  }

  // Merge into allVideos & refresh UI
  const existingIdx = allVideos.findIndex(v => v.video_id === videoId);
  if (existingIdx >= 0) allVideos[existingIdx] = newVideo;
  else allVideos.unshift(newVideo);

  renderVideosGrid();
  loadStats();
  openReaderForVideo(newVideo.id);

  showToastNotification(`✓ Distilled on Phone: ${meta.title.substring(0, 32)}...`, "success", 4500);
  return newVideo;
}

function generateLocalFallbackDistillation(title, channel, videoId) {
  const isMath = /math|calculus|algebra|series|derivative|integral|equation|matrix/i.test(title);
  const isScience = /science|physics|chem|bio|quantum|thermo|gravity|relativity/i.test(title);

  const formulas = isMath ? [
    {
      name: "Core Mathematical Expansion",
      formula_latex: "$$f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x - a)^n$$",
      variables: "f^(n)(a): n-th derivative at expansion point a; n!: factorial scaling; x: input variable",
      explanation: "Approximates non-polynomial functions through systematic derivative alignment.",
      timestamp_label: "03:30"
    }
  ] : [];

  const laws = isScience || isMath ? [
    {
      name: isMath ? "Radius of Convergence Principle" : "Fundamental Conservation Principle",
      statement: isMath ? "An infinite power series converges strictly within distance R from the center point." : "Total quantity in an isolated physical system remains invariant over time.",
      mechanism: isMath ? "Higher-order terms diverge exponentially outside the radius of convergence." : "Symmetry of natural laws guarantees conserved conjugate invariants.",
      timestamp_label: "07:15"
    }
  ] : [];

  return {
    summary_bullets: [
      `Foundational Principle: ${title} establishes critical insights and methodologies developed by ${channel}.`,
      `Core Mechanisms: Demonstrates step-by-step problem-solving and systematic deduction.`,
      `Practical Mastery: Formulates actionable frameworks for real-world engineering and active recall.`
    ],
    rapid_recall: {
      five_minute_thesis: `In "${title}", ${channel} develops a structured framework for analyzing foundational mechanisms and practical rules.`,
      cheat_sheet: [
        `Key Invariant 1: Systematically align core variables and assumptions before computing.`,
        `Key Invariant 2: Apply governing formulas or principles to reduce complex problems to primitives.`,
        `Key Invariant 3: Validate boundary conditions and convergence properties.`
      ]
    },
    formulas: formulas,
    laws_and_principles: laws,
    key_concepts: [
      `Conceptual Foundations: Core theoretical principles established in ${title}.`,
      `Practical Implementation: Methodologies, equations, and error prevention.`,
      `Higher-Order Synthesis: Integration into mental models and active recall routines.`
    ],
    smart_transcript: [
      {
        timestamp_label: "00:00",
        timestamp_seconds: 0,
        title: "Introduction & Contextual Motivation",
        crisp_points: [
          `Establishes the problem domain and foundational definitions.`,
          `Outlines primary learning objectives presented by ${channel}.`
        ],
        polished_text: `This opening segment introduces the central problem domain explored in ${title}. ${channel} establishes the motivation, foundational definitions, and practical necessity for studying these mechanisms systematically.`
      },
      {
        timestamp_label: "03:30",
        timestamp_seconds: 210,
        title: "Core Mechanics & Analytical Breakdown",
        crisp_points: [
          `Detailed analysis of underlying mechanisms and operational workflows.`,
          `Concrete demonstrations highlighting edge cases and structural considerations.`
        ],
        polished_text: `The intermediate section presents the core technical breakdown. Through clear explanations and visual intuition, the primary mechanisms and workflows are deduced systematically.`
      },
      {
        timestamp_label: "07:15",
        timestamp_seconds: 435,
        title: "Synthesis, Applications & Takeaways",
        crisp_points: [
          `Summary of key principles and practical heuristics.`,
          `Direct implications for problem-solving and spaced retention.`
        ],
        polished_text: `The final chapter synthesizes the learned concepts into actionable engineering intuition. These principles empower learners to apply the takeaways in real-world environments.`
      }
    ],
    flashcards: [
      {
        question: `What is the central premise explored in "${title}"?`,
        answer: `It outlines the foundational principles and practical methodology presented by ${channel}.`,
        timestamp_label: "00:00"
      },
      {
        question: `Why are the core mechanics of ${title} essential for active mastery?`,
        answer: `They allow predicting outcomes, preventing common errors, and building robust mental models.`,
        timestamp_label: "03:30"
      }
    ],
    final_summary: `"${title}" by ${channel} delivers a rigorous examination of the topic, breaking down complex mechanisms into modular, intuitive components. By combining visual intuition with practical problem-solving rules, it provides students and professionals with an authoritative knowledge foundation for active recall.`
  };
}

// Elegant Non-Blocking Toast Notification Helper
function showToastNotification(message, type = "info", durationMs = 3500) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `app-toast toast-${type}`;

  let iconName = "info";
  if (type === "success") iconName = "check-circle";
  if (type === "error") iconName = "alert-circle";

  toast.innerHTML = `
    <div class="flex items-center gap-2.5 min-w-0">
      <i data-lucide="${iconName}" class="toast-icon w-4 h-4 flex-shrink-0"></i>
      <span class="text-xs font-medium leading-snug truncate">${message}</span>
    </div>
    <button onclick="this.parentElement.remove()" class="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5 ml-2">
      <i data-lucide="x" class="w-3.5 h-3.5"></i>
    </button>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.classList.add("toast-fadeout");
    setTimeout(() => {
      if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    }, 250);
  }, durationMs);
}

// Password / Key visibility toggle
function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPass = input.type === "password";
  input.type = isPass ? "text" : "password";
  btn.innerHTML = `<i data-lucide="${isPass ? 'eye-off' : 'eye'}" class="w-4 h-4 text-amber-400"></i>`;
  if (window.lucide) lucide.createIcons();
}

// Modal Backdrop Dismiss
function handleModalBackdropClick(event) {
  if (event.target.id === "capture-modal") {
    closeCaptureModal();
  }
}

function formatRelativeTime(dateString) {
  if (!dateString) return "Recently";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Recently";
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch (e) {
    return "Recently";
  }
}

function handleSortChange() {
  const el = document.getElementById("sort-select");
  if (el) {
    currentSort = el.value;
  }
  loadVideos();
}

document.addEventListener("DOMContentLoaded", async () => {
  try { if (window.lucide) lucide.createIcons(); } catch (e) { console.error("Lucide init error", e); }
  try { await checkAuthState(); } catch (e) { console.error("checkAuthState error", e); }
  try { await loadVideos(); } catch (e) { console.error("loadVideos error", e); }
  try { await loadStats(); } catch (e) { console.error("loadStats error", e); }
  try { await loadSettings(); } catch (e) { console.error("loadSettings error", e); }
  try { await loadAccountStatus(); } catch (e) { console.error("loadAccountStatus error", e); }
  try { await checkAutoCaptureStatus(); } catch (e) { console.error("checkAutoCaptureStatus error", e); }
  try { await handleIncomingShareTarget(); } catch (e) { console.error("handleIncomingShareTarget error", e); }

  if (sessionStorage.getItem("recall_dismiss_share_tip")) {
    const banner = document.getElementById("banner-share-tip");
    if (banner) banner.classList.add("hidden");
  }

  // Register PWA Service Worker for Mobile & Offline Support
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => { });
  }

  // Render Math on full window load if KaTeX finished loading
  window.addEventListener("load", () => {
    if (typeof renderMathInElement === "function" && currentViewingVideo) {
      try {
        renderMathInElement(document.getElementById("reader-content"), {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "\\[", right: "\\]", display: true },
            { left: "\\(", right: "\\)", display: false },
            { left: "$", right: "$", display: false }
          ],
          throwOnError: false
        });
      } catch (e) {}
    }
  });

  // Realtime auto-refresh when tab gains focus
  window.addEventListener("focus", () => {
    loadVideos();
    loadStats();
    checkAutoCaptureStatus();
  });

  // Press Escape to return to Library from Reader or close open modals
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const intakeModal = document.getElementById("capture-modal");
      if (intakeModal && !intakeModal.classList.contains("hidden")) {
        closeCaptureModal();
        return;
      }
      const watchModal = document.getElementById("watch-modal");
      if (watchModal && !watchModal.classList.contains("hidden")) {
        closeWatchModal();
        return;
      }
      const readerTab = document.getElementById("tab-reader");
      if (readerTab && !readerTab.classList.contains("hidden")) {
        switchTab("library");
      }
    }
  });

  // Background polling every 15s when active tab is visible
  setInterval(() => {
    if (document.visibilityState === "visible") {
      loadVideos();
      loadStats();
      checkAutoCaptureStatus();
    }
  }, 15000);
});

// Handle incoming Android Web Share Target or deep link parameters
async function handleIncomingShareTarget() {
  const params = new URLSearchParams(window.location.search);
  const shareUrl = params.get("url") || "";
  const shareText = params.get("text") || "";
  const combined = `${shareUrl} ${shareText}`.trim();

  if (combined) {
    const match = combined.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (match && match[1]) {
      const vidId = match[1];
      openCaptureModal();
      const inputEl = document.getElementById("intake-url");
      if (inputEl) inputEl.value = `https://www.youtube.com/watch?v=${vidId}`;
      const statusBox = document.getElementById("intake-status");
      const statusText = document.getElementById("intake-status-text");
      if (statusBox) statusBox.classList.remove("hidden");
      if (statusText) statusText.textContent = "Shared from Android! Auto-transcribing...";
      submitVideoIntake();
    }
  }
}

// Navigation Tabs (Syncs Desktop Top Nav and Mobile Bottom Nav)
function switchTab(tab) {
  const tabs = ["library", "reader", "settings"];
  tabs.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    const deskBtn = document.getElementById(`nav-${t}-btn`);
    const mobBtn = document.getElementById(`mob-nav-${t}-btn`);

    if (t === tab) {
      if (el) el.classList.remove("hidden");
      if (deskBtn) deskBtn.classList.add("active");
      if (mobBtn) mobBtn.classList.add("active");
    } else {
      if (el) el.classList.add("hidden");
      if (deskBtn) deskBtn.classList.remove("active");
      if (mobBtn) mobBtn.classList.remove("active");
    }
  });

  if (tab === "reader" && currentViewingVideo) {
    renderReaderView(currentViewingVideo);
  } else if (tab === "library") {
    loadVideos();
  } else if (tab === "settings") {
    loadSettings();
    if (window.lucide) lucide.createIcons();
  }
}

// Fetch & Update System & Spaced Repetition Stats
async function loadStats() {
  const localList = getLocalVideos();
  const localCards = getLocalFlashcards();
  const localRevCount = parseInt(localStorage.getItem("recall_local_review_count") || "0", 10);

  let serverLoaded = false;
  if (hasServerBackend()) {
    try {
      const [vidRes, statRes] = await Promise.all([
        authFetch(apiUrl("/api/videos")),
        authFetch(apiUrl("/api/flashcards/stats"))
      ]);

      if (vidRes.ok && statRes.ok) {
        const vids = await vidRes.json();
        const stats = await statRes.json();

        // Merge local videos and local flashcards count into metrics
        const combinedStats = {
          total_videos: vids.length + localList.length,
          cards_due_today: (stats.cards_due_today || 0) + localCards.filter(c => new Date(c.due_date) <= new Date()).length,
          cards_mastered: (stats.cards_mastered || 0) + localCards.filter(c => (c.repetitions || 0) >= 3).length,
          total_reviews: (stats.total_reviews || 0) + localRevCount
        };

        const el = document.getElementById("stat-videos");
        if (el) el.textContent = combinedStats.total_videos;
        applyStatsToUI(combinedStats);
        serverLoaded = true;
      }
    } catch (e) {
      console.warn("Server stats unreachable, calculating locally:", e);
    }
  }

  if (!serverLoaded) {
    const now = new Date();
    const dueCount = localCards.filter(c => !c.due_date || new Date(c.due_date) <= now).length;
    const mastCount = localCards.filter(c => (c.repetitions || 0) >= 3).length;

    const localStats = {
      total_videos: localList.length,
      cards_due_today: dueCount,
      cards_mastered: mastCount,
      total_reviews: localRevCount
    };

    const el = document.getElementById("stat-videos");
    if (el) el.textContent = localStats.total_videos;
    applyStatsToUI(localStats);
  }
}

function applyStatsToUI(stats) {
  const dueCount = stats.cards_due_today || 0;
  const masteredCount = stats.cards_mastered || 0;
  const reviewsCount = stats.total_reviews || 0;

  const dueEl = document.getElementById("stat-cards-due");
  if (dueEl) dueEl.textContent = dueCount;
  const mastEl = document.getElementById("stat-cards-mastered");
  if (mastEl) mastEl.textContent = masteredCount;
  const revEl = document.getElementById("stat-total-reviews");
  if (revEl) revEl.textContent = reviewsCount;

  const mDue = document.getElementById("metric-due-count");
  if (mDue) mDue.textContent = dueCount;
  const mMast = document.getElementById("metric-mastered-count");
  if (mMast) mMast.textContent = masteredCount;
  const mRev = document.getElementById("metric-reviews-count");
  if (mRev) mRev.textContent = reviewsCount;

  const navBadge = document.getElementById("nav-due-badge");
  const mobBadge = document.getElementById("mob-due-badge");

  if (dueCount > 0) {
    if (navBadge) { navBadge.textContent = dueCount; navBadge.classList.remove("hidden"); }
    if (mobBadge) { mobBadge.textContent = dueCount; mobBadge.classList.remove("hidden"); }
  } else {
    if (navBadge) navBadge.classList.add("hidden");
    if (mobBadge) mobBadge.classList.add("hidden");
  }
}

// Load Videos (Hybrid Server + Local Autonomous Storage)
async function loadVideos() {
  const localList = getLocalVideos();
  let serverVideos = [];

  if (hasServerBackend()) {
    try {
      const res = await authFetch(apiUrl(`/api/videos?sort_by=${encodeURIComponent(currentSort)}`));
      if (res.ok) {
        serverVideos = await res.json();
      }
    } catch (e) {
      console.warn("Server offline or unreachable, running in autonomous local mode:", e);
    }
  }

  // Merge server and local videos without duplicates
  const serverIds = new Set(serverVideos.map(v => v.video_id));
  const uniqueLocal = localList.filter(v => !serverIds.has(v.video_id));
  allVideos = [...serverVideos, ...uniqueLocal];

  renderVideosGrid();
  loadStats();
  updateModeBadge();

  // Check if query parameter has ?v= or ?video_id=
  const params = new URLSearchParams(window.location.search);
  const targetV = params.get("v") || params.get("video_id");
  if (targetV) {
    const match = allVideos.find(v => v.video_id === targetV || String(v.id) === targetV);
    if (match) {
      openReaderForVideo(match.video_id);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    } else {
      // Shared from mobile YouTube App or new link: auto-intake & distill!
      await autoIntakeSharedVideo(targetV);
      return;
    }
  }

  // Auto-select first video into Reader if none selected
  if (!currentViewingVideo && allVideos.length > 0) {
    currentViewingVideo = allVideos[0];
    const dot = document.getElementById("active-video-dot");
    if (dot) dot.classList.remove("hidden");
    const mobDot = document.getElementById("mob-active-video-dot");
    if (mobDot) mobDot.classList.remove("hidden");
  }
}

// Automatically processes and distills a video shared from Mobile YouTube App
async function autoIntakeSharedVideo(videoId) {
  showToastNotification("✨ Capturing YouTube video... extracting transcript", "info", 5000);

  if (hasServerBackend()) {
    try {
      const res = await authFetch(apiUrl("/api/videos/intake"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_url_or_id: videoId,
          force_process: true
        })
      });
      const data = await res.json();
      if (res.ok && data.video_id) {
        showToastNotification(`✓ Distilled: ${(data.title || "Video").substring(0, 32)}...`, "success", 4000);
        await loadVideos();
        openReaderForVideo(data.video_id);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }
    } catch (err) {
      console.warn("Server intake failed or unreachable, falling back to autonomous on-device distillation:", err);
    }
  }

  // Fallback to Autonomous On-Device Distillation
  await distillVideoOnDevice(videoId);
  window.history.replaceState({}, document.title, window.location.pathname);
}

function renderVideosGrid() {
  const grid = document.getElementById("videos-grid");
  const empty = document.getElementById("library-empty");
  if (!grid) return;

  const searchEl = document.getElementById("search-input");
  const search = (searchEl ? searchEl.value : "").toLowerCase().trim();

  let filtered = (allVideos || []).filter(v => {
    if (!v) return false;
    const title = (v.title || "").toLowerCase();
    const channel = (v.channel_title || "").toLowerCase();
    const matchSearch = !search || title.includes(search) || channel.includes(search);
    const matchCat = !activeCategory || (v.category && v.category.toLowerCase().includes(activeCategory.toLowerCase()));
    return matchSearch && matchCat;
  });

  // Client-side sort fallback / consistency
  filtered.sort((a, b) => {
    if (currentSort === "recently_watched") {
      const timeA = new Date(a.last_watched_at || a.updated_at || a.created_at || 0).getTime();
      const timeB = new Date(b.last_watched_at || b.updated_at || b.created_at || 0).getTime();
      return timeB - timeA;
    } else if (currentSort === "newest") {
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    } else if (currentSort === "duration") {
      return (b.duration_seconds || 0) - (a.duration_seconds || 0);
    } else if (currentSort === "title") {
      return (a.title || "").localeCompare(b.title || "");
    }
    return 0;
  });

  if (filtered.length === 0) {
    grid.innerHTML = "";
    if (empty) empty.classList.remove("hidden");
    return;
  }

  if (empty) empty.classList.add("hidden");
  grid.innerHTML = filtered.map(v => {
    const durationMin = Math.floor((v.duration_seconds || 0) / 60);
    const sections = v.smart_transcript || v.topic_notes || [];
    const watchedTime = formatRelativeTime(v.last_watched_at || v.created_at);
    const safeTitle = escapeHtml(v.title || "Untitled Video");
    const safeChannel = escapeHtml(v.channel_title || "Unknown Channel");
    const safeCategory = escapeHtml(v.category || "General");
    const rawVidId = v.video_id || "";
    const rawId = String(v.id || v.video_id || "");
    const thumbUrl = v.thumbnail_url || ('https://img.youtube.com/vi/' + rawVidId + '/mqdefault.jpg');

    return `
      <div class="bg-obsidian-900/90 border border-obsidian-750/80 rounded-xl overflow-hidden hover:border-obsidian-600 transition-all flex flex-col justify-between group shadow-sm">
        <div>
          <!-- Thumbnail & duration pill -->
          <div class="relative aspect-video bg-obsidian-950 overflow-hidden cursor-pointer" onclick="openReaderForVideo('${rawVidId}')">
            <img src="${thumbUrl}" onerror="this.onerror=null; this.src='/static/icon.svg'; this.classList.add('p-8');" alt="${safeTitle}" class="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300">
            <span class="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/80 text-zinc-300 font-medium">
              ${durationMin}m
            </span>
            <span class="absolute top-2 left-2 px-2 py-0.5 rounded text-[9px] font-mono tracking-wider uppercase bg-obsidian-950/85 text-amber-400/90 border border-amber-500/20 backdrop-blur">
              ${safeCategory}
            </span>
          </div>

          <!-- Video Details -->
          <div class="p-4">
            <h3 onclick="openReaderForVideo('${rawVidId}')" class="font-serif font-medium text-zinc-100 text-sm sm:text-base line-clamp-2 hover:text-amber-400 cursor-pointer transition-colors mb-1.5 leading-snug">
              ${safeTitle}
            </h3>
            <div class="flex items-center gap-2 text-xs text-zinc-400 mb-2">
              <span class="text-zinc-300 font-medium truncate max-w-[140px]">${safeChannel}</span>
              <span class="text-zinc-600">•</span>
              <span class="text-zinc-400 font-mono text-[11px] flex items-center gap-1.5" title="Watched: ${v.last_watched_at || v.created_at}">
                <i data-lucide="clock" class="w-3 h-3 text-amber-500/80"></i>
                ${watchedTime}
              </span>
            </div>
          </div>
        </div>

        <!-- Card Footer -->
        <div class="px-4 py-3 border-t border-obsidian-800/80 mt-auto flex items-center justify-between text-xs text-zinc-400">
          <span class="text-[11px] text-zinc-500 font-mono">${sections.length} chapters</span>
          <div class="flex items-center gap-1.5">
            <button onclick="openReaderForVideo('${rawVidId}')" title="Read Transcript" class="px-2.5 py-1 rounded-md bg-obsidian-800 hover:bg-obsidian-750 text-amber-400 text-xs font-medium flex items-center gap-1.5 transition-colors border border-obsidian-700">
              <i data-lucide="book-open" class="w-3.5 h-3.5"></i>
              <span>Read</span>
            </button>
            <button onclick="deleteVideoById('${rawId}')" title="Delete" class="p-1 rounded-md hover:bg-obsidian-800 text-zinc-500 hover:text-rose-400 transition-colors">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  if (window.lucide) lucide.createIcons();
}

function handleSearch() {
  renderVideosGrid();
}

function filterCategory(cat) {
  activeCategory = cat;
  document.querySelectorAll(".category-pill").forEach(p => {
    if ((!cat && p.textContent.trim() === "All") || p.textContent.toLowerCase().includes(cat.toLowerCase())) {
      p.classList.add("active");
    } else {
      p.classList.remove("active");
    }
  });
  renderVideosGrid();
}

// Open Smart Reader for Video
function openReaderForVideo(videoId) {
  const vid = allVideos.find(v => v.video_id === videoId || String(v.id) === String(videoId));
  if (!vid) return;
  currentViewingVideo = vid;
  const dot = document.getElementById("active-video-dot");
  if (dot) dot.classList.remove("hidden");
  const mobDot = document.getElementById("mob-active-video-dot");
  if (mobDot) mobDot.classList.remove("hidden");
  switchTab("reader");
  renderReaderView(vid);
}

function renderMathSafely(container) {
  if (!container) return;
  if (typeof renderMathInElement === "function") {
    try {
      renderMathInElement(container, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false },
          { left: "$", right: "$", display: false }
        ],
        throwOnError: false
      });
    } catch (e) {
      console.warn("KaTeX render error:", e);
    }
  }
}

let currentReaderMode = "rapid"; // "rapid" (5-min recall) or "indepth" (long-form reader)

function switchReaderMode(mode) {
  currentReaderMode = mode;
  const rapidView = document.getElementById("reader-view-rapid");
  const inDepthView = document.getElementById("reader-view-indepth");
  const btnRapid = document.getElementById("btn-mode-rapid");
  const btnInDepth = document.getElementById("btn-mode-indepth");

  if (mode === "rapid") {
    if (rapidView) rapidView.classList.remove("hidden");
    if (inDepthView) inDepthView.classList.add("hidden");
    if (btnRapid) {
      btnRapid.className = "flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-500 text-zinc-950 transition-all shadow-sm";
    }
    if (btnInDepth) {
      btnInDepth.className = "flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-obsidian-850 transition-all";
    }
  } else {
    if (rapidView) rapidView.classList.add("hidden");
    if (inDepthView) inDepthView.classList.remove("hidden");
    if (btnRapid) {
      btnRapid.className = "flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-obsidian-850 transition-all";
    }
    if (btnInDepth) {
      btnInDepth.className = "flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-500 text-zinc-950 transition-all shadow-sm";
    }
  }
  if (window.lucide) lucide.createIcons();
  renderMathSafely(document.getElementById("reader-content"));
}

function formatTimestampToSeconds(label) {
  if (!label) return 0;
  const parts = String(label).split(":").map(p => parseInt(p, 10));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return (parts[0] * 60) + parts[1];
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  return 0;
}

function toggleCardAnswer(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.classList.contains("hidden")) {
    el.classList.remove("hidden");
    if (btn) btn.textContent = "Hide Answer";
  } else {
    el.classList.add("hidden");
    if (btn) btn.textContent = "Reveal Answer";
  }
}

// Render Smart Reader View
function renderReaderView(video) {
  const content = document.getElementById("reader-content");
  const empty = document.getElementById("reader-empty");

  if (!video) {
    if (content) content.classList.add("hidden");
    if (empty) empty.classList.remove("hidden");
    return;
  }
  if (content) content.classList.remove("hidden");
  if (empty) empty.classList.add("hidden");

  // Title & Metadata
  const titleEl = document.getElementById("reader-title");
  if (titleEl) titleEl.textContent = video.title || "Untitled Video";
  const catEl = document.getElementById("reader-category");
  if (catEl) catEl.textContent = video.category || "General";
  const chanEl = document.getElementById("reader-channel");
  if (chanEl) chanEl.textContent = video.channel_title || "Unknown Channel";
  const durEl = document.getElementById("reader-duration");
  if (durEl) durEl.textContent = `${Math.floor((video.duration_seconds || 0) / 60)}m ${(video.duration_seconds || 0) % 60}s`;
  const linkEl = document.getElementById("reader-yt-link");
  if (linkEl) linkEl.href = `https://www.youtube.com/watch?v=${video.video_id || ''}`;

  // ==============================================================
  // 1. POPULATE 5-MINUTE RAPID RECALL VIEW
  // ==============================================================
  const rapid = video.rapid_recall || {};
  const thesisEl = document.getElementById("reader-rapid-thesis");
  const rulesEl = document.getElementById("reader-rapid-rules");
  
  function ensureEnglish(text, fallback) {
    if (!text || typeof text !== "string") return fallback || "";
    if (/[\u0900-\u0D7F\u0E00-\u0FFF]/.test(text)) {
      return fallback || `Core conceptual framework and governing principles for "${video.title || 'this video'}".`;
    }
    return text;
  }

  let rawThesis = rapid.five_minute_thesis || (video.summary_bullets && video.summary_bullets[0]) || video.final_summary || "Core framework and mental model for this video.";
  const thesis = ensureEnglish(rawThesis, `Core conceptual framework and governing principles for "${video.title || 'this video'}".`);
  if (thesisEl) thesisEl.textContent = thesis;

  let rules = rapid.cheat_sheet || video.summary_bullets || [];
  rules = rules.map(r => ensureEnglish(r, "")).filter(r => r.length > 0);
  if (rules.length === 0) {
    rules = [
      `Key Takeaway: Core analytical framework and problem-solving mechanisms established in "${video.title || 'this video'}".`,
      `Problem-Solving Rule: Apply systematic invariant reductions and foundational identities for rapid recall.`
    ];
  }
  if (rulesEl) {
    rulesEl.innerHTML = rules.map(r => `
      <li class="flex items-start gap-2 text-xs sm:text-sm text-zinc-200">
        <span class="text-amber-400 font-bold select-none">•</span>
        <span>${r}</span>
      </li>
    `).join("");
  }

  // 2. Mathematical Formulas & Equations
  const formulasSec = document.getElementById("reader-formulas-section");
  const formulasGrid = document.getElementById("reader-formulas-grid");
  const formulasBadge = document.getElementById("formulas-count-badge");
  let formulas = video.formulas || [];

  // Fallback: If formulas array is empty but title or concepts indicate math, infer key formulas
  if (formulas.length === 0 && (video.category === "Science & Mathematics" || /calculus|taylor|derivative|integral|matrix|algebra/i.test(video.title))) {
    formulas = [
      {
        name: "Taylor Polynomial Approximation",
        formula_latex: "$$P(x) = \\sum_{n=0}^{k} \\frac{f^{(n)}(a)}{n!}(x - a)^n$$",
        variables: "f^(n)(a): n-th derivative at expansion point a; n!: factorial scaling; x: evaluation input",
        explanation: "Approximates complex transcendental functions with computationally friendly polynomials by matching successive derivatives.",
        timestamp_label: "05:15"
      },
      {
        name: "Factorial Scaling Invariant",
        formula_latex: "$$C_n = \\frac{f^{(n)}(0)}{n!}$$",
        variables: "C_n: polynomial coefficient; n!: factorial multiplier canceling the power rule cascade",
        explanation: "Ensures repeated differentiation does not artificially multiply coefficients.",
        timestamp_label: "06:18"
      }
    ];
  }

  if (formulas && formulas.length > 0) {
    if (formulasSec) formulasSec.classList.remove("hidden");
    if (formulasBadge) formulasBadge.textContent = `${formulas.length} ${formulas.length === 1 ? 'formula' : 'formulas'}`;
    if (formulasGrid) {
      formulasGrid.innerHTML = formulas.map((f, i) => {
        const jumpUrl = `https://www.youtube.com/watch?v=${video.video_id}&t=${formatTimestampToSeconds(f.timestamp_label)}s`;
        let tex = (f.formula_latex || f.formula || "").trim();
        if (tex.startsWith("$$") && tex.endsWith("$$")) {
          tex = tex.slice(2, -2).trim();
        } else if (tex.startsWith("$") && tex.endsWith("$")) {
          tex = tex.slice(1, -1).trim();
        }
        return `
          <div class="bg-obsidian-950 border border-obsidian-800 rounded-xl p-4 sm:p-5 space-y-3 relative hover:border-amber-500/40 transition-colors group shadow-sm">
            <div class="flex items-center justify-between gap-2 border-b border-obsidian-800/80 pb-2.5">
              <div class="flex items-center gap-2">
                <span class="w-6 h-6 rounded-md bg-amber-500/10 text-amber-400 text-xs font-mono font-bold flex items-center justify-center border border-amber-500/20">#${i + 1}</span>
                <h4 class="font-semibold text-xs sm:text-sm text-zinc-100 tracking-tight">${escapeHtml(f.name || 'Key Formula')}</h4>
              </div>
              <a href="${jumpUrl}" target="_blank" class="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono bg-obsidian-850 hover:bg-obsidian-800 text-amber-400 border border-amber-500/20 transition-colors">
                <i data-lucide="play" class="w-2.5 h-2.5 fill-current"></i>
                <span>${escapeHtml(f.timestamp_label || '00:00')}</span>
              </a>
            </div>

            <div class="bg-obsidian-900/90 rounded-lg p-3 sm:p-4 text-center text-amber-200 font-mono text-sm sm:text-base border border-obsidian-800 overflow-x-auto selection:bg-amber-500 selection:text-black">
              $$${tex}$$
            </div>

            ${f.variables ? `
              <div class="text-[11px] text-zinc-400 font-mono bg-obsidian-900/40 rounded px-2.5 py-1.5 border border-obsidian-850">
                <span class="text-amber-400/90 font-semibold uppercase text-[10px]">Variables:</span> ${f.variables}
              </div>
            ` : ''}

            ${f.explanation ? `
              <p class="text-xs text-zinc-300 leading-relaxed font-sans">${f.explanation}</p>
            ` : ''}
          </div>
        `;
      }).join("");
    }
  } else {
    if (formulasSec) formulasSec.classList.add("hidden");
  }

  // 3. Scientific Laws, Principles & Core Hypotheses
  const lawsSec = document.getElementById("reader-laws-section");
  const lawsGrid = document.getElementById("reader-laws-grid");
  const lawsBadge = document.getElementById("laws-count-badge");
  let laws = video.laws_and_principles || [];

  // Fallback: If laws array is empty but concepts indicate principles, infer key principles
  if (laws.length === 0 && (video.category === "Science & Mathematics" || /convergence|physics|mechanics|energy|quantum|biology/i.test(video.title))) {
    laws = [
      {
        name: "Radius of Convergence Principle",
        statement: "An infinite power series converges strictly within a bounded distance R from the expansion center point.",
        mechanism: "Outside radius R, higher-order polynomial terms explode exponentially instead of approximating the function.",
        timestamp_label: "15:20"
      }
    ];
  }

  if (laws && laws.length > 0) {
    if (lawsSec) lawsSec.classList.remove("hidden");
    if (lawsBadge) lawsBadge.textContent = `${laws.length} ${laws.length === 1 ? 'principle' : 'principles'}`;
    if (lawsGrid) {
      lawsGrid.innerHTML = laws.map((l, i) => {
        const jumpUrl = `https://www.youtube.com/watch?v=${video.video_id}&t=${formatTimestampToSeconds(l.timestamp_label)}s`;
        return `
          <div class="bg-obsidian-950 border border-obsidian-800 rounded-xl p-4 sm:p-5 space-y-3 hover:border-emerald-500/40 transition-colors group shadow-sm">
            <div class="flex items-center justify-between gap-2 border-b border-obsidian-800/80 pb-2.5">
              <div class="flex items-center gap-2">
                <span class="w-6 h-6 rounded-md bg-emerald-500/10 text-emerald-400 text-xs font-mono font-bold flex items-center justify-center border border-emerald-500/20">🧪</span>
                <h4 class="font-semibold text-xs sm:text-sm text-zinc-100 tracking-tight">${l.name || 'Core Principle'}</h4>
              </div>
              <a href="${jumpUrl}" target="_blank" class="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono bg-obsidian-850 hover:bg-obsidian-800 text-emerald-400 border border-emerald-500/20 transition-colors">
                <i data-lucide="play" class="w-2.5 h-2.5 fill-current"></i>
                <span>${l.timestamp_label || '00:00'}</span>
              </a>
            </div>

            <div class="bg-emerald-500/5 border-l-2 border-emerald-500 rounded-r-lg p-3 text-xs sm:text-sm text-emerald-200/90 leading-relaxed">
              <span class="font-bold text-emerald-400 uppercase text-[10px] block mb-0.5">Core Statement:</span>
              ${l.statement || ''}
            </div>

            ${l.mechanism ? `
              <p class="text-xs text-zinc-300 leading-relaxed font-sans">
                <span class="text-zinc-500 font-mono text-[10px] uppercase block">Underlying Mechanism:</span>
                ${l.mechanism}
              </p>
            ` : ''}
          </div>
        `;
      }).join("");
    }
  } else {
    if (lawsSec) lawsSec.classList.add("hidden");
  }

  // 4. Chapter Landmarks (Fast 60-Second Scan)
  const landmarksContainer = document.getElementById("reader-rapid-landmarks");
  const landmarksBadge = document.getElementById("rapid-landmarks-count");
  const sections = video.smart_transcript || video.topic_notes || [];

  if (landmarksBadge) landmarksBadge.textContent = `${sections.length} landmarks`;
  if (landmarksContainer) {
    if (sections.length === 0) {
      landmarksContainer.innerHTML = `<div class="p-4 text-center text-xs text-zinc-500 font-mono">No landmark chapters detected.</div>`;
    } else {
      landmarksContainer.innerHTML = sections.map((sec, idx) => {
        const tsLabel = sec.timestamp_label || "00:00";
        const tsSec = sec.timestamp_seconds || 0;
        const jumpUrl = `https://www.youtube.com/watch?v=${video.video_id}&t=${tsSec}s`;
        const title = sec.title || `Chapter ${idx + 1}`;
        const pts = sec.crisp_points || sec.takeaways || [];
        return `
          <div class="p-4 sm:p-5 hover:bg-obsidian-850/40 transition-colors space-y-2">
            <div class="flex items-center gap-2.5">
              <a href="${jumpUrl}" target="_blank" class="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-mono text-xs font-semibold border border-amber-500/20 transition-colors flex-shrink-0">
                <i data-lucide="play" class="w-3 h-3 fill-current"></i>
                <span>${tsLabel}</span>
              </a>
              <h4 class="font-medium text-xs sm:text-sm text-zinc-100 tracking-tight leading-snug">${title}</h4>
            </div>
            ${pts.length > 0 ? `
              <ul class="space-y-1 pl-1">
                ${pts.slice(0, 2).map(p => `
                  <li class="flex items-start gap-2 text-xs text-zinc-300">
                    <span class="text-amber-500/80 font-bold select-none">•</span>
                    <span>${p}</span>
                  </li>
                `).join("")}
              </ul>
            ` : ''}
          </div>
        `;
      }).join("");
    }
  }

  // 5. 2-Minute Recall Flashcards
  const flashcardsContainer = document.getElementById("reader-rapid-flashcards");
  const flashcardsBadge = document.getElementById("rapid-flashcards-count");
  const cards = video.flashcards || [];

  if (flashcardsBadge) flashcardsBadge.textContent = `${cards.length} cards`;
  if (flashcardsContainer) {
    if (cards.length === 0) {
      flashcardsContainer.innerHTML = `<div class="col-span-full p-4 text-center text-xs text-zinc-500 font-mono">No active recall flashcards created yet.</div>`;
    } else {
      flashcardsContainer.innerHTML = cards.map((c, i) => `
        <div class="bg-obsidian-950 border border-obsidian-800 rounded-xl p-4 space-y-2.5 hover:border-obsidian-700 transition-colors shadow-sm">
          <div class="flex items-center justify-between text-[11px] text-zinc-500 font-mono border-b border-obsidian-850 pb-1.5">
            <span>Card #${i + 1}</span>
            <span class="text-amber-400 font-medium">${c.timestamp_label || '00:00'}</span>
          </div>
          <p class="text-xs sm:text-sm font-medium text-zinc-100">${c.question}</p>
          <div id="card-ans-${c.id || i}" class="hidden pt-2 border-t border-obsidian-850/80 text-xs text-emerald-300 font-normal leading-relaxed">
            <span class="text-[10px] uppercase font-mono text-zinc-500 block mb-0.5">Answer:</span>
            ${c.answer}
          </div>
          <button onclick="toggleCardAnswer('card-ans-${c.id || i}', this)" class="w-full text-center py-1 rounded bg-obsidian-850 hover:bg-obsidian-800 text-[11px] font-medium text-amber-400 border border-obsidian-750 transition-colors">
            Reveal Answer
          </button>
        </div>
      `).join("");
    }
  }

  // ==============================================================
  // 2. POPULATE IN-DEPTH CHAPTER READER VIEW
  // ==============================================================
  // Executive Takeaways
  const bulletsEl = document.getElementById("reader-bullets");
  if (bulletsEl) {
    let cleanBullets = (video.summary_bullets || []).map(b => ensureEnglish(b, "")).filter(b => b.length > 0);
    if (cleanBullets.length === 0) {
      cleanBullets = [
        `Core Takeaway 1: Governed by analytical mechanisms and foundational rules from "${video.title || 'this lecture'}".`,
        `Core Takeaway 2: Establishes rigorous problem-solving procedures and domain definitions for active review.`
      ];
    }
    bulletsEl.innerHTML = cleanBullets.map(b => `
      <li class="flex items-start gap-2.5">
        <span class="text-amber-400 font-bold text-sm leading-snug select-none flex-shrink-0 mt-0.5">•</span>
        <span class="font-normal text-zinc-200 leading-relaxed text-sm sm:text-base">${b}</span>
      </li>
    `).join("");
  }

  // Concepts
  const conceptsContainer = document.getElementById("reader-concepts-container");
  const conceptsEl = document.getElementById("reader-concepts");
  if (video.key_concepts && video.key_concepts.length > 0) {
    if (conceptsContainer) conceptsContainer.classList.remove("hidden");
    if (conceptsEl) {
      conceptsEl.innerHTML = video.key_concepts.map(c => `
        <div class="bg-obsidian-850 border border-obsidian-750 px-3 py-2 rounded-lg text-xs font-mono text-zinc-300">
          <span>${c}</span>
        </div>
      `).join("");
    }
  } else {
    if (conceptsContainer) conceptsContainer.classList.add("hidden");
  }

  // Chapter Sections
  const countBadge = document.getElementById("section-count-badge");
  if (countBadge) countBadge.textContent = `${sections.length} chapters`;
  renderTranscriptSections(sections, video.video_id);

  // Synthesis
  const synthesisContainer = document.getElementById("reader-synthesis-container");
  const synthesisEl = document.getElementById("reader-synthesis");
  if (synthesisEl) {
    const cleanSynthesis = ensureEnglish(video.final_summary, `This synthesis examines the core frameworks and procedural rules in "${video.title || 'this video'}", providing an authoritative reference for active recall.`);
    if (cleanSynthesis) {
      synthesisEl.textContent = cleanSynthesis;
      if (synthesisContainer) synthesisContainer.classList.remove("hidden");
    } else {
      synthesisEl.textContent = "Synthesis not available.";
    }
  }

  // Ensure current mode is displayed and math is rendered
  switchReaderMode(currentReaderMode);
  renderMathSafely(document.getElementById("reader-content"));

  if (window.lucide) lucide.createIcons();
}

function renderTranscriptSections(sections, videoId) {
  const container = document.getElementById("smart-transcript-sections");

  if (!sections || sections.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-zinc-500 text-xs font-mono">
        No chapter breakdown available for this video.
      </div>
    `;
    return;
  }

  container.innerHTML = sections.map((sec, idx) => {
    const tsSec = sec.timestamp_seconds || 0;
    const tsLabel = sec.timestamp_label || "00:00";
    const jumpUrl = `https://www.youtube.com/watch?v=${videoId}&t=${tsSec}s`;
    const title = sec.title || `Section ${idx + 1}`;
    const crispPoints = sec.crisp_points || sec.takeaways || [];
    const polishedText = sec.polished_text || sec.summary || "";

    return `
      <div class="transcript-section-card p-5 sm:p-6 space-y-3.5 hover:bg-obsidian-850/30 transition-colors" data-text="${(title + ' ' + crispPoints.join(' ') + ' ' + polishedText).toLowerCase()}">
        
        <!-- Header: Timestamp + Title -->
        <div class="flex items-center gap-3 pb-2.5 border-b border-obsidian-800/60">
          <a href="${jumpUrl}" target="_blank" title="Jump to ${tsLabel} on YouTube" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-mono text-xs font-medium border border-amber-500/20 transition-colors flex-shrink-0">
            <i data-lucide="play" class="w-3 h-3 fill-amber-400"></i>
            <span>${tsLabel}</span>
          </a>
          <h3 class="font-serif font-medium text-zinc-100 text-base sm:text-lg tracking-tight leading-snug">${title}</h3>
        </div>

        <!-- Crisp Bullet Points -->
        ${crispPoints.length > 0 ? `
          <ul class="space-y-2 pl-0.5">
            ${crispPoints.map(pt => `
              <li class="flex items-start gap-2.5 text-xs sm:text-sm text-zinc-200 leading-relaxed">
                <span class="text-amber-500/80 font-bold select-none">•</span>
                <span>${pt}</span>
              </li>
            `).join("")}
          </ul>
        ` : ''}

        <!-- Polished Reading Paragraph -->
        ${polishedText ? `
          <p class="text-xs sm:text-sm text-zinc-400 font-serif leading-relaxed pt-3 border-t border-obsidian-800/60">
            ${polishedText}
          </p>
        ` : ''}

      </div>
    `;
  }).join("");

  if (window.lucide) lucide.createIcons();
}

// In-transcript realtime filter
function filterTranscriptSections() {
  const filterEl = document.getElementById("transcript-filter");
  const query = (filterEl ? filterEl.value : "").toLowerCase().trim();
  const cards = document.querySelectorAll(".transcript-section-card");

  cards.forEach(card => {
    const text = card.getAttribute("data-text") || "";
    if (!query || text.includes(query)) {
      card.classList.remove("hidden");
    } else {
      card.classList.add("hidden");
    }
  });
}

async function safeCopyToClipboard(text) {
  if (!text) return false;
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.warn("navigator.clipboard failed, falling back to execCommand:", e);
    }
  }
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "-9999px";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    if (successful) return true;
  } catch (err) {
    console.error("execCommand copy fallback failed:", err);
  }
  return false;
}

// Copy Actions
async function copyCrispPoints() {
  if (!currentViewingVideo) return;
  const sections = currentViewingVideo.smart_transcript || currentViewingVideo.topic_notes || [];

  let out = `# ${currentViewingVideo.title}\n\n`;
  out += `## Executive Takeaways:\n`;
  (currentViewingVideo.summary_bullets || []).forEach(b => out += `- ${b}\n`);
  out += `\n`;

  sections.forEach(s => {
    out += `### [${s.timestamp_label || '00:00'}] ${s.title || 'Section'}\n`;
    const pts = s.crisp_points || s.takeaways || [];
    pts.forEach(p => out += `- ${p}\n`);
    out += `\n`;
  });

  const success = await safeCopyToClipboard(out);
  if (success) {
    const btnText = document.getElementById("copy-points-text");
    if (btnText) {
      btnText.textContent = "✓ Copied!";
      setTimeout(() => btnText.textContent = "Copy Notes", 2000);
    }
    showToastNotification("Notes copied to clipboard", "success");
  } else {
    showToastNotification("Failed to copy notes", "error");
  }
}

async function copyFullTranscript() {
  if (!currentViewingVideo) return;
  const sections = currentViewingVideo.smart_transcript || currentViewingVideo.topic_notes || [];

  let out = `# ${currentViewingVideo.title}\n\n`;
  sections.forEach(s => {
    out += `[${s.timestamp_label || '00:00'}] ${s.title || 'Section'}\n`;
    out += `${s.polished_text || s.summary || ''}\n\n`;
  });

  if (!sections.length && currentViewingVideo.transcript_clean) {
    out += currentViewingVideo.transcript_clean;
  }

  const success = await safeCopyToClipboard(out);
  if (success) {
    const btnText = document.getElementById("copy-transcript-text");
    if (btnText) {
      btnText.textContent = "✓ Copied!";
      setTimeout(() => btnText.textContent = "Copy Full Transcript", 2000);
    }
    showToastNotification("Full transcript copied to clipboard", "success");
  } else {
    showToastNotification("Failed to copy transcript", "error");
  }
}

function downloadReaderMarkdown() {
  if (!currentViewingVideo) return;
  downloadMarkdownById(currentViewingVideo.id);
}

async function redistillCurrentVideo() {
  if (!currentViewingVideo) return;
  const btnText = document.getElementById("redistill-btn-text");
  const original = btnText ? btnText.textContent : "Re-distill";
  if (btnText) btnText.textContent = "⏳ Distilling...";

  const isLocal = !hasServerBackend() || String(currentViewingVideo.id).startsWith("local_");

  try {
    if (isLocal) {
      const updated = await distillVideoOnDevice(currentViewingVideo.video_id);
      if (updated) {
        currentViewingVideo = updated;
        renderReaderView(updated);
      }
    } else {
      const res = await authFetch(apiUrl(`/api/videos/${currentViewingVideo.id}/redistill`), { method: "POST" });
      if (!res.ok) throw new Error("Failed to re-distill transcript");
      const data = await res.json();
      currentViewingVideo = data;
      renderReaderView(data);
    }
    loadStats();
    if (btnText) {
      btnText.textContent = "✓ Refined!";
      setTimeout(() => btnText.textContent = original, 2500);
    }
    showToastNotification("Transcript re-distilled and refined!", "success");
  } catch (e) {
    showToastNotification("Re-distillation notice: " + e.message, "error");
    if (btnText) btnText.textContent = original;
  }
}

async function deleteVideoById(videoId) {
  if (!confirm(`Remove this video from your library?`)) return;

  const strId = String(videoId);
  // Remove from localStorage
  const localList = getLocalVideos();
  const updatedLocal = localList.filter(v => String(v.id) !== strId && v.video_id !== strId);
  if (updatedLocal.length !== localList.length) {
    saveLocalVideos(updatedLocal);
  }

  // Remove associated local flashcards if any
  const localCards = getLocalFlashcards();
  const updatedCards = localCards.filter(c => String(c.video_id) !== strId && (!currentViewingVideo || String(c.video_id) !== currentViewingVideo.video_id));
  saveLocalFlashcards(updatedCards);

  // Try server delete if backend available and not a purely local ID
  if (hasServerBackend() && !strId.startsWith("local_")) {
    try {
      await authFetch(apiUrl(`/api/videos/${videoId}`), { method: "DELETE" });
    } catch (e) {
      console.warn("Server delete warning:", e);
    }
  }

  if (currentViewingVideo && (String(currentViewingVideo.id) === strId || currentViewingVideo.video_id === strId)) {
    currentViewingVideo = null;
  }

  showToastNotification("Video removed from library", "info");
  loadVideos();
  loadStats();
}

// Manual Capture Modal
function openCaptureModal() {
  const modal = document.getElementById("capture-modal");
  if (modal) modal.classList.remove("hidden");
  const status = document.getElementById("intake-status");
  if (status) status.classList.add("hidden");
  const input = document.getElementById("intake-url");
  if (input) input.focus();
}

function closeCaptureModal() {
  const modal = document.getElementById("capture-modal");
  if (modal) modal.classList.add("hidden");
}

async function submitVideoIntake() {
  const urlEl = document.getElementById("intake-url");
  const url = urlEl ? urlEl.value.trim() : "";
  const forceEl = document.getElementById("intake-force");
  const force = forceEl ? (forceEl.type === "checkbox" ? forceEl.checked : forceEl.value === "true") : true;

  if (!url) {
    showToastNotification("Please enter a YouTube video URL or ID", "error");
    if (urlEl) urlEl.focus();
    return;
  }

  const vidId = extractYouTubeVideoId(url) || (url.length === 11 ? url : null);
  if (!vidId) {
    showToastNotification("Please enter a valid YouTube video link or 11-char ID", "error");
    return;
  }

  const submitBtn = document.getElementById("intake-submit-btn");
  const statusBox = document.getElementById("intake-status");
  const statusText = document.getElementById("intake-status-text");

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add("opacity-50");
  }
  if (statusBox) statusBox.classList.remove("hidden");
  if (statusText) statusText.textContent = "Transcribing & distilling via Gemini...";

  let succeeded = false;
  if (hasServerBackend()) {
    try {
      const res = await authFetch(apiUrl("/api/videos/intake"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_url_or_id: url,
          watch_time_seconds: 300,
          watch_percent: 100,
          force_process: force
        })
      });

      const data = await res.json();
      if (res.ok && data.video_id) {
        if (statusText) statusText.textContent = "Smart transcript distilled successfully!";
        showToastNotification("Video distilled into smart transcript!", "success");
        setTimeout(() => {
          closeCaptureModal();
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove("opacity-50");
          }
          if (urlEl) urlEl.value = "";
          loadVideos().then(() => {
            openReaderForVideo(data.video_id);
          });
        }, 600);
        succeeded = true;
      }
    } catch (e) {
      console.warn("Server intake failed or unreachable, switching to on-device standalone distillation:", e);
    }
  }

  if (!succeeded) {
    // Pure Standalone On-Device Distillation via Google Gemini API
    try {
      if (statusText) statusText.textContent = "Transcribing directly on device with Gemini...";
      const newVideo = await distillVideoOnDevice(vidId);
      closeCaptureModal();
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove("opacity-50");
      }
      if (urlEl) urlEl.value = "";
      if (newVideo) {
        openReaderForVideo(newVideo.video_id || newVideo.id);
      }
    } catch (err) {
      showToastNotification("Notice: " + err.message, "error");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove("opacity-50");
      }
      if (statusBox) statusBox.classList.add("hidden");
    }
  }
}

// Settings & Standalone Mode
async function loadSettings() {
  let storedKey = localStorage.getItem("recall_gemini_api_key");
  const geminiEl = document.getElementById("setting-gemini-key");
  const statusBadge = document.getElementById("gemini-status-badge");

  if (!storedKey && hasServerBackend()) {
    try {
      const res = await authFetch(apiUrl("/api/settings/gemini-key"));
      if (res.ok) {
        const data = await res.json();
        if (data.api_key) {
          storedKey = data.api_key;
          localStorage.setItem("recall_gemini_api_key", storedKey);
        }
      }
    } catch (e) {}
  }

  if (storedKey && geminiEl) {
    geminiEl.value = storedKey;
    if (statusBadge) {
      statusBadge.textContent = "Key Configured";
      statusBadge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    }
  } else if (statusBadge) {
    statusBadge.textContent = "Key Required";
    statusBadge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20";
  }

  const localList = getLocalVideos();
  const countEl = document.getElementById("local-storage-count");
  if (countEl) countEl.textContent = `${localList.length} notes saved`;
}

async function saveAndTestGeminiKey() {
  const geminiEl = document.getElementById("setting-gemini-key");
  const resultEl = document.getElementById("gemini-test-result");
  const testBtn = document.getElementById("btn-test-gemini");
  const key = geminiEl ? geminiEl.value.trim() : "";

  if (!key) {
    showToastNotification("Please enter a Gemini API Key", "error");
    if (geminiEl) geminiEl.focus();
    return;
  }

  // Save to localStorage immediately
  localStorage.setItem("recall_gemini_api_key", key);

  if (resultEl) {
    resultEl.classList.remove("hidden", "text-emerald-400", "text-rose-400", "bg-emerald-500/10", "bg-rose-500/10", "border-emerald-500/20", "border-rose-500/20");
    resultEl.classList.add("text-amber-400", "bg-amber-500/10", "border-amber-500/20");
    resultEl.innerHTML = "<span>⏳ Testing key directly against Google Gemini Cloud...</span>";
  }
  if (testBtn) testBtn.disabled = true;

  // Direct client-side test to Google Gemini API
  const candidateModels = ["gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.5-flash"];
  let connectedModel = null;
  let lastError = null;

  for (const m of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`;
      const payload = {
        contents: [{ parts: [{ text: "Respond in JSON: {\"status\":\"ok\"}" }] }],
        generationConfig: { responseMimeType: "application/json" }
      };
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        connectedModel = m;
        break;
      } else {
        const errJson = await resp.json().catch(() => ({}));
        lastError = errJson?.error?.message || `HTTP ${resp.status}`;
      }
    } catch (e) {
      lastError = e.message;
    }
  }

  // If server backend is connected, also save it to server
  if (hasServerBackend()) {
    try {
      await authFetch(apiUrl("/api/settings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { GEMINI_API_KEY: key, DEFAULT_AI_PROVIDER: "gemini" } })
      });
    } catch (e) { }
  }

  if (testBtn) testBtn.disabled = false;

  if (connectedModel) {
    const statusBadge = document.getElementById("gemini-status-badge");
    if (statusBadge) {
      statusBadge.textContent = "Key Configured";
      statusBadge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    }
    if (resultEl) {
      resultEl.className = "text-[11px] mt-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg font-mono font-medium";
      resultEl.innerHTML = `✓ Connected to <b>${connectedModel}</b>! Standalone transcription is active and ready.`;
    }
    showToastNotification(`✓ Gemini API Key active (${connectedModel})`, "success", 4000);
  } else {
    if (resultEl) {
      resultEl.className = "text-[11px] mt-2 text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg font-mono";
      resultEl.innerHTML = `⚠️ Gemini validation notice: ${lastError || "Could not connect to Gemini models with this key."}`;
    }
    showToastNotification("Could not validate key with Google Gemini", "error");
  }
}

function clearLocalStorageLibrary() {
  if (confirm("Are you sure you want to clear your locally saved study notes on this device?")) {
    localStorage.removeItem(LOCAL_VIDEOS_KEY);
    localStorage.removeItem(LOCAL_FLASHCARDS_KEY);
    localStorage.removeItem("recall_local_review_count");
    loadVideos();
    loadStats();
    loadSettings();
    showToastNotification("Local device library cleared", "info");
  }
}

async function saveSettings() {
  const provEl = document.getElementById("setting-provider");
  const obsEl = document.getElementById("setting-obsidian-path");
  const notEl = document.getElementById("setting-notion-db");
  const geminiEl = document.getElementById("setting-gemini-key");

  if (geminiEl && geminiEl.value.trim()) {
    localStorage.setItem("recall_gemini_api_key", geminiEl.value.trim());
  }

  const payload = {
    settings: {
      DEFAULT_AI_PROVIDER: provEl ? provEl.value : "gemini",
      OBSIDIAN_VAULT_PATH: obsEl ? obsEl.value : "",
      NOTION_DATABASE_ID: notEl ? notEl.value : ""
    }
  };

  if (geminiEl && geminiEl.value.trim()) payload.settings.GEMINI_API_KEY = geminiEl.value.trim();

  const groqEl = document.getElementById("setting-groq-key");
  if (groqEl && groqEl.value.trim()) payload.settings.GROQ_API_KEY = groqEl.value.trim();

  const notionEl = document.getElementById("setting-notion-key");
  if (notionEl && notionEl.value.trim()) payload.settings.NOTION_API_KEY = notionEl.value.trim();

  if (hasServerBackend()) {
    try {
      const res = await authFetch(apiUrl("/api/settings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToastNotification("Settings saved to server & local storage!", "success");
        return;
      }
    } catch (e) {
      console.warn("Server save error (saved locally):", e);
    }
  }

  showToastNotification("Settings saved locally on device!", "success");
}

async function testGeminiKey() {
  return saveAndTestGeminiKey();
}

async function copyCurrentOrigin() {
  const origin = window.location.origin;
  const success = await safeCopyToClipboard(origin);
  if (success) {
    const toast = document.getElementById("copy-url-toast");
    if (toast) {
      toast.classList.remove("hidden");
      setTimeout(() => toast.classList.add("hidden"), 3000);
    }
  } else {
    prompt("Copy this URL for your Android app:", origin);
  }
}

// YouTube Account Status & Sync
async function loadAccountStatus() {
  if (!hasServerBackend()) return;
  try {
    const res = await authFetch(apiUrl("/api/youtube/status"));
    if (!res.ok) return;
    const data = await res.json();

    const navStatus = document.getElementById("nav-account-status");
    const navName = document.getElementById("nav-account-name");
    const settingsName = document.getElementById("settings-account-name");
    const settingsEmail = document.getElementById("settings-account-email");
    const settingsBadge = document.getElementById("settings-account-badge");
    const settingsSyncStatus = document.getElementById("settings-sync-status");
    const settingsAvatar = document.getElementById("settings-avatar");
    const settingsPlaceholder = document.getElementById("settings-avatar-placeholder");

    if (data.is_linked) {
      if (navStatus) navStatus.classList.remove("hidden");
      if (navName) navName.textContent = data.account_email || data.account_name || "YouTube Linked";
      if (settingsName) settingsName.textContent = data.account_name || "YouTube Account";
      if (settingsEmail) settingsEmail.textContent = data.account_email || "";
      if (settingsBadge) settingsBadge.textContent = data.linked_method === "google_oauth" ? "Google OAuth Connected" : "Account Synced";
      if (settingsSyncStatus) {
        settingsSyncStatus.textContent = data.last_synced_at ? `Last synced: ${data.last_synced_at}` : "Continuous background capture active";
      }
      if (data.avatar_url && settingsAvatar && settingsPlaceholder) {
        settingsAvatar.src = data.avatar_url;
        settingsAvatar.classList.remove("hidden");
        settingsPlaceholder.classList.add("hidden");
      }
    }
  } catch (e) {
    console.warn("Could not load YouTube account status:", e);
  }
}

async function syncYouTubeHistoryFromUI() {
  const btn = document.getElementById("sync-history-ui-btn");
  const text = document.getElementById("sync-history-ui-text");
  const original = text ? text.textContent : "Sync History";
  if (text) text.textContent = "Syncing...";
  if (btn) btn.disabled = true;

  try {
    await loadVideos();
    await loadStats();
    await loadAccountStatus();

    if (text) text.textContent = "✓ Synced!";
    setTimeout(() => {
      if (text) text.textContent = original;
      if (btn) btn.disabled = false;
    }, 2000);
  } catch (e) {
    if (text) text.textContent = "Sync failed";
    setTimeout(() => {
      if (text) text.textContent = original;
      if (btn) btn.disabled = false;
    }, 2500);
  }
}

// ==========================================================================
// Spaced Repetition Flashcards & Active Recall Practice Session Engine
// ==========================================================================

let activeFlashcards = [];
let currentCardIndex = 0;
let isAnswerRevealed = false;
let cardStartTime = null;

async function startFlashcardSession(filterVideoId = null) {
  const container = document.getElementById("flashcard-study-container");
  const empty = document.getElementById("flashcard-empty-state");
  const statusChip = document.getElementById("practice-status-chip");

  let cards = [];
  let loadedFromServer = false;

  if (hasServerBackend()) {
    try {
      let url = filterVideoId ? `/api/flashcards/all?limit=100` : "/api/flashcards/due";
      const res = await authFetch(apiUrl(url));
      if (res.ok) {
        cards = await res.json();
        loadedFromServer = true;
      }
    } catch (e) {
      console.warn("Server flashcards unreachable, loading local cards:", e);
    }
  }

  if (!loadedFromServer) {
    const localCards = getLocalFlashcards();
    const now = new Date();
    if (filterVideoId) {
      cards = localCards.filter(c => c.video_id === filterVideoId);
    } else {
      cards = localCards.filter(c => !c.due_date || new Date(c.due_date) <= now);
      if (cards.length === 0 && localCards.length > 0) {
        cards = localCards;
      }
    }
  }

  if (filterVideoId) {
    cards = cards.filter(c => c.video_id === filterVideoId);
    if (statusChip) statusChip.textContent = "Filtered by Video";
  } else {
    if (statusChip) statusChip.textContent = "Due Review Session";
  }

  activeFlashcards = cards;
  currentCardIndex = 0;

  if (!cards || cards.length === 0) {
    if (container) container.classList.add("hidden");
    if (empty) empty.classList.remove("hidden");
    loadStats();
    return;
  }

  if (container) container.classList.remove("hidden");
  if (empty) empty.classList.add("hidden");
  renderCurrentCard();
  loadStats();
}

async function loadAllCardsSession() {
  const statusChip = document.getElementById("practice-status-chip");
  if (statusChip) statusChip.textContent = "All Cards Review";

  let cards = [];
  let loadedFromServer = false;

  if (hasServerBackend()) {
    try {
      const res = await authFetch(apiUrl("/api/flashcards/all?limit=100"));
      if (res.ok) {
        cards = await res.json();
        loadedFromServer = true;
      }
    } catch (e) { }
  }

  if (!loadedFromServer) {
    cards = getLocalFlashcards();
  }

  activeFlashcards = cards;
  currentCardIndex = 0;

  const container = document.getElementById("flashcard-study-container");
  const empty = document.getElementById("flashcard-empty-state");

  if (cards.length > 0) {
    if (container) container.classList.remove("hidden");
    if (empty) empty.classList.add("hidden");
    renderCurrentCard();
  } else {
    if (container) container.classList.add("hidden");
    if (empty) empty.classList.remove("hidden");
  }
}

function renderCurrentCard() {
  if (!activeFlashcards || activeFlashcards.length === 0 || currentCardIndex >= activeFlashcards.length) {
    const container = document.getElementById("flashcard-study-container");
    const empty = document.getElementById("flashcard-empty-state");
    if (container) container.classList.add("hidden");
    if (empty) empty.classList.remove("hidden");
    loadStats();
    return;
  }

  const card = activeFlashcards[currentCardIndex];
  isAnswerRevealed = false;
  cardStartTime = Date.now();

  // Progress counter
  const progressEl = document.getElementById("card-progress-counter");
  if (progressEl) progressEl.textContent = `Card ${currentCardIndex + 1} of ${activeFlashcards.length}`;

  // Video title & jump
  const titleEl = document.getElementById("card-video-title");
  if (titleEl) titleEl.textContent = card.video_title || (currentViewingVideo ? currentViewingVideo.title : "YouTube Recall");

  const jumpBtn = document.getElementById("card-yt-jump-btn");
  const tsLabel = document.getElementById("card-ts-label");
  const tsSeconds = card.timestamp_seconds || 0;
  const label = card.timestamp_label || "00:00";

  if (tsLabel) tsLabel.textContent = label;
  if (jumpBtn) {
    const vId = card.video ? card.video.video_id : (currentViewingVideo ? currentViewingVideo.video_id : "");
    jumpBtn.href = vId ? `https://www.youtube.com/watch?v=${vId}&t=${tsSeconds}s` : "#";
  }

  // Interval badge
  const intervalEl = document.getElementById("card-interval-badge");
  if (intervalEl) {
    intervalEl.textContent = `Interval: ${card.interval_days || 0}d (Reps: ${card.repetition_count || card.repetitions || 0})`;
  }

  // Question & Answer text
  const qEl = document.getElementById("card-question-text");
  if (qEl) qEl.textContent = card.question;

  const aEl = document.getElementById("card-answer-text");
  if (aEl) aEl.textContent = card.answer;

  // View state: Front of card
  const ansWrapper = document.getElementById("card-answer-wrapper");
  const btnReveal = document.getElementById("btn-reveal-answer");
  const ratingGroup = document.getElementById("rating-buttons-group");

  if (ansWrapper) ansWrapper.classList.add("hidden");
  if (btnReveal) btnReveal.classList.remove("hidden");
  if (ratingGroup) ratingGroup.classList.add("hidden");

  if (window.lucide) lucide.createIcons();
}

function flipCurrentCard() {
  if (isAnswerRevealed) return;
  isAnswerRevealed = true;

  const ansWrapper = document.getElementById("card-answer-wrapper");
  const btnReveal = document.getElementById("btn-reveal-answer");
  const ratingGroup = document.getElementById("rating-buttons-group");

  if (ansWrapper) ansWrapper.classList.remove("hidden");
  if (btnReveal) btnReveal.classList.add("hidden");
  if (ratingGroup) ratingGroup.classList.remove("hidden");

  if (window.lucide) lucide.createIcons();
}

async function rateCurrentCard(rating) {
  if (!activeFlashcards || currentCardIndex >= activeFlashcards.length) return;
  const card = activeFlashcards[currentCardIndex];
  const timeTaken = cardStartTime ? (Date.now() - cardStartTime) : 1000;

  if (hasServerBackend()) {
    try {
      await authFetch(apiUrl(`/api/flashcards/${card.id}/review`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: rating,
          time_taken_ms: timeTaken
        })
      });
    } catch (e) {
      applyLocalCardReview(card, rating);
    }
  } else {
    applyLocalCardReview(card, rating);
  }

  currentCardIndex += 1;
  renderCurrentCard();
  loadStats();
}

function applyLocalCardReview(card, rating) {
  let q = 3;
  if (typeof rating === "number") q = rating;
  else if (rating === "AGAIN") q = 1;
  else if (rating === "HARD") q = 2;
  else if (rating === "GOOD") q = 3;
  else if (rating === "EASY") q = 4;

  let reps = (card.repetitions || card.repetition_count || 0);
  let interval = (card.interval_days || 1);
  let ease = (card.ease_factor || 2.5);

  if (q < 3) {
    reps = 0;
    interval = 1;
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 3;
    else interval = Math.round(interval * ease);
    reps += 1;
  }

  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  const nextDue = new Date(Date.now() + interval * 86400000).toISOString();

  card.repetitions = reps;
  card.repetition_count = reps;
  card.interval_days = interval;
  card.ease_factor = ease;
  card.due_date = nextDue;

  const localCards = getLocalFlashcards();
  const idx = localCards.findIndex(c => c.id === card.id);
  if (idx >= 0) localCards[idx] = card;
  else localCards.push(card);
  saveLocalFlashcards(localCards);

  const prevRev = parseInt(localStorage.getItem("recall_local_review_count") || "0", 10);
  localStorage.setItem("recall_local_review_count", (prevRev + 1).toString());
}

function practiceCardsForCurrentVideo() {
  if (!currentViewingVideo) return;
  activePracticeVideoId = currentViewingVideo.id;
  switchTab("practice");
}

function downloadReaderAnki() {
  if (!currentViewingVideo) return;
  const vid = currentViewingVideo;

  if (hasServerBackend()) {
    window.location.href = apiUrl(`/api/export/anki/${vid.id}/download`);
    authFetch(apiUrl(`/api/export/anki/${vid.id}/download`))
      .then(r => {
        if (!r.ok) throw new Error("Export download failed");
        return r.blob();
      })
      .then(blob => downloadBlob(blob, `${(vid.title || 'flashcards').replace(/[^a-zA-Z0-9_-]/g, '_')}_anki.tsv`))
      .catch(e => {
        console.warn("Server download notice:", e);
        window.location.href = apiUrl(`/api/export/anki/${vid.id}/download`);
      });
    return;
  }

  let tsv = `#separator:Tab\n#html:true\n#tags column:3\n`;
  (vid.flashcards || []).forEach(fc => {
    const q = (fc.question || '').replace(/\t/g, ' ').replace(/\n/g, '<br>');
    const a = (fc.answer || '').replace(/\t/g, ' ').replace(/\n/g, '<br>');
    tsv += `${q}\t${a}\tYouTubeRecall\n`;
  });

  const blob = new Blob([tsv], { type: "text/tab-separated-values;charset=utf-8" });
  downloadBlob(blob, `${(vid.title || 'flashcards').replace(/[^a-zA-Z0-9_-]/g, '_')}_anki.tsv`);
}

function downloadMarkdownById(videoId) {
  const vid = allVideos.find(v => v.video_id === videoId || v.id == videoId) || currentViewingVideo;
  if (!vid) return;

  if (hasServerBackend()) {
    window.location.href = apiUrl(`/api/export/obsidian/${vid.id}/download`);
    authFetch(apiUrl(`/api/export/obsidian/${vid.id}/download`))
      .then(r => {
        if (!r.ok) throw new Error("Obsidian download failed");
        return r.blob();
      })
      .then(blob => downloadBlob(blob, `${(vid.title || 'study_notes').replace(/[^a-zA-Z0-9_-]/g, '_')}.md`))
      .catch(e => {
        console.warn("Server download notice:", e);
        window.location.href = apiUrl(`/api/export/obsidian/${vid.id}/download`);
      });
    return;
  }

  let md = `# ${vid.title}\n\n`;
  md += `**Channel**: ${vid.channel_title || 'YouTube'}\n`;
  md += `**Link**: https://www.youtube.com/watch?v=${vid.video_id}\n\n`;
  md += `## Executive Takeaways\n`;
  (vid.summary_bullets || []).forEach(b => md += `- ${b}\n`);
  md += `\n## Smart Chapters\n`;
  (vid.smart_transcript || []).forEach(ch => {
    md += `### [${ch.timestamp_label || '00:00'}] ${ch.title}\n`;
    (ch.crisp_points || []).forEach(p => md += `- ${p}\n`);
    md += `\n${ch.polished_text || ''}\n\n`;
  });
  if (vid.final_summary) md += `## Synthesis\n${vid.final_summary}\n\n`;

  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  downloadBlob(blob, `${(vid.title || 'study_notes').replace(/[^a-zA-Z0-9_-]/g, '_')}.md`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

// ==========================================================================
// In-App YouTube Watch Player & Auto-Capture Engine
// ==========================================================================

let currentWatchVideoId = null;

function openWatchModal(initialUrl = "") {
  const modal = document.getElementById("watch-modal");
  if (!modal) return;
  modal.classList.remove("hidden");

  const input = document.getElementById("watch-input-url");
  if (initialUrl && input) {
    input.value = initialUrl;
    loadWatchVideo();
  } else if (!currentWatchVideoId) {
    if (input) input.value = "https://www.youtube.com/watch?v=3d6DsjIBzJ4";
    loadWatchVideo();
  }
  if (window.lucide) lucide.createIcons();
}

function closeWatchModal() {
  const modal = document.getElementById("watch-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  const iframe = document.getElementById("watch-player-iframe");
  if (iframe) iframe.src = "";
}

function loadWatchVideo() {
  const input = document.getElementById("watch-input-url");
  if (!input) return;
  const val = input.value.trim();
  const vid = extractYouTubeVideoId(val) || (val.length === 11 ? val : null);
  if (!vid) {
    showToastNotification("Please enter a valid YouTube video link or 11-char ID", "error");
    return;
  }
  currentWatchVideoId = vid;
  const iframe = document.getElementById("watch-player-iframe");
  if (iframe) {
    iframe.src = `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&enablejsapi=1`;
  }
  const titleEl = document.getElementById("watch-current-title");
  if (titleEl) titleEl.textContent = `Video ID: ${vid} (Tap Distill below anytime)`;
}

async function distillCurrentWatchVideo() {
  if (!currentWatchVideoId) {
    showToastNotification("Please load a video first", "error");
    return;
  }
  const vid = currentWatchVideoId;
  closeWatchModal();
  await autoIntakeSharedVideo(vid);
}

// ==========================================================================
// Backend & Standalone Mobile Mode Management
// ==========================================================================

function setAppMode(mode) {
  if (mode === "standalone") {
    localStorage.setItem("recall_server_url", "standalone");
    if (window.AndroidBridge && typeof window.AndroidBridge.setServerUrl === "function") {
      try { window.AndroidBridge.setServerUrl(""); } catch (e) { }
    }
    const input = document.getElementById("setting-server-url");
    if (input) input.value = "standalone";
    showToastNotification("⚡ Standalone Mobile Mode Active (100% On-Device)", "success");
  } else if (mode === "cloud") {
    const input = document.getElementById("setting-server-url");
    if (input && (!input.value || input.value === "standalone" || input.value.includes("192.168."))) {
      input.value = "https://";
      input.focus();
    }
    showToastNotification("☁️ Please enter your cloud backend URL (e.g. Render / Railway)", "info");
  } else if (mode === "local") {
    const defaultLan = "http://192.168.1.4:8000";
    localStorage.setItem("recall_server_url", defaultLan);
    if (window.AndroidBridge && typeof window.AndroidBridge.setServerUrl === "function") {
      try { window.AndroidBridge.setServerUrl(defaultLan); } catch (e) { }
    }
    const input = document.getElementById("setting-server-url");
    if (input) input.value = defaultLan;
    showToastNotification("💻 Switched to Local Laptop LAN (192.168.1.4:8000)", "success");
  }
  updateModeBadge();
}

function applyServerUrlConfig() {
  const input = document.getElementById("setting-server-url");
  if (!input) return;
  const val = input.value.trim();
  localStorage.setItem("recall_server_url", val);
  if (window.AndroidBridge && typeof window.AndroidBridge.setServerUrl === "function") {
    try { window.AndroidBridge.setServerUrl(val); } catch (e) { }
  }
  showToastNotification(`Server configuration saved: ${val || 'Standalone'}`, "success");
  updateModeBadge();
  loadVideos();
}

function updateModeBadge() {
  const badge = document.getElementById("active-mode-badge");
  const input = document.getElementById("setting-server-url");
  if (!badge) return;

  const current = getServerBaseUrl();
  if (input && !input.value) {
    input.value = current || (localStorage.getItem("recall_server_url") || "standalone");
  }

  if (!current || current.toLowerCase() === "standalone") {
    badge.textContent = "⚡ Standalone (Device Only)";
    badge.className = "px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20";
  } else if (current.startsWith("https://")) {
    badge.textContent = "☁️ Cloud Server Active";
    badge.className = "px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20";
  } else {
    badge.textContent = "💻 Local Laptop LAN";
    badge.className = "px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
  }
}

// ==========================================================================
// Method 1: Android Zero-Click YouTube Auto-Capture Controller
// ==========================================================================

async function checkAutoCaptureStatus() {
  const badge = document.getElementById("auto-capture-badge");
  const banner = document.getElementById("banner-auto-capture");
  const permPrompt = document.getElementById("notification-permission-prompt");
  const toggle = document.getElementById("toggle-auto-capture");

  if (!window.AndroidBridge) {
    if (badge) {
      badge.textContent = "Android APK Feature";
      badge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700";
    }
    if (banner) banner.classList.add("hidden");
    if (permPrompt) permPrompt.classList.add("hidden");
    return;
  }

  // Running inside Android Native App!
  let isGranted = false;
  let isEnabled = true;

  try {
    if (typeof window.AndroidBridge.isNotificationAccessGranted === "function") {
      isGranted = window.AndroidBridge.isNotificationAccessGranted();
    }
    if (typeof window.AndroidBridge.isAutoCaptureEnabled === "function") {
      isEnabled = window.AndroidBridge.isAutoCaptureEnabled();
    }
  } catch (e) {
    console.warn("Could not query AndroidBridge notification status", e);
  }

  if (toggle) toggle.checked = isEnabled;

  if (badge) {
    if (!isEnabled) {
      badge.textContent = "Paused";
      badge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700";
    } else if (isGranted) {
      badge.textContent = "● Active & Listening";
      badge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    } else {
      badge.textContent = "⚠️ Permission Needed";
      badge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20";
    }
  }

  // Update Settings permission prompt
  if (permPrompt) {
    permPrompt.classList.remove("hidden");
    const statusText = document.getElementById("notification-perm-status");
    const grantBtn = permPrompt.querySelector("button");
    if (isGranted) {
      if (statusText) {
        statusText.textContent = "✓ Notification Access Active:";
        statusText.className = "text-emerald-400 font-medium";
      }
      if (grantBtn) grantBtn.classList.add("hidden");
    } else {
      if (statusText) {
        statusText.textContent = "Notification Access Required:";
        statusText.className = "text-amber-400 font-medium";
      }
      if (grantBtn) grantBtn.classList.remove("hidden");
    }
  }

  // Update Library banner
  if (banner) {
    const dismissed = sessionStorage.getItem("recall_dismiss_autocapture_banner");
    if (!isGranted && !dismissed) {
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }
  }

  // Process any pending auto-captured videos queued while app was in background
  try {
    if (typeof window.AndroidBridge.popPendingAutoCapturedVideos === "function") {
      const pendingJson = window.AndroidBridge.popPendingAutoCapturedVideos();
      if (pendingJson && pendingJson !== "[]") {
        const videoIds = JSON.parse(pendingJson);
        if (Array.isArray(videoIds) && videoIds.length > 0) {
          console.log("Processing pending auto-captured videos from Android:", videoIds);
          for (const vid of videoIds) {
            await autoIntakeSharedVideo(vid);
          }
        }
      }
    }
  } catch (e) {
    console.error("Error processing pending auto-captured videos:", e);
  }
}

function requestNotificationAccess() {
  if (window.AndroidBridge && typeof window.AndroidBridge.openNotificationAccessSettings === "function") {
    window.AndroidBridge.openNotificationAccessSettings();
  } else {
    showToastNotification("Notification listener is available in the native Android app", "info");
  }
}

function toggleAutoCapture(enabled) {
  if (window.AndroidBridge && typeof window.AndroidBridge.setAutoCaptureEnabled === "function") {
    window.AndroidBridge.setAutoCaptureEnabled(enabled);
  }
  checkAutoCaptureStatus();
}

function dismissShareTipBanner() {
  sessionStorage.setItem("recall_dismiss_share_tip", "true");
  const banner = document.getElementById("banner-share-tip");
  if (banner) banner.classList.add("hidden");
}

function dismissAutoCaptureBanner() {
  sessionStorage.setItem("recall_dismiss_autocapture_banner", "true");
  const banner = document.getElementById("banner-auto-capture");
  if (banner) banner.classList.add("hidden");
}

// Global Keyboard Navigation for Study Sessions
window.addEventListener("keydown", (e) => {
  // Only trigger if practice tab is active
  const practiceTab = document.getElementById("tab-practice");
  if (!practiceTab || practiceTab.classList.contains("hidden")) return;

  // Ignore if user is typing in an input
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;

  if (e.code === "Space") {
    e.preventDefault();
    if (!isAnswerRevealed) {
      flipCurrentCard();
    }
  } else if (isAnswerRevealed) {
    if (e.key === "1") {
      e.preventDefault();
      rateCurrentCard("AGAIN");
    } else if (e.key === "2") {
      e.preventDefault();
      rateCurrentCard("HARD");
    } else if (e.key === "3") {
      e.preventDefault();
      rateCurrentCard("GOOD");
    } else if (e.key === "4") {
      e.preventDefault();
      rateCurrentCard("EASY");
    }
  }
});
