const fs = require('fs');
const { JSDOM } = require('jsdom');

let html = fs.readFileSync('public/index.html', 'utf-8');
const scriptCode = fs.readFileSync('public/scripts.js', 'utf-8');

// Replace the external script tag with inline script
html = html.replace(
  '<script src="/scripts.js"></script>',
  `<script>
    // Pre-set token
    localStorage.setItem('voidkid_session_token', 'fake-test-token-123');
    // Mock fetch
    window.fetch = async (url, options = {}) => ({
      ok: true,
      status: 200,
      json: async () => {
        if (url.includes('/api/users')) return [];
        if (url.includes('/api/kickerz/viewbot/status')) return { active: false, logs: [] };
        if (url.includes('/api/kickerz/accounts/status')) return { active: false, logs: [], totalCount: 0, successes: [] };
        if (url.includes('/api/kick/auth/me')) return { loggedIn: false };
        return {};
      },
      text: async () => ""
    });
    window.alert = () => {};
  </script>
  <script>${scriptCode}</script>`
);

const dom = new JSDOM(html, {
  url: "http://localhost:4000/",
  runScripts: "dangerously",
  pretendToBeVisual: true
});

const window = dom.window;
const document = window.document;

setTimeout(() => {
  const dashboard = document.getElementById('dashboard');
  const navItems = document.querySelectorAll('.nav-item');
  
  console.log("Dashboard display:", dashboard?.style.display);
  console.log("Nav items:", navItems.length);

  console.log("\n--- Click 'Kick Livestreams' ---");
  const kickNav = navItems[2];
  if (kickNav) {
    kickNav.click();
    console.log("Active nav:", document.querySelector('.nav-item.active')?.textContent.trim());
    console.log("Active pane:", document.querySelector('.tab-pane.active')?.id);
    console.log("Page title:", document.getElementById('page-title')?.textContent);
  }

  console.log("\n--- Click 'Registered Users' ---");
  const usersNav = navItems[1];
  if (usersNav) {
    usersNav.click();
    console.log("Active nav:", document.querySelector('.nav-item.active')?.textContent.trim());
    console.log("Active pane:", document.querySelector('.tab-pane.active')?.id);
  }

  console.log("\n--- Click 'Stream Panel' ---");
  const streamNav = navItems[0];
  if (streamNav) {
    streamNav.click();
    console.log("Active nav:", document.querySelector('.nav-item.active')?.textContent.trim());
    console.log("Active pane:", document.querySelector('.tab-pane.active')?.id);
  }

  process.exit(0);
}, 500);
