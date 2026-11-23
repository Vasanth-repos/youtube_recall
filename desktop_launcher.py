import os
import sys
import time
import socket
import logging
import threading
import subprocess
from pathlib import Path

# In windowed GUI mode (console=False in PyInstaller), sys.stdout and sys.stderr are None.
# Redirect them to prevent 'NoneType object has no attribute isatty' in uvicorn.
class StreamToLogger:
    def __init__(self, log_fn):
        self.log_fn = log_fn
        self.buffer = ""

    def write(self, s):
        if not s:
            return
        self.buffer += s
        if "\n" in self.buffer:
            lines = self.buffer.split("\n")
            for line in lines[:-1]:
                if line.strip():
                    self.log_fn(line.strip())
            self.buffer = lines[-1]

    def flush(self):
        if self.buffer.strip():
            self.log_fn(self.buffer.strip())
            self.buffer = ""

    def isatty(self):
        return False

# When packaged with PyInstaller, ensure paths include bundle and exe roots
if getattr(sys, "frozen", False):
    bundle_dir = Path(sys._MEIPASS)
    exe_dir = Path(sys.executable).resolve().parent
    os.chdir(exe_dir)
else:
    bundle_dir = Path(__file__).resolve().parent
    exe_dir = bundle_dir

sys.path.insert(0, str(bundle_dir))
sys.path.insert(0, str(exe_dir))

# Setup logging to file so errors are never lost in GUI mode
log_file = exe_dir / "youtube_recall.log"
logging.basicConfig(
    filename=str(log_file),
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("DesktopLauncher")

# Attach streams to file logger if running in windowed mode
if sys.stdout is None:
    sys.stdout = StreamToLogger(logger.info)
if sys.stderr is None:
    sys.stderr = StreamToLogger(logger.error)

server_instance = None
server_thread = None

def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0

def find_available_port(start_port: int = 8000) -> int:
    port = start_port
    while port < start_port + 100:
        if not is_port_in_use(port):
            return port
        port += 1
    return start_port

def start_backend_server(port: int):
    """Starts the FastAPI backend inside a background daemon thread."""
    global server_instance
    import uvicorn
    from backend.app.main import app
    from backend.app.database import init_db

    try:
        init_db()
        config = uvicorn.Config(
            app=app,
            host="127.0.0.1",
            port=port,
            log_level="warning",
            log_config=None,
            loop="asyncio"
        )
        server_instance = uvicorn.Server(config)
        server_instance.run()
    except Exception as e:
        logger.error(f"Uvicorn server error: {e}", exc_info=True)

def wait_for_server(port: int, max_retries: int = 40) -> bool:
    import urllib.request
    for _ in range(max_retries):
        time.sleep(0.25)
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            pass
    return False

def launch_native_application_window(url: str):
    """
    Renders YouTube Recall as a true standalone desktop application window,
    avoiding standard browser tabs and address bars.
    """
    # 1. Primary: pywebview native WinForms/WPF WebView2 Desktop Window
    try:
        import webview
        logger.info("Launching native desktop window with pywebview...")
        window = webview.create_window(
            title="YouTube Recall",
            url=url,
            width=1340,
            height=880,
            min_size=(980, 640),
            background_color="#0a0a0c",
            confirm_close=False,
            easy_drag=True
        )
        # webview.start blocks until the user closes the window
        webview.start(debug=False)
        logger.info("Native application window closed by user.")
        return True
    except Exception as e:
        logger.warning(f"pywebview window initialization notice: {e}. Falling back to Edge App Mode...")

    # 2. Secondary: Microsoft Edge Standalone App Window (--app mode)
    # Native to Windows 10/11, provides a chromeless application window with no tabs or URL bar
    edge_paths = [
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%LocalAppData%\Microsoft\Edge\Application\msedge.exe"),
        "msedge.exe"
    ]
    for ep in edge_paths:
        if os.path.exists(ep) or ep == "msedge.exe":
            try:
                cmd = [
                    ep,
                    f"--app={url}",
                    "--window-size=1340,880",
                    "--window-position=center",
                    f"--user-data-dir={exe_dir / '.recall_app_profile'}"
                ]
                logger.info(f"Launching standalone window via Edge App Mode: {ep}")
                proc = subprocess.Popen(cmd)
                proc.wait() # Block until window is closed
                return True
            except Exception as e:
                logger.warning(f"Edge App Mode launch error with {ep}: {e}")
                continue

    # 3. Tertiary fallback: Open default browser if no native webview is available
    import webbrowser
    logger.info("Opening default browser as fallback...")
    webbrowser.open(url)
    return True

def main():
    logger.info("Initializing YouTube Recall Desktop Application...")
    port = 8000
    
    # Check if a YouTube Recall server is already active on port 8000
    if is_port_in_use(port):
        import urllib.request
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1) as resp:
                if resp.status == 200:
                    logger.info(f"Connected to existing YouTube Recall backend on port {port}.")
                    launch_native_application_window(f"http://localhost:{port}")
                    return
        except Exception:
            port = find_available_port(8001)

    url = f"http://localhost:{port}"
    logger.info(f"Starting background server on: {url}")

    # Launch server in background thread
    global server_thread
    server_thread = threading.Thread(target=start_backend_server, args=(port,), daemon=True)
    server_thread.start()

    # Wait until server is healthy
    if not wait_for_server(port):
        logger.error(f"Server failed to start within timeout on port {port}.")
        return

    # Launch Native Desktop Application Window on Main Thread
    launch_native_application_window(url)

    # When native window closes, stop the backend server gracefully
    global server_instance
    if server_instance:
        server_instance.should_exit = True
    logger.info("Application closed cleanly.")

if __name__ == "__main__":
    main()
