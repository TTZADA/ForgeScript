import { BaseChannel } from "discord.js";
import { ArgType, NativeFunction } from "../../structures";
declare const _default: NativeFunction<[{
    name: string;
    description: string;
    required: true;
    rest: false;
    type: ArgType.Channel;
    check: (x: BaseChannel) => x is BaseChannel & Record<"messages", unknown>;
}, {
    name: string;
    description: string;
    required: true;
    rest: false;
    type: ArgType.User;
}, {
    name: string;
    description: string;
    rest: false;
    required: true;
    type: ArgType.Number;
}, {
    name: string;
    description: string;
    rest: false;
    type: ArgType.Boolean;
}], true>;
export default _default;
//# sourceMappingURL=clearUserMessages.d.ts.map