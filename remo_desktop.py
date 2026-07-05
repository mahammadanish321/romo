import os
import sys
import subprocess

def verify_dependencies():
    required = ["PIL", "qrcode", "websockets", "cryptography", "pystray"]
    missing = []
    
    try:
        import PIL
    except ImportError:
        missing.append("Pillow")
        
    try:
        import qrcode
    except ImportError:
        missing.append("qrcode")
        
    try:
        import websockets
    except ImportError:
        missing.append("websockets")
        
    try:
        import cryptography
    except ImportError:
        missing.append("cryptography")
        
    try:
        import pystray
    except ImportError:
        missing.append("pystray")
        
    if missing:
        try:
            # Silent pip install (CREATE_NO_WINDOW = 0x08000000 on Windows)
            creation_flags = 0x08000000 if sys.platform == 'win32' else 0
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install"] + missing,
                creationflags=creation_flags
            )
        except Exception as e:
            # Fallback Tkinter dialog on failure
            import tkinter as tk
            from tkinter import messagebox
            r = tk.Tk()
            r.withdraw()
            messagebox.showerror(
                "Dependency Installation Error",
                f"Failed to install dependencies automatically:\n{', '.join(missing)}\n\nError: {e}\n\nPlease install manually using requirements.txt."
            )
            sys.exit(1)

# Silently check and resolve dependencies on start
verify_dependencies()

import json
import socket
import asyncio
import threading
import mimetypes
import ctypes
import tkinter as tk
from tkinter import messagebox
import qrcode
from PIL import Image, ImageTk
import websockets
from websockets.http11 import Response
from websockets.datastructures import Headers

# Initialize mimetypes
mimetypes.init()

# Safe pystray import for system tray icon support
try:
    import pystray
    HAS_PYSTRAY = True
except ImportError:
    HAS_PYSTRAY = False

# Global variables
connected_clients = set()
root = None
status_label = None
tray_icon = None

# Windows ctypes structures and constants
class POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

# Mouse event constants
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010
MOUSEEVENTF_WHEEL = 0x0800

# Keyboard event constants
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004

# Virtual Key Codes (VK)
VK_CODES = {
    'up': 0x26,
    'down': 0x28,
    'left': 0x25,
    'right': 0x27,
    'enter': 0x0D,
    'backspace': 0x08,
    'escape': 0x1B,
    'space': 0x20,
    'volume_up': 0xAF,
    'volume_down': 0xAE,
    'mute': 0xAD,
    'play_pause': 0xB3,
    'f': 0x46,
    'tab': 0x09,
}

VK_MENU = 0x12  # Alt
VK_F4 = 0x73    # F4

# Declare ctypes signatures for mouse functions to ensure 64-bit safety
ctypes.windll.user32.SetCursorPos.argtypes = [ctypes.c_int, ctypes.c_int]
ctypes.windll.user32.SetCursorPos.restype = ctypes.c_bool

ctypes.windll.user32.GetCursorPos.argtypes = [ctypes.c_void_p]
ctypes.windll.user32.GetCursorPos.restype = ctypes.c_bool

ctypes.windll.user32.mouse_event.argtypes = [
    ctypes.c_uint,   # dwFlags
    ctypes.c_uint,   # dx
    ctypes.c_uint,   # dy
    ctypes.c_int,    # dwData (signed int for scroll delta)
    ctypes.c_void_p  # dwExtraInfo
]
ctypes.windll.user32.mouse_event.restype = None

def move_mouse(dx, dy):
    pt = POINT()
    ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
    # Cast to integer just in case float diff is sent
    ctypes.windll.user32.SetCursorPos(pt.x + int(dx), pt.y + int(dy))

def click_mouse(button):
    if button == 'left':
        ctypes.windll.user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, None)
        ctypes.windll.user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, None)
    elif button == 'right':
        ctypes.windll.user32.mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, None)
        ctypes.windll.user32.mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, None)

