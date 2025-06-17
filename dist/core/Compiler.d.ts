import { CompiledFunction } from "../structures/@internal/CompiledFunction";

export interface IRawField {
    condition?: boolean;
    rest?: boolean;
}

export interface IRawFunctionFieldDefinition {
    required: boolean;
    fields: IRawField[];
}

export interface IRawFunction {
    aliases: null | string[];
    name: string;
    /**
     * If undefined, function has no fields.
     * If present and required true, fields are required.
     * If false, fields are not required.
     */
    args: IRawFunctionFieldDefinition | null;
}

export type WrappedCode = (args: unknown[]) => string;
export type WrappedConditionCode = (lhs: unknown, rhs: unknown) => boolean;

export interface ICompiledFunctionField {
    value: string;
    functions: ICompiledFunction[];
    resolve: WrappedCode;
}

export declare enum OperatorType {
    Eq = "==",
    NotEq = "!=",
    Lte = "<=",
    Gte = ">=",
    Gt = ">",
    Lt = "<",
    None = "unknown"
}

export declare const Operators: Set<OperatorType>;
export declare const Conditions: Record<OperatorType, WrappedConditionCode>;

export interface ICompiledFunctionConditionField {
    op: OperatorType;
    lhs: ICompiledFunctionField;
    rhs?: ICompiledFunctionField;
    resolve: WrappedConditionCode;
}

export interface ILocation {
    line: number;
    column: number;
}

export interface ICompiledFunction {
    index: number;
    id: string;
    name: string;
    count: string | null;
    /**
     * Whether error will be silenced and just exit execution
     */
    silent: boolean;
    /**
     * Whether output is not desirable
     */
    negated: boolean;
    fields: null | (ICompiledFunctionField | ICompiledFunctionConditionField)[];
    /**
     * Whether this function can be reprocessed
     */
    canReprocess?: boolean;
    /**
     * Current reprocessing depth
     */
    reprocessDepth?: number;
}

export interface ICompilationResult {
    code: string;
    functions: ICompiledFunction[];
    resolve: WrappedCode;
    /**
     * Method to reprocess function results that contain $ code
     */
    reprocess: (result: unknown) => unknown;
}

export interface IExtendedCompilationResult extends Omit<ICompilationResult, "functions"> {
    functions: CompiledFunction[];
}

export interface IRawFunctionMatch {
    index: number;
    length: number;
    negated: boolean;
    silent: boolean;
    count: string | null;
    fn: IRawFunction;
}

/**
 * Result of reprocessing operation
 */
export interface IReprocessResult {
    code: string;
    functions: ICompiledFunction[];
    resolve: WrappedCode;
    wasReprocessed: boolean;
    originalResult?: unknown;
    jsonKey?: string;
}

/**
 * Reprocessing configuration options
 */
export interface IReprocessingOptions {
    enabled?: boolean;
    maxDepth?: number;
}

/**
 * Enhanced Compiler with code reprocessing support
 */
export declare class Compiler {
    private readonly path?;
    private readonly code?;
    private readonly reprocessDepth;
    
    static Syntax: {
        Open: string;
        Close: string;
        Escape: string;
        Count: string;
        Negation: string;
        Separator: string;
        Silent: string;
    };
    
    private static SystemRegex;
    private static Regex;
    private static InvalidCharRegex;
    private static Functions;
    private static EscapeRegex;
    
    /**
     * Maximum depth for reprocessing to prevent infinite loops
     */
    private static maxReprocessDepth;
    
    /**
     * Whether reprocessing is enabled globally
     */
    private static reprocessEnabled;
    
    private id;
    private matches;
    private matchIndex;
    private index;
    private outputFunctions;
    private outputCode;
    
    private constructor(path?: string | null, code?: string, depth?: number);
    
    compile(): ICompilationResult;
    
    /**
     * Reprocesses a result if it contains $ functions
     */
    private reprocessResult(result: unknown): unknown;
    
    /**
     * Checks if a string contains functions that need processing
     */
    private containsFunctions(str: string): boolean;
    
    /**
     * Static method to reprocess JSON results
     */
    static reprocessJsonResult(jsonResult: unknown, originalPath?: string): unknown;
    
    private parseFunction(): ICompiledFunction;
    private getCharInfo(char: string): {
        isSeparator: boolean;
        isClosure: boolean;
        isEscape: boolean;
    };
    private parseFieldMatch(fns: ICompiledFunction[], match: IRawFunctionMatch): {
        nextMatch: IRawFunctionMatch | undefined;
        fn: ICompiledFunction;
    };
    private processEscape(): {
        nextMatch: IRawFunctionMatch | undefined;
        char: string;
    };
    private parseConditionField(ref: IRawFunctionMatch): ICompiledFunctionConditionField;
    private parseNormalField(ref: IRawFunctionMatch): ICompiledFunctionField;
    private parseAnyField(ref: IRawFunctionMatch, field: IRawField): ICompiledFunctionField | ICompiledFunctionConditionField;
    private prepareFunction(match: IRawFunctionMatch, fields: (ICompiledFunctionField | ICompiledFunctionConditionField)[] | null): ICompiledFunction;
    private skip(n: number): void;
    private skipIf(char: string): boolean;
    private get match(): IRawFunctionMatch | undefined;
    private getFunction(str: string): IRawFunction;
    private error(str: string): never;
    private locate(index: number): ILocation;
    private back(): string;
    private wrapCondition(op: OperatorType): WrappedConditionCode;
    private wrap(code: string): WrappedCode;
    private moveTo(index: number): void;
    private getNextId(): string;
    private char(): string;
    private peek(): string;
    private next(): string;
    
    private static setFunctions(fns: IRawFunction[]): void;
    
    static compile(code?: string, path?: string | null): IExtendedCompilationResult;
    static setSyntax(syntax: typeof this.Syntax): void;
    
    /**
     * Configures reprocessing behavior
     */
    static configureReprocessing(options?: IReprocessingOptions): void;
    
    /**
     * Temporarily disables reprocessing
     */
    static disableReprocessing(): void;
    
    /**
     * Enables reprocessing
     */
    static enableReprocessing(): void;
}

//# sourceMappingURL=Compiler.d.ts.map
