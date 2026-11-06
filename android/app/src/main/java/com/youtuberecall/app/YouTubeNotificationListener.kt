package com.youtuberecall.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.regex.Pattern

/**
 * Zero-Click YouTube Background Playback Detector Service
 * Intercepts media playback notifications from YouTube and auto-distills
 * educational and self-help videos in the background.
 */
class YouTubeNotificationListener : NotificationListenerService() {

    private val TAG = "YTRecallListener"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val processedTitles = mutableSetOf<String>()
    private val processedVideoIds = mutableSetOf<String>()
    private val CHANNEL_ID = "yt_recall_auto_capture"

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        Log.i(TAG, "YouTube Recall Playback Listener Service Started")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        val pkg = sbn.packageName ?: ""
        // Check if notification is from YouTube (standard, Vanced, ReVanced, NewPipe)
        if (!pkg.contains("youtube") && !pkg.contains("newpipe")) return

        val extras = sbn.notification?.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim() ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim() ?: ""
        val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()?.trim() ?: ""

        if (title.isEmpty() || title.length < 3) return

        // Check if user enabled auto-capture in settings
        val prefs = getSharedPreferences("recall_prefs", Context.MODE_PRIVATE)
        val autoCaptureEnabled = prefs.getBoolean("auto_capture_enabled", true)
        if (!autoCaptureEnabled) return

        // Educational & Self-Help Classifier Filter
        if (!isEducationalContent(title, text, subText)) {
            Log.d(TAG, "Filtered out non-educational title: $title")
            return
        }

        // Deduplication check
        val dedupeKey = "$title::$text"
        synchronized(processedTitles) {
            if (processedTitles.contains(dedupeKey)) return
            processedTitles.add(dedupeKey)
            if (processedTitles.size > 200) {
                processedTitles.clear()
            }
        }

        Log.i(TAG, "Educational video detected in YouTube: '$title' by '$text'. Auto-capturing...")

