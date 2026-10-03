import OverclockingModes, { validModes } from "./OverclockingModes.js";

import { OverclockingValues, modeValues, tiers, tierByName } from "../../structures/OverclockingValues.js";

import Util from "../Util.js";
import TypeTester from "../TypeTester.js";
import ObjectUtil from "../ObjectUtil.js";
import { drawTable } from "../misc/Table.js";

import OCError from "../../errors/OCError.js";

class Overclocking {
    static defaultValues = Object.freeze({
        mode: OverclockingModes.standard,
        eu: null,
        duration: null,
        chance: 0,
        chanceBonus: 0,
        recipeHeat: null,
        coilHeat: null,
        parallel: 1,
        amperage: 1,
        hasParallel: false,
        tape: false,
        subtick: false,
        extra: false,
        rf: false,
        tick: false,
        rates: false,
        text: false,
        voltage: null,
        count: 1,
        timeMultiplier: OverclockingValues.identity,
        euMultiplier: OverclockingValues.identity,
        inputAmount: null,
        outputAmount: null,
        auto: false
    });

    static get tierCount() {
        return tiers.length;
    }

    static get maxTier() {
        return tiers.length - 1;
    }

    static from(data, nullable = false) {
        if (nullable && data === null) {
            return null;
        }

        return data instanceof this ? data : new this(data);
    }

    static getTier(voltage) {
        return tiers[voltage] ?? null;
    }

    static getTierName(voltage) {
        return this.getTier(voltage)?.name ?? null;
    }

    static getTierEu(voltage) {
        return this.getTier(voltage)?.eu_threshold ?? NaN;
    }

    static getVoltageTier(euCost, isCe = false) {
        if (!Number.isFinite(euCost) || euCost <= 0 || euCost > this.getTierEu(this.maxTier)) {
            return null;
        }

        const baseTier = Math.max(
                0,
                Math.floor(Math.log(euCost / OverclockingValues.baseEu) / Math.log(OverclockingValues.euMultiplier))
            ),
            tier = tiers[baseTier].eu_threshold < euCost ? baseTier + 1 : baseTier;

        return !isCe && tier === 0 ? 1 : tier;
    }

    static resolveVoltage(input) {
        if (typeof input === "number") {
            return input >= 0 && input < this.tierCount ? Math.floor(input) : null;
        }

        if (typeof input !== "string" || Util.empty(input)) {
            return null;
        }

        const parsedNum = Util.parseInt(input);

        if (!Number.isNaN(parsedNum) && parsedNum >= 0 && parsedNum < this.tierCount) {
            return parsedNum;
        }

        const tier = tierByName[input.toLowerCase()];

        return typeof tier === "number" ? tier : null;
    }

    static isValidMode(mode) {
        return typeof mode === "string" && validModes.has(mode.toLowerCase());
    }

    static parseDuration(input) {
        if (typeof input === "number") {
            return Math.floor(input);
        }

        if (typeof input !== "string" || Util.empty(input)) {
            return NaN;
        }

        input = input.trim();

        if (input.endsWith("t")) {
            return Util.parseInt(input.slice(0, -1));
        }

        if (input.endsWith("s")) {
            input = input.slice(0, -1);
        }

        const secs = Number.parseFloat(input);
        return Number.isNaN(secs) ? NaN : Math.floor(secs * OverclockingValues.ticksPerSecond);
    }

    static formatDuration(time) {
        return time < OverclockingValues.ticksPerSecond
            ? time + "t"
            : Util.formatNumber(time / OverclockingValues.ticksPerSecond, 2) + "s";
    }

    static formatRates(ratesSec) {
        if (ratesSec < OverclockingValues.lowRateThreshold) {
            return Util.formatNumber(ratesSec * Util.durationSeconds.hour, 2) + "/h";
        } else if (ratesSec < OverclockingValues.minuteRateThreshold) {
            return Util.formatNumber(ratesSec * Util.durationSeconds.minute, 2) + "/min";
        }

        return Util.formatNumber(ratesSec, 2) + "/s";
    }

