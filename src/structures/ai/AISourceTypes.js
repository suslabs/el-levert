import createEnum from "../../util/createEnum.js";

const AISourceTypes = createEnum({
    recipes: "recipes",
    questbook: "questbook",
    wiki: "wiki"
});

export default AISourceTypes;
