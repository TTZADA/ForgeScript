import { BaseChannel } from "discord.js";
import { ArgType, NativeFunction } from "../../structures";
declare const _default: NativeFunction<[{
    name: string;
    description: string;
    rest: false;
    required: true;
    type: ArgType.Channel;
    check: (i: BaseChannel) => i is BaseChannel & Record<"messages", unknown>;
}], true>;
export default _default;
//# sourceMappingURL=firstMessageID.d.ts.map