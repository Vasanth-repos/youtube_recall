// Popup Controller
document.addEventListener("DOMContentLoaded", async () => {
  const SERVER_URL = "http://localhost:8000";
  const serverStatus = document.getElementById("server-status");
  const activeView = document.getElementById("active-video-view");
  const inactiveView = document.getElementById("inactive-view");
  const saveBtn = document.getElementById("save-btn");
  const forceCheckbox = document.getElementById("force-checkbox");

  // 1. Check server health
  try {
    const res = await fetch(`${SERVER_URL}/api/health`, { method: "GET" });
    if (res.ok) {
      serverStatus.textContent = "Server Online";
      serverStatus.className = "status-pill";
    } else {
      throw new Error();
    }
  } catch (e) {
    serverStatus.textContent = "Server Offline";
    serverStatus.className = "status-pill offline";
  }

  // 2. Query active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab || !activeTab.url || !activeTab.url.includes("youtube.com/watch")) {
      activeView.style.display = "none";
      inactiveView.style.display = "block";
      return;
    }

    activeView.style.display = "block";
    inactiveView.style.display = "none";

    // Request status from content script
    chrome.tabs.sendMessage(activeTab.id, { action: "get_status" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        document.getElementById("yt-title").textContent = activeTab.title.replace(" - YouTube", "");
        return;
      }

      document.getElementById("yt-title").textContent = response.title || "YouTube Video";
      const stats = response.stats || {};
      const cur = stats.currentTime || 0;
      const dur = stats.duration || 0;
      const pct = Math.round(stats.percent || 0);

      document.getElementById("yt-progress").style.width = `${pct}%`;
      document.getElementById("yt-pct").textContent = `${pct}% Watched`;

      const formatTime = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec < 10 ? '0' : ''}${sec}`;
      };

      document.getElementById("yt-time").textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
    });

    // Save button click
    saveBtn.addEventListener("click", () => {
      saveBtn.disabled = true;
      saveBtn.innerHTML = "<span>⏳ Synthesizing...</span>";

      chrome.tabs.sendMessage(activeTab.id, {
        action: "save_video",
        force: forceCheckbox.checked
      }, (res) => {
        saveBtn.disabled = false;
        saveBtn.innerHTML = "<span>✓ Saved to Library!</span>";
        setTimeout(() => {
          saveBtn.innerHTML = "<span>🧠 Save to Recall</span>";
        }, 2500);
      });
    });
  });
});

