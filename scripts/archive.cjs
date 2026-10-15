const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const yargs = require("yargs");
const { hideBin } = require("yargs/helpers");

const defaultExcludes = [
    "node_modules",
    "db",
    "vendor",
    "logs",
    ".git",
    ".vscode",
    ".agents",
    ".deploy",
    "dist",
    "coverage",
    "scratch",
    "config/auth.json",
    "config/auth.env",
    "*.log",
    "*.tar.gz",
    "*.tgz"
];

const sensitivePatterns = ["config/auth.json", "config/auth.env", ".env"];

function verifyArchive(archivePath) {
    const listOutput = childProcess.execFileSync("tar", ["-ztf", archivePath], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
    });

    const entries = listOutput.split(/\r?\n/).filter(line => line.trim().length > 0);

    for (const entry of entries) {
        const normalized = entry.replace(/^[./\\]+/, "");

        for (const pattern of sensitivePatterns) {
            if (normalized === pattern || normalized.endsWith("/" + pattern)) {
                try {
                    fs.unlinkSync(archivePath);
                } catch (err) {}

                throw new Error(`Security verification failed: archive contains sensitive entry "${entry}".`);
            }
        }
    }

    return entries.length;
}

function resolveDefaultOutput(repoRoot) {
    const pkgPath = path.join(repoRoot, "package.json");

    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

            if (pkg.name) {
                return path.join(repoRoot, `${pkg.name}.tar.gz`);
            }
        } catch (err) {}
    }

    return path.join(repoRoot, "archive.tar.gz");
}

function archive(options = {}) {
    const repoRoot = path.resolve(__dirname, ".."),
        defaultOutput = resolveDefaultOutput(repoRoot);

    const outputPath = path.resolve(options.output ?? defaultOutput),
        outDir = path.dirname(outputPath);

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    let extraExcludes = [];

    if (Array.isArray(options.exclude)) {
        extraExcludes = options.exclude;
    } else if (typeof options.exclude === "string") {
        extraExcludes = [options.exclude];
    }

    const allExcludes = [...defaultExcludes, ...extraExcludes],
        excludeArgs = allExcludes.flatMap(item => ["--exclude", item]);

    const tarArgs = [...excludeArgs, "-czf", outputPath, "."];

    childProcess.execFileSync("tar", tarArgs, {
        cwd: repoRoot,
        stdio: ["ignore", "inherit", "inherit"]
    });

    const count = verifyArchive(outputPath);

    const stat = fs.statSync(outputPath),
        sizeKb = (stat.size / 1024).toFixed(1);

    console.log(`Created archive at ${outputPath} (${sizeKb} KB, ${count} files).`);

    return outputPath;
}

function parseArgs() {
    return yargs(hideBin(process.argv))
        .usage("Usage: npm run archive [options]")
        .options({
            output: {
                alias: "o",
                type: "string",
                describe: "Destination archive file path"
            },
            exclude: {
                alias: "e",
                type: "array",
                string: true,
                describe: "Additional patterns or paths to exclude"
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
        archive(argv);
    } catch (err) {
        console.error(`Archive failed: ${err.message}`);
        process.exit(1);
    }
}

module.exports = {
    archive,
    verifyArchive,
    resolveDefaultOutput,
    parseArgs,
    defaultExcludes,
    sensitivePatterns
};
