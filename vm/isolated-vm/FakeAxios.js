import ivm from "isolated-vm";
import axios from "axios";

async function request(...args) {
    try {
        return await axios.request(...args);
    } catch(err) {
        console.log();
        throw err;
    }
}

const FakeAxios = {
    request: async (...args) => {
        let res = await request.apply(this, args);
        
        return new ivm.ExternalCopy({
            data: res.data,
            status: res.status,
            statusText: res.statusText,
            headers: res.headers
        }).copyInto();
    }
};

export default FakeAxios;