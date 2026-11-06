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

// Navigation Tabs
function switchTab(tab) {
  const tabs = ["library", "reader", "settings"];
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

  if (tab === "reader" && currentViewingVideo) {
    renderReaderView(currentViewingVideo);
  } else if (tab === "library") {
    loadVideos();
  }
}

// Fetch & Update Stats
async function loadStats() {
  try {
    const res = await fetch("/api/videos");
    if (!res.ok) return;
    const vids = await res.json();
    
    const el = document.getElementById("stat-videos");
    if (el) el.textContent = vids.length;
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
      <div class="bg-dark-900 border border-dark-700/70 rounded-xl overflow-hidden shadow-sm hover:border-slate-700 transition-all flex flex-col justify-between group">
        <div>
          <!-- Thumbnail & duration pill -->
          <div class="relative aspect-video bg-dark-950 overflow-hidden cursor-pointer" onclick="openReaderForVideo('${v.video_id}')">
            <img src="${v.thumbnail_url || 'https://img.youtube.com/vi/' + v.video_id + '/mqdefault.jpg'}" alt="${v.title}" class="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300">
            <span class="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/85 text-white font-semibold">
              ${durationMin}m
            </span>
            <span class="absolute top-2 left-2 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wider uppercase bg-black/75 text-brand-400 border border-brand-500/30 backdrop-blur">
              ${v.category}
            </span>
          </div>

          <!-- Video Details -->
          <div class="p-4">
            <h3 onclick="openReaderForVideo('${v.video_id}')" class="font-semibold text-white text-sm line-clamp-2 hover:text-brand-400 cursor-pointer transition-colors mb-1.5 leading-snug">
              ${v.title}
            </h3>
            <div class="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
              <span class="text-slate-300 font-medium truncate max-w-[140px]">${v.channel_title}</span>
              <span class="text-slate-600">•</span>
              <span class="text-emerald-400/90 font-mono text-[10px] flex items-center gap-1" title="Watched: ${v.last_watched_at || v.created_at}">
                <i data-lucide="clock" class="w-3 h-3 text-emerald-400"></i>
                ${watchedTime}
              </span>
            </div>
          </div>
        </div>

        <!-- Card Footer -->
        <div class="p-3.5 pt-0 border-t border-dark-800/80 mt-2 flex items-center justify-between text-xs text-slate-400">
          <span class="text-[11px] text-slate-500 font-mono">${sections.length} chapters</span>
          <div class="flex items-center gap-1.5">
            <button onclick="openReaderForVideo('${v.video_id}')" title="Read Transcript" class="px-2.5 py-1 rounded-md bg-dark-800 hover:bg-dark-750 text-brand-400 text-xs font-medium flex items-center gap-1 transition-colors border border-dark-700">
              <i data-lucide="book-open" class="w-3.5 h-3.5"></i>
              <span>Read</span>
            </button>
            <button onclick="deleteVideoById(${v.id})" title="Delete" class="p-1 rounded-md hover:bg-dark-800 text-slate-500 hover:text-rose-400 transition-colors">
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
  document.getElementById("active-video-dot").classList.remove("hidden");
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

  // 3-Bullet Takeaways
  const bulletsEl = document.getElementById("reader-bullets");
  bulletsEl.innerHTML = (video.summary_bullets || []).map(b => `
    <li class="flex items-start gap-2.5">
      <i data-lucide="check" class="w-4 h-4 text-brand-400 shrink-0 mt-0.5"></i>
      <span class="font-medium text-slate-100">${b}</span>
    </li>
  `).join("");

  // Concepts
  const conceptsContainer = document.getElementById("reader-concepts-container");
  const conceptsEl = document.getElementById("reader-concepts");
  if (video.key_concepts && video.key_concepts.length > 0) {
    conceptsContainer.classList.remove("hidden");
    conceptsEl.innerHTML = video.key_concepts.map(c => `
      <div class="bg-dark-900 border border-dark-700/80 p-3 rounded-xl text-xs">
        <span class="text-slate-200 font-medium">${c}</span>
      </div>
    `).join("");
  } else {
    conceptsContainer.classList.add("hidden");
  }

  // Section-by-Section Smart Transcript
  const sections = video.smart_transcript || video.topic_notes || [];
  document.getElementById("section-count-badge").textContent = `${sections.length} sections`;
  renderTranscriptSections(sections, video.video_id);

  // Synthesis
  document.getElementById("reader-synthesis").textContent = video.final_summary || "Synthesis not available.";

  if (window.lucide) lucide.createIcons();
}

function renderTranscriptSections(sections, videoId) {
  const container = document.getElementById("smart-transcript-sections");
  
  if (!sections || sections.length === 0) {
    container.innerHTML = `
      <div class="bg-dark-900 border border-dark-700/60 rounded-xl p-6 text-center text-slate-400 text-xs">
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
      <div class="transcript-section-card bg-dark-900 border border-dark-700/60 rounded-xl p-5 shadow-sm space-y-3 transition-colors hover:border-slate-700" data-text="${(title + ' ' + crispPoints.join(' ') + ' ' + polishedText).toLowerCase()}">
        
        <!-- Header: Timestamp + Title -->
        <div class="flex items-center gap-2.5 pb-2 border-b border-dark-800">
          <a href="${jumpUrl}" target="_blank" title="Jump to ${tsLabel} on YouTube" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-mono text-xs font-semibold border border-emerald-500/20 transition-colors">
            <i data-lucide="play" class="w-3 h-3 fill-emerald-400"></i>
            <span>${tsLabel}</span>
          </a>
          <h3 class="font-semibold text-white text-sm tracking-tight">${title}</h3>
        </div>

        <!-- Crisp Bullet Points -->
        ${crispPoints.length > 0 ? `
          <ul class="space-y-1.5 pl-0.5">
            ${crispPoints.map(pt => `
              <li class="flex items-start gap-2 text-xs sm:text-sm text-slate-100 leading-snug">
                <span class="text-brand-400 font-bold select-none">•</span>
                <span>${pt}</span>
              </li>
            `).join("")}
          </ul>
        ` : ''}

        <!-- Polished Reading Paragraph -->
        ${polishedText ? `
          <p class="text-xs text-slate-400 leading-relaxed pt-2.5 border-t border-dark-800/80">
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
