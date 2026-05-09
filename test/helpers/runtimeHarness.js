import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { vi } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../..");

function buildDefaultConfig(tempDir, overrides = {}) {
    return {
        dbPath: tempDir,
        commandsPath: path.join(repoRoot, "src/commands"),
        cliCommandsPath: path.join(repoRoot, "src/commands/cli"),
        eventsPath: path.join(repoRoot, "src/events"),
        cmdPrefix: "%",
        wrapEvents: false,
        enablePermissions: true,
        enableReminders: true,
        enableEval: true,
        enableOtherLangs: false,
        enableVM2: false,
        enablePreviews: true,
        enableSed: true,
        enableCliCommands: false,
        enableGlobalHandler: false,
        logToDiscord: false,
        logFile: path.join(tempDir, "test.log"),
        logLevel: "error",
        discordLogLevel: "error",
        logChannelId: "",
        logWebhook: "",
        bridgeBotIds: [],
        pingReply: true,
        mentionUsers: false,
        setActivity: false,
        activity: {
            type: "PLAYING",
            text: "tests"
        },
        maxGroupNameLength: 16,
        tagModeratorLevel: 5,
        permissionAdminLevel: 8,
        maxQuota: 10000,
        maxTagSize: 8,
        maxTagNameLength: 32,
        tagNameRegex: "^[A-Za-z0-9\\-_]+$",
        reminderSendInterval: 10,
        memLimit: 16,
        timeLimit: 50,
        otherMemLimit: 16,
        otherTimeLimit: 2,
        commandWaitTime: 3000,
        enableInspector: false,
        outCharLimit: 1900,
        outLineLimit: 30,
        embedCharLimit: 5900,
        embedLineLimit: 30,
        emoji: {
            info: ":information_source:",
            warn: ":warning:",
            error: ":no_entry_sign:",
            ok: ":white_check_mark:",
            invalid: ":police_car:",
            waiting: ":hourglass_flowing_sand:"
        },
        ...overrides
    };
}

function buildDefaultReactions(overrides = {}) {
    return {
        enableReacts: false,
        reactions: [],
        ...overrides
    };
}

function buildDefaultAuth(overrides = {}) {
    return {
        owner: "owner-id",
        token: "test-token",
        ...overrides
    };
}

function silenceLogger(logger) {
    if (logger == null) {
        return;
    }

    for (const transport of logger.transports ?? []) {
        transport.silent = true;
    }
}

function buildDefaultDiscordFns(tempDir) {
    return {
        fetchMessage: async () => null,
        fetchMessages: async () => [],
        findUserById: async id => ({
            id,
            username: `name-${id}`,
            user: {
                id,
                username: `name-${id}`
            },
            send: async () => undefined
        }),
        findUsers: async query => [
            {
                id: `${query}-id`,
                user: {
                    id: `${query}-id`,
                    username: query
                },
                nickname: null,
                displayName: query
            }
        ],
        _attachmentRoot: tempDir
    };
}

async function importFresh(modulePath) {
    return await import(modulePath);
}

async function loadRuntimeManagers(client, Managers, config) {
    await client.loadComponents(
        "managers",
        Managers.default ?? Managers,
        {
            tagManager: [],
            permManager: [config.enablePermissions],
            commandManager: [],
            reminderManager: config.enableReminders,
            cliCommandManager: config.enableCliCommands,
            inputManager: {
                enabled: config.enableCliCommands,
                args: [
                    true,
                    ">",
                    {
                        exitCmd: null
                    }
                ]
            }
        },
        {
            showLogMessages: false,
            showLoadingMessages: false
        }
    );
}

async function loadRuntimeVMs(client, VMs, ModuleUtil, config) {
    await ModuleUtil.resolveBarrel(VMs.default ?? VMs);

    await client.loadComponents(
        "VMs",
        VMs.default ?? VMs,
        {
            tagVM: [config.enableEval],
            tagVM2: [config.enableVM2],
            externalVM: config.enableOtherLangs ? [] : false
        },
        {
            showLogMessages: false,
            showLoadingMessages: false
        }
    );
}

async function loadRuntimeHandlers(client, Handlers, config, reactions) {
    await client.loadComponents(
        "handlers",
        Handlers.default ?? Handlers,
        {
            commandHandler: [],
            previewHandler: [config.enablePreviews],
            reactionHandler: reactions.enableReacts,
            sedHandler: config.enableSed,
            cliCommandHandler: config.enableCliCommands
        },
        {
            showLogMessages: false,
            showLoadingMessages: false
        }
    );

    client._loadMessageProcessor();
}

async function createRuntime(options = {}) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-test-"));

    vi.resetModules();
    await importFresh("../../setupGlobals.js");

    const { LevertClient } = await importFresh("../../src/LevertClient.js"),
        Managers = await importFresh("../../src/managers/index.js"),
        Handlers = await importFresh("../../src/handlers/index.js"),
        VMs = await importFresh("../../src/vm/index.js"),
        ModuleUtil = (await importFresh("../../src/util/misc/ModuleUtil.js")).default;

    const config = buildDefaultConfig(tempDir, options.config),
        reactions = buildDefaultReactions(options.reactions),
        auth = buildDefaultAuth(options.auth);

    const client = new LevertClient({
        config,
        reactions,
        auth
    });

    silenceLogger(client.logger);
    Object.assign(client, buildDefaultDiscordFns(tempDir), options.discordOverrides);

    if (options.clientOverrides != null) {
        Object.assign(client, options.clientOverrides);
    }

    if (options.loadManagers ?? true) {
        await loadRuntimeManagers(client, Managers, config);
    }

    if (options.loadVMs ?? (config.enableEval || config.enableVM2 || config.enableOtherLangs)) {
        await loadRuntimeVMs(client, VMs, ModuleUtil, config);
    }

    if (options.loadHandlers) {
        await loadRuntimeHandlers(client, Handlers, config, reactions);
    }

    if (options.loadEvents) {
        await client._loadEvents();
    }

    return {
        tempDir,
        repoRoot,
        client
    };
}

async function cleanupRuntime(runtime) {
    if (runtime == null) {
        return;
    }

    const { client, tempDir } = runtime;

    try {
        if (client?.components?.get("handler")?.loaded) {
            client._unloadHandlers();
        }
    } catch {}

    try {
        if (client?.components?.get("VM")?.loaded) {
            client._unloadVMs();
        }
    } catch {}

    try {
        if (client?.components?.get("manager")?.loaded) {
            await client._unloadManagers();
        }
    } catch {}

    try {
        if (client?._eventLoader?.loaded) {
            client._unloadEvents();
        }
    } catch {}

    try {
        client?.client?.destroy?.();
    } catch {}

    try {
        client?.logger?.end?.();
    } catch {}

    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
}

async function writeConfigFiles(runtime, configs = {}) {
    const configDir = path.join(runtime.tempDir, "config");
    await fs.mkdir(configDir, { recursive: true });

    const files = {
        "config.json": configs.config ?? runtime.client.config,
        "reactions.json": configs.reactions ?? runtime.client.reactions,
        "auth.json": configs.auth ?? {
            owner: runtime.client.owner,
            token: "test-token"
        }
    };

    for (const [name, data] of Object.entries(files)) {
        const fullPath = path.join(configDir, name);
        await fs.writeFile(fullPath, JSON.stringify(data, null, 4));
    }

    return configDir;
}

export { buildDefaultConfig, cleanupRuntime, createRuntime, repoRoot, writeConfigFiles };
