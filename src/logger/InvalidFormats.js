const InvalidFormats = Object.freeze({
    length: "length",
    combine: "combine"
});

const invalidFormats = new Set(Object.values(InvalidFormats));

export { InvalidFormats, invalidFormats };
