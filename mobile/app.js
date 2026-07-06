// remo Remote - Client Logic

(function() {
    let socket = null;
    let reconnectTimeout = null;
    let isConnected = false;

    // Elements
    const statusIndicator = document.getElementById('connection-status');
    const toggleDpad = document.getElementById('toggle-dpad');
    const toggleTrackpad = document.getElementById('toggle-trackpad');
    const dpadPanel = document.getElementById('dpad-panel');
    const trackpadPanel = document.getElementById('trackpad-panel');
    const toggleSlider = document.querySelector('.toggle-slider');
    
    // Playback state toggle
    const btnPlayPause = document.getElementById('btn-play-pause');
    const iconPlay = btnPlayPause.querySelector('.icon-play');
    const iconPause = btnPlayPause.querySelector('.icon-pause');
    let isPlaying = false; // local state tracker

    // Mute toggle state
    const btnMute = document.getElementById('btn-mute');
    let isMuted = false;

    // Scroller toggle mode state (arrow vs scroll)
    const scrollerToggleBtn = document.getElementById('scroller-toggle-mode');
    const scrollerLabel = document.getElementById('scroller-label');
    let scrollerMode = 'arrows'; // 'arrows' or 'scroll'

    // Haptic feedback helper with premium presets
    const HAPTIC = {
        tick: [15],
        light: [30],
        medium: [50],
        heavy: [85],
        success: [30, 45, 30],
        warning: [80, 50, 80],
        error: [100, 60, 100, 60, 150]
    };

    function vibrate(typeOrDuration) {
        if (navigator.vibrate) {
            const pattern = HAPTIC[typeOrDuration] || typeOrDuration;
            navigator.vibrate(pattern);
        }
    }

    // Toast Notification helper
    function showToast(message, type = 'info', duration = 2500) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast-banner ${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        // Force reflow and show
        setTimeout(() => toast.classList.add('show'), 10);
        
        // Hide and remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 350);
        }, duration);
    }

    // Custom Modal Confirmation helper
    function showConfirm(title, message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirm-modal');
            const titleEl = document.getElementById('confirm-modal-title');
            const messageEl = document.getElementById('confirm-modal-message');
            const btnCancel = document.getElementById('confirm-modal-cancel');
            const btnOk = document.getElementById('confirm-modal-ok');
            
            titleEl.textContent = title;
            messageEl.textContent = message;
            
            modal.classList.add('active');
            
            function cleanUp(result) {
                modal.classList.remove('active');
                btnCancel.removeEventListener('click', onCancel);
                btnOk.removeEventListener('click', onOk);
                resolve(result);
            }
            
            function onCancel() {
                vibrate('light');
                cleanUp(false);
            }
            
            function onOk() {
                vibrate('medium');
                cleanUp(true);
            }
            
            btnCancel.addEventListener('click', onCancel);
            btnOk.addEventListener('click', onOk);
        });
    }

    // Button Long-Press Key Repeating variables
    let repeatTimeout = null;
    let repeatInterval = null;

    function startKeyRepeat(key) {
        stopKeyRepeat();
        const repeatableKeys = ['up', 'down', 'left', 'right', 'volume_up', 'volume_down', 'backspace'];
        if (!repeatableKeys.includes(key)) return;

        repeatTimeout = setTimeout(() => {
            repeatInterval = setInterval(() => {
                vibrate('tick');
                sendCommand({ type: 'key_press', key: key });
            }, 100);
        }, 350);
    }

    function stopKeyRepeat() {
        if (repeatTimeout) clearTimeout(repeatTimeout);
        if (repeatInterval) clearInterval(repeatInterval);
        repeatTimeout = null;
        repeatInterval = null;
    }

    // Connect to WebSocket Server
    function connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host || 'localhost:8000';
        const wsUrl = `${protocol}//${host}/ws`;

        console.log(`Connecting to server: ${wsUrl}`);
        socket = new WebSocket(wsUrl);

        socket.onopen = function() {
            console.log('Connected to desktop server');
            isConnected = true;
            statusIndicator.classList.remove('disconnected');
            statusIndicator.classList.add('connected');
            clearTimeout(reconnectTimeout);
            vibrate('success'); // friendly connect double vibration
        };

        socket.onclose = function() {
            console.log('Disconnected from server. Reconnecting...');
            isConnected = false;
            statusIndicator.classList.remove('connected');
            statusIndicator.classList.add('disconnected');
            // Try to reconnect every 3 seconds
            clearTimeout(reconnectTimeout);
            reconnectTimeout = setTimeout(connect, 3000);
        };

        socket.onerror = function(err) {
            console.error('WebSocket Error:', err);
        };


        socket.onmessage = function(event) {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'open_apps') {
                    updateAppDock(msg.apps);
                } else if (msg.type === 'toast') {
                    showToast(msg.message, msg.status || 'info');
                }
            } catch(e) {
                console.error('Failed to parse socket message:', e);
            }
        };
    }

    // Send command helper
    function sendCommand(data) {
        if (socket && isConnected) {
            socket.send(JSON.stringify(data));
        }
    }

    // ----------------------------------------------------
    // UI TAB TOGGLES
    // ----------------------------------------------------
    toggleDpad.addEventListener('click', () => {
        toggleDpad.classList.add('active');
        toggleTrackpad.classList.remove('active');
        dpadPanel.classList.add('active');
        trackpadPanel.classList.remove('active');
        vibrate('medium');
    });

    toggleTrackpad.addEventListener('click', () => {
        toggleTrackpad.classList.add('active');
        toggleDpad.classList.remove('active');
        trackpadPanel.classList.add('active');
        dpadPanel.classList.remove('active');
        vibrate('medium');
    });

    // ----------------------------------------------------
    // GENERIC BUTTON PRESSES
    // ----------------------------------------------------
    document.querySelectorAll('[data-key]').forEach(btn => {
        // We use pointerdown (clicks and touches) for instantaneous latency
        btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            const key = btn.getAttribute('data-key');
            
            // Local state visual toggles
            if (key === 'space') {
                isPlaying = !isPlaying;
                if (isPlaying) {
                    iconPlay.classList.add('hidden');
                    iconPause.classList.remove('hidden');
                } else {
                    iconPause.classList.add('hidden');
                    iconPlay.classList.remove('hidden');
                }
                vibrate('medium');
                sendCommand({ type: 'key_press', key: 'space' });
            } else if (key === 'mute') {
                isMuted = !isMuted;
                if (isMuted) {
                    btnMute.classList.add('muted');
                } else {
                    btnMute.classList.remove('muted');
                }
                vibrate('medium');
                sendCommand({ type: 'key_press', key: 'mute' });
            } else if (key === 'volume_up') {
                vibrate('light');
                sendCommand({ type: 'key_press', key: 'volume_up' });
                startKeyRepeat(key);
            } else if (key === 'volume_down') {
                vibrate('light');
                sendCommand({ type: 'key_press', key: 'volume_down' });
                startKeyRepeat(key);
            } else if (key === 'fullscreen') {
                vibrate('medium');
                sendCommand({ type: 'key_press', key: 'f' }); // standard streaming fullscreen toggle
            } else if (key === 'close_window') {
                showConfirm('Close Tab / Window', 'Are you sure you want to close the active tab/window?').then((confirmed) => {
                    if (confirmed) {
                        vibrate('heavy');
                        sendCommand({ type: 'close_window' });
                    }
                });
            } else if (key === 'lock') {
                showConfirm('Lock Computer', 'Are you sure you want to lock your computer?').then((confirmed) => {
                    if (confirmed) {
                        vibrate('heavy');
                        sendCommand({ type: 'key_press', key: 'lock' });
                    }
                });
            } else {
                vibrate('light');
                if (key === 'enter') {
                    sendCommand({ type: 'mouse_click', button: 'left' });
                } else {
                    let keyToSend = key;
                    if (scrollerMode === 'arrows') {
                        if (key === 'right' || key === 'down') {
                            keyToSend = 'tab';
                        } else if (key === 'left' || key === 'up') {
                            keyToSend = 'shift_tab';
                        }
                    }
                    sendCommand({ type: 'key_press', key: keyToSend });
                    startKeyRepeat(keyToSend);
                }
            }
        });

        // Clear repeating on pointer lift/leave/cancel
        btn.addEventListener('pointerup', () => stopKeyRepeat());
        btn.addEventListener('pointerleave', () => stopKeyRepeat());
        btn.addEventListener('pointercancel', () => stopKeyRepeat());
    });

    // ----------------------------------------------------
    // WHEEL BEHAVIOR TOGGLE
    // ----------------------------------------------------
    scrollerToggleBtn.addEventListener('click', () => {
        vibrate('medium');
        if (scrollerMode === 'arrows') {
            scrollerMode = 'scroll';
            scrollerLabel.textContent = 'Wheel Seek: Mouse Scroll';
            // Send Escape key to clear focus highlight boxes
            sendCommand({ type: 'key_press', key: 'escape' });
        } else {
            scrollerMode = 'arrows';
            scrollerLabel.textContent = 'Wheel Seek: Arrows';
        }
    });

    // ----------------------------------------------------
    // APPLE TV CLICKPAD SCROLLER (TIMELINE SCRUBBING)
    // ----------------------------------------------------
    const wheel = document.getElementById('circular-wheel');
    const scrollLed = document.getElementById('scroll-led');
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    
    let isWheelScrolling = false;
    let cx = 0, cy = 0;
    let lastAngle = 0;
    let accumulatedAngle = 0;
    const thresholdAngle = 0.28; // approx 16 degrees per "tick"
    let wheelRect = null;

    function setRingPress(clientX, clientY) {
        const rect = wheel.getBoundingClientRect();
        const dx = clamp((clientX - (rect.left + rect.width / 2)) / (rect.width / 2), -1, 1);
        const dy = clamp((clientY - (rect.top + rect.height / 2)) / (rect.height / 2), -1, 1);
        const strength = clamp(Math.hypot(dx, dy), 0.35, 1);
        const tilt = 8 * strength;

        wheel.classList.add('ring-pressed');
        wheel.style.setProperty('--ring-tilt-x', `${(-dy * tilt).toFixed(2)}deg`);
        wheel.style.setProperty('--ring-tilt-y', `${(dx * tilt).toFixed(2)}deg`);
        wheel.style.setProperty('--ring-press-x', `${((dx + 1) * 50).toFixed(1)}%`);
        wheel.style.setProperty('--ring-press-y', `${((dy + 1) * 50).toFixed(1)}%`);
        wheel.style.setProperty('--ring-shadow-x', `${(-dx * 10 + 8).toFixed(1)}px`);
        wheel.style.setProperty('--ring-shadow-y', `${(-dy * 10 + 8).toFixed(1)}px`);
    }

    function resetRingPress() {
        wheel.classList.remove('ring-pressed');
        wheel.style.setProperty('--ring-tilt-x', '0deg');
        wheel.style.setProperty('--ring-tilt-y', '0deg');
        wheel.style.setProperty('--ring-press-x', '50%');
        wheel.style.setProperty('--ring-press-y', '50%');
        wheel.style.setProperty('--ring-shadow-x', '8px');
        wheel.style.setProperty('--ring-shadow-y', '8px');
    }

    wheel.addEventListener('pointerdown', (e) => {
        if (!e.isPrimary || e.target.closest('#select-btn')) return;
        wheel.setPointerCapture(e.pointerId);
        setRingPress(e.clientX, e.clientY);
    });

    wheel.addEventListener('pointermove', (e) => {
        if (!wheel.classList.contains('ring-pressed')) return;
        setRingPress(e.clientX, e.clientY);
    });

    wheel.addEventListener('pointerup', resetRingPress);
    wheel.addEventListener('pointercancel', resetRingPress);
    wheel.addEventListener('lostpointercapture', resetRingPress);

    wheel.addEventListener('touchstart', (e) => {
        // Only trigger scroller logic if touched on the outer ring, not center Select btn
        if (e.target.closest('#select-btn')) return;
        
        wheelRect = wheel.getBoundingClientRect();
        cx = wheelRect.left + wheelRect.width / 2;
        cy = wheelRect.top + wheelRect.height / 2;

        const touch = e.touches[0];
        lastAngle = Math.atan2(touch.clientY - cy, touch.clientX - cx);
        accumulatedAngle = 0;
        isWheelScrolling = true;
        
        // Show indicator dot
        scrollLed.classList.add('active');
        positionLed(touch.clientX, touch.clientY);
    });

    wheel.addEventListener('touchmove', (e) => {
        if (!isWheelScrolling) return;
        
        const touch = e.touches[0];
        const angle = Math.atan2(touch.clientY - cy, touch.clientX - cx);
        
        let delta = angle - lastAngle;
        // Wrap-around math
        if (delta > Math.PI) delta -= 2 * Math.PI;
        else if (delta < -Math.PI) delta += 2 * Math.PI;
        
        accumulatedAngle += delta;
        lastAngle = angle;

        positionLed(touch.clientX, touch.clientY);

        // Check rotation ticks
        if (accumulatedAngle >= thresholdAngle) {
            triggerScrollerTick('clockwise');
            accumulatedAngle -= thresholdAngle;
        } else if (accumulatedAngle <= -thresholdAngle) {
            triggerScrollerTick('counterclockwise');
            accumulatedAngle += thresholdAngle;
        }
    });

    function positionLed(clientX, clientY) {
        if (!wheelRect) return;
        
        // Calculate offset relative to wheel element
        const dx = clientX - cx;
        const dy = clientY - cy;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const radius = wheelRect.width / 2 - 15; // stay slightly inside border
        
        // Constrain LED position to a perfect circle path
        const angle = Math.atan2(dy, dx);
        const ledX = wheelRect.width / 2 + radius * Math.cos(angle) - 4; // subtract half led width
        const ledY = wheelRect.height / 2 + radius * Math.sin(angle) - 4;
        
        scrollLed.style.left = `${ledX}px`;
        scrollLed.style.top = `${ledY}px`;
    }

    function triggerScrollerTick(direction) {
        vibrate('tick'); // tiny tick vibration
        
        if (scrollerMode === 'arrows') {
            const keyToSend = direction === 'clockwise' ? 'right' : 'left';
            sendCommand({ type: 'key_press', key: keyToSend });
        } else {
            // Scroll wheel mode
            const scrollAmt = direction === 'clockwise' ? -120 : 120; // windows scroll delta values
            sendCommand({ type: 'mouse_scroll', delta: scrollAmt });
        }
    }

    const stopWheelScroll = () => {
        isWheelScrolling = false;
        scrollLed.classList.remove('active');
    };

    wheel.addEventListener('touchend', stopWheelScroll);
    wheel.addEventListener('touchcancel', stopWheelScroll);

    // ----------------------------------------------------
    // HYBRID D-PAD DRAG TRACKPAD CONTROLS
    // ----------------------------------------------------
    let isDpadDragging = false;
    let lastDpadTouchX = 0;
    let lastDpadTouchY = 0;

    dpadPanel.addEventListener('touchstart', (e) => {
        // Prevent starting drag if touch is inside the circular wheel, or on any button/scroller indicator
        if (e.target.closest('#circular-wheel') || e.target.closest('button') || e.target.closest('.scroller-indicator')) {
            return;
        }

        const touch = e.touches[0];
        lastDpadTouchX = touch.clientX;
        lastDpadTouchY = touch.clientY;
        isDpadDragging = true;
        
        dpadPanel.classList.add('dragging-cursor');
        vibrate('light');
    }, { passive: false });

    dpadPanel.addEventListener('touchmove', (e) => {
        if (!isDpadDragging) return;
        e.preventDefault(); // prevent pull-to-refresh
        
        const touch = e.touches[0];
        const dx = touch.clientX - lastDpadTouchX;
        const dy = touch.clientY - lastDpadTouchY;
        
        lastDpadTouchX = touch.clientX;
        lastDpadTouchY = touch.clientY;

        const sensitivity = 1.62;
        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
            sendCommand({
                type: 'mouse_move',
                dx: dx * sensitivity,
                dy: dy * sensitivity
            });
        }
    }, { passive: false });

    const handleDpadDragEnd = () => {
        if (isDpadDragging) {
            isDpadDragging = false;
            dpadPanel.classList.remove('dragging-cursor');
            vibrate('light');
        }
    };

    dpadPanel.addEventListener('touchend', handleDpadDragEnd);
    dpadPanel.addEventListener('touchcancel', handleDpadDragEnd);

    // ----------------------------------------------------
    // TRACKPAD SMOOTH GESTURE CONTROLS
    // ----------------------------------------------------
    const trackpadSurface = document.getElementById('trackpad-surface');

    // ── Gesture State ──
    let isTracking = false;
    let lastTouchX = 0, lastTouchY = 0;
    let touchStartTime = 0;
    let touchStartPos = { x: 0, y: 0 };

    // Double-tap and drag-lock detection
    let lastTapTime = 0;
    const DOUBLE_TAP_THRESHOLD = 300; // ms
    let isDoubleTapDragging = false;

    // Multi-finger gesture state
    let gestureFingers = 0;
    let gestureStartTouches = [];
    let gestureConsumed = false;
    let lastPinchDist = 0;

    // Two-finger scroll state
    let lastScrollY = 0;
    let lastScrollX = 0;
    let isScrolling = false;
    let scrollAccumulatorY = 0;

    // Swipe detection thresholds
    const SWIPE_THRESHOLD = 50; // px minimum for a swipe gesture
    const PINCH_THRESHOLD = 30; // px minimum for pinch detection
    const SCROLL_THRESHOLD = 8;  // px minimum accumulation before triggering a scroll notch

    function getTouchCenter(touches) {
        let x = 0, y = 0;
        for (let i = 0; i < touches.length; i++) {
            x += touches[i].clientX;
            y += touches[i].clientY;
        }
        return { x: x / touches.length, y: y / touches.length };
    }

    function getPinchDistance(touches) {
        if (touches.length < 2) return 0;
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    trackpadSurface.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touches = e.touches;
        gestureFingers = Math.max(gestureFingers, touches.length);

        if (touches.length === 1) {
            const now = Date.now();
            lastTouchX = touches[0].clientX;
            lastTouchY = touches[0].clientY;
            touchStartPos = { x: lastTouchX, y: lastTouchY };
            
            // Check for double-tap to grab/drag
            if (now - lastTapTime < DOUBLE_TAP_THRESHOLD) {
                isDoubleTapDragging = true;
                vibrate(25);
                sendCommand({ type: 'mouse_down', button: 'left' });
                showToast('Grab & Drag', 'info', 800);
            } else {
                isDoubleTapDragging = false;
            }
            
            touchStartTime = now;
            isTracking = true;
            gestureConsumed = false;
        } else if (touches.length === 2) {
            isTracking = false;
            isScrolling = false;
            gestureConsumed = false;
            scrollAccumulatorY = 0;
            const center = getTouchCenter(touches);
            lastScrollX = center.x;
            lastScrollY = center.y;
            lastPinchDist = getPinchDistance(touches);
            gestureStartTouches = [
                { x: touches[0].clientX, y: touches[0].clientY },
                { x: touches[1].clientX, y: touches[1].clientY }
            ];
        } else if (touches.length === 3) {
            isTracking = false;
            isScrolling = false;
            gestureConsumed = false;
            const center = getTouchCenter(touches);
            gestureStartTouches = [{ x: center.x, y: center.y }];
        }
    }, { passive: false });

    trackpadSurface.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touches = e.touches;

        // ── 1-finger: cursor movement (or dragging/grabbing) ──
        if (touches.length === 1 && isTracking && gestureFingers === 1) {
            const dx = touches[0].clientX - lastTouchX;
            const dy = touches[0].clientY - lastTouchY;
            lastTouchX = touches[0].clientX;
            lastTouchY = touches[0].clientY;
            const sensitivity = 1.62;
            if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
                sendCommand({ type: 'mouse_move', dx: dx * sensitivity, dy: dy * sensitivity });
            }
        }

        // ── 2-finger: scroll or pinch zoom ──
        if (touches.length === 2 && gestureFingers === 2) {
            const center = getTouchCenter(touches);
            const dy = center.y - lastScrollY;
            const dx = center.x - lastScrollX;
            const currentPinchDist = getPinchDistance(touches);
            const pinchDelta = currentPinchDist - lastPinchDist;

            // Detect pinch vs scroll
            if (Math.abs(pinchDelta) > PINCH_THRESHOLD && !isScrolling) {
                // Pinch gesture → zoom
                gestureConsumed = true;
                if (pinchDelta > 0) {
                    sendCommand({ type: 'key_press', key: 'zoom_in' });
                } else {
                    sendCommand({ type: 'key_press', key: 'zoom_out' });
                }
                lastPinchDist = currentPinchDist;
                vibrate('tick');
            } else {
                // Two-finger scroll
                isScrolling = true;
                gestureConsumed = true;
                scrollAccumulatorY += dy;
                
                if (Math.abs(scrollAccumulatorY) >= SCROLL_THRESHOLD) {
                    // Windows standard scroll wheel delta is 120. 
                    // Swipe UP (scrollAccumulatorY negative) means natural scroll DOWN (-120).
                    const scrollDirection = scrollAccumulatorY > 0 ? 120 : -120;
                    sendCommand({ type: 'mouse_scroll', delta: scrollDirection });
                    scrollAccumulatorY = 0; // reset accumulator
                }
            }
            lastScrollY = center.y;
            lastScrollX = center.x;
        }

        // ── 3-finger: swipe gestures (consume on threshold) ──
        if (touches.length === 3 && gestureFingers === 3 && !gestureConsumed) {
            const center = getTouchCenter(touches);
            const startCenter = gestureStartTouches[0];
            const dx = center.x - startCenter.x;
            const dy = center.y - startCenter.y;

            if (Math.abs(dx) > SWIPE_THRESHOLD || Math.abs(dy) > SWIPE_THRESHOLD) {
                gestureConsumed = true;
                vibrate('medium');
                if (Math.abs(dx) > Math.abs(dy)) {
                    // Horizontal swipe
                    if (dx > 0) {
                        sendCommand({ type: 'key_press', key: 'alt_tab' });
                        showToast('Switch App →', 'info', 800);
                    } else {
                        sendCommand({ type: 'key_press', key: 'alt_shift_tab' });
                        showToast('← Switch App', 'info', 800);
                    }
                } else {
                    // Vertical swipe
                    if (dy < 0) {
                        sendCommand({ type: 'key_press', key: 'task_view' });
                        showToast('Task View', 'info', 800);
                    } else {
                        sendCommand({ type: 'key_press', key: 'show_desktop' });
                        showToast('Show Desktop', 'info', 800);
                    }
                }
            }
        }
    }, { passive: false });

    const handleTouchEnd = (e) => {
        e.preventDefault();
        const now = Date.now();

        // ── 2-finger tap → Right Click ──
        if (gestureFingers === 2 && !gestureConsumed) {
            vibrate('medium');
            sendCommand({ type: 'mouse_click', button: 'right' });
            gestureFingers = 0;
            isTracking = false;
            return;
        }

        if (e.touches.length > 0) return; // Still fingers on screen

        // ── 1-finger tap or double-tap ──
        if (gestureFingers === 1 && isTracking && !gestureConsumed) {
            isTracking = false;
            
            if (isDoubleTapDragging) {
                // Release the grabbed item
                sendCommand({ type: 'mouse_up', button: 'left' });
                isDoubleTapDragging = false;
                lastTapTime = 0;
                vibrate('light');
                return;
            }
            
            const duration = now - touchStartTime;
            const distance = Math.sqrt(
                Math.pow(lastTouchX - touchStartPos.x, 2) +
                Math.pow(lastTouchY - touchStartPos.y, 2)
            );

            // Tap validation (time < 220ms, dragged less than 6px)
            if (duration < 220 && distance < 6) {
                // Check for double-tap
                if (now - lastTapTime < DOUBLE_TAP_THRESHOLD) {
                    vibrate('medium');
                    // Double click (two standard clicks in rapid succession)
                    sendCommand({ type: 'mouse_click', button: 'left' });
                    sendCommand({ type: 'mouse_click', button: 'left' });
                    lastTapTime = 0; // Reset to prevent triple
                } else {
                    vibrate('light');
                    sendCommand({ type: 'mouse_click', button: 'left' });
                    lastTapTime = now;
                }
            }
        }

        // Reset gesture state when all fingers lift
        if (e.touches.length === 0) {
            gestureFingers = 0;
            isTracking = false;
            isScrolling = false;
            gestureConsumed = false;
            if (isDoubleTapDragging) {
                sendCommand({ type: 'mouse_up', button: 'left' });
                isDoubleTapDragging = false;
            }
        }
    };

    trackpadSurface.addEventListener('touchend', handleTouchEnd, { passive: false });
    trackpadSurface.addEventListener('touchcancel', () => { 
        gestureFingers = 0; 
        isTracking = false; 
        isScrolling = false; 
        gestureConsumed = false;
        if (isDoubleTapDragging) {
            sendCommand({ type: 'mouse_up', button: 'left' });
            isDoubleTapDragging = false;
        }
    });

    // Explicit Trackpad Buttons
    document.getElementById('tp-click-left').addEventListener('pointerdown', (e) => {
        e.preventDefault();
        vibrate('light');
        sendCommand({ type: 'mouse_click', button: 'left' });
    });
    
    document.getElementById('tp-click-right').addEventListener('pointerdown', (e) => {
        e.preventDefault();
        vibrate('light');
        sendCommand({ type: 'mouse_click', button: 'right' });
    });

    // ----------------------------------------------------
    // AIR MOUSE (GYROSCOPE / DEVICE ORIENTATION POINTER)
    // ----------------------------------------------------
    const airMouseBtn = document.getElementById('air-mouse-trigger');
    let isAirMouseActive = false;
    let prevAlpha = null;
    let prevBeta = null;
    let orientationEventsCount = 0;
    
    // Smoothing & Sensitivity Constants
    const POINTER_SENSITIVITY = 14.4; // Perfect sensitivity for laser pointing at screen
    const NOISE_THRESHOLD = 0.05;     // Jitter threshold in degrees
    const SMOOTHING_FACTOR = 0.22;    // Low-pass filter for smooth motion
    const CALIBRATION_EVENTS = 12;    // Discard initial events to let sensors calibrate

    let smoothDx = 0;
    let smoothDy = 0;

    // Request device orientation permission (required for iOS Safari)
    async function requestOrientationPermission() {
        if (typeof DeviceOrientationEvent !== 'undefined' && 
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const state = await DeviceOrientationEvent.requestPermission();
                return state === 'granted';
            } catch (e) {
                console.error("Orientation permission request failed:", e);
                return false;
            }
        }
        return true;
    }

    function handleOrientation(e) {
        if (!isAirMouseActive) return;
        orientationEventsCount++;

        // Discard initial frames to let the browser sensor fusion stabilize
        if (orientationEventsCount <= CALIBRATION_EVENTS) {
            prevAlpha = e.alpha;
            prevBeta = e.beta;
            return;
        }

        // Calculate angular changes in degrees directly
        let deltaAlpha = e.alpha - prevAlpha;
        let deltaBeta = e.beta - prevBeta;

        // Handle full-turn wrap-arounds for 0-360 degrees
        if (deltaAlpha > 180) deltaAlpha -= 360;
        else if (deltaAlpha < -180) deltaAlpha += 360;

        if (deltaBeta > 180) deltaBeta -= 360;
        else if (deltaBeta < -180) deltaBeta += 360;

        // Filter out hand tremors below threshold
        if (Math.abs(deltaAlpha) < NOISE_THRESHOLD) deltaAlpha = 0;
        if (Math.abs(deltaBeta) < NOISE_THRESHOLD) deltaBeta = 0;

        // Map yaw to horizontal (dx) and pitch to vertical (dy)
        // Turning right decreases alpha, so dx is negative deltaAlpha
        // Tilting up decreases beta, so dy is positive deltaBeta (moves cursor up)
        let rawDx = -deltaAlpha * POINTER_SENSITIVITY;
        let rawDy = -deltaBeta * POINTER_SENSITIVITY;

        // Apply low-pass exponential filter for organic glide
        smoothDx = smoothDx * (1 - SMOOTHING_FACTOR) + rawDx * SMOOTHING_FACTOR;
        smoothDy = smoothDy * (1 - SMOOTHING_FACTOR) + rawDy * SMOOTHING_FACTOR;

        if (Math.abs(smoothDx) > 0.08 || Math.abs(smoothDy) > 0.08) {
            sendCommand({
                type: 'mouse_move',
                dx: smoothDx,
                dy: smoothDy
            });
        }

        // Save current values for next frame comparison
        prevAlpha = e.alpha;
        prevBeta = e.beta;
    }

    airMouseBtn.addEventListener('pointerdown', async (e) => {
        e.preventDefault();
        
        const granted = await requestOrientationPermission();
        if (!granted) {
            showToast("Motion sensors permission denied or not supported.", "danger", 3000);
            return;
        }

        vibrate('medium'); // click pulse
        isAirMouseActive = true;
        prevAlpha = null;
        prevBeta = null;
        smoothDx = 0;
        smoothDy = 0;
        orientationEventsCount = 0;
        
        airMouseBtn.classList.add('active-moving');
        window.addEventListener('deviceorientation', handleOrientation);
        
        showToast("Air Mouse active. Wave phone like a pointer to move cursor.", "info", 2000);

        // Check if orientation events are blocked (e.g. due to insecure context / HTTP)
        setTimeout(() => {
            if (isAirMouseActive && orientationEventsCount === 0) {
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
                if (isIOS) {
                    showToast("No sensor data! Make sure you are on HTTPS and check Safari settings.", "danger", 7000);
                } else {
                    showToast("No sensor data! Use HTTPS or add this URL to Chrome flags (#unsafely-treat-insecure-origin-as-secure).", "danger", 7000);
                }
            }
        }, 1000);
    });

    const deactivateAirMouse = (e) => {
        if (!isAirMouseActive) return;
        e.preventDefault();
        
        isAirMouseActive = false;
        airMouseBtn.classList.remove('active-moving');
        window.removeEventListener('deviceorientation', handleOrientation);
        
        prevAlpha = null;
        prevBeta = null;
        smoothDx = 0;
        smoothDy = 0;
        vibrate('light');
    };

    airMouseBtn.addEventListener('pointerup', deactivateAirMouse);
    airMouseBtn.addEventListener('pointerleave', deactivateAirMouse);
    airMouseBtn.addEventListener('pointercancel', deactivateAirMouse);

    // ----------------------------------------------------
    // TEXTBOARD MANUALLY TYPING BAR (MINIMAL INLINE)
    // ----------------------------------------------------
    const keyboardToggleBtn = document.getElementById('keyboard-toggle-btn');
    const keyboardOverlay = document.getElementById('keyboard-overlay');
    const keyboardTextarea = document.getElementById('desktop-keyboard-textarea');
    
    let lastTypedVal = "";

    keyboardToggleBtn.addEventListener('click', () => {
        vibrate('medium');
        if (keyboardOverlay.classList.contains('active')) {
            keyboardOverlay.classList.remove('active');
            keyboardTextarea.blur();
        } else {
            keyboardOverlay.classList.add('active');
            keyboardTextarea.focus();
            lastTypedVal = "";
            keyboardTextarea.value = "";
        }
    });

    keyboardTextarea.addEventListener('blur', () => {
        // Auto-close keyboard when blurred (finished typing or clicked outside)
        setTimeout(() => {
            if (document.activeElement !== keyboardTextarea) {
                keyboardOverlay.classList.remove('active');
            }
        }, 150);
    });

    keyboardTextarea.addEventListener('input', (e) => {
        const val = keyboardTextarea.value;
        // If typing a command, don't send character-by-character typing to PC
        if (val.toLowerCase().startsWith("open ")) {
            lastTypedVal = val;
            return;
        }

        if (val.length > lastTypedVal.length) {
            // Text was added
            const addedText = val.substring(lastTypedVal.length);
            sendCommand({ type: 'type_text', text: addedText });
        } else if (val.length < lastTypedVal.length) {
            // Text was deleted (backspace)
            const deletedCount = lastTypedVal.length - val.length;
            sendCommand({ type: 'key_press', key: 'backspace', repeat: deletedCount });
        }
        lastTypedVal = val;
    });

    function submitKeyboard() {
        const val = keyboardTextarea.value.trim();
        if (val.toLowerCase().startsWith("open ")) {
            const targetApp = val.substring(5).trim();
            if (targetApp) {
                sendCommand({ type: 'launch_app', name: targetApp });
            }
        } else {
            sendCommand({ type: 'key_press', key: 'enter' });
        }
        keyboardTextarea.value = "";
        lastTypedVal = "";
        keyboardTextarea.blur(); // collapses panel
    }

    keyboardTextarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            vibrate('medium');
            e.preventDefault();
            submitKeyboard();
        }
    });

    document.getElementById('btn-kb-backspace').addEventListener('pointerdown', (e) => {
        e.preventDefault(); // prevents input blur
        vibrate('light');
        sendCommand({ type: 'key_press', key: 'backspace' });
        if (keyboardTextarea.value.length > 0) {
            keyboardTextarea.value = keyboardTextarea.value.slice(0, -1);
            lastTypedVal = keyboardTextarea.value;
        }
    });

    document.getElementById('btn-kb-enter').addEventListener('pointerdown', (e) => {
        e.preventDefault(); // prevents input blur
        vibrate('medium');
        submitKeyboard();
    });

    // ----------------------------------------------------
    // SPEECH VOICE TYPING (SPEECH RECOGNITION API)
    // ----------------------------------------------------
    const micToggleBtn = document.getElementById('mic-toggle-btn');
    let recognition = null;
    let isListening = false;

    // Initialize Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            isListening = true;
            micToggleBtn.classList.add('listening');
            vibrate('heavy');
        };

        recognition.onerror = (e) => {
            console.error('Speech Recognition error:', e);
            let errMsg = 'Voice typing error';
            if (e.error === 'not-allowed') {
                errMsg = 'Mic permission denied';
            } else if (e.error === 'no-speech') {
                return; // Ignore no-speech alerts
            }
            showToast(errMsg, 'danger', 3000);
            stopListening();
        };

        recognition.onend = () => {
            stopListening();
        };

        recognition.onresult = (e) => {
            let finalSegment = '';
            for (let i = e.resultIndex; i < e.results.length; ++i) {
                if (e.results[i].isFinal) {
                    finalSegment += e.results[i][0].transcript;
                }
            }

            if (finalSegment) {
                vibrate('light');
                // Send segment to desktop to type instantly, adding a trailing space
                sendCommand({ type: 'type_text', text: finalSegment + ' ' });
            }
        };
    } else {
        // No browser support
        micToggleBtn.style.opacity = '0.5';
        micToggleBtn.title = 'Voice recognition not supported by browser';
    }

    function startListening() {
        if (!recognition) return;
        try {
            recognition.start();
        } catch(e) {
            console.error('Error starting recognition:', e);
        }
    }

    function stopListening() {
        if (!isListening) return;
        isListening = false;
        micToggleBtn.classList.remove('listening');
        try {
            recognition.stop();
        } catch(e) {}
    }

    micToggleBtn.addEventListener('click', () => {
        vibrate('medium');
        if (!recognition) {
            alert('Voice typing is not supported on this browser. Try Google Chrome or Safari.');
            return;
        }
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    });

    // ----------------------------------------------------
    // NEUMORPHIC APP DOCK SVGS & RENDERER
    // ----------------------------------------------------
    const SVG_YOUTUBE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FF0000"><path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.518 3.545 12 3.545 12 3.545s-7.518 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.87.508 9.388.508 9.388.508s7.518 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>';
    const SVG_NETFLIX = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 0h3.02L16 24h-3.02L5 0z" fill="#E50914"/><path d="M5 0h3.02v24H5z" fill="#E50914"/><path d="M15.98 0H19v24h-3.02z" fill="#E50914"/></svg>';
    const SVG_SPOTIFY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1DB954"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.5 17.3c-.2.3-.6.4-.9.2-2.8-1.7-6.2-2.1-10.3-1.1-.3.1-.7-.1-.8-.4-.1-.3.1-.7.4-.8 4.5-1 8.3-.6 11.4 1.3.3.1.4.5.2.8zm1.5-3.3c-.3.4-.8.5-1.2.3-3.2-2-8.1-2.6-11.9-1.4-.4.1-.9-.1-1-.6-.1-.4.1-.9.6-1 4.3-1.3 9.7-.7 13.3 1.5.4.2.5.8.2 1.2zm.1-3.4C15.3 8.3 9.1 8.1 5.5 9.2c-.6.2-1.2-.2-1.4-.7-.2-.6.2-1.2.7-1.4 4.1-1.3 11-1 15.6 1.7.5.3.7 1 .4 1.5-.3.5-1 .7-1.5.4z"/></svg>';
    const SVG_VLC = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FF8800"><path d="M18.8 19.2h-1.4l-1.6-4.8h-1.6l1.6 4.8h-7.6l1.6-4.8H8.2l-1.6 4.8H5.2c-.7 0-1.2.5-1.2 1.2s.5 1.2 1.2 1.2h13.6c.7 0 1.2-.5 1.2-1.2s-.5-1.2-1.2-1.2zM12 2L8.2 13.4h7.6L12 2z"/></svg>';
    const SVG_PRIME = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#00A8E8"><path d="M1.5 18.6c-.2 0-.3-.1-.4-.3-.1-.2 0-.4.2-.5C5.6 15.2 10 13.5 15 13c.2 0 .4.1.4.4 0 .2-.1.4-.4.4-4.9.5-9.1 2.1-13.3 4.7-.1 0-.2.1-.2.1zm20.1-.7l-3.3-1.6c-.2-.1-.3-.3-.2-.5.1-.2.3-.3.5-.2l2.4 1.1C19.5 12.8 16 10 12 8.3c-3.3-1.4-6.8-2-10.4-1.7-.2 0-.4-.2-.4-.4 0-.2.2-.4.4-.4 3.8-.3 7.4.3 10.8 1.8 4.3 1.8 7.9 4.8 9.6 9.2.1.2 0 .4-.1.5-.1.2-.2.2-.4.2z"/></svg>';
    const SVG_NETMIRROR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="nm-g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FF0844"/><stop offset="100%" stop-color="#FFB199"/></linearGradient></defs><circle cx="12" cy="12" r="11" fill="url(#nm-g)"/><text x="12" y="16" text-anchor="middle" fill="#FFF" font-size="12" font-weight="700" font-family="system-ui,sans-serif">N</text></svg>';
    const SVG_DISNEY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#113CCF"/><text x="12" y="16" text-anchor="middle" fill="#FFF" font-size="9" font-weight="700" font-family="system-ui,sans-serif">D+</text></svg>';
    const SVG_HOTSTAR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#0C3556"/><path d="M12 4l1.8 5.4H19l-4.2 3 1.6 5.2L12 14.4l-4.4 3.2 1.6-5.2-4.2-3h5.2z" fill="#1BB6C1"/></svg>';
    const SVG_TWITCH = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9146FF"><path d="M2.149 0L.537 4.119V20.836h5.731V24h3.224l3.045-3.164h4.657L23.463 15V0H2.149zm1.761 2.172h17.791V14.26l-3.6 3.6h-5.9l-3.043 3.044V17.86H3.91V2.172zm5.37 10.537h2.172V6.42h-2.172v6.29zm5.73 0h2.172V6.42h-2.172v6.29z"/></svg>';
    const SVG_CRUNCHYROLL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#F47521"/><circle cx="12" cy="12" r="7" fill="white"/><circle cx="14" cy="10" r="3" fill="#F47521"/></svg>';

    const SVG_MAP = {
        youtube: SVG_YOUTUBE,
        netflix: SVG_NETFLIX,
        spotify: SVG_SPOTIFY,
        vlc: SVG_VLC,
        primevideo: SVG_PRIME,
        netmirror: SVG_NETMIRROR,
        disney: SVG_DISNEY,
        hotstar: SVG_HOTSTAR,
        twitch: SVG_TWITCH,
        crunchyroll: SVG_CRUNCHYROLL
    };

    function updateAppDock(apps) {
        const dock = document.getElementById('app-dock');
        if (!dock) return;

        dock.innerHTML = '';

        if (!apps || apps.length === 0) {
            dock.classList.remove('visible');
            return;
        }

        apps.forEach(app => {
            const svgContent = SVG_MAP[app.logo];
            if (!svgContent) return; // skip unknown logos

            const item = document.createElement('div');
            item.className = 'dock-item';

            const btn = document.createElement('button');
            btn.className = 'dock-icon neumorphic-btn' + (app.active ? ' active-app' : '');
            btn.title = 'Switch to ' + app.name;
            btn.innerHTML = svgContent;

            btn.addEventListener('click', function() {
                vibrate('medium');
                sendCommand({
                    type: 'activate_app',
                    hwnd: app.hwnd
                });
            });

            item.appendChild(btn);
            dock.appendChild(item);
        });

        dock.classList.add('visible');
    }

    // Start connection
    connect();
})();
