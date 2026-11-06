// YouTube Recall - Background Service Worker for Continuous Watch History Sync
const SERVER_URLS = ["http://localhost:8000", "http://127.0.0.1:8000"];
const ALARM_NAME = "sync_youtube_history_alarm";
const SYNC_INTERVAL_MINUTES = 2; // Auto-sync background history every 2 minutes

// In-memory debounce set to avoid duplicate rapid requests
const recentlySyncedSet = new Set();

// Helper to post to backend with fallback between localhost and 127.0.0.1
async function postToBackend(endpoint, payload) {
  let lastErr = null;
  for (const base of SERVER_URLS) {
    try {
      const resp = await fetch(`${base}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      return resp;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Backend offline at localhost:8000");
}

// Helper to get from backend with fallback
async function getFromBackend(endpoint) {
  let lastErr = null;
  for (const base of SERVER_URLS) {
    try {
      const resp = await fetch(`${base}${endpoint}`, { method: "GET" });
      if (resp.ok) return resp;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Backend offline at localhost:8000");
}

// Initialize periodic sync alarm on extension load & startup
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: SYNC_INTERVAL_MINUTES,
    delayInMinutes: 0.1
  });
  console.log("YouTube Recall background auto-sync worker initialized.");
  syncYouTubeHistory(25).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  syncYouTubeHistory(25).catch(() => {});
});

// Periodic sync alarm handler (every 2 minutes)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    syncYouTubeHistory(20).catch((err) => {
      console.warn("Background auto-sync failed:", err);
    });
  }
});

// Extract 11-char YouTube Video ID from URL
function extractVideoId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") && u.searchParams.has("v")) {
      return u.searchParams.get("v");
    }
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1);
    }
  } catch (e) {}
  return null;
}

// Automatically sync an individual video into YouTube Recall
async function autoSyncVideo(videoId, title, visitedTime) {
  if (!videoId || recentlySyncedSet.has(videoId)) return;
  recentlySyncedSet.add(videoId);

  // Keep debounce cache bounded
  if (recentlySyncedSet.size > 200) {
    const first = recentlySyncedSet.values().next().value;
    recentlySyncedSet.delete(first);
  }

  const cleanTitle = (title || "").replace(" - YouTube", "").trim();
  const watchedAt = visitedTime ? new Date(visitedTime).toISOString() : new Date().toISOString();

  try {
    console.log(`[YouTube Recall] Auto-capturing watched video: ${videoId} ('${cleanTitle}')`);

    const resp = await postToBackend("/api/videos/intake", {
      video_url_or_id: videoId,
      watch_time_seconds: 60,
      watch_percent: 100,
      force_process: true,
      watched_at: watchedAt
    });

    if (resp && resp.ok) {
      console.log(`[YouTube Recall] ✓ Video ${videoId} auto-synced into smart transcript!`);
      if (chrome.action && chrome.action.setBadgeText) {
        chrome.action.setBadgeText({ text: "✓" });
        chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
        setTimeout(() => {
          chrome.action.setBadgeText({ text: "" });
        }, 6000);
      }
    }
  } catch (err) {
    console.warn(`[YouTube Recall] Auto-sync failed for ${videoId}:`, err);
  }
}

// 1. Instant trigger on Chrome browsing history visits
chrome.history.onVisited.addListener((historyItem) => {
  if (historyItem.url && (historyItem.url.includes("youtube.com/watch") || historyItem.url.includes("youtu.be/"))) {
    const videoId = extractVideoId(historyItem.url);
    if (videoId) {
      autoSyncVideo(videoId, historyItem.title, historyItem.lastVisitTime);
    }
  }
});

// 2. Instant trigger on active tab URL updates / navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const targetUrl = changeInfo.url || tab.url;
  if (targetUrl && (targetUrl.includes("youtube.com/watch") || targetUrl.includes("youtu.be/"))) {
    const videoId = extractVideoId(targetUrl);
    if (videoId) {
      autoSyncVideo(videoId, tab.title);
    }
  }
});

// Synchronize YouTube watch history from Chrome's browsing history in batch
async function syncYouTubeHistory(maxResults = 25) {
  return new Promise((resolve, reject) => {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    chrome.history.search(
      {
        text: "https://www.youtube.com/watch",
        startTime: oneWeekAgo,
        maxResults: maxResults
      },
      async (historyItems) => {
        if (!historyItems || historyItems.length === 0) {
          return resolve({
            success: true,
            total_received: 0,
            newly_synced: 0,
            already_synced: 0,
            message: "No recent YouTube watch history found in browser."
          });
        }

        const seenIds = new Set();
        const itemsToSync = [];

        for (const item of historyItems) {
          const videoId = extractVideoId(item.url);
          if (videoId && !seenIds.has(videoId)) {
            seenIds.add(videoId);
            itemsToSync.push({
              video_url_or_id: videoId,
              title: (item.title || "").replace(" - YouTube", "").trim(),
              watched_at: item.lastVisitTime ? new Date(item.lastVisitTime).toISOString() : new Date().toISOString(),
              watch_time_seconds: 180
            });
          }
        }

        if (itemsToSync.length === 0) {
          return resolve({
            success: true,
            total_received: 0,
            newly_synced: 0,
            already_synced: 0,
            message: "No valid YouTube videos to synchronize."
          });
        }

        chrome.storage.local.get(["yt_account_info"], async (res) => {
          const account = res.yt_account_info || {};

          try {
            const resp = await postToBackend("/api/videos/sync-history", {
              items: itemsToSync,
              account_name: account.account_name || "Vasanthabalan",
              account_email: account.account_email || "vasanthabalanb4@gmail.com",
              avatar_url: account.avatar_url || ""
            });

            if (!resp.ok) {
              const errData = await resp.json().catch(() => ({}));
              return reject(new Error(errData.detail || "Server rejected history sync"));
            }

            const data = await resp.json();
            
            chrome.storage.local.set({
              last_history_sync_time: Date.now(),
              last_sync_stats: data
            });

            resolve({
              success: true,
              ...data
            });
          } catch (fetchErr) {
            console.warn("YouTube Recall Backend server unreachable:", fetchErr);
            reject(fetchErr);
          }
        });
      }
    );
  });
}

// Listen for messages from Content Scripts and Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "intake_video") {
    postToBackend("/api/videos/intake", request.payload)
      .then(async (resp) => {
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          return sendResponse({ success: false, error: errData.detail || "Server error" });
        }
        const data = await resp.json();
        if (chrome.action && chrome.action.setBadgeText) {
          chrome.action.setBadgeText({ text: "✓" });
          chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
          setTimeout(() => {
            chrome.action.setBadgeText({ text: "" });
          }, 6000);
        }
        sendResponse({ success: true, data: data });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep channel open for async response
  }

  if (request.action === "check_health") {
    getFromBackend("/api/health")
      .then(async (resp) => {
        const data = await resp.json();
        sendResponse({ online: true, data: data });
      })
      .catch((err) => {
        sendResponse({ online: false, error: err.message });
      });
    return true;
  }

  if (request.action === "auto_sync_video") {
    autoSyncVideo(request.videoId, request.title, request.watched_at)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "manual_history_sync") {
    syncYouTubeHistory(request.maxCount || 30)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "update_account_info") {
    chrome.storage.local.set({ yt_account_info: request.account_info }, () => {
      postToBackend("/api/youtube/browser-account", {
        account_name: request.account_info.account_name || "Vasanthabalan",
        account_email: request.account_info.account_email || "vasanthabalanb4@gmail.com",
        avatar_url: request.account_info.avatar_url || "",
        channel_id: request.account_info.channel_id || "",
        linked_method: "browser_extension"
      }).catch(() => {});
      sendResponse({ success: true });
    });
    return true;
  }
});

