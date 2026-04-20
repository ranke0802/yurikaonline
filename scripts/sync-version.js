#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

const managedFiles = [
    'version.txt',
    'src/js/main.js',
    'src/js/world/scenes/LoginScene.js',
    'index.html',
    'manifest.json',
    'sw.js',
    'README.md'
];

const args = process.argv.slice(2);
const shouldBump = args.includes('--bump');
const shouldStage = args.includes('--stage');
const bumpModeIndex = args.indexOf('--bump');
const bumpMode = bumpModeIndex >= 0 ? (args[bumpModeIndex + 1] || 'patch') : 'sync';

function normalizeEol(content) {
    return content.replace(/\r\n/g, '\n');
}

function readFile(relativePath) {
    return normalizeEol(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

function writeFile(relativePath, content, changedFiles) {
    const absolutePath = path.join(rootDir, relativePath);
    const current = normalizeEol(fs.readFileSync(absolutePath, 'utf8'));
    const normalized = normalizeEol(content);
    if (current === normalized) return;
    fs.writeFileSync(absolutePath, normalized, 'utf8');
    changedFiles.push(relativePath);
}

function padToWidth(value, width) {
    return String(value).padStart(width, '0');
}

function bumpVersion(version, mode) {
    const parts = version.trim().split('.');
    if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) {
        throw new Error(`Unsupported version format: ${version}`);
    }

    const widths = parts.map((part) => part.length);
    const numbers = parts.map((part) => Number(part));

    if (mode === 'major') {
        numbers[0] += 1;
        numbers[1] = 0;
        numbers[2] = 0;
    } else if (mode === 'minor') {
        numbers[1] += 1;
        numbers[2] = 0;
    } else {
        numbers[2] += 1;
    }

    return numbers.map((value, index) => padToWidth(value, widths[index])).join('.');
}

function replaceOrThrow(content, pattern, replacement, label) {
    if (!pattern.test(content)) {
        throw new Error(`Could not find ${label}`);
    }
    pattern.lastIndex = 0;
    return content.replace(pattern, replacement);
}

function buildReadmeBlock(version, dateText) {
    return [
        '<!-- AUTO_VERSION_BLOCK_START -->',
        '## Build Metadata',
        `- \uBC30\uD3EC \uBC84\uC804: **${version}**`,
        `- \uB9C8\uC9C0\uB9C9 \uBC84\uC804 \uAC31\uC2E0: ${dateText}`,
        '<!-- AUTO_VERSION_BLOCK_END -->'
    ].join('\n');
}

function syncReadme(version, dateText, changedFiles) {
    const relativePath = 'README.md';
    let content = readFile(relativePath);
    const block = buildReadmeBlock(version, dateText);
    const blockPattern = /<!-- AUTO_VERSION_BLOCK_START -->[\s\S]*?<!-- AUTO_VERSION_BLOCK_END -->/;

    if (blockPattern.test(content)) {
        content = content.replace(blockPattern, block);
    } else {
        const serviceLinkLine = '> **Service Link:** [https://yurika-online.web.app/](https://yurika-online.web.app/)';
        if (!content.includes(serviceLinkLine)) {
            throw new Error('Could not find README service link block');
        }
        content = content.replace(serviceLinkLine, `${serviceLinkLine}\n\n${block}`);
    }

    content = content.replace(/\uD604\uC7AC \uBC84\uC804:\s*\*\*[^*]+\*\*/g, `\uD604\uC7AC \uBC84\uC804: **${version}**`);
    writeFile(relativePath, content, changedFiles);
}

function syncFiles(version, changedFiles) {
    const dateText = new Date().toISOString().slice(0, 10);

    writeFile('version.txt', `${version}\n`, changedFiles);

    let mainJs = readFile('src/js/main.js');
    if (/window\.RUNTIME_BUILD_VERSION = '[^']+';[^\r\n]*/.test(mainJs)) {
        mainJs = replaceOrThrow(
            mainJs,
            /window\.RUNTIME_BUILD_VERSION = '[^']+';[^\r\n]*/,
            `window.RUNTIME_BUILD_VERSION = '${version}'; // Synced with version.txt`,
            'main.js runtime version declaration'
        );
    } else {
        mainJs = replaceOrThrow(
            mainJs,
            /window\.GAME_VERSION = '[^']+';[^\r\n]*/,
            `window.RUNTIME_BUILD_VERSION = '${version}'; // Synced with version.txt\nwindow.GAME_VERSION = window.RUNTIME_BUILD_VERSION;`,
            'main.js version declaration'
        );
    }
    writeFile('src/js/main.js', mainJs, changedFiles);

    let loginScene = readFile('src/js/world/scenes/LoginScene.js');
    loginScene = replaceOrThrow(
        loginScene,
        /const version = window\.GAME_VERSION \|\| '[^']+';/,
        `const version = window.GAME_VERSION || '${version}';`,
        'LoginScene fallback version'
    );
    writeFile('src/js/world/scenes/LoginScene.js', loginScene, changedFiles);

    let indexHtml = readFile('index.html');
    indexHtml = replaceOrThrow(
        indexHtml,
        /window\.BOOTSTRAP_VERSION = '[^']+';/,
        `window.BOOTSTRAP_VERSION = '${version}';`,
        'index.html bootstrap version'
    );
    indexHtml = replaceOrThrow(
        indexHtml,
        /<link rel="manifest" href="manifest\.json\?v=[^"]+">/,
        `<link rel="manifest" href="manifest.json?v=${version}">`,
        'index.html manifest version'
    );
    if (/navigator\.serviceWorker\.register\('\.\/sw\.js\?v=[^']+',\s*\{[^)]*\}\)/.test(indexHtml)) {
        indexHtml = replaceOrThrow(
            indexHtml,
            /navigator\.serviceWorker\.register\('\.\/sw\.js\?v=[^']+',\s*\{[^)]*\}\)/,
            `navigator.serviceWorker.register('./sw.js?v=${version}', { updateViaCache: 'none' })`,
            'index.html service worker registration'
        );
    } else {
        indexHtml = replaceOrThrow(
            indexHtml,
            /navigator\.serviceWorker\.register\('\.\/sw\.js\?v=[^']+'\)/,
            `navigator.serviceWorker.register('./sw.js?v=${version}', { updateViaCache: 'none' })`,
            'index.html service worker registration'
        );
    }
    indexHtml = replaceOrThrow(
        indexHtml,
        /<link rel="stylesheet" href="src\/css\/style\.css\?v=[^"]+">/,
        `<link rel="stylesheet" href="src/css/style.css?v=${version}">`,
        'index.html stylesheet version'
    );
    indexHtml = replaceOrThrow(
        indexHtml,
        /<script src="src\/js\/firebaseConfig\.js(?:\?v=[^"]+)?"><\/script>/,
        `<script src="src/js/firebaseConfig.js?v=${version}"></script>`,
        'index.html firebase config version'
    );
    indexHtml = replaceOrThrow(
        indexHtml,
        /<title>Yurika Online v?[^<]+<\/title>/,
        `<title>Yurika Online v${version}</title>`,
        'index.html title version'
    );
    indexHtml = replaceOrThrow(
        indexHtml,
        /<link rel="icon" type="image\/webp" href="src\/assets\/icon_192_clean\.webp\?v=[^"]+">/,
        `<link rel="icon" type="image/webp" href="src/assets/icon_192_clean.webp?v=${version}">`,
        'index.html favicon version'
    );
    indexHtml = replaceOrThrow(
        indexHtml,
        /<link rel="apple-touch-icon" href="src\/assets\/apple_touch_icon\.png\?v=[^"]+">/,
        `<link rel="apple-touch-icon" href="src/assets/apple_touch_icon.png?v=${version}">`,
        'index.html apple touch icon version'
    );
    indexHtml = replaceOrThrow(
        indexHtml,
        /<script type="module" src="\.\/src\/js\/main\.js\?v=[^"]+"><\/script>/,
        `<script type="module" src="./src/js/main.js?v=${version}"></script>`,
        'index.html main module version'
    );
    writeFile('index.html', indexHtml, changedFiles);

    let manifestJson = readFile('manifest.json');
    manifestJson = replaceOrThrow(
        manifestJson,
        /"src": "src\/assets\/icon_192_clean\.webp(?:\?v=[^"]+)?"/,
        `"src": "src/assets/icon_192_clean.webp?v=${version}"`,
        'manifest 192 icon version'
    );
    manifestJson = replaceOrThrow(
        manifestJson,
        /"src": "src\/assets\/icon_512_clean\.webp(?:\?v=[^"]+)?"/,
        `"src": "src/assets/icon_512_clean.webp?v=${version}"`,
        'manifest 512 icon version'
    );
    writeFile('manifest.json', manifestJson, changedFiles);

    let swJs = readFile('sw.js');
    if (/const APP_VERSION = '[^']+';/.test(swJs)) {
        swJs = replaceOrThrow(
            swJs,
            /const APP_VERSION = '[^']+';/,
            `const APP_VERSION = '${version}';`,
            'sw.js app version'
        );
    } else {
        swJs = replaceOrThrow(
            swJs,
            /const CACHE_NAME = 'yurika-online-[^']+';/,
            `const CACHE_NAME = 'yurika-online-${version}';`,
            'sw.js cache name'
        );
    }
    writeFile('sw.js', swJs, changedFiles);

    syncReadme(version, dateText, changedFiles);
}

function stageFiles(changedFiles) {
    if (!shouldStage || changedFiles.length === 0) return;
    execFileSync('git', ['add', ...changedFiles], {
        cwd: rootDir,
        stdio: 'inherit'
    });
}

function main() {
    const changedFiles = [];
    const currentVersion = readFile('version.txt').trim();
    const nextVersion = shouldBump ? bumpVersion(currentVersion, bumpMode) : currentVersion;

    syncFiles(nextVersion, changedFiles);
    stageFiles(changedFiles);

    const action = shouldBump ? 'bumped' : 'synced';
    console.log(`[version-sync] ${action} version ${currentVersion} -> ${nextVersion}`);
    if (changedFiles.length > 0) {
        console.log(`[version-sync] updated: ${changedFiles.join(', ')}`);
    }
}

main();
