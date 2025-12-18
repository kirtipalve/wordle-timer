// Wordle Timer Popup Script
// Handles leaderboard display and authentication UI
const REGION_OPTIONS = [
  { id: 'americas', label: 'Americas (UTC-8 to UTC-3)' },
  { id: 'europe', label: 'Europe/Africa (UTC-2 to UTC+3)' },
  { id: 'asia-pacific', label: 'Asia-Pacific (UTC+4 to UTC+12)' },
  { id: 'other', label: 'Other' }
];
let currentRegion = null;

document.addEventListener('DOMContentLoaded', init);

// DOM Elements
const elements = {
  loadingSection: document.getElementById('loading-section'),
  authSection: document.getElementById('auth-section'),
  leaderboardSection: document.getElementById('leaderboard-section'),
  errorSection: document.getElementById('error-section'),
  userInfo: document.getElementById('user-info'),
  userPhoto: document.getElementById('user-photo'),
  userName: document.getElementById('user-name'),
  signInBtn: document.getElementById('sign-in-btn'),
  signOutBtn: document.getElementById('sign-out-btn'),
  retryBtn: document.getElementById('retry-btn'),
  wordleNumber: document.getElementById('wordle-number'),
  yourTime: document.getElementById('your-time'),
  yourRank: document.getElementById('your-rank'),
  rankNumber: document.getElementById('rank-number'),
  noSubmission: document.getElementById('no-submission'),
  leaderboardList: document.getElementById('leaderboard-list'),
  errorMessage: document.getElementById('error-message'),
  totalGames: document.getElementById('total-games'),
  avgTime: document.getElementById('avg-time'),
  bestTime: document.getElementById('best-time'),
  regionSelect: document.getElementById('region-select'),
  regionLabel: document.getElementById('region-label'),
  streakCurrent: document.getElementById('streak-current'),
  streakBest: document.getElementById('streak-best'),
  starsTotalBadge: document.getElementById('stars-total'),
  rewardMessage: document.getElementById('reward-message')
};

async function init() {
  setupEventListeners();
  await initRegionSelector();
  await checkAuthState();
}

