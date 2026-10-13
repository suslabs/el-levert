const fs = require("node:fs");
const path = require("node:path");

const SftpClient = require("ssh2-sftp-client");
const yargs = require("yargs");
const { hideBin } = require("yargs/helpers");

const { resolveDefaultOutput } = require("./archive.cjs");

function resolveConnectionConfig(options = {}) {
    const host = options.host ?? process.env.DEPLOY_HOST;

    if (!host) {
        throw new Error("Remote host is required (--host or DEPLOY_HOST).");
    }

    const username = options.user ?? process.env.DEPLOY_USER;

    if (!username) {
        throw new Error("Remote username is required (--user or DEPLOY_USER).");
    }

    const port = options.port ? parseInt(options.port, 10) : parseInt(process.env.DEPLOY_PORT ?? "22", 10),
        password = options.password ?? process.env.DEPLOY_PASSWORD ?? null,
        keyPath = options.key ?? process.env.DEPLOY_KEY ?? null;

    let privateKey = null;

    if (keyPath) {
        const resolvedKeyPath = path.resolve(keyPath);

        if (!fs.existsSync(resolvedKeyPath)) {
            throw new Error(`Private key file not found at '${resolvedKeyPath}'.`);
        }

        privateKey = fs.readFileSync(resolvedKeyPath);
    }

    if (!password && !privateKey) {
        throw new Error(
            "Authentication required: specify private key path (--key or DEPLOY_KEY) or password (--password or DEPLOY_PASSWORD)."
        );
    }

    const clientConfig = { host, port, username };

    if (password) {
        clientConfig.password = password;
    }

    if (privateKey) {
        clientConfig.privateKey = privateKey;
    }

    return clientConfig;
}

function resolveArchive(options, repoRoot) {
    if (options.archive) {
        const resolved = path.resolve(options.archive);

        if (!fs.existsSync(resolved)) {
            throw new Error(`Archive not found at '${resolved}'.`);
        }

        return resolved;
    }

    const defaultPath = resolveDefaultOutput(repoRoot);

    if (!fs.existsSync(defaultPath)) {
        throw new Error(`Default archive not found at '${defaultPath}'. Run archive first.`);
    }

    return defaultPath;
}

function executeRemote(sshClient, command) {
    return new Promise((resolve, reject) => {
        sshClient.exec(command, (err, stream) => {
            if (err) {
                return reject(err);
            }

            let stderr = "";

            stream.on("close", (code, signal) => {
                if (code !== 0) {
                    const message = stderr.trim() || `Remote command failed with exit code ${code}`;
                    return reject(new Error(message));
                }

                resolve();
            });

            stream.on("data", data => {
                process.stdout.write(data);
            });

            stream.stderr.on("data", data => {
                stderr += data;
                process.stderr.write(data);
            });
        });
    });
}

async function upload(options = {}) {
    const repoRoot = path.resolve(__dirname, ".."),
        localArchive = resolveArchive(options, repoRoot);

    const remoteDir = options.remoteDir ?? options["remote-dir"] ?? process.env.DEPLOY_REMOTE_DIR ?? "/tmp",
        archiveName = path.basename(localArchive);

    const remoteArchive = path.posix.join(remoteDir, archiveName),
        remoteScript = path.posix.join(remoteDir, "unarchive.cjs");

    const localScript = path.join(__dirname, "unarchive.cjs"),
        connectionConfig = resolveConnectionConfig(options);

    console.log(`Connecting to ${connectionConfig.username}@${connectionConfig.host}:${connectionConfig.port}...`);

    const sftp = new SftpClient();

    try {
        await sftp.connect(connectionConfig);

        console.log(`Uploading archive to ${remoteArchive}...`);
        await sftp.fastPut(localArchive, remoteArchive);

        if (fs.existsSync(localScript)) {
            console.log(`Uploading unarchive script to ${remoteScript}...`);
            await sftp.fastPut(localScript, remoteScript);
        }

        const pm2App = options.pm2 ?? options["pm2"];

        if (typeof pm2App === "string" && pm2App.trim().length > 0) {
            console.log(`Restarting PM2 application '${pm2App}'...`);
            const pm2Cmd = `pm2 reload "${pm2App}" || pm2 restart "${pm2App}"`;
            await executeRemote(sftp.client, pm2Cmd);
        }

        console.log(`Upload complete. Run on remote: node ${remoteScript} --archive ${remoteArchive}`);

        return { localArchive, remoteArchive, remoteScript };
    } finally {
        await sftp.end();
    }
}

function parseArgs() {
    return yargs(hideBin(process.argv))
        .usage("Usage: npm run upload [options]")
        .options({
            host: {
                alias: "H",
                type: "string",
                describe: "Remote SSH host"
            },
            user: {
                alias: "u",
                type: "string",
                describe: "Remote SSH username"
            },
            port: {
                alias: "p",
                type: "number",
                describe: "Remote SSH port"
            },
            password: {
                type: "string",
                describe: "Remote SSH password"
            },
            key: {
                alias: "k",
                type: "string",
                describe: "Path to SSH private key file"
            },
            archive: {
                alias: "a",
                type: "string",
                describe: "Path to local archive file to upload"
            },
            "remote-dir": {
                alias: "r",
                type: "string",
                default: "/tmp",
                describe: "Remote directory for upload destination"
            },
            pm2: {
                type: "string",
                describe: "PM2 application name to restart (optional)"
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

    upload(argv).catch(err => {
        console.error(`Upload failed: ${err.message}`);
        process.exit(1);
    });
}

module.exports = {
    upload,
    resolveConnectionConfig,
    resolveArchive,
    executeRemote,
    parseArgs
};