        scope.launch {
            processEducationalVideo(title, text, sbn)
        }
    }

    private fun isEducationalContent(title: String, channel: String, subText: String): Boolean {
        val combined = "$title $channel $subText".lowercase()

        // Exclude Entertainment, Gaming, Music, Vlogs, Pranks
        val blockPatterns = listOf(
            "official music video", "official video", "music video", "official audio", "lyrics video",
            "lyric video", "full album", "remix", "ft.", "feat.", "live performance",
            "gameplay", "walkthrough part", "lets play", "let's play", "trailer", "teaser",
            "prank", "funny moments", "bloopers", "standup comedy", "comedian", "meme",
            "reaction video", "reacts to", "vlog #", "daily vlog", "haul", "unboxing toys",
            "fortnite", "minecraft", "gta 5", "gta v", "valorant", "roblox", "pubg"
        )

        for (blocked in blockPatterns) {
            if (combined.contains(blocked)) return false
        }

        // Include Educational, Informative, Technical, and Self-Help keywords
        val educationalKeywords = listOf(
            "how to", "tutorial", "guide", "explained", "explanation", "lecture", "course",
            "science", "physics", "chemistry", "biology", "math", "calculus", "algebra",
            "history", "psychology", "neuroscience", "habit", "productivity", "study",
            "deep dive", "analysis", "engineering", "coding", "python", "javascript", "ai",
            "machine learning", "philosophy", "economics", "finance", "investing", "book summary",
            "framework", "architecture", "system design", "health", "exercise", "biohacking",
            "interview", "documentary", "ted", "mit", "stanford", "harvard", "3blue1brown",
            "huberman", "veritasium", "kurzgesagt", "ali abdaal", "lex fridman", "crash course",
            "mentality", "discipline", "strategy", "workflow", "concept", "principle", "lesson"
        )

        for (kw in educationalKeywords) {
            if (combined.contains(kw)) return true
        }

        // If channel is known educational creator
        val informativeChannels = listOf(
            "ted", "vox", "veritasium", "3blue1brown", "huberman", "kurzgesagt", "mit",
            "lex fridman", "khan academy", "stanford", "cs50", "freecodecamp", "ali abdaal"
        )
        for (ch in informativeChannels) {
            if (channel.lowercase().contains(ch)) return true
        }

        // Educational sentence openers
        val educationalRegex = Pattern.compile("^(how|why|what|the truth about|the science of|understanding|mastering|introduction to|the history of)\\b", Pattern.CASE_INSENSITIVE)
        return educationalRegex.matcher(title).find()
    }

    private suspend fun processEducationalVideo(title: String, channel: String, sbn: StatusBarNotification) {
        val videoId = resolveVideoId(title, channel, sbn) ?: return

        synchronized(processedVideoIds) {
            if (processedVideoIds.contains(videoId)) return
            processedVideoIds.add(videoId)
        }

        val prefs = getSharedPreferences("recall_prefs", Context.MODE_PRIVATE)
        val serverUrl = prefs.getString("server_url", "") ?: ""

        // Queue video ID for on-device intake / reader sync
        try {
            val existing = prefs.getStringSet("pending_captured_vids", emptySet()) ?: emptySet()
            val updated = HashSet(existing)
            updated.add(videoId)
            prefs.edit().putStringSet("pending_captured_vids", updated).apply()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to queue pending video: ${e.message}")
        }

        var distilledTitle = title

        // 1. If backend server configured (LAN or Cloud), sync to server
        if (serverUrl.isNotEmpty() && (serverUrl.startsWith("http://") || serverUrl.startsWith("https://"))) {
            try {
                val intakeUrl = "$serverUrl/api/videos/intake"
                val conn = URL(intakeUrl).openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.connectTimeout = 8000
                conn.readTimeout = 15000
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true

                val payload = JSONObject().apply {
                    put("video_url_or_id", videoId)
                    put("force_process", true)
                }

                OutputStreamWriter(conn.outputStream).use { it.write(payload.toString()) }

                if (conn.responseCode in 200..299) {
                    val respText = BufferedReader(InputStreamReader(conn.inputStream)).use { it.readText() }
                    val json = JSONObject(respText)
                    if (json.has("title")) distilledTitle = json.getString("title")
                    Log.i(TAG, "Successfully auto-distilled on server: $videoId ($distilledTitle)")
                }
            } catch (e: Exception) {
                Log.w(TAG, "Server intake failed: ${e.message}")
            }
        }

        // 2. Post a confirmation notification
        showCaptureNotification(videoId, distilledTitle, channel)
    }

    private fun resolveVideoId(title: String, channel: String, sbn: StatusBarNotification): String? {
        // Try extracting directly from notification extras/intents
        try {
            val extras = sbn.notification.extras
            for (key in extras.keySet()) {
                val obj = extras.get(key)
                if (obj is Uri) {
                    val vid = extractVideoIdFromText(obj.toString())
                    if (vid != null) return vid
                } else if (obj is String) {
                    val vid = extractVideoIdFromText(obj)
                    if (vid != null) return vid
                }
            }
        } catch (e: Exception) {}

        // Fast YouTube search resolution
        try {
            val query = "$title $channel"
            val encoded = URLEncoder.encode(query, "UTF-8")
            val searchUrl = "https://www.youtube.com/results?search_query=$encoded"

            val conn = URL(searchUrl).openConnection() as HttpURLConnection
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36")
            conn.connectTimeout = 5000
            conn.readTimeout = 5000

            val html = BufferedReader(InputStreamReader(conn.inputStream)).use { it.readText() }
            val matcher = Pattern.compile("\"videoId\":\"([a-zA-Z0-9_-]{11})\"").matcher(html)
            if (matcher.find()) {
                return matcher.group(1)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Search query resolution failed: ${e.message}")
        }

        return null
    }

    private fun extractVideoIdFromText(text: String): String? {
        val pattern = "(?:youtu\\.be/|youtube\\.com/(?:embed/|v/|watch\\?v=|watch\\?.+&v=|shorts/|live/))([\\w-]{11})"
        val matcher = Pattern.compile(pattern).matcher(text)
        return if (matcher.find()) matcher.group(1) else null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "YouTube Recall Auto-Capture",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Notifies when educational videos are auto-distilled into study guides"
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm?.createNotificationChannel(channel)
        }
    }

    private fun showCaptureNotification(videoId: String, title: String, channel: String) {
        val intent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse("https://appassets.androidplatform.net/assets/index.html?v=$videoId")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            videoId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("✓ Auto-Captured: $title")
            .setContentText("Study guide and flashcards ready for $channel. Tap to review.")
            .setStyle(NotificationCompat.BigTextStyle().bigText("Study guide, executive takeaways, and flashcards ready for $channel ($title). Tap to review in Reader."))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(videoId.hashCode(), notification)
    }
}