function setupEventListeners() {
  elements.signInBtn.addEventListener('click', handleSignIn);
  elements.signOutBtn.addEventListener('click', handleSignOut);
  elements.retryBtn.addEventListener('click', () => checkAuthState());

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

async function initRegionSelector() {
  // Populate select options
  elements.regionSelect.innerHTML = REGION_OPTIONS.map(opt => `<option value="${opt.id}">${opt.label}</option>`).join('');
  currentRegion = await loadRegionPreference();
  elements.regionSelect.value = currentRegion;
  setRegionLabel(currentRegion);

  elements.regionSelect.addEventListener('change', async (e) => {
    currentRegion = e.target.value;
    await saveRegionPreference(currentRegion);
    setRegionLabel(currentRegion);
    await loadLeaderboard();
  });
}

async function checkAuthState() {
  showSection('loading');

  try {
    const authState = await chrome.runtime.sendMessage({ action: 'getAuthState' });

    if (authState.isSignedIn) {
      showUserInfo(authState.user);
      showSection('leaderboard');
      await loadLeaderboard();
      await loadUserStats();
      await loadGamificationPanel();
    } else {
      showSection('auth');
    }
  } catch (error) {
    console.error('Auth check error:', error);
    showError('Failed to check authentication status.');
  }
}

async function handleSignIn() {
  elements.signInBtn.disabled = true;
  elements.signInBtn.textContent = 'Signing in...';

  try {
    const result = await chrome.runtime.sendMessage({ action: 'signIn' });

    if (result.success) {
      showUserInfo(result.user);
      showSection('leaderboard');
      await loadLeaderboard();
      await loadUserStats();
      await loadGamificationPanel();
    } else {
      showError(result.error || 'Failed to sign in. Please try again.');
    }
  } catch (error) {
    console.error('Sign in error:', error);
    showError('Failed to sign in. Please try again.');
  } finally {
    elements.signInBtn.disabled = false;
    elements.signInBtn.innerHTML = `
      <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Sign in with Google
    `;
  }
}

async function handleSignOut() {
  try {
    await chrome.runtime.sendMessage({ action: 'signOut' });
    hideUserInfo();
    showSection('auth');
  } catch (error) {
    console.error('Sign out error:', error);
  }
}

async function loadLeaderboard() {
  const wordleNum = await resolveWordleNumber();
  currentRegion = currentRegion || await loadRegionPreference();
  elements.wordleNumber.textContent = `Wordle #${wordleNum}`;
  elements.leaderboardList.innerHTML = '<div class="loading-inline">Loading leaderboard...</div>';
  setRegionLabel(currentRegion);

  try {
    const result = await chrome.runtime.sendMessage({
      action: 'getLeaderboard',
      wordleNumber: wordleNum,
      region: currentRegion
    });

    if (result.success) {
      renderLeaderboard(result.entries);

      if (result.userRank) {
        elements.yourTime.textContent = `Your time: ${formatTime(result.userTime)}`;
        elements.yourTime.classList.remove('hidden');
        elements.rankNumber.textContent = result.userRank;
        elements.yourRank.classList.remove('hidden');
        elements.noSubmission.classList.add('hidden');
      } else {
        elements.yourTime.classList.add('hidden');
        elements.yourRank.classList.add('hidden');
        elements.noSubmission.classList.remove('hidden');
      }
    } else {
      elements.leaderboardList.innerHTML = `
        <div class="empty-state">
          <p>Could not load leaderboard.</p>
          <p>${result.error || ''}</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('Load leaderboard error:', error);
    elements.leaderboardList.innerHTML = `
      <div class="empty-state">
        <p>Failed to load leaderboard.</p>
      </div>
    `;
  }
}

function renderLeaderboard(entries) {
  if (!entries || entries.length === 0) {
    elements.leaderboardList.innerHTML = `
      <div class="empty-state">
        <p>No entries yet for today's Wordle.</p>
        <p>Be the first to complete it!</p>
      </div>
    `;
    return;
  }

  elements.leaderboardList.innerHTML = entries.map((entry, index) => `
    <div class="leaderboard-entry ${entry.isCurrentUser ? 'current-user' : ''}">
      <span class="rank ${index < 3 ? 'top-3' : ''}">${index + 1}</span>
      <img class="avatar" src="${entry.photoURL || getDefaultAvatar(entry.displayName)}" alt="" onerror="this.src='${getDefaultAvatar(entry.displayName)}'">
      <span class="name">${escapeHtml(entry.displayName)}</span>
      <span class="time">${formatTime(entry.time)}</span>
      <span class="guesses">${entry.guesses <= 6 ? entry.guesses : 'X'}/6</span>
    </div>
  `).join('');
}

async function loadUserStats() {
  try {
    const result = await chrome.runtime.sendMessage({ action: 'getUserStats' });

    if (result.success && result.stats) {
      elements.totalGames.textContent = result.stats.totalGames || 0;
      elements.avgTime.textContent = result.stats.averageTime > 0
        ? formatTime(Math.round(result.stats.averageTime))
        : '--:--';
      elements.bestTime.textContent = result.stats.bestTime > 0
        ? formatTime(result.stats.bestTime)
        : '--:--';
    }
  } catch (error) {
    console.error('Load user stats error:', error);
  }
}

function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tabName}-tab`);
  });
}

function showSection(section) {
  elements.loadingSection.classList.add('hidden');
  elements.authSection.classList.add('hidden');
  elements.leaderboardSection.classList.add('hidden');
  elements.errorSection.classList.add('hidden');

  switch (section) {
    case 'loading':
      elements.loadingSection.classList.remove('hidden');
      break;
    case 'auth':
      elements.authSection.classList.remove('hidden');
      break;
    case 'leaderboard':
      elements.leaderboardSection.classList.remove('hidden');
      break;
    case 'error':
      elements.errorSection.classList.remove('hidden');
      break;
  }
}

