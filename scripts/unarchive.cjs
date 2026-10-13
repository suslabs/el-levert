const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const yargs = require("yargs");
const { hideBin } = require("yargs/helpers");

function safeguardConfig(targetDir, relPath) {
    const fullPath = path.join(targetDir, relPath);

    if (fs.existsSync(fullPath)) {
        return fs.readFileSync(fullPath);
    }

    return null;
}

function restoreConfig(targetDir, relPath, content) {
    if (content === null) {
        return;
    }

    const fullPath = path.join(targetDir, relPath),
        parentDir = path.dirname(fullPath);

    if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content);
}

function unarchive(options = {}) {
    const archivePath = path.resolve(options.archive),
        targetDir = path.resolve(options.target);

    if (!fs.existsSync(archivePath)) {
        throw new Error(`Archive not found at '${archivePath}'.`);
    }

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    const authBackup = safeguardConfig(targetDir, path.join("config", "auth.json")),
        envBackup = safeguardConfig(targetDir, ".env");

    console.log(`Extracting archive into ${targetDir}...`);

    childProcess.execFileSync("tar", ["-xzf", archivePath, "-C", targetDir], {
        stdio: "inherit"
    });

    restoreConfig(targetDir, path.join("config", "auth.json"), authBackup);
    restoreConfig(targetDir, ".env", envBackup);

    const shouldClean = options.clean ?? true;

    if (shouldClean) {
        try {
            fs.unlinkSync(archivePath);
        } catch (err) {}
    }

    const shouldInstall = options.install ?? false;

    if (shouldInstall) {
        const pkgPath = path.join(targetDir, "package.json");

        if (fs.existsSync(pkgPath)) {
            console.log(`Installing production dependencies in ${targetDir}...`);

            const isWindows = process.platform === "win32",
                npmCmd = isWindows ? "npm.cmd" : "npm";

            childProcess.execFileSync(npmCmd, ["install", "--omit=dev", "--no-audit", "--no-fund"], {
                cwd: targetDir,
                stdio: "inherit"
            });
        }
    }

    console.log(`Unarchive completed successfully in ${targetDir}.`);

    return { archivePath, targetDir };
}

function parseArgs() {
    return yargs(hideBin(process.argv))
        .usage("Usage: node unarchive.cjs [options]")
        .options({
            archive: {
                alias: "a",
                type: "string",
                demandOption: true,
                describe: "Path to archive file to extract"
            },
            target: {
                alias: "t",
                type: "string",
                demandOption: true,
                describe: "Target extraction directory"
            },
            clean: {
                alias: "c",
                type: "boolean",
                default: true,
                describe: "Remove archive file after extraction"
            },
            install: {
                alias: "i",
                type: "boolean",
                default: false,
                describe: "Run npm install --omit=dev in target directory"
            }
        })
        .alias("help", "h")
        .help("help")
        .version(false)
        .strict()
        .parseSync();
}

if (require.main === module) {
    const argv = parseArgs();

    try {
        unarchive(argv);
    } catch (err) {
        console.error(`Unarchive failed: ${err.message}`);
        process.exit(1);
    }
}

module.exports = {
    unarchive,
    safeguardConfig,
    restoreConfig,
    parseArgs
};
