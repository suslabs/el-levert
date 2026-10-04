import OverclockingModes from "../util/commands/overclocking/OverclockingModes.js";

const voltageNames = Object.freeze([
    "ULV",
    "LV",
    "MV",
    "HV",
    "EV",
    "IV",
    "LuV",
    "ZPM",
    "UV",
    "UHV",
    "UEV",
    "UIV",
    "UXV",
    "OpV",
    "MAX"
]);

const OverclockingValues = Object.freeze({
    ticksPerSecond: 20,
    identity: 1,
    lowRateThreshold: 0.0001,
    minuteRateThreshold: 0.01,
    baseEu: 8,
    euMultiplier: 4,
    baseHeat: 1800,
    discountHeat: 900,
    discountPercent: 0.95,
    heatIncrease: 100,
    rfEuMultiplier: 4,
    tapeTimeMultiplier: 0.9,
    standardTimeMultiplier: 2,
    perfectTimeMultiplier: 4,
    ceTimeMultiplier: 2.8,
    ceSmallEuMultiplier: 2,
    chanceMultiplier: 2,
    ceVoltageTier: 2,
    standardVoltageLimit: 9,
    voltageNames
});

const modeValues = Object.freeze({
    [OverclockingModes.standard]: Object.freeze({
        timeMultiplier: OverclockingValues.standardTimeMultiplier,
        chanceOffset: 0
    }),
    [OverclockingModes.lcr]: Object.freeze({
        timeMultiplier: OverclockingValues.perfectTimeMultiplier,
        chanceOffset: 0
    }),
    [OverclockingModes.ce]: Object.freeze({
        timeMultiplier: OverclockingValues.ceTimeMultiplier,
        chanceOffset: 1
    }),
    [OverclockingModes.macerator]: Object.freeze({
        timeMultiplier: OverclockingValues.ceTimeMultiplier,
        chanceOffset: -1
    })
});

const tiers = Object.freeze(
    voltageNames.map((name, idx) =>
        Object.freeze({
            tier: idx,
            name,
            eu_threshold: OverclockingValues.baseEu * Math.pow(OverclockingValues.euMultiplier, idx)
        })
    )
);

const tierByName = Object.freeze(Object.fromEntries(tiers.map(tier => [tier.name.toLowerCase(), tier.tier])));

export { OverclockingValues, modeValues, tiers, tierByName };
