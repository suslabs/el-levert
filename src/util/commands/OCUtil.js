import Util from "../Util.js";

import UtilError from "../../errors/UtilError.js";

const OCUtil = {
    OC_RATIO: 2,
    EU_MULT: 4,
    HEAT_INC: 100,

    get PERFECT_OC_RATIO() {
        return Math.pow(this.OC_RATIO, 2);
    },

    BASE_EU: 32,
    BASE_HEAT: 1800,

    DISCOUNT_PERC: 95 / 100,
    DISCOUNT_HEAT: 900,

    voltageNames: ["LV", "MV", "HV", "EV", "IV", "LuV", "ZPM", "UV", "UHV", "UEV", "UIV", "UXV", "OpV", "MAX"],

    get tierCount() {
        return this.tiers.length;
    },

    get maxTier() {
        return this.getTier(this.tierCount).tier;
    },

    parseDuration: input => {
        if (input.endsWith("t")) {
            return Math.floor(Util.parseInt(input));
        }

        return Math.floor(Number.parseFloat(input) * 20);
    },

    formatDuration: time => {
        if (time >= 20) {
            time = Util.round(time / 20, 2);
            return time.toLocaleString() + "s";
        } else {
            return time.toLocaleString() + "t";
        }
    },

    getTier: voltage => {
        return OCUtil.tiers[voltage - 1] ?? null;
    },

    getTierName: voltage => {
        const tier = OCUtil.getTier(voltage);
        return tier?.name ?? null;
    },

    getTierEu: voltage => {
        const tier = OCUtil.getTier(voltage);
        return tier?.eu_threshold ?? NaN;
    },

    getEuTier: euCost => {
        for (let voltage = 1; voltage <= OCUtil.tierCount; voltage++) {
            const tier = OCUtil.getTier(voltage);

            if (euCost <= tier.eu_threshold) {
                return voltage;
            }
        }

        return null;
    },

    calcVoltageTier: (voltage, amperage) => {
        const voltageEu = OCUtil.getTierEu(voltage);
        return OCUtil.getEuTier(voltageEu * amperage - 1);
    },

    calcTierDiff: (currTier, targetTier) => {
        return Util.clamp(targetTier - currTier, 0, OCUtil.tierCount - 1);
    },

    calcOverclockTiers: (eu, voltage) => {
        const voltageTier = OCUtil.getEuTier(eu);
        return OCUtil.calcTierDiff(voltageTier, voltage);
    },

    calcOverclockEu: (eu, tiers) => {
        return eu * Math.pow(OCUtil.EU_MULT, tiers);
    },

    calcOverclockTime: (time, tiers) => {
        const newTime = Math.floor(time / Math.pow(OCUtil.OC_RATIO, tiers));
        return Util.clamp(newTime, 1);
    },

    calcPerfectOverclockTime: (time, tiers, perfectOverclocks) => {
        const perfect = Math.pow(OCUtil.PERFECT_OC_RATIO, Math.min(tiers, perfectOverclocks)),
            regular = Math.pow(OCUtil.OC_RATIO, Util.clamp(0, tiers - perfectOverclocks));

        const newTime = Math.floor(time / perfect / regular);
        return Util.clamp(newTime, 1);
    },

    calcOverclockChance: (chance, bonus, tiers) => {
        const newChance = chance + bonus * tiers;
        return Util.clamp(newChance, 0, 100);
    },

    calcParallel: (eu, voltage, amperage, maxParallel) => {
        const voltageEu = OCUtil.getTierEu(voltage);

        let parallel = Math.floor((amperage * voltageEu) / eu);
        parallel = Util.clamp(parallel, null, maxParallel);

        const parallelEu = eu * parallel;
        return [parallel, parallelEu];
    },

    calcDownclocks: parallel => {
        return Math.floor(Math.log(parallel) / Math.log(4));
    },

    calcEbfHeat: (coilHeat, voltage) => {
        voltage = Util.clamp(voltage - 2, 0);
        return coilHeat + voltage * OCUtil.HEAT_INC;
    },

    calcHeatDiff: (heat, recipeHeat) => {
        return Util.clamp(heat - recipeHeat, 0);
    },

    calcEbfDiscount: (heat, recipeHeat) => {
        const heatDiff = OCUtil.calcHeatDiff(heat, recipeHeat),
            count = Math.floor(heatDiff / OCUtil.DISCOUNT_HEAT);

        return Math.pow(OCUtil.DISCOUNT_PERC, count);
    },

    calcEbfTier: (eu, heat, recipeHeat) => {
        const discount = OCUtil.calcEbfDiscount(heat, recipeHeat);
        return OCUtil.getEuTier(eu * discount);
    },

    calcEbfOverclockEu: (eu, tiers, heat, recipeHeat) => {
        const discount = OCUtil.calcEbfDiscount(heat, recipeHeat);
        return Math.floor(eu * discount * Math.pow(OCUtil.EU_MULT, tiers));
    },

    calcEbfPerfectOverclocks: (heat, recipeHeat) => {
        const heatDiff = OCUtil.calcHeatDiff(heat, recipeHeat);
        return Math.floor(heatDiff / OCUtil.BASE_HEAT);
    },

    calculateOverclock: (recipe, voltage) => {
        const isParallel = recipe.oc_type.startsWith("parallel");

        let baseEu = recipe.base_eu;

        const ocTiers = OCUtil.calcOverclockTiers(baseEu, voltage);

        const baseChance = recipe.base_chance ?? 0,
            baseChanceBonus = recipe.base_chance_bonus ?? 0;

        const output = {
            parallel: null
        };

        if (isParallel) {
            let parallel;
            [parallel, baseEu] = OCUtil.calcParallel(baseEu, voltage, recipe.amperage, recipe.base_parallel);

            output.parallel = parallel;
        }

        output.tier = voltage;
        output.eu = OCUtil.calcOverclockEu(baseEu, ocTiers);
        output.time = OCUtil.calcOverclockTime(recipe.base_duration, ocTiers);

        output.chance = OCUtil.calcOverclockChance(baseChance, baseChanceBonus, ocTiers);
        output.chance_bonus = baseChanceBonus;

        return output;
    },

    calculateEbfOverclock: (recipe, voltage) => {
        const isParallel = recipe.oc_type.startsWith("parallel");

        let baseEu = recipe.base_eu;

        const output = {
            parallel: null,
            chance: null,
            chance_bonus: null
        };

        if (isParallel) {
            let parallel;
            [parallel, baseEu] = OCUtil.calcParallel(baseEu, voltage, recipe.amperage, recipe.base_parallel);

            output.parallel = parallel;
        }

        const newTier = OCUtil.calcEbfTier(baseEu, recipe.base_coil_heat, recipe.base_recipe_heat),
            recipeTier = OCUtil.calcVoltageTier(voltage, recipe.amperage),
            overclockTiers = OCUtil.calcTierDiff(newTier, recipeTier);

        const heat = OCUtil.calcEbfHeat(recipe.base_coil_heat, voltage),
            perfectOverclocks = OCUtil.calcEbfPerfectOverclocks(heat, recipe.base_recipe_heat);

        output.eu = OCUtil.calcEbfOverclockEu(baseEu, overclockTiers, heat, recipe.base_recipe_heat);
        output.time = OCUtil.calcPerfectOverclockTime(recipe.base_duration, overclockTiers, perfectOverclocks);
        output.tier = voltage;

        return output;
    },

    overclock: recipe => {
        const baseTier = OCUtil.getEuTier(recipe.base_eu),
            outputs = [];

        let calcFunc;

        switch (recipe.oc_type) {
            case "recipe":
            case "parallel":
                calcFunc = OCUtil.calculateOverclock;
                break;
            case "ebf":
            case "ebf_parallel":
                calcFunc = OCUtil.calculateEbfOverclock;
                break;
            default:
                throw new UtilError("Invalid recipe type: " + recipe.oc_type);
        }

        let last;

        for (let voltage = baseTier; voltage < OCUtil.tierCount; voltage++) {
            const res = calcFunc(recipe, voltage);

            if (res.time === last?.time && res.chance === last?.chance) {
                break;
            }

            outputs.push(res);
            last = res;
        }

        return outputs;
    }
};

OCUtil.tiers = OCUtil.voltageNames.map((name, index) => {
    return {
        tier: index + 1,
        name: name,
        eu_threshold: OCUtil.BASE_EU * Math.pow(OCUtil.EU_MULT, index)
    };
});

export default OCUtil;
