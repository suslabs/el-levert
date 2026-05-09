import TextCommand from "./TextCommand.js";

import CLICommandContext from "./context/CLICommandContext.js";
import CLICommandInfo from "./info/CLICommandInfo.js";

class CLICommand extends TextCommand {
    static infoClass = CLICommandInfo;
    static contextClass = CLICommandContext;
}

export default CLICommand;
