import createEnum from "../../util/createEnum.js";

const RevisionOperationTypes = createEnum({
    import: "import",
    create: "create",
    update: "update",
    delete: "delete",
    revert: "revert"
});

export default RevisionOperationTypes;
