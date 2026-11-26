import { describe, expect, test, vi } from "vitest";

import ComponentSession from "../../../src/structures/interaction/ComponentSession.js";

import Util from "../../../src/util/Util.js";
import ListDetailView from "../../../src/util/commands/ListDetailView.js";
import PickerUtil from "../../../src/util/commands/PickerUtil.js";

describe("PickerUtil", () => {
    test("uses one-based labels and keeps duplicate values as separate choices", async () => {
        const session = new ComponentSession({ author: { id: "author" } });
        const onPick = vi.fn();

        const { rows, activate } = PickerUtil.prepareRows(session, ["same", "same", "c", "d", "e", "f"], onPick);
        activate();

        const [first, second] = rows.map(row => row.toJSON().components);

        expect(first.map(button => button.label)).toEqual(["1", "2", "3", "4", "5"]);
        expect(second.map(button => button.label)).toEqual(["6"]);

        const [one, two] = first;
        expect(one.custom_id).not.toBe(two.custom_id);

        const ctx = { interactionContext: { session, interaction: { customId: two.custom_id } } };
        await expect(PickerUtil.handleInteraction(ctx)).resolves.toBe(true);
        expect(onPick).toHaveBeenCalledWith(ctx, "same");
    });

    test("ignores old option buttons after the choices change", async () => {
        const session = new ComponentSession({ author: { id: "author" } });
        const onPick = vi.fn();

        const previous = PickerUtil.prepareRows(session, ["old"], onPick);
        previous.activate();

        const oldId = Util.first(Util.first(previous.rows).toJSON().components).custom_id;
        const next = PickerUtil.prepareRows(session, ["new"], onPick);

        const ctx = {
            interactionContext: { session, interaction: { customId: oldId } },
            deferUpdate: vi.fn()
        };

        await PickerUtil.handleInteraction(ctx);
        expect(onPick).toHaveBeenCalledWith(ctx, "old");
        onPick.mockClear();

        next.activate();
        await expect(PickerUtil.handleInteraction(ctx)).resolves.toBe(true);
        expect(ctx.deferUpdate).toHaveBeenCalledOnce();
        expect(onPick).not.toHaveBeenCalled();
    });

    test("enforces the Discord button limit and accepts an empty list", () => {
        const session = new ComponentSession({ author: { id: "author" } });
        const onPick = vi.fn();

        expect(PickerUtil.prepareRows(session, [], onPick).rows).toEqual([]);

        const items = Array.from({ length: PickerUtil.maxOptions + 1 }, (_, i) => i);
        expect(() => PickerUtil.prepareRows(session, items, onPick)).toThrow("at most");
    });

    test("ListDetailView supports custom backLabel and defaults to Back", async () => {
        const session = new ComponentSession({ author: { id: "author" } });
        session.spec = {};

        const makeCtx = (customId, update) => ({
            isAuthor: true,
            interactionContext: { session, interaction: { customId } },
            update
        });

        const customPicker = ListDetailView.createPicker(item => ({ content: `Item ${item}` }), {
            backLabel: "Return to list"
        });
        const customBuilt = customPicker(["alpha"], session);
        customBuilt.activate();

        const customUpdate = vi.fn();
        await PickerUtil.handleInteraction(
            makeCtx(Util.first(Util.first(customBuilt.rows).toJSON().components).custom_id, customUpdate)
        );
        expect(Util.first(Util.first(customUpdate.mock.calls[0][0].components).toJSON().components).label).toBe(
            "Return to list"
        );

        const defaultPicker = ListDetailView.createPicker(item => ({ content: `Item ${item}` }));
        const defaultBuilt = defaultPicker(["beta"], session);
        defaultBuilt.activate();

        const defaultUpdate = vi.fn();
        await PickerUtil.handleInteraction(
            makeCtx(Util.first(Util.first(defaultBuilt.rows).toJSON().components).custom_id, defaultUpdate)
        );
        expect(Util.first(Util.first(defaultUpdate.mock.calls[0][0].components).toJSON().components).label).toBe(
            "Back"
        );
    });
});
