When writing code, make sure to respect the repo code style: reduce duplication (refactor out methods were necessary, dont force duplication of error throws), formatting (use prettier), declaration style: consts and lets are comma grouped ONLY when variables share the exact same semantic purpose / functionality (e.g. coordinates x, y; related options a, b; bounds min, max; preparing options and constructing their config object; parsing an entity and extracting its fields; extracting raw input file properties `contentType, url`; parsing attachment URL info and extracting extension `attachInfo, ext`; evaluating input payload components `body, hasAttachments`; preparing URL input and resolving its message `urlText, urlMsg`). Variables with different purposes or functionalities must NEVER be grouped together in the same declaration block (for example, grouping modifier flags like `isStatic, isPrivate` with source metadata like `line` or type classifiers like `kind` is strictly forbidden; grouping raw input properties `contentType, url` with URL parsing/extension resolution `attachInfo, ext` is strictly forbidden; grouping type flags `isFile, isScript, isBinary` with payload buffer `body` is strictly forbidden; a good split separates orthogonal concerns into distinct blocks separated by newlines, such as parsing stack `let stack = [];`, traversal counters/indices `let contentCount = 0, i = 0;`, and escape state flags `let isEscaped = false;`, whereas splitting tightly-coupled steps like `urlText` and `urlMsg = await resolveMessageFromUrl(urlText)` into separate blocks is a bad split because `urlText` exists solely to resolve `urlMsg`). Each semantic group must be its own declaration block (separate `const` or `let` statement) with an empty line separating different declaration blocks. Look at code on a case-by-case basis: evaluate what variables actually do and their shared objective; never lump variables with fundamentally different roles or concerns into the same declaration block. Prefer consts over lets. A small single-line nested ternary (e.g. `const typeLabel = isBinary ? "Binary tag" : isScript ? "Script" : Util.capitalize(name);`) is fine, and nested ternaries are also allowed when encapsulated in their own dedicated helper function (e.g. `return isBinary ? this.maxTagSize.binary : isScript ? this.maxTagSize.script : this.maxTagSize.text;`); when a nested ternary gets split across multiple lines in the middle of a random function though, that is an issue and strictly prohibited — extract it into its own helper function or use if/else if/else or switch statements instead (when handling mutually exclusive branches, even with returns, use `if / else if / else` rather than sequential independent if statements).
ordering:
classes also have an order:
there are 2 main sections: public and private.
public ALWAYS comes above private.
in each section, static members come first, then instance members.
(Exceptions: in Fake\* classes, statics come after the constructor; in util classes, privates are allowed to be grouped with public methods or variables)
So the top-down section hierarchy is:

1. Public section:
   a. static (properties and methods; dataProps comes after defaultValues)
   b. instance (constructor, getters/setters, methods)
   (In Fake\* classes, statics come after the constructor; in util classes, privates are allowed to be grouped with public methods or variables)
2. Private section:
   a. static (properties and methods)
   b. instance (getters/setters, methods)

Order functions by logical flow first, C-style ordering second:
Methods are ordered in the canonical order of their logical flow / the order they execute and are used (e.g. connect executes first, then the handle methods called by or following it).
When logical steps intertwine or when a function uses localized helper subroutines (\_c uses \_a and \_b), apply C-style ordering to those helpers: \_a and \_b come immediately nearby above \_c.
and spacing: put newlines between logical blocks. Import odering is as follows:
node: prefixed node native libraries
newline
other external libraries
newline
the class/classes we depend on/inherit/compose with or are part of the core functionality, you may block this more if there are other logical orderings
newline
struct classes
newline
enum classes
newline
client imports
newline
util imports (NORMAL UTIL.JS ALWAYS COMES FIRST HERE)
newline
error imports
Avoid writing sloppy fragile logic when simpler logic makes more sense. Finally, if you're unsure of how to write something, look at files in the codebase and write it in the existing style. We do not ever cache objects unnecessarily. Make the code clean, streamlined and put empty lines between logical blocks in functions. no obfuscation. dont try to make the code obfuscated. Hard coding is prohibited, try to work things into a proper architecture. make it easy to read and clean.

Write abstract code but not overly abstract. Avoid writing very long and explicit variable names. Look at the style of variable names in the repo: short and descriptive. A prime example: Do not write "index" instead of "i" or stuff like that. Write "i" in loops and idx anywhere else. You can pick up on more of these examples by looking in the codebase.
Do not stick files together in inappropiate places. Look at the structure of the repo and put files in their proper places.
In command files, subcommands and leaf commands should not declare ad-hoc helper methods on their command classes. Parent commands (like TagCommand or EvalCommand) encapsulate shared functionality (such as formatError, formatReply, parseBase) as instance methods on the parent class so subcommands can reuse them via this.parentCmd instead of duplicating logic or writing parallel helper functions. In Discord commands, `isDiscord` should never be checked; it must always be assumed to be true. Reusable logic or repeated calculations must be extracted into dedicated private helper methods rather than being inlined into random functions. Embeds must not have titles (`.setTitle(...)`). In this repo, message text content (`content`) serves as the title/header, so embed titles are redundant and pointless (look at leaderboard and perm for examples of embeds created with only descriptions/fields and no titles).
Do not write dead methods or variables that just alias short expressions. This is VERY important: do not try to keep compatibility or legacy code for any reason. We do not write legacy in this repo. When you need to change something in the API, change it as much as you need. Do not feel any restraint in breaking the api and refactoring callers. In fact, this is very encouraged. You should not keep old functions, variables or parameters if they become dead code or simple aliases. They should be instantly removed or refactored out if that happens. Again I repeat: do not maintain compatibility with the old API or write legacy code.
Enum classes should be frozen with object.freeze but do not freeze stuff past the first level. Object options should be guarded with options = ObjectUtil.guaranteeObject(options); We do not use generic error in this repo. Look at the existing error class usage for example UtilError in utils so on or make a new one if needed. Use switches when dealing with enums for maintainability instead of scattered ifs. When you want a functionality, check src/util for it first before going for a reimplementation (typetester, objectutil, arrayutil, discordutil, util.empty util.nonemptystring etc instead of raw checks, many other util methods instead of manual rewrites).
We dont raw dog options into checks or usages if we have resonable defaults. we always alias if we have a default (const variable, comma separated) and use ?? for the default. This pattern is in hundreds of places in the code. Dont use != or == null checks when we know that the thing is either null or undefined specifically, and can use a strict check for one of them, only use it for general checks that include both. Dont check === undefined use typeof. Lose == null checks arent BANNED theyre just not to be overused when we have a stricter check that expresses the same condition in that case. When we can check typeof === "undefined" or === null and have the same end result as a == null check, prefer the stricter check. Same thing for === null || === undefined checks, use == null there or its != variant. === "" or !== "" checks are illegal, we use util.empty. length === 0 or !== 0 > 0 < 1 etc checks are illegal, we use util.empty. When writing the code, look at code that is a possible candidate to use instead of [0] we use util.first:
we only access [0], no [1] or [2] access nearby
its a single [0] access not 2 in a row
its in places where we clearly only mean the first element. we follow this rule

Write tests for everything to cover as many edge cases as possible. Mock as little as possible, most of the logic should go through the full code path. Only do full test runs in extreme cases, because they take hours, otherwise only do localized test runs to test your work.
When altering config options, make sure to also update the schema.
Hard coding and ad hoc patches are strictly prohibited. We try to maintain a purposeful architecture, we don't just slap code where its convenient. We don't duplicate code. We don't slap stateless functions that really carry state. We try to design a purposeful, logical architecture. This is not a dumping ground, you need to respect the code and write any patches properly.
You are banned from using any git commands that might desturctively affect staged or unstaged changes.
The code should be heavily OOP using many classes for compartmentalization and code cleanliness. Never ever ever mix domain specific logic with abstract, general logic. Avoid reimplemeting large areas of code for a specific implementation. Always prefer layering domain specific logic on top of generalized abstract logic, instead of having many disperate domain specific implementations of the same logic or helpers.
No multiple classes in the same file unless they're truly tiny throwaway classes. Stop ad hoc fixes. if you do something, do it all the way. rewrite and rearchitect. ad hoc fixes will get you in real trouble now. I will reject all ad hoc fixes instantly, so better to just not write them.

VERY IMPORTANT INSTRUCTIONS:
Don't test after every little change. Only test after a major change set. Understood?
