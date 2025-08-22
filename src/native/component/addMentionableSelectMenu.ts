import { MentionableSelectMenuBuilder, SelectMenuDefaultValueType, User } from "discord.js"
import { ArgType, NativeFunction } from "../../structures"

export default new NativeFunction({
    name: "$addMentionableSelectMenu",
    version: "1.4.0",
    description: "Creates a mentionable select menu",
    brackets: true,
    unwrap: true,
    args: [
        {
            name: "custom ID",
            description: "The custom id for this menu",
            rest: false,
            required: true,
            type: ArgType.String
        },
        {
            name: "placeholder",
            description: "The placeholder to use for the menu",
            rest: false,
            type: ArgType.String,
        },
        {
            name: "min values",
            description: "The min values to choose for the menu",
            rest: false,
            type: ArgType.Number,
        },
        {
            name: "max values",
            description: "The max values to choose for the menu",
            rest: false,
            type: ArgType.Number,
        },
        {
            name: "disabled",
            description: "Whether the menu is disabled by default",
            rest: false,
            required: false,
            type: ArgType.Boolean
        },
        {
            name: "default roles/users",
            rest: true,
            type: ArgType.RoleOrUser,
            description: "The default selected roles or users to use",
        }
    ],
    execute(ctx, [ id, placeholder, min, max, disabled, defaults ]) {
        const menu = new MentionableSelectMenuBuilder()
            .setDisabled(disabled || false)
            .setCustomId(id)
            .setDefaultValues(defaults.map(x => {
                return {
                    id: x.id,
                    type: x instanceof User ? SelectMenuDefaultValueType.User : SelectMenuDefaultValueType.Role
                }
            }))

        if (placeholder) menu.setPlaceholder(placeholder)
        if (min) menu.setMinValues(min)
        if (max) menu.setMaxValues(max)

        ctx.container.actionRow?.addComponents(menu)
        return this.success()
    }
})