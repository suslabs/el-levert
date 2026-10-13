import MessageHandler from "./MessageHandler.js";
import InteractionTracker from "./tracker/InteractionTracker.js";

import InteractionContext from "../../structures/command/context/InteractionContext.js";

import { getEmoji, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";

class InteractionHandler extends MessageHandler {
    static $name = "interactionHandler";

    constructor(enabled, options) {
        options = ObjectUtil.guaranteeObject(options);
        options.handlesMessages ??= false;
        options.priority ??= 1;

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

        const isComponent = typeof interaction.isMessageComponent === "function" && interaction.isMessageComponent(),
            isModal = typeof interaction.isModalSubmit === "function" && interaction.isModalSubmit();

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

        const commandContext =
            typeof session.context.clone === "function"
                ? session.context.clone({
                      interactionContext,
                      interaction,
                      isAuthor
                  })
                : Object.assign(Object.create(session.context), session.context, {
                      interactionContext,
                      interaction,
                      isAuthor
                  });

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
