const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => {
    console.log('PAGE ERROR MESSAGE:', error.message);
    console.log('PAGE ERROR STACK:', error.stack);
  });
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText));

  console.log('Navigating to Vercel app...');
  await page.goto('https://i-s-m-finance-v2.vercel.app', { waitUntil: 'networkidle' });
  
  console.log('Page loaded. Checking root element...');
  const rootHtml = await page.$eval('#root', el => el.innerHTML).catch(() => 'No #root found');
  console.log('Root content length:', rootHtml.length);
  
  await browser.close();
})();
