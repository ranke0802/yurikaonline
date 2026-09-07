const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
    testDir: './scripts/browser-tests', workers: 1,
    use: { browserName: 'chromium', channel: 'msedge', baseURL: 'http://127.0.0.1:8083' },
    webServer: { command: 'python -m http.server 8083 --bind 127.0.0.1', url: 'http://127.0.0.1:8083', reuseExistingServer: false },
    reporter: 'list', outputDir: 'reports/browser-test-results'
});
