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
                    
                    // Nova lógica: Se função falhou, tenta execução completa
                    if (!rt.success && this.shouldRetryWithFullExecution(processedValue, fn, ctx)) {
                        structures_1.Logger.debug(`Function ${fn.name} failed, attempting full code execution`);
                        
                        try {
                            const fullExecutionResult = await this.executeFullCodeForFailedFunction(ctx, fn, i);
                            if (fullExecutionResult !== null) {
                                processedValue = fullExecutionResult;
                            }
                        } catch (fullExecError) {
                            structures_1.Logger.error(`Full execution failed for ${fn.name}:`, fullExecError);
                        }
                    }
                    // Reprocessamento automático se o resultado contém código $
                    else if (rt.success && processedValue != null) {
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
     * Verifica se deve tentar execução completa após falha
     */
    static shouldRetryWithFullExecution(failedValue, fn, ctx) {
        // Se a função falhou e o resultado contém padrões que podem precisar de contexto
        if (typeof failedValue === 'string') {
            // Verifica se contém JSON com funções
            if (this.containsJsonWithFunctions(failedValue)) {
                structures_1.Logger.debug(`Detected JSON with functions in failed result: ${failedValue}`);
                return true;
            }
            
            // Verifica se contém funções não resolvidas
            if (this.containsFunctionPatterns(failedValue)) {
                structures_1.Logger.debug(`Detected unresolved functions in failed result: ${failedValue}`);
                return true;
            }
        }
        
        // Verifica se a função específica é conhecida por precisar de contexto completo
        if (this.isFunctionThatNeedsFullContext(fn)) {
            structures_1.Logger.debug(`Function ${fn.name} is known to need full context`);
            return true;
        }
        
        return false;
    }

    /**
     * Verifica se uma string contém JSON com funções
     */
    static containsJsonWithFunctions(str) {
        if (typeof str !== 'string') return false;
        
        try {
            // Tenta fazer parse como JSON
            const trimmed = str.trim();
            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                
                // Verifica se o JSON contém padrões de função antes do parse
                if (this.containsFunctionPatterns(trimmed)) {
                    // Tenta parse para confirmar que é JSON válido (estruturalmente)
                    try {
                        JSON.parse(trimmed);
                        return false; // Se parseou com sucesso, não precisa reprocessar
                    } catch {
                        return true; // JSON inválido com funções, precisa reprocessar
                    }
                }
            }
        } catch {
            // Erro no parse, pode ser JSON malformado com funções
            return this.containsFunctionPatterns(str);
        }
        
        return false;
    }

    /**
     * Verifica se é uma função que tipicamente precisa de contexto completo
     */
    static isFunctionThatNeedsFullContext(fn) {
        const functionsNeedingContext = [
            'json', 'object', 'array', 'variable', 'get', 'set',
            'eval', 'execute', 'parse', 'format', 'template'
        ];
        
        if (!fn.name) return false;
        
        const fnName = fn.name.toLowerCase();
        return functionsNeedingContext.some(name => fnName.includes(name));
    }

    /**
     * Executa código completo quando função falha
     */
    static async executeFullCodeForFailedFunction(ctx, failedFunction, functionIndex) {
        try {
            structures_1.Logger.debug(`Starting full code execution for failed function: ${failedFunction.name}`);
            
            // Pega o código original completo
            const originalCode = ctx.runtime.data.code;
            
            if (!originalCode || typeof originalCode !== 'string') {
                structures_1.Logger.debug('No original code found for full execution');
                return null;
            }
            
            // Compila o código completo novamente
            const compiled = Compiler_1.Compiler.compile(originalCode, ctx.runtime.path);
            
            if (compiled.functions.length === 0) {
                structures_1.Logger.debug('No functions found in compiled code');
                return originalCode;
            }

            // Cria contexto para execução completa
            const fullExecCtx = this.createFullExecutionContext(ctx);
            fullExecCtx.isFailureRecovery = true;
            fullExecCtx.failedFunction = failedFunction;
            fullExecCtx.failedFunctionIndex = functionIndex;
            
            // Executa todo o código desde o início
            const fullResult = await this.runFullExecutionForFailure(fullExecCtx, compiled);
            
            if (fullResult !== null) {
                structures_1.Logger.debug(`Full execution successful, result: ${fullResult}`);
                
                // Se o resultado ainda contém a função específica que falhou,
                // tenta extrair só a parte relevante
                if (functionIndex < compiled.functions.length) {
                    const specificResult = await this.extractResultForSpecificFunction(
                        fullResult, compiled, functionIndex, fullExecCtx
                    );
                    return specificResult !== null ? specificResult : fullResult;
                }
                
                return fullResult;
            }
            
            return null;
        }
        catch (error) {
            structures_1.Logger.error('Error in executeFullCodeForFailedFunction:', error);
            return null;
        }
    }

    /**
     * Executa código completo especificamente para recuperação de falha
     */
    static async runFullExecutionForFailure(ctx, compiled) {
        try {
            const args = new Array(compiled.functions.length);
            ctx.executionTimestamp = performance.now();
            
            // Executa todas as funções do código original
            for (let i = 0; i < compiled.functions.length; i++) {
                const fn = compiled.functions[i];
                structures_1.Logger.debug(`Executing function ${i} (${fn.name}) in full recovery mode`);
                
                const rt = await fn.execute(ctx);
                
                if (rt.success) {
                    args[i] = rt.value;
                    structures_1.Logger.debug(`Function ${i} succeeded with: ${rt.value}`);
                } else {
                    // Se ainda falhar, usa valor de erro ou vazio
                    args[i] = ctx.handleNotSuccess ? ctx.handleNotSuccess(fn, rt) : '';
                    structures_1.Logger.debug(`Function ${i} failed again, using fallback`);
                }
            }
            
            // Resolve o resultado final
            const content = compiled.resolve(args);
            structures_1.Logger.debug(`Full recovery execution result: ${content}`);
            
            return content;
        }
        catch (error) {
            structures_1.Logger.error('Error in runFullExecutionForFailure:', error);
            return null;
        }
    }

    /**
     * Tenta extrair resultado específico para a função que falhou
     */
    static async extractResultForSpecificFunction(fullResult, compiled, functionIndex, ctx) {
        try {
            // Se o resultado completo é uma string, tenta extrair a parte específica
            if (typeof fullResult === 'string' && fullResult.length > 0) {
                // Recompila apenas para obter os argumentos individuais
                const args = new Array(compiled.functions.length);
                
                for (let i = 0; i < compiled.functions.length; i++) {
                    const fn = compiled.functions[i];
                    const rt = await fn.execute(ctx);
                    args[i] = rt.success ? rt.value : '';
                }
                
                // Retorna especificamente o resultado da função que falhou
                return args[functionIndex] || null;
            }
            
            return null;
        }
        catch (error) {
            structures_1.Logger.debug('Could not extract specific function result:', error);
            return null;
        }
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
     * Reprocessa uma string que contém código $ - PRESERVA CONTEXTO
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

            // Execução preservando contexto - MELHORADO
            return await this.executeWithPreservedContext(str, ctx);
        }
        catch (error) {
            structures_1.Logger.error('Error reprocessing string:', error);
            return str;
        }
    }

    /**
     * Executa código preservando completamente o contexto original - NOVA IMPLEMENTAÇÃO
     */
    static async executeWithPreservedContext(code, originalCtx) {
        try {
            structures_1.Logger.debug('Executing with preserved context:', code);
            
            // Compila o código
            const compiled = Compiler_1.Compiler.compile(code, originalCtx.runtime.path);
            
            if (compiled.functions.length === 0) {
                return code; // Não há funções para executar
            }

            // CRÍTICO: Usa o contexto original diretamente em vez de criar um novo
            // Isso preserva todas as variáveis ($let) e dados do contexto pai
            const preservedCtx = this.createPreservedContext(originalCtx);
            
            // Executa com o contexto preservado
            const result = await this.runWithPreservedContext(preservedCtx, compiled);
            
            structures_1.Logger.debug('Preserved context execution result:', result);
            return result || code;
        }
        catch (error) {
            structures_1.Logger.error('Error in executeWithPreservedContext:', error);
            return code;
        }
    }

    /**
     * Cria contexto preservado que mantém TODAS as variáveis e dados
     */
    static createPreservedContext(originalCtx) {
        // NOVA ABORDAGEM: Em vez de criar um contexto novo, 
        // cria uma referência que preserva TUDO do contexto original
        const preservedCtx = {
            // Referências diretas aos objetos originais (não cópias)
            ...originalCtx,
            
            // Preserva especificamente as variáveis
            variables: originalCtx.variables,
            data: originalCtx.data,
            
            // Preserva funções de contexto
            handleNotSuccess: originalCtx.handleNotSuccess,
            error: originalCtx.error,
            
            // Preserva propriedades do Discord
            guild: originalCtx.guild,
            channel: originalCtx.channel,
            user: originalCtx.user,
            message: originalCtx.message,
            client: originalCtx.client,
            
            // Preserva runtime mas evita envio duplo
            runtime: {
                ...originalCtx.runtime,
                doNotSend: true
            },
            
            // Preserva container mas evita envio
            container: {
                ...originalCtx.container,
                send: async () => {} // Função vazia
            },
            
            // Marca como reprocessamento preservado
            isPreservedReprocessing: true,
            originalContext: originalCtx
        };
        
        return preservedCtx;
    }

    /**
     * Executa com contexto preservado
     */
    static async runWithPreservedContext(ctx, compiled) {
        const args = new Array(compiled.functions.length);
        
        try {
            ctx.executionTimestamp = performance.now();
            
            // Executa todas as funções preservando o contexto
            for (let i = 0, len = compiled.functions.length; i < len; i++) {
                const fn = compiled.functions[i];
                structures_1.Logger.debug(`Executing preserved function ${i}: ${fn.name}`);
                
                const rt = await fn.execute(ctx);
                
                let processedValue = (!rt.success && !ctx.handleNotSuccess(fn, rt)) ? ctx["error"]() : rt.value;
                
                // Reprocessamento recursivo se necessário, mas sem perder contexto
                if (rt.success && processedValue != null && this.needsReprocessing(processedValue)) {
                    processedValue = await this.handleReprocessing(processedValue, ctx, fn);
                }
                
                args[i] = processedValue;
            }
            
            // Resolve o resultado final
            const content = compiled.resolve(args);
            
            // Reprocessamento final se necessário
            if (content != null && this.needsReprocessing(content)) {
                return await this.handleReprocessing(content, ctx, null, true);
            }
            
            return content;
        }
        catch (err) {
            if (err instanceof Error) {
                structures_1.Logger.error('Error in preserved context execution:', err);
            }
            else if (err instanceof structures_1.Return) {
                if (err.return) {
                    return err.value;
                }
            }
            return null;
        }
    }

    /**
     * Executa o código completo desde o início - VERSÃO LEGADA MANTIDA
     */
    static async executeFromBeginning(code, originalCtx) {
        try {
            structures_1.Logger.debug('Executing code from beginning:', code);
            
            // Compila o código completo
            const compiled = Compiler_1.Compiler.compile(code, originalCtx.runtime.path);
            
            if (compiled.functions.length === 0) {
                return code; // Não há funções para executar
            }

            // Cria um novo contexto baseado no original mas independente
            const newCtx = this.createFullExecutionContext(originalCtx);
            
            // Cria novo runtime temporário com o código compilado
            const tempRuntime = {
                ...originalCtx.runtime,
                data: compiled,
                doNotSend: true // Não envia resultado, apenas processa
            };
            
            newCtx.runtime = tempRuntime;
            
            // Executa tudo desde o início - como se fosse um novo Interpreter.run()
            const result = await this.runFullExecution(newCtx);
            
            structures_1.Logger.debug('Full execution result:', result);
            return result || code;
        }
        catch (error) {
            structures_1.Logger.error('Error in executeFromBeginning:', error);
            return code;
        }
    }

    /**
     * Executa o código completo como uma nova instância do interpreter
     */
    static async runFullExecution(ctx) {
        const runtime = ctx.runtime;
        const args = new Array(runtime.data.functions.length);
        
        try {
            ctx.executionTimestamp = performance.now();
            
            // Executa todas as funções desde o início
            for (let i = 0, len = runtime.data.functions.length; i < len; i++) {
                const fn = runtime.data.functions[i];
                structures_1.Logger.debug(`Executing function ${i}: ${fn.name}`);
                
                const rt = await fn.execute(ctx);
                
                let processedValue = (!rt.success && !ctx.handleNotSuccess(fn, rt)) ? ctx["error"]() : rt.value;
                
                // Reprocessamento recursivo se necessário
                if (rt.success && processedValue != null && this.needsReprocessing(processedValue)) {
                    processedValue = await this.handleReprocessing(processedValue, ctx, fn);
                }
                
                args[i] = processedValue;
            }
            
            // Resolve o resultado final
            const content = runtime.data.resolve(args);
            
            // Reprocessamento final se necessário
            if (content != null && this.needsReprocessing(content)) {
                return await this.handleReprocessing(content, ctx, null, true);
            }
            
            return content;
        }
        catch (err) {
            if (err instanceof Error) {
                structures_1.Logger.error('Error in full execution:', err);
            }
            else if (err instanceof structures_1.Return) {
                if (err.return) {
                    return err.value;
                }
            }
            return null;
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
     * Cria um contexto completo para execução desde o início - VERSÃO LEGADA MANTIDA
     */
    static createFullExecutionContext(originalCtx) {
        // Cria um contexto completamente novo mas baseado no original
        const newCtx = new structures_1.Context({
            // Copia as propriedades essenciais do contexto original
            guild: originalCtx.guild,
            channel: originalCtx.channel,
            user: originalCtx.user,
            message: originalCtx.message,
            client: originalCtx.client,
            // Copia variáveis e dados importantes
            variables: originalCtx.variables || {},
            data: originalCtx.data || {},
            // Adiciona flags para identificar que é reprocessamento
            isFullReprocessing: true,
            originalContext: originalCtx,
            // Copia runtime mas modifica para não enviar
            runtime: {
                ...originalCtx.runtime,
                doNotSend: true
            }
        });
        
        // Garante que não vai enviar mensagens
        newCtx.container = {
            ...originalCtx.container,
            send: async () => {} // Função vazia para não enviar
        };
        
        // Copia funções de contexto importantes
        if (originalCtx.handleNotSuccess) {
            newCtx.handleNotSuccess = originalCtx.handleNotSuccess;
        }
        
        if (originalCtx.error) {
            newCtx.error = originalCtx.error;
        }
        
        return newCtx;
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
            fullExecution: true,
            preserveContext: true, // Nova opção para preservar contexto
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
        handleErrors: true,
        fullExecution: true,
        preserveContext: true // Nova opção habilitada por padrão
    };
}

exports.Interpreter = Interpreter;