    static calculateRates(time, amount = 1, parallel = 1) {
        const p = parallel ?? OverclockingValues.identity,
            rate = (1 / (time / OverclockingValues.ticksPerSecond)) * amount * p;

        return this.formatRates(rate);
    }

    constructor(options) {
        options = ObjectUtil.guaranteeObject(options);
        const config = typeof options.toObject === "function" ? options.toObject() : options;

        ObjectUtil.setValuesWithDefaults(this, config, this.constructor.defaultValues);

        this._init();
    }

    get isCe() {
        switch (this.mode) {
            case OverclockingModes.ce:
            case OverclockingModes.macerator:
                return true;
            default:
                return false;
        }
    }

    toObject() {
        return {
            mode: this.mode,
            eu: this.eu,
            duration: this.duration,
            chance: this.chance,
            chanceBonus: this.chanceBonus,
            recipeHeat: this.recipeHeat,
            coilHeat: this.coilHeat,
            parallel: this.parallel,
            amperage: this.amperage,
            hasParallel: this.hasParallel,
            tape: this.tape,
            subtick: this.subtick,
            extra: this.extra,
            rf: this.rf,
            tick: this.tick,
            rates: this.rates,
            text: this.text,
            voltage: this.voltage,
            count: this.count,
            timeMultiplier: this.timeMultiplier,
            euMultiplier: this.euMultiplier,
            inputAmount: this.inputAmount,
            outputAmount: this.outputAmount,
            auto: this.auto
        };
    }

    generateTable() {
        const hasChance = this.hasChance,
            hasParallel = this.hasParallel,
            hasInput = this.rates && this.inputAmount != null,
            hasRates = this.rates;

        const columns = {
            eu: "EU/t",
            time: "Time",
            ...(hasChance ? { chance: "Chance" } : {}),
            ...(hasParallel ? { parallel: "Parallel" } : {}),
            ...(hasInput ? { input: "Input" } : {}),
            ...(hasRates ? { rates: hasInput ? "Output" : "Rates" } : {}),
            tier: "Voltage"
        };

        const rows = {
            eu: this.outputs.map(row => Util.formatNumber(row.eu, 3) + " EU/t"),
            time: this.outputs.map(row =>
                this.tick || row.time < OverclockingValues.ticksPerSecond
                    ? row.time + "t"
                    : Util.formatNumber(row.time / OverclockingValues.ticksPerSecond, 2) + "s"
            ),
            ...(hasChance ? { chance: this.outputs.map(row => Util.round(row.chance, 3) + "%") } : {}),
            ...(hasParallel ? { parallel: this.outputs.map(row => row.parallel + "x") } : {}),
            ...(hasInput ? { input: this.outputs.map(row => row.inputRates) } : {}),
            ...(hasRates ? { rates: this.outputs.map(row => row.rates) } : {}),
            tier: this.outputs.map(row => row.tierName)
        };

        return drawTable(columns, rows, "light", {
            sideLines: false
        });
    }

    _calcEbfDiscount(heat, recipeHeat) {
        const diff = Math.max(0, heat - recipeHeat),
            count = Math.floor(diff / OverclockingValues.discountHeat);

        return Math.pow(OverclockingValues.discountPercent, count);
    }

    _formatRow(voltage, eu, time, chance, parallel) {
        const tierName =
                this.isCe && voltage === OverclockingValues.standardVoltageLimit
                    ? this.constructor.getTierName(this.constructor.maxTier)
                    : this.constructor.getTierName(voltage),
            totalEu = eu * this.count,
            row = {
                tier: voltage,
                tierName,
                eu: totalEu,
                time,
                timeSeconds: time / OverclockingValues.ticksPerSecond,
                chance,
                chanceBonus: this.chanceBonus,
                parallel,
                rates: null,
                inputRates: null
            };

        if (this.rates) {
            const outAmount = (this.outputAmount ?? OverclockingValues.identity) * this.count;
            row.rates = this.constructor.calculateRates(time, outAmount, parallel);

            if (this.inputAmount != null) {
                const inAmount = this.inputAmount * this.count;
                row.inputRates = this.constructor.calculateRates(time, inAmount, parallel);
            }
        }

        return row;
    }

