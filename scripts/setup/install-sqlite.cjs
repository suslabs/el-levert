const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", ".."),
    submodulePath = path.join(repoRoot, "vendor", "node-sqlite3");

function run(command, args, options = {}) {
    childProcess.execFileSync(command, args, {
        cwd: repoRoot,
        shell: process.platform === "win32",
        stdio: "inherit",
        ...options
    });
}

function getPythonPath() {
    if (process.env.npm_config_python) {
        return process.env.npm_config_python;
    }

    if (process.env.PYTHON) {
        return process.env.PYTHON;
    }

    const versionsPath = path.join(process.env.USERPROFILE ?? "", ".pyenv", "pyenv-win", "versions");

    if (!fs.existsSync(versionsPath)) {
        return undefined;
    }

    const versions = fs.readdirSync(versionsPath, {
        withFileTypes: true
    });

    for (const versionPrefix of ["3.7", "3.8", "3.9", "3.10", "3.11", "3.12", "3.13", "3.14"]) {
        const version = versions.find(entry => entry.isDirectory() && entry.name.startsWith(versionPrefix))?.name;

        if (version == null) {
            continue;
        }

        const pythonPath = path.join(versionsPath, version, "python.exe");

        if (fs.existsSync(pythonPath)) {
            return pythonPath;
        }
    }

    return undefined;
}

function ensureSubmodule() {
    if (fs.existsSync(path.join(submodulePath, "package.json"))) {
        return;
    }

    run("git", ["submodule", "update", "--init", "--recursive", "--", "vendor/node-sqlite3"]);
}

function getInstallEnv() {
    const pythonPath = getPythonPath(),
        env = {
            ...process.env
        };

    if (pythonPath != null) {
        env.PYTHON = pythonPath;
        env.npm_config_python = pythonPath;
    }

    return env;
}

function prepareSubmodule() {
    run("npm", ["install", "--ignore-scripts"], {
        cwd: submodulePath,
        env: getInstallEnv()
    });
}

function packFork() {
    const packResult = childProcess.execFileSync("npm", ["pack"], {
        cwd: submodulePath,
        encoding: "utf8",
        env: getInstallEnv(),
        shell: process.platform === "win32"
    });

    const archiveName = packResult.trim().split(/\r?\n/).at(-1);
    return path.join(submodulePath, archiveName);
}

function installFork() {
    const env = getInstallEnv(),
        archivePath = packFork();

    try {
        run("npm", ["install", "--no-save", "--build-from-source", archivePath], {
            env
        });
    } finally {
        if (fs.existsSync(archivePath)) {
            fs.unlinkSync(archivePath);
        }
    }
}

ensureSubmodule();
prepareSubmodule();
installFork();
