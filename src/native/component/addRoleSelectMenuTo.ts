import { ActionRowBuilder, RoleSelectMenuBuilder } from "discord.js"
import { ArgType, NativeFunction } from "../../structures"

export default new NativeFunction({
    name: "$addRoleSelectMenuTo",
    version: "1.5.0",
    description: "Creates a role select menu on a message",
    output: ArgType.Boolean,
    brackets: true,
    unwrap: true,
    args: [
        {
            name: "channel ID",
            description: "The channel id to pull message from",
            rest: false,
            required: true,
            type: ArgType.TextChannel
        },
        {
            name: "message ID",
            description: "The message to add select menu to",
            rest: false,
            required: true,
            type: ArgType.Message,
            pointer: 0
        },
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
            name: "default roles",
            rest: true,
            type: ArgType.String,
            description: "The default selected roles to use",
        }
    ],
    async execute(ctx, [ , m, id, placeholder, min, max, disabled, roles ]) {
        const menu = new RoleSelectMenuBuilder()
            .setDefaultRoles(roles)
            .setDisabled(disabled ?? false)
            .setCustomId(id)
            
        if (placeholder)
            menu.setPlaceholder(placeholder)
        if (min)
            menu.setMinValues(min)
        if (max)
            menu.setMaxValues(max)

        const components = m.components.map(x => ActionRowBuilder.from(x))
        components.at(-1)?.addComponents(menu)

        return this.success(
            !!(await m.edit({ components: components as ActionRowBuilder<RoleSelectMenuBuilder>[] }).catch(ctx.noop))
        )
    }
})