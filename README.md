<p align="center">
  <img src="logo_readme.png" alt="remo logo" width="240">
</p>

<p align="center">
  <b>A lightweight, low-latency, offline-capable remote control for your Windows desktop.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows-0078D6?style=flat-square&logo=windows" alt="Platform Support">
  <img src="https://img.shields.io/badge/UI-Neumorphic-EBECF0?style=flat-square" alt="UI Theme">
  <img src="https://img.shields.io/badge/Python-3.9%2B-3776AB?style=flat-square&logo=python" alt="Python Version">
</p>

---

## 🌟 Key Features

*   **⚡ Ultra-Low Latency**: Control your PC over WebSockets instantly with zero lag.
*   **🖱️ Hybrid Trackpad & D-Pad**: 
    *   **D-Pad Mode**: A circular neumorphic clickpad for focus navigation.
    *   **Trackpad Mode**: Smooth cursor control, left/right clicks, and two-finger tap shortcuts.
    *   **Hybrid Dragging**: Touch any blank space on the D-pad container to move the cursor seamlessly!
*   **🎙️ Smart App Launcher (Voice & Typing)**:
    *   Say `"open <app>"` using Voice typing or type it in the keyboard bar and press Enter to launch apps instantly.
    *   **Intelligent Preferences**: Launches the **native desktop app** (e.g. Spotify) if installed. For web services (YouTube, Netflix, NetMirror, Disney+, Twitch, Crunchyroll, Hotstar, Prime Video), it opens a **standalone borderless application window** (PWA mode) via Chrome/Edge.
*   **🎹 Morphing In-Place Keyboard**: An overlay keyboard that scales dynamically from the button location to type directly on your PC.
*   **📺 Connected App Dock**: Automatically scans open media applications on your desktop and places floating logos in a responsive grid. Click them to switch focus or minimize them instantly.
*   **🎨 Custom Neumorphic Modals**: Beautiful, styled popups replace default browser alert/confirm dialogues.
*   **📥 Native System Tray Integration**: Minimizes cleanly to the tray bar.

---

## 🚦 System Tray Status Guide

When running, `remo` sits quietly in your taskbar system tray:

*   <img src="tray_disconnected.png" width="16" valign="middle"> **Disconnected (Red Dot)**: The server is running and waiting for a remote connection.
*   <img src="tray_connected.png" width="16" valign="middle"> **Connected (Green Dot)**: One or more mobile remotes are connected and active.

> 💡 **Note**: Clicking the close `[X]` button on the control panel hides it to the system tray. To shut down the server, right-click the tray icon and select **Stop Server & Exit**.

---

## 🚀 One-Click Setup (Windows)

1. **Download/Clone** this repository to your PC.
2. Double-click the **`remo.vbs`** file.
    *   *This runs Python in background mode, automatically resolves and installs any missing libraries (`Pillow`, `qrcode`, `websockets`, `cryptography`, `pystray`) silently in the background, and opens the server GUI without any terminal windows!*
3. A styled dark Control Panel will open showing a **QR Code**.
4. Scan the QR code using your phone's camera (both devices must be on the same Wi-Fi network).
5. **Start with Windows**: Toggle the checkbox in the Control Panel GUI to register/unregister the app in your Windows Startup registry automatically!

---

## 🛠️ Manual Installation

If you prefer to set up your environment manually:

1. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Start the server:
   ```bash
   python remo_desktop.py
   ```

---

## 📱 Voice & Keyboard Command Reference

Open apps instantly by typing or saying:

| Command | Action on PC |
| :--- | :--- |
| `open youtube` | Launches YouTube in a borderless PWA app window |
| `open netmirror` | Launches NetMirror in a borderless PWA app window |
| `open spotify` | Launches native Spotify desktop app (falls back to Web Player) |
| `open vlc` | Launches local VLC media player |
| `open chrome` | Opens Google Chrome browser |
| `open calculator` | Opens the Windows Calculator |
| `open notepad` | Opens Windows Notepad |
