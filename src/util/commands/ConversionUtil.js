import { OverclockingValues } from "../../structures/OverclockingValues.js";

import Util from "../Util.js";
import ArrayUtil from "../ArrayUtil.js";
import TypeTester from "../TypeTester.js";

import UtilError from "../../errors/UtilError.js";

let ConversionUtil = {
    ticksPerSecond: 20,

    factors: {
        rf: 1,
        eu: 4,
        ae: 2,
        mb: 1,
        b: 1000
    },

    dimensions: {
        rf: "energy",
        eu: "energy",
        ae: "energy",
        mb: "fluid",
        b: "fluid"
    },

    convert: (inVal, inUnit, outUnits) => {
        ConversionUtil._checkValue(inVal);
        inUnit = ConversionUtil._lowercaseUnit(inUnit);

        outUnits = ArrayUtil.guaranteeArray(outUnits)
            .map(ConversionUtil._lowercaseUnit)
            .filter(unit => !Util.empty(unit));
        outUnits = ArrayUtil.unique(outUnits).filter(unit => unit !== inUnit);

        if (Util.empty(outUnits)) {
            throw new UtilError("No output units provided");
        }

        inUnit = ConversionUtil._normalizeUnit(inUnit, "input unit");

        outUnits = TypeTester.normalizeEnums(outUnits, ConversionUtil.validUnits, "output units", UtilError, {
            collectInvalid: true,
            ref: false
        });

        ConversionUtil._checkDimensions(inUnit, outUnits);

        const outVals = outUnits.map(unit =>
            ConversionUtil._formatValue(ConversionUtil._convert(inVal, inUnit, unit), ConversionUtil._suffixes[unit])
        );

        return [ConversionUtil._formatValue(inVal, ConversionUtil._suffixes[inUnit])].concat(outVals);
    },

    convertValue: (inVal, inUnit, outUnit) => {
        ConversionUtil._checkValue(inVal);

        inUnit = ConversionUtil._normalizeUnit(ConversionUtil._lowercaseUnit(inUnit), "input unit");
        outUnit = ConversionUtil._normalizeUnit(ConversionUtil._lowercaseUnit(outUnit), "output unit");

        ConversionUtil._checkDimensions(inUnit, [outUnit]);
        return ConversionUtil._convert(inVal, inUnit, outUnit);
    },

    _suffixes: {
        rf: " RF/t",
        eu: " EU/t",
        ae: " AE/t",
        mb: " mB/t",
        b: " B/t"
    },

    _checkValue: val => {
        if (!Number.isFinite(val)) {
            throw new UtilError("Invalid input value", val);
        }
    },

    _lowercaseUnit: unit => {
        return typeof unit === "string" ? unit.toLowerCase() : "";
    },

    _normalizeUnit: (unit, name) => {
        return TypeTester.normalizeEnum(unit, ConversionUtil.validUnits, name, UtilError, {
            ref: false
        });
    },

    _convert: (inVal, inUnit, outUnit) => {
        return (inVal * ConversionUtil.factors[inUnit]) / ConversionUtil.factors[outUnit];
    },

    _checkDimensions: (inUnit, outUnits) => {
        const dimension = ConversionUtil.dimensions[inUnit],
            incompatible = outUnits.filter(unit => ConversionUtil.dimensions[unit] !== dimension);

        if (!Util.empty(incompatible)) {
            throw new UtilError("Incompatible units");
        }
    },

    _formatValue: (val, suffix) => {
        return Util.formatNumber(val, 4) + suffix;
    }
};

{
    const factors = Object.fromEntries(
        OverclockingValues.voltageNames.map((name, idx) => [
            name.toLowerCase(),
            ConversionUtil.factors.eu * OverclockingValues.baseEu * Math.pow(OverclockingValues.euMultiplier, idx)
        ])
    );
    Object.assign(ConversionUtil.factors, factors);
    Object.assign(ConversionUtil.dimensions, Object.fromEntries(Object.keys(factors).map(name => [name, "energy"])));

    ConversionUtil.validUnits = Object.keys(ConversionUtil.factors);

    const suffixes = Object.fromEntries(
        OverclockingValues.voltageNames.map((name, idx) => [name.toLowerCase(), `A ${name}`])
    );
    Object.assign(ConversionUtil._suffixes, suffixes);
}

ConversionUtil = Object.freeze(ConversionUtil);
export default ConversionUtil;
