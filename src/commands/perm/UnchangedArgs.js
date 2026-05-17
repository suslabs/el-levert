const UnchangedArgs = Object.freeze({
    empty: "",
    unchanged: "unchanged"
});

const validUnchangedArgs = new Set(Object.values(UnchangedArgs));

export { UnchangedArgs, validUnchangedArgs };
