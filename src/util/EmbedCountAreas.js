import createEnum from "./createEnum.js";

const EmbedCountAreas = createEnum(
    {
        body: "body",
        content: "content",
        details: "details",
        fields: "fields",
        all: "all"
    },
    obj => new Set(obj.values.filter(area => area !== obj.all))
);

export default EmbedCountAreas;
