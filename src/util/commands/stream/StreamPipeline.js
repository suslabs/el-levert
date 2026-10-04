import StreamStep from "../../../structures/stream/StreamStep.js";

import Util from "../../Util.js";
import ObjectUtil from "../../ObjectUtil.js";

import TagError from "../../../errors/TagError.js";

class StreamPipeline {
    static maxSteps = 30;

    static parse(pipelineText) {
        if (!Util.nonemptyString(pipelineText)) {
            throw new TagError("Pipeline is empty");
        }

        const rawSteps = this._splitPipeline(pipelineText);

        if (Util.empty(rawSteps)) {
            throw new TagError("Pipeline is empty");
        }

        if (rawSteps.length > this.maxSteps) {
            throw new TagError(`Pipeline exceeds maximum of ${this.maxSteps} steps`);
        }

        const steps = rawSteps.map(step => StreamStep.parse(step));
        return new this(steps);
    }

    constructor(steps = []) {
        this.steps = steps;
    }

    async execute(input = "", options = {}) {
        options = ObjectUtil.guaranteeObject(options);

        for (let i = 0; i < this.steps.length; i++) {
            input = await this.steps[i].execute(input, options, i, input);
        }

        return input;
    }

    static _splitPipeline(pipelineText) {
        const steps = [];

        let current = "",
            inQuotes = false,
            quoteChar = "";

        for (let i = 0; i < pipelineText.length; i++) {
            const char = pipelineText[i];

            if (inQuotes) {
                current += char;

                if (char === quoteChar && pipelineText[i - 1] !== "\\") {
                    inQuotes = false;
                }
            } else if (char === '"' || char === "'") {
                inQuotes = true;
                quoteChar = char;
                current += char;
            } else if (char === ">" || char === "|") {
                const trimmed = current.trim();

                if (Util.empty(trimmed)) {
                    throw new TagError("Empty step in pipeline");
                }

                steps.push(trimmed);
                current = "";
            } else {
                current += char;
            }
        }

        const trimmed = current.trim();

        if (Util.empty(trimmed)) {
            throw new TagError("Empty step in pipeline");
        }

        steps.push(trimmed);
        return steps;
    }
}

export default StreamPipeline;
