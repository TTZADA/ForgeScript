import { BaseChannel } from "discord.js";
import { ArgType, NativeFunction } from "../../structures";
declare const _default: NativeFunction<[{
    name: string;
    description: string;
    type: ArgType.Channel;
    rest: false;
    required: true;
    check: (i: BaseChannel) => i is BaseChannel & Record<"permissionOverwrites", unknown>;
}, {
    name: string;
    description: string;
    type: ArgType.Channel;
    rest: false;
    required: true;
    check: (i: BaseChannel) => i is BaseChannel & Record<"permissionOverwrites", unknown>;
}], true>;
export default _default;
//# sourceMappingURL=cloneChannelPerms.d.ts.map