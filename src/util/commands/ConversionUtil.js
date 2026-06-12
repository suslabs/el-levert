import Util from "../Util.js";
import ArrayUtil from "../ArrayUtil.js";
import TypeTester from "../TypeTester.js";
import OCUtil from "./OCUtil.js";

import UtilError from "../../errors/UtilError.js";

let ConversionUtil = {
    factors: {
        rf: 1,
        eu: 4
    },

    convert: (inVal, inUnit, outUnits) => {
        if (!Number.isFinite(inVal)) {
            throw new UtilError("Invalid input value", inVal);
        }

        inUnit = typeof inUnit === "string" ? inUnit.toLowerCase() : "";

        outUnits = ArrayUtil.guaranteeArray(outUnits)
            .map(unit => (typeof unit === "string" ? unit.toLowerCase() : ""))
            .filter(unit => !Util.empty(unit));
        outUnits = ArrayUtil.unique(outUnits).filter(unit => unit !== inUnit);

        if (Util.empty(outUnits)) {
            throw new UtilError("No output units provided");
        }

        inUnit = TypeTester.normalizeEnum(inUnit, ConversionUtil.validUnits, "input unit", UtilError, {
            ref: false
        });

        outUnits = TypeTester.normalizeEnums(outUnits, ConversionUtil.validUnits, "output units", UtilError, {
            collectInvalid: true,
            ref: false
        });

        const inCount = ConversionUtil.factors[inUnit],
            inSuffix = ConversionUtil._suffixes[inUnit];

        const outCounts = outUnits.map(unit => ConversionUtil.factors[unit]),
            outSuffixes = outUnits.map(unit => ConversionUtil._suffixes[unit]);

        const normVal = inVal * inCount,
            outVals = outCounts.map((count, i) => {
                const val = normVal / count;
                return ConversionUtil._formatValue(val, outSuffixes[i]);
            });

        return [ConversionUtil._formatValue(inVal, inSuffix)].concat(outVals);
    },

    _suffixes: {
        rf: " RF/t",
        eu: " EU/t"
    },

    _formatValue: (val, suffix) => {
        return Util.formatNumber(val, 4) + suffix;
    }
};

{
    const factors = Object.fromEntries(
        OCUtil.voltageNames.map((name, idx) => [
            name.toLowerCase(),
            ConversionUtil.factors.eu * OCUtil.BASE_EU * Math.pow(OCUtil.EU_MULT, idx)
        ])
    );
    Object.assign(ConversionUtil.factors, factors);

    ConversionUtil.validUnits = Object.keys(ConversionUtil.factors);

    const suffixes = Object.fromEntries(OCUtil.voltageNames.map((name, idx) => [name.toLowerCase(), `A ${name}`]));
    Object.assign(ConversionUtil._suffixes, suffixes);
}

ConversionUtil = Object.freeze(ConversionUtil);
export default ConversionUtil;
