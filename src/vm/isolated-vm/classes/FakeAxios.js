import ivm from "isolated-vm";
const { ExternalCopy } = ivm;

import axios from "axios";

import { getLogger } from "../../../LevertClient";

async function request(...args) {
    try {
        return await axios.request(...args);
    } catch (err) {
        getLogger().err("Request error:", err);
        throw err;
    }
}

const FakeAxios = {
    request: async config => {
        let res = await request.apply(this, [config]);

        return new ExternalCopy({
            data: res.data,
            status: res.status,
            statusText: res.statusText,
            headers: res.headers
        }).copyInto();
    }
};

export default FakeAxios;
