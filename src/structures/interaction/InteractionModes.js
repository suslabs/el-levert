import createEnum from "../../util/createEnum.js";

const InteractionModes = createEnum({
    ephemeralOthers: "ephemeral_others",
    authorOnly: "author_only",
    anyone: "anyone"
});

export default InteractionModes;
