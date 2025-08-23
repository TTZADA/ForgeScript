import { ArgType, NativeFunction, Return } from "../../structures"

export default new NativeFunction({
    name: "$userGuildID",
    version: "2.5.0",
    description: "Returns the primary guild id of a user",
    unwrap: true,
    brackets: false,
    args: [
        {
            name: "user ID",
            description: "The user to get its primary guild",
            required: true,
            rest: false,
            type: ArgType.User,
        },
    ],
    output: ArgType.Guild,
    execute(ctx, [user]) {
        return this.success((user ?? ctx.user)?.primaryGuild?.identityGuildId)
    },
})