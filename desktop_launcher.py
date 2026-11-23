import os
import sys
import time
import socket
import threading
import webbrowser
from pathlib import Path

# When packaged with PyInstaller, ensure sys.path includes the bundle root
if getattr(sys, "frozen", False):
    bundle_dir = Path(sys._MEIPASS)
    exe_dir = Path(sys.executable).resolve().parent
    os.chdir(exe_dir)
else:
    bundle_dir = Path(__file__).resolve().parent
    exe_dir = bundle_dir

sys.path.insert(0, str(bundle_dir))
sys.path.insert(0, str(exe_dir))

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

def run_server(port: int):
    import uvicorn
    from backend.app.main import app
    from backend.app.database import init_db

    init_db()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")

def wait_and_open_browser(url: str, port: int):
    import urllib.request
    max_retries = 30
    for _ in range(max_retries):
        time.sleep(0.4)
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1) as resp:
                if resp.status == 200:
                    break
        except Exception:
            pass

    time.sleep(0.5)
    print(f"\n[YouTube Recall] Server active. Opening default web browser to {url} ...")
    webbrowser.open(url)

def main():
    print("=" * 64)
    print("        YouTube Recall — Editorial AI Knowledge Engine")
    print("=" * 64)

    port = 8000
    if is_port_in_use(port):
        # Check if it's already YouTube Recall running
        import urllib.request
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1) as resp:
                if resp.status == 200:
                    print(f"✓ Detected existing YouTube Recall server running on port {port}.")
                    webbrowser.open(f"http://localhost:{port}")
                    print("Opening browser. Press Enter to exit this launcher...")
                    input()
                    return
        except Exception:
            port = find_available_port(8001)

    url = f"http://localhost:{port}"
    print(f"Starting local server at: {url}")
    print(f"Database location:        {exe_dir / 'recall.db'}")
    print("-" * 64)
    print("Keep this window open while using YouTube Recall.")
    print("Press Ctrl+C to stop the application.")
    print("=" * 64)

    # Launch browser in separate daemon thread
    browser_thread = threading.Thread(target=wait_and_open_browser, args=(url, port), daemon=True)
    browser_thread.start()

    # Run Uvicorn in main thread
    try:
        run_server(port)
    except KeyboardInterrupt:
        print("\n[YouTube Recall] Shutting down server gracefully. Goodbye!")

if __name__ == "__main__":
    main()

