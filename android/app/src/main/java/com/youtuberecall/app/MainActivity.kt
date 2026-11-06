package com.youtuberecall.app

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.view.LayoutInflater
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
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.youtuberecall.app.databinding.ActivityMainBinding
import java.util.regex.Pattern

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val PREFS_NAME = "recall_prefs"
    private val KEY_SERVER_URL = "server_url"
    private val DEFAULT_SERVER_URL = "http://192.168.1.4:8000"
    val APP_ASSET_URL = "https://appassets.androidplatform.net/assets/index.html"

    var activeServerUrl: String = DEFAULT_SERVER_URL
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

        loadSavedServerUrl()
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

    private fun loadSavedServerUrl() {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        activeServerUrl = prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL) ?: DEFAULT_SERVER_URL
    }

    private fun saveServerUrl(url: String) {
        var cleanUrl = url.trim()
        if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
            cleanUrl = "http://$cleanUrl"
        }
        if (cleanUrl.endsWith("/")) {
            cleanUrl = cleanUrl.substring(0, cleanUrl.length - 1)
        }
        activeServerUrl = cleanUrl
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SERVER_URL, cleanUrl)
            .apply()
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

                    // Keep local app assets and backend endpoints inside WebView
                    if (url.startsWith("https://appassets.androidplatform.net") ||
                        url.startsWith(activeServerUrl) ||
                        url.startsWith("http://localhost") ||
                        url.startsWith("http://127.0.0.1") ||
                        url.startsWith("http://10.0.2.2") ||
                        url.startsWith("http://192.168.")) {
                        return false
                    }

                    // Open external links (like YouTube watch links) in external browser/YouTube app
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
                    binding.offlineContainer.visibility = View.GONE
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
                            // Fallback to bundled local asset app shell
                            Toast.makeText(this@MainActivity, "Server offline. Loading local offline mode...", Toast.LENGTH_SHORT).show()
                            view?.loadUrl(APP_ASSET_URL)
                        } else {
                            binding.offlineContainer.visibility = View.VISIBLE
                            binding.swipeRefresh.visibility = View.GONE
                            binding.tvOfflineMessage.text = getString(R.string.offline_msg, activeServerUrl)
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
        val base = if (activeServerUrl.isNotEmpty()) activeServerUrl else APP_ASSET_URL
        val targetUrl = pendingSharedVideoId?.let { "$base/?v=$it" } ?: base
        binding.webView.loadUrl(targetUrl)
    }

    private fun setupListeners() {
        // Native Swipe-to-refresh
        binding.swipeRefresh.setOnRefreshListener {
            binding.webView.reload()
        }
        binding.swipeRefresh.setColorSchemeResources(R.color.amber_accent)
        binding.swipeRefresh.setProgressBackgroundColorSchemeResource(R.color.obsidian_card)

        // Top Server Settings Cog
        binding.btnServerSettings.setOnClickListener {
            showServerUrlDialog()
        }

        // Retry & Reconfigure buttons on offline screen
        binding.btnRetry.setOnClickListener {
            binding.offlineContainer.visibility = View.GONE
            binding.progressBar.visibility = View.VISIBLE
            loadApp()
        }

        binding.btnChangeIp.setOnClickListener {
            showServerUrlDialog()
        }
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
            val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT) ?: ""
            val videoId = extractYouTubeVideoId(sharedText)
            if (videoId != null) {
                pendingSharedVideoId = videoId
                Toast.makeText(this, "Capturing YouTube Video into Recall...", Toast.LENGTH_SHORT).show()
                val base = if (activeServerUrl.isNotEmpty()) activeServerUrl else APP_ASSET_URL
                val targetUrl = "$base/?v=$videoId&text=${Uri.encode(sharedText)}"
                binding.webView.loadUrl(targetUrl)
            }
        } else if (Intent.ACTION_VIEW == action) {
            val dataUri = intent.dataString ?: ""
            val videoId = extractYouTubeVideoId(dataUri)
            if (videoId != null) {
                pendingSharedVideoId = videoId
                val base = if (activeServerUrl.isNotEmpty()) activeServerUrl else APP_ASSET_URL
                val targetUrl = "$base/?v=$videoId"
                binding.webView.loadUrl(targetUrl)
            }
        }
    }

    private fun extractYouTubeVideoId(text: String): String? {
        val pattern = "(?:youtu\\.be/|youtube\\.com/(?:embed/|v/|watch\\?v=|watch\\?.+&v=|shorts/|live/))([\\w-]{11})"
        val matcher = Pattern.compile(pattern).matcher(text)
        return if (matcher.find()) {
            matcher.group(1)
        } else null
    }

    fun showServerUrlDialog() {
        val dialogView = LayoutInflater.from(this).inflate(R.layout.dialog_server_url, null)
        val etUrl = dialogView.findViewById<EditText>(R.id.etServerUrl)
        val btnPresetLan = dialogView.findViewById<Button>(R.id.btnPresetLan)
        val btnPresetEmulator = dialogView.findViewById<Button>(R.id.btnPresetEmulator)

        etUrl.setText(activeServerUrl)

        btnPresetLan.setOnClickListener {
            etUrl.setText("http://192.168.1.4:8000")
        }

        btnPresetEmulator.setOnClickListener {
            etUrl.setText("http://10.0.2.2:8000")
        }

        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.server_url_dialog_title)
            .setView(dialogView)
            .setPositiveButton("Connect") { _, _ ->
                val newUrl = etUrl.text.toString().trim()
                if (newUrl.isNotEmpty()) {
                    saveServerUrl(newUrl)
                    Toast.makeText(this, "Connecting to $activeServerUrl", Toast.LENGTH_SHORT).show()
                    loadApp()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}
