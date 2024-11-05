import axios from "axios";

import ReturnCodes from "./ReturnCodes.js";
import VMError from "../../errors/VMError.js";

import { getClient } from "../../LevertClient.js";

class ExternalVM {
    static $name = "externalVM";
    static loadPriority = 3;

    constructor() {
        this.memLimit = getClient().config.otherMemLimit;
        this.timeLimit = getClient().config.otherTimeLimit;

        this.codes = ReturnCodes;

        this.base = "http://localhost:2358/submissions/";
        this.submitUrl = "?base64_encoded=false&wait=false";
        this.statusUrl = "?base64_encoded=false&fields=status_id";
        this.outputUrl = "?base64_encoded=true&fields=stdout,stderr,compile_output,exit_code";
    }

    async submit(code, lang, stdin) {
        let res;
        const data = {
            source_code: code,
            language_id: lang,
            memory_limit: this.memLimit,
            wall_time_limit: this.timeLimit
        };

        if (typeof stdin !== "undefined") {
            data.stdin = stdin;
        }

        try {
            res = await axios.post(this.base + this.submitUrl, data);
        } catch (err) {
            if (typeof err.response !== "undefined") {
                const data = err.response.data;

                if (err.response.status === 422) {
                    throw new VMError(JSON.stringify(data));
                } else {
                    throw new VMError(data.error);
                }
            }

            throw err;
        }

        return res.data.token;
    }

    checkCode(token) {
        return new Promise((resolve, reject) => {
            const interval = setInterval(async _ => {
                const status = (await axios.get(this.base + token + this.statusUrl)).data.status_id;

                if (![1, 2].includes(status)) {
                    clearInterval(interval);
                    resolve(status);
                }
            }, 200);

            setTimeout(_ => reject(new VMError("check timed out")), this.timeLimit * 2000);
        });
    }

    async getOutput(token) {
        let data = (await axios.get(this.base + token + this.outputUrl)).data;

        data = Object.assign(
            {
                stdout: "",
                stderr: "",
                compile_output: ""
            },
            data
        );

        return {
            stdout: Buffer.from(data.stdout, "base64").toString("utf-8"),
            stderr: Buffer.from(data.stderr, "base64").toString("utf-8"),
            compileOutput: Buffer.from(data.compile_output, "base64").toString("utf-8")
        };
    }

    async runScript(code, lang, stdin) {
        const token = await this.submit(code, lang, stdin),
            resCode = await this.checkCode(token);

        return [await this.getOutput(token), resCode];
    }
}

export default ExternalVM;
