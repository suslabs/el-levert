import { parseDate } from "chrono-node";

import Util from "../Util.js";
import UtilError from "../../errors/UtilError.js";

class DateUtil {
    static parse(value) {
        if (Util.empty(value)) {
            return null;
        }

        let date = parseDate(value);

        if (!date) {
            date = parseDate(`in ${value}`);
        }

        return date?.getTime() ?? null;
    }

    static parseRange(fromText, toText) {
        const from = this.parse(fromText),
            to = this.parse(toText);

        if (Util.nonemptyString(fromText) && from === null) {
            throw new UtilError(`Invalid date: \`${fromText}\`.`);
        }

        if (Util.nonemptyString(toText) && to === null) {
            throw new UtilError(`Invalid date: \`${toText}\`.`);
        }

        if (from !== null && to !== null && from > to) {
            throw new UtilError("The start date must be before the end date.");
        }

        return {
            from,
            to
        };
    }
}

export default DateUtil;
