import { ActionRowBuilder } from "discord.js"
import { ArgType, NativeFunction, Return } from "../../structures"

export default new NativeFunction({
    name: "$disableComponents",
    version: "2.2.0",
    description: "Disables all components on the current message",
    aliases: ["$disableAllComponents"],
    unwrap: false,
    execute(ctx) {
        const components = ctx.container.components
        ctx.container.actionRow?.components.forEach((x) => x.setDisabled(true))

        for (let comp of components) {
            if (!(comp instanceof ActionRowBuilder)) continue
            const actionRow = new ActionRowBuilder()
            comp?.components.forEach((x) => actionRow.addComponents(x.setDisabled(true)))
        }

        return this.success()
    },
})