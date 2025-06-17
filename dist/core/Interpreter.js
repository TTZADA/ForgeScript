"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Interpreter = void 0;
const structures_1 = require("../structures");
const Compiler_1 = require("./Compiler");

class Interpreter {
    static async run(raw) {
        const ctx = raw instanceof structures_1.Context ? raw : new structures_1.Context(raw);
        const runtime = ctx.runtime;
        
        if (runtime.client !== null) {
            if (runtime.command && !ctx.client.canRespondToBots(runtime.command) && ctx.user?.bot)
                return null;
            if (runtime.command?.data.guildOnly && !ctx.guild)
                return null;
            else if (runtime.client.options.restrictions !== undefined) {
                const { guildIDs, userIDs } = runtime.client.options.restrictions;
                const guildID = ctx.guild?.id;
                const authorID = ctx.user?.id;
                if (userIDs?.length && authorID && !userIDs.includes(authorID))
                    return null;
                else if (guildIDs?.length && guildID && !guildIDs.includes(guildID))
                    return null;
            }
        }

        const args = new Array(runtime.data.functions.length);
        let content;
        
        if (ctx.runtime.data.functions.length === 0) {
            content = ctx.runtime.data.code;
        }
        else {
            ctx.executionTimestamp = performance.now();
            try {
                for (let i = 0, len = runtime.data.functions.length; i < len; i++) {
                    const fn = runtime.data.functions[i];
                    const rt = await fn.execute(ctx);
                    
                    let processedValue = (!rt.success && !ctx.handleNotSuccess(fn, rt)) ? ctx["error"]() : rt.value;
                    
                    // Reprocessamento automático se o resultado contém código $
                    if (rt.success && processedValue != null) {
                        processedValue = await this.handleReprocessing(processedValue, ctx, fn);
                    }
                    
                    args[i] = processedValue;
                }
            }
            catch (err) {
                if (err instanceof Error)
                    structures_1.Logger.error(err);
                else if (err instanceof structures_1.Return) {
                    if (err.return)
                        return err.value;
                }
                return null;
            }
            
            content = runtime.data.resolve(args);
            
            // Reprocessamento final do conteúdo completo
            if (content != null) {
                content = await this.handleReprocessing(content, ctx, null, true);
            }
        }

        if (!runtime.doNotSend) {
            ctx.container.content = content;
            await ctx.container.send(runtime.obj);
        }
        
        return content;
    }

    /**
     * Manipula o reprocessamento de resultados que podem conter código $
     */
    static async handleReprocessing(value, ctx, sourceFunction = null, isFinalContent = false) {
        try {
            // Verifica se o valor precisa de reprocessamento
            if (!this.needsReprocessing(value)) {
                return value;
            }

            const reprocessingInfo = this.getReprocessingInfo(value, sourceFunction, isFinalContent);
            
            if (reprocessingInfo.shouldReprocess) {
                structures_1.Logger.debug(`Reprocessing ${reprocessingInfo.type} from ${sourceFunction?.name || 'final content'}`);
                
                const reprocessed = await this.reprocessValue(value, ctx, reprocessingInfo);
                
                if (reprocessed !== value) {
                    structures_1.Logger.debug(`Reprocessing successful for ${reprocessingInfo.type}`);
                    return reprocessed;
                }
            }
            
            return value;
        }
        catch (error) {
            structures_1.Logger.error('Error during reprocessing:', error);
            return value; // Retorna valor original em caso de erro
        }
    }

    /**
     * Verifica se um valor precisa de reprocessamento
     */
    static needsReprocessing(value) {
        if (value == null) return false;
        
        // Verifica strings que contenham padrões de função
        if (typeof value === 'string') {
            return this.containsFunctionPatterns(value);
        }
        
        // Verifica objetos/arrays recursivamente
        if (typeof value === 'object') {
            return this.objectNeedsReprocessing(value);
        }
        
        return false;
    }

    /**
     * Verifica se uma string contém padrões de função
     */
    static containsFunctionPatterns(str) {
        if (typeof str !== 'string') return false;
        
        // Padrão para detectar funções $funcName[args] ou $funcName
        const functionPattern = /\$[a-zA-Z_][a-zA-Z0-9_]*(?:\[[^\]]*\])?/g;
        return functionPattern.test(str);
    }

    /**
     * Verifica se um objeto precisa de reprocessamento
     */
   static objectNeedsReprocessing(obj) {
        if (Array.isArray(obj)) {
            return obj.some(item => this.needsReprocessing(item));
        }
        
        if (obj && typeof obj === 'object') {
            return Object.values(obj).some(value => this.needsReprocessing(value));
        }
        
        return false;
    }

    /**
     * Obtém informações sobre o reprocessamento necessário
     */
   static getReprocessingInfo(value, sourceFunction, isFinalContent) {
        const info = {
            type: 'unknown',
            shouldReprocess: false,
            isJson: false,
            isString: false,
            isObject: false
        };

        if (typeof value === 'string') {
            info.type = 'string';
            info.isString = true;
            info.shouldReprocess = this.containsFunctionPatterns(value);
            
            // Tenta detectar se é JSON
            if (value.trim().startsWith('{') || value.trim().startsWith('[')) {
                try {
                    JSON.parse(value);
                    info.isJson = true;
                    info.type = 'json-string';
                } catch {
                    // Não é JSON válido
                }
            }
        }
        else if (typeof value === 'object' && value !== null) {
            info.type = Array.isArray(value) ? 'array' : 'object';
            info.isObject = true;
            info.shouldReprocess = this.objectNeedsReprocessing(value);
        }

        return info;
    }

    /**
     * Reprocessa um valor que contém código $
     */
  static async reprocessValue(value, ctx, info) {
        if (info.isString) {
            return await this.reprocessString(value, ctx);
        }
        else if (info.isObject) {
            return await this.reprocessObject(value, ctx);
        }
        
        return value;
    }

    /**
     * Reprocessa uma string que contém código $
     */
   static async reprocessString(str, ctx) {
        try {
            // Se é JSON, primeiro parse e depois reprocessa
            if (str.trim().startsWith('{') || str.trim().startsWith('[')) {
                try {
                    const parsed = JSON.parse(str);
                    const reprocessed = await this.reprocessObject(parsed, ctx);
                    return JSON.stringify(reprocessed);
                } catch {
                    // Se não é JSON válido, trata como string normal
                }
            }

            // Compila e executa o código da string
            const compiled = Compiler_1.Compiler.compile(str, ctx.runtime.path);
            
            if (compiled.functions.length === 0) {
                return str; // Não há funções para executar
            }

            // Cria um contexto temporário para execução
            const tempCtx = this.createTempContext(ctx);
            const args = new Array(compiled.functions.length);
            
            // Executa as funções encontradas
            for (let i = 0; i < compiled.functions.length; i++) {
                const fn = compiled.functions[i];
                const rt = await fn.execute(tempCtx);
                args[i] = rt.success ? rt.value : '';
            }
            
            return compiled.resolve(args);
        }
        catch (error) {
            structures_1.Logger.error('Error reprocessing string:', error);
            return str;
        }
    }

    /**
     * Reprocessa um objeto que contém código $
     */
     static async reprocessObject(obj, ctx) {
        if (Array.isArray(obj)) {
            const results = [];
            for (const item of obj) {
                results.push(await this.handleReprocessing(item, ctx));
            }
            return results;
        }
        
        if (obj && typeof obj === 'object') {
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = await this.handleReprocessing(value, ctx);
            }
            return result;
        }
        
        return obj;
    }

    /**
     * Cria um contexto temporário para reprocessamento
     */
    static createTempContext(originalCtx) {
        // Cria uma cópia do contexto para reprocessamento
        const tempCtx = Object.create(originalCtx);
        tempCtx.isReprocessing = true;
        tempCtx.originalContext = originalCtx;
        return tempCtx;
    }

    /**
     * Configura o comportamento de reprocessamento do interpreter
     */
    static configureReprocessing(enabled = true, options = {}) {
        this.reprocessingEnabled = enabled;
        this.reprocessingOptions = {
            maxDepth: 5,
            logDebug: false,
            handleErrors: true,
            ...options
        };
    }

    /**
     * Desabilita o reprocessamento temporariamente
     */
    static disableReprocessing() {
        this.reprocessingEnabled = false;
    }

    /**
     * Habilita o reprocessamento
     */
    static enableReprocessing() {
        this.reprocessingEnabled = true;
    }

    // Propriedades estáticas para configuração
    static reprocessingEnabled = true;
    static reprocessingOptions = {
        maxDepth: 5,
        logDebug: false,
        handleErrors: true
    };
}

exports.Interpreter = Interpreter;
