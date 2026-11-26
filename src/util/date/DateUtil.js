import { parseDate } from "chrono-node";

import Util from "../Util.js";

import UtilError from "../../errors/UtilError.js";

const DateUtil = Object.freeze({
    today: () => new Date().toISOString().slice(0, 10),

    formatDate: date => {
        return new Date(date).toLocaleString("en-GB", {
            weekday: "short",
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZoneName: "short",
            timeZone: "UTC"
        });
    },

    parse: value => {
        if (!Util.nonemptyString(value)) {
            return null;
        }

        value = value.trim();

        const date = parseDate(value) ?? parseDate(`in ${value}`),
            time = date?.getTime();

        return Number.isFinite(time) ? time : null;
    },

    parseRange: (fromText, toText) => {
        const from = DateUtil.parse(fromText),
            to = DateUtil.parse(toText);

        if (Util.nonemptyString(fromText) && from === null) {
            throw new UtilError(`Invalid date: \`${fromText}\`.`);
        } else if (Util.nonemptyString(toText) && to === null) {
            throw new UtilError(`Invalid date: \`${toText}\`.`);
        } else if (from !== null && to !== null && from > to) {
            throw new UtilError("The start date must be before the end date.");
        }

        return { from, to };
    }
});

export default DateUtil;
