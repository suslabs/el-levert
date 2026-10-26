import typeSchema from "./typeSchema.js";
import readerSchema from "./readerSchema.js";
import validSchema from "./validSchema.js";

import CommandReaderKinds from "../reader/CommandReaderKinds.js";

const jsonSchema = {
    $id: "command-argument-schema",
    oneOf: [
        {
            type: "object",
            required: ["name", "from", "type", "kind", "properties"],
            additionalProperties: false,
            properties: {
                name: {
                    type: "string"
                },
                from: {
                    type: "string"
                },
                type: typeSchema,
                kind: {
                    type: "string",
                    const: CommandReaderKinds.group
                },
                properties: {
                    type: "object",
                    additionalProperties: {
                        $ref: "command-argument-schema"
                    }
                },
                valid: validSchema,
                defaultValue: true
            }
        },
        {
            type: "object",
            required: ["name", "from", "type"],
            additionalProperties: false,
            properties: {
                name: {
                    type: "string"
                },
                from: {
                    type: "string"
                },
                type: typeSchema,
                reader: readerSchema,
                valid: validSchema,
                defaultValue: true,
                items: {
                    $ref: "command-argument-schema"
                }
            }
        }
    ]
};

export default jsonSchema;
