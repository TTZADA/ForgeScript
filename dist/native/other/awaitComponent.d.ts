import { BaseChannel } from "discord.js";
import { ArgType, NativeFunction } from "../../structures";
declare const _default: NativeFunction<[{
    name: string;
    description: string;
    rest: false;
    required: true;
    type: ArgType.Channel;
    check: (i: BaseChannel) => i is import("discord.js").DMChannel | import("discord.js").PartialGroupDMChannel | import("discord.js").NewsChannel | import("discord.js").StageChannel | import("discord.js").TextChannel | import("discord.js").PublicThreadChannel<boolean> | import("discord.js").PrivateThreadChannel | import("discord.js").VoiceChannel;
}, {
    name: string;
    rest: false;
    required: true;
    type: ArgType.Message;
    pointer: number;
    description: string;
}, {
    name: string;
    description: string;
    rest: false;
    required: true;
    condition: true;
    type: ArgType.String;
}, {
    name: string;
    description: string;
    rest: false;
    required: true;
    type: ArgType.String;
}, {
    name: string;
    rest: false;
    required: true;
    type: ArgType.Time;
    description: string;
}], false>;
export default _default;
//# sourceMappingURL=awaitComponent.d.ts.map