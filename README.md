# ⏱️ Wordle Timer Chrome Extension

A Chrome extension that automatically tracks the time you take to solve the daily Wordle puzzle on the NYT website and appends it to your share results.

![Chrome](https://img.shields.io/badge/Chrome-Extension-green?logo=googlechrome)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

## Features

- **Automatic Timing** - Starts automatically when you begin playing
- **Smart Pausing** - Pauses when you switch tabs (no cheating!)
- **Progress Saving** - Saves your progress throughout the day
- **Enhanced Sharing** - Adds your solving time to share results
- **Clean Format** - Shows time in MM:SS format with timer emoji ⏱️

## Installation

### Method 1: Clone from GitHub

```bash
git clone https://github.com/kirtipalve/wordle-timer.git
cd wordle-timer
```

### Method 2: Download ZIP

1. Click the green "Code" button above
2. Select "Download ZIP"
3. Extract the ZIP file

### Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **"Developer mode"** (toggle in top right corner)
3. Click **"Load unpacked"**
4. Select the `wordle_extension` folder
5. The extension is now installed! 🎉

## 🎮 Usage

1. Navigate to [NYT Wordle](https://www.nytimes.com/games/wordle/)
2. Start playing - timer starts automatically! ⏰
3. Complete the puzzle
4. Click **Share** in the results modal
5. Your results are copied with time! 📋

### Example Output

```
Wordle 1630 4/6 ⏱️ 03:45

🟩⬜⬜⬜⬜
🟩🟨⬜⬜⬜
🟩🟩🟩⬜🟩
🟩🟩🟩🟩🟩
```

## How It Works

- The extension uses Chrome's storage API to persist timer data
- Timer data is stored per day, so each new Wordle gets a fresh timer
- The timer pauses when you switch tabs or minimize your browser
- The extension intercepts the share button click to modify the copied text

## Privacy

This extension:
- Only runs on the NYT Wordle website
- Stores timer data locally on your device
- Does not collect or transmit any data
- Does not track your browsing activity

## Technical Details

- **Manifest Version:** 3
- **Permissions:** storage, activeTab
- **Content Script:** Injects into NYT Wordle pages only

## Troubleshooting

**Timer not starting:**
- Make sure you're on the official NYT Wordle page
- Refresh the page and try again
- Check that the extension is enabled in chrome://extensions/

**Share button not working:**
- The extension needs a moment to detect the share button after game completion
- Try waiting 1-2 seconds after the results modal appears

**Time seems incorrect:**
- The timer pauses when you switch tabs to prevent cheating
- Only active time on the Wordle tab is counted

## Contributing

Feel free to submit issues or pull requests if you find bugs or have suggestions for improvements.

## License

MIT License - feel free to use and modify as needed.
