// YouTube Recall - AI Smart Transcript Application Logic

let allVideos = [];
let currentViewingVideo = null;
let activeCategory = "";

document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();
  loadStats();
  loadVideos();
  loadSettings();
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
    
    let totalSections = 0;
    let totalPoints = 0;

    vids.forEach(v => {
      const sections = v.smart_transcript || v.topic_notes || [];
      totalSections += sections.length;
      sections.forEach(s => {
        const pts = s.crisp_points || s.takeaways || [];
        totalPoints += pts.length;
      });
      totalPoints += (v.summary_bullets || []).length;
    });

    document.getElementById("stat-videos").textContent = vids.length;
    document.getElementById("stat-sections").textContent = totalSections;
    document.getElementById("stat-points").textContent = totalPoints;
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

    // Auto-select first video into Reader if none selected
    if (!currentViewingVideo && allVideos.length > 0) {
      currentViewingVideo = allVideos[0];
      document.getElementById("active-video-dot").classList.remove("hidden");
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

    return `
      <div class="bg-dark-800 border border-dark-700/80 rounded-xl overflow-hidden shadow-lg hover:border-slate-500 transition-all flex flex-col justify-between group">
        <div>
          <!-- Thumbnail & duration pill -->
          <div class="relative aspect-video bg-dark-900 overflow-hidden cursor-pointer" onclick="openReaderForVideo('${v.video_id}')">
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
            <h3 onclick="openReaderForVideo('${v.video_id}')" class="font-semibold text-white text-sm line-clamp-2 hover:text-brand-400 cursor-pointer transition-colors mb-1">
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
            <i data-lucide="align-left" class="w-3.5 h-3.5"></i>
            <span>${sections.length} crisp sections</span>
          </div>
          <div class="flex items-center gap-1">
            <button onclick="openReaderForVideo('${v.video_id}')" title="Read Smart Transcript" class="px-2.5 py-1 rounded-lg bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 text-xs font-semibold flex items-center gap-1 transition-colors">
              <i data-lucide="book-open" class="w-3.5 h-3.5"></i>
              <span>Read</span>
            </button>
            <button onclick="downloadMarkdownById(${v.id})" title="Download Markdown" class="p-1.5 rounded-lg hover:bg-dark-700 hover:text-purple-400 transition-colors">
              <i data-lucide="download" class="w-4 h-4"></i>
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
  document.getElementById("reader-category").textContent = video.category;
  document.getElementById("reader-channel").textContent = `Channel: ${video.channel_title}`;
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
      <div class="bg-dark-800 border border-dark-700 rounded-xl p-6 text-center text-slate-400 text-sm">
        No structured sections available for this video.
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
      <div class="transcript-section-card bg-dark-800 border border-dark-700/90 rounded-2xl p-6 shadow-md transition-all hover:border-slate-500" data-text="${(title + ' ' + crispPoints.join(' ') + ' ' + polishedText).toLowerCase()}">
        
        <!-- Section Header with Clickable Timestamp -->
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-dark-700/60">
          <div class="flex items-center gap-3">
            <a href="${jumpUrl}" target="_blank" title="Jump to this exact moment in YouTube video" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold transition-all hover:scale-105">
              <i data-lucide="play" class="w-3 h-3 fill-emerald-400"></i>
              <span>${tsLabel}</span>
            </a>
            <h3 class="font-bold text-white text-base tracking-tight">${title}</h3>
          </div>
          <span class="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Section ${idx + 1}</span>
        </div>

        <!-- Crisp Bullet Points (Core Value) -->
        ${crispPoints.length > 0 ? `
          <div class="bg-dark-900/80 border border-dark-700/80 rounded-xl p-4 mb-4">
            <div class="text-[11px] font-bold uppercase tracking-wider text-brand-400 mb-2 flex items-center gap-1.5">
              <i data-lucide="zap" class="w-3.5 h-3.5"></i>
              <span>Crisp Takeaways</span>
            </div>
            <ul class="space-y-1.5">
              ${crispPoints.map(pt => `
                <li class="flex items-start gap-2 text-xs sm:text-sm text-slate-100">
                  <span class="text-brand-400 font-bold">•</span>
                  <span>${pt}</span>
                </li>
              `).join("")}
            </ul>
          </div>
        ` : ''}

        <!-- Polished Cleaned-Up Transcript Text -->
        ${polishedText ? `
          <details class="group cursor-pointer">
            <summary class="text-xs font-semibold text-slate-400 hover:text-slate-200 flex items-center justify-between select-none py-1">
              <span class="flex items-center gap-1.5">
                <i data-lucide="file-text" class="w-3.5 h-3.5 text-cyan-400"></i>
                <span>Cleaned Spoken Transcript (Verbal fluff removed)</span>
              </span>
              <span class="text-[10px] text-slate-500 group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div class="mt-2.5 pt-2.5 border-t border-dark-700/60 text-xs text-slate-300 leading-relaxed font-sans bg-dark-900/50 p-3 rounded-lg">
              ${polishedText}
            </div>
          </details>
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
    btnText.textContent = "✓ Copied to Clipboard!";
    setTimeout(() => btnText.textContent = "Copy Crisp Takeaways", 2000);
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
    btnText.textContent = "✓ Copied to Clipboard!";
    setTimeout(() => btnText.textContent = "Copy Full Transcript", 2000);
  });
}

function downloadReaderMarkdown() {
  if (!currentViewingVideo) return;
  downloadMarkdownById(currentViewingVideo.id);
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
  document.getElementById("capture-modal").classList.remove("hidden");
  document.getElementById("intake-status").classList.add("hidden");
  document.getElementById("intake-url").focus();
}

function closeCaptureModal() {
  document.getElementById("capture-modal").classList.add("hidden");
}

async function submitVideoIntake() {
  const url = document.getElementById("intake-url").value.trim();
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
  statusText.textContent = "Transcribing & filtering conversational noise...";

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

    statusText.textContent = "Smart transcript distilled successfully!";
    setTimeout(() => {
      closeCaptureModal();
      submitBtn.disabled = false;
      submitBtn.classList.remove("opacity-50");
      document.getElementById("intake-url").value = "";
      loadVideos().then(() => {
        openReaderForVideo(data.video_id);
      });
    }, 600);

  } catch (e) {
    alert("Transcription Error: " + e.message);
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
    document.getElementById("setting-notion-db").value = data.NOTION_DATABASE_ID || "";
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
}

async function saveSettings() {
  const payload = {
    settings: {
      DEFAULT_AI_PROVIDER: document.getElementById("setting-provider").value,
      OBSIDIAN_VAULT_PATH: document.getElementById("setting-obsidian-path").value,
      NOTION_DATABASE_ID: document.getElementById("setting-notion-db").value,
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
