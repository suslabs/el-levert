import UtilError from "../../errors/UtilError.js";

const CleanroomUtil = Object.freeze({
    minSize: 3,
    maxSize: 15,

    calc: (l, w, h) => {
        const { minSize, maxSize } = CleanroomUtil;

        if (l < minSize || w < minSize || h < minSize) {
            throw new UtilError(`Cleanroom must be at least ${minSize}x${minSize}x${minSize}`);
        }

        if (l > maxSize || w > maxSize || h > maxSize) {
            throw new UtilError(`Cleanroom cannot be bigger than ${maxSize}x${maxSize}x${maxSize}`);
        }

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

        return { frame, walls, filters };
    }
});

export default CleanroomUtil;
