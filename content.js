// Wordle Timer Extension - Updated for new NYT Wordle
(function() {
  'use strict';

  let startTime = null;
  let elapsedTime = 0;
  let timerInterval = null;
  let gameCompleted = false;
  let timerPaused = false;

  // Get today's date in YYYY-MM-DD format for storage key
  function getTodayKey() {
    const today = new Date();
    return `wordle-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  // Format time as MM:SS
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
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
        return;
      }

      // Resume from saved time if exists
      if (result[todayKey] && result[todayKey].time) {
        elapsedTime = result[todayKey].time;
      }

      startTime = Date.now() - (elapsedTime * 1000);

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
    saveProgress();
    console.log('Wordle Timer: Stopped at', formatTime(elapsedTime));
  }

  // Pause timer when tab is not visible
  function handleVisibilityChange() {
    if (document.hidden) {
      timerPaused = true;
    } else {
      if (!gameCompleted && startTime !== null) {
        timerPaused = false;
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
      if (match) return match[1];
    }

    // Fallback: calculate from date (Wordle #0 was June 19, 2021)
    const startDate = new Date('2021-06-19');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);
    const diffTime = today - startDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays.toString();
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

    // Check if game already completed today
    const todayKey = getTodayKey();
    chrome.storage.local.get([todayKey], function(result) {
      if (result[todayKey] && result[todayKey].completed) {
        gameCompleted = true;
        elapsedTime = result[todayKey].time;
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
