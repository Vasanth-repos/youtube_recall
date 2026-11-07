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

// Fetches the user's Google/YouTube cloud watch history feed
// Automatically captures all videos watched on Android Mobile, Tablet, Smart TV, or PC under this Google account
async function fetchCloudWatchHistory(limit = 30) {
  try {
    console.log("[YouTube Recall] Querying Google Account Watch History from https://www.youtube.com/feed/history...");
    const resp = await fetch("https://www.youtube.com/feed/history", {
      method: "GET",
      credentials: "include",
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    if (!resp.ok) {
      console.log(`[YouTube Recall] Feed history returned status ${resp.status}`);
      return [];
    }

    const html = await resp.text();

    // Check if user is logged into YouTube in this browser profile
    if (html.includes('href="https://accounts.google.com/ServiceLogin') && !html.includes("var ytInitialData")) {
      console.log("[YouTube Recall] Note: YouTube session not authenticated in this Chrome profile.");
      return [];
    }

    const videos = [];
    const seenIds = new Set();

    // Strategy 1: Parse ytInitialData JSON object embedded in page
    const initialDataMatch = html.match(/var ytInitialData\s*=\s*({.+?});<\/script>/s) ||
                             html.match(/window\["ytInitialData"\]\s*=\s*({.+?});<\/script>/s);

    if (initialDataMatch && initialDataMatch[1]) {
      try {
        const data = JSON.parse(initialDataMatch[1]);
        
        function extractFromData(node) {
          if (!node || typeof node !== "object") return;
          if (node.videoRenderer && node.videoRenderer.videoId) {
            const vr = node.videoRenderer;
            const vId = vr.videoId;
            if (vId && !seenIds.has(vId) && seenIds.size < limit) {
              seenIds.add(vId);
              let title = "";
              if (vr.title && vr.title.runs && vr.title.runs[0]) {
                title = vr.title.runs[0].text || "";
              } else if (vr.title && vr.title.simpleText) {
                title = vr.title.simpleText;
              }
              videos.push({
                video_url_or_id: vId,
                title: title.replace(" - YouTube", "").trim(),
                watch_time_seconds: 180,
                watched_at: new Date().toISOString()
              });
            }
          }
          for (const k of Object.keys(node)) {
            extractFromData(node[k]);
          }
        }

        extractFromData(data);
        if (videos.length > 0) {
          console.log(`[YouTube Recall] ✓ Extracted ${videos.length} videos from Google Account Watch History (including mobile watches)!`);
          return videos;
        }
      } catch (jsonErr) {
        console.log("[YouTube Recall] JSON parse notice on ytInitialData:", jsonErr.message);
      }
    }

    // Strategy 2: Resilient Regex scan across raw HTML for watch links
    const regex = /\/watch\?v=([a-zA-Z0-9_-]{11})/g;
    let match;
    while ((match = regex.exec(html)) !== null && seenIds.size < limit) {
      const vId = match[1];
      if (vId && !seenIds.has(vId)) {
        seenIds.add(vId);
        videos.push({
          video_url_or_id: vId,
          title: "",
          watch_time_seconds: 180,
          watched_at: new Date().toISOString()
        });
      }
    }

    console.log(`[YouTube Recall] Extracted ${videos.length} videos from cloud history via HTML scan.`);
    return videos;
  } catch (err) {
    console.log("[YouTube Recall] Cloud history fetch notice:", err.message);
    return [];
  }
}

// Synchronize YouTube watch history (Cloud Google Account History + Local Chrome History)
async function syncYouTubeHistory(maxResults = 30) {
  try {
    // 1. Fetch Cloud Watch History (Google Account - captures mobile, tablet, and PC watches)
    const cloudVideos = await fetchCloudWatchHistory(maxResults);

    // 2. Also search local Chrome browsing history
    const localVideos = await new Promise((resolve) => {
      try {
        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        chrome.history.search(
          {
            text: "https://www.youtube.com/watch",
            startTime: oneWeekAgo,
            maxResults: maxResults
          },
          (historyItems) => {
            if (chrome.runtime.lastError || !historyItems) return resolve([]);
            const res = [];
            for (const item of historyItems) {
              if (!item || !item.url) continue;
              const vId = extractVideoId(item.url);
              if (vId) {
                res.push({
                  video_url_or_id: vId,
                  title: (item.title || "").replace(" - YouTube", "").trim(),
                  watched_at: item.lastVisitTime ? new Date(item.lastVisitTime).toISOString() : new Date().toISOString(),
                  watch_time_seconds: 180
                });
              }
            }
            resolve(res);
          }
        );
      } catch (e) {
        resolve([]);
      }
    });

    // 3. Merge Cloud + Local videos (prioritizing cloud feed for recency)
    const combined = [];
    const seenIds = new Set();

    for (const v of [...cloudVideos, ...localVideos]) {
      if (v.video_url_or_id && !seenIds.has(v.video_url_or_id)) {
        seenIds.add(v.video_url_or_id);
        combined.push(v);
        if (combined.length >= maxResults) break;
      }
    }

    if (combined.length === 0) {
      return {
        success: true,
        total_received: 0,
        newly_synced: 0,
        already_synced: 0,
        message: "No recent YouTube watch history found in account or browser."
      };
    }

    // 4. Retrieve account info and post to backend
    const accountInfo = await new Promise((resolve) => {
      chrome.storage.local.get(["yt_account_info"], (res) => {
        if (chrome.runtime.lastError) {}
        resolve((res && res.yt_account_info) || {});
      });
    });

    const resp = await postToBackend("/api/videos/sync-history", {
      items: combined,
      account_name: accountInfo.account_name || "YouTube User",
      account_email: accountInfo.account_email || "",
      avatar_url: accountInfo.avatar_url || ""
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      return {
        success: false,
        message: errData.detail || "Server rejected history sync"
      };
    }

    const data = await resp.json();
    if (data.newly_synced > 0) {
      safeSetBadge(`+${data.newly_synced}`, "#f59e0b", 8000);
      console.log(`[YouTube Recall] 🎉 Successfully auto-synced ${data.newly_synced} new videos from Google account!`);
    }

    chrome.storage.local.set({
      last_history_sync_time: Date.now(),
      last_sync_stats: data
    }, () => {
      if (chrome.runtime.lastError) {}
    });

    return {
      success: true,
      ...data
    };
  } catch (err) {
    console.log("[YouTube Recall] Backend server notice during history sync:", err ? err.message : err);
    return {
      success: false,
      message: "Backend server temporarily unreachable at localhost:8000"
    };
  }
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
          account_name: request.account_info.account_name || "YouTube User",
          account_email: request.account_info.account_email || "",
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
