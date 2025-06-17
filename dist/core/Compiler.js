"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Compiler = exports.Conditions = exports.Operators = exports.OperatorType = void 0;
const CompiledFunction_1 = require("../structures/@internal/CompiledFunction");
const ForgeError_1 = require("../structures/forge/ForgeError");
const discord_js_1 = require("discord.js");

var OperatorType;
(function (OperatorType) {
    OperatorType["Eq"] = "==";
    OperatorType["NotEq"] = "!=";
    OperatorType["Lte"] = "<=";
    OperatorType["Gte"] = ">=";
    OperatorType["Gt"] = ">";
    OperatorType["Lt"] = "<";
    OperatorType["None"] = "unknown";
})(OperatorType || (exports.OperatorType = OperatorType = {}));

exports.Operators = new Set(Object.values(OperatorType));
exports.Conditions = {
    unknown: (lhs, rhs) => lhs === "true",
    "!=": (lhs, rhs) => lhs !== rhs,
    "==": (lhs, rhs) => lhs === rhs,
    "<": (lhs, rhs) => Number(lhs) < Number(rhs),
    "<=": (lhs, rhs) => Number(lhs) <= Number(rhs),
    ">": (lhs, rhs) => Number(lhs) > Number(rhs),
    ">=": (lhs, rhs) => Number(lhs) >= Number(rhs),
};

/**
 * Enhanced Compiler with code reprocessing support
 */
class Compiler {
    path;
    code;
    static Syntax = {
        Open: "[",
        Close: "]",
        Escape: "\\",
        Count: "@",
        Negation: "!",
        Separator: ";",
        Silent: "#"
    };
    static SystemRegex = /(\\+)?\[SYSTEM_FUNCTION\(\d+\)\]/gm;
    static Regex;
    static InvalidCharRegex = /(\\|\${|`)/g;
    static Functions = new discord_js_1.Collection();
    static EscapeRegex = /(\.|\$|\(|\)|\*|\[|\]|\{|\}|\?|!|\^)/gim;
    
    // Configuração para reprocessamento
    static maxReprocessDepth = 5; // Evita loops infinitos
    static reprocessEnabled = true;
    
    id = 0;
    matches;
    matchIndex = 0;
    index = 0;
    outputFunctions = new Array();
    outputCode = "";
    reprocessDepth = 0;

    constructor(path, code, depth = 0) {
        this.path = path;
        this.code = code;
        this.reprocessDepth = depth;
        
        if (code) {
            this.matches = Array.from(code.matchAll(Compiler.Regex)).map((x) => ({
                index: x.index,
                negated: !!x[1],
                silent: !!x[2],
                length: x[0].length,
                count: x[4] ?? null,
                fn: this.getFunction(x[5]),
            }));
        }
        else
            this.matches = [];
    }

    compile() {
        if (this.matches.length !== 0) {
            // Loop while functions are unmatched
            let match;
            loop: while ((match = this.match) !== undefined) {
                while (match.index !== this.index) {
                    const char = this.char();
                    const { isEscape } = this.getCharInfo(char);
                    if (isEscape) {
                        const { char } = this.processEscape();
                        this.outputCode += char;
                        continue loop;
                    }
                    this.outputCode += char;
                    this.index++;
                }
                const parsed = this.parseFunction();
                this.outputFunctions.push(parsed);
                this.outputCode += parsed.id;
            }
            this.outputCode += this.code.slice(this.index);
        }
        else
            this.outputCode = this.code ?? "";

        return {
            code: this.outputCode,
            functions: this.outputFunctions,
            resolve: this.wrap(this.outputCode),
            // Método para reprocessar resultado
            reprocess: (result) => this.reprocessResult(result),
        };
    }

    /**
     * Reprocessa o resultado de uma função se contiver código com $
     */
    reprocessResult(result) {
        if (!result || typeof result !== 'string') return result;
        if (!Compiler.reprocessEnabled) return result;
        if (this.reprocessDepth >= Compiler.maxReprocessDepth) {
            console.warn(`Max reprocess depth (${Compiler.maxReprocessDepth}) reached. Stopping reprocessing.`);
            return result;
        }

        // Verifica se o resultado contém funções com $
        if (this.containsFunctions(result)) {
            try {
                console.log(`Reprocessing result at depth ${this.reprocessDepth + 1}:`, result.substring(0, 100) + '...');
                
                // Compila recursivamente o resultado
                const reprocessedCompiler = new Compiler(
                    this.path ? `${this.path} (reprocessed-${this.reprocessDepth + 1})` : `reprocessed-${this.reprocessDepth + 1}`,
                    result,
                    this.reprocessDepth + 1
                );
                
                const reprocessedResult = reprocessedCompiler.compile();
                
                // Merge das funções reprocessadas
                this.outputFunctions.push(...reprocessedResult.functions);
                
                return {
                    code: reprocessedResult.code,
                    functions: reprocessedResult.functions,
                    resolve: reprocessedResult.resolve,
                    wasReprocessed: true,
                    originalResult: result
                };
            } catch (error) {
                console.error('Error during reprocessing:', error);
                return result; // Retorna o resultado original em caso de erro
            }
        }

        return result;
    }

    /**
     * Verifica se uma string contém funções com $
     */
    containsFunctions(str) {
        if (!str || typeof str !== 'string') return false;
        
        // Verifica se há padrões de função no formato $funcName
        const functionPattern = /\$[a-zA-Z_][a-zA-Z0-9_]*(\[.*?\])?/g;
        return functionPattern.test(str);
    }

    /**
     * Método estático para reprocessar resultado JSON
     */
    static reprocessJsonResult(jsonResult, originalPath) {
        if (!jsonResult || typeof jsonResult !== 'object') return jsonResult;
        
        const processValue = (value, key = null) => {
            if (typeof value === 'string' && this.prototype.containsFunctions(value)) {
                try {
                    const compiler = new Compiler(
                        originalPath ? `${originalPath} (json-reprocess)` : 'json-reprocess',
                        value
                    );
                    const result = compiler.compile();
                    return {
                        ...result,
                        wasReprocessed: true,
                        originalValue: value,
                        jsonKey: key
                    };
                } catch (error) {
                    console.error(`Error reprocessing JSON key "${key}":`, error);
                    return value;
                }
            }
            
            if (Array.isArray(value)) {
                return value.map((item, index) => processValue(item, `${key}[${index}]`));
            }
            
            if (value && typeof value === 'object') {
                const processed = {};
                for (const [k, v] of Object.entries(value)) {
                    processed[k] = processValue(v, key ? `${key}.${k}` : k);
                }
                return processed;
            }
            
            return value;
        };

        return processValue(jsonResult);
    }

    parseFunction() {
        // Skip this match already
        const match = this.matches[this.matchIndex++];
        // Skip function
        this.skip(match.length);
        const hasFields = this.code[this.index] === Compiler.Syntax.Open;
        
        if (!hasFields && match.fn.args?.required) {
            this.error(`Function ${match.fn.name} requires brackets`);
        }
        else if (!hasFields || match.fn.args === null) {
            return this.prepareFunction(match, null);
        }
        
        // Skip [
        this.skip(1);
        const fields = new Array();
        
        // Field parsing
        for (let i = 0, len = match.fn.args.fields.length; i < len; i++) {
            let isLast = i + 1 === len;
            const field = match.fn.args.fields[i];
            if (!field.rest) {
                fields.push(this.parseAnyField(match, field));
            }
            else {
                for (;;) {
                    fields.push(this.parseAnyField(match, field));
                    if (this.back() !== Compiler.Syntax.Separator)
                        break;
                }
            }
            const isSeparator = this.back() === Compiler.Syntax.Separator;
            if (!isSeparator)
                break;
            else if (isLast && isSeparator) {
                this.error(`Function ${match.fn.name} expects ${match.fn.args?.fields.length} arguments at most`);
            }
        }
        return this.prepareFunction(match, fields);
    }

    getCharInfo(char) {
        return {
            isSeparator: char === Compiler.Syntax.Separator,
            isClosure: char === Compiler.Syntax.Close,
            isEscape: char === Compiler.Syntax.Escape,
        };
    }

    parseFieldMatch(fns, match) {
        const fn = this.parseFunction();
        fns.push(fn);
        // Next match
        return {
            nextMatch: this.match,
            fn,
        };
    }

    processEscape() {
        this.index++;
        const next = this.char();
        const now = this.match;
        if (now && now.index === this.index)
            this.matchIndex++;
        this.index++;
        return {
            nextMatch: this.match,
            char: next,
        };
    }

    parseConditionField(ref) {
        const data = {};
        const functions = new Array();
        let fieldValue = "";
        let closedGracefully = false;
        let match = this.match;
        let char;
        
        while ((char = this.char()) !== undefined) {
            const { isClosure, isEscape, isSeparator } = this.getCharInfo(char);
            if (isEscape) {
                const { char, nextMatch } = this.processEscape();
                fieldValue += char;
                match = nextMatch;
                continue;
            }
            if (isClosure || isSeparator) {
                closedGracefully = true;
                break;
            }
            if (match?.index === this.index) {
                const { fn, nextMatch } = this.parseFieldMatch(functions, match);
                match = nextMatch;
                fieldValue += fn.id;
                continue;
            }
            if (data.op === undefined) {
                const possibleOperator = [char + this.peek(), char].find((x) => exports.Operators.has(x));
                if (possibleOperator) {
                    data.op = possibleOperator;
                    data.lhs = {
                        functions: [...functions],
                        resolve: this.wrap(fieldValue),
                        value: fieldValue,
                    };
                    fieldValue = "";
                    functions.length = 0;
                    this.index += data.op.length;
                    continue;
                }
            }
            fieldValue += char;
            this.index++;
        }
        
        if (!closedGracefully)
            this.error(`Function ${ref.fn.name} is missing brace closure`);
        
        const out = {
            functions,
            value: fieldValue,
            resolve: this.wrap(fieldValue),
        };
        
        if (data.op)
            data.rhs = out;
        else
            data.lhs = out;
        data.op ??= OperatorType.None;
        data.resolve = this.wrapCondition(data.op);
        return data;
    }

    parseNormalField(ref) {
        const functions = new Array();
        let fieldValue = "";
        let closedGracefully = false;
        let match = this.match;
        let char;
        
        while ((char = this.char()) !== undefined) {
            const { isClosure, isEscape, isSeparator } = this.getCharInfo(char);
            if (isEscape) {
                const { char, nextMatch } = this.processEscape();
                fieldValue += char;
                match = nextMatch;
                continue;
            }
            if (isClosure || isSeparator) {
                closedGracefully = true;
                break;
            }
            if (match?.index === this.index) {
                const { fn, nextMatch } = this.parseFieldMatch(functions, match);
                match = nextMatch;
                fieldValue += fn.id;
                continue;
            }
            fieldValue += char;
            this.index++;
        }
        
        if (!closedGracefully)
            this.error(`Function ${ref.fn.name} is missing brace closure`);
        
        return {
            resolve: this.wrap(fieldValue),
            functions,
            value: fieldValue,
        };
    }

    parseAnyField(ref, field) {
        const fld = field.condition ? this.parseConditionField(ref) : this.parseNormalField(ref);
        this.skip(1);
        return fld;
    }

    prepareFunction(match, fields) {
        const id = this.getNextId();
        return {
            index: this.id - 1,
            id,
            fields,
            count: match.count,
            silent: match.silent,
            name: match.fn.name,
            negated: match.negated,
            // Adiciona informações de reprocessamento
            canReprocess: true,
            reprocessDepth: this.reprocessDepth,
        };
    }

    skip(n) {
        return this.moveTo(n + this.index);
    }

    skipIf(char) {
        if (char === this.code[this.index])
            return this.skip(1), true;
        return false;
    }

    get match() {
        return this.matches[this.matchIndex];
    }

    getFunction(str) {
        const fn = `$${str.toLowerCase()}`;
        return (Compiler.Functions.get(fn) ??
            Compiler.Functions.find((x) => x.aliases?.some((x) => x.toLowerCase() === fn)) ??
            this.error(`Function ${fn} is not registered.`));
    }

    error(str) {
        const { line, column } = this.locate(this.index);
        throw new ForgeError_1.ForgeError(null, ForgeError_1.ErrorType.CompilerError, str, line, column, this.path ?? "index file");
    }

    locate(index) {
        const data = {
            column: 0,
            line: 1,
        };
        for (let i = 0; i < index; i++) {
            const char = this.code[i];
            if (char === "\n")
                data.line++, (data.column = 0);
            else
                data.column++;
        }
        return data;
    }

    back() {
        return this.code[this.index - 1];
    }

    wrapCondition(op) {
        return exports.Conditions[op];
    }

    wrap(code) {
        let i = 0;
        const gencode = code.replace(Compiler.InvalidCharRegex, "\\$1").replace(Compiler.SystemRegex, () => {
            return "${args[" + i++ + "] ?? ''}";
        });
        return new Function("args", "return `" + gencode + "`");
    }

    moveTo(index) {
        this.index = index;
    }

    getNextId() {
        return `[SYSTEM_FUNCTION(${this.id++})]`;
    }

    char() {
        return this.code[this.index];
    }

    peek() {
        return this.code[this.index + 1];
    }

    next() {
        return this.code[this.index++];
    }

    static setFunctions(fns) {
        fns.map((x) => {
            this.Functions.set(x.name.toLowerCase(), x);
            x.aliases
                ?.filter((x) => typeof x === "string")
                ?.map((alias) => this.Functions.set(alias.toLowerCase(), x));
        });
        
        const mapped = Array.from(this.Functions.keys());
        this.Regex = new RegExp(`\\$(\\!)?(\\#)?(@\\[(.*?)\\])?(${mapped
            .map((x) => (x.startsWith("$") ? x.slice(1).toLowerCase() : x.toLowerCase()).replace(Compiler.EscapeRegex, "\\$1"))
            .sort((x, y) => y.length - x.length)
            .join("|")})`, "gim");
    }

    static compile(code, path) {
        const result = new this(path, code).compile();
        return {
            ...result,
            functions: result.functions.map((x) => new CompiledFunction_1.CompiledFunction(x)),
        };
    }

    static setSyntax(syntax) {
        Reflect.set(Compiler, "Syntax", syntax);
    }

    /**
     * Configura o reprocessamento
     */
    static configureReprocessing(options = {}) {
        this.reprocessEnabled = options.enabled !== false;
        this.maxReprocessDepth = options.maxDepth || 5;
    }

    /**
     * Desabilita temporariamente o reprocessamento
     */
    static disableReprocessing() {
        this.reprocessEnabled = false;
    }

    /**
     * Habilita o reprocessamento
     */
    static enableReprocessing() {
        this.reprocessEnabled = true;
    }
}

exports.Compiler = Compiler;
