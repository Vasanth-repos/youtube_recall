// YouTube Recall - Automatic Watch & Transcribe Content Script
(function() {
  const SERVER_URL = "http://localhost:8000";
  const AUTO_TRIGGER_SECONDS = 2; // Automatically transcribes after 2 seconds of playback
  
  let currentVideoId = null;
  let activeWatchSeconds = 0;
  let isTranscribing = false;
  let hasAutoTriggered = false;
  let activeToast = null;
  let injectedButton = null;
  let processedVideosCache = new Set();

  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("v");
  }

  function getVideoPlayer() {
    return document.querySelector("video");
  }

  function getVideoTitle() {
    const titleEl = document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
                    document.querySelector("h1.title yt-formatted-string") ||
                    document.querySelector("#title h1");
    if (titleEl && titleEl.textContent) {
      return titleEl.textContent.trim();
    }
    return document.title.replace(" - YouTube", "").trim();
  }

  // Safe wrapper for chrome.runtime.sendMessage to prevent unhandled rejection / context invalidation errors
  function safeSendMessage(msg, cb) {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) {
      return;
    }
    try {
      chrome.runtime.sendMessage(msg, (response) => {
        const err = chrome.runtime.lastError;
        if (cb) cb(response, err);
      });
    } catch (e) {}
  }

  // Load previously processed video IDs from chrome storage
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["processed_videos"], (res) => {
      if (res && res.processed_videos) {
        processedVideosCache = new Set(res.processed_videos);
      }
    });
  }

  function markVideoProcessed(id) {
    processedVideosCache.add(id);
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ processed_videos: Array.from(processedVideosCache) });
    }
  }

  // Show floating toast notification on YouTube page
  function showToast(htmlContent, isClickable = false, autoDismissMs = 0) {
    if (activeToast && activeToast.parentNode) {
      activeToast.parentNode.removeChild(activeToast);
      activeToast = null;
    }

    const toast = document.createElement("div");
    toast.className = "yt-recall-toast";
    toast.innerHTML = htmlContent;

    if (isClickable) {
      toast.title = "Click to open AI Smart Transcript in Reader";
      toast.addEventListener("click", () => {
        window.open(`${SERVER_URL}`, "_blank");
      });
    }

    document.body.appendChild(toast);
    activeToast = toast;

    if (autoDismissMs > 0) {
      setTimeout(() => {
        if (activeToast === toast) {
          toast.classList.add("fade-out");
          setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
          }, 300);
        }
      }, autoDismissMs);
    }
  }

  // Automatic Video Transcription Trigger
  async function autoTranscribeVideo(videoId, title) {
    if (isTranscribing || hasAutoTriggered) return;
    if (processedVideosCache.has(videoId)) {
      updateButtonState("saved");
      return;
    }

    isTranscribing = true;
    hasAutoTriggered = true;
    updateButtonState("loading");

    showToast(`
      <div class="yt-recall-pulse"></div>
      <div>
        <div style="font-weight: 700; font-size: 13px; color: #4ade80;">✨ Auto-Transcribing Video</div>
        <div style="font-size: 11px; color: #94a3b8; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${title}</div>
      </div>
    `, false, 0);

    safeSendMessage({
      action: "intake_video",
      payload: {
        video_url_or_id: videoId,
        watch_time_seconds: activeWatchSeconds || 15,
        watch_percent: 100,
        force_process: true,
        watched_at: new Date().toISOString()
      }
    }, (response, err) => {
      isTranscribing = false;
      if (err) {
        updateButtonState("offline");
        showToast(`<span>❌ Backend offline or extension reloading</span>`, false, 4000);
        return;
      }

      if (response && response.success) {
        markVideoProcessed(videoId);
        updateButtonState("saved");

        showToast(`
          <div style="font-size: 16px;">✓</div>
          <div>
            <div style="font-weight: 700; font-size: 13px; color: #4ade80;">Smart Transcript Ready!</div>
            <div style="font-size: 11px; color: #e2e8f0;">Click to open clean AI notes →</div>
          </div>
        `, true, 9000);
      } else {
        updateButtonState("error");
        showToast(`<span>⚠️ Intake Notice: ${response ? response.error : 'Could not process'}</span>`, false, 4000);
      }
    });
  }

  // Inject or update button inside YouTube player controls
  function injectSaveButton() {
    const videoId = getVideoId();
    if (!videoId) return;

    const targetContainer = document.querySelector("#actions #top-level-buttons-computed") ||
                            document.querySelector("#owner") ||
                            document.querySelector(".ytp-right-controls");

    if (!targetContainer) return;

    if (injectedButton && document.contains(injectedButton) && currentVideoId === videoId) {
      return;
    }

    if (injectedButton && injectedButton.parentNode) {
      injectedButton.parentNode.removeChild(injectedButton);
    }

    injectedButton = document.createElement("button");
    injectedButton.id = "yt-recall-save-btn";
    injectedButton.className = "yt-recall-btn";
    injectedButton.innerHTML = "<span>✨ AI Smart Transcript</span>";
    injectedButton.title = "View or generate crisp AI-powered transcript";

    injectedButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (processedVideosCache.has(videoId)) {
        window.open(`${SERVER_URL}`, "_blank");
      } else {
        autoTranscribeVideo(videoId, getVideoTitle());
      }
    });

    targetContainer.appendChild(injectedButton);

    if (processedVideosCache.has(videoId)) {
      updateButtonState("saved");
    }
  }

  function updateButtonState(state) {
    if (!injectedButton) return;
    if (state === "loading") {
      injectedButton.className = "yt-recall-btn loading";
      injectedButton.innerHTML = "<span>⏳ Distilling...</span>";
    } else if (state === "saved") {
      injectedButton.className = "yt-recall-btn saved";
      injectedButton.innerHTML = "<span>✓ Open Smart Transcript</span>";
      injectedButton.title = "Transcript is ready! Click to open reader.";
    } else if (state === "offline") {
      injectedButton.className = "yt-recall-btn";
      injectedButton.innerHTML = "<span>❌ Server Offline</span>";
    }
  }

  // Watch time monitor & automatic trigger
  function handlePlaybackTracking() {
    const videoId = getVideoId();
    if (!videoId) return;

    // Reset state on video change
    if (currentVideoId !== videoId) {
      currentVideoId = videoId;
      activeWatchSeconds = 0;
      hasAutoTriggered = false;
      isTranscribing = false;
      injectSaveButton();
    }

    const video = getVideoPlayer();
    if (!video) return;

    // Only count active playback
    if (!video.paused && !video.ended && video.playbackRate > 0) {
      activeWatchSeconds += 1;
      
      // Automatic trigger threshold reached!
      if (activeWatchSeconds >= AUTO_TRIGGER_SECONDS && !hasAutoTriggered && !isTranscribing) {
        if (!processedVideosCache.has(videoId)) {
          const title = getVideoTitle();
          autoTranscribeVideo(videoId, title);
        }
      }
    }
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const videoId = getVideoId();
    if (request.action === "get_status") {
      const video = getVideoPlayer();
      const cur = video ? Math.floor(video.currentTime || 0) : 0;
      const dur = video ? Math.floor(video.duration || 0) : 0;
      sendResponse({
        videoId: videoId,
        title: getVideoTitle(),
        activeWatchSeconds: activeWatchSeconds,
        isProcessed: processedVideosCache.has(videoId),
        isTranscribing: isTranscribing,
        currentTime: cur,
        duration: dur
      });
    } else if (request.action === "manual_trigger") {
      autoTranscribeVideo(videoId, getVideoTitle()).then(() => {
        sendResponse({ success: true });
      });
      return true;
    }
  });

  // Detect Logged-In YouTube Account Details
  function detectAndReportAccount() {
    const avatarImg = document.querySelector("#avatar-btn yt-img-shadow img") ||
                      document.querySelector("button#avatar-btn img") ||
                      document.querySelector("#avatar-btn #img");
    const avatarUrl = avatarImg ? avatarImg.src : "";

    const avatarBtn = document.querySelector("#avatar-btn");
    const accountLabel = avatarBtn ? (avatarBtn.getAttribute("aria-label") || "") : "";
    let accountName = accountLabel.replace(/Account picture for\s*/i, "").trim();

    if (!accountName && avatarImg && avatarImg.alt) {
      accountName = avatarImg.alt.replace(/Account picture for\s*/i, "").trim();
    }

    if (avatarUrl || accountName) {
      safeSendMessage({
        action: "update_account_info",
        account_info: {
          account_name: accountName || "YouTube User",
          avatar_url: avatarUrl,
          channel_id: ""
        }
      });
    }
  }

  // Inject History Page Banner on https://www.youtube.com/feed/history
  function checkHistoryPageBanner() {
    if (!window.location.pathname.includes("/feed/history")) return;
    if (document.getElementById("yt-recall-history-banner")) return;

    const target = document.querySelector("ytd-browse[page-subtype='history'] #contents") ||
                   document.querySelector("#contents.ytd-section-list-renderer") ||
                   document.querySelector("ytd-section-list-renderer");

    if (!target) return;

    const banner = document.createElement("div");
    banner.id = "yt-recall-history-banner";
    banner.className = "yt-recall-history-banner";
    banner.innerHTML = `
      <div>
        <div class="yt-recall-history-title">
          <span>✨ YouTube Recall</span>
          <span style="font-size: 11px; font-weight: 500; color: #4ade80; background: rgba(34, 197, 94, 0.15); padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(34, 197, 94, 0.3);">Account Watch History</span>
        </div>
        <div class="yt-recall-history-desc">
          Automatically fetch and transcribe recently watched videos from your YouTube account.
        </div>
      </div>
      <button id="yt-recall-sync-history-btn" class="yt-recall-btn" style="white-space: nowrap; margin-left: 0;">
        <span>⚡ Sync History to Recall</span>
      </button>
    `;

    target.parentNode.insertBefore(banner, target);

    const btn = document.getElementById("yt-recall-sync-history-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        btn.disabled = true;
        btn.innerHTML = "<span>⏳ Syncing History...</span>";
        safeSendMessage({ action: "manual_history_sync", maxCount: 40 }, (res) => {
          btn.disabled = false;
          if (res && res.success) {
            btn.innerHTML = `<span>✓ Synced ${res.newly_synced} New Videos!</span>`;
            setTimeout(() => {
              window.open(SERVER_URL, "_blank");
            }, 1200);
          } else {
            btn.innerHTML = "<span>⚠️ Sync Failed</span>";
            setTimeout(() => {
              btn.innerHTML = "<span>⚡ Sync History to Recall</span>";
            }, 3000);
          }
        });
      });
    }
  }

  // Track playback every second
  setInterval(handlePlaybackTracking, 1000);
  // Re-check button injection on YouTube SPA navigation
  setInterval(injectSaveButton, 2000);
  // Re-check account detection and history page banner
  setInterval(() => {
    detectAndReportAccount();
    checkHistoryPageBanner();
  }, 3000);

  window.addEventListener("yt-navigate-finish", () => {
    activeWatchSeconds = 0;
    hasAutoTriggered = false;
    const vid = getVideoId();
    if (vid) {
      safeSendMessage({
        action: "auto_sync_video",
        videoId: vid,
        title: getVideoTitle(),
        watched_at: new Date().toISOString()
      });
    }
    setTimeout(injectSaveButton, 600);
    setTimeout(detectAndReportAccount, 1000);
    setTimeout(checkHistoryPageBanner, 1200);
  });
  
  // Initial check on script load
  const initialVid = getVideoId();
  if (initialVid) {
    safeSendMessage({
      action: "auto_sync_video",
      videoId: initialVid,
      title: getVideoTitle(),
      watched_at: new Date().toISOString()
    });
  }
})();
