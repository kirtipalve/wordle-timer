// Icon Generator for Wordle Timer Extension
// Run with: node icons/generate-icons.js
// Requires: npm install canvas

const fs = require('fs');
const path = require('path');

// Try to use canvas if available, otherwise provide instructions
let createCanvas;
try {
  createCanvas = require('canvas').createCanvas;
} catch (e) {
  console.log('Canvas not installed. Install with: npm install canvas');
  console.log('Or manually create icon16.png, icon48.png, and icon128.png');
  console.log('\nAlternatively, use any image editor to create timer/stopwatch icons.');
  process.exit(0);
}

const sizes = [16, 48, 128];

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background - Wordle green
  ctx.fillStyle = '#538d4e';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // Timer circle
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.08;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.35, 0, Math.PI * 2);
  ctx.stroke();

  // Timer hands
  ctx.lineCap = 'round';

  // Hour hand
  ctx.lineWidth = size * 0.06;
  ctx.beginPath();
  ctx.moveTo(size / 2, size / 2);
  ctx.lineTo(size / 2, size * 0.3);
  ctx.stroke();

  // Minute hand
  ctx.lineWidth = size * 0.04;
  ctx.beginPath();
  ctx.moveTo(size / 2, size / 2);
  ctx.lineTo(size * 0.65, size * 0.4);
  ctx.stroke();

  // Center dot
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.05, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

// Generate icons
sizes.forEach(size => {
  const canvas = generateIcon(size);
  const buffer = canvas.toBuffer('image/png');
  const filename = path.join(__dirname, `icon${size}.png`);
  fs.writeFileSync(filename, buffer);
  console.log(`Generated ${filename}`);
});

console.log('\nIcons generated successfully!');
