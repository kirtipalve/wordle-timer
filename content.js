// Wordle Timer Extension - Updated for new NYT Wordle
(function() {
  'use strict';

  console.log('Wordle Timer: Content script loaded');

  let startTime = null;
  let elapsedTime = 0;
  let timerInterval = null;
  let gameCompleted = false;
  let timerPaused = false;
  let overlayElements = null;
  let overlayTimerInterval = null;
  let overlayAuthState = { isSignedIn: false, loading: false };
  let gamifyState = {
    currentStreak: 0,
    bestStreak: 0,
    stars: 0,
    lastCompletedDate: null,
    achievements: []
  };

  const ACHIEVEMENTS = [
    { id: 'first_win', name: 'First Victory', description: 'Complete your first Wordle', icon: '🎉', check: (state) => state.totalGames >= 1 },
    { id: 'speed_demon', name: 'Speed Demon', description: 'Win in under 60 seconds', icon: '⚡', check: (state) => state.fastestWin && state.fastestWin <= 60 },
    { id: 'streak_5', name: 'On Fire', description: 'Achieve a 5-day win streak', icon: '🔥', check: (state) => state.bestStreak >= 5 },
    { id: 'streak_10', name: 'Unstoppable', description: 'Achieve a 10-day win streak', icon: '💪', check: (state) => state.bestStreak >= 10 },
    { id: 'streak_30', name: 'Legend', description: 'Achieve a 30-day win streak', icon: '👑', check: (state) => state.bestStreak >= 30 },
    { id: 'stars_50', name: 'Star Collector', description: 'Earn 50 stars', icon: '⭐', check: (state) => state.stars >= 50 },
    { id: 'stars_100', name: 'Star Master', description: 'Earn 100 stars', icon: '🌟', check: (state) => state.stars >= 100 },
    { id: 'games_10', name: 'Dedicated', description: 'Complete 10 Wordles', icon: '📚', check: (state) => state.totalGames >= 10 },
    { id: 'games_50', name: 'Veteran', description: 'Complete 50 Wordles', icon: '🎖️', check: (state) => state.totalGames >= 50 },
    { id: 'games_100', name: 'Century Club', description: 'Complete 100 Wordles', icon: '💯', check: (state) => state.totalGames >= 100 }
  ];

  // Get today's date in YYYY-MM-DD format for storage key
  function getTodayKey() {
    const today = new Date();
    return `wordle-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  function getTodayDateString() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  function getDateStringOffset(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
      <div class="wt-gamify">
        <div class="wt-gamify-metric">
          <div class="wt-gamify-label">Streak</div>
          <div class="wt-gamify-value" id="wt-streak">0 🔥</div>
        </div>
        <div class="wt-gamify-metric">
          <div class="wt-gamify-label">Stars</div>
          <div class="wt-gamify-value" id="wt-stars">0 ★</div>
        </div>
      </div>
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
      openPopupBtn: container.querySelector('#wt-open-popup'),
      streak: container.querySelector('#wt-streak'),
      stars: container.querySelector('#wt-stars')
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

      #wordle-timer-overlay .wt-gamify {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
      }

      #wordle-timer-overlay .wt-gamify-metric {
        background: #1a1a1b;
        border: 1px solid #2b2b2c;
        border-radius: 8px;
        padding: 8px;
      }

      #wordle-timer-overlay .wt-gamify-label {
        font-size: 11px;
        color: #86888a;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 4px;
      }

      #wordle-timer-overlay .wt-gamify-value {
        font-size: 16px;
        font-weight: 700;
        color: #e5e5e5;
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
    overlayElements.streak.textContent = `${gamifyState.currentStreak} 🔥`;
    overlayElements.stars.textContent = `${gamifyState.stars} ★`;
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
  function stopTimer(won = true) {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    gameCompleted = true;
    stopOverlayTimerUpdates();
    const result = won ? 'Won' : 'Lost';
    setOverlayStatus(`${result} in ${formatTime(elapsedTime)}. Submitting...`, won ? 'success' : 'warn');
    saveProgress();
    console.log(`Wordle Timer: ${result} at`, formatTime(elapsedTime));
    updateGamifyOnComplete(won);

    // Submit to leaderboard if signed in
    submitToLeaderboard(won);
  }

  // Submit time to leaderboard
  async function submitToLeaderboard(won) {
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
        const rowStates = Array.from(tiles).map(tile => tile.getAttribute('data-state'));
        // Count rows with revealed tiles
        if (rowStates.some(state => state === 'correct' || state === 'present' || state === 'absent')) {
          guessCount++;
        }
      });

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
          completed: won
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

  // Check game state and manage timer
  function checkGameState() {
    try {
      const gameBoard = document.querySelector('[class*="Board-module_board"]');
      if (!gameBoard) {
        setOverlayStatus('Waiting for the board...', 'info');
        return;
      }

      const rows = document.querySelectorAll('[class*="Row-module_row"]');
      if (!rows || rows.length === 0) return;

      let hasWinningRow = false;
      let revealedRowCount = 0;
      let lastRevealedRow = null;

      // Analyze all rows
      rows.forEach(row => {
        const tiles = row.querySelectorAll('[data-testid="tile"]');
        if (tiles.length !== 5) return;

        const rowStates = Array.from(tiles).map(tile => tile.getAttribute('data-state'));

        // Count revealed rows (guesses that have been submitted)
        const isRevealed = rowStates.some(state => state === 'correct' || state === 'present' || state === 'absent');
        if (isRevealed) {
          revealedRowCount++;
          lastRevealedRow = rowStates;
        }

        // Check for winning row (all 5 tiles are correct)
        if (rowStates.every(state => state === 'correct')) {
          hasWinningRow = true;
        }
      });

      // Check if game was already completed before we loaded
      if ((hasWinningRow || revealedRowCount === 6) && startTime === null) {
        gameCompleted = true;
        setOverlayStatus('Game already completed today.', 'warn');
        return;
      }

      // Start timer on first revealed row (first guess submitted)
      if (revealedRowCount === 1 && startTime === null && !gameCompleted) {
        console.log('Wordle Timer: First guess detected, starting timer');
        setOverlayStatus('Timer started!', 'info');
        startTimer();
      }

      // Check if game just completed
      if (!gameCompleted && startTime !== null) {
        if (hasWinningRow) {
          console.log('Wordle Timer: Win detected');
          stopTimer(true);
        } else if (revealedRowCount === 6) {
          console.log('Wordle Timer: Loss detected (6 guesses)');
          stopTimer(false);
        }
      }

      // Update status for waiting state
      if (revealedRowCount === 0 && startTime === null && !gameCompleted) {
        setOverlayStatus('Timer starts when you submit your first guess.', 'info');
      }
    } catch (error) {
      console.error('Wordle Timer: Error checking game state:', error);
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
    console.log('Wordle Timer: Initializing...');

    try {
      // Initialize overlay first
      const overlay = initOverlay();
      if (!overlay) {
        console.error('Wordle Timer: Failed to create overlay');
        return;
      }
      console.log('Wordle Timer: Overlay created');

      // Load gamification state
      loadGamifyState();

      // Check if game already completed today
      const todayKey = getTodayKey();
      chrome.storage.local.get([todayKey], function(result) {
        if (chrome.runtime.lastError) {
          console.error('Wordle Timer: Storage error:', chrome.runtime.lastError);
          setOverlayStatus('Ready to start.', 'info');
          return;
        }

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
          setOverlayStatus('Resuming saved timer.', 'info');
        }
      });

      // Wait for game board to appear
      let checkCount = 0;
      const checkInterval = setInterval(() => {
        checkCount++;
        const gameBoard = document.querySelector('[class*="Board-module_board"]');

        if (gameBoard) {
          clearInterval(checkInterval);
          console.log('Wordle Timer: Game board found, starting monitoring');

          // Initial check
          checkGameState();
          interceptShare();

          // Monitor for changes (game progress) - throttled to avoid performance issues
          let checkTimeout = null;
          const observer = new MutationObserver(() => {
            if (checkTimeout) return;
            checkTimeout = setTimeout(() => {
              try {
                checkGameState();
                interceptShare();
              } catch (error) {
                console.error('Wordle Timer: Error in observer:', error);
              } finally {
                checkTimeout = null;
              }
            }, 100); // Check at most every 100ms
          });

          observer.observe(gameBoard, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-state']
          });

          console.log('Wordle Timer: Monitoring started successfully');
        } else if (checkCount >= 30) {
          // Stop checking after 15 seconds (30 * 500ms)
          clearInterval(checkInterval);
          console.warn('Wordle Timer: Game board not found after 15 seconds');
          setOverlayStatus('Could not find game board. Refresh the page.', 'warn');
        }
      }, 500);

      // Handle visibility change for pause/resume
      document.addEventListener('visibilitychange', handleVisibilityChange);

      console.log('Wordle Timer: Initialization complete');
    } catch (error) {
      console.error('Wordle Timer: Initialization failed:', error);
    }
  }

  // Start when page is ready - handle all loading states
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM is already loaded, initialize now
    setTimeout(init, 100); // Small delay to let Wordle initialize first
  }

  // Gamification helpers
  async function loadGamifyState() {
    try {
      const { gamification } = await chrome.storage.local.get('gamification');
      if (gamification) {
        gamifyState = {
          currentStreak: gamification.currentStreak || 0,
          bestStreak: gamification.bestStreak || 0,
          stars: gamification.stars || 0,
          lastCompletedDate: gamification.lastCompletedDate || null,
          achievements: gamification.achievements || [],
          totalGames: gamification.totalGames || 0,
          fastestWin: gamification.fastestWin || null
        };
      }
    } catch (err) {
      console.warn('Could not load gamification state', err);
    } finally {
      updateOverlayTime();
    }
  }

  async function saveGamifyState() {
    try {
      await chrome.storage.local.set({ gamification: gamifyState });
    } catch (err) {
      console.warn('Could not save gamification state', err);
    }
  }

  function updateGamifyOnComplete(won) {
    const today = getTodayDateString();
    const yesterday = getDateStringOffset(-1);

    // Prevent double-counting if already recorded today
    if (gamifyState.lastCompletedDate === today) {
      return;
    }

    // Update total games
    gamifyState.totalGames = (gamifyState.totalGames || 0) + 1;

    if (!won) {
      gamifyState.currentStreak = 0;
      gamifyState.lastCompletedDate = today;
      updateOverlayTime();
      checkAndAwardAchievements();
      saveGamifyState();
      return;
    }

    // Update fastest win time
    if (!gamifyState.fastestWin || elapsedTime < gamifyState.fastestWin) {
      gamifyState.fastestWin = elapsedTime;
    }

    if (gamifyState.lastCompletedDate === yesterday) {
      gamifyState.currentStreak += 1;
    } else {
      gamifyState.currentStreak = 1;
    }

    gamifyState.bestStreak = Math.max(gamifyState.bestStreak, gamifyState.currentStreak);

    // Award stars: base + speed bonus
    let starsEarned = 1;
    if (elapsedTime <= 120) starsEarned += 1;
    if (elapsedTime <= 60) starsEarned += 1;
    gamifyState.stars += starsEarned;

    gamifyState.lastCompletedDate = today;
    updateOverlayTime();

    // Check for new achievements
    checkAndAwardAchievements();

    saveGamifyState();

    setOverlayStatus(`Streak ${gamifyState.currentStreak}! Earned ${starsEarned}★`, 'success');
    showCustomToast(`🔥 Streak ${gamifyState.currentStreak}! +${starsEarned}★`);
  }

  function checkAndAwardAchievements() {
    if (!gamifyState.achievements) {
      gamifyState.achievements = [];
    }

    ACHIEVEMENTS.forEach(achievement => {
      // Check if already unlocked
      if (gamifyState.achievements.includes(achievement.id)) {
        return;
      }

      // Check if criteria met
      if (achievement.check(gamifyState)) {
        gamifyState.achievements.push(achievement.id);
        showCustomToast(`${achievement.icon} Achievement Unlocked: ${achievement.name}!`);
      }
    });
  }
})();
