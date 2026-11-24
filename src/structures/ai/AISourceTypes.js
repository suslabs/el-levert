import createEnum from "../../util/createEnum.js";

const AISourceTypes = createEnum({
    recipes: "recipes",
    wiki: "wiki",
    scriptDocs: "scriptDocs",
    gameDocs: "gameDocs"
});

export default AISourceTypes;
