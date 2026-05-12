const PoolEvents = Object.freeze({
    acquire: "acquire",
    release: "release",
    destroy: "destroy",
    drain: "drain",
    clear: "clear",
    factoryCreateError: "factoryCreateError",
    factoryDestroyError: "factoryDestroyError",
    promiseError: "promiseError"
});

export default PoolEvents;
