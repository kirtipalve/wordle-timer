// Wordle Timer - Background Service Worker
// Handles authentication and Firebase operations

// Firebase configuration
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCULdDsyUPjQ075IjiVv157fl5LrYHIUrw',
  projectId: 'wordle-timer'
};

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

// Message handler for popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Indicates async response
});

async function handleMessage(message, sender) {
  switch (message.action) {
    case 'signIn':
      return await handleSignIn();

    case 'signOut':
      return await handleSignOut();

    case 'getAuthState':
      return await getAuthState();

    case 'submitTime':
      return await submitTimeToLeaderboard(message.data);

    case 'getLeaderboard':
      return await fetchLeaderboard(message.wordleNumber);

    case 'getUserStats':
      return await getUserStats();

    case 'getAchievements':
      return await getAchievements();

    case 'openPopupWindow':
      return await openPopupWindow();

    default:
      return { success: false, error: 'Unknown action' };
  }
}

async function openPopupWindow() {
  try {
    await chrome.windows.create({
      url: chrome.runtime.getURL('popup.html'),
      type: 'popup',
      width: 420,
      height: 640
    });
    return { success: true };
  } catch (error) {
    console.error('Open popup window error:', error);
    return { success: false, error: error.message };
  }
}

// ============== Authentication ==============

async function handleSignIn() {
  try {
    // Step 1: Get Google OAuth token via Chrome Identity API
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(token);
        }
      });
    });

    // Step 2: Exchange Google token for Firebase ID token
    const firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_CONFIG.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postBody: `access_token=${token}&providerId=google.com`,
          requestUri: `https://${chrome.runtime.id}.chromiumapp.org`,
          returnSecureToken: true,
          returnIdpCredential: true
        })
      }
    );

    const firebaseAuth = await firebaseResponse.json();

    if (firebaseAuth.error) {
      throw new Error(firebaseAuth.error.message);
    }

    // Step 3: Store auth state
    const user = {
      uid: firebaseAuth.localId,
      email: firebaseAuth.email,
      displayName: firebaseAuth.displayName || firebaseAuth.email.split('@')[0],
      photoURL: firebaseAuth.photoUrl || '',
      idToken: firebaseAuth.idToken,
      refreshToken: firebaseAuth.refreshToken,
      expiresAt: Date.now() + (parseInt(firebaseAuth.expiresIn) * 1000)
    };

    await chrome.storage.local.set({ firebaseUser: user });

    // Create/update user profile in Firestore
    await createOrUpdateUserProfile(user);

    return {
      success: true,
      user: {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
        email: user.email
      }
    };
  } catch (error) {
    console.error('Sign in error:', error);
    return { success: false, error: error.message };
  }
}

async function handleSignOut() {
  try {
    // Revoke the Chrome identity token
    const { firebaseUser } = await chrome.storage.local.get('firebaseUser');

    if (firebaseUser) {
      await new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (token) {
            chrome.identity.removeCachedAuthToken({ token }, resolve);
          } else {
            resolve();
          }
        });
      });
    }

    await chrome.storage.local.remove('firebaseUser');
    return { success: true };
  } catch (error) {
    console.error('Sign out error:', error);
    return { success: false, error: error.message };
  }
}

async function getAuthState() {
  const { firebaseUser } = await chrome.storage.local.get('firebaseUser');

  if (!firebaseUser) {
    return { isSignedIn: false };
  }

  // Check if token is expired
  if (Date.now() >= firebaseUser.expiresAt) {
    const refreshed = await refreshToken();
    if (!refreshed) {
      return { isSignedIn: false };
    }
    const { firebaseUser: updatedUser } = await chrome.storage.local.get('firebaseUser');
    return {
      isSignedIn: true,
      user: {
        uid: updatedUser.uid,
        displayName: updatedUser.displayName,
        photoURL: updatedUser.photoURL,
        email: updatedUser.email
      }
    };
  }

  return {
    isSignedIn: true,
    user: {
      uid: firebaseUser.uid,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      email: firebaseUser.email
    }
  };
}

async function refreshToken() {
  try {
    const { firebaseUser } = await chrome.storage.local.get('firebaseUser');

    if (!firebaseUser || !firebaseUser.refreshToken) {
      return false;
    }

    const response = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: firebaseUser.refreshToken
        })
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error('Token refresh failed:', data.error);
      await chrome.storage.local.remove('firebaseUser');
      return false;
    }

    firebaseUser.idToken = data.id_token;
    firebaseUser.refreshToken = data.refresh_token;
    firebaseUser.expiresAt = Date.now() + (parseInt(data.expires_in) * 1000);

    await chrome.storage.local.set({ firebaseUser });
    return true;
  } catch (error) {
    console.error('Token refresh error:', error);
    return false;
  }
}

async function getValidToken() {
  const { firebaseUser } = await chrome.storage.local.get('firebaseUser');

  if (!firebaseUser) {
    return null;
  }

  // Refresh if token expires in less than 5 minutes
  if (firebaseUser.expiresAt - Date.now() < 5 * 60 * 1000) {
    const refreshed = await refreshToken();
    if (!refreshed) {
      return null;
    }
    const { firebaseUser: updatedUser } = await chrome.storage.local.get('firebaseUser');
    return updatedUser;
  }

  return firebaseUser;
}

// ============== User Profile ==============

async function createOrUpdateUserProfile(user) {
  try {
    const docData = {
      fields: {
        displayName: { stringValue: user.displayName },
        photoURL: { stringValue: user.photoURL || '' },
        email: { stringValue: user.email },
        lastActive: { timestampValue: new Date().toISOString() }
      }
    };

    await fetch(
      `${FIRESTORE_BASE}/users/${user.uid}?updateMask.fieldPaths=displayName&updateMask.fieldPaths=photoURL&updateMask.fieldPaths=email&updateMask.fieldPaths=lastActive`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${user.idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(docData)
      }
    );
  } catch (error) {
    console.error('Error updating user profile:', error);
  }
}

// ============== Leaderboard Operations ==============

async function submitTimeToLeaderboard(data) {
  const user = await getValidToken();

  if (!user) {
    return { success: false, error: 'not_authenticated' };
  }

  const leaderboardId = String(data.wordleNumber);
  const completed = data.completed !== undefined ? !!data.completed : (data.guesses <= 6);

  // Check if already submitted today
  const existingEntry = await checkExistingSubmission(leaderboardId, user.uid, user.idToken);
  if (existingEntry) {
    return { success: false, error: 'already_submitted', existingTime: existingEntry.time };
  }

  try {
    const docData = {
      fields: {
        userId: { stringValue: user.uid },
        displayName: { stringValue: user.displayName },
        photoURL: { stringValue: user.photoURL || '' },
        time: { integerValue: String(data.time) },
        guesses: { integerValue: String(data.guesses) },
        wordleDate: { stringValue: data.wordleDate },
        completed: { booleanValue: completed },
        submittedAt: { timestampValue: new Date().toISOString() }
      }
    };

    const response = await fetch(
      `${FIRESTORE_BASE}/leaderboards/${leaderboardId}/entries`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(docData)
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('Firestore error:', error);
      return { success: false, error: error.error?.message || 'submission_failed' };
    }

    // Update user stats
    await updateUserStats(user, data);

    return { success: true };
  } catch (error) {
    console.error('Submit error:', error);
    return { success: false, error: error.message };
  }
}

async function checkExistingSubmission(wordleNumber, userId, idToken) {
  try {
    const query = {
      structuredQuery: {
        from: [{ collectionId: 'entries' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'userId' },
            op: 'EQUAL',
            value: { stringValue: userId }
          }
        },
        limit: 1
      }
    };

    const response = await fetch(
      `${FIRESTORE_BASE}/leaderboards/${wordleNumber}:runQuery`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(query)
      }
    );

    const results = await response.json();

    if (results && results[0] && results[0].document) {
      const doc = results[0].document;
      return {
        time: parseInt(doc.fields.time?.integerValue || 0)
      };
    }

    return null;
  } catch (error) {
    console.error('Check existing submission error:', error);
    return null;
  }
}

async function fetchLeaderboard(wordleNumber) {
  const user = await getValidToken();

  if (!user) {
    return { success: false, error: 'not_authenticated', entries: [] };
  }

  const leaderboardId = String(wordleNumber);

  try {
    const allEntries = await fetchLeaderboardEntries(leaderboardId, user.idToken, user.uid);

    // Assign ranks after sorting by time
    const entries = allEntries.map((entry, idx) => ({
      ...entry,
      rank: idx + 1
    }));

    const userEntry = entries.find(e => e.isCurrentUser);

    return {
      success: true,
      entries,
      userRank: userEntry ? userEntry.rank : null,
      userTime: userEntry ? userEntry.time : null
    };
  } catch (error) {
    console.error('Fetch leaderboard error:', error);
    return { success: false, error: error.message, entries: [] };
  }
}

async function fetchLeaderboardEntries(leaderboardId, idToken, userId) {
  if (!leaderboardId) return [];

  const query = {
    structuredQuery: {
      from: [{ collectionId: 'entries' }],
      orderBy: [{ field: { fieldPath: 'time' }, direction: 'ASCENDING' }],
      limit: 50
    }
  };

  const response = await fetch(
    `${FIRESTORE_BASE}/leaderboards/${leaderboardId}:runQuery`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(query)
    }
  );

  if (!response.ok) {
    let detail = '';
    try {
      const errJson = await response.json();
      detail = errJson?.error?.message || JSON.stringify(errJson);
    } catch (_) {
      detail = response.statusText;
    }
    throw new Error(`Firestore query failed for ${leaderboardId}: ${detail}`);
  }

  const results = await response.json();

  if (!Array.isArray(results)) return [];

  return results
    .filter(r => r.document)
    .map((r, index) => ({
      docId: r.document.name?.split('/').pop() || `${leaderboardId}-${index}`,
      displayName: r.document.fields.displayName?.stringValue || 'Anonymous',
      photoURL: r.document.fields.photoURL?.stringValue || '',
      time: parseInt(r.document.fields.time?.integerValue || 0),
      guesses: parseInt(r.document.fields.guesses?.integerValue || 0),
      completed: r.document.fields.completed?.booleanValue !== undefined ? r.document.fields.completed.booleanValue : (parseInt(r.document.fields.guesses?.integerValue || 0) <= 6),
      isCurrentUser: r.document.fields.userId?.stringValue === userId
    }));
}

async function updateUserStats(user, data) {
  try {
    // First, get current stats
    const response = await fetch(
      `${FIRESTORE_BASE}/users/${user.uid}`,
      {
        headers: {
          'Authorization': `Bearer ${user.idToken}`
        }
      }
    );

    let totalGames = 0;
    let totalTime = 0;
    let bestTime = data.time;

    if (response.ok) {
      const doc = await response.json();
      if (doc.fields) {
        totalGames = parseInt(doc.fields.totalGames?.integerValue || 0);
        const avgTime = parseFloat(doc.fields.averageTime?.doubleValue || 0);
        totalTime = avgTime * totalGames;
        bestTime = Math.min(data.time, parseInt(doc.fields.bestTime?.integerValue || data.time));
      }
    }

    // Calculate new stats
    totalGames += 1;
    totalTime += data.time;
    const newAvgTime = totalTime / totalGames;

    // Update stats
    const statsData = {
      fields: {
        totalGames: { integerValue: String(totalGames) },
        averageTime: { doubleValue: newAvgTime },
        bestTime: { integerValue: String(bestTime) },
        lastActive: { timestampValue: new Date().toISOString() }
      }
    };

    await fetch(
      `${FIRESTORE_BASE}/users/${user.uid}?updateMask.fieldPaths=totalGames&updateMask.fieldPaths=averageTime&updateMask.fieldPaths=bestTime&updateMask.fieldPaths=lastActive`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${user.idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(statsData)
      }
    );
  } catch (error) {
    console.error('Error updating user stats:', error);
  }
}

async function getUserStats() {
  const user = await getValidToken();

  if (!user) {
    return { success: false, error: 'not_authenticated' };
  }

  try {
    const response = await fetch(
      `${FIRESTORE_BASE}/users/${user.uid}`,
      {
        headers: {
          'Authorization': `Bearer ${user.idToken}`
        }
      }
    );

    if (response.ok) {
      const doc = await response.json();
      const totalGames = parseInt(doc.fields?.totalGames?.integerValue || 0);
      const averageTime = parseFloat(doc.fields?.averageTime?.doubleValue || 0);
      const bestTime = parseInt(doc.fields?.bestTime?.integerValue || 0);

      if (totalGames > 0) {
        return { success: true, stats: { totalGames, averageTime, bestTime } };
      }
    }

    // Fallback: compute from all leaderboard entries for this user (collection group)
    const computed = await computeStatsFromEntries(user);
    if (computed) {
      // Persist computed stats so next load is fast
      await persistComputedStats(user, computed);
      return { success: true, stats: computed };
    }

    return { success: true, stats: { totalGames: 0, averageTime: 0, bestTime: 0 } };
  } catch (error) {
    console.error('Get user stats error:', error);
    return { success: false, error: error.message };
  }
}

async function computeStatsFromEntries(user) {
  try {
    const query = {
      structuredQuery: {
        from: [{ collectionId: 'entries', allDescendants: true }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'userId' },
            op: 'EQUAL',
            value: { stringValue: user.uid }
          }
        }
      }
    };

    const response = await fetch(
      `${FIRESTORE_BASE}:runQuery`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(query)
      }
    );

    const results = await response.json();
    if (!Array.isArray(results)) return null;

    const times = results
      .filter(r => r.document && r.document.fields?.time?.integerValue)
      .map(r => parseInt(r.document.fields.time.integerValue, 10))
      .filter(t => Number.isFinite(t) && t >= 0);

    if (times.length === 0) return null;

    const totalGames = times.length;
    const totalTime = times.reduce((sum, t) => sum + t, 0);
    const averageTime = totalTime / totalGames;
    const bestTime = Math.min(...times);

    return { totalGames, averageTime, bestTime };
  } catch (err) {
    console.error('Compute stats from entries failed:', err);
    return null;
  }
}

async function persistComputedStats(user, stats) {
  try {
    const statsData = {
      fields: {
        totalGames: { integerValue: String(stats.totalGames) },
        averageTime: { doubleValue: stats.averageTime },
        bestTime: { integerValue: String(stats.bestTime) },
        lastActive: { timestampValue: new Date().toISOString() }
      }
    };

    await fetch(
      `${FIRESTORE_BASE}/users/${user.uid}?updateMask.fieldPaths=totalGames&updateMask.fieldPaths=averageTime&updateMask.fieldPaths=bestTime&updateMask.fieldPaths=lastActive`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${user.idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(statsData)
      }
    );
  } catch (err) {
    console.error('Persist computed stats failed:', err);
  }
}

async function getAchievements() {
  try {
    const { gamification } = await chrome.storage.local.get('gamification');

    const ACHIEVEMENTS = [
      { id: 'first_win', name: 'First Victory', description: 'Complete your first Wordle', icon: '🎉' },
      { id: 'speed_demon', name: 'Speed Demon', description: 'Win in under 60 seconds', icon: '⚡' },
      { id: 'streak_5', name: 'On Fire', description: 'Achieve a 5-day win streak', icon: '🔥' },
      { id: 'streak_10', name: 'Unstoppable', description: 'Achieve a 10-day win streak', icon: '💪' },
      { id: 'streak_30', name: 'Legend', description: 'Achieve a 30-day win streak', icon: '👑' },
      { id: 'stars_50', name: 'Star Collector', description: 'Earn 50 stars', icon: '⭐' },
      { id: 'stars_100', name: 'Star Master', description: 'Earn 100 stars', icon: '🌟' },
      { id: 'games_10', name: 'Dedicated', description: 'Complete 10 Wordles', icon: '📚' },
      { id: 'games_50', name: 'Veteran', description: 'Complete 50 Wordles', icon: '🎖️' },
      { id: 'games_100', name: 'Century Club', description: 'Complete 100 Wordles', icon: '💯' }
    ];

    const unlocked = gamification?.achievements || [];

    return {
      success: true,
      achievements: ACHIEVEMENTS.map(achievement => ({
        ...achievement,
        unlocked: unlocked.includes(achievement.id)
      }))
    };
  } catch (err) {
    console.error('Get achievements error:', err);
    return { success: false, error: err.message, achievements: [] };
  }
}
