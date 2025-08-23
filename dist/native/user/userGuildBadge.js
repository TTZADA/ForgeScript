"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const structures_1 = require("../../structures");
exports.default = new structures_1.NativeFunction({
    name: "$userGuildBadge",
    description: "Returns the primary guild tag badge of a user",
    unwrap: true,
    brackets: false,
    args: [
        {
            name: "user ID",
            description: "The user to get its primary guild",
            required: true,
            rest: false,
            type: structures_1.ArgType.User,
        },
        {
            name: "size",
            description: "The size to use for the image",
            rest: false,
            type: structures_1.ArgType.Number,
        },
        {
            name: "extension",
            description: "The extension to use for the image",
            rest: false,
            type: structures_1.ArgType.String,
        },
    ],
    output: structures_1.ArgType.URL,
    execute(ctx, [user, size, ext]) {
        return this.success((user ?? ctx.user)?.guildTagBadgeURL({
            extension: ext || undefined,
            size: size || undefined,
        }));
    },
});
//# sourceMappingURL=userGuildBadge.js.map