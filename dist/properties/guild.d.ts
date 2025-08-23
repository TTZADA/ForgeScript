import { Guild, GuildPreview } from "discord.js";
export declare enum GuildProperty {
    id = "id",
    ownerID = "ownerID",
    name = "name",
    description = "description",
    features = "features",
    afkChannelID = "afkChannelID",
    maximumMembers = "maximumMembers",
    systemChannelID = "systemChannelID",
    afkTimeout = "afkTimeout",
    memberCount = "memberCount",
    boostCount = "boostCount",
    timestamp = "timestamp",
    icon = "icon",
    splash = "splash",
    banner = "banner",
    roles = "roles",
    emojis = "emojis",
    stickers = "stickers",
    boostLevel = "boostLevel",
    discoverySplash = "discoverySplash",
    approximateMemberCount = "approximateMemberCount",
    approximatePresenceCount = "approximatePresenceCount"
}
export declare const GuildProperties: import("../functions/defineProperties").Properties<typeof GuildProperty, Guild>;
export declare enum GuildPreviewProperty {
    id = "id",
    name = "name",
    description = "description",
    features = "features",
    timestamp = "timestamp",
    icon = "icon",
    splash = "splash",
    emojis = "emojis",
    stickers = "stickers",
    discoverySplash = "discoverySplash",
    approximateMemberCount = "approximateMemberCount",
    approximatePresenceCount = "approximatePresenceCount"
}
export declare const GuildPreviewProperties: import("../functions/defineProperties").Properties<typeof GuildPreviewProperty, GuildPreview>;
//# sourceMappingURL=guild.d.ts.map