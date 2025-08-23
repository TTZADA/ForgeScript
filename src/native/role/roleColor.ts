import { int2hex } from "../../functions/hex"
import { ArgType, NativeFunction, Return } from "../../structures"

export enum RoleColor {
    Primary = "primaryColor",
    Secondary = "secondaryColor",
    Tertiary = "tertiaryColor"
}

export default new NativeFunction({
    name: "$roleColor",
    version: "1.0.0",
    description: "Returns the color of a role",
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
        color ??= RoleColor.Primary
        const int = (role ?? ctx.role)?.colors[color]
        return this.success(int ? "#" + int2hex(int) : null)
    },
})