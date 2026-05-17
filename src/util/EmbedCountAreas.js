const EmbedCountAreas = Object.freeze({
    body: "body",
    content: "content",
    details: "details",
    fields: "fields",
    all: "all"
});

const validEmbedCountAreas = new Set(Object.values(EmbedCountAreas).filter(area => area !== EmbedCountAreas.all));

export { EmbedCountAreas, validEmbedCountAreas };