def scroll_mouse(delta):
    # delta is positive for scroll up, negative for scroll down
    user32 = ctypes.windll.user32
    
    # 1. Store original cursor position
    pt = POINT()
    user32.GetCursorPos(ctypes.byref(pt))
    
    # 2. Get screen dimensions
    width = user32.GetSystemMetrics(0) # SM_CXSCREEN
    
    # 3. Temporarily move cursor to the far right edge (scrollbar area) to prevent video player hover triggers
    user32.SetCursorPos(width - 15, pt.y)
    
    # 4. Trigger scroll
    user32.mouse_event(MOUSEEVENTF_WHEEL, 0, 0, int(delta), None)
    
    # 5. Restore cursor instantly
    user32.SetCursorPos(pt.x, pt.y)

def press_key(key, repeat=1):
    if key == 'lock':
        ctypes.windll.user32.LockWorkStation()
        return

    if key == 'shift_tab':
        VK_SHIFT = 0x10
        VK_TAB = 0x09
        for _ in range(repeat):
            ctypes.windll.user32.keybd_event(VK_SHIFT, 0, 0, 0)
            ctypes.windll.user32.keybd_event(VK_TAB, 0, 0, 0)
            ctypes.windll.user32.keybd_event(VK_TAB, 0, KEYEVENTF_KEYUP, 0)
            ctypes.windll.user32.keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, 0)
        return

    if key == 'back':
        # Alt + Left Arrow sequence (Universal Back command in Windows)
        VK_MENU = 0x12  # Alt
        VK_LEFT = 0x25  # Left
        for _ in range(repeat):
            ctypes.windll.user32.keybd_event(VK_MENU, 0, 0, 0)
            ctypes.windll.user32.keybd_event(VK_LEFT, 0, 0, 0)
            ctypes.windll.user32.keybd_event(VK_LEFT, 0, KEYEVENTF_KEYUP, 0)
            ctypes.windll.user32.keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0)
        return

    vk = VK_CODES.get(key)
    if vk:
        for _ in range(repeat):
            ctypes.windll.user32.keybd_event(vk, 0, 0, 0)
            ctypes.windll.user32.keybd_event(vk, 0, KEYEVENTF_KEYUP, 0)

def close_window():
    # Alt + F4 key sequence
    ctypes.windll.user32.keybd_event(VK_MENU, 0, 0, 0)
    ctypes.windll.user32.keybd_event(VK_F4, 0, 0, 0)
    ctypes.windll.user32.keybd_event(VK_F4, 0, KEYEVENTF_KEYUP, 0)
    ctypes.windll.user32.keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0)

def type_text(text):
    for char in text:
        val = ord(char)
        ctypes.windll.user32.keybd_event(0, val, KEYEVENTF_UNICODE, 0)
        ctypes.windll.user32.keybd_event(0, val, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, 0)

# Global tracker for app launcher cooldowns to prevent double-opening
last_launch_time = {}

