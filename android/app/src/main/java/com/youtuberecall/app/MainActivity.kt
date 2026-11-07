package com.youtuberecall.app

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.view.View
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import com.youtuberecall.app.databinding.ActivityMainBinding
import java.util.regex.Pattern

/**
 * YouTube Recall Standalone Mobile Application.
 * Runs 100% on-device with bundled assets and direct Google Gemini API integration.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val PREFS_NAME = "recall_prefs"
    val APP_ASSET_URL = "https://appassets.androidplatform.net/assets/index.html"

    private var pendingSharedVideoId: String? = null
    private lateinit var assetLoader: WebViewAssetLoader

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .addPathHandler("/static/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        setupWebView()
        setupListeners()
        setupBackNavigation()

        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent?.let { handleIntent(it) }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        binding.webView.apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                useWideViewPort = true
                loadWithOverviewMode = true
                allowFileAccess = true
                allowContentAccess = true
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                userAgentString = "$userAgentString YouTubeRecallAndroid/1.1.0"
            }

            addJavascriptInterface(WebAppInterface(this@MainActivity, prefs), "AndroidBridge")

            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView?, newProgress: Int) {
                    if (newProgress < 100) {
                        binding.progressBar.visibility = View.VISIBLE
                        binding.progressBar.progress = newProgress
                    } else {
                        binding.progressBar.visibility = View.GONE
                        binding.swipeRefresh.isRefreshing = false
                    }
                }
            }

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                    val url = request?.url ?: return null
                    return assetLoader.shouldInterceptRequest(url)
                }

                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    val url = request?.url?.toString() ?: return false

                    // Keep local app assets inside WebView
                    if (url.startsWith("https://appassets.androidplatform.net")) {
                        return false
                    }

                    // Open external links (like YouTube watch links or external references) in browser/YouTube app
                    try {
                        val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        startActivity(browserIntent)
                        return true
                    } catch (e: Exception) {
                        return false
                    }
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    binding.swipeRefresh.visibility = View.VISIBLE

                    // If a video was shared via Android Share Sheet, auto-distill it
                    pendingSharedVideoId?.let { vid ->
                        val script = "if (window.autoIntakeSharedVideo) { window.autoIntakeSharedVideo('$vid'); } else if (window.openReaderForVideo) { window.openReaderForVideo('$vid'); }"
                        view?.evaluateJavascript(script, null)
                        pendingSharedVideoId = null
                    }
                }

                override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                    if (request?.isForMainFrame == true) {
                        val failedUrl = request.url?.toString() ?: ""
                        if (!failedUrl.startsWith("https://appassets.androidplatform.net")) {
                            view?.loadUrl(APP_ASSET_URL)
                        }
                    }
                }
            }

            // Native Android DownloadManager handling for exported Anki and Obsidian notes
            setDownloadListener { url, userAgent, contentDisposition, mimetype, _ ->
                try {
                    val request = DownloadManager.Request(Uri.parse(url)).apply {
                        setMimeType(mimetype)
                        addRequestHeader("User-Agent", userAgent)
                        val cookies = CookieManager.getInstance().getCookie(url)
                        addRequestHeader("Cookie", cookies)
                        setDescription("Downloading distilled study notes...")
                        val filename = URLUtil.guessFileName(url, contentDisposition, mimetype)
                        setTitle(filename)
                        setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                        setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
                    }

                    val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                    dm.enqueue(request)
                    Toast.makeText(this@MainActivity, "Downloading note export to Downloads...", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "Download failed: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }

        loadApp()
    }

    fun loadApp() {
        val targetUrl = pendingSharedVideoId?.let { "$APP_ASSET_URL?v=$it" } ?: APP_ASSET_URL
        binding.webView.loadUrl(targetUrl)
    }

    private fun setupListeners() {
        binding.swipeRefresh.setOnRefreshListener {
            binding.webView.reload()
        }
        binding.swipeRefresh.setColorSchemeResources(R.color.amber_accent)
        binding.swipeRefresh.setProgressBackgroundColorSchemeResource(R.color.obsidian_card)
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.webView.canGoBack()) {
                    binding.webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    // Handles incoming YouTube Share Sheet and Deep Links
    private fun handleIntent(intent: Intent) {
        val action = intent.action
        val type = intent.type

        if (Intent.ACTION_SEND == action && type != null && "text/plain" == type) {
            var sharedText = intent.getStringExtra(Intent.EXTRA_TEXT) ?: ""
            if (sharedText.isEmpty()) {
                sharedText = intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""
            }
            if (sharedText.isEmpty() && intent.clipData != null && intent.clipData!!.itemCount > 0) {
                sharedText = intent.clipData!!.getItemAt(0).text?.toString() ?: ""
            }
            val videoId = extractYouTubeVideoId(sharedText)
            if (videoId != null) {
                pendingSharedVideoId = videoId
                Toast.makeText(this, "Capturing YouTube Video into Recall...", Toast.LENGTH_SHORT).show()
                val targetUrl = "$APP_ASSET_URL?v=$videoId&text=${Uri.encode(sharedText)}"

                val script = "if (window.autoIntakeSharedVideo) { window.autoIntakeSharedVideo('$videoId'); } else if (window.openReaderForVideo) { window.openReaderForVideo('$videoId'); }"
                binding.webView.evaluateJavascript(script) { res ->
                    if (res == null || res == "null") {
                        binding.webView.loadUrl(targetUrl)
                    }
                }
            }
        } else if (Intent.ACTION_VIEW == action) {
            val dataUri = intent.dataString ?: ""
            val videoId = extractYouTubeVideoId(dataUri)
            if (videoId != null) {
                pendingSharedVideoId = videoId
                val targetUrl = "$APP_ASSET_URL?v=$videoId"

                val script = "if (window.autoIntakeSharedVideo) { window.autoIntakeSharedVideo('$videoId'); } else if (window.openReaderForVideo) { window.openReaderForVideo('$videoId'); }"
                binding.webView.evaluateJavascript(script) { res ->
                    if (res == null || res == "null") {
                        binding.webView.loadUrl(targetUrl)
                    }
                }
            }
        }
    }

    private fun extractYouTubeVideoId(text: String): String? {
        val pattern = "(?:youtu\\.be/|youtube\\.com/(?:embed/|v/|watch\\?v=|watch\\?.+&v=|shorts/|live/)|[?&]v=)([\\w-]{11})"
        val matcher = Pattern.compile(pattern).matcher(text)
        return if (matcher.find()) {
            matcher.group(1)
        } else null
    }
}
