import { randomUUID } from "node:crypto";

import InteractionModes from "./InteractionModes.js";

import { getConfig, getEmoji, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";

import HandlerError from "../../errors/HandlerError.js";

class ComponentSession {
    static createCustomId(prefix, action, sessionId, ...args) {
        const parts = [prefix, action, ...args, sessionId].map(String);

        if (parts.some(part => part.includes(ComponentSession._customIdSeparator))) {
            throw new HandlerError("Component ID segments cannot contain colons.");
        }

        return parts.join(ComponentSession._customIdSeparator);
    }

    static parseCustomId(customId) {
        const parts = customId.split(ComponentSession._customIdSeparator);

        if (parts.length < 3 || parts.some(part => Util.empty(part))) {
            return null;
        }

        const [prefix, action] = parts,
            args = parts.slice(2, -1),
            sessionId = Util.last(parts);

        return { prefix, action, args, sessionId };
    }

    constructor(ctx, options = {}) {
        options = ObjectUtil.guaranteeObject(options);

        const id = options.id ?? randomUUID().slice(0, 8),
            interactionMode = options.interactionMode ?? InteractionModes.ephemeralOthers,
            timeout = options.timeout ?? getConfig()?.interactionTimeout ?? ComponentSession._defaultTimeout,
            message = options.message ?? null,
            onDestroy = options.onDestroy ?? null,
            spec = options.spec ?? null;

        this.id = id;
        this.context = ctx;
        this.command = ctx.command;
        this.authorId = ctx.author.id;

        this.interactionMode = interactionMode;
        this.timeout = timeout;
        this.onDestroy = onDestroy;

        if (message !== null) {
            this.message = message;
        } else if (typeof ctx.getReply === "function") {
            this.message = ctx.getReply();
        } else {
            this.message = null;
        }

        this.spec = spec;
        this.active = true;

        this.setTimestamp();
    }

    get timestamp() {
        return this._timestamp;
    }

    setMessage(message) {
        this.message = message ?? null;
    }

    setTimestamp(timestamp = Date.now()) {
        this._timestamp = timestamp;
    }

    async handleInteraction(commandContext) {
        if (!this.active) {
            return false;
        }

        const interactionContext = commandContext.interactionContext,
            interaction = interactionContext.interaction;

        this.message ??= interaction.message ?? null;

        if (!commandContext.isAuthor && this.interactionMode === InteractionModes.authorOnly) {
            const warnMsg = `${getEmoji("warn")} Only the command caller can interact with this message.`;

            await interactionContext.reply(warnMsg, { ephemeral: true });
            return true;
        }

        const command = this.command ?? commandContext.command,
            res = await command.executeInteraction(commandContext, interactionContext);

        this.setTimestamp();
        return res;
    }

    async destroy(disableComponents = true) {
        if (!this.active) {
            return;
        }

        this.active = false;

        if (disableComponents && this.message !== null) {
            try {
                await this._disableMessageComponents();
            } catch (err) {
                getLogger().debug("Could not disable components on session expiry:", err);
            }
        }

        if (typeof this.onDestroy === "function") {
            await this.onDestroy(this);
        }
    }

    static _customIdSeparator = ":";
    static _defaultTimeout = (5 * Util.durationSeconds.minute) / Util.durationSeconds.milli;

    async _disableMessageComponents() {
        if (Util.empty(this.message.components)) {
            return;
        }

        const disabledRows = this.message.components.map(row => {
            const rawRow = typeof row.toJSON === "function" ? row.toJSON() : row;

            return {
                ...rawRow,
                components: rawRow.components.map(comp => ({
                    ...comp,
                    disabled: true
                }))
            };
        });

        await this.message.edit({ components: disabledRows });
    }
}

export default ComponentSession;
