import axios from "axios";
import ivm from "isolated-vm";
const { ExternalCopy } = ivm;

import { getLogger } from "../../../LevertClient.js";

import VMUtil from "../../../util/vm/VMUtil.js";
import TypeTester from "../../../util/TypeTester.js";

const client = axios.create();

client.interceptors.request.use(reqConfig => {
    let bodyBuffer = null;

    if (reqConfig.data == null) {
        bodyBuffer = Buffer.alloc(0);
    } else {
        const defaultTransform = axios.defaults.transformRequest,
            transformedData = defaultTransform.reduce((data, func) => func(data, reqConfig.headers), reqConfig.data);

        bodyBuffer = Buffer.from(transformedData, "utf8");
    }

    reqConfig.bodyBuffer = bodyBuffer;
    return reqConfig;
});

const FakeHttp = Object.freeze({
    request: async (context, data) => {
        const reqConfig = VMUtil.makeRequestConfig(data, context);

        let res = null,
            reqErr = null;

        try {
            res = await client.request(reqConfig);
        } catch (err) {
            reqErr = err;

            if (TypeTester.className(err) === "AxiosError") {
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

export default FakeHttp;