def launch_app(app_name):
    import time
    app_name = app_name.lower().strip()
    
    # Cooldown check: prevent duplicate launches within 2.5 seconds
    now = time.time()
    if app_name in last_launch_time:
        if now - last_launch_time[app_name] < 2.5:
            print(f"[Launcher] Ignored duplicate launch for '{app_name}' (cooldown active)")
            return False
            
    last_launch_time[app_name] = now
    
    # URL mappings for streaming sites / PWAs
    urls = {
        "youtube": "https://www.youtube.com",
        "netflix": "https://www.netflix.com",
        "netmirror": "https://netmirror.app",
        "disney": "https://www.disneyplus.com",
        "hotstar": "https://www.hotstar.com",
        "twitch": "https://www.twitch.tv",
        "crunchyroll": "https://www.crunchyroll.com",
        "prime video": "https://www.primevideo.com",
        "primevideo": "https://www.primevideo.com"
    }

    # Browser path detection for standalone app mode (PWA)
    def find_pwa_browser():
        paths = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
        ]
        for path in paths:
            if os.path.exists(path):
                return path
        return None

    # Handle Spotify (prefer native app over PWA browser window)
    if app_name == "spotify":
        # 1. Try Spotify URI protocol (launches desktop/Store app)
        try:
            os.startfile("spotify:")
            return True
        except Exception:
            pass
        # 2. Try AppData roaming path
        appdata = os.getenv("APPDATA")
        if appdata:
            local_path = os.path.join(appdata, "Spotify", "Spotify.exe")
            if os.path.exists(local_path):
                try:
                    os.startfile(local_path)
                    return True
                except Exception:
                    pass
        # 3. Fallback to Spotify PWA/Browser URL
        pwa_url = "https://open.spotify.com"
        browser = find_pwa_browser()
        if browser:
            import subprocess
            subprocess.Popen([browser, f"--app={pwa_url}"])
            return True
        else:
            import webbrowser
            webbrowser.open(pwa_url)
            return True

    # Handle standard PWAs (launch in borderless browser app mode)
    if app_name in urls:
        url = urls[app_name]
        browser = find_pwa_browser()
        if browser:
            import subprocess
            subprocess.Popen([browser, f"--app={url}"])
            return True
        else:
            import webbrowser
            webbrowser.open(url)
            return True

    # Local app launchers
    local_apps = {
        "vlc": [
            r"C:\Program Files\VideoLAN\VLC\vlc.exe",
            r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe",
            "vlc.exe",
            "vlc"
        ],
        "chrome": ["chrome.exe", "chrome"],
        "edge": ["msedge.exe", "microsoft-edge:"],
        "calculator": ["calc.exe"],
        "notepad": ["notepad.exe"]
    }
    
    if app_name in local_apps:
        for cmd in local_apps[app_name]:
            try:
                os.startfile(cmd)
                return True
            except Exception:
                continue
    
    # Generic fallback: try to run it via startfile/webbrowser
    try:
        os.startfile(app_name)
        return True
    except Exception:
        try:
            import webbrowser
            webbrowser.open(f"https://www.google.com/search?q={app_name}")
            return True
        except Exception:
            return False

# ----------------------------------------------------
# NETWORK LOCAL IP DETECTION
# ----------------------------------------------------
def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Connect to a dummy address (doesn't send packets, just extracts adapter IP)
        s.connect(('8.8.8.8', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

# ----------------------------------------------------
# WEBSOCKET & STATIC WEB SERVER HANDLERS
# ----------------------------------------------------
async def process_request(connection, request):
    path = request.path
    headers = request.headers

    # If connection is upgrading to WebSocket, let websockets library handle it
    if headers.get("Upgrade", "").lower() == "websocket":
        return None

    # Handle static HTTP requests (serving index.html, style.css, app.js)
    # Clean the path
    file_path = path.split('?')[0].strip('/')
    if not file_path:
        file_path = 'index.html'

    base_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mobile')
    full_path = os.path.abspath(os.path.join(base_dir, file_path))

    # Security check: prevent directory traversal
    if not full_path.startswith(base_dir):
        return Response(
            status_code=403,
            reason_phrase="Forbidden",
            headers=Headers([("Content-Type", "text/plain")]),
            body=b"Forbidden"
        )

    if os.path.exists(full_path) and os.path.isfile(full_path):
        mime_type, _ = mimetypes.guess_type(full_path)
        mime_type = mime_type or "application/octet-stream"
        
        try:
            with open(full_path, "rb") as f:
                content = f.read()
            return Response(
                status_code=200,
                reason_phrase="OK",
                headers=Headers([("Content-Type", mime_type)]),
                body=content
            )
        except Exception as e:
            return Response(
                status_code=500,
                reason_phrase="Internal Server Error",
                headers=Headers([("Content-Type", "text/plain")]),
                body=f"Internal Server Error: {e}".encode()
            )
    else:
        return Response(
            status_code=404,
            reason_phrase="Not Found",
            headers=Headers([("Content-Type", "text/plain")]),
            body=b"Not Found"
        )

# ----------------------------------------------------
# ACTIVE MEDIA APP SCANNING & FOCUS MANAGEMENT
# ----------------------------------------------------
def clean_window_title(title):
    # Strip common browser suffixes
    suffixes = [
        " - Google Chrome",
        " - Microsoft Edge",
        " - Mozilla Firefox",
        " - Opera",
        " - Brave",
        " - VLC media player",
        " - Spotify Free",
        " - Spotify Premium",
        " - Spotify"
    ]
    cleaned = title
    for suffix in suffixes:
        if cleaned.endswith(suffix):
            cleaned = cleaned[:-len(suffix)]
            break
            
    # Clean up multi-hyphen titles to extract the main website/app name
    parts = [p.strip() for p in cleaned.split(" - ") if p.strip()]
    if parts:
        # Check if the last part is the site brand (e.g., "Netflix" in "Movie - Netflix")
        # Otherwise, take the first part (e.g., "NetMirror" in "NetMirror - Home")
        return parts[0]
    return cleaned

def get_open_media_apps():
    import subprocess
    
    supported_media = {
        "youtube": {"name": "YouTube", "logo": "youtube"},
        "netflix": {"name": "Netflix", "logo": "netflix"},
        "spotify": {"name": "Spotify", "logo": "spotify"},
        "vlc": {"name": "VLC", "logo": "vlc"},
        "prime video": {"name": "Prime Video", "logo": "primevideo"},
        "primevideo": {"name": "Prime Video", "logo": "primevideo"},
        "disney": {"name": "Disney+", "logo": "disney"},
        "hotstar": {"name": "Hotstar", "logo": "hotstar"},
        "twitch": {"name": "Twitch", "logo": "twitch"},
        "crunchyroll": {"name": "Crunchyroll", "logo": "crunchyroll"},
        "netmirror": {"name": "NetMirror", "logo": "netmirror"},
        "net mirror": {"name": "NetMirror", "logo": "netmirror"},
        "net-mirror": {"name": "NetMirror", "logo": "netmirror"},
        "netmirro": {"name": "NetMirror", "logo": "netmirror"}
    }
    
    ps_script = r'''
$windows = @()
Get-Process | ForEach-Object {
    if ($_.MainWindowTitle -and $_.MainWindowTitle -ne '') {
        $windows += [PSCustomObject]@{
            pid_val = $_.Id
            name = $_.ProcessName
            title = $_.MainWindowTitle
            hwnd = [int64]$_.MainWindowHandle
        }
    }
}
$windows | ConvertTo-Json -Compress
'''

    open_apps = []
    added_logos = set()
    added_pids = set()

    try:
        user32 = ctypes.windll.user32
        from ctypes import wintypes
        user32.GetForegroundWindow.argtypes = []
        user32.GetForegroundWindow.restype = ctypes.c_void_p
        active_hwnd = user32.GetForegroundWindow()
        
        # Use CREATE_NO_WINDOW (0x08000000) flag to prevent black command window flashing
        result = subprocess.run(
            ['powershell', '-NoProfile', '-Command', ps_script],
            capture_output=True, text=True, timeout=8,
            creationflags=0x08000000
        )
        if result.returncode != 0 or not result.stdout.strip():
            return open_apps
        
        data = json.loads(result.stdout.strip())
        # PowerShell returns single object (not array) if only 1 result
        if isinstance(data, dict):
            data = [data]
        
        for w in data:
            title = w.get('title', '')
            hwnd = w.get('hwnd', 0)
            pid = w.get('pid_val', 0)
            title_lower = title.lower()
            
            # Ignore system shells and our own server
            ignore_titles = ["settings", "program manager", "start", "microsoft store", "windows input experience", "remo server"]
            if title_lower in ignore_titles:
                continue
            
            # Check if it matches a pre-defined media keyword
            matched = False
            for keyword, app_info in supported_media.items():
                if keyword in title_lower:
                    logo_type = app_info["logo"]
                    if logo_type not in added_logos:
                        # Determine if this window is currently in the foreground
                        is_active = False
                        if active_hwnd and hwnd:
                            is_active = (int(hwnd) == int(active_hwnd))
                            
                        open_apps.append({
                            "hwnd": hwnd,
                            "name": app_info["name"],
                            "logo": logo_type,
                            "letter": "",
                            "active": is_active
                        })
                        added_logos.add(logo_type)
                    matched = True
                    break
            
            # Only show matched media apps, skip everything else
    except Exception as e:
        print(f"Error scanning windows: {e}")
    
    return open_apps

async def watch_open_apps(websocket):
    last_apps = None
    first_scan = True
    try:
        while True:
            apps = get_open_media_apps()
            if first_scan:
                print(f"[App Dock] First scan found {len(apps)} windows: {[a['name'] for a in apps]}")
                first_scan = False
            current_state = [(a["hwnd"], a["logo"], a.get("active", False)) for a in apps]
            if last_apps != current_state:
                last_apps = current_state
                payload = {
                    "type": "open_apps",
                    "apps": [
                        {"hwnd": a["hwnd"], "logo": a["logo"], "name": a["name"], "letter": a.get("letter", ""), "active": a.get("active", False)}
                        for a in apps
                    ]
                }
                await websocket.send(json.dumps(payload))
            await asyncio.sleep(2.0)
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"Error in watch_open_apps: {e}")

async def ws_handler(websocket):
    print("Mobile remote connected")
    connected_clients.add(websocket)
    trigger_gui_update()

    # Start background task to watch open apps
    app_watcher_task = asyncio.create_task(watch_open_apps(websocket))

    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                msg_type = data.get('type')

                if msg_type == 'mouse_move':
                    dx = data.get('dx', 0)
                    dy = data.get('dy', 0)
                    move_mouse(dx, dy)
                    
                elif msg_type == 'mouse_click':
                    btn = data.get('button', 'left')
                    click_mouse(btn)
                    
                elif msg_type == 'mouse_scroll':
                    delta = data.get('delta', 0)
                    scroll_mouse(delta)
                    
                elif msg_type == 'key_press':
                    key = data.get('key')
                    repeat = data.get('repeat', 1)
                    press_key(key, repeat)
                    
                elif msg_type == 'type_text':
                    text = data.get('text', '')
                    # Intercept voice typing launcher commands (e.g., "open youtube")
                    text_clean = text.strip().lower()
                    if text_clean.startswith("open "):
                        target_app = text_clean[5:].strip()
                        if target_app:
                            launched = launch_app(target_app)
                            if launched:
                                await websocket.send(json.dumps({
                                    "type": "toast",
                                    "message": f"Opened {target_app.capitalize()} on PC",
                                    "status": "success"
                                }))
                                continue
                    type_text(text)
                    
                elif msg_type == 'launch_app':
                    app_name = data.get('name', '')
                    launched = launch_app(app_name)
                    if launched:
                        await websocket.send(json.dumps({
                            "type": "toast",
                            "message": f"Opened {app_name.capitalize()} on PC",
                            "status": "success"
                        }))
                    
                elif msg_type == 'close_window':
                    close_window()

                elif msg_type == 'activate_app':
                    hwnd = data.get('hwnd')
                    if hwnd:
                        user32 = ctypes.windll.user32
                        from ctypes import wintypes
                        
                        user32.IsWindow.argtypes = [wintypes.HWND]
                        user32.IsWindow.restype = wintypes.BOOL
                        
                        user32.IsIconic.argtypes = [wintypes.HWND]
                        user32.IsIconic.restype = wintypes.BOOL
                        
                        user32.GetForegroundWindow.argtypes = []
                        user32.GetForegroundWindow.restype = wintypes.HWND
                        
                        user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
                        user32.ShowWindow.restype = wintypes.BOOL
                        
                        user32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
                        user32.SetWindowPos.restype = wintypes.BOOL
                        
                        user32.SetForegroundWindow.argtypes = [wintypes.HWND]
                        user32.SetForegroundWindow.restype = wintypes.BOOL
 
                        if user32.IsWindow(hwnd):
                            active_hwnd = user32.GetForegroundWindow()
                            if hwnd == active_hwnd:
                                # Already in foreground -> Minimize it (SW_MINIMIZE = 6)
                                user32.ShowWindow(hwnd, 6)
                            else:
                                # Restore window if minimized
                                if user32.IsIconic(hwnd):
                                    user32.ShowWindow(hwnd, 9) # SW_RESTORE
                                else:
                                    user32.ShowWindow(hwnd, 5) # SW_SHOW
                                # Bring to front forcing focus
                                user32.SetWindowPos(hwnd, -1, 0, 0, 0, 0, 0x0001 | 0x0002) # HWND_TOPMOST
                                user32.SetWindowPos(hwnd, -2, 0, 0, 0, 0, 0x0001 | 0x0002) # HWND_NOTOPMOST
                                user32.SetForegroundWindow(hwnd)

            except Exception as e:
                print(f"Error executing command: {e}")
                
    except websockets.exceptions.ConnectionClosed:
        print("Mobile remote disconnected")
    finally:
        app_watcher_task.cancel()
        connected_clients.remove(websocket)
        trigger_gui_update()

# ----------------------------------------------------
# TKINTER GUI FUNCTIONS
# ----------------------------------------------------
def update_gui_status():
    if not status_label:
        return
    count = len(connected_clients)
    if count == 0:
        status_label.config(text="Status: Disconnected (Waiting for connection)", fg="#FF7675")
        if HAS_PYSTRAY and tray_icon:
            try:
                tray_icon.icon = Image.open("tray_disconnected.png")
            except Exception:
                pass
    else:
        status_label.config(text=f"Status: Connected ({count} remote{'s' if count > 1 else ''})", fg="#55E6C1")
        if HAS_PYSTRAY and tray_icon:
            try:
                tray_icon.icon = Image.open("tray_connected.png")
            except Exception:
                pass

def trigger_gui_update():
    # Safely queue updates to the Tkinter thread
    if root:
        root.after_idle(update_gui_status)

def build_gui(url):
    global root, status_label
    
    root = tk.Tk()
    root.title("remo - Desktop Remote Server")
    root.geometry("380x520")
    root.configure(bg="#1F242D")
    root.resizable(False, False)

    # Window close protocol: minimize to tray instead of quitting
    def on_closing():
        if HAS_PYSTRAY:
            root.withdraw()
        else:
            root.destroy()
    root.protocol("WM_DELETE_WINDOW", on_closing)

    # Header title Logo Image
    logo_img = None
    try:
        logo_img_raw = Image.open("logo_full.png")
        logo_img = ImageTk.PhotoImage(logo_img_raw)
        logo_label = tk.Label(root, image=logo_img, bg="#1F242D")
        logo_label.image = logo_img  # keep reference
        logo_label.pack(pady=(20, 5))
    except Exception:
        # Fallback to text
        title_label = tk.Label(
            root, text="remo server", font=("Segoe UI", 24, "bold"),
            bg="#1F242D", fg="#E6EAEE"
        )
        title_label.pack(pady=(20, 5))

    # Subtitle with IP address
    ip_label = tk.Label(
        root, text=f"URL: {url}", font=("Segoe UI", 12),
        bg="#1F242D", fg="#8A99AD"
    )
    ip_label.pack(pady=5)

    # Frame wrapper for QR Code (styled card)
    qr_frame = tk.Frame(root, bg="#282F3B", bd=2, relief="flat", padx=10, pady=10)
    qr_frame.pack(pady=15)

    # Generate QR Code image
    qr = qrcode.QRCode(version=1, box_size=5, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    
    # Render QR Code in Tkinter
    photo = ImageTk.PhotoImage(image=qr_img)
    qr_label = tk.Label(qr_frame, image=photo, bg="#282F3B")
    qr_label.image = photo  # keep reference
    qr_label.pack()

    # Instructions
    info_label = tk.Label(
        root, text="Scan QR code on your mobile browser\n(Must be on the same Wi-Fi network)",
        font=("Segoe UI", 9, "italic"), bg="#1F242D", fg="#8A99AD", justify="center"
    )
    info_label.pack(pady=5)

    # Connection Status
    status_label = tk.Label(
        root, text="Status: Disconnected (Waiting for connection)",
        font=("Segoe UI", 11, "bold"), bg="#1F242D", fg="#FF7675"
    )
    status_label.pack(pady=10)

    # Windows Startup registry helper functions
    import winreg
    
    def is_startup_enabled():
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_READ)
            try:
                winreg.QueryValueEx(key, "remo")
                winreg.CloseKey(key)
                return True
            except FileNotFoundError:
                winreg.CloseKey(key)
                return False
        except Exception:
            return False

    def toggle_startup():
        enabled = startup_var.get()
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
            if enabled:
                vbs_path = os.path.abspath("remo.vbs")
                cmd = f'wscript.exe "{vbs_path}"'
                winreg.SetValueEx(key, "remo", 0, winreg.REG_SZ, cmd)
            else:
                try:
                    winreg.DeleteValue(key, "remo")
                except FileNotFoundError:
                    pass
            winreg.CloseKey(key)
        except Exception as e:
            messagebox.showerror("Startup Error", f"Failed to set startup registry: {e}")

    startup_var = tk.BooleanVar(value=is_startup_enabled())
    
    # Startup toggle checkbutton
    startup_check = tk.Checkbutton(
        root, text="Start with Windows", variable=startup_var, command=toggle_startup,
        font=("Segoe UI", 10), bg="#1F242D", fg="#8A99AD", selectcolor="#282F3B",
        activebackground="#1F242D", activeforeground="#8A99AD", bd=0, highlightthickness=0,
        cursor="hand2"
    )
    startup_check.pack(pady=5)

    # Help note about system tray
    if HAS_PYSTRAY:
        tray_note = tk.Label(
            root, text="Note: Closing this window minimizes it to the tray.",
            font=("Segoe UI", 8), bg="#1F242D", fg="#5A697D"
        )
        tray_note.pack(pady=(0, 10))

    # Quit button
    quit_btn = tk.Button(
        root, text="Stop Server & Exit", font=("Segoe UI", 11, "bold"),
        bg="#C0392B", fg="white", activebackground="#E74C3C", activeforeground="white",
        bd=0, padx=24, pady=8, cursor="hand2", command=lambda: (
            tray_icon.stop() if (HAS_PYSTRAY and tray_icon) else None,
            root.destroy()
        )
    )
    quit_btn.pack(pady=5)

    # Hover animations for Quit Button
    def on_enter(e):
        quit_btn['background'] = '#D63031'
    def on_leave(e):
        quit_btn['background'] = '#C0392B'
    quit_btn.bind("<Enter>", on_enter)
    quit_btn.bind("<Leave>", on_leave)

    # Initial status call
    update_gui_status()
    root.mainloop()

def run_tray():
    global tray_icon
    if not HAS_PYSTRAY:
        return
        
    try:
        image_disconnected = Image.open("tray_disconnected.png")
    except Exception:
        # Fallback empty image if not generated
        image_disconnected = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        
    def on_exit(icon, item):
        icon.stop()
        if root:
            root.after(0, root.destroy)
            
    def on_show(icon, item):
        if root:
            root.after(0, lambda: (root.deiconify(), root.focus_force()))

    menu = pystray.Menu(
        pystray.MenuItem("Show Control Panel", on_show, default=True),
        pystray.MenuItem("Stop Server & Exit", on_exit)
    )
    
    tray_icon = pystray.Icon("remo", image_disconnected, "remo server", menu)
    tray_icon.run()

# ----------------------------------------------------
# SSL CERTIFICATE GENERATION & SECURE SETUP
# ----------------------------------------------------
def check_or_generate_certs():
    cert_file = "cert.pem"
    key_file = "key.pem"
    if not os.path.exists(cert_file) or not os.path.exists(key_file):
        print("Generating self-signed SSL certificate...")
        try:
            from datetime import datetime, timedelta, timezone
            from cryptography import x509
            from cryptography.x509.oid import NameOID
            from cryptography.hazmat.primitives import hashes
            from cryptography.hazmat.primitives.asymmetric import rsa
            from cryptography.hazmat.primitives import serialization
            
            # Generate a 2048-bit private RSA key
            private_key = rsa.generate_private_key(
                public_exponent=65537,
                key_size=2048,
            )
            
            # Create a self-signed certificate
            subject = issuer = x509.Name([
                x509.NameAttribute(NameOID.COMMON_NAME, "remo"),
            ])
            
            now = datetime.now(timezone.utc)
            cert = x509.CertificateBuilder().subject_name(
                subject
            ).issuer_name(
                issuer
            ).public_key(
                private_key.public_key()
            ).serial_number(
                x509.random_serial_number()
            ).not_valid_before(
                now - timedelta(days=1)
            ).not_valid_after(
                now + timedelta(days=5 * 365)  # Valid for 5 years
            ).add_extension(
                x509.SubjectAlternativeName([x509.DNSName("remo")]),
                critical=False,
            ).sign(private_key, hashes.SHA256())
            
            # Write private key
            with open(key_file, "wb") as f:
                f.write(
                    private_key.private_bytes(
                        encoding=serialization.Encoding.PEM,
                        format=serialization.PrivateFormat.TraditionalOpenSSL,
                        encryption_algorithm=serialization.NoEncryption(),
                    )
                )
                
            # Write certificate
            with open(cert_file, "wb") as f:
                f.write(
                    cert.public_bytes(serialization.Encoding.PEM)
                )
            print("SSL certificate generated successfully.")
            return True
        except Exception as e:
            print(f"Failed to generate SSL certificate: {e}")
            return False
    return True

def get_ssl_context():
    import ssl
    if check_or_generate_certs():
        try:
            ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ssl_context.load_cert_chain(certfile="cert.pem", keyfile="key.pem")
            return ssl_context
        except Exception as e:
            print(f"SSL context creation failed: {e}")
    return None

# ----------------------------------------------------
# MAIN EXECUTION ENTRY POINT
# ----------------------------------------------------
async def main_async(port, ssl_context):
    async with websockets.serve(
        ws_handler, 
        host="0.0.0.0", 
        port=port, 
        process_request=process_request,
        ssl=ssl_context
    ):
        await asyncio.Future()  # Keep server running forever

def start_async_server(loop, port, ssl_context):
    asyncio.set_event_loop(loop)
    loop.run_until_complete(main_async(port, ssl_context))

if __name__ == "__main__":
    ip = get_local_ip()
    port = 8000
    
    # Check/generate certs and load SSL Context
    ssl_context = get_ssl_context()
    protocol = "https" if ssl_context else "http"
    server_url = f"{protocol}://{ip}:{port}"
    print(f"Starting server on {server_url}")

    # Set up asyncio event loop
    loop = asyncio.new_event_loop()

    # Start WebSocket / HTTP server in a separate background daemon thread
    server_thread = threading.Thread(
        target=start_async_server, 
        args=(loop, port, ssl_context), 
        daemon=True
    )
    server_thread.start()

    # Start Windows System Tray thread if pystray is installed
    if HAS_PYSTRAY:
        tray_thread = threading.Thread(target=run_tray, daemon=True)
        tray_thread.start()

    # Launch Tkinter GUI on the main thread
    try:
        build_gui(server_url)
    except KeyboardInterrupt:
        print("Exiting...")
    finally:
        print("Server stopped.")
        sys.exit(0)
