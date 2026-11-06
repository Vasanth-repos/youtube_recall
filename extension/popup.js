// Popup Controller for YouTube Recall
document.addEventListener("DOMContentLoaded", async () => {
  const SERVER_URL = "http://localhost:8000";
  const serverStatus = document.getElementById("server-status");
  const activeView = document.getElementById("active-video-view");
  const inactiveView = document.getElementById("inactive-view");
  const ytTitle = document.getElementById("yt-title");
  const autoStatusText = document.getElementById("auto-status-text");
  const mainBtn = document.getElementById("main-btn");
  const syncBtn = document.getElementById("sync-history-btn");
  const syncStatus = document.getElementById("sync-status");
  const accountNameEl = document.getElementById("account-name");
  const accountEmailEl = document.getElementById("account-email");
  const accountAvatarImg = document.getElementById("account-avatar");
  const accountAvatarPl = document.getElementById("account-avatar-placeholder");
  const accountStatusLabel = document.getElementById("account-status-label");

  // 1. Check server health & linked account status across candidate URLs
  let isServerOnline = false;
  let activeServerUrl = "http://localhost:8000";

  for (const candidate of ["http://localhost:8000", "http://127.0.0.1:8000"]) {
    try {
      const res = await fetch(`${candidate}/api/health`, { method: "GET" });
      if (res.ok) {
        serverStatus.textContent = "Server Online";
        serverStatus.className = "status-pill";
        isServerOnline = true;
        activeServerUrl = candidate;
        const dashLink = document.getElementById("open-dashboard-link");
        if (dashLink) dashLink.href = candidate;
        break;
      }
    } catch (e) {}
  }

  if (!isServerOnline) {
    chrome.runtime.sendMessage({ action: "check_health" }, (resp) => {
      const err = chrome.runtime.lastError; // Consume
      if (resp && resp.online) {
        serverStatus.textContent = "Server Online";
        serverStatus.className = "status-pill";
        isServerOnline = true;
      } else {
        serverStatus.textContent = "Server Offline";
        serverStatus.className = "status-pill offline";
      }
    });
  }

  // Load account info from storage or server
  chrome.storage.local.get(["yt_account_info", "last_sync_stats"], (res) => {
    if (chrome.runtime.lastError) {} // Consume
    const acc = res && res.yt_account_info;
    if (acc) {
      if (acc.account_name && accountNameEl) accountNameEl.textContent = acc.account_name;
      if (acc.account_email && accountEmailEl) accountEmailEl.textContent = acc.account_email;
      if (acc.avatar_url && accountAvatarImg) {
        accountAvatarImg.src = acc.avatar_url;
        accountAvatarImg.style.display = "block";
        if (accountAvatarPl) accountAvatarPl.style.display = "none";
      }
      if (accountStatusLabel) accountStatusLabel.textContent = "Account Linked & Auto-Syncing";
    }

    if (res && res.last_sync_stats) {
      const stats = res.last_sync_stats;
      syncStatus.style.display = "block";
      syncStatus.textContent = `Last sync: ${stats.newly_synced || 0} new, ${stats.already_synced || 0} existing videos.`;
    }
  });

  if (isServerOnline) {
    fetch(`${activeServerUrl}/api/youtube/status`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.is_linked) {
          if (data.account_name && accountNameEl) accountNameEl.textContent = data.account_name;
          if (data.account_email && accountEmailEl) accountEmailEl.textContent = data.account_email;
          if (data.avatar_url && accountAvatarImg) {
            accountAvatarImg.src = data.avatar_url;
            accountAvatarImg.style.display = "block";
            if (accountAvatarPl) accountAvatarPl.style.display = "none";
          }
        }
      })
      .catch(() => {});
  }

  // 2. Sync YouTube Watch History Button Click
  if (syncBtn) {
    syncBtn.addEventListener("click", () => {
      syncBtn.disabled = true;
      syncBtn.innerHTML = "<span>⏳ Syncing Watch History...</span>";
      syncStatus.style.display = "block";
      syncStatus.textContent = "Fetching videos from your YouTube watch history...";

      chrome.runtime.sendMessage({ action: "manual_history_sync", maxCount: 30 }, (res) => {
        const err = chrome.runtime.lastError;
        syncBtn.disabled = false;
        syncBtn.innerHTML = "<span>⚡ Sync YouTube Watch History</span>";

        if (res && res.success) {
          syncStatus.innerHTML = `<span style="color: #4ade80; font-weight: 600;">✓ Synced ${res.newly_synced || 0} new video(s)!</span> (${res.already_synced || 0} already in library)`;
        } else {
          const msg = (res && (res.message || res.error)) || (err && err.message) || "Backend reconnecting";
          syncStatus.innerHTML = `<span style="color: #f87171;">⚠️ Sync notice: ${msg}</span>`;
        }
      });
    });
  }

  // 3. Query active YouTube tab
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (chrome.runtime.lastError) {}
    const activeTab = tabs && tabs[0];
    if (!activeTab || !activeTab.url || !activeTab.url.includes("youtube.com/watch")) {
      if (activeView) activeView.style.display = "none";
      if (inactiveView) inactiveView.style.display = "block";
      return;
    }

    if (activeView) activeView.style.display = "block";
    if (inactiveView) inactiveView.style.display = "none";

    let videoId = null;
    try {
      const urlParams = new URL(activeTab.url).searchParams;
      videoId = urlParams.get("v");
    } catch (e) {}

    if (!videoId) {
      if (activeView) activeView.style.display = "none";
      if (inactiveView) inactiveView.style.display = "block";
      return;
    }

    // Set fallback title from tab
    if (ytTitle) {
      ytTitle.textContent = (activeTab.title || "YouTube Video").replace(" - YouTube", "");
    }

    // Check directly if already in backend DB
    let isAlreadyInDb = false;
    if (isServerOnline) {
      try {
        const checkRes = await fetch(`${activeServerUrl}/api/videos/${videoId}`);
        if (checkRes.ok) {
          isAlreadyInDb = true;
          const vidData = await checkRes.json();
          if (vidData && vidData.title && ytTitle) {
            ytTitle.textContent = vidData.title;
          }
        }
      } catch (e) {}
    }

    // Query status from content script safely
    chrome.tabs.sendMessage(activeTab.id, { action: "get_status" }, (status) => {
      const lastErr = chrome.runtime.lastError; // Consumed
      const isProcessed = isAlreadyInDb || (status && status.isProcessed);
      const isTranscribing = status && status.isTranscribing;

      if (status && status.title && ytTitle) {
        ytTitle.textContent = status.title;
      }

      if (isProcessed) {
        if (autoStatusText) autoStatusText.textContent = "✓ AI Smart Transcript Ready!";
        if (mainBtn) {
          mainBtn.innerHTML = "<span>📖 Open in Smart Reader</span>";
          mainBtn.disabled = false;
          mainBtn.onclick = () => {
            chrome.tabs.create({ url: `${activeServerUrl}/?v=${videoId}` });
          };
        }
      } else if (isTranscribing) {
        if (autoStatusText) autoStatusText.textContent = "⏳ Distilling clean transcript...";
        if (mainBtn) {
          mainBtn.innerHTML = "<span>⏳ AI Processing Now...</span>";
          mainBtn.disabled = true;
        }
      } else {
        const seconds = status ? (status.activeWatchSeconds || 0) : 0;
        if (autoStatusText) autoStatusText.textContent = `Auto-capturing playback (${seconds}/8s)`;
        if (mainBtn) {
          mainBtn.innerHTML = "<span>⚡ Transcribe Now</span>";
          mainBtn.disabled = !isServerOnline;
          
          mainBtn.onclick = async () => {
            mainBtn.disabled = true;
            mainBtn.innerHTML = "<span>⏳ Synthesizing...</span>";
            if (autoStatusText) autoStatusText.textContent = "Transcribing in background...";

            chrome.tabs.sendMessage(activeTab.id, { action: "manual_trigger" }, (res) => {
              const tabErr = chrome.runtime.lastError; // Consumed
              if (tabErr || !res) {
                // Background service worker fallback API call
                chrome.runtime.sendMessage({
                  action: "intake_video",
                  payload: {
                    video_url_or_id: videoId,
                    watch_time_seconds: 60,
                    watch_percent: 100,
                    force_process: true,
                    watched_at: new Date().toISOString()
                  }
                }, (apiRes) => {
                  const portErr = chrome.runtime.lastError; // Consumed
                  if (apiRes && apiRes.success) {
                    mainBtn.disabled = false;
                    mainBtn.innerHTML = "<span>📖 Open in Smart Reader</span>";
                    if (autoStatusText) autoStatusText.textContent = "✓ AI Smart Transcript Ready!";
                    mainBtn.onclick = () => chrome.tabs.create({ url: `${activeServerUrl}/?v=${videoId}` });
                  } else {
                    const intakeMsg = apiRes && apiRes.error ? apiRes.error : "Could not transcribe";
                    alert("Intake Notice: " + intakeMsg);
                    mainBtn.disabled = false;
                    mainBtn.innerHTML = "<span>⚡ Transcribe Now</span>";
                  }
                });
              } else {
                mainBtn.disabled = false;
                mainBtn.innerHTML = "<span>📖 Open in Smart Reader</span>";
                if (autoStatusText) autoStatusText.textContent = "✓ AI Smart Transcript Ready!";
                mainBtn.onclick = () => chrome.tabs.create({ url: `${activeServerUrl}/?v=${videoId}` });
              }
            });
          };
        }
      }
    });
  });
});
