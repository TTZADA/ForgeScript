import { ArgType, NativeFunction, Return } from "../../structures"
import { RoleColor } from "./roleColor"

export default new NativeFunction({
    name: "$roleIntColor",
    version: "1.3.0",
    description: "Returns the role color as int",
    brackets: false,
    unwrap: true,
    output: ArgType.Color,
    args: [
        {
            name: "guild ID",
            description: "The guild id to return the role from",
            rest: false,
            type: ArgType.Guild,
            required: true,
        },
        {
            name: "role ID",
            description: "The role id return its color",
            rest: false,
            type: ArgType.Role,
            pointer: 0,
            required: true,
        },
        {
            name: "color",
            description: "The role color to return",
            rest: false,
            type: ArgType.Enum,
            enum: RoleColor
        },
    ],
    execute(ctx, [, role, color]) {
        return this.success((role ?? ctx.role)?.colors[color || RoleColor.Primary])
    },
})