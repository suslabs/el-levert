import axios from "axios";

const FakeAxios = Object.freeze({
    request: async (...args) => {
        const res = await axios.request.apply(this, args);

        return {
            data: res.data,
            status: res.status,
            statusText: res.statusText,
            headers: res.headers
        };
    }
});

export default FakeAxios;
