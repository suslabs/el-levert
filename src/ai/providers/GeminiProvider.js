import AIProvider from "./AIProvider.js";

import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import SSEUtil from "../../util/misc/SSEUtil.js";
import HTTPUtil from "../../util/vm/HTTPUtil.js";
import { httpStatusCodes } from "../../util/misc/HttpStatusCodes.js";

function withThinking(body, thinkingLevel) {
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

function parseUsage(usage) {
    usage = ObjectUtil.guaranteeObject(usage);

    return {
        tokens: usage.totalTokenCount ?? 0,
        cached: usage.cachedContentTokenCount ?? 0,
        reasoning: usage.thoughtsTokenCount ?? 0
    };
}

function getFinishReason(finishReason, blockReason, interrupted) {
    if (blockReason !== null) {
        return blockReason;
    }

    return interrupted ? null : finishReason;
}

class GeminiProvider extends AIProvider {
    static $name = "gemini";

    static generateMethod = "generateContent";
    static streamMethod = "streamGenerateContent?alt=sse";

    static retryInfoType = "type.googleapis.com/google.rpc.RetryInfo";
    static quotaFailureType = "type.googleapis.com/google.rpc.QuotaFailure";

    static isDailyLimit(error) {
        const failure = GeminiProvider._findDetail(error, GeminiProvider.quotaFailureType);
        return ArrayUtil.guaranteeArray(failure?.violations, null, true).some(violation =>
            GeminiProvider._dailyQuotaRegex.test(violation?.quotaId ?? "")
        );
    }

    static getRetryDelay(error) {
        const retry = GeminiProvider._findDetail(error, GeminiProvider.retryInfoType)?.retryDelay,
            match = GeminiProvider._secondsRegex.exec(retry) ?? GeminiProvider._retryMessageRegex.exec(error?.message);

        const delay = match === null ? 0 : Number(match[1]) / Util.durationSeconds.milli;
        return Number.isFinite(delay) && delay > 0 ? Math.ceil(delay) : null;
    }

    static getTimeToDailyReset(date = new Date()) {
        const local = GeminiProvider._getPacificWallTime(date),
            midnight = new Date(local).setUTCHours(24, 0, 0, 0);

        const estimate = midnight + date.getTime() - date.getUTCMilliseconds() - local,
            correction = midnight - GeminiProvider._getPacificWallTime(new Date(estimate));

        return estimate + correction - date.getTime();
    }

    buildRequest(model, key, body, options) {
        options = ObjectUtil.guaranteeObject(options);

        const stream = options.stream ?? false,
            thinkingLevel = options.thinkingLevel ?? null;

        const method = stream ? GeminiProvider.streamMethod : GeminiProvider.generateMethod;

        return {
            url: HTTPUtil.joinUrl(this.endpoint, "models", `${encodeURIComponent(model)}:${method}`),
            headers: { "content-type": "application/json", "x-goog-api-key": key },
            data: withThinking(body, thinkingLevel)
        };
    }

    parseResponse(data) {
        return {
            parts: Util.first(data.candidates)?.content?.parts ?? [],
            usage: parseUsage(data.usageMetadata)
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
            finishReason: getFinishReason(finishReason, blockReason, error !== null),
            error,
            usage: parseUsage(usage)
        };
    }

    getQuotaKey(res, model, keyIdx) {
        if (res?.status === httpStatusCodes.TOO_MANY_REQUESTS) {
            const failure = GeminiProvider._findDetail(res.data?.error, GeminiProvider.quotaFailureType),
                violations = ArrayUtil.guaranteeArray(failure?.violations, null, true);

            if (
                !Util.empty(violations) &&
                violations.every(violation => !GeminiProvider._modelQuotaRegex.test(violation?.quotaId ?? ""))
            ) {
                return `${this.name}#${keyIdx}`;
            }
        }

        return super.getQuotaKey(res, model, keyIdx);
    }

    getUnblockDelay(res) {
        const error = res?.data?.error,
            retryDelay = GeminiProvider.getRetryDelay(error);

        if (res?.status === httpStatusCodes.TOO_MANY_REQUESTS && GeminiProvider.isDailyLimit(error)) {
            return Math.max(GeminiProvider.getTimeToDailyReset(), retryDelay ?? 0);
        }

        return retryDelay ?? super.getUnblockDelay(res);
    }

    isThinkingError(res) {
        return (
            res.status === httpStatusCodes.BAD_REQUEST &&
            GeminiProvider._thinkingErrorRegex.test(this.getErrorMessage(res))
        );
    }

    static _thinkingErrorRegex = /thinking/i;

    static _dailyQuotaRegex = /per[_ -]?day/i;
    static _modelQuotaRegex = /per[_ -]?model/i;
    static _secondsRegex = /^(\d+(?:\.\d+)?)s$/;
    static _retryMessageRegex = /\bplease retry in (\d+(?:\.\d+)?)s\b/i;

    static _pacificTime = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric"
    });

    static _findDetail(error, type) {
        const details = ArrayUtil.guaranteeArray(error?.details, null, true);
        return details.find(detail => detail?.["@type"] === type) ?? null;
    }

    static _getPacificWallTime(date) {
        const parts = GeminiProvider._pacificTime.formatToParts(date),
            { year, month, day, hour, minute, second } = Object.fromEntries(
                parts.map(part => [part.type, Number(part.value)])
            );

        return Date.UTC(year, month - 1, day, hour, minute, second);
    }
}

export default GeminiProvider;
