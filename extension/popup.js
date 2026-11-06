// Popup Controller for YouTube Recall
document.addEventListener("DOMContentLoaded", async () => {
  const SERVER_URL = "http://localhost:8000";
  const serverStatus = document.getElementById("server-status");
  const activeView = document.getElementById("active-video-view");
  const inactiveView = document.getElementById("inactive-view");
  const ytTitle = document.getElementById("yt-title");
  const autoStatusText = document.getElementById("auto-status-text");
  const mainBtn = document.getElementById("main-btn");

  // 1. Check server health
  let isServerOnline = false;
  try {
    const res = await fetch(`${SERVER_URL}/api/health`, { method: "GET" });
    if (res.ok) {
      serverStatus.textContent = "Server Online";
      serverStatus.className = "status-pill";
      isServerOnline = true;
    } else {
      throw new Error();
    }
  } catch (e) {
    serverStatus.textContent = "Server Offline";
    serverStatus.className = "status-pill offline";
  }

  // 2. Query active YouTube tab
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
            // Try content script trigger first
            chrome.tabs.sendMessage(activeTab.id, { action: "manual_trigger" }, (res) => {
              if (chrome.runtime.lastError || !res) {
                // Direct fallback API call
                fetch(`${SERVER_URL}/api/videos/intake`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    video_url_or_id: videoId,
                    watch_time_seconds: 60,
                    watch_percent: 100,
                    force_process: true
                  })
                }).then(async (apiRes) => {
                  if (apiRes.ok) {
                    mainBtn.disabled = false;
                    mainBtn.innerHTML = "<span>📖 Open in Smart Reader</span>";
                    autoStatusText.textContent = "✓ AI Smart Transcript Ready!";
                    mainBtn.onclick = () => chrome.tabs.create({ url: `${SERVER_URL}/?v=${videoId}` });
                  } else {
                    const err = await apiRes.json();
                    alert("Intake Notice: " + (err.detail || "Could not transcribe"));
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