function showUserInfo(user) {
  if (user.photoURL) {
    elements.userPhoto.src = user.photoURL;
  } else {
    elements.userPhoto.src = getDefaultAvatar(user.displayName);
  }
  elements.userName.textContent = user.displayName || user.email;
  elements.userInfo.classList.remove('hidden');
}

function hideUserInfo() {
  elements.userInfo.classList.add('hidden');
}

function showError(message) {
  elements.errorMessage.textContent = message;
  showSection('error');
}

// Utility Functions
function getTodayDateString() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

async function resolveWordleNumber() {
  try {
    const { lastWordleNumber, lastWordleDate } = await chrome.storage.local.get(['lastWordleNumber', 'lastWordleDate']);
    const today = getTodayDateString();
    if (lastWordleNumber && lastWordleDate === today) {
      return parseInt(lastWordleNumber, 10) || lastWordleNumber;
    }
  } catch (err) {
    console.error('Wordle number lookup failed:', err);
  }
  return getWordleNumber();
}

function getWordleNumber() {
  // Calculate using local midnight to align with the Wordle page schedule
  const startDate = new Date('2021-06-19');
  startDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
}

function detectRegionByOffset() {
  const offsetHours = -new Date().getTimezoneOffset() / 60;
  if (offsetHours >= -8 && offsetHours <= -3) return 'americas'; // UTC-8 to UTC-3
  if (offsetHours > -3 && offsetHours <= 3) return 'europe'; // UTC-2 to UTC+3
  if (offsetHours > 3 && offsetHours <= 12) return 'asia-pacific'; // UTC+4 to UTC+12
  return 'other';
}

async function loadRegionPreference() {
  try {
    const { leaderboardRegion } = await chrome.storage.local.get('leaderboardRegion');
    if (leaderboardRegion && REGION_OPTIONS.some(opt => opt.id === leaderboardRegion)) {
      return leaderboardRegion;
    }
  } catch (err) {
    console.error('Could not load region preference', err);
  }
  const detected = detectRegionByOffset();
  await saveRegionPreference(detected);
  return detected;
}

async function saveRegionPreference(regionId) {
  try {
    await chrome.storage.local.set({ leaderboardRegion: regionId });
  } catch (err) {
    console.error('Could not save region preference', err);
  }
}

function setRegionLabel(regionId) {
  const option = REGION_OPTIONS.find(opt => opt.id === regionId);
  elements.regionLabel.textContent = option ? option.label : '';
}

async function loadGamificationPanel() {
  try {
    const { gamification } = await chrome.storage.local.get('gamification');
    const state = {
      currentStreak: gamification?.currentStreak || 0,
      bestStreak: gamification?.bestStreak || 0,
      stars: gamification?.stars || 0,
      lastCompletedDate: gamification?.lastCompletedDate || null
    };

    elements.streakCurrent.textContent = `${state.currentStreak} 🔥`;
    elements.streakBest.textContent = `${state.bestStreak} 🏆`;
    elements.starsTotalBadge.textContent = `${state.stars} ★`;

    const today = getTodayDateString();
    if (state.lastCompletedDate === today) {
      elements.rewardMessage.textContent = 'You claimed today’s reward! Keep the streak alive tomorrow.';
    } else {
      elements.rewardMessage.textContent = 'Finish today’s Wordle to earn stars and extend your streak.';
    }
  } catch (err) {
    console.error('Could not load gamification panel', err);
    elements.rewardMessage.textContent = 'Finish today’s Wordle to earn stars and extend your streak.';
  }
}

function formatTime(seconds) {
  if (!seconds || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getDefaultAvatar(name) {
  // Generate a simple inline SVG avatar to avoid external requests being blocked by ad blockers
  const initial = (name || 'U').charAt(0).toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56">
      <rect width="56" height="56" rx="8" ry="8" fill="#538d4e" />
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
            font-family="Arial, sans-serif" font-size="26" fill="#ffffff">${initial}</text>
    </svg>
  `;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
