import { BaseChannel } from "discord.js";
import { ArgType, NativeFunction } from "../../structures";
declare const _default: NativeFunction<[{
    name: string;
    description: string;
    rest: false;
    required: true;
    type: ArgType.Channel;
    check: (i: BaseChannel) => i is import("discord.js").AnyThreadChannel;
}, {
    name: string;
    description: string;
    rest: false;
    type: ArgType.String;
}], true>;
export default _default;
//# sourceMappingURL=unlockThread.d.ts.map