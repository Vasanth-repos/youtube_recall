// YouTube Recall - AI Smart Transcript Application Logic

let allVideos = [];
let currentViewingVideo = null;
let activeCategory = "";
let currentSort = "recently_watched";

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

document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();
  loadStats();
  loadVideos();
  loadSettings();
  loadAccountStatus();
  handleIncomingShareTarget();

  // Register PWA Service Worker for Mobile & Offline Support
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  // Realtime auto-refresh when tab gains focus
  window.addEventListener("focus", () => {
    loadVideos();
    loadStats();
  });

  // Background polling every 15s when active tab is visible
  setInterval(() => {
    if (document.visibilityState === "visible") {
      loadVideos();
      loadStats();
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
let activePracticeVideoId = null;

function switchTab(tab) {
  const tabs = ["library", "reader", "practice", "settings"];
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
  } else if (tab === "practice") {
    startFlashcardSession(activePracticeVideoId);
  }
}

// Fetch & Update System & Spaced Repetition Stats
async function loadStats() {
  try {
    const [vidRes, statRes] = await Promise.all([
      fetch("/api/videos"),
      fetch("/api/flashcards/stats")
    ]);

    if (vidRes.ok) {
      const vids = await vidRes.json();
      const el = document.getElementById("stat-videos");
      if (el) el.textContent = vids.length;
    }

    if (statRes.ok) {
      const stats = await statRes.json();
      const dueCount = stats.cards_due_today || 0;
      const masteredCount = stats.cards_mastered || 0;
      const reviewsCount = stats.total_reviews || 0;

      // Update overview strip
      const dueEl = document.getElementById("stat-cards-due");
      if (dueEl) dueEl.textContent = dueCount;
      const mastEl = document.getElementById("stat-cards-mastered");
      if (mastEl) mastEl.textContent = masteredCount;
      const revEl = document.getElementById("stat-total-reviews");
      if (revEl) revEl.textContent = reviewsCount;

      // Update practice header metrics
      const mDue = document.getElementById("metric-due-count");
      if (mDue) mDue.textContent = dueCount;
      const mMast = document.getElementById("metric-mastered-count");
      if (mMast) mMast.textContent = masteredCount;
      const mRev = document.getElementById("metric-reviews-count");
      if (mRev) mRev.textContent = reviewsCount;

      // Update navigation badges
      const navBadge = document.getElementById("nav-due-badge");
      const mobBadge = document.getElementById("mob-due-badge");

      if (dueCount > 0) {
        if (navBadge) {
          navBadge.textContent = dueCount;
          navBadge.classList.remove("hidden");
        }
        if (mobBadge) {
          mobBadge.textContent = dueCount;
          mobBadge.classList.remove("hidden");
        }
      } else {
        if (navBadge) navBadge.classList.add("hidden");
        if (mobBadge) mobBadge.classList.add("hidden");
      }
    }
  } catch (e) {
    console.error("Failed to load stats:", e);
  }
}

// Load Videos
async function loadVideos() {
  try {
    const res = await fetch(`/api/videos?sort_by=${encodeURIComponent(currentSort)}`);
    if (!res.ok) return;
    allVideos = await res.json();
    renderVideosGrid();
    loadStats();

    // Check if query parameter has ?v= or ?video_id=
    const params = new URLSearchParams(window.location.search);
    const targetV = params.get("v") || params.get("video_id");
    if (targetV) {
      const match = allVideos.find(v => v.video_id === targetV || String(v.id) === targetV);
      if (match) {
        openReaderForVideo(match.video_id);
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

  // Client-side sort fallback / consistency
  filtered.sort((a, b) => {
    if (currentSort === "recently_watched") {
      const timeA = new Date(a.last_watched_at || a.updated_at || a.created_at).getTime();
      const timeB = new Date(b.last_watched_at || b.updated_at || b.created_at).getTime();
      return timeB - timeA;
    } else if (currentSort === "newest") {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    } else if (currentSort === "duration") {
      return (b.duration_seconds || 0) - (a.duration_seconds || 0);
    } else if (currentSort === "title") {
      return (a.title || "").localeCompare(b.title || "");
    }
    return 0;
  });

  if (filtered.length === 0) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  grid.innerHTML = filtered.map(v => {
    const durationMin = Math.floor(v.duration_seconds / 60);
    const sections = v.smart_transcript || v.topic_notes || [];
    const bulletsCount = v.summary_bullets ? v.summary_bullets.length : 0;
    const watchedTime = formatRelativeTime(v.last_watched_at || v.created_at);

    return `
      <div class="bg-obsidian-900/90 border border-obsidian-750/80 rounded-xl overflow-hidden hover:border-obsidian-600 transition-all flex flex-col justify-between group shadow-sm">
        <div>
          <!-- Thumbnail & duration pill -->
          <div class="relative aspect-video bg-obsidian-950 overflow-hidden cursor-pointer" onclick="openReaderForVideo('${v.video_id}')">
            <img src="${v.thumbnail_url || 'https://img.youtube.com/vi/' + v.video_id + '/mqdefault.jpg'}" alt="${v.title}" class="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300">
            <span class="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/80 text-zinc-300 font-medium">
              ${durationMin}m
            </span>
            <span class="absolute top-2 left-2 px-2 py-0.5 rounded text-[9px] font-mono tracking-wider uppercase bg-obsidian-950/85 text-amber-400/90 border border-amber-500/20 backdrop-blur">
              ${v.category}
            </span>
          </div>

          <!-- Video Details -->
          <div class="p-4">
            <h3 onclick="openReaderForVideo('${v.video_id}')" class="font-serif font-medium text-zinc-100 text-sm sm:text-base line-clamp-2 hover:text-amber-400 cursor-pointer transition-colors mb-1.5 leading-snug">
              ${v.title}
            </h3>
            <div class="flex items-center gap-2 text-xs text-zinc-400 mb-2">
              <span class="text-zinc-300 font-medium truncate max-w-[140px]">${v.channel_title}</span>
              <span class="text-zinc-600">•</span>
              <span class="text-zinc-400 font-mono text-[11px] flex items-center gap-1.5" title="Watched: ${v.last_watched_at || v.created_at}">
                <i data-lucide="clock" class="w-3 h-3 text-amber-500/80"></i>
                ${watchedTime}
              </span>
            </div>
          </div>
        </div>

        <!-- Card Footer -->
        <div class="p-3.5 pt-0 border-t border-obsidian-800/80 mt-2 flex items-center justify-between text-xs text-zinc-400">
          <span class="text-[11px] text-zinc-500 font-mono">${sections.length} chapters</span>
          <div class="flex items-center gap-1.5">
            <button onclick="openReaderForVideo('${v.video_id}')" title="Read Transcript" class="px-2.5 py-1 rounded-md bg-obsidian-800 hover:bg-obsidian-750 text-amber-400 text-xs font-medium flex items-center gap-1.5 transition-colors border border-obsidian-700">
              <i data-lucide="book-open" class="w-3.5 h-3.5"></i>
              <span>Read</span>
            </button>
            <button onclick="deleteVideoById(${v.id})" title="Delete" class="p-1 rounded-md hover:bg-obsidian-800 text-zinc-500 hover:text-rose-400 transition-colors">
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
  const vid = allVideos.find(v => v.video_id === videoId || v.id == videoId);
  if (!vid) return;
  currentViewingVideo = vid;
  const dot = document.getElementById("active-video-dot");
  if (dot) dot.classList.remove("hidden");
  const mobDot = document.getElementById("mob-active-video-dot");
  if (mobDot) mobDot.classList.remove("hidden");
  switchTab("reader");
  renderReaderView(vid);
}

// Render Smart Reader View
function renderReaderView(video) {
  if (!video) {
    document.getElementById("reader-empty").classList.remove("hidden");
    return;
  }
  document.getElementById("reader-empty").classList.add("hidden");

  // Title & Metadata
  document.getElementById("reader-title").textContent = video.title;
  document.getElementById("reader-category").textContent = video.category || "General";
  document.getElementById("reader-channel").textContent = video.channel_title || "Unknown Channel";
  document.getElementById("reader-duration").textContent = `${Math.floor(video.duration_seconds / 60)}m ${video.duration_seconds % 60}s`;
  document.getElementById("reader-yt-link").href = `https://www.youtube.com/watch?v=${video.video_id}`;

  // Executive Takeaways
  const bulletsEl = document.getElementById("reader-bullets");
  bulletsEl.innerHTML = (video.summary_bullets || []).map(b => `
    <li class="flex items-start gap-3">
      <span class="text-amber-400 font-serif font-bold text-base leading-none mt-0.5 select-none">—</span>
      <span class="font-normal text-zinc-200 leading-relaxed text-sm sm:text-base">${b}</span>
    </li>
  `).join("");

  // Concepts
  const conceptsContainer = document.getElementById("reader-concepts-container");
  const conceptsEl = document.getElementById("reader-concepts");
  if (video.key_concepts && video.key_concepts.length > 0) {
    conceptsContainer.classList.remove("hidden");
    conceptsEl.innerHTML = video.key_concepts.map(c => `
      <div class="bg-obsidian-850 border border-obsidian-750 px-3 py-2 rounded-lg text-xs font-mono text-zinc-300">
        <span>${c}</span>
      </div>
    `).join("");
  } else {
    conceptsContainer.classList.add("hidden");
  }

  // Section-by-Section Smart Transcript
  const sections = video.smart_transcript || video.topic_notes || [];
  document.getElementById("section-count-badge").textContent = `${sections.length} chapters`;
  renderTranscriptSections(sections, video.video_id);

  // Synthesis
  document.getElementById("reader-synthesis").textContent = video.final_summary || "Synthesis not available.";

  if (window.lucide) lucide.createIcons();
}

function renderTranscriptSections(sections, videoId) {
  const container = document.getElementById("smart-transcript-sections");
  
  if (!sections || sections.length === 0) {
    container.innerHTML = `
      <div class="bg-obsidian-900 border border-obsidian-800 rounded-xl p-6 text-center text-zinc-400 text-xs font-mono">
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
      <div class="transcript-section-card bg-obsidian-900/80 border border-obsidian-800 rounded-xl p-5 shadow-sm space-y-3.5 transition-colors hover:border-obsidian-700" data-text="${(title + ' ' + crispPoints.join(' ') + ' ' + polishedText).toLowerCase()}">
        
        <!-- Header: Timestamp + Title -->
        <div class="flex items-center gap-3 pb-2.5 border-b border-obsidian-800/80">
          <a href="${jumpUrl}" target="_blank" title="Jump to ${tsLabel} on YouTube" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-mono text-xs font-medium border border-amber-500/20 transition-colors">
            <i data-lucide="play" class="w-3 h-3 fill-amber-400"></i>
            <span>${tsLabel}</span>
          </a>
          <h3 class="font-serif font-medium text-zinc-100 text-base sm:text-lg tracking-tight">${title}</h3>
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
          <p class="text-sm text-zinc-400 font-serif leading-relaxed pt-3 border-t border-obsidian-800/60">
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
  const query = document.getElementById("transcript-filter").value.toLowerCase().trim();
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

// Copy Actions
function copyCrispPoints() {
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

  navigator.clipboard.writeText(out).then(() => {
    const btnText = document.getElementById("copy-points-text");
    if (btnText) {
      btnText.textContent = "✓ Copied!";
      setTimeout(() => btnText.textContent = "Copy Notes", 2000);
    }
  });
}

function copyFullTranscript() {
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

  navigator.clipboard.writeText(out).then(() => {
    const btnText = document.getElementById("copy-transcript-text");
    if (btnText) {
      btnText.textContent = "✓ Copied to Clipboard!";
      setTimeout(() => btnText.textContent = "Copy Full Transcript", 2000);
    }
  });
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

  try {
    const res = await fetch(`/api/videos/${currentViewingVideo.id}/redistill`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to re-distill transcript");
    const data = await res.json();
    currentViewingVideo = data;
    renderReaderView(data);
    loadStats();
    if (btnText) {
      btnText.textContent = "✓ Refined!";
      setTimeout(() => btnText.textContent = original, 2500);
    }
  } catch (e) {
    alert("Re-distillation notice: " + e.message);
    if (btnText) btnText.textContent = original;
  }
}

function downloadMarkdownById(videoId) {
  window.location.href = `/api/export/obsidian/${videoId}/download`;
}

async function deleteVideoById(videoId) {
  if (!confirm("Are you sure you want to delete this transcript?")) return;
  try {
    const res = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
    if (res.ok) {
      if (currentViewingVideo && currentViewingVideo.id === videoId) {
        currentViewingVideo = null;
      }
      loadVideos();
    }
  } catch (e) {
    alert("Delete failed: " + e.message);
  }
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
    alert("Please enter a YouTube video URL or ID.");
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
  if (statusText) statusText.textContent = "Transcribing & filtering conversational noise...";

  try {
    const res = await fetch("/api/videos/intake", {
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
    if (!res.ok) {
      throw new Error(data.detail || "Video transcription failed");
    }

    if (statusText) statusText.textContent = "Smart transcript distilled successfully!";
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

  } catch (e) {
    alert("Transcription Error: " + e.message);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove("opacity-50");
    }
    if (statusBox) statusBox.classList.add("hidden");
  }
}

// Settings
async function loadSettings() {
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) return;
    const data = await res.json();

    const prov = document.getElementById("setting-provider");
    if (prov) prov.value = data.DEFAULT_AI_PROVIDER || "local_offline";
    const obs = document.getElementById("setting-obsidian-path");
    if (obs) obs.value = data.OBSIDIAN_VAULT_PATH || "";
    const notEl = document.getElementById("setting-notion-db");
    if (notEl) notEl.value = data.NOTION_DATABASE_ID || "";
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
}

async function saveSettings() {
  const provEl = document.getElementById("setting-provider");
  const obsEl = document.getElementById("setting-obsidian-path");
  const notEl = document.getElementById("setting-notion-db");

  const payload = {
    settings: {
      DEFAULT_AI_PROVIDER: provEl ? provEl.value : "gemini",
      OBSIDIAN_VAULT_PATH: obsEl ? obsEl.value : "",
      NOTION_DATABASE_ID: notEl ? notEl.value : ""
    }
  };

  const geminiEl = document.getElementById("setting-gemini-key");
  if (geminiEl && geminiEl.value.trim()) payload.settings.GEMINI_API_KEY = geminiEl.value.trim();

  const groqEl = document.getElementById("setting-groq-key");
  if (groqEl && groqEl.value.trim()) payload.settings.GROQ_API_KEY = groqEl.value.trim();

  const notionEl = document.getElementById("setting-notion-key");
  if (notionEl && notionEl.value.trim()) payload.settings.NOTION_API_KEY = notionEl.value.trim();

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

async function testGeminiKey() {
  const geminiEl = document.getElementById("setting-gemini-key");
  const resultEl = document.getElementById("gemini-test-result");
  const testBtn = document.getElementById("btn-test-gemini");
  const key = geminiEl ? geminiEl.value.trim() : "";

  if (resultEl) {
    resultEl.classList.remove("hidden", "text-emerald-400", "text-rose-400");
    resultEl.classList.add("text-amber-400");
    resultEl.innerHTML = "<span>⏳ Testing key against Google Gemini Cloud...</span>";
  }
  if (testBtn) testBtn.disabled = true;

  try {
    const res = await fetch("/api/settings/test-gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key })
    });
    const data = await res.json();
    if (data.valid) {
      if (resultEl) {
        resultEl.className = "text-[11px] mt-1.5 text-emerald-400 font-medium";
        resultEl.innerHTML = `✓ Connected to <b>${data.active_model}</b>! Ready for high-speed online synthesis.`;
      }
    } else {
      if (resultEl) {
        resultEl.className = "text-[11px] mt-1.5 text-rose-400";
        resultEl.innerHTML = `⚠️ ${data.error || "Failed to validate Gemini key."}`;
      }
    }
  } catch (err) {
    if (resultEl) {
      resultEl.className = "text-[11px] mt-1.5 text-rose-400";
      resultEl.innerHTML = `⚠️ Network error: ${err.message}`;
    }
  } finally {
    if (testBtn) testBtn.disabled = false;
  }
}

function copyCurrentOrigin() {
  const origin = window.location.origin;
  navigator.clipboard.writeText(origin).then(() => {
    const toast = document.getElementById("copy-url-toast");
    if (toast) {
      toast.classList.remove("hidden");
      setTimeout(() => toast.classList.add("hidden"), 3000);
    }
  }).catch(() => {
    prompt("Copy this URL for your Android app:", origin);
  });
}

// YouTube Account Status & Sync
async function loadAccountStatus() {
  try {
    const res = await fetch("/api/youtube/status");
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
      if (settingsEmail) settingsEmail.textContent = data.account_email || "vasanthabalanb4@gmail.com";
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

  try {
    let url = "/api/flashcards/due";
    if (filterVideoId) {
      url = `/api/flashcards/all?limit=100`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error("Could not load flashcards");
    let cards = await res.json();

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
  } catch (e) {
    console.error("Failed to load flashcard practice session:", e);
  }
}

async function loadAllCardsSession() {
  const statusChip = document.getElementById("practice-status-chip");
  if (statusChip) statusChip.textContent = "All Cards Review";
  
  try {
    const res = await fetch("/api/flashcards/all?limit=100");
    if (!res.ok) return;
    const cards = await res.json();
    activeFlashcards = cards;
    currentCardIndex = 0;

    const container = document.getElementById("flashcard-study-container");
    const empty = document.getElementById("flashcard-empty-state");

    if (cards.length > 0) {
      if (container) container.classList.remove("hidden");
      if (empty) empty.classList.add("hidden");
      renderCurrentCard();
    }
  } catch (e) {
    console.error("Failed to load all cards:", e);
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
    intervalEl.textContent = `Interval: ${card.interval_days || 0}d (Reps: ${card.repetition_count || 0})`;
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

  try {
    await fetch(`/api/flashcards/${card.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating: rating,
        time_taken_ms: timeTaken
      })
    });

    currentCardIndex += 1;
    renderCurrentCard();
    loadStats();
  } catch (e) {
    console.error("Failed to submit card review:", e);
    currentCardIndex += 1;
    renderCurrentCard();
  }
}

function practiceCardsForCurrentVideo() {
  if (!currentViewingVideo) return;
  activePracticeVideoId = currentViewingVideo.id;
  switchTab("practice");
}

function downloadReaderAnki() {
  if (!currentViewingVideo) return;
  window.location.href = `/api/export/anki/${currentViewingVideo.id}/download`;
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
