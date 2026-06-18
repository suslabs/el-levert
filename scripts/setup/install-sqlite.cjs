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

function runNpm(cwd, args, options = {}) {
    const npmPath = process.env.npm_execpath,
        runOptions = { cwd, ...options };

    if (typeof npmPath === "string" && npmPath.length > 0) {
        run(process.execPath, [npmPath, ...args], runOptions);
        return;
    }

    run("npm", args, runOptions);
}

function compileSubmodule() {
    runNpm(submodulePath, ["ci", "--build-from-source"]);
}

function linkSubmodule() {
    const targetPath = path.join(repoRoot, "node_modules", "sqlite3");

    try {
        fs.rmSync(targetPath, { recursive: true, force: true });
    } catch (err) {}

    fs.symlinkSync(submodulePath, targetPath, process.platform === "win32" ? "junction" : "dir");
}

ensureSubmodule();
compileSubmodule();
linkSubmodule();

console.log("\n✓ SQLite submodule linked successfully.");
