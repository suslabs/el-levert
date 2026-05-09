import { describe, expect, test } from "vitest";

import OCUtil from "../../../src/util/commands/OCUtil.js";
import OCTypes from "../../../src/util/commands/OCTypes.js";

describe("OCUtil", () => {
    test("parses durations and resolves voltage tiers", () => {
        expect(OCUtil.parseDuration("20t")).toBe(20);
        expect(OCUtil.parseDuration("2.5")).toBe(50);
        expect(OCUtil.formatDuration(10)).toBe("10t");
        expect(OCUtil.formatDuration(40)).toContain("2");

        expect(OCUtil.getTier(1)).toEqual(expect.objectContaining({ name: "LV" }));
        expect(OCUtil.getTierName(999)).toBeNull();
        expect(OCUtil.getTierEu(1)).toBe(32);
        expect(Number.isNaN(OCUtil.getTierEu(999))).toBe(true);
        expect(OCUtil.getEuTier(OCUtil.getTierEu(2))).toBe(2);
        expect(OCUtil.getEuTier(Number.MAX_SAFE_INTEGER)).toBeNull();
    });

    test("calculates overclocks, parallels, ebf values, and validates recipe types", () => {
        expect(OCUtil.calcVoltageTier(2, 2)).toBeGreaterThanOrEqual(2);
        expect(OCUtil.calcTierDiff(1, 3)).toBe(2);
        expect(OCUtil.calcOverclockTiers(8, 2)).toBe(1);
        expect(OCUtil.calcOverclockEu(8, 2)).toBe(128);
        expect(OCUtil.calcOverclockTime(80, 2)).toBe(20);
        expect(OCUtil.calcPerfectOverclockTime(400, 3, 1)).toBeGreaterThan(0);
        expect(OCUtil.calcOverclockChance(20, 5, 2)).toBe(30);
        expect(OCUtil.calcParallel(8, 2, 2, 3)).toEqual([3, 24]);
        expect(OCUtil.calcDownclocks(16)).toBe(2);

        const heat = OCUtil.calcEbfHeat(1800, 4);
        expect(heat).toBeGreaterThan(1800);
        expect(OCUtil.calcHeatDiff(heat, 1800)).toBeGreaterThan(0);
        expect(OCUtil.calcEbfDiscount(heat, 1800)).toBeLessThanOrEqual(1);
        expect(OCUtil.calcEbfTier(32, heat, 1800)).toBeGreaterThan(0);
        expect(OCUtil.calcEbfOverclockEu(32, 1, heat, 1800)).toBeGreaterThan(0);
        expect(OCUtil.calcEbfPerfectOverclocks(heat + 1800, 1800)).toBeGreaterThanOrEqual(1);

        const recipe = {
            base_eu: 8,
            base_duration: 100,
            base_chance: 0,
            base_chance_bonus: 0,
            base_parallel: 4,
            amperage: 1,
            oc_type: OCTypes.parallel
        };
        expect(OCUtil.calculateOverclock(recipe, 2)).toEqual(
            expect.objectContaining({
                tier: 2,
                parallel: 4,
                eu: expect.any(Number),
                time: expect.any(Number),
                chance: 0,
                chance_bonus: 0
            })
        );

        const ebfRecipe = {
            base_eu: 32,
            base_duration: 200,
            base_recipe_heat: 1800,
            base_coil_heat: 2700,
            base_parallel: 2,
            amperage: 1,
            oc_type: OCTypes.ebfParallel
        };
        expect(OCUtil.calculateEbfOverclock(ebfRecipe, 3)).toEqual(
            expect.objectContaining({
                tier: 3,
                parallel: expect.any(Number),
                eu: expect.any(Number),
                time: expect.any(Number)
            })
        );

        expect(OCUtil.overclock({ ...recipe, oc_type: "recipe" }).length).toBeGreaterThan(0);
        expect(OCUtil.overclock({ ...recipe, base_eu: Number.MAX_SAFE_INTEGER }).length).toBe(0);
        expect(() => OCUtil._calcFunc("unknown")).toThrow("Invalid recipe type");
    });
});
