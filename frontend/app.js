// YouTube Recall Frontend Application Logic

let allVideos = [];
let dueFlashcards = [];
let currentCardIndex = 0;
let currentViewingVideo = null;
let activeCategory = "";

document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();
  loadStats();
  loadVideos();
  loadDueCards();
  loadSettings();
  setupKeyboardShortcuts();
});

// Navigation Tabs
function switchTab(tab) {
  const tabs = ["library", "review", "settings"];
  tabs.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    const btn = document.getElementById(`nav-${t}-btn`);
    if (t === tab) {
      el.classList.remove("hidden");
      btn.classList.add("active");
    } else {
      el.classList.add("hidden");
      btn.classList.remove("active");
    }
  });

  if (tab === "review") {
    loadDueCards();
  } else if (tab === "library") {
    loadVideos();
  }
}

// Fetch & Update Stats
async function loadStats() {
  try {
    const res = await fetch("/api/flashcards/stats");
    if (!res.ok) return;
    const stats = await res.json();
    document.getElementById("stat-videos").textContent = stats.processed_videos;
    document.getElementById("stat-cards").textContent = stats.total_flashcards;
    document.getElementById("stat-due").textContent = stats.cards_due_today;
    document.getElementById("stat-mastered").textContent = stats.cards_mastered;
    document.getElementById("stat-reviews").textContent = stats.total_reviews_completed;

    const dueBadge = document.getElementById("due-badge");
    if (stats.cards_due_today > 0) {
      dueBadge.textContent = stats.cards_due_today;
      dueBadge.classList.remove("hidden");
    } else {
      dueBadge.classList.add("hidden");
    }
  } catch (e) {
    console.error("Failed to load stats:", e);
  }
}

// Load Videos
async function loadVideos() {
  try {
    const res = await fetch("/api/videos");
    if (!res.ok) return;
    allVideos = await res.json();
    renderVideosGrid();
    loadStats();
  } catch (e) {
    console.error("Failed to load videos:", e);
  }
}

