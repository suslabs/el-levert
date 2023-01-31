import ivm from "isolated-vm";
import axios from "axios";

export default {
    request: async (...args) => {
        const res = await axios.request.apply(this, args);
        
        return new ivm.ExternalCopy({
            data: res.data,
            status: res.status,
            statusText: res.statusText,
            headers: res.headers
        }).copyInto();
    }
};