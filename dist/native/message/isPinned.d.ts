import { BaseChannel } from "discord.js";
import { ArgType, NativeFunction } from "../../structures";
declare const _default: NativeFunction<[{
    name: string;
    rest: false;
    required: true;
    description: string;
    type: ArgType.Channel;
    check: (i: BaseChannel) => i is import("discord.js").DMChannel | import("discord.js").PartialGroupDMChannel | import("discord.js").NewsChannel | import("discord.js").StageChannel | import("discord.js").TextChannel | import("discord.js").PublicThreadChannel<boolean> | import("discord.js").PrivateThreadChannel | import("discord.js").VoiceChannel;
}, {
    name: string;
    pointer: number;
    description: string;
    rest: false;
    required: true;
    type: ArgType.Message;
}], true>;
export default _default;
//# sourceMappingURL=isPinned.d.ts.map