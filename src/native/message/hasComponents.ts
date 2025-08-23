import { BaseChannel } from "discord.js"
import { ArgType, NativeFunction, Return } from "../../structures"

export default new NativeFunction({
    name: "$hasComponents",
    version: "2.5.0",
    description: "Checks whether given message has components",
    brackets: false,
    unwrap: true,
    args: [
        {
            name: "channel ID",
            description: "The channel to get message from",
            type: ArgType.Channel,
            rest: false,
            required: true,
            check: (i: BaseChannel) => "messages" in i
        },
        {
            name: "message ID",
            pointer: 0,
            rest: false,
            required: true,
            type: ArgType.Message,
            description: "The message to check for components"
        }
    ],
    output: ArgType.Boolean,
    execute(ctx, [, msg]) {
        return this.success(!!(msg ?? ctx.message)?.components.length)
    },
})