// YouTube Recall Content Script
(function() {
  const SERVER_URL = "http://localhost:8000";
  let injectedButton = null;
  let currentVideoId = null;

  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("v");
  }

  function getVideoPlayer() {
    return document.querySelector("video");
  }

  function getWatchStats() {
    const video = getVideoPlayer();
    if (!video) return { currentTime: 0, duration: 0, percent: 0 };
    const cur = Math.floor(video.currentTime || 0);
    const dur = Math.floor(video.duration || 0);
    const pct = dur > 0 ? (cur / dur * 100) : 0;
    return { currentTime: cur, duration: dur, percent: pct };
  }

  function injectSaveButton() {
    const videoId = getVideoId();
    if (!videoId) return;

    if (injectedButton && document.contains(injectedButton) && currentVideoId === videoId) {
      return;
    }

    currentVideoId = videoId;

    // Target container: below video player action buttons (#top-row or #owner or #actions)
    const targetContainer = document.querySelector("#actions #top-level-buttons-computed") ||
                            document.querySelector("#owner") ||
                            document.querySelector(".ytp-right-controls");

    if (!targetContainer) return;

    if (injectedButton && injectedButton.parentNode) {
      injectedButton.parentNode.removeChild(injectedButton);
    }

    injectedButton = document.createElement("button");
    injectedButton.id = "yt-recall-save-btn";
    injectedButton.className = "yt-recall-btn";
    injectedButton.innerHTML = "<span>✨ AI Smart Transcript</span>";
    injectedButton.title = "Clean transcript, remove verbal fluff, and generate crisp on-to-the-point notes";

    injectedButton.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await triggerSave(true);
    });

    targetContainer.appendChild(injectedButton);
  }

  async function triggerSave(force = false) {
    if (!injectedButton) return;
    const stats = getWatchStats();
    const videoId = getVideoId();

    injectedButton.classList.add("loading");
    injectedButton.innerHTML = "<span>⏳ Synthesizing...</span>";

    try {
      const response = await fetch(`${SERVER_URL}/api/videos/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_url_or_id: videoId,
          watch_time_seconds: stats.currentTime,
          duration_seconds: stats.duration,
          watch_percent: stats.percent,
          force_process: force
        })
      });

      const data = await response.json();
      if (response.ok) {
        injectedButton.classList.remove("loading");
        injectedButton.classList.add("saved");
        injectedButton.innerHTML = "<span>✓ Saved to Recall</span>";
      } else {
        injectedButton.classList.remove("loading");
        injectedButton.innerHTML = "<span>⚠️ " + (data.detail ? data.detail.slice(0, 20) : "Failed") + "</span>";
        setTimeout(() => {
          injectedButton.innerHTML = "<span>🧠 Save to Learn</span>";
        }, 3000);
      }
    } catch (err) {
      injectedButton.classList.remove("loading");
      injectedButton.innerHTML = "<span>❌ Server Offline</span>";
      console.warn("YouTube Recall Backend is not running at", SERVER_URL);
      setTimeout(() => {
        injectedButton.innerHTML = "<span>🧠 Save to Learn</span>";
      }, 3000);
    }
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "get_status") {
      const stats = getWatchStats();
      const videoId = getVideoId();
      const title = document.title.replace(" - YouTube", "");
      sendResponse({
        videoId: videoId,
        title: title,
        stats: stats
      });
    } else if (request.action === "save_video") {
      triggerSave(request.force).then(() => {
        sendResponse({ success: true });
      });
      return true; // async
    }
  });

  // Run on page load and URL change (YouTube is a SPA)
  setInterval(injectSaveButton, 1500);
})();