function renderVideosGrid() {
  const grid = document.getElementById("videos-grid");
  const empty = document.getElementById("library-empty");
  const search = document.getElementById("search-input").value.toLowerCase();

  let filtered = allVideos.filter(v => {
    const matchSearch = v.title.toLowerCase().includes(search) || v.channel_title.toLowerCase().includes(search);
    const matchCat = !activeCategory || (v.category && v.category.toLowerCase().includes(activeCategory.toLowerCase()));
    return matchSearch && matchCat;
  });

  if (filtered.length === 0) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  grid.innerHTML = filtered.map(v => {
    const durationMin = Math.floor(v.duration_seconds / 60);
    const cardCount = v.flashcards ? v.flashcards.length : 0;
    const bulletsCount = v.summary_bullets ? v.summary_bullets.length : 0;

    return `
      <div class="bg-dark-800 border border-dark-700/80 rounded-xl overflow-hidden shadow-lg hover:border-slate-500 transition-all flex flex-col justify-between group">
        <div>
          <!-- Thumbnail & duration pill -->
          <div class="relative aspect-video bg-dark-900 overflow-hidden cursor-pointer" onclick="openVideoModal('${v.video_id}')">
            <img src="${v.thumbnail_url || 'https://img.youtube.com/vi/' + v.video_id + '/mqdefault.jpg'}" alt="${v.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
            <span class="absolute bottom-2 right-2 px-2 py-0.5 rounded text-[11px] font-mono bg-black/80 text-white font-semibold">
              ${durationMin}m
            </span>
            <span class="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-brand-500/20 text-brand-300 border border-brand-500/30 backdrop-blur">
              ${v.category}
            </span>
          </div>

          <!-- Video Details -->
          <div class="p-4">
            <h3 onclick="openVideoModal('${v.video_id}')" class="font-semibold text-white text-sm line-clamp-2 hover:text-brand-400 cursor-pointer transition-colors mb-1">
              ${v.title}
            </h3>
            <p class="text-xs text-slate-400 mb-3">${v.channel_title}</p>
            
            <!-- Summary bullet preview -->
            ${bulletsCount > 0 ? `
              <p class="text-xs text-slate-300 line-clamp-2 italic bg-dark-900/60 p-2.5 rounded-lg border border-dark-700/40">
                "${v.summary_bullets[0]}"
              </p>
            ` : ''}
          </div>
        </div>

        <!-- Card Footer -->
        <div class="p-4 pt-0 border-t border-dark-700/60 mt-3 flex items-center justify-between text-xs text-slate-400">
          <div class="flex items-center gap-1.5 text-brand-400 font-medium">
            <i data-lucide="layers" class="w-3.5 h-3.5"></i>
            <span>${cardCount} flashcards</span>
          </div>
          <div class="flex items-center gap-1">
            <button onclick="openVideoModal('${v.video_id}')" title="Study Notes" class="p-1.5 rounded-lg hover:bg-dark-700 hover:text-white transition-colors">
              <i data-lucide="book-open" class="w-4 h-4"></i>
            </button>
            <button onclick="downloadMarkdownById(${v.id})" title="Download Obsidian Note" class="p-1.5 rounded-lg hover:bg-dark-700 hover:text-purple-400 transition-colors">
              <i data-lucide="file-text" class="w-4 h-4"></i>
            </button>
            <button onclick="deleteVideoById(${v.id})" title="Delete" class="p-1.5 rounded-lg hover:bg-dark-700 hover:text-rose-400 transition-colors">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
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

// TAB 2: Spaced Repetition Practice
async function loadDueCards() {
  try {
    const res = await fetch("/api/flashcards/due");
    if (!res.ok) return;
    dueFlashcards = await res.json();
    currentCardIndex = 0;
    renderCurrentCard();
    loadStats();
  } catch (e) {
    console.error("Failed to load due cards:", e);
  }
}

function renderCurrentCard() {
  const container = document.getElementById("flashcard-container");
  const completeState = document.getElementById("review-complete");
  const counter = document.getElementById("review-counter");

  if (!dueFlashcards || dueFlashcards.length === 0 || currentCardIndex >= dueFlashcards.length) {
    container.classList.add("hidden");
    completeState.classList.remove("hidden");
    counter.textContent = "0 of 0";
    return;
  }

  container.classList.remove("hidden");
  completeState.classList.add("hidden");

  const card = dueFlashcards[currentCardIndex];
  counter.textContent = `${currentCardIndex + 1} of ${dueFlashcards.length}`;

  document.getElementById("card-video-title").textContent = card.video_title || "YouTube Video";
  document.getElementById("card-question").textContent = card.question;
  document.getElementById("card-answer").textContent = card.answer;
  
  const tsLabel = card.timestamp_label || "00:00";
  document.getElementById("card-ts-label").textContent = `▶ ${tsLabel}`;
  document.getElementById("card-ts-link").href = `https://www.youtube.com/watch?v=${card.video_id}&t=${card.timestamp_seconds || 0}s`;

  // Reset answer reveal state
  document.getElementById("card-answer-section").classList.add("hidden");
  document.getElementById("reveal-btn-container").classList.remove("hidden");
  document.getElementById("rating-buttons-container").classList.add("hidden");
}

function revealCardAnswer() {
  document.getElementById("card-answer-section").classList.remove("hidden");
  document.getElementById("reveal-btn-container").classList.add("hidden");
  document.getElementById("rating-buttons-container").classList.remove("hidden");
}

async function rateCard(rating) {
  if (currentCardIndex >= dueFlashcards.length) return;
  const card = dueFlashcards[currentCardIndex];

  try {
    const res = await fetch(`/api/flashcards/${card.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: rating })
    });
    if (!res.ok) {
      console.error("Failed to submit review");
    }
  } catch (e) {
    console.error("Review request error:", e);
  }

  currentCardIndex++;
  renderCurrentCard();
  loadStats();
}

function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    // Only in review tab
    const reviewTab = document.getElementById("tab-review");
    if (reviewTab.classList.contains("hidden")) return;

    const answerVisible = !document.getElementById("card-answer-section").classList.contains("hidden");

    if (e.code === "Space" && !answerVisible) {
      e.preventDefault();
      revealCardAnswer();
    } else if (answerVisible) {
      if (e.key === "1") rateCard("AGAIN");
      else if (e.key === "2") rateCard("HARD");
      else if (e.key === "3") rateCard("GOOD");
      else if (e.key === "4") rateCard("EASY");
    }
  });
}

// Video Study Notes Modal
function openVideoModal(videoIdOrRaw) {
  const video = allVideos.find(v => v.video_id === videoIdOrRaw || v.id == videoIdOrRaw);
  if (!video) return;
  currentViewingVideo = video;

  document.getElementById("modal-title").textContent = video.title;
  document.getElementById("modal-category").textContent = video.category;
  document.getElementById("modal-channel").textContent = video.channel_title;
  document.getElementById("modal-duration").textContent = `${Math.floor(video.duration_seconds / 60)}m ${video.duration_seconds % 60}s`;
  document.getElementById("modal-yt-link").href = `https://www.youtube.com/watch?v=${video.video_id}`;

  // Bullets
  const bulletsEl = document.getElementById("modal-bullets");
  bulletsEl.innerHTML = (video.summary_bullets || []).map(b => `<li>${b}</li>`).join("");

  // Key Concepts
  const conceptsEl = document.getElementById("modal-concepts");
  conceptsEl.innerHTML = (video.key_concepts || []).map(c => `
    <div class="bg-dark-900/80 border border-dark-700/60 p-2.5 rounded-lg text-xs">
      ${c}
    </div>
  `).join("");

  // Topics
  const topicsEl = document.getElementById("modal-topics");
  topicsEl.innerHTML = (video.topic_notes || []).map(t => `
    <div class="bg-dark-900/80 border border-dark-700/60 p-3 rounded-lg">
      <div class="flex items-center justify-between mb-1">
        <span class="font-semibold text-white text-xs">${t.title || 'Topic'}</span>
        <a href="https://www.youtube.com/watch?v=${video.video_id}&t=${t.timestamp_seconds || 0}s" target="_blank" class="text-brand-400 font-mono text-xs hover:underline flex items-center gap-1">
          ▶ ${t.timestamp_label || '00:00'}
        </a>
      </div>
      <p class="text-slate-300 text-xs">${t.summary || ''}</p>
    </div>
  `).join("");

  // Flashcards
  const flashEl = document.getElementById("modal-flashcards");
  flashEl.innerHTML = (video.flashcards || []).map(f => `
    <details class="bg-dark-900/80 border border-dark-700/60 rounded-lg p-2.5 cursor-pointer">
      <summary class="font-medium text-slate-200 text-xs flex items-center justify-between">
        <span>${f.question}</span>
        <span class="text-slate-500 text-[10px] ml-2">Click to reveal</span>
      </summary>
      <div class="mt-2 pt-2 border-t border-dark-700 text-brand-300 text-xs">
        ${f.answer}
      </div>
    </details>
  `).join("");

  // Synthesis
  document.getElementById("modal-synthesis").textContent = video.final_summary || "Synthesis not available.";

  document.getElementById("video-modal").classList.remove("hidden");
  if (window.lucide) lucide.createIcons();
}

function closeVideoModal() {
  document.getElementById("video-modal").classList.add("hidden");
}

// Exports
async function exportCurrentVideo(target) {
  if (!currentViewingVideo) return;
  const btn = document.getElementById(`modal-export-${target}-btn`);
  const originalText = btn.innerHTML;
  btn.innerHTML = `<span>Exporting...</span>`;

  try {
    const res = await fetch(`/api/export/${target}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: target, video_id: currentViewingVideo.id })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`Success: ${data.message || 'Exported successfully!'}`);
    } else {
      alert(`Export Notice: ${data.detail || data.message}`);
    }
  } catch (e) {
    alert(`Export Error: ${e.message}`);
  } finally {
    btn.innerHTML = originalText;
    if (window.lucide) lucide.createIcons();
  }
}

function downloadCurrentVideoTsv() {
  if (!currentViewingVideo) return;
  window.location.href = `/api/export/anki/${currentViewingVideo.id}/download-tsv`;
}

function downloadMarkdownById(videoId) {
  window.location.href = `/api/export/obsidian/${videoId}/download`;
}

async function deleteVideoById(videoId) {
  if (!confirm("Are you sure you want to delete this video and all its flashcards?")) return;
  try {
    const res = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
    if (res.ok) {
      loadVideos();
    }
  } catch (e) {
    alert("Delete failed: " + e.message);
  }
}

// Manual Capture Modal
function openCaptureModal() {
  document.getElementById("capture-modal").classList.remove("hidden");
  document.getElementById("intake-status").classList.add("hidden");
  document.getElementById("intake-url").focus();
}

function closeCaptureModal() {
  document.getElementById("capture-modal").classList.add("hidden");
}

async function submitVideoIntake() {
  const url = document.getElementById("intake-url").value.trim();
  const watchTime = parseInt(document.getElementById("intake-watch-time").value) || 0;
  const watchPct = parseFloat(document.getElementById("intake-watch-pct").value) || 0.0;
  const force = document.getElementById("intake-force").checked;

  if (!url) {
    alert("Please enter a YouTube video URL or ID.");
    return;
  }

  const submitBtn = document.getElementById("intake-submit-btn");
  const statusBox = document.getElementById("intake-status");
  const statusText = document.getElementById("intake-status-text");

  submitBtn.disabled = true;
  submitBtn.classList.add("opacity-50");
  statusBox.classList.remove("hidden");
  statusText.textContent = "Connecting to pipeline & transcribing...";

  try {
    const res = await fetch("/api/videos/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        video_url_or_id: url,
        watch_time_seconds: watchTime,
        watch_percent: watchPct,
        force_process: force
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Video intake failed");
    }

    statusText.textContent = "Flashcards and study material generated!";
    setTimeout(() => {
      closeCaptureModal();
      submitBtn.disabled = false;
      submitBtn.classList.remove("opacity-50");
      document.getElementById("intake-url").value = "";
      loadVideos();
      openVideoModal(data.video_id);
    }, 800);

  } catch (e) {
    alert("Intake Error: " + e.message);
    submitBtn.disabled = false;
    submitBtn.classList.remove("opacity-50");
    statusBox.classList.add("hidden");
  }
}

// Settings
async function loadSettings() {
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById("setting-provider").value = data.DEFAULT_AI_PROVIDER || "local_offline";
    document.getElementById("setting-obsidian-path").value = data.OBSIDIAN_VAULT_PATH || "";
    document.getElementById("setting-anki-url").value = data.ANKI_CONNECT_URL || "http://localhost:8765";
    document.getElementById("setting-anki-deck").value = data.ANKI_DECK_NAME || "YouTube Micro-Learning";
    document.getElementById("setting-notion-db").value = data.NOTION_DATABASE_ID || "";
    document.getElementById("setting-watch-threshold").value = data.WATCH_THRESHOLD_PERCENT || 50;
    document.getElementById("setting-min-duration").value = data.MIN_DURATION_SECONDS || 180;
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
}

async function saveSettings() {
  const payload = {
    settings: {
      DEFAULT_AI_PROVIDER: document.getElementById("setting-provider").value,
      OBSIDIAN_VAULT_PATH: document.getElementById("setting-obsidian-path").value,
      ANKI_CONNECT_URL: document.getElementById("setting-anki-url").value,
      ANKI_DECK_NAME: document.getElementById("setting-anki-deck").value,
      NOTION_DATABASE_ID: document.getElementById("setting-notion-db").value,
      WATCH_THRESHOLD_PERCENT: document.getElementById("setting-watch-threshold").value,
      MIN_DURATION_SECONDS: document.getElementById("setting-min-duration").value,
    }
  };

  const geminiKey = document.getElementById("setting-gemini-key").value.trim();
  if (geminiKey) payload.settings.GEMINI_API_KEY = geminiKey;

  const groqKey = document.getElementById("setting-groq-key").value.trim();
  if (groqKey) payload.settings.GROQ_API_KEY = groqKey;

  const notionKey = document.getElementById("setting-notion-key").value.trim();
  if (notionKey) payload.settings.NOTION_API_KEY = notionKey;

  try {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      alert("Settings saved successfully!");
    } else {
      alert("Failed to save settings.");
    }
  } catch (e) {
    alert("Error saving settings: " + e.message);
  }
}
