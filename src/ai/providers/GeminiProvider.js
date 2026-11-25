import AIProvider from "./AIProvider.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import SSEUtil from "../../util/misc/SSEUtil.js";
import HTTPUtil from "../../util/vm/HTTPUtil.js";
import GeminiQuotaUtil from "../../util/ai/GeminiQuotaUtil.js";
import { httpStatusCodes } from "../../util/misc/HttpStatusCodes.js";

class GeminiProvider extends AIProvider {
    static $name = "gemini";

    static generateMethod = "generateContent";
    static streamMethod = "streamGenerateContent?alt=sse";

    buildRequest(model, key, body, options) {
        options = ObjectUtil.guaranteeObject(options);

        const stream = options.stream ?? false,
            thinkingLevel = options.thinkingLevel ?? null;

        const method = stream ? GeminiProvider.streamMethod : GeminiProvider.generateMethod;

        return {
            url: HTTPUtil.joinUrl(this.endpoint, "models", `${encodeURIComponent(model)}:${method}`),
            headers: { "content-type": "application/json", "x-goog-api-key": key },
            data: GeminiProvider._withThinking(body, thinkingLevel)
        };
    }

    parseResponse(data) {
        return {
            parts: Util.first(data.candidates)?.content?.parts ?? [],
            usage: GeminiProvider._parseUsage(data.usageMetadata)
        };
    }

    async readStream(stream, onParts) {
        const parts = [];
        let usage = null;

        let finishReason = null,
            blockReason = null,
            error = null;

        for await (const event of SSEUtil.readEvents(stream)) {
            const data = JSON.parse(event),
                candidate = Util.first(data.candidates);

            usage = data.usageMetadata ?? usage;
            blockReason = data.promptFeedback?.blockReason ?? blockReason;
            error = data.error ?? error;

            if (typeof candidate === "undefined") {
                continue;
            }

            const chunkParts = candidate.content?.parts ?? [];
            finishReason = candidate.finishReason ?? finishReason;

            parts.push(...chunkParts);
            await onParts(chunkParts);
        }

        return {
            parts,
            finishReason: GeminiProvider._getFinishReason(finishReason, blockReason, error !== null),
            error,
            usage: GeminiProvider._parseUsage(usage)
        };
    }

    getUnblockDelay(res) {
        const error = res.data?.error;
        const delay =
            res.status === httpStatusCodes.TOO_MANY_REQUESTS
                ? GeminiQuotaUtil.getUnblockDelay(error)
                : GeminiQuotaUtil.getRetryDelay(error);

        return delay ?? super.getUnblockDelay(res);
    }

    isThinkingError(res) {
        return (
            res.status === httpStatusCodes.BAD_REQUEST &&
            GeminiProvider._thinkingErrorRegex.test(this.getErrorMessage(res))
        );
    }

    static _thinkingErrorRegex = /thinking/i;

    static _withThinking(body, thinkingLevel) {
        if (thinkingLevel === null) {
            return body;
        }

        return {
            ...body,
            generationConfig: {
                ...body.generationConfig,
                thinkingConfig: { thinkingLevel }
            }
        };
    }

    static _parseUsage(usage) {
        usage = ObjectUtil.guaranteeObject(usage);

        return {
            tokens: usage.totalTokenCount ?? 0,
            cached: usage.cachedContentTokenCount ?? 0,
            reasoning: usage.thoughtsTokenCount ?? 0
        };
    }

    static _getFinishReason(finishReason, blockReason, interrupted) {
        if (blockReason !== null) {
            return blockReason;
        }

        return interrupted ? null : finishReason;
    }
}

export default GeminiProvider;
