const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../artifacts/ism-financeiro/dist');
const destDir = path.join(__dirname, '../dist');

// Remove existing root dist if it exists
if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true, force: true });
}

// Copy the frontend dist to the root dist
if (fs.existsSync(srcDir)) {
  fs.cpSync(srcDir, destDir, { recursive: true });
  console.log('Successfully copied frontend build to root /dist folder for Vercel.');
} else {
  console.error('Frontend build folder not found at:', srcDir);
  process.exit(1);
}
