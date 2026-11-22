import { OverclockingValues } from "../../structures/OverclockingValues.js";

import Util from "../Util.js";
import ArrayUtil from "../ArrayUtil.js";
import TypeTester from "../TypeTester.js";

import UtilError from "../../errors/UtilError.js";

const units = Object.freeze({
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

    suffixes: {
        rf: " RF/t",
        eu: " EU/t",
        ae: " AE/t",
        mb: " mB/t",
        b: " B/t"
    }
});

{
    const voltageFactors = Object.fromEntries(
        OverclockingValues.voltageNames.map((name, idx) => [
            name.toLowerCase(),
            units.factors.eu * OverclockingValues.baseEu * Math.pow(OverclockingValues.euMultiplier, idx)
        ])
    );

    Object.assign(units.factors, voltageFactors);

    const voltageDimensions = Object.fromEntries(Object.keys(voltageFactors).map(name => [name, "energy"]));
    Object.assign(units.dimensions, voltageDimensions);

    const voltageSuffixes = Object.fromEntries(
        OverclockingValues.voltageNames.map(name => [name.toLowerCase(), `A ${name}`])
    );

    Object.assign(units.suffixes, voltageSuffixes);
}

let ConversionUtil = {
    units,
    validUnits: Object.keys(units.factors),

    convert: (inVal, inUnit, outUnits) => {
        ConversionUtil._checkValue(inVal);

        outUnits = ArrayUtil.guaranteeArray(outUnits).filter(Util.nonemptyString);

        if (Util.empty(outUnits)) {
            throw new UtilError("No output units provided");
        }

        inUnit = ConversionUtil._normalizeUnit(inUnit, "input unit");

        outUnits = TypeTester.normalizeEnums(outUnits, ConversionUtil.validUnits, "output units", UtilError, {
            collectInvalid: true,
            ref: false,
            normalize: unit => unit?.toLowerCase?.() ?? ""
        });
        outUnits = ArrayUtil.unique(outUnits).filter(unit => unit !== inUnit);

        if (Util.empty(outUnits)) {
            throw new UtilError("No output units provided");
        }

        ConversionUtil._checkDimensions(inUnit, outUnits);

        const outVals = outUnits.map(unit =>
            ConversionUtil._formatValue(
                ConversionUtil._convert(inVal, inUnit, unit),
                ConversionUtil.units.suffixes[unit]
            )
        );

        return [ConversionUtil._formatValue(inVal, ConversionUtil.units.suffixes[inUnit])].concat(outVals);
    },

    convertValue: (inVal, inUnit, outUnit) => {
        ConversionUtil._checkValue(inVal);

        inUnit = ConversionUtil._normalizeUnit(inUnit, "input unit");
        outUnit = ConversionUtil._normalizeUnit(outUnit, "output unit");

        ConversionUtil._checkDimensions(inUnit, [outUnit]);
        return ConversionUtil._convert(inVal, inUnit, outUnit);
    },

    _checkValue: val => {
        if (!Number.isFinite(val)) {
            throw new UtilError("Invalid input value", val);
        }
    },

    _normalizeUnit: (unit, name) => {
        return TypeTester.normalizeEnum(unit, ConversionUtil.validUnits, name, UtilError, {
            ref: false,
            normalize: unit => unit?.toLowerCase?.() ?? ""
        });
    },

    _convert: (inVal, inUnit, outUnit) => {
        return (inVal * ConversionUtil.units.factors[inUnit]) / ConversionUtil.units.factors[outUnit];
    },

    _checkDimensions: (inUnit, outUnits) => {
        const dimension = ConversionUtil.units.dimensions[inUnit],
            incompatible = outUnits.filter(unit => ConversionUtil.units.dimensions[unit] !== dimension);

        if (!Util.empty(incompatible)) {
            throw new UtilError("Incompatible units");
        }
    },

    _formatValue: (val, suffix) => {
        return Util.formatNumber(val, 4) + suffix;
    }
};

ConversionUtil = Object.freeze(ConversionUtil);
export default ConversionUtil;
