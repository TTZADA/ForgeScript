"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const structures_1 = require("../../structures");
const roleColor_1 = require("./roleColor");
exports.default = new structures_1.NativeFunction({
    name: "$roleIntColor",
    version: "1.3.0",
    description: "Returns the role color as int",
    brackets: false,
    unwrap: true,
    output: structures_1.ArgType.Color,
    args: [
        {
            name: "guild ID",
            description: "The guild id to return the role from",
            rest: false,
            type: structures_1.ArgType.Guild,
            required: true,
        },
        {
            name: "role ID",
            description: "The role id return its color",
            rest: false,
            type: structures_1.ArgType.Role,
            pointer: 0,
            required: true,
        },
        {
            name: "color",
            description: "The role color to return",
            rest: false,
            type: structures_1.ArgType.Enum,
            enum: roleColor_1.RoleColor
        },
    ],
    execute(ctx, [, role, color]) {
        color ??= roleColor_1.RoleColor.Primary;
        return this.success((role ?? ctx.role)?.colors[color]);
    },
});
//# sourceMappingURL=roleIntColor.js.map