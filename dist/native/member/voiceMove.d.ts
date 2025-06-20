import { BaseChannel } from "discord.js";
import { ArgType, NativeFunction } from "../../structures";
declare const _default: NativeFunction<[{
    name: string;
    description: string;
    rest: false;
    required: true;
    type: ArgType.Guild;
}, {
    name: string;
    rest: false;
    required: true;
    type: ArgType.Member;
    pointer: number;
    description: string;
}, {
    name: string;
    description: string;
    rest: false;
    required: false;
    type: ArgType.Channel;
    check: (i: BaseChannel) => i is import("discord.js").VoiceBasedChannel;
}, {
    name: string;
    description: string;
    rest: false;
    type: ArgType.String;
}], true>;
export default _default;
//# sourceMappingURL=voiceMove.d.ts.map