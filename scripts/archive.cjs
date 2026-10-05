const childProcess = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, ".."),
    outputPath = process.argv[2] ?? path.join(repoRoot, "el-levert.tar.gz");

const excludes = ["node_modules", "db", "vendor", "logs"];
const excludeArgs = excludes.flatMap(item => ["--exclude", item]);

childProcess.execFileSync("tar", [...excludeArgs, "-czf", outputPath, "."], {
    cwd: repoRoot,
    stdio: "inherit"
});

console.log(`\nSuccessfully created archive at: ${outputPath}`);
