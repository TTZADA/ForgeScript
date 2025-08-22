"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const structures_1 = require("../../structures");
const enum_1 = require("../../functions/enum");
exports.default = new structures_1.NativeFunction({
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
            type: structures_1.ArgType.String,
            required: true,
        },
        {
            name: "new custom ID",
            description: "The new custom id for this component",
            rest: false,
            type: structures_1.ArgType.String,
            required: true,
        },
        {
            name: "label",
            description: "The button label",
            rest: false,
            type: structures_1.ArgType.String,
            required: true,
        },
        {
            name: "style",
            description: "The style for this button",
            enum: discord_js_1.ButtonStyle,
            type: structures_1.ArgType.Enum,
            required: true,
            rest: false,
        },
        {
            name: "emoji",
            rest: false,
            type: structures_1.ArgType.String,
            description: "The emoji for this button",
        },
        {
            name: "disabled",
            rest: false,
            type: structures_1.ArgType.Boolean,
            description: "Whether to disable the button",
        },
    ],
    execute(ctx, [oldId, id, label, style, emoji, disabled]) {
        const rowIndex = ctx.container.components.findIndex((x) => (x instanceof discord_js_1.ActionRowBuilder || x instanceof discord_js_1.ContainerBuilder)
            ? x.components.some((x) => "custom_id" in x.data && x.data.custom_id === oldId)
            : false);
        if (rowIndex === -1)
            return this.success();
        // @ts-ignore
        const btn = ctx.container.components[rowIndex].components.find(
        // @ts-ignore
        (x) => "custom_id" in x.data && x.data.custom_id === oldId);
        if (!btn)
            return this.success();
        style = (0, enum_1.resolveNumericEnum)(discord_js_1.ButtonStyle, style);
        // @ts-ignore
        btn.setLabel(label || btn.data.label)
            .setStyle(style);
        if (emoji)
            btn.setEmoji(emoji);
        if (typeof disabled === "boolean")
            btn.setDisabled(disabled);
        if (style === discord_js_1.ButtonStyle.Link)
            btn.setURL(id);
        else if (style === discord_js_1.ButtonStyle.Premium)
            btn.setSKUId(id);
        else
            btn.setCustomId(id);
        return this.success();
    },
});
//# sourceMappingURL=editButton.js.map