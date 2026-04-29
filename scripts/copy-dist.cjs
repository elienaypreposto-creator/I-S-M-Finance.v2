const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../artifacts/ism-financeiro/dist');
const destDir = path.join(__dirname, '../public'); // Vercel serves 'public' by default

// Remove existing root public if it exists
if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true, force: true });
}

// Copy the frontend dist to the root public
if (fs.existsSync(srcDir)) {
  fs.cpSync(srcDir, destDir, { recursive: true });
  console.log('Successfully copied frontend build to root /public folder for Vercel.');
} else {
  console.error('Frontend build folder not found at:', srcDir);
  process.exit(1);
}
