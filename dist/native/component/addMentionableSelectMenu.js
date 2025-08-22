"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const structures_1 = require("../../structures");
exports.default = new structures_1.NativeFunction({
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
            type: structures_1.ArgType.String
        },
        {
            name: "placeholder",
            description: "The placeholder to use for the menu",
            rest: false,
            type: structures_1.ArgType.String,
        },
        {
            name: "min values",
            description: "The min values to choose for the menu",
            rest: false,
            type: structures_1.ArgType.Number,
        },
        {
            name: "max values",
            description: "The max values to choose for the menu",
            rest: false,
            type: structures_1.ArgType.Number,
        },
        {
            name: "disabled",
            description: "Whether the menu is disabled by default",
            rest: false,
            required: false,
            type: structures_1.ArgType.Boolean
        },
        {
            name: "default roles/users",
            rest: true,
            type: structures_1.ArgType.RoleOrUser,
            description: "The default selected roles or users to use",
        }
    ],
    execute(ctx, [id, placeholder, min, max, disabled, defaults]) {
        const menu = new discord_js_1.MentionableSelectMenuBuilder()
            .setDisabled(disabled || false)
            .setCustomId(id)
            .setDefaultValues(defaults.map(x => {
            return {
                id: x.id,
                type: x instanceof discord_js_1.User ? discord_js_1.SelectMenuDefaultValueType.User : discord_js_1.SelectMenuDefaultValueType.Role
            };
        }));
        if (placeholder)
            menu.setPlaceholder(placeholder);
        if (min)
            menu.setMinValues(min);
        if (max)
            menu.setMaxValues(max);
        ctx.container.actionRow?.addComponents(menu);
        return this.success();
    }
});
//# sourceMappingURL=addMentionableSelectMenu.js.map