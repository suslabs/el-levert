import Util from "../Util.js";

import UtilError from "../../errors/UtilError.js";

const CleanroomUtil = Object.freeze({
    minSize: [3, 3, 3],
    maxSize: [15, 15, 15],

    calc: (l, w, h) => {
        let dims;

        if (Array.isArray(l)) {
            dims = l;
        } else {
            dims = [l, w, h];
        }

        dims = dims.map(d => Util.clamp(d, 0));

        if (dims.some((d, i) => d < CleanroomUtil.minSize[i])) {
            throw new UtilError(`Cleanroom must be at least ${CleanroomUtil.minSize.join("x")}`, dims);
        } else if (dims.some((d, i) => d > CleanroomUtil.maxSize[i])) {
            throw new UtilError(`Cleanroom cannot be bigger than ${CleanroomUtil.maxSize.join("x")}`, dims);
        }

        [l, w, h] = dims;

        const l_inner = l - 2,
            w_inner = w - 2,
            h_inner = h - 2;

        const roof = l_inner * w_inner,
            l_wall = l_inner * h_inner,
            w_wall = w_inner * h_inner;

        const shell = l * w * h - roof * h_inner;

        const frame = shell - 2 * (roof + l_wall + w_wall),
            filters = roof - 1,
            walls = shell - frame - filters;

        return {
            controller: 1,
            frame,
            walls,
            filters
        };
    }
});

export default CleanroomUtil;
