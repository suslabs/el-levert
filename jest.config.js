const config = {
    testEnvironment: "node",
    verbose: true,
    transform: {},
    roots: ["./test"],
    testPathIgnorePatterns: ["/node_modules/"],
    moduleFileExtensions: ["js", "json", "node"],
    reporters: ["default"]
};

export default config;
