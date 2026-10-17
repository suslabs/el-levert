import MessageHandler from "./MessageHandler.js";
import InteractionTracker from "./tracker/InteractionTracker.js";

import InteractionContext from "../../structures/command/context/InteractionContext.js";

import { getEmoji, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";

class InteractionHandler extends MessageHandler {
    static $name = "interactionHandler";

    priority = 1;
    handlesMessages = false;

    constructor(enabled, options) {
        options = ObjectUtil.guaranteeObject(options);
        super(enabled, false, false, options);

        const sweepInterval = options.sweepInterval ?? 30 / Util.durationSeconds.milli;
        this.tracker = new InteractionTracker(sweepInterval);
    }

    registerSession(session) {
        return this.tracker.addSession(session);
    }

    unregisterSession(id) {
        return this.tracker.removeSession(id);
    }

    getSession(id) {
        return this.tracker.getSession(id);
    }

    async execute(interaction) {
        if (interaction == null) {
            return false;
        }

        const isComponent = interaction.isMessageComponent(),
            isModal = interaction.isModalSubmit();

        if (!isComponent && !isModal) {
            return false;
        }

        const sessionId = this._parseSessionId(interaction.customId);

        if (!Util.nonemptyString(sessionId)) {
            return false;
        }

        const session = this.tracker.getSession(sessionId);

        if (session === null || !session.active) {
            if (!interaction.replied && !interaction.deferred) {
                await this.interactionReply(interaction, `${getEmoji("warn")} This interaction has expired.`, {
                    ephemeral: true
                });
            }

            return false;
        }

        const isAuthor = interaction.user.id === session.authorId;

        const interactionContext = new InteractionContext({
            interaction,
            handler: this,
            session,
            isAuthor
        });

        const contextOverrides = {
            interactionContext,
            interaction,
            isAuthor
        };

        const commandContext = session.context.clone(contextOverrides);

        try {
            return await session.handleInteraction(commandContext);
        } catch (err) {
            getLogger().error("Error while handling interaction:", err);

            if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                await this.interactionReply(
                    interaction,
                    `${getEmoji("error")} An error occurred while processing this interaction.`,
                    {
                        ephemeral: true
                    }
                );
            }

            return false;
        }
    }

    unload() {
        this.tracker.destroy();
    }

    _parseSessionId(customId) {
        if (!Util.nonemptyString(customId)) {
            return null;
        }

        const parts = customId.split(":");
        return Util.last(parts);
    }
}

export default InteractionHandler;
