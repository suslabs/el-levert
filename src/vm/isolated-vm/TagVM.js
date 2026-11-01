import VM from "../VM.js";

import RunnerProcess from "./RunnerProcess.js";
import GatewayClient from "@el-levert/common/gateway/GatewayClient.js";
import RPCChannel from "@el-levert/common/gateway/rpc/RPCChannel.js";
import FakeMsg from "./classes/FakeMsg.js";
import FakeUser from "./classes/FakeUser.js";

import { getConfig, getLogger, getClient } from "../../LevertClient.js";

import Util from "@el-levert/common/util/Util.js";
import ObjectUtil from "@el-levert/common/util/ObjectUtil.js";
import ArrayUtil from "@el-levert/common/util/ArrayUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import LoggerUtil from "../../util/LoggerUtil.js";
import Benchmark from "../../util/misc/Benchmark.js";

import VMError from "@el-levert/common/errors/VMError.js";
import TagError from "@el-levert/common/errors/TagError.js";

function logOutput(out, dataType) {
    if (getLogger().isDebugEnabled()) {
        const desc = dataType === "script" ? "output" : "data",
            log = dataType === "reply" ? DiscordUtil.formatMessageLog(out) : LoggerUtil.formatLog(out);

        getLogger().debug(`Returning ${dataType} ${desc}:${log}`);
    }
}

class TagVM extends VM {
    static $name = "tagVM";
    static VMname = "isolated-vm";

    static loadPriority = 1;

    constructor(enabled) {
        super(enabled);

        const botConfig = getConfig();
        const config = ObjectUtil.guaranteeObject(botConfig.vmRunner);

        const mode = config.mode ?? "local",
            port = config.port ?? 9123,
            host = config.host ?? "127.0.0.1";

        this.mode = mode;
        this.port = port;
        this.host = host;

        this.memLimit = botConfig.memLimit ?? config.memLimit ?? 128;
        this.timeLimit =
            botConfig.timeLimit ?? config.timeLimit ?? (10 * Util.durationSeconds.second) / Util.durationSeconds.milli;

        this.runnerUrl =
            this.mode === "remote" && Util.nonemptyString(config.remoteUrl)
                ? config.remoteUrl
                : `ws://${this.host}:${this.port}`;

        this.runnerProcess = this.mode === "local" ? new RunnerProcess({ port: this.port, host: this.host }) : null;

        this.gatewayClient = null;
        this.rpc = null;
    }

    async runScript(code, values, options) {
        if (!this.enabled || this.rpc === null) {
            throw new VMError("VM runner is not connected");
        }

        values = ObjectUtil.guaranteeObject(values);
        options = ObjectUtil.guaranteeObject(options);

        const fixedTag =
            values.tag != null
                ? {
                      name: values.tag.name,
                      args: values.tag.args,
                      body: values.tag.body,
                      owner: values.tag.owner
                  }
                : undefined;

        const fixedMsg = values.msg != null ? new FakeMsg(values.msg).fixedMsg : undefined;

        const sanitizedValues = {
            args: values.args,
            tag: fixedTag,
            msg: fixedMsg
        };

        Benchmark.startTiming("vm_script");

        let out, dataType;

        try {
            [out, dataType] = await this.rpc.call("runScript", code, sanitizedValues, {
                language: options.language,
                enableInspector: options.enableInspector,
                memLimit: options.memLimit ?? this.memLimit,
                timeLimit: options.timeLimit ?? this.timeLimit
            });
        } finally {
            Benchmark.stopTiming("vm_script", false);
        }

        if (dataType === "reply") {
            out = this._processReply(out);
        }

        logOutput(out, dataType);
        return out;
    }

    async load() {
        if (this.runnerProcess !== null) {
            await this.runnerProcess.start();
        }

        const client = new GatewayClient(this.runnerUrl, {
            logger: getLogger()
        });

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(
                () => {
                    reject(new VMError("Timeout connecting to VM runner daemon"));
                },
                (5 * Util.durationSeconds.second) / Util.durationSeconds.milli
            );

            client.on("open", socket => {
                clearTimeout(timeout);
                const rpc = new RPCChannel(socket);

                this.rpc = rpc;
                this._registerHostHandlers(rpc);

                getLogger().info(`Connected to VM runner at ${this.runnerUrl}`);
                resolve();
            });

            client.once("error", err => {
                clearTimeout(timeout);
                reject(err);
            });

            client.on("close", () => {
                this.rpc = null;
                getLogger().warn("Disconnected from VM runner daemon.");
            });

            client.connect();
        });

        this.gatewayClient = client;
    }

    async unload() {
        if (this.gatewayClient !== null) {
            this.gatewayClient.disconnect();
            this.gatewayClient = null;
        }

        this.rpc = null;

        if (this.runnerProcess !== null) {
            await this.runnerProcess.stop();
        }
    }

    getDisabledMessage() {
        return "Eval is disabled";
    }

    _processReply(out) {
        if (typeof out === "string") {
            try {
                out = JSON.parse(out);
            } catch {}
        }

        if (out.file != null) {
            const { data, name } = out.file,
                { file: _, ...outData } = out;

            return {
                ...outData,
                ...DiscordUtil.getFileAttach(ArrayUtil.toBuffer(data), name)
            };
        }

        return out;
    }

    _registerHostHandlers(rpc) {
        rpc.register("fetchTag", async (name, opts) => {
            opts = ObjectUtil.guaranteeObject(opts, "aliasOriginal");
            const aliasOriginal = opts.aliasOriginal ?? false;

            const [, err] = getClient().tagManager.checkName(name, false);

            if (err !== null) {
                return null;
            }

            let tag = await getClient().tagManager.fetch(name);

            if (tag === null) {
                return null;
            } else if (tag.isAlias) {
                tag = await getClient().tagManager.fetchAlias(tag, aliasOriginal);
            }

            return tag?.getData() ?? null;
        });

        rpc.register("findTags", async query => {
            const tags = await getClient().tagManager.search(query);
            return tags.map(tag => tag.getData());
        });

        rpc.register("dumpTags", async (full = false) => {
            const tags = await getClient().tagManager.dump(full);
            return full ? tags.map(tag => tag.getData()) : tags;
        });

        rpc.register("fetchMessage", async (user_id, default_id, ch_id, msg_id) => {
            const targetChId = ch_id ?? default_id;

            const msg = await getClient().fetchMessage(targetChId, msg_id, {
                user_id,
                checkAccess: true
            });

            return msg !== null ? new FakeMsg(msg).fixedMsg : null;
        });

        rpc.register("fetchMessages", async (user_id, default_id, ch_id, fetchOptions) => {
            const targetChId = ch_id ?? default_id;

            let msgs = await getClient().fetchMessages(
                targetChId,
                {
                    user_id,
                    checkAccess: true
                },
                fetchOptions
            );

            if (msgs === null) {
                const before_id = targetChId;

                msgs = await getClient().fetchMessages(
                    default_id,
                    {
                        user_id,
                        checkAccess: true
                    },
                    {
                        before: before_id
                    }
                );
            }

            if (msgs === null) {
                return null;
            }

            return msgs.map(msg => new FakeMsg(msg).fixedMsg);
        });

        rpc.register("findUserById", async user_id => {
            const user = await getClient().findUserById(user_id);
            return user !== null ? new FakeUser(user).fixedUser : null;
        });

        rpc.register("findUsers", async (query, options) => {
            options = ObjectUtil.guaranteeObject(options, "sv_id");

            const users = await getClient().findUsers(query, {
                ...options,
                onlyMembers: true
            });

            return users.map(user => new FakeUser(user).fixedUser);
        });

        rpc.register("prepareExecuteTag", async (name, args) => {
            const tag = await getClient().tagManager.fetch(name);

            if (tag === null) {
                return null;
            }

            let evalArgs = tag.args ?? "";

            if (args != null) {
                args = Array.isArray(args) ? args.join(" ") : String(args);
                evalArgs = args + " " + evalArgs;
            }

            return {
                args: Util.empty(evalArgs) ? undefined : evalArgs,
                body: tag.body,
                isScript: tag.isScript,
                name: tag.name
            };
        });

        rpc.register("executeTagSafe", async (name, args, msg) => {
            const tag = await getClient().tagManager.fetch(name);

            if (tag === null) {
                throw new TagError(`Tag ${name} doesn't exist`, name);
            }

            return await getClient().tagManager.execute(tag, args, { msg });
        });
    }
}

export default TagVM;
