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
            
            // NOVA FUNCIONALIDADE: Reprocessa todos os elementos do container
            await this.reprocessContainer(ctx);
            
            await ctx.container.send(runtime.obj);
        }
        
        return content;
    }

    /**
     * Reprocessa todos os elementos do container (embeds, componentes, etc.)
     */
    static async reprocessContainer(ctx) {
        try {
            const container = ctx.container;
            
            // Reprocessa embeds
            if (container.embeds && container.embeds.length > 0) {
                for (let i = 0; i < container.embeds.length; i++) {
                    container.embeds[i] = await this.reprocessEmbed(container.embeds[i], ctx);
                }
            }
            
            // Reprocessa componentes (botões, selects, etc.)
            if (container.components && container.components.length > 0) {
                for (let i = 0; i < container.components.length; i++) {
                    container.components[i] = await this.reprocessComponent(container.components[i], ctx);
                }
            }
            
            // Reprocessa stickers se necessário
            if (container.stickers && container.stickers.length > 0) {
                for (let i = 0; i < container.stickers.length; i++) {
                    if (typeof container.stickers[i] === 'string') {
                        container.stickers[i] = await this.handleReprocessing(container.stickers[i], ctx);
                    }
                }
            }
            
            // Reprocessa files se necessário
            if (container.files && container.files.length > 0) {
                for (let i = 0; i < container.files.length; i++) {
                    container.files[i] = await this.reprocessFile(container.files[i], ctx);
                }
            }
            
            // Reprocessa modal se existir
            if (container.modal) {
                container.modal = await this.reprocessModal(container.modal, ctx);
            }
            
            // Reprocessa poll se existir
            if (container.poll) {
                container.poll = await this.reprocessPoll(container.poll, ctx);
            }
            
            // Reprocessa outros campos de texto
            if (container.username) {
                container.username = await this.handleReprocessing(container.username, ctx);
            }
            
            if (container.threadName) {
                container.threadName = await this.handleReprocessing(container.threadName, ctx);
            }
            
        } catch (error) {
            structures_1.Logger.error('Error reprocessing container:', error);
        }
    }

    /**
     * Reprocessa um embed
     */
    static async reprocessEmbed(embed, ctx) {
        try {
            if (!embed || typeof embed.toJSON !== 'function') return embed;
            
            const embedData = embed.toJSON();
            const reprocessedData = await this.reprocessEmbedData(embedData, ctx);
            
            // Reconstrói o embed com os dados reprocessados
            const newEmbed = new (require('discord.js').EmbedBuilder)();
            
            if (reprocessedData.title) newEmbed.setTitle(reprocessedData.title);
            if (reprocessedData.description) newEmbed.setDescription(reprocessedData.description);
            if (reprocessedData.url) newEmbed.setURL(reprocessedData.url);
            if (reprocessedData.timestamp) newEmbed.setTimestamp(reprocessedData.timestamp);
            if (reprocessedData.color !== undefined) newEmbed.setColor(reprocessedData.color);
            if (reprocessedData.footer) newEmbed.setFooter(reprocessedData.footer);
            if (reprocessedData.image) newEmbed.setImage(reprocessedData.image.url);
            if (reprocessedData.thumbnail) newEmbed.setThumbnail(reprocessedData.thumbnail.url);
            if (reprocessedData.author) newEmbed.setAuthor(reprocessedData.author);
            if (reprocessedData.fields) newEmbed.addFields(reprocessedData.fields);
            
            return newEmbed;
        } catch (error) {
            structures_1.Logger.error('Error reprocessing embed:', error);
            return embed;
        }
    }

    /**
     * Reprocessa dados do embed recursivamente
     */
    static async reprocessEmbedData(data, ctx) {
        if (typeof data === 'string') {
            return await this.handleReprocessing(data, ctx);
        }
        
        if (Array.isArray(data)) {
            const result = [];
            for (const item of data) {
                result.push(await this.reprocessEmbedData(item, ctx));
            }
            return result;
        }
        
        if (data && typeof data === 'object') {
            const result = {};
            for (const [key, value] of Object.entries(data)) {
                result[key] = await this.reprocessEmbedData(value, ctx);
            }
            return result;
        }
        
        return data;
    }

    /**
     * Reprocessa um componente (botão, select, etc.)
     */
    static async reprocessComponent(component, ctx) {
        try {
            if (!component) return component;
            
            // Se é ActionRow, reprocessa os componentes dentro dele
            if (component.components && Array.isArray(component.components)) {
                const newComponents = [];
                for (const subComponent of component.components) {
                    newComponents.push(await this.reprocessComponent(subComponent, ctx));
                }
                return {
                    ...component,
                    components: newComponents
                };
            }
            
            // Reprocessa propriedades de texto do componente
            const reprocessedComponent = { ...component };
            
            if (component.label) {
                reprocessedComponent.label = await this.handleReprocessing(component.label, ctx);
            }
            
            if (component.placeholder) {
                reprocessedComponent.placeholder = await this.handleReprocessing(component.placeholder, ctx);
            }
            
            if (component.custom_id) {
                reprocessedComponent.custom_id = await this.handleReprocessing(component.custom_id, ctx);
            }
            
            if (component.url) {
                reprocessedComponent.url = await this.handleReprocessing(component.url, ctx);
            }
            
            if (component.value) {
                reprocessedComponent.value = await this.handleReprocessing(component.value, ctx);
            }
            
            // Para select menus, reprocessa as opções
            if (component.options && Array.isArray(component.options)) {
                const newOptions = [];
                for (const option of component.options) {
                    const newOption = { ...option };
                    if (option.label) newOption.label = await this.handleReprocessing(option.label, ctx);
                    if (option.description) newOption.description = await this.handleReprocessing(option.description, ctx);
                    if (option.value) newOption.value = await this.handleReprocessing(option.value, ctx);
                    newOptions.push(newOption);
                }
                reprocessedComponent.options = newOptions;
            }
            
            return reprocessedComponent;
        } catch (error) {
            structures_1.Logger.error('Error reprocessing component:', error);
            return component;
        }
    }

    /**
     * Reprocessa um arquivo
     */
    static async reprocessFile(file, ctx) {
        try {
            if (!file) return file;
            
            const reprocessedFile = { ...file };
            
            if (file.name) {
                reprocessedFile.name = await this.handleReprocessing(file.name, ctx);
            }
            
            if (file.description) {
                reprocessedFile.description = await this.handleReprocessing(file.description, ctx);
            }
            
            return reprocessedFile;
        } catch (error) {
            structures_1.Logger.error('Error reprocessing file:', error);
            return file;
        }
    }

    /**
     * Reprocessa um modal
     */
    static async reprocessModal(modal, ctx) {
        try {
            if (!modal) return modal;
            
            const reprocessedModal = { ...modal };
            
            if (modal.title) {
                reprocessedModal.title = await this.handleReprocessing(modal.title, ctx);
            }
            
            if (modal.custom_id) {
                reprocessedModal.custom_id = await this.handleReprocessing(modal.custom_id, ctx);
            }
            
            // Reprocessa componentes do modal
            if (modal.components && Array.isArray(modal.components)) {
                const newComponents = [];
                for (const component of modal.components) {
                    newComponents.push(await this.reprocessComponent(component, ctx));
                }
                reprocessedModal.components = newComponents;
            }
            
            return reprocessedModal;
        } catch (error) {
            structures_1.Logger.error('Error reprocessing modal:', error);
            return modal;
        }
    }

    /**
     * Reprocessa uma poll
     */
    static async reprocessPoll(poll, ctx) {
        try {
            if (!poll) return poll;
            
            const reprocessedPoll = { ...poll };
            
            if (poll.question) {
                if (poll.question.text) {
                    reprocessedPoll.question = {
                        ...poll.question,
                        text: await this.handleReprocessing(poll.question.text, ctx)
                    };
                }
            }
            
            if (poll.answers && Array.isArray(poll.answers)) {
                const newAnswers = [];
                for (const answer of poll.answers) {
                    const newAnswer = { ...answer };
                    if (answer.text) newAnswer.text = await this.handleReprocessing(answer.text, ctx);
                    newAnswers.push(newAnswer);
                }
                reprocessedPoll.answers = newAnswers;
            }
            
            return reprocessedPoll;
        } catch (error) {
            structures_1.Logger.error('Error reprocessing poll:', error);
            return poll;
        }
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
            'json', 'object', 'array', 'variable', 'get', 'let',
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
     * Reprocessa uma string que contém código $ - EXECUTA DESDE O INÍCIO
     */
    static async reprocessString(str, ctx) {
        try {
            str = str.replace(/\$get\[(.+?)\]/g, (_, key) => ctx.getKeyword(key));

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

            // Execução desde o início - em vez de apenas compilar a string
            return await this.executeFromBeginning(str, ctx);
        }
        catch (error) {
            structures_1.Logger.error('Error reprocessing string:', error);
            return str;
        }
    }

    /**
     * Executa o código completo desde o início
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
     * Cria um contexto completo para execução desde o início
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
            variables: originalCtx.keywords() || {},
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
            fullExecution: true, // Nova opção para execução completa
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
        fullExecution: true // Nova opção habilitada por padrão
    };

    static getLetVariablesAsJson(ctx) {
    try {
        // Resgata todas as keywords/variáveis do contexto
        const keywords = ctx.keywords();
        
        // Se não há keywords, retorna objeto vazio
        if (!keywords || typeof keywords !== 'object') {
            structures_1.Logger.debug('No keywords found in context');
            return {};
        }
        
        // Filtra apenas as variáveis $let (ou todas se preferir)
        const letVariables = {};
        
        for (const [key, value] of Object.entries(keywords)) {
            // Considera todas as variáveis como válidas
            // Se quiser filtrar apenas as criadas com $let, pode adicionar lógica aqui
            letVariables[key] = value;
        }
        
        structures_1.Logger.debug(`Retrieved ${Object.keys(letVariables).length} variables:`, letVariables);
        
        return letVariables;
    }
    catch (error) {
        structures_1.Logger.error('Error retrieving $let variables:', error);
        return {};
    }
}

static getLetVariablesAsJsonString(ctx) {
    try {
        const variables = this.getLetVariablesAsJson(ctx);
        return JSON.stringify(variables, null, 2);
    }
    catch (error) {
        structures_1.Logger.error('Error converting variables to JSON string:', error);
        return '{}';
    }
}

static getLetVariable(ctx, varName) {
    try {
        const keywords = ctx.keywords();
        
        if (!keywords || typeof keywords !== 'object') {
            return undefined;
        }
        
        return keywords[varName];
    }
    catch (error) {
        structures_1.Logger.error(`Error retrieving variable '${varName}':`, error);
        return undefined;
    }
}

static getCtx() {
    return ctx
}
}

exports.Interpreter = Interpreter;
