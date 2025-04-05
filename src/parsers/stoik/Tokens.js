const TokenType = Object.freeze({
    GroupLeft: "GroupLeft",
    GroupRight: "GroupRight",
    Number: "Number",
    Add: "Add",
    Subtract: "Subtract",
    Element: "Element",
    Coefficient: "Coefficient",
    Subscript: "Subscript",
    Join: "Join"
});

const TokenNames = Object.freeze({
    [TokenType.GroupLeft]: "left parenthesis",
    [TokenType.GroupRight]: "right parenthesis",
    [TokenType.Number]: "number",
    [TokenType.Add]: "plus",
    [TokenType.Subtract]: "minus",
    [TokenType.Element]: "element",
    [TokenType.Coefficient]: "coefficient",
    [TokenType.Subscript]: "subscript",
    [TokenType.Join]: "join"
});

const TokenOps = Object.freeze({
    [TokenType.GroupLeft]: "(",
    [TokenType.GroupRight]: ")",
    [TokenType.Number]: "number",
    [TokenType.Add]: "+",
    [TokenType.Subtract]: "-",
    [TokenType.Element]: "element",
    [TokenType.Coefficient]: "^",
    [TokenType.Subscript]: "_",
    [TokenType.Join]: "j"
});

const Precedence = Object.freeze({
    [TokenType.Subscript]: 3,
    [TokenType.Add]: 2,
    [TokenType.Coefficient]: 1,
    [TokenType.Join]: 0,
    [TokenType.Subtract]: 0
});

export { TokenType, TokenNames, TokenOps, Precedence };
