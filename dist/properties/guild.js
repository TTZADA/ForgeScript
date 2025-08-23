"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuildPreviewProperties = exports.GuildPreviewProperty = exports.GuildProperties = exports.GuildProperty = void 0;
const defineProperties_1 = __importDefault(require("../functions/defineProperties"));
var GuildProperty;
(function (GuildProperty) {
    GuildProperty["id"] = "id";
    GuildProperty["ownerID"] = "ownerID";
    GuildProperty["name"] = "name";
    GuildProperty["description"] = "description";
    GuildProperty["features"] = "features";
    GuildProperty["afkChannelID"] = "afkChannelID";
    GuildProperty["maximumMembers"] = "maximumMembers";
    GuildProperty["systemChannelID"] = "systemChannelID";
    GuildProperty["afkTimeout"] = "afkTimeout";
    GuildProperty["memberCount"] = "memberCount";
    GuildProperty["boostCount"] = "boostCount";
    GuildProperty["timestamp"] = "timestamp";
    GuildProperty["icon"] = "icon";
    GuildProperty["splash"] = "splash";
    GuildProperty["banner"] = "banner";
    GuildProperty["roles"] = "roles";
    GuildProperty["emojis"] = "emojis";
    GuildProperty["stickers"] = "stickers";
    GuildProperty["boostLevel"] = "boostLevel";
    GuildProperty["discoverySplash"] = "discoverySplash";
    GuildProperty["approximateMemberCount"] = "approximateMemberCount";
    GuildProperty["approximatePresenceCount"] = "approximatePresenceCount";
})(GuildProperty || (exports.GuildProperty = GuildProperty = {}));
exports.GuildProperties = (0, defineProperties_1.default)({
    description: (i) => i?.description,
    features: (i, sep) => i?.features.join(sep || ", "),
    id: (i) => i?.id,
    name: (i) => i?.name,
    banner: (i) => i?.bannerURL(),
    icon: (i) => i?.iconURL(),
    splash: (i) => i?.splashURL(),
    emojis: (i, sep) => i?.emojis.cache.map((x) => x.id).join(sep || ", "),
    roles: (i, sep) => i?.roles.cache.map((x) => x.id).join(sep || ", "),
    stickers: (i, sep) => i?.stickers.cache.map((x) => x.id).join(sep || ", "),
    ownerID: (i) => i?.ownerId,
    afkChannelID: (i) => i?.afkChannelId,
    systemChannelID: (i) => i?.systemChannelId,
    timestamp: (i) => i?.createdTimestamp,
    boostCount: (i) => i?.premiumSubscriptionCount,
    boostLevel: (i) => i?.premiumTier,
    afkTimeout: (i) => i?.afkTimeout,
    approximateMemberCount: (i) => i?.approximateMemberCount,
    memberCount: (i) => i?.memberCount,
    maximumMembers: (i) => i?.maximumMembers,
    approximatePresenceCount: (i) => i?.approximatePresenceCount,
    discoverySplash: (i) => i?.discoverySplashURL(),
});
var GuildPreviewProperty;
(function (GuildPreviewProperty) {
    GuildPreviewProperty["id"] = "id";
    GuildPreviewProperty["name"] = "name";
    GuildPreviewProperty["description"] = "description";
    GuildPreviewProperty["features"] = "features";
    GuildPreviewProperty["timestamp"] = "timestamp";
    GuildPreviewProperty["icon"] = "icon";
    GuildPreviewProperty["splash"] = "splash";
    GuildPreviewProperty["emojis"] = "emojis";
    GuildPreviewProperty["stickers"] = "stickers";
    GuildPreviewProperty["discoverySplash"] = "discoverySplash";
    GuildPreviewProperty["approximateMemberCount"] = "approximateMemberCount";
    GuildPreviewProperty["approximatePresenceCount"] = "approximatePresenceCount";
})(GuildPreviewProperty || (exports.GuildPreviewProperty = GuildPreviewProperty = {}));
exports.GuildPreviewProperties = (0, defineProperties_1.default)({
    description: (i) => i?.description,
    features: (i, sep) => i?.features.join(sep || ", "),
    id: (i) => i?.id,
    name: (i) => i?.name,
    icon: (i) => i?.iconURL(),
    splash: (i) => i?.splashURL(),
    emojis: (i, sep) => i?.emojis.map((x) => x.id).join(sep || ", "),
    stickers: (i, sep) => i?.stickers.map((x) => x.id).join(sep || ", "),
    timestamp: (i) => i?.createdTimestamp,
    approximateMemberCount: (i) => i?.approximateMemberCount,
    approximatePresenceCount: (i) => i?.approximatePresenceCount,
    discoverySplash: (i) => i?.discoverySplashURL(),
});
//# sourceMappingURL=guild.js.map