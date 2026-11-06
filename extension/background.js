// YouTube Recall - Background Service Worker for Continuous Watch History Sync
const SERVER_URL = "http://localhost:8000";
const ALARM_NAME = "sync_youtube_history_alarm";
const SYNC_INTERVAL_MINUTES = 15;

// Initialize periodic sync alarm on extension load
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: SYNC_INTERVAL_MINUTES,
    delayInMinutes: 1
  });
  console.log("YouTube Recall background sync worker initialized.");
});

// Periodic sync alarm handler
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    syncYouTubeHistory(15).catch((err) => {
      console.warn("Background auto-sync failed:", err);
    });
  }
});

// Extract 11-char YouTube Video ID from URL
function extractVideoId(url) {
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

// Synchronize YouTube watch history from Chrome's browsing history
async function syncYouTubeHistory(maxResults = 25) {
  return new Promise((resolve, reject) => {
    // Look for YouTube watch URLs from the past 7 days
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

        // Deduplicate videos by ID
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

        // Retrieve stored YouTube account info
        chrome.storage.local.get(["yt_account_info"], async (res) => {
          const account = res.yt_account_info || {};

          try {
            const resp = await fetch(`${SERVER_URL}/api/videos/sync-history`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                items: itemsToSync,
                account_name: account.account_name || "Vasanthabalan",
                account_email: account.account_email || "vasanthabalanb4@gmail.com",
                avatar_url: account.avatar_url || ""
              })
            });

            if (!resp.ok) {
              const errData = await resp.json().catch(() => ({}));
              return reject(new Error(errData.detail || "Server rejected history sync"));
            }

            const data = await resp.json();
            
            // Cache sync stats
            chrome.storage.local.set({
              last_history_sync_time: Date.now(),
              last_sync_stats: data
            });

            resolve({
              success: true,
              ...data
            });
          } catch (fetchErr) {
            console.warn("YouTube Recall Backend server unreachable at", SERVER_URL);
            reject(fetchErr);
          }
        });
      }
    );
  });
}

// Listen for messages from Content Scripts and Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "manual_history_sync") {
    syncYouTubeHistory(request.maxCount || 30)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (request.action === "update_account_info") {
    chrome.storage.local.set({ yt_account_info: request.account_info }, () => {
      // Also notify backend of active YouTube account session
      fetch(`${SERVER_URL}/api/youtube/browser-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_name: request.account_info.account_name || "Vasanthabalan",
          account_email: request.account_info.account_email || "vasanthabalanb4@gmail.com",
          avatar_url: request.account_info.avatar_url || "",
          channel_id: request.account_info.channel_id || "",
          linked_method: "browser_extension"
        })
      }).catch(() => {});
      sendResponse({ success: true });
    });
    return true;
  }
});

