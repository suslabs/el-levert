import createEnum from "../../util/createEnum.js";

const AISourceTypes = createEnum({
    recipes: "recipes",
    wiki: "wiki",
    docs: "docs"
});

export default AISourceTypes;