    _getParallelBase(voltage) {
        let baseEu = this.eu,
            parallel = null;

        if (this.hasParallel) {
            const maxParallel = Math.floor((this.amperage * this.constructor.getTierEu(voltage)) / this.eu);
            parallel = Math.max(1, Math.min(this.parallel, maxParallel));
            baseEu = this.eu * parallel;
        }

        return { baseEu, parallel };
    }

    _applyMultipliers(eu, time) {
        if (this.tape) {
            time = Math.floor(time * OverclockingValues.tapeTimeMultiplier);
        }

        if (this.timeMultiplier !== OverclockingValues.identity) {
            time = Math.floor(time * this.timeMultiplier);
        }

        if (this.euMultiplier !== OverclockingValues.identity) {
            eu = Math.floor(eu * this.euMultiplier);
        }

        return { eu, time };
    }

    _calculateStandardTier(voltage) {
        const base = this._getParallelBase(voltage),
            baseEu = base.baseEu,
            voltageTier = this.constructor.getVoltageTier(baseEu, this.isCe),
            ocTiers = Math.max(0, voltage - voltageTier),
            mode = modeValues[this.mode];

        let parallel = base.parallel,
            effectiveEu = baseEu,
            effectiveTime = this.duration,
            chance = null;

        if (this.isCe) {
            const ocDiv =
                    baseEu <= OverclockingValues.baseEu * OverclockingValues.ceSmallEuMultiplier
                        ? OverclockingValues.standardTimeMultiplier
                        : mode.timeMultiplier,
                overclockCount = Math.min(Math.floor(Math.log(effectiveTime) / Math.log(ocDiv)), ocTiers),
                doublingCount = ocTiers + (voltage >= OverclockingValues.ceVoltageTier ? mode.chanceOffset : 0);

            effectiveTime = Math.max(1, Math.ceil(effectiveTime / Math.pow(ocDiv, overclockCount)));
            effectiveEu = Math.floor(baseEu * Math.pow(OverclockingValues.euMultiplier, overclockCount));

            if (this.chance > 0 || this.chanceBonus > 0) {
                chance = Util.clamp(this.chance * Math.pow(OverclockingValues.chanceMultiplier, doublingCount), 0, 100);
            }
        } else {
            const ocRatio = mode.timeMultiplier,
                effectiveOc = Math.min(ocTiers, Math.floor(Math.log(effectiveTime) / Math.log(ocRatio)));

            effectiveEu = Math.floor(
                baseEu * Math.pow(OverclockingValues.euMultiplier, this.hasParallel ? ocTiers : effectiveOc)
            );
            effectiveTime = Math.max(1, Math.floor(this.duration / Math.pow(ocRatio, ocTiers)));

            if (this.subtick && ocTiers > effectiveOc) {
                parallel = (parallel ?? OverclockingValues.identity) * Math.pow(ocRatio, ocTiers - effectiveOc);
            }

            if (this.chance > 0 || this.chanceBonus > 0) {
                chance = Util.clamp(this.chance + this.chanceBonus * ocTiers, 0, 100);
            }
        }

        const adjusted = this._applyMultipliers(effectiveEu, effectiveTime);

        return this._formatRow(voltage, Math.max(1, adjusted.eu), Math.max(1, adjusted.time), chance, parallel);
    }

    _calculateEbfTier(voltage) {
        const base = this._getParallelBase(voltage),
            initialDiscount = this._calcEbfDiscount(this.coilHeat, this.recipeHeat),
            initialTier = this.constructor.getVoltageTier(base.baseEu * initialDiscount),
            voltageEu = this.constructor.getTierEu(voltage),
            recipeVoltage = this.constructor.getVoltageTier(voltageEu * this.amperage - 1),
            ocTiers = Math.max(0, recipeVoltage - initialTier),
            effectiveHeat =
                this.coilHeat + (recipeVoltage - OverclockingValues.ceVoltageTier) * OverclockingValues.heatIncrease,
            perfectOverclocks = Math.floor(Math.max(0, effectiveHeat - this.recipeHeat) / OverclockingValues.baseHeat),
            effectiveDiscount = this._calcEbfDiscount(effectiveHeat, this.recipeHeat),
            effectiveEu = base.baseEu * effectiveDiscount * Math.pow(OverclockingValues.euMultiplier, ocTiers),
            effectiveTime =
                this.duration /
                Math.pow(OverclockingValues.perfectTimeMultiplier, Math.min(ocTiers, perfectOverclocks)) /
                Math.pow(OverclockingValues.standardTimeMultiplier, Math.max(0, ocTiers - perfectOverclocks)),
            adjusted = this._applyMultipliers(effectiveEu, effectiveTime);

        return this._formatRow(
            voltage,
            Math.max(1, Math.floor(adjusted.eu)),
            Math.max(1, Math.floor(adjusted.time)),
            null,
            base.parallel
        );
    }

    _calculateTier(voltage) {
        switch (this.mode) {
            case OverclockingModes.ebf:
                return this._calculateEbfTier(voltage);
            default:
                return this._calculateStandardTier(voltage);
        }
    }

    _calculateOutputs() {
        if (this.targetTier !== null) {
            return [this._calculateTier(this.targetTier)];
        }

        const maxTier = this.extra ? this.constructor.maxTier : OverclockingValues.standardVoltageLimit,
            outputs = [];

        for (let i = this.baseTier; i <= maxTier; i++) {
            outputs.push(this._calculateTier(i));
        }

        return outputs;
    }

    _validate() {
        this.mode = TypeTester.normalizeEnum(this.mode, validModes, "recipe mode", OCError);

        if (this.eu == null) {
            throw new OCError("EU cost is required", {
                reason: "missing_args",
                field: "eu"
            });
        }

        if (typeof this.eu === "string") {
            this.eu = Number.parseFloat(this.eu);
        }

        if (this.rf) {
            this.eu = Math.floor(this.eu / OverclockingValues.rfEuMultiplier);
        }

        if (typeof this.eu !== "number" || Number.isNaN(this.eu) || this.eu <= 0) {
            throw new OCError("EU cost must be positive", {
                reason: "invalid_value",
                field: "eu",
                value: this.eu,
                mode: this.mode
            });
        }

        if (this.duration == null) {
            throw new OCError("Recipe duration is required", {
                reason: "missing_args",
                field: "duration"
            });
        }

        if (typeof this.duration === "string") {
            this.duration = this.constructor.parseDuration(this.duration);
        }

        if (typeof this.duration !== "number" || Number.isNaN(this.duration) || this.duration <= 0) {
            throw new OCError("Recipe duration must be positive", {
                reason: "invalid_value",
                field: "duration",
                value: this.duration,
                mode: this.mode
            });
        }

        if (typeof this.chance !== "number" || Number.isNaN(this.chance) || this.chance < 0 || this.chance > 100) {
            throw new OCError("Recipe chance must be between 0 and 100", {
                reason: "invalid_value",
                field: "chance",
                value: this.chance,
                mode: this.mode
            });
        }

        if (
            typeof this.chanceBonus !== "number" ||
            Number.isNaN(this.chanceBonus) ||
            this.chanceBonus < 0 ||
            this.chanceBonus > 100
        ) {
            throw new OCError("Recipe chance bonus must be between 0 and 100", {
                reason: "invalid_value",
                field: "chanceBonus",
                value: this.chanceBonus,
                mode: this.mode
            });
        }

        if (typeof this.parallel !== "number" || Number.isNaN(this.parallel) || this.parallel <= 0) {
            throw new OCError("Recipe parallel must be positive", {
                reason: "invalid_value",
                field: "parallel",
                value: this.parallel,
                mode: this.mode
            });
        }

        if (typeof this.amperage !== "number" || Number.isNaN(this.amperage) || this.amperage <= 0) {
            throw new OCError("Recipe amperage must be positive", {
                reason: "invalid_value",
                field: "amperage",
                value: this.amperage,
                mode: this.mode
            });
        }

        if (this.mode === OverclockingModes.ebf) {
            if (this.recipeHeat == null || this.coilHeat == null) {
                throw new OCError("Both recipe temperature and coil temperature must be provided", {
                    reason: "missing_heat",
                    recipeHeat: this.recipeHeat,
                    coilHeat: this.coilHeat
                });
            }

            if (typeof this.recipeHeat !== "number" || Number.isNaN(this.recipeHeat) || this.recipeHeat <= 0) {
                throw new OCError("Recipe temperature must be positive", {
                    reason: "invalid_value",
                    field: "recipeHeat",
                    value: this.recipeHeat,
                    mode: this.mode
                });
            }

            if (typeof this.coilHeat !== "number" || Number.isNaN(this.coilHeat) || this.coilHeat <= 0) {
                throw new OCError("Coil temperature must be positive", {
                    reason: "invalid_value",
                    field: "coilHeat",
                    value: this.coilHeat,
                    mode: this.mode
                });
            }
        }

        if (this.isCe && this.extra) {
            throw new OCError(
                "Nomifactory CE does not have UEV+ Voltage, voltages in Nomifactory caps to MAX (sames as UHV)",
                {
                    reason: "ce_no_uev"
                }
            );
        }

        if (this.voltage != null) {
            this.targetTier = this.constructor.resolveVoltage(this.voltage);

            if (this.targetTier === null) {
                throw new OCError(`${this.voltage} is not a valid voltage`, {
                    reason: "invalid_voltage",
                    voltage: this.voltage
                });
            }
        } else {
            this.targetTier = null;
        }

        if (typeof this.count !== "number" || Number.isNaN(this.count) || this.count <= 0) {
            throw new OCError("Machine count must be positive", {
                reason: "invalid_value",
                field: "count",
                value: this.count
            });
        }

        if (typeof this.timeMultiplier !== "number" || Number.isNaN(this.timeMultiplier) || this.timeMultiplier <= 0) {
            throw new OCError("Time multiplier must be positive", {
                reason: "invalid_value",
                field: "timeMultiplier",
                value: this.timeMultiplier
            });
        }

        if (typeof this.euMultiplier !== "number" || Number.isNaN(this.euMultiplier) || this.euMultiplier <= 0) {
            throw new OCError("EU multiplier must be positive", {
                reason: "invalid_value",
                field: "euMultiplier",
                value: this.euMultiplier
            });
        }

        if (
            this.inputAmount != null &&
            (typeof this.inputAmount !== "number" || Number.isNaN(this.inputAmount) || this.inputAmount <= 0)
        ) {
            throw new OCError("Input rate multiplier must be positive", {
                reason: "invalid_value",
                field: "inputAmount",
                value: this.inputAmount
            });
        }

        if (
            this.outputAmount != null &&
            (typeof this.outputAmount !== "number" || Number.isNaN(this.outputAmount) || this.outputAmount <= 0)
        ) {
            throw new OCError("Output rate multiplier must be positive", {
                reason: "invalid_value",
                field: "outputAmount",
                value: this.outputAmount
            });
        }
    }

    _init() {
        this._validate();

        let baseEuForTier = this.eu;

        switch (this.mode) {
            case OverclockingModes.ebf:
                baseEuForTier *= this._calcEbfDiscount(this.coilHeat, this.recipeHeat);
                break;
            default:
                break;
        }

        this.baseTier = this.constructor.getVoltageTier(baseEuForTier, this.isCe);

        if (this.baseTier === null) {
            throw new OCError("No voltage tier matches the input EU", {
                reason: "no_voltage_match",
                eu: this.eu
            });
        }

        this.outputs = this._calculateOutputs();

        if (Util.empty(this.outputs)) {
            throw new OCError("No voltage tier can calculate this recipe", {
                reason: "no_output",
                eu: this.eu
            });
        }

        this.hasChance = this.outputs.some(row => row.chance != null && row.chance > 0);
    }
}

export default Overclocking;
