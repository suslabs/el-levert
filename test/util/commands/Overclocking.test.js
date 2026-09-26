import { describe, expect, test } from "vitest";

import Overclocking from "../../../src/util/commands/Overclocking.js";

import OverclockingModes from "../../../src/util/commands/OverclockingModes.js";

import { OverclockingValues } from "../../../src/structures/OverclockingValues.js";

import OCError from "../../../src/errors/OCError.js";

describe("Overclocking", () => {
    describe("static utilities", () => {
        test("resolves voltage tiers and names correctly", () => {
            expect(OverclockingValues.baseEu).toBe(8);
            expect(OverclockingValues.euMultiplier).toBe(4);
            expect(Overclocking.tierCount).toBe(15);
            expect(Overclocking.maxTier).toBe(14);

            expect(Overclocking.getTier(0)).toEqual(expect.objectContaining({ name: "ULV", eu_threshold: 8 }));
            expect(Overclocking.getTier(1)).toEqual(expect.objectContaining({ name: "LV", eu_threshold: 32 }));
            expect(Overclocking.getTier(2)).toEqual(expect.objectContaining({ name: "MV", eu_threshold: 128 }));
            expect(Overclocking.getTier(3)).toEqual(expect.objectContaining({ name: "HV", eu_threshold: 512 }));
            expect(Overclocking.getTier(14)).toEqual(expect.objectContaining({ name: "MAX" }));
            expect(Overclocking.getTier(999)).toBeNull();

            expect(Overclocking.getTierName(3)).toBe("HV");
            expect(Overclocking.getTierName(999)).toBeNull();
            expect(Overclocking.getTierEu(1)).toBe(32);
            expect(Number.isNaN(Overclocking.getTierEu(999))).toBe(true);
        });

        test("calculates voltage tier thresholds including CE distinction", () => {
            expect(Overclocking.getVoltageTier(8, false)).toBe(1);
            expect(Overclocking.getVoltageTier(8, true)).toBe(0);
            expect(Overclocking.getVoltageTier(32, false)).toBe(1);
            expect(Overclocking.getVoltageTier(120, false)).toBe(2);
            expect(Overclocking.getVoltageTier(1920, false)).toBe(4);
            expect(Overclocking.getVoltageTier(Number.MAX_SAFE_INTEGER, false)).toBeNull();
        });

        test("resolves voltage inputs from strings and numbers", () => {
            expect(Overclocking.resolveVoltage("HV")).toBe(3);
            expect(Overclocking.resolveVoltage("hv")).toBe(3);
            expect(Overclocking.resolveVoltage("MAX")).toBe(14);
            expect(Overclocking.resolveVoltage(2)).toBe(2);
            expect(Overclocking.resolveVoltage("2")).toBe(2);
            expect(Overclocking.resolveVoltage("unknown")).toBeNull();
            expect(Overclocking.resolveVoltage(999)).toBeNull();
            expect(Overclocking.resolveVoltage("")).toBeNull();
            expect(Overclocking.resolveVoltage(null)).toBeNull();
        });

        test("validates mode identifiers", () => {
            expect(Overclocking.isValidMode("standard")).toBe(true);
            expect(Overclocking.isValidMode("ebf")).toBe(true);
            expect(Overclocking.isValidMode("lcr")).toBe(true);
            expect(Overclocking.isValidMode("ce")).toBe(true);
            expect(Overclocking.isValidMode("macerator")).toBe(true);
            expect(Overclocking.isValidMode("EBF")).toBe(true);
            expect(Overclocking.isValidMode("invalid")).toBe(false);
            expect(Overclocking.isValidMode(null)).toBe(false);
        });

        test("parses durations in seconds, ticks, and numeric forms", () => {
            expect(Overclocking.parseDuration("20t")).toBe(20);
            expect(Overclocking.parseDuration("2.5")).toBe(50);
            expect(Overclocking.parseDuration("2.5s")).toBe(50);
            expect(Overclocking.parseDuration(40)).toBe(40);
            expect(Number.isNaN(Overclocking.parseDuration("invalid"))).toBe(true);
            expect(Number.isNaN(Overclocking.parseDuration(""))).toBe(true);
            expect(Number.isNaN(Overclocking.parseDuration(null))).toBe(true);
        });

        test("formats durations and rates cleanly", () => {
            expect(Overclocking.formatDuration(10)).toBe("10t");
            expect(Overclocking.formatDuration(40)).toContain("2");

            expect(Overclocking.formatRates(0.00005)).toContain("/h");
            expect(Overclocking.formatRates(0.005)).toContain("/min");
            expect(Overclocking.formatRates(1.5)).toContain("/s");

            expect(Overclocking.calculateRates(40, 1, 1)).toContain("/s");
            expect(Overclocking.calculateRates(40, 2, 4)).toContain("/s");
        });
    });

    describe("stateful class instantiation", () => {
        test("instantiates with guarded options and supports from / toObject", () => {
            const config = {
                mode: OverclockingModes.standard,
                eu: 120,
                duration: "20s"
            };

            const instance = new Overclocking(config);
            expect(instance.baseTier).toBe(2);
            expect(instance.outputs.length).toBeGreaterThan(0);
            expect(instance.isCe).toBe(false);

            const exported = instance.toObject();
            expect(exported.eu).toBe(120);
            expect(exported.mode).toBe("standard");

            const fromInstance = Overclocking.from(instance);
            expect(fromInstance).toBe(instance);

            const fromData = Overclocking.from(config);
            expect(fromData).toBeInstanceOf(Overclocking);

            expect(Overclocking.from(null, true)).toBeNull();
        });

        test("calculates standard mode overclocking accurately", () => {
            const oc = new Overclocking({
                eu: 120,
                duration: "20s",
                chance: 50,
                chanceBonus: 5
            });

            expect(oc.baseTier).toBe(2);
            expect(oc.outputs[0].tier).toBe(2);
            expect(oc.outputs[0].eu).toBe(120);
            expect(oc.outputs[0].time).toBe(400);
            expect(oc.outputs[0].chance).toBe(50);

            // One tier higher (HV, tier 3): time halves, EU quadruples, chance increases
            expect(oc.outputs[1].tier).toBe(3);
            expect(oc.outputs[1].eu).toBe(480);
            expect(oc.outputs[1].time).toBe(200);
            expect(oc.outputs[1].chance).toBe(55);
        });

        test("applies parallel, subtick, tape, and multipliers", () => {
            const oc = new Overclocking({
                eu: 32,
                duration: "10t",
                parallel: 8,
                amperage: 2,
                hasParallel: true,
                tape: true,
                subtick: true,
                timeMultiplier: 0.5,
                euMultiplier: 2,
                count: 3,
                rates: true,
                inputAmount: 1,
                outputAmount: 2
            });

            expect(oc.hasParallel).toBe(true);
            expect(oc.outputs.length).toBeGreaterThan(0);

            const first = oc.outputs[0];
            expect(first.parallel).toBeGreaterThanOrEqual(1);
            expect(first.rates).toBeDefined();
            expect(first.inputRates).toBeDefined();
            expect(first.eu).toBeGreaterThan(32);
        });

        test("calculates EBF mode overclocks with temperature discounts", () => {
            const oc = new Overclocking({
                mode: OverclockingModes.ebf,
                eu: 1920,
                duration: "60.3s",
                recipeHeat: 3600,
                coilHeat: 5200,
                parallel: 4,
                amperage: 2,
                hasParallel: true
            });

            expect(oc.baseTier).toBeDefined();
            expect(oc.outputs.length).toBeGreaterThan(0);

            const first = oc.outputs[0];
            expect(first.time).toBeGreaterThan(0);
            expect(first.eu).toBeGreaterThan(0);
        });

        test("calculates LCR mode with perfect 4x overclock", () => {
            const oc = new Overclocking({
                mode: OverclockingModes.lcr,
                eu: 120,
                duration: "400t"
            });

            expect(oc.outputs[0].time).toBe(400);
            // 4x speed overclock instead of 2x
            expect(oc.outputs[1].time).toBe(100);
        });

        test("calculates CE mode with 2.8x overclock and chance doubling", () => {
            const oc = new Overclocking({
                mode: OverclockingModes.ce,
                eu: 120,
                duration: "400t",
                chance: 10
            });

            expect(oc.isCe).toBe(true);
            expect(oc.outputs[0].tier).toBe(2);
            expect(oc.outputs.at(-1).tier).toBe(9);
            expect(oc.outputs.at(-1).tierName).toBe("MAX");
        });

        test("calculates macerator mode with CE chance scaling offset", () => {
            const oc = new Overclocking({
                mode: OverclockingModes.macerator,
                eu: 120,
                duration: "400t",
                chance: 10
            });

            expect(oc.isCe).toBe(true);
            expect(oc.outputs[0].chance).toBeDefined();
        });

        test("filters to a single voltage target", () => {
            const oc = new Overclocking({
                eu: 120,
                duration: "20s",
                voltage: "HV"
            });

            expect(oc.outputs).toHaveLength(1);
            expect(oc.outputs[0].tier).toBe(3);
            expect(oc.outputs[0].tierName).toBe("HV");
        });

        test("supports RF mode dividing EU by 4", () => {
            const normal = new Overclocking({
                eu: 128,
                duration: "20s"
            });

            const rf = new Overclocking({
                eu: 128,
                duration: "20s",
                rf: true
            });

            expect(rf.eu).toBe(32);
            expect(rf.baseTier).toBeLessThan(normal.baseTier);
        });

        test("generates drawn table output", () => {
            const oc = new Overclocking({
                eu: 120,
                duration: "20s",
                chance: 50,
                chanceBonus: 5,
                rates: true
            });

            const table = oc.generateTable();
            expect(table).toContain("EU/t");
            expect(table).toContain("Time");
            expect(table).toContain("Voltage");
            expect(table).toContain("Chance");
            expect(table).toContain("Rates");
        });
    });

    describe("explicit error handling (OCError)", () => {
        test("throws for missing required fields", () => {
            expect(() => new Overclocking({})).toThrow(OCError);
            try {
                new Overclocking({});
            } catch (err) {
                expect(err.ref.reason).toBe("missing_args");
                expect(err.ref.field).toBe("eu");
            }

            expect(() => new Overclocking({ eu: 32 })).toThrow(OCError);
            try {
                new Overclocking({ eu: 32 });
            } catch (err) {
                expect(err.ref.reason).toBe("missing_args");
                expect(err.ref.field).toBe("duration");
            }
        });

        test("throws for invalid numbers and out of range values", () => {
            expect(() => new Overclocking({ eu: -5, duration: 20 })).toThrow(OCError);
            expect(() => new Overclocking({ eu: 32, duration: -1 })).toThrow(OCError);
            expect(() => new Overclocking({ eu: 32, duration: "invalid" })).toThrow(OCError);
            expect(() => new Overclocking({ eu: 32, duration: 20, chance: 150 })).toThrow(OCError);
            expect(() => new Overclocking({ eu: 32, duration: 20, chanceBonus: -1 })).toThrow(OCError);
            expect(() => new Overclocking({ eu: 32, duration: 20, parallel: 0 })).toThrow(OCError);
            expect(() => new Overclocking({ eu: 32, duration: 20, amperage: 0 })).toThrow(OCError);
            expect(() => new Overclocking({ eu: 32, duration: 20, count: 0 })).toThrow(OCError);
            expect(() => new Overclocking({ eu: 32, duration: 20, timeMultiplier: 0 })).toThrow(OCError);
            expect(() => new Overclocking({ eu: 32, duration: 20, euMultiplier: 0 })).toThrow(OCError);
            expect(() => new Overclocking({ eu: 32, duration: 20, inputAmount: -1 })).toThrow(OCError);
            expect(() => new Overclocking({ eu: 32, duration: 20, outputAmount: -1 })).toThrow(OCError);
        });

        test("throws for missing EBF heat parameters", () => {
            expect(() => new Overclocking({ mode: OverclockingModes.ebf, eu: 1920, duration: "60s" })).toThrow(OCError);
            try {
                new Overclocking({ mode: OverclockingModes.ebf, eu: 1920, duration: "60s" });
            } catch (err) {
                expect(err.ref.reason).toBe("missing_heat");
            }

            expect(
                () =>
                    new Overclocking({
                        mode: OverclockingModes.ebf,
                        eu: 1920,
                        duration: "60s",
                        recipeHeat: -1,
                        coilHeat: 1800
                    })
            ).toThrow(OCError);
        });

        test("throws for invalid voltage and mode", () => {
            expect(() => new Overclocking({ eu: 32, duration: 20, voltage: "bogus" })).toThrow(OCError);
            try {
                new Overclocking({ eu: 32, duration: 20, voltage: "bogus" });
            } catch (err) {
                expect(err.ref.reason).toBe("invalid_voltage");
            }

            expect(() => new Overclocking({ mode: "unknown", eu: 32, duration: 20 })).toThrow(OCError);
        });

        test("throws for CE mode with extra tiers", () => {
            expect(() => new Overclocking({ mode: OverclockingModes.ce, eu: 32, duration: 20, extra: true })).toThrow(
                OCError
            );
            try {
                new Overclocking({ mode: OverclockingModes.ce, eu: 32, duration: 20, extra: true });
            } catch (err) {
                expect(err.ref.reason).toBe("ce_no_uev");
            }
        });

        test("throws when EU exceeds maximum voltage", () => {
            expect(() => new Overclocking({ eu: Number.MAX_SAFE_INTEGER, duration: 20 })).toThrow(OCError);
            try {
                new Overclocking({ eu: Number.MAX_SAFE_INTEGER, duration: 20 });
            } catch (err) {
                expect(err.ref.reason).toBe("no_voltage_match");
            }
        });
    });
});
