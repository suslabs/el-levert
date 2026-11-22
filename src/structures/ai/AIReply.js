import AIConversation from "./AIConversation.js";
import AIReplyUpdater from "./AIReplyUpdater.js";
import AIReplyView from "./AIReplyView.js";

import { getClient } from "../../LevertClient.js";

import DiscordUtil from "../../util/DiscordUtil.js";

class AIReply {
    static expectedErrors = new Set(["AIError", "AxiosError"]);

    constructor(request, target) {
        this.request = request;

        this.view = new AIReplyView();
        this.updater = new AIReplyUpdater(target);
    }

    async answer(question, history) {
        await this.updater.start(this.view.renderThinking());

        let result;

        try {
            result = await getClient().aiManager.ask(question, this.request, {
                history,
                onProgress: session => this.updater.update(this.view.renderProgress(session))
            });
        } catch (err) {
            if (!AIReply.expectedErrors.has(err.name)) {
                this.updater.cancel();
                throw err;
            }

            return await this.updater.finish(this.view.renderError(err));
        }

        const msg = await this.updater.finish(this.view.renderResult(result));

        await this._track(msg, question, result, history);
        return msg;
    }

    async _track(msg, question, result, history) {
        const turns = [...history, { role: "user", text: question }, { role: "model", text: result.answer }];
        getClient().followUpHandler.register(new AIConversation(msg, turns, result.followUps));

        for (let i = 0; i < result.followUps.length; i++) {
            await msg.react(DiscordUtil.getKeycapEmoji(i + 1));
        }
    }
}

export default AIReply;
