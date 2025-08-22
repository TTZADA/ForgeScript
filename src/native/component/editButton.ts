import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder } from "discord.js"
import { ArgType, NativeFunction, Return } from "../../structures"
import { resolveNumericEnum } from "../../functions/enum"

export default new NativeFunction({
    name: "$editButton",
    version: "1.0.7",
    description: "Edits a button component",
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "custom ID",
            description: "The custom id to find the component",
            rest: false,
            type: ArgType.String,
            required: true,
        },
        {
            name: "new custom ID",
            description: "The new custom id for this component",
            rest: false,
            type: ArgType.String,
            required: true,
        },
        {
            name: "label",
            description: "The button label",
            rest: false,
            type: ArgType.String,
            required: true,
        },
        {
            name: "style",
            description: "The style for this button",
            enum: ButtonStyle,
            type: ArgType.Enum,
            required: true,
            rest: false,
        },
        {
            name: "emoji",
            rest: false,
            type: ArgType.String,
            description: "The emoji for this button",
        },
        {
            name: "disabled",
            rest: false,
            type: ArgType.Boolean,
            description: "Whether to disable the button",
        },
    ],
    execute(ctx, [oldId, id, label, style, emoji, disabled]) {
        const rowIndex = ctx.container.components.findIndex((x) =>
            (x instanceof ActionRowBuilder || x instanceof ContainerBuilder)
                ? x.components.some((x) => "custom_id" in x.data && x.data.custom_id === oldId)
                : false
        )
        if (rowIndex === -1) return this.success()

        // @ts-ignore
        const btn = ctx.container.components[rowIndex].components.find(
            // @ts-ignore
            (x) => "custom_id" in x.data && x.data.custom_id === oldId
        ) as ButtonBuilder

        if (!btn) return this.success()
        style = resolveNumericEnum(ButtonStyle, style)

        // @ts-ignore
        btn.setLabel(label || btn.data.label)
            .setStyle(style)

            if (emoji) btn.setEmoji(emoji)
            if (typeof disabled === "boolean") btn.setDisabled(disabled)

            if (style === ButtonStyle.Link) btn.setURL(id)
            else if (style === ButtonStyle.Premium) btn.setSKUId(id)
            else btn.setCustomId(id)

        return this.success()
    },
})