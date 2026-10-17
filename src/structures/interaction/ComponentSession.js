import { randomUUID } from "node:crypto";

import { InteractionModes } from "./InteractionModes.js";

import { getConfig, getEmoji, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";

class ComponentSession {
    constructor(ctx, options = {}) {
        options = ObjectUtil.guaranteeObject(options);

        this.id = options.id ?? randomUUID().slice(0, 8);
        this.ctx = ctx;
        this.context = ctx;
        this.command = ctx.command;
        this.authorId = ctx.author.id;

        this.interactionMode = options.interactionMode ?? InteractionModes.ephemeralOthers;

        const config = getConfig(),
            configTimeout = config != null ? config.interactionTimeout : null,
            fallbackTimeout = (5 * Util.durationSeconds.minute) / Util.durationSeconds.milli;

        this.timeout = options.timeout ?? configTimeout ?? fallbackTimeout;

        this.onDestroy = options.onDestroy ?? null;

        if (options.message != null) {
            this.message = options.message;
        } else if (typeof ctx.getReply === "function") {
            this.message = ctx.getReply();
        } else {
            this.message = null;
        }

        this.spec = options.spec ?? null;
        this.active = true;

        this.setTimestamp();
    }

    get timestamp() {
        return this._timestamp;
    }

    setMessage(message) {
        this.message = message;
    }

    setTimestamp(timestamp = Date.now()) {
        this._timestamp = timestamp;
    }

    async handleInteraction(commandContext) {
        if (!this.active) {
            return false;
        }

        const interactionContext = commandContext.interactionContext ?? commandContext,
            interaction = interactionContext.interaction ?? interactionContext;

        if (this.message === null && interaction.message != null) {
            this.message = interaction.message;
        }

        const isAuthor = commandContext.isAuthor ?? interaction.user.id === this.authorId;

        if (!isAuthor && this.interactionMode === InteractionModes.authorOnly) {
            const warnMsg = `${getEmoji("warn")} Only the command caller can interact with this message.`;

            await interactionContext.reply(warnMsg, { ephemeral: true });
            return true;
        }

        const command = this.command ?? commandContext.command;

        let res = false;

        if (command != null) {
            res = await command.executeInteraction(commandContext, interactionContext);
        }

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
