import fs from "node:fs/promises";
import path from "node:path";

import { createDiscordMessage } from "./discordStubs.js";
import { cleanupRuntime, createRuntime } from "./runtimeHarness.js";

function createCommandRuntime(options = {}) {
    return createRuntime({
        loadManagers: true,
        loadVMs: options.loadVMs ?? false,
        loadHandlers: options.loadHandlers ?? false,
        config: options.config,
        reactions: options.reactions,
        auth: options.auth,
        discordOverrides: options.discordOverrides,
        clientOverrides: options.clientOverrides
    });
}

function getCommand(runtime, name) {
    const command = runtime.client.commandManager.searchCommands(name);

    if (command == null) {
        throw new Error(`Command "${name}" was not loaded`);
    }

    return command;
}

function getCliCommand(runtime, name) {
    const command = runtime.client.cliCommandManager.searchCommands(name);

    if (command == null) {
        throw new Error(`CLI command "${name}" was not loaded`);
    }

    return command;
}

function createCommandMessage(content, overrides = {}) {
    return createDiscordMessage(content, overrides);
}

function createDiscordCommandContext(command, argsText = "", options = {}) {
    const msg = options.msg ?? createCommandMessage("");

    return command.createContext({
        commandName: command.name,
        raw: msg.content,
        rawContent: argsText,
        argsText,
        msg,
        author: options.author ?? msg.author,
        channel: options.channel ?? msg.channel,
        perm: options.perm,
        handler: options.handler,
        isEdit: options.isEdit ?? false,
        parseResult: options.parseResult ?? {
            raw: msg.content,
            content: argsText,
            name: command.name,
            argsText
        }
    });
}

function createCliCommandContext(command, argsText = "", options = {}) {
    return command.createContext({
        commandName: command.name,
        raw: argsText,
        rawContent: argsText,
        argsText,
        line: options.line ?? argsText,
        handler: options.handler,
        parseResult: options.parseResult ?? {
            raw: argsText,
            content: argsText,
            name: command.name,
            argsText
        }
    });
}

async function executeCommand(command, argsText = "", options = {}) {
    return await command.execute(createDiscordCommandContext(command, argsText, options), options.executeOptions);
}

async function executeCliCommand(command, argsText = "", options = {}) {
    return await command.execute(createCliCommandContext(command, argsText, options), options.executeOptions);
}

async function addAdmin(runtime, userId = "admin-user", groupName = "admins", level = 8) {
    const permManager = runtime.client.permManager;
    const group = await permManager.addGroup(groupName, level, true);

    await permManager.add(group, userId, true);
    return group;
}

function addTag(runtime, name, body, owner = "user-1", type = "text", options = undefined) {
    return runtime.client.tagManager.add(name, body, owner, type, options);
}

async function createInputDirectory(runtime, dirName, files) {
    const fullDir = path.join(runtime.tempDir, dirName);
    await fs.mkdir(fullDir, { recursive: true });

    for (const [name, body] of Object.entries(files)) {
        const fullPath = path.join(fullDir, name);
        await fs.writeFile(fullPath, body);
    }

    return fullDir;
}

export {
    addAdmin,
    addTag,
    cleanupRuntime,
    createCommandMessage,
    createCliCommandContext,
    createCommandRuntime,
    createDiscordCommandContext,
    executeCliCommand,
    executeCommand,
    createInputDirectory,
    getCliCommand,
    getCommand
};
