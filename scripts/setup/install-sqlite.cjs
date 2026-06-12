const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

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

function ensureSubmodule() {
    const packageJsonPath = path.join(submodulePath, "package.json");

    if (fs.existsSync(packageJsonPath)) {
        return;
    }

    run("git", ["submodule", "update", "--init", "--recursive", "--", "vendor/node-sqlite3"]);
}

function runNpm(args, options = {}) {
    const npmPath = process.env.npm_execpath;

    if (typeof npmPath === "string" && npmPath.length > 0) {
        run(process.execPath, [npmPath, ...args], {
            ...options
        });

        return;
    }

    run("npm", args, options);
}

function prepareSubmodule() {
    runNpm(["ci"], {
        cwd: submodulePath
    });
}

function installFork() {
    runNpm(["install", "--no-save", "--no-package-lock", "--build-from-source", "./vendor/node-sqlite3"]);
}

ensureSubmodule();
prepareSubmodule();
installFork();
