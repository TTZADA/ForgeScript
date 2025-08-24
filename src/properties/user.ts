import { User } from "discord.js"
import defineProperties from "../functions/defineProperties"

export enum UserProperty {
    id = "id",
    username = "username",
    displayName = "displayName",
    globalName = "globalName",
    badges = "badges",
    avatar = "avatar",
    accentColor = "accentColor",
    banner = "banner",
    timestamp = "timestamp",
    dmChannelID = "dmChannelID",
    avatarDecoration = "avatarDecoration",
    primaryGuildTag = "primaryGuildTag",
    primaryGuildBadge = "primaryGuildBadge",
    primaryGuildEnabled = "primaryGuildEnabled",
    primaryGuildID = "primaryGuildID",
}

export const UserProperties = defineProperties<typeof UserProperty, User>({
    id: (i) => i?.id,
    avatar: (i) => i?.displayAvatarURL(),
    badges: (i, sep) => i?.flags?.toArray().join(sep || ", "),
    displayName: (i) => i?.displayName,
    globalName: (i) => i?.globalName,
    username: (i) => i?.username,
    banner: (i) => i?.bannerURL(),
    accentColor: (i) => i?.hexAccentColor,
    timestamp: (i) => i?.createdTimestamp,
    dmChannelID: (i) => i?.dmChannel?.id,
    avatarDecoration: (i) => i?.avatarDecorationURL(),
    primaryGuildTag: (i) => i?.primaryGuild?.tag,
    primaryGuildBadge: (i) => i?.guildTagBadgeURL(),
    primaryGuildEnabled: (i) => i?.primaryGuild?.identityEnabled,
    primaryGuildID: (i) => i?.primaryGuild?.identityGuildId
})