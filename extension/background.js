// YouTube Recall - Background Service Worker for Continuous Watch History Sync
const DEFAULT_SERVER_URLS = ["http://localhost:8000", "http://127.0.0.1:8000"];
const ALARM_NAME = "sync_youtube_history_alarm";
const SYNC_INTERVAL_MINUTES = 2; // Auto-sync background history every 2 minutes

// In-memory debounce set to avoid duplicate rapid requests
const recentlySyncedSet = new Set();

// Dynamically retrieve candidate server URLs (including custom online tunnels if configured)
async function getServerUrls() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(["backend_url"], (res) => {
        if (chrome.runtime.lastError) {
          return resolve(DEFAULT_SERVER_URLS);
        }
        if (res && res.backend_url && typeof res.backend_url === "string" && res.backend_url.trim()) {
          const custom = res.backend_url.trim().replace(/\/+$/, "");
          resolve([custom, ...DEFAULT_SERVER_URLS]);
        } else {
          resolve(DEFAULT_SERVER_URLS);
        }
      });
    } catch (e) {
      resolve(DEFAULT_SERVER_URLS);
    }
  });
}

// Helper to safely post to backend with fallback across candidate URLs
async function postToBackend(endpoint, payload) {
  let lastErr = null;
  const urls = await getServerUrls();
  for (const base of urls) {
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

// Helper to safely get from backend with fallback
async function getFromBackend(endpoint) {
  let lastErr = null;
  const urls = await getServerUrls();
  for (const base of urls) {
    try {
      const resp = await fetch(`${base}${endpoint}`, { method: "GET" });
      if (resp.ok) return resp;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Backend offline at localhost:8000");
}

// Safe badge setter that consumes chrome.runtime.lastError to prevent warnings
function safeSetBadge(text, color = "#22c55e", clearAfterMs = 4000) {
  try {
    if (chrome.action && chrome.action.setBadgeText) {
      chrome.action.setBadgeText({ text: text || "" }, () => {
        if (chrome.runtime.lastError) {} // Consume
      });
      if (color && chrome.action.setBadgeBackgroundColor) {
        chrome.action.setBadgeBackgroundColor({ color: color }, () => {
          if (chrome.runtime.lastError) {}
        });
      }
      if (clearAfterMs > 0 && text) {
        setTimeout(() => {
          try {
            chrome.action.setBadgeText({ text: "" }, () => {
              if (chrome.runtime.lastError) {}
            });
          } catch (e) {}
        }, clearAfterMs);
      }
    }
  } catch (e) {}
}

// Safe reply helper to deliver responses without throwing on closed ports
function sendSafeReply(sendResponse, payload) {
  if (typeof sendResponse !== "function") return;
  try {
    sendResponse(payload);
  } catch (e) {}
}

// Initialize periodic sync alarm on extension load & startup
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: SYNC_INTERVAL_MINUTES,
      delayInMinutes: 1
    });
  } catch (e) {}
  console.log("YouTube Recall background auto-sync worker initialized.");
  syncYouTubeHistory(25).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  syncYouTubeHistory(25).catch(() => {});
});

// Periodic sync alarm handler
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm && alarm.name === ALARM_NAME) {
    syncYouTubeHistory(20).catch(() => {});
  }
});

// Extract 11-char YouTube Video ID from any URL format
function extractVideoId(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") && u.searchParams.has("v")) {
      const v = u.searchParams.get("v");
      return v && v.length >= 11 ? v.slice(0, 11) : null;
    }
    if (u.hostname.includes("youtu.be")) {
      const seg = u.pathname.slice(1).split("?")[0];
      return seg.length >= 11 ? seg.slice(0, 11) : null;
    }
    if (u.pathname.includes("/shorts/")) {
      const parts = u.pathname.split("/shorts/")[1];
      if (parts) {
        const seg = parts.split("?")[0].split("/")[0];
        return seg.length >= 11 ? seg.slice(0, 11) : null;
      }
    }
    if (u.pathname.includes("/live/")) {
      const parts = u.pathname.split("/live/")[1];
      if (parts) {
        const seg = parts.split("?")[0].split("/")[0];
        return seg.length >= 11 ? seg.slice(0, 11) : null;
      }
    }
  } catch (e) {}
  return null;
}

// Automatically sync an individual video into YouTube Recall
async function autoSyncVideo(videoId, title, visitedTime) {
  if (!videoId || recentlySyncedSet.has(videoId)) return;
  recentlySyncedSet.add(videoId);

  // Keep debounce cache bounded to 200 items
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
      safeSetBadge("✓", "#22c55e", 5000);
    }
  } catch (err) {
    console.log(`[YouTube Recall] Auto-sync notice for ${videoId}:`, err ? err.message : err);
  }
}

// 1. Instant trigger on Chrome browsing history visits
chrome.history.onVisited.addListener((historyItem) => {
  if (!historyItem || !historyItem.url) return;
  if (historyItem.url.includes("youtube.com/watch") || historyItem.url.includes("youtu.be/") || historyItem.url.includes("youtube.com/shorts/") || historyItem.url.includes("youtube.com/live/")) {
    const videoId = extractVideoId(historyItem.url);
    if (videoId) {
      autoSyncVideo(videoId, historyItem.title, historyItem.lastVisitTime);
    }
  }
});

// 2. Instant trigger on active tab URL updates / navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const targetUrl = (changeInfo && changeInfo.url) || (tab && tab.url);
  if (targetUrl && (targetUrl.includes("youtube.com/watch") || targetUrl.includes("youtu.be/") || targetUrl.includes("youtube.com/shorts/") || targetUrl.includes("youtube.com/live/"))) {
    const videoId = extractVideoId(targetUrl);
    if (videoId) {
      autoSyncVideo(videoId, tab ? tab.title : "");
    }
  }
});

// Synchronize YouTube watch history from Chrome's browsing history in batch
async function syncYouTubeHistory(maxResults = 25) {
  return new Promise((resolve) => {
    try {
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      chrome.history.search(
        {
          text: "https://www.youtube.com/watch",
          startTime: oneWeekAgo,
          maxResults: maxResults
        },
        async (historyItems) => {
          if (chrome.runtime.lastError) {
            console.log("[YouTube Recall] History search notice:", chrome.runtime.lastError.message);
            return resolve({
              success: false,
              message: chrome.runtime.lastError.message
            });
          }

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
            if (!item || !item.url) continue;
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
            if (chrome.runtime.lastError) {} // Consume
            const account = (res && res.yt_account_info) || {};

            try {
              const resp = await postToBackend("/api/videos/sync-history", {
                items: itemsToSync,
                account_name: account.account_name || "Vasanthabalan",
                account_email: account.account_email || "vasanthabalanb4@gmail.com",
                avatar_url: account.avatar_url || ""
              });

              if (!resp.ok) {
                const errData = await resp.json().catch(() => ({}));
                return resolve({
                  success: false,
                  message: errData.detail || "Server rejected history sync"
                });
              }

              const data = await resp.json();
              chrome.storage.local.set({
                last_history_sync_time: Date.now(),
                last_sync_stats: data
              }, () => {
                if (chrome.runtime.lastError) {}
              });

              resolve({
                success: true,
                ...data
              });
            } catch (fetchErr) {
              console.log("[YouTube Recall] Backend server notice:", fetchErr ? fetchErr.message : fetchErr);
              resolve({
                success: false,
                message: "Backend server temporarily unreachable at localhost:8000"
              });
            }
          });
        }
      );
    } catch (err) {
      resolve({ success: false, message: err ? err.message : "History sync error" });
    }
  });
}

// Listen for messages from Content Scripts and Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.action) return false;

  if (request.action === "intake_video") {
    postToBackend("/api/videos/intake", request.payload)
      .then(async (resp) => {
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          sendSafeReply(sendResponse, { success: false, error: errData.detail || "Server error" });
          return;
        }
        const data = await resp.json();
        safeSetBadge("✓", "#22c55e", 5000);
        sendSafeReply(sendResponse, { success: true, data: data });
      })
      .catch((err) => {
        sendSafeReply(sendResponse, { success: false, error: err.message });
      });
    return true; // Keep channel open for async response
  }

  if (request.action === "check_health") {
    getFromBackend("/api/health")
      .then(async (resp) => {
        const data = await resp.json();
        sendSafeReply(sendResponse, { online: true, data: data });
      })
      .catch((err) => {
        sendSafeReply(sendResponse, { online: false, error: err.message });
      });
    return true;
  }

  if (request.action === "manual_history_sync") {
    syncYouTubeHistory(request.maxCount || 30)
      .then((result) => sendSafeReply(sendResponse, result))
      .catch((err) => sendSafeReply(sendResponse, { success: false, error: err.message }));
    return true;
  }

  if (request.action === "auto_sync_video") {
    // Fire-and-forget in background, answer caller immediately so message port is closed cleanly
    sendSafeReply(sendResponse, { success: true });
    autoSyncVideo(request.videoId, request.title, request.watched_at).catch(() => {});
    return false;
  }

  if (request.action === "update_account_info") {
    sendSafeReply(sendResponse, { success: true });
    if (request.account_info) {
      chrome.storage.local.set({ yt_account_info: request.account_info }, () => {
        if (chrome.runtime.lastError) {}
        postToBackend("/api/youtube/browser-account", {
          account_name: request.account_info.account_name || "Vasanthabalan",
          account_email: request.account_info.account_email || "vasanthabalanb4@gmail.com",
          avatar_url: request.account_info.avatar_url || "",
          channel_id: request.account_info.channel_id || "",
          linked_method: "browser_extension"
        }).catch(() => {});
      });
    }
    return false;
  }

  return false;
});
