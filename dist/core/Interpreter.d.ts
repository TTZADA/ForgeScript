import { Message, VoiceState, Presence, Role, GuildMember, GuildEmoji, User, GuildAuditLogsEntry, Channel, Guild, StageInstance, Invite, PartialMessage, Sticker, GuildBan, GuildScheduledEvent, Entitlement, PollAnswer, AutoModerationRule, VoiceChannelEffect } from "discord.js";
import { IExtendedCompilationResult } from ".";
import { Sendable, BaseCommand, Context, Container } from "../structures";
import { ForgeClient } from "./ForgeClient";

export interface IStates {
    message: Message;
    voiceState: VoiceState;
    voiceEffect: VoiceChannelEffect;
    presence: Presence;
    role: Role;
    member: GuildMember;
    emoji: GuildEmoji;
    user: User;
    audit: GuildAuditLogsEntry;
    channel: Channel;
    guild: Guild;
    poll: PollAnswer;
    entitlement: Entitlement;
    ban: GuildBan;
    scheduledEvent: GuildScheduledEvent;
    bulk: Array<Message | PartialMessage>;
    stage: StageInstance;
    invite: Invite;
    sticker: Sticker;
    automodRule: AutoModerationRule;
}

export type States = {
    [K in keyof IStates]?: {
        old?: IStates[K] | null;
        new?: IStates[K] | null;
    };
};

export interface IRunnable {
    /**
     * The available discord client
     */
    client: ForgeClient;
    /**
     * The compiled data to execute
     */
    data: IExtendedCompilationResult;
    allowTopLevelReturn?: boolean;
    /**
     * The context this code will run in
     */
    obj: Sendable;
    /**
     * The command used for this execution
     */
    command: BaseCommand<unknown> | null;
    /**
     * Whether to suppress sending the response to discord.
     */
    doNotSend?: boolean;
    /**
     * Removes errors output to console
     */
    disableConsoleErrors?: boolean;
    /**
     * Extras data
     */
    extras?: unknown;
    /**
     * Whether to suppress errors from being sent to discord, and be sent to console instead
     */
    redirectErrorsToConsole?: boolean;
    /**
     * The old and new states of an event
     */
    states?: States;
    /**
     * The already existing variables defined with $let
     */
    keywords?: Record<string, string>;
    /**
     * The already existing env variables
     */
    environment?: Record<string, unknown>;
    /**
     * The args used in the message command
     */
    args?: string[];
    /**
     * The container reference to use
     */
    container?: Container;
}

export interface IReprocessingOptions {
    /**
     * Maximum depth for recursive reprocessing
     */
    maxDepth?: number;
    /**
     * Whether to log debug information during reprocessing
     */
    logDebug?: boolean;
    /**
     * Whether to handle errors gracefully during reprocessing
     */
    handleErrors?: boolean;
}

export interface IReprocessingInfo {
    /**
     * Type of value being reprocessed
     */
    type: 'string' | 'json-string' | 'array' | 'object' | 'unknown';
    /**
     * Whether the value should be reprocessed
     */
    shouldReprocess: boolean;
    /**
     * Whether the value is JSON
     */
    isJson: boolean;
    /**
     * Whether the value is a string
     */
    isString: boolean;
    /**
     * Whether the value is an object/array
     */
    isObject: boolean;
}

export declare class Interpreter {
    /**
     * Main execution method for the interpreter
     */
    static run(ctx: Context): Promise<string | null>;
    static run(runtime: IRunnable): Promise<string | null>;

    /**
     * Handles reprocessing of results that may contain $ code
     * @private
     */
    private static handleReprocessing(value: any, ctx: Context, sourceFunction?: any, isFinalContent?: boolean): Promise<any>;

    /**
     * Checks if a value needs reprocessing
     * @private
     */
    private static needsReprocessing(value: any): boolean;

    /**
     * Checks if a string contains function patterns
     * @private
     */
    private static containsFunctionPatterns(str: string): boolean;

    /**
     * Checks if an object needs reprocessing
     * @private
     */
    private static objectNeedsReprocessing(obj: any): boolean;

    /**
     * Gets information about the required reprocessing
     * @private
     */
    private static getReprocessingInfo(value: any, sourceFunction?: any, isFinalContent?: boolean): IReprocessingInfo;

    /**
     * Reprocesses a value that contains $ code
     * @private
     */
    private static reprocessValue(value: any, ctx: Context, info: IReprocessingInfo): Promise<any>;

    /**
     * Reprocesses a string that contains $ code
     * @private
     */
    private static reprocessString(str: string, ctx: Context): Promise<string>;

    /**
     * Reprocesses an object that contains $ code
     * @private
     */
    private static reprocessObject(obj: any, ctx: Context): Promise<any>;

    /**
     * Creates a temporary context for reprocessing
     * @private
     */
    private static createTempContext(originalCtx: Context): Context;

    /**
     * Configures the reprocessing behavior of the interpreter
     */
    static configureReprocessing(enabled?: boolean, options?: IReprocessingOptions): void;

    /**
     * Temporarily disables reprocessing
     */
    static disableReprocessing(): void;

    /**
     * Enables reprocessing
     */
    static enableReprocessing(): void;

    /**
     * Static property indicating if reprocessing is enabled
     * @private
     */
    private static reprocessingEnabled: boolean;

    /**
     * Static property with reprocessing options
     * @private
     */
    private static reprocessingOptions: IReprocessingOptions;
}
