import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import axios from "axios";
import ivm from "isolated-vm";
const { ExternalCopy } = ivm;

import { getLogger } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import ArrayUtil from "../../../util/ArrayUtil.js";
import TypeTester from "../../../util/TypeTester.js";
import ObjectUtil from "../../../util/ObjectUtil.js";
import VMUtil from "../../../util/vm/VMUtil.js";
import HttpUtil from "../../../util/misc/HttpUtil.js";

import RateLimiter from "../../../util/misc/RateLimiter.js";
import { getHttpStatusText, httpStatusCodes } from "../../../util/misc/HttpStatusCodes.js";

import VMError from "../../../errors/VMError.js";

async function fsAdapter(req, maxDownloadSize = Infinity) {
    let filePath;

    try {
        filePath = fileURLToPath(req.url);
    } catch (err) {
        return Promise.reject({
            message: `Invalid file URL format: ${req.url}`,
            response: {
                status: httpStatusCodes.BAD_REQUEST,
                statusText: getHttpStatusText(httpStatusCodes.BAD_REQUEST)
            },
            config: req
        });
    }

    try {
        const stat = await fs.stat(filePath);

        if (!stat.isFile()) {
            return Promise.reject({
                message: `Path is not a regular file: ${req.url}`,
                response: {
                    status: httpStatusCodes.NOT_FOUND,
                    statusText: getHttpStatusText(httpStatusCodes.NOT_FOUND)
                },
                config: req
            });
        }

        if (stat.size > maxDownloadSize) {
            return Promise.reject({
                message: `File size exceeds maximum download size of ${maxDownloadSize} bytes`,
                response: {
                    status: httpStatusCodes.PAYLOAD_TOO_LARGE,
                    statusText: getHttpStatusText(httpStatusCodes.PAYLOAD_TOO_LARGE)
                },
                config: req
            });
        }

        let data = await fs.readFile(filePath),
            resData;

        if (req.responseType === "arraybuffer") {
            resData = ArrayUtil.toUint8Array(data);
        } else {
            const json = VMUtil._jsonRequestRegex.test(req.url) || req.responseType === "json",
                text = data.toString("utf8");

            try {
                resData = json ? JSON.parse(text) : text;
            } catch {
                resData = text;
            }
        }

        return {
            data: resData,
            status: httpStatusCodes.OK,
            statusText: getHttpStatusText(httpStatusCodes.OK),
            headers: {},
            config: req
        };
    } catch (err) {
        if (err.response?.status === httpStatusCodes.PAYLOAD_TOO_LARGE) {
            return Promise.reject(err);
        }

        return Promise.reject({
            message: `File not found or unreadable at: ${req.url}`,
            response: {
                status: httpStatusCodes.NOT_FOUND,
                statusText: getHttpStatusText(httpStatusCodes.NOT_FOUND)
            },
            config: req
        });
    }
}

let fakeAxios = null,
    rateLimiter = null;

function createFakeAxios(options) {
    options = ObjectUtil.guaranteeObject(options);

    const allowLocalhostRequests = options.allowLocalhostRequests ?? false,
        allowFilesystemRequests = options.allowFilesystemRequests ?? false;

    const maxUploadSize = options.maxUploadSize ?? Infinity,
        maxDownloadSize = options.maxDownloadSize ?? Infinity;

    const maxRequests = options.maxRequests ?? Infinity,
        rateLimitWindow = options.rateLimitWindow ?? 1000;

    rateLimiter = new RateLimiter(maxRequests, rateLimitWindow);

    const config = {
        maxBodyLength: maxUploadSize,
        maxContentLength: maxDownloadSize
    };

    if (!allowLocalhostRequests) {
        Object.assign(config, HttpUtil.createSecureAgents());
    }

    const originalAdapter = axios.getAdapter("http");

    if (allowFilesystemRequests) {
        config.adapter = reqConfig => {
            if (reqConfig.url && reqConfig.url.startsWith("file://")) {
                return fsAdapter(reqConfig, maxDownloadSize);
            } else {
                return originalAdapter(reqConfig);
            }
        };
    } else {
        config.adapter = originalAdapter;
    }

    const client = axios.create(config);

    client.interceptors.request.use(reqConfig => {
        let size = 0;

        if (reqConfig.data != null) {
            const defaultTransform = axios.defaults.transformRequest,
                transformedData = defaultTransform.reduce(
                    (data, func) => func(data, reqConfig.headers),
                    reqConfig.data
                );

            size = Util.getByteLength(transformedData);
        }

        if (size > maxUploadSize) {
            throw new VMError(`Request body exceeds maximum upload size of ${maxUploadSize} bytes`);
        }

        return reqConfig;
    });

    return client;
}

function initFakeAxios(options) {
    fakeAxios ??= createFakeAxios(options);
    return fakeAxios;
}

function resetFakeAxios() {
    fakeAxios = null;
    rateLimiter?.destroy();
    rateLimiter = null;
}

const FakeHttp = Object.freeze({
    get client() {
        return fakeAxios;
    },

    get rateLimiter() {
        return rateLimiter;
    },

    resetContext: context => {
        if (context != null && rateLimiter !== null) {
            const root = context.rootContext ?? context;
            rateLimiter.reset(root);
        }
    },

    request: async (context, data) => {
        if (fakeAxios === null) {
            throw new VMError("HTTP client is not initialized");
        }

        const rootContext = context?.rootContext ?? context;

        if (rateLimiter !== null && !rateLimiter.check(rootContext)) {
            throw new VMError("HTTP request rate limit exceeded");
        }

        const reqConfig = VMUtil.makeRequestConfig(data, context);

        let res = null,
            reqErr = null;

        try {
            res = await fakeAxios.request(reqConfig);
        } catch (err) {
            if (err instanceof VMError) {
                throw err;
            }

            reqErr = err;

            if (TypeTester.className(err) === "AxiosError" || err.response != null) {
                getLogger().error("Axios request error:", err);
                res = err.response;
            } else {
                getLogger().error("Script request error:", err);
            }
        }

        const resData = VMUtil.getResponseData(res, reqErr, reqConfig);
        return new ExternalCopy(resData).copyInto();
    }
});

export { FakeHttp, initFakeAxios, resetFakeAxios };
