// Wordle Timer Extension - Updated for new NYT Wordle
(function() {
  'use strict';

  let startTime = null;
  let elapsedTime = 0;
  let timerInterval = null;
  let gameCompleted = false;
  let timerPaused = false;
  let overlayElements = null;
  let overlayTimerInterval = null;
  let overlayAuthState = { isSignedIn: false, loading: false };
  const REGION_IDS = ['americas', 'europe', 'asia-pacific', 'other'];

  // Get today's date in YYYY-MM-DD format for storage key
  function getTodayKey() {
    const today = new Date();
    return `wordle-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  function getTodayDateString() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  function detectRegionByOffset() {
    const offsetHours = -new Date().getTimezoneOffset() / 60;
    if (offsetHours >= -8 && offsetHours <= -3) return 'americas'; // UTC-8 to UTC-3
    if (offsetHours > -3 && offsetHours <= 3) return 'europe'; // UTC-2 to UTC+3
    if (offsetHours > 3 && offsetHours <= 12) return 'asia-pacific'; // UTC+4 to UTC+12
    return 'other';
  }

  async function getLeaderboardRegion() {
    try {
      const { leaderboardRegion } = await chrome.storage.local.get('leaderboardRegion');
      if (leaderboardRegion && REGION_IDS.includes(leaderboardRegion)) {
        return leaderboardRegion;
      }
    } catch (err) {
      console.warn('Could not read stored region', err);
    }
    const detected = detectRegionByOffset();
    chrome.storage.local.set({ leaderboardRegion: detected });
    return detected;
  }

  // Format time as MM:SS
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // Inline overlay that stays visible on the Wordle page
  function initOverlay() {
    if (overlayElements) return overlayElements;

    injectOverlayStyles();

    const container = document.createElement('div');
    container.id = 'wordle-timer-overlay';

    container.innerHTML = `
      <div class="wt-header">
        <div>
          <div class="wt-title">Wordle Timer</div>
          <div class="wt-subtitle" id="wt-wordle-number">Wordle #---</div>
        </div>
        <button id="wt-open-popup" type="button" aria-label="Open leaderboard">Open</button>
      </div>
      <div class="wt-timer" id="wt-time">--:--</div>
      <div class="wt-status" id="wt-status">Waiting for the board...</div>
      <div class="wt-auth">
        <div class="wt-auth-text" id="wt-auth-text">Checking sign-in…</div>
        <button id="wt-auth-btn" type="button">Check</button>
      </div>
      <div class="wt-footnote">Keep this tab open. Time submits automatically when you finish.</div>
    `;

    document.body.appendChild(container);

    overlayElements = {
      container,
      wordleNumber: container.querySelector('#wt-wordle-number'),
      time: container.querySelector('#wt-time'),
      status: container.querySelector('#wt-status'),
      authText: container.querySelector('#wt-auth-text'),
      authBtn: container.querySelector('#wt-auth-btn'),
      openPopupBtn: container.querySelector('#wt-open-popup')
    };

    const wordleNumber = getWordleNumber();
    overlayElements.wordleNumber.textContent = `Wordle #${wordleNumber}`;
    storeWordleNumber(wordleNumber);
    overlayElements.authBtn.addEventListener('click', handleOverlayAuthClick);
    overlayElements.openPopupBtn.addEventListener('click', openExtensionPopup);

    refreshOverlayAuth();
    updateOverlayTime();
    setOverlayStatus('Waiting for the board...', 'info');

    return overlayElements;
  }

  function injectOverlayStyles() {
    if (document.getElementById('wordle-timer-overlay-style')) return;

    const style = document.createElement('style');
    style.id = 'wordle-timer-overlay-style';
    style.textContent = `
      #wordle-timer-overlay {
        position: fixed;
        top: 72px;
        right: 12px;
        width: 260px;
        background: #121213;
        color: #ffffff;
        border: 1px solid #3a3a3c;
        border-radius: 10px;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
        font-family: 'Clear Sans', 'Helvetica Neue', Arial, sans-serif;
        z-index: 2147483647;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      #wordle-timer-overlay .wt-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      #wordle-timer-overlay .wt-title {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 12px;
        font-weight: 700;
        color: #e5e5e5;
      }

      #wordle-timer-overlay .wt-subtitle {
        font-size: 12px;
        color: #86888a;
        margin-top: 2px;
      }

      #wordle-timer-overlay #wt-open-popup {
        background: #538d4e;
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 6px 10px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
        transition: background 0.15s ease;
      }

      #wordle-timer-overlay #wt-open-popup:hover {
        background: #4a7c45;
      }

      #wordle-timer-overlay .wt-timer {
        font-size: 36px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-align: center;
        padding: 6px 10px;
        background: #1a1a1b;
        border: 1px solid #3a3a3c;
        border-radius: 8px;
      }

      #wordle-timer-overlay .wt-status {
        font-size: 13px;
        color: #d7dadc;
        padding: 8px 10px;
        background: #1a1a1b;
        border-radius: 8px;
        border: 1px solid #2b2b2c;
      }

      #wordle-timer-overlay .wt-status.wt-success {
        border-color: #538d4e;
        color: #b7e3b2;
      }

      #wordle-timer-overlay .wt-status.wt-warn {
        border-color: #b59f3b;
        color: #f2d27c;
      }

      #wordle-timer-overlay .wt-status.wt-error {
        border-color: #c64b4b;
        color: #f5b7b1;
      }

      #wordle-timer-overlay .wt-auth {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        background: #1a1a1b;
        border: 1px solid #2b2b2c;
        border-radius: 8px;
      }

      #wordle-timer-overlay .wt-auth-text {
        font-size: 12px;
        color: #c7c9cc;
        line-height: 1.4;
      }

      #wordle-timer-overlay #wt-auth-btn {
        background: #538d4e;
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 6px 10px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
        white-space: nowrap;
        transition: background 0.15s ease, opacity 0.15s ease;
      }

      #wordle-timer-overlay #wt-auth-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      #wordle-timer-overlay #wt-auth-btn:hover:not(:disabled) {
        background: #4a7c45;
      }

      #wordle-timer-overlay .wt-footnote {
        font-size: 11px;
        color: #86888a;
        line-height: 1.4;
        background: #1a1a1b;
        border-radius: 8px;
        padding: 8px 10px;
        border: 1px dashed #2b2b2c;
      }

      @media (max-width: 700px) {
        #wordle-timer-overlay {
          width: calc(100% - 24px);
          right: 12px;
          left: 12px;
          top: 12px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function updateOverlayTime() {
    if (!overlayElements) return;
    overlayElements.time.textContent = formatTime(elapsedTime);
  }

  function startOverlayTimerUpdates() {
    updateOverlayTime();
    if (overlayTimerInterval) return;
    overlayTimerInterval = setInterval(updateOverlayTime, 1000);
  }

  function stopOverlayTimerUpdates() {
    if (overlayTimerInterval) {
      clearInterval(overlayTimerInterval);
      overlayTimerInterval = null;
    }
    updateOverlayTime();
  }

  function setOverlayStatus(message, tone = 'info') {
    if (!overlayElements) return;
    const statusEl = overlayElements.status;
    statusEl.textContent = message;
    statusEl.classList.remove('wt-success', 'wt-warn', 'wt-error');
    if (tone === 'success') statusEl.classList.add('wt-success');
    if (tone === 'warn') statusEl.classList.add('wt-warn');
    if (tone === 'error') statusEl.classList.add('wt-error');
  }

  async function refreshOverlayAuth() {
    if (!overlayElements) return;
    overlayAuthState.loading = true;
    overlayElements.authBtn.disabled = true;
    overlayElements.authBtn.textContent = 'Checking...';
    overlayElements.authText.textContent = 'Checking sign-in…';

    try {
      const authState = await chrome.runtime.sendMessage({ action: 'getAuthState' });
      overlayAuthState.isSignedIn = !!authState?.isSignedIn;
      overlayElements.authBtn.textContent = overlayAuthState.isSignedIn ? 'Sign out' : 'Sign in';
      overlayElements.authText.textContent = overlayAuthState.isSignedIn
        ? `Signed in${authState?.user?.displayName ? ` as ${authState.user.displayName}` : ''}`
        : 'Sign in to submit to the daily leaderboard';
    } catch (err) {
      overlayAuthState.isSignedIn = false;
      overlayElements.authBtn.textContent = 'Retry';
      overlayElements.authText.textContent = 'Could not check sign-in. Retry?';
      setOverlayStatus('Could not reach the extension service. Try again.', 'warn');
    } finally {
      overlayAuthState.loading = false;
      overlayElements.authBtn.disabled = false;
    }
  }

  async function handleOverlayAuthClick() {
    if (!overlayElements || overlayAuthState.loading) return;
    overlayAuthState.loading = true;
    overlayElements.authBtn.disabled = true;

    if (overlayAuthState.isSignedIn) {
      overlayElements.authBtn.textContent = 'Signing out...';
      try {
        await chrome.runtime.sendMessage({ action: 'signOut' });
        overlayAuthState.isSignedIn = false;
        setOverlayStatus('Signed out. Timer still running locally.', 'info');
      } catch (err) {
        setOverlayStatus('Sign-out failed. Try again.', 'error');
      } finally {
        overlayAuthState.loading = false;
        refreshOverlayAuth();
      }
      return;
    }

    overlayElements.authBtn.textContent = 'Signing in...';
    try {
      const result = await chrome.runtime.sendMessage({ action: 'signIn' });
      if (result?.success) {
        overlayAuthState.isSignedIn = true;
        setOverlayStatus('Signed in. Your time will submit automatically.', 'success');
      } else {
        setOverlayStatus(result?.error || 'Could not sign in. Try again.', 'error');
      }
    } catch (err) {
      setOverlayStatus('Sign-in failed. Try again.', 'error');
    } finally {
      overlayAuthState.loading = false;
      refreshOverlayAuth();
    }
  }

  function openExtensionPopup() {
    chrome.runtime.sendMessage({ action: 'openPopupWindow' });
  }

  // Start the timer
  function startTimer() {
    if (gameCompleted || startTime !== null) return;

    const todayKey = getTodayKey();

    // Check if we already have a saved time for today
    chrome.storage.local.get([todayKey], function(result) {
      if (result[todayKey] && result[todayKey].completed) {
        gameCompleted = true;
        elapsedTime = result[todayKey].time;
        console.log('Wordle Timer: Game already completed today');
        updateOverlayTime();
        setOverlayStatus('Wordle already completed today.', 'warn');
        return;
      }

      // Resume from saved time if exists
      if (result[todayKey] && result[todayKey].time) {
        elapsedTime = result[todayKey].time;
      }

      startTime = Date.now() - (elapsedTime * 1000);

      startOverlayTimerUpdates();
      setOverlayStatus('Timer running. Keep this tab active.', 'info');

      timerInterval = setInterval(() => {
        if (!timerPaused) {
          elapsedTime = Math.floor((Date.now() - startTime) / 1000);
          saveProgress();
        }
      }, 1000);

      console.log('Wordle Timer: Started');
    });
  }

  // Save progress to storage
  function saveProgress() {
    const todayKey = getTodayKey();
    chrome.storage.local.set({
      [todayKey]: {
        time: elapsedTime,
        completed: gameCompleted
      }
    });
  }

  // Stop the timer when game is complete
  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    gameCompleted = true;
    stopOverlayTimerUpdates();
    setOverlayStatus(`Completed in ${formatTime(elapsedTime)}. Submitting...`, 'success');
    saveProgress();
    console.log('Wordle Timer: Stopped at', formatTime(elapsedTime));

    // Submit to leaderboard if signed in
    submitToLeaderboard();
  }

  // Submit time to leaderboard
  async function submitToLeaderboard() {
    try {
      // Check if user is signed in
      const authState = await chrome.runtime.sendMessage({ action: 'getAuthState' });

      if (!authState || !authState.isSignedIn) {
        console.log('Wordle Timer: User not signed in, skipping leaderboard submission');
        setOverlayStatus('Sign in to submit your time to the leaderboard.', 'warn');
        return;
      }

      // Get guess count from the board
      const rows = document.querySelectorAll('[class*="Row-module_row"]');
      let guessCount = 0;

      rows.forEach(row => {
        const tiles = row.querySelectorAll('[data-testid="tile"]');
        const hasContent = Array.from(tiles).some(tile => {
          const state = tile.getAttribute('data-state');
          return state && state !== 'empty' && state !== 'tbd';
        });
        if (hasContent) guessCount++;
      });

      // Check if won (last row is all correct)
      const lastRowTiles = rows[guessCount - 1]?.querySelectorAll('[data-testid="tile"]');
      let won = lastRowTiles && Array.from(lastRowTiles).every(
        tile => tile.getAttribute('data-state') === 'correct'
      );

      const region = await getLeaderboardRegion();
      const wordleNumber = parseInt(getWordleNumber());
      storeWordleNumber(wordleNumber);
      const todayKey = getTodayKey();

      const result = await chrome.runtime.sendMessage({
        action: 'submitTime',
        data: {
          wordleNumber: wordleNumber,
          time: elapsedTime,
          guesses: won ? guessCount : 7, // 7 indicates failed
          wordleDate: todayKey.replace('wordle-', ''),
          region
        }
      });

      if (result && result.success) {
        showCustomToast('Time submitted to leaderboard!');
        setOverlayStatus('Time submitted to the leaderboard!', 'success');
      } else if (result && result.error === 'already_submitted') {
        console.log('Wordle Timer: Already submitted for today');
        setOverlayStatus('Already submitted today. Nice work!', 'success');
      } else {
        console.log('Wordle Timer: Could not submit to leaderboard', result?.error);
        const detail = result?.error ? ` (${result.error})` : '';
        setOverlayStatus(`Could not submit your time${detail}. Try again from the extension popup.`, 'error');
      }
    } catch (error) {
      console.log('Wordle Timer: Leaderboard submission error', error.message);
      setOverlayStatus('Submission failed. Check your connection and try again.', 'error');
    }
  }

  // Pause timer when tab is not visible
  function handleVisibilityChange() {
    if (document.hidden) {
      timerPaused = true;
      if (!gameCompleted && startTime !== null) {
        setOverlayStatus('Timer paused while this tab is hidden.', 'warn');
      }
    } else {
      if (!gameCompleted && startTime !== null) {
        timerPaused = false;
        setOverlayStatus('Timer running. Keep this tab active.', 'info');
        startOverlayTimerUpdates();
      }
    }
  }

  // Detect game board to start timer
  function detectGameStart() {
    const gameBoard = document.querySelector('[class*="Board-module_board"]');
    if (gameBoard && !gameCompleted) {
      // Check if there are any filled tiles (game in progress or completed)
      const filledTiles = document.querySelectorAll('[data-state="correct"], [data-state="present"], [data-state="absent"]');
      const allCorrect = document.querySelectorAll('[data-state="correct"]').length;

      // If we have 5 correct tiles, game might be complete
      if (allCorrect >= 5) {
        // Don't start timer, game is likely complete
        return;
      }

      setOverlayStatus('Board detected. Timer will start when you play.', 'info');
      startTimer();
    }
  }

  // Detect game completion by looking for the stats modal specifically
  function detectGameEnd() {
    // Look for the stats button being clicked or stats modal showing
    // The stats modal contains statistics divs or distribution graph
    const modal = document.querySelector('[class*="Modal"]');

    if (modal && !gameCompleted) {
      // Check if this is the stats modal (not the help modal)
      // Stats modal contains "Statistics" heading or stats-related content
      const statsHeading = modal.querySelector('h2');
      const hasStatsContent = modal.textContent.includes('Statistics') ||
                              modal.textContent.includes('GUESS DISTRIBUTION') ||
                              modal.querySelector('[id*="stats"]') ||
                              modal.querySelector('[class*="Stats"]');

      if (statsHeading && hasStatsContent) {
        // This is the stats/results modal, game is complete
        stopTimer();
      }
    }
  }

  // Intercept the share button click
  function interceptShare() {
    // Find share button - search all buttons for one with "Share" text or share-related class
    let shareButton = null;

    try {
      const buttons = document.querySelectorAll('button');
      shareButton = Array.from(buttons).find(btn => {
        const text = btn.textContent || '';
        const className = btn.className || '';
        return text.includes('Share') || className.includes('shareButton') || className.includes('share');
      });
    } catch (err) {
      console.error('Error finding share button:', err);
      return;
    }

    if (!shareButton) return;

    // Check if we've already intercepted this button
    if (shareButton.dataset.wordleTimerIntercepted) return;
    shareButton.dataset.wordleTimerIntercepted = 'true';

    // Add our custom click handler
    shareButton.addEventListener('click', async function(e) {
      e.preventDefault();
      e.stopPropagation();

      // Build the share text from the board
      const rows = document.querySelectorAll('[class*="Row-module_row"]');
      let shareText = '';
      let guessCount = 0;

      rows.forEach((row) => {
        const tiles = row.querySelectorAll('[data-testid="tile"]');
        let rowText = '';
        let hasContent = false;

        tiles.forEach(tile => {
          const state = tile.getAttribute('data-state');
          if (state && state !== 'empty' && state !== 'tbd') {
            hasContent = true;
            if (state === 'correct') rowText += '🟩';
            else if (state === 'present') rowText += '🟨';
            else if (state === 'absent') rowText += '⬜';
          }
        });

        if (hasContent) {
          shareText += rowText + '\n';
          guessCount++;
        }
      });

      // Get Wordle number
      const wordleNumber = getWordleNumber();

      // Check if won (last row is all correct)
      const lastRowTiles = rows[guessCount - 1]?.querySelectorAll('[data-testid="tile"]');
      let won = true;

      lastRowTiles?.forEach(tile => {
        if (tile.getAttribute('data-state') !== 'correct') {
          won = false;
        }
      });

      const score = won ? guessCount : 'X';

      // Add time to share text
      const timeStr = formatTime(elapsedTime);
      const fullShareText = `Wordle ${wordleNumber} ${score}/6 ⏱️ ${timeStr}\n\n${shareText}`;

      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(fullShareText);
        showCustomToast('Copied results with time!');
      } catch (err) {
        console.error('Failed to copy:', err);
        showCustomToast('Failed to copy');
      }
    }, true); // Use capture phase to intercept before the original handler
  }

  // Get Wordle number from the page or calculate it
  function getWordleNumber() {
    // Try to find it in the page title or heading
    const heading = document.querySelector('h1, [class*="Title"]');
    if (heading) {
      const match = heading.textContent.match(/Wordle\s+#?(\d+)/i);
      if (match) {
        const num = match[1];
        storeWordleNumber(num);
        return num;
      }
    }

    // Fallback: calculate from date (Wordle #0 was June 19, 2021) using UTC to avoid timezone drift
    const start = Date.UTC(2021, 5, 19); // 2021-06-19 UTC
    const todayUTC = Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate()
    );
    const diffDays = Math.floor((todayUTC - start) / (1000 * 60 * 60 * 24));
    const num = diffDays.toString();
    storeWordleNumber(num);
    return num;
  }

  function storeWordleNumber(wordleNumber) {
    chrome.storage.local.set({
      lastWordleNumber: wordleNumber,
      lastWordleDate: getTodayDateString()
    });
  }

  function storeWordleNumber(wordleNumber) {
    chrome.storage.local.set({
      lastWordleNumber: wordleNumber,
      lastWordleDate: getTodayDateString()
    });
  }

  // Show custom toast notification
  function showCustomToast(message) {
    // Create toast element
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 10%;
      left: 50%;
      transform: translateX(-50%);
      background: #538d4e;
      color: white;
      padding: 16px;
      border-radius: 4px;
      font-weight: bold;
      z-index: 10000;
      font-family: 'Clear Sans', 'Helvetica Neue', Arial, sans-serif;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 2000);
  }

  // Initialize
  function init() {
    console.log('Wordle Timer Extension: Initialized');
    initOverlay();

    // Check if game already completed today
    const todayKey = getTodayKey();
    chrome.storage.local.get([todayKey], function(result) {
      if (result[todayKey] && result[todayKey].completed) {
        gameCompleted = true;
        elapsedTime = result[todayKey].time;
        updateOverlayTime();
        setOverlayStatus(`Completed earlier at ${formatTime(elapsedTime)}.`, 'warn');
        return;
      }

      if (result[todayKey] && result[todayKey].time) {
        elapsedTime = result[todayKey].time;
        updateOverlayTime();
        setOverlayStatus('Resuming saved timer once the board is ready.', 'info');
      }
    });

    // Wait for game to load
    const checkInterval = setInterval(() => {
      const gameBoard = document.querySelector('[class*="Board-module_board"]');
      if (gameBoard) {
        clearInterval(checkInterval);
        detectGameStart();

        // Monitor for game end and share button
        const observer = new MutationObserver(() => {
          detectGameEnd();
          interceptShare();
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'data-state']
        });

        // Initial check
        detectGameEnd();
        interceptShare();
      }
    }, 500);

    // Stop checking after 10 seconds
    setTimeout(() => clearInterval(checkInterval), 10000);

    // Handle visibility change for pause/resume
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
