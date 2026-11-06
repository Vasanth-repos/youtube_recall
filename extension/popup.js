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

  // 1. Check server health & linked account status
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
        break;
      }
    } catch (e) {}
  }

  if (!isServerOnline) {
    chrome.runtime.sendMessage({ action: "check_health" }, (resp) => {
      const err = chrome.runtime.lastError;
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
    const acc = res.yt_account_info;
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

    if (res.last_sync_stats) {
      const stats = res.last_sync_stats;
      syncStatus.style.display = "block";
      syncStatus.textContent = `Last sync: ${stats.newly_synced || 0} new, ${stats.already_synced || 0} existing videos.`;
    }
  });

  if (isServerOnline) {
    fetch(`${activeServerUrl}/api/youtube/status`)
      .then((r) => r.json())
      .then((data) => {
        if (data.is_linked) {
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
        syncStatus.innerHTML = `<span style="color: #4ade80; font-weight: 600;">✓ Synced ${res.newly_synced} new video(s)!</span> (${res.already_synced} already in library)`;
      } else {
        syncStatus.innerHTML = `<span style="color: #f87171;">⚠️ Sync notice: ${res && res.error ? res.error : "Server reconnecting"}</span>`;
      }
    });
  });

  // 3. Query active YouTube tab
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab || !activeTab.url || !activeTab.url.includes("youtube.com/watch")) {
      activeView.style.display = "none";
      inactiveView.style.display = "block";
      return;
    }

    activeView.style.display = "block";
    inactiveView.style.display = "none";

    const urlParams = new URL(activeTab.url).searchParams;
    const videoId = urlParams.get("v");

    if (!videoId) {
      activeView.style.display = "none";
      inactiveView.style.display = "block";
      return;
    }

    // Set fallback title from tab
    ytTitle.textContent = (activeTab.title || "YouTube Video").replace(" - YouTube", "");

    // Check directly if already in backend DB
    let isAlreadyInDb = false;
    if (isServerOnline) {
      try {
        const checkRes = await fetch(`${SERVER_URL}/api/videos/${videoId}`);
        if (checkRes.ok) {
          isAlreadyInDb = true;
          const vidData = await checkRes.json();
          if (vidData.title) ytTitle.textContent = vidData.title;
        }
      } catch (e) {}
    }

    // Query status from content script
    chrome.tabs.sendMessage(activeTab.id, { action: "get_status" }, (status) => {
      const isProcessed = isAlreadyInDb || (status && status.isProcessed);
      const isTranscribing = status && status.isTranscribing;

      if (status && status.title) {
        ytTitle.textContent = status.title;
      }

      if (isProcessed) {
        autoStatusText.textContent = "✓ AI Smart Transcript Ready!";
        mainBtn.innerHTML = "<span>📖 Open in Smart Reader</span>";
        mainBtn.disabled = false;
        mainBtn.onclick = () => {
          chrome.tabs.create({ url: `${SERVER_URL}/?v=${videoId}` });
        };
      } else if (isTranscribing) {
        autoStatusText.textContent = "⏳ Distilling clean transcript...";
        mainBtn.innerHTML = "<span>⏳ AI Processing Now...</span>";
        mainBtn.disabled = true;
      } else {
        const seconds = status ? (status.activeWatchSeconds || 0) : 0;
        autoStatusText.textContent = `Auto-capturing playback (${seconds}/8s)`;
        mainBtn.innerHTML = "<span>⚡ Transcribe Now</span>";
        mainBtn.disabled = !isServerOnline;
        
        mainBtn.onclick = async () => {
          mainBtn.disabled = true;
          mainBtn.innerHTML = "<span>⏳ Synthesizing...</span>";
          autoStatusText.textContent = "Transcribing in background...";

          try {
            chrome.tabs.sendMessage(activeTab.id, { action: "manual_trigger" }, (res) => {
              if (chrome.runtime.lastError || !res) {
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
                  if (apiRes && apiRes.success) {
                    mainBtn.disabled = false;
                    mainBtn.innerHTML = "<span>📖 Open in Smart Reader</span>";
                    autoStatusText.textContent = "✓ AI Smart Transcript Ready!";
                    mainBtn.onclick = () => chrome.tabs.create({ url: `${activeServerUrl}/?v=${videoId}` });
                  } else {
                    alert("Intake Notice: " + (apiRes ? apiRes.error : "Could not transcribe"));
                    mainBtn.disabled = false;
                    mainBtn.innerHTML = "<span>⚡ Transcribe Now</span>";
                  }
                });
              } else {
                mainBtn.disabled = false;
                mainBtn.innerHTML = "<span>📖 Open in Smart Reader</span>";
                autoStatusText.textContent = "✓ AI Smart Transcript Ready!";
                mainBtn.onclick = () => chrome.tabs.create({ url: `${SERVER_URL}/?v=${videoId}` });
              }
            });
          } catch (err) {
            alert("Error connecting to backend: " + err.message);
            mainBtn.disabled = false;
            mainBtn.innerHTML = "<span>⚡ Transcribe Now</span>";
          }
        };
      }
    });
  });
});
