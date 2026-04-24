#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const ignoredDirs = new Set(['.git', 'node_modules']);

const versionChecks = [
    {
        file: 'src/js/main.js',
        checks: [
            {
                label: 'runtime build version',
                pattern: (version) => new RegExp(`window\\.RUNTIME_BUILD_VERSION = '${escapeRegExp(version)}';`)
            }
        ]
    },
    {
        file: 'index.html',
        checks: [
            {
                label: 'bootstrap version',
                pattern: (version) => new RegExp(`window\\.BOOTSTRAP_VERSION = '${escapeRegExp(version)}';`)
            },
            {
                label: 'manifest cache version',
                pattern: (version) => new RegExp(`href="manifest\\.json\\?v=${escapeRegExp(version)}"`)
            },
            {
                label: 'service worker cache version',
                pattern: (version) => new RegExp(`register\\('\\./sw\\.js\\?v=${escapeRegExp(version)}'`)
            },
            {
                label: 'firebase config cache version',
                pattern: (version) => new RegExp(`src="src/js/firebaseConfig\\.js\\?v=${escapeRegExp(version)}"`)
            },
            {
                label: 'stylesheet cache version',
                pattern: (version) => new RegExp(`href="src/css/style\\.css\\?v=${escapeRegExp(version)}"`)
            },
            {
                label: 'main module cache version',
                pattern: (version) => new RegExp(`src="\\./src/js/main\\.js\\?v=${escapeRegExp(version)}"`)
            },
            {
                label: 'document title version',
                pattern: (version) => new RegExp(`<title>Yurika Online v${escapeRegExp(version)}</title>`)
            },
            {
                label: 'favicon cache version',
                pattern: (version) => new RegExp(`href="src/assets/icon_192_clean\\.webp\\?v=${escapeRegExp(version)}"`)
            },
            {
                label: 'apple touch icon cache version',
                pattern: (version) => new RegExp(`href="src/assets/apple_touch_icon\\.png\\?v=${escapeRegExp(version)}"`)
            }
        ]
    },
    {
        file: 'manifest.json',
        checks: [
            {
                label: '192 icon cache version',
                pattern: (version) => new RegExp(`"src": "src/assets/icon_192_clean\\.webp\\?v=${escapeRegExp(version)}"`)
            },
            {
                label: '512 icon cache version',
                pattern: (version) => new RegExp(`"src": "src/assets/icon_512_clean\\.webp\\?v=${escapeRegExp(version)}"`)
            }
        ]
    },
    {
        file: 'sw.js',
        checks: [
            {
                label: 'service worker app version',
                pattern: (version) => new RegExp(`const APP_VERSION = '${escapeRegExp(version)}';`)
            }
        ]
    },
    {
        file: 'README.md',
        checks: [
            {
                label: 'README deployment version',
                pattern: (version) => new RegExp(`- 배포 버전: \\*\\*${escapeRegExp(version)}\\*\\*`)
            },
            {
                label: 'README current version',
                pattern: (version) => new RegExp(`현재 버전: \\*\\*${escapeRegExp(version)}\\*\\*`)
            }
        ]
    },
    {
        file: 'src/js/world/scenes/LoginScene.js',
        checks: [
            {
                label: 'login scene fallback version',
                pattern: (version) => new RegExp(`const version = window\\.GAME_VERSION \\|\\| '${escapeRegExp(version)}';`)
            }
        ]
    }
];

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toRelativePath(absolutePath) {
    return path.relative(rootDir, absolutePath).split(path.sep).join('/');
}

function readText(relativePath) {
    return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function walkFiles(dir, predicate, files = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (!ignoredDirs.has(entry.name)) {
                walkFiles(path.join(dir, entry.name), predicate, files);
            }
            continue;
        }

        if (entry.isFile()) {
            const absolutePath = path.join(dir, entry.name);
            if (predicate(absolutePath)) {
                files.push(absolutePath);
            }
        }
    }

    return files;
}

function checkJsonFiles(errors) {
    const jsonFiles = walkFiles(rootDir, (absolutePath) => absolutePath.endsWith('.json'));

    for (const absolutePath of jsonFiles) {
        const relativePath = toRelativePath(absolutePath);
        try {
            JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
        } catch (error) {
            errors.push(`${relativePath}: invalid JSON (${error.message})`);
        }
    }

    console.log(`[verify] JSON parse check: ${jsonFiles.length} files`);
}

function checkVersionReferences(errors) {
    const version = readText('version.txt').trim();

    if (!/^\d+\.\d+\.\d+$/.test(version)) {
        errors.push(`version.txt: unsupported version format "${version}"`);
        return;
    }

    for (const fileCheck of versionChecks) {
        let content;
        try {
            content = readText(fileCheck.file);
        } catch (error) {
            errors.push(`${fileCheck.file}: unable to read file (${error.message})`);
            continue;
        }

        for (const check of fileCheck.checks) {
            if (!check.pattern(version).test(content)) {
                errors.push(`${fileCheck.file}: ${check.label} does not match version.txt (${version})`);
            }
        }
    }

    console.log(`[verify] Version reference check: ${version}`);
}

function checkJavaScriptSyntax(errors) {
    const jsFiles = [
        ...walkFiles(path.join(rootDir, 'src/js'), (absolutePath) => absolutePath.endsWith('.js')),
        ...walkFiles(path.join(rootDir, 'scripts'), (absolutePath) => absolutePath.endsWith('.js')),
        path.join(rootDir, 'sw.js')
    ].filter((absolutePath) => fs.existsSync(absolutePath));

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yurika-verify-'));

    try {
        for (const absolutePath of jsFiles) {
            const relativePath = toRelativePath(absolutePath);
            const tempPath = path.join(tempDir, `${relativePath.replace(/[\\/]/g, '__')}.mjs`);

            fs.writeFileSync(tempPath, fs.readFileSync(absolutePath, 'utf8'), 'utf8');

            try {
                execFileSync(process.execPath, ['--check', tempPath], {
                    cwd: rootDir,
                    encoding: 'utf8',
                    stdio: ['ignore', 'pipe', 'pipe']
                });
            } catch (error) {
                const message = String(error.stderr || error.message || '').replaceAll(tempPath, relativePath).trim();
                errors.push(`${relativePath}: JavaScript syntax check failed${message ? `\n${message}` : ''}`);
            }
        }
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }

    console.log(`[verify] JavaScript syntax check: ${jsFiles.length} files`);
}

function main() {
    const errors = [];

    checkJsonFiles(errors);
    checkVersionReferences(errors);
    checkJavaScriptSyntax(errors);

    if (errors.length > 0) {
        console.error('\n[verify] Failed');
        for (const error of errors) {
            console.error(`- ${error}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[verify] Project verification passed');
}

main();
