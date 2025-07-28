"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Interpreter = void 0;
const { getCurves } = require("crypto");
const structures_1 = require("../structures");
const Compiler_1 = require("./Compiler");

class Interpreter {
    static async run(raw) {
        const ctx = raw instanceof structures_1.Context ? raw : new structures_1.Context(raw);
        const runtime = ctx.runtime;

        // Debug inicial - CRÍTICO
        structures_1.Logger.debug('=== RUN START ===', {
            totalVars: Object.keys(ctx.keywords()).length,
            vars: ctx.keywords()
        });

        // CORREÇÃO: Agora só configura o interceptor (sem capturar variáveis)
        this.setupContainerInterceptor(ctx);

        // Debug após interceptor
        structures_1.Logger.debug('=== AFTER INTERCEPTOR ===', {
            totalVars: Object.keys(ctx.keywords()).length,
            vars: ctx.keywords()
        });
        
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
                    
                    // Debug antes de cada função
                    structures_1.Logger.debug(`=== BEFORE FUNCTION ${i} (${fn.name}) ===`, {
                        totalVars: Object.keys(ctx.keywords()).length,
                        vars: ctx.keywords()
                    });
                    
                    const rt = await fn.execute(ctx);
                    
                    let processedValue = (!rt.success && !ctx.handleNotSuccess(fn, rt)) ? ctx["error"]() : rt.value;
                    
                    
                    this.updateInterceptorKeywords(ctx);


                    // Debug após execução da função
                    structures_1.Logger.debug(`=== AFTER FUNCTION ${i} (${fn.name}) ===`, {
                        success: rt.success,
                        totalVars: Object.keys(ctx.keywords()).length,
                        vars: ctx.keywords(),
                        result: processedValue
                    });
                    
                    if (!rt.success && this.shouldRetryWithFullExecution(processedValue, fn, ctx)) {
                        structures_1.Logger.debug(`Function ${fn.name} failed, attempting full code execution`);
                        
                        try {
                            const fullExecutionResult = await this.executeFullCodeForFailedFunction(ctx, fn, i);
                            if (fullExecutionResult !== null) {
                                processedValue = fullExecutionResult;
                            }
                        } catch (fullExecError) {
                            structures_1.Logger.debug(`Full execution failed for ${fn.name}:`, fullExecError);
                        }
                    }
                    else if (rt.success && processedValue != null) {
                        processedValue = await this.handleReprocessing(processedValue, ctx, fn);
                    }
                    
                    args[i] = processedValue;
                    
                    // Debug após processamento completo
                    structures_1.Logger.debug(`=== AFTER PROCESSING ${i} ===`, {
                        totalVars: Object.keys(ctx.keywords()).length,
                        vars: ctx.keywords()
                    });
                }
            }
            catch (err) {
                if (err instanceof Error)
                    structures_1.Logger.debug(err);
                else if (err instanceof structures_1.Return) {
                    if (err.return)
                        return err.value;
                }
                return null;
            }
            
            content = runtime.data.resolve(args);
            
            // Debug após resolve
            structures_1.Logger.debug('=== AFTER RESOLVE ===', {
                totalVars: Object.keys(ctx.keywords()).length,
                vars: ctx.keywords(),
                content: content
            });
            
            if (content != null) {
                content = await this.handleReprocessing(content, ctx, null, true);
            }
        }

        if (!runtime.doNotSend) {
            this.updateInterceptorKeywords(ctx);

            // Debug antes do send
            structures_1.Logger.debug('=== BEFORE SEND ===', {
                totalVars: Object.keys(ctx.keywords()).length,
                vars: ctx.keywords()
            });

            if (content && typeof content === 'string') {
                // Processa $get uma última vez antes de definir no container
                content = content.replace(/\$get\[(.+?)\]/g, (match, key) => {
                    const value = ctx.keywords()[key];
                    if (value !== undefined) {
                        return String(value);
                    }
                    return match;
                });
                
                if (this.containsFunctionPatterns(content)) {
                    content = await this.handleReprocessing(content, ctx, null, true);
                }
            }
            
            ctx.container.content = content;
            
            // Debug final
            structures_1.Logger.debug('=== FINAL BEFORE CONTAINER SEND ===', {
                totalVars: Object.keys(ctx.keywords()).length,
                vars: ctx.keywords()
            });
            
            await this.reprocessContainer(ctx);
            await ctx.container.send(runtime.obj);
        }
        
        return content;
    }

    static debugVariableState(ctx, location) {
        const vars = ctx.getVars();
        const varCount = Object.keys(vars).length;
        
        structures_1.Logger.debug(`Debug Variables at ${location}:`, {
            location,
            varCount,
            vars: JSON.stringify(vars, null, 2),
            containerExists: !!ctx.container,
            runtimeExists: !!ctx.runtime,
            contextId: ctx.id || 'no-id'
        });
    }

 static setupContainerInterceptor(ctx, update = false, keywords = null) {
    if (!ctx.container) return;
    
    // Se é apenas um update, atualiza as keywords e retorna
    if (update && ctx.container._intercepted) {
        if (keywords && ctx.container._updateKeywords) {
            structures_1.Logger.debug('Updating interceptor keywords:', keywords);
            ctx.container._updateKeywords(keywords);
        }
        return;
    }
    
    // Se já foi interceptado e não é update, não faz nada
    if (ctx.container._intercepted) return;
    
    ctx.container._intercepted = true;
    const originalSend = ctx.container.send.bind(ctx.container);

    // Salva a referência do contexto para garantir acesso às variáveis
    ctx.container._savedCtx = ctx;
    
    // Função para atualizar keywords dinamicamente
    let currentKeywords = keywords || {};
    ctx.container._updateKeywords = function(newKeywords) {
        currentKeywords = newKeywords || {};
        structures_1.Logger.debug('Keywords updated in interceptor:', currentKeywords);
    };

    ctx.container.send = async function(obj, content, messageID) {
        try {
            // Usa múltiplas estratégias para pegar as keywords
            let latestKeywords = {};
            
            // Estratégia 1: Usar currentKeywords (atualizadas via update)
            if (currentKeywords && Object.keys(currentKeywords).length > 0) {
                latestKeywords = currentKeywords;
                structures_1.Logger.debug('Using currentKeywords:', latestKeywords);
            }
            // Estratégia 2: Usar ctx salvo
            else if (this._savedCtx && typeof this._savedCtx.keywords === 'function') {
                latestKeywords = this._savedCtx.keywords();
                structures_1.Logger.debug('Using savedCtx keywords:', latestKeywords);
            }
            // Estratégia 3: Usar ctx original (fallback)
            else if (ctx && typeof ctx.keywords === 'function') {
                latestKeywords = ctx.keywords();
                structures_1.Logger.debug('Using original ctx keywords:', latestKeywords);
            }
            
            // Debug das variáveis ANTES de qualquer processamento
            structures_1.Logger.debug('Container send - latest variables:', latestKeywords);
            structures_1.Logger.debug('Container send - currentKeywords backup:', currentKeywords);
            
            // Se ainda não tem keywords, tenta todas as fontes possíveis
            if (Object.keys(latestKeywords).length === 0) {
                structures_1.Logger.debug('NO KEYWORDS FOUND! Debugging context...');
                structures_1.Logger.debug('ctx exists:', !!ctx);
                structures_1.Logger.debug('ctx.keywords exists:', !!(ctx && ctx.keywords));
                structures_1.Logger.debug('savedCtx exists:', !!this._savedCtx);
                structures_1.Logger.debug('savedCtx.keywords exists:', !!(this._savedCtx && this._savedCtx.keywords));
                structures_1.Logger.debug('currentKeywords:', currentKeywords);
                
                // Usa as currentKeywords como último recurso
                if (currentKeywords && Object.keys(currentKeywords).length > 0) {
                    latestKeywords = currentKeywords;
                    structures_1.Logger.debug('Using currentKeywords as fallback');
                }
            }
            
            // Processa $get no content do container
            if (this.content && typeof this.content === 'string') {
                this.content = this.content.replace(/\$get\[(.+?)\]/g, (match, key) => {
                    const value = latestKeywords[key];
                    if (value !== undefined) {
                        structures_1.Logger.debug(`Replaced $get[${key}] with: ${value}`);
                        return String(value);
                    }
                    structures_1.Logger.debug(`Variable ${key} not found for $get in:`, Object.keys(latestKeywords));
                    return match;
                });
            }

            // Processa $get no content passado como parâmetro
            if (content && typeof content === 'string') {
                content = content.replace(/\$get\[(.+?)\]/g, (match, key) => {
                    const value = latestKeywords[key];
                    if (value !== undefined) {
                        structures_1.Logger.debug(`Replaced $get[${key}] with: ${value}`);
                        return String(value);
                    }
                    structures_1.Logger.debug(`Variable ${key} not found for $get in:`, Object.keys(latestKeywords));
                    return match;
                });
            }

            // Reprocessamento adicional se necessário
            if (this.content && typeof this.content === 'string' && Interpreter.containsFunctionPatterns(this.content)) {
                this.content = await Interpreter.handleReprocessing(this.content, this._savedCtx || ctx);
            }
            
            if (content && typeof content === 'string' && Interpreter.containsFunctionPatterns(content)) {
                content = await Interpreter.handleReprocessing(content, this._savedCtx || ctx);
            }

            // Debug final das variáveis
            structures_1.Logger.debug('Container send - final variables:', latestKeywords);

            await Interpreter.reprocessContainer(this._savedCtx || ctx);
            
            return await originalSend(obj, content, messageID);
        } catch (error) {
            structures_1.Logger.debug('Error in container send interceptor:', error);
            return await originalSend(obj, content, messageID);
        }
    };
    
    this.setupContentPropertyInterceptor(ctx);
}


   static setupContentPropertyInterceptor(ctx) {
        if (!ctx.container || ctx.container._contentIntercepted) return;
        
        ctx.container._contentIntercepted = true;
        
        // Guarda o valor atual
        let _content = ctx.container.content;
        
        // Define um getter/setter para interceptar mudanças
        Object.defineProperty(ctx.container, 'content', {
            get() {
                return _content;
            },
            set(value) {
                // Se o valor é uma string que precisa de reprocessamento,
                // agenda o reprocessamento para o próximo tick
                if (value && typeof value === 'string' && Interpreter.containsFunctionPatterns(value)) {
                    // Agenda reprocessamento assíncrono
                    process.nextTick(async () => {
                        try {
                            // CORREÇÃO: Processa $get com variáveis atuais
                            let processedValue = value.replace(/\$get\[(.+?)\]/g, (match, key) => {
                                const currentKeywords = ctx.keywords(); // ✅ OBTÉM DINAMICAMENTE
                                const varValue = currentKeywords[key];
                                if (varValue !== undefined) {
                                    return String(varValue);
                                }
                                return match;
                            });
                            
                            const reprocessed = await Interpreter.handleReprocessing(processedValue, ctx);
                            if (reprocessed !== value) {
                                _content = reprocessed;
                            }
                        } catch (error) {
                            structures_1.Logger.debug('Error in content property interceptor:', error);
                        }
                    });
                }
                _content = value;
            },
            configurable: true,
            enumerable: true
        });
    }


/**
 * Função para atualizar as keywords do interceptor durante a execução
 * @param {Context} ctx - Contexto da execução
 */
static updateInterceptorKeywords(ctx) {
    if (!ctx.container || !ctx.container._intercepted) {
        structures_1.Logger.debug('Tentando atualizar keywords mas interceptor não existe');
        return;
    }
    
    const currentKeywords = ctx.keywords();
    structures_1.Logger.debug('Updating interceptor with new keywords:', currentKeywords);
    
    // Atualiza usando o método update
    this.setupContainerInterceptor(ctx, true, currentKeywords);
}

    // CORREÇÃO: Função auxiliar para obter variáveis atuais
    static getCurrentKeywords(ctx) {
        try {
            return ctx.keywords() || {};
        } catch (error) {
            structures_1.Logger.debug('Error getting current keywords:', error);
            return {};
        }
    }

static sendProcess(ctx) {
    if (!ctx.container || ctx.container._intercepted) return;
    
    ctx.container._intercepted = true;
    const originalSend = ctx.container.send.bind(ctx.container);

    let kw = ctx.keywords();
    
    ctx.container.send = async function(obj, content, messageID) {
        try {
            
            // Debug das variáveis ANTES de qualquer processamento
            structures_1.Logger.debug('Container send - variables before:', kw);
            
            // CORREÇÃO: Processa $get SEM alterar contexto
            if (this.content && typeof this.content === 'string') {
                this.content = this.content.replace(/\$get\[(.+?)\]/g, (match, key) => {
                    const value = kw[key];
                    if (value !== undefined) {
                        structures_1.Logger.debug(`Replaced $get[${key}] with: ${value}`);
                        return String(value);
                    }
                    structures_1.Logger.debug(`Variable ${key} not found for $get`);
                    return match;
                });
            }

            if (content && typeof content === 'string') {
                content = content.replace(/\$get\[(.+?)\]/g, (match, key) => {
                    const value = kw[key];
                    if (value !== undefined) {
                        structures_1.Logger.debug(`Replaced $get[${key}] with: ${value}`);
                        return String(value);
                    }
                    structures_1.Logger.debug(`Variable ${key} not found for $get`);
                    return match;
                });
            }

            // Debug das variáveis APÓS processamento $get
            structures_1.Logger.debug('Container send - variables after $get:', kw);

            // Reprocessamento adicional SEM criar novo contexto
            if (this.content && typeof this.content === 'string' && Interpreter.containsFunctionPatterns(this.content)) {
                this.content = await Interpreter.handleReprocessing(this.content, ctx);
            }
            
            if (content && typeof content === 'string' && Interpreter.containsFunctionPatterns(content)) {
                content = await Interpreter.handleReprocessing(content, ctx);
            }

            // Debug final das variáveis
            structures_1.Logger.debug('Container send - variables final:', kw);

            await Interpreter.reprocessContainer(ctx);
            
            return await originalSend(obj, content, messageID);
        } catch (error) {
            structures_1.Logger.debug('Error in container send interceptor:', error);
            return await originalSend(obj, content, messageID);
        }
    };
    
    this.setupContentPropertyInterceptor(ctx);
}

  /**
     * Reprocessa todos os elementos do container (embeds, componentes, etc.)
     */

  static async reprocessContainer(ctx) {
    try {
        const container = ctx.container;
        if (!container) return;

        if (container.send && container.send.length > 0) {
            this.sendProcess(ctx);
        }
        
        // Reprocessa embeds com múltiplas passadas até não haver mais funções
        if (container.embeds && container.embeds.length > 0) {
            for (let i = 0; i < container.embeds.length; i++) {
                try {
                    container.embeds[i] = await this.reprocessEmbedCompletely(container.embeds[i], ctx);
                } catch (error) {
                    structures_1.Logger.warn(`Error reprocessing embed ${i}:`, error);
                }
            }
        }
        
        // Reprocessa componentes com timeout de segurança
        if (container.components && container.components.length > 0) {
            const componentPromises = container.components.map(async (component, i) => {
                try {
                    return await Promise.race([
                        this.reprocessComponent(component, ctx),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Component timeout')), 5000)
                        )
                    ]);
                } catch (error) {
                    structures_1.Logger.warn(`Error reprocessing component ${i}:`, error);
                    return component; // Retorna original em caso de erro
                }
            });
            
            container.components = await Promise.all(componentPromises);
        }
        
        // Reprocessa stickers de forma simples
        if (container.stickers && container.stickers.length > 0) {
            for (let i = 0; i < container.stickers.length; i++) {
                if (typeof container.stickers[i] === 'string') {
                    try {
                        // Apenas $get, sem reprocessamento complexo
                        container.stickers[i] = container.stickers[i].replace(/\$get\[(.+?)\]/g, (match, key) => {
                            const value = ctx.keywords()[key];
                            return value !== undefined ? String(value) : match;
                        });
                    } catch (error) {
                        structures_1.Logger.warn(`Error processing sticker ${i}:`, error);
                    }
                }
            }
        }
        
        // Reprocessa files com timeout
        if (container.files && container.files.length > 0) {
            const filePromises = container.files.map(async (file, i) => {
                try {
                    return await Promise.race([
                        this.reprocessFile(file, ctx),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('File timeout')), 3000)
                        )
                    ]);
                } catch (error) {
                    structures_1.Logger.warn(`Error reprocessing file ${i}:`, error);
                    return file;
                }
            });
            
            container.files = await Promise.all(filePromises);
        }
        
        // Reprocessa modal com timeout
        if (container.modal) {
            try {
                container.modal = await Promise.race([
                    this.reprocessModal(container.modal, ctx),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Modal timeout')), 5000)
                    )
                ]);
            } catch (error) {
                structures_1.Logger.debug('Error reprocessing modal:', error);
            }
        }
        
        // Reprocessa poll com timeout
        if (container.poll) {
            try {
                container.poll = await Promise.race([
                    this.reprocessPoll(container.poll, ctx),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Poll timeout')), 3000)
                    )
                ]);
            } catch (error) {
                structures_1.Logger.debug('Error reprocessing poll:', error);
            }
        }
        
        // Reprocessa outros campos de texto simples
        const simpleTextFields = ['username', 'threadName'];
        for (const field of simpleTextFields) {
            if (container[field] && typeof container[field] === 'string') {
                try {
                    container[field] = container[field].replace(/\$get\[(.+?)\]/g, (match, key) => {
                        const value = ctx.keywords()[key];
                        return value !== undefined ? String(value) : match;
                    });
                } catch (error) {
                    structures_1.Logger.warn(`Error processing ${field}:`, error);
                }
            }
        }
        
   } catch (error) {
        structures_1.Logger.debug('Error reprocessing container:', error);
    }
}

/**
 * Reprocessa um embed completamente até não haver mais funções para processar
 */
static async reprocessEmbedCompletely(embed, ctx, maxIterations = 10) {
    try {
        if (!embed || typeof embed.toJSON !== 'function') return embed;
        
        let currentEmbed = embed;
        let iteration = 0;
        
        while (iteration < maxIterations) {
            const embedData = currentEmbed.toJSON();
            const reprocessedData = await this.reprocessEmbedData(embedData, ctx);
            
            // Verifica se ainda há funções não processadas
            const hasUnprocessedFunctions = this.hasUnprocessedFunctions(reprocessedData);
            
            // Reconstrói o embed com os dados reprocessados
            currentEmbed = this.buildEmbedFromData(reprocessedData);
            
            iteration++;
            
            // Se não há mais funções para processar, para o loop
            if (!hasUnprocessedFunctions) {
                structures_1.Logger.debug(`Embed processed completely in ${iteration} iteration(s)`);
                break;
            }
            
            // Log para debug em caso de muitas iterações
            if (iteration >= maxIterations - 1) {
                structures_1.Logger.warn(`Embed reached maximum iterations (${maxIterations}), stopping to prevent infinite loop`);
            }
        }
        
        return currentEmbed;
        
    } catch (error) {
        structures_1.Logger.debug('Error reprocessing embed completely:', error);
        return embed;
    }
}

/**
 * Verifica se ainda existem funções não processadas no embed
 */
static hasUnprocessedFunctions(data) {
    // Regex geral que captura qualquer função $functionName[...] ou $functionName
    const generalFunctionPattern = /\$[a-zA-Z0-9]+(?:\[.+?\])?/g;
    
    return this.checkDataForPattern(data, generalFunctionPattern);
}

/**
 * Verifica recursivamente se há padrão não processado nos dados
 */
static checkDataForPattern(data, pattern) {
    if (typeof data === 'string') {
        return pattern.test(data);
    }
    
    if (Array.isArray(data)) {
        return data.some(item => this.checkDataForPattern(item, pattern));
    }
    
    if (data && typeof data === 'object') {
        return Object.values(data).some(value => this.checkDataForPattern(value, pattern));
    }
    
    return false;
}

/**
 * Constrói um embed a partir dos dados processados
 */
static buildEmbedFromData(reprocessedData) {
    const newEmbed = new (require('discord.js').EmbedBuilder)();
    
    if (reprocessedData.title) newEmbed.setTitle(reprocessedData.title);
    if (reprocessedData.description) newEmbed.setDescription(reprocessedData.description);
    if (reprocessedData.url) newEmbed.setURL(reprocessedData.url);
    if (reprocessedData.color !== undefined) newEmbed.setColor(reprocessedData.color);
    if (reprocessedData.footer) newEmbed.setFooter(reprocessedData.footer);
    if (reprocessedData.image) newEmbed.setImage(reprocessedData.image.url);
    if (reprocessedData.thumbnail) newEmbed.setThumbnail(reprocessedData.thumbnail.url);
    if (reprocessedData.author) newEmbed.setAuthor(reprocessedData.author);
    if (reprocessedData.fields && reprocessedData.fields.length > 0) {
        newEmbed.addFields(reprocessedData.fields);
    }
    if (reprocessedData.timestamp) {
        if (!reprocessedData.fields) {
        newEmbed.setTimestamp(reprocessedData.timestamp);
        } else {
            newEmbed.setTimestamp();
        }
    }
    
    return newEmbed;
}

/**
 * Reprocessa dados do embed recursivamente com processamento aprimorado
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

static async processWithExistingSystem(text, ctx) {
    try {
        // Aqui você deve chamar o sistema de processamento já existente do seu bot
        // Por exemplo, se você tem uma função como ctx.processText() ou similar
        
        // Exemplo de implementação genérica:
        if (ctx.processText && typeof ctx.processText === 'function') {
            return await ctx.handleReprocessing(text, ctx);
        }
        
        // Se não há sistema específico, usa processamento básico
        return text.replace(/\$get\[(.+?)\]/g, (match, key) => {
            const value = ctx.keywords()[key];
            return value !== undefined ? String(value) : match;
        });
        
    } catch (error) {
        structures_1.Logger.debug('Error processing with existing system:', error);
        return text;
    }
}


    static async reprocessComponent(component, ctx) {
    
    try {
        if (!component || typeof component !== 'object') return component;

        // Cria uma cópia profunda para evitar mutações
        let reprocessedComponent = JSON.parse(JSON.stringify(component));
        
        // Normaliza a estrutura do componente
        // Se tem 'data' no primeiro nível, é uma estrutura aninhada
        if (reprocessedComponent.data && typeof reprocessedComponent.data === 'object') {
            // Move o type do data para o nível principal se não existir
            if (reprocessedComponent.data.type && !reprocessedComponent.type) {
                reprocessedComponent.type = reprocessedComponent.data.type;
            }
            // Remove o data após normalizar
            delete reprocessedComponent.data;
        }
        
        // Garante que ActionRows tenham type = 1
        if (reprocessedComponent.components && Array.isArray(reprocessedComponent.components)) {
            if (!reprocessedComponent.type) {
                reprocessedComponent.type = 1; // ActionRow
            }
            
            // Processa cada componente dentro do ActionRow
            const newComponents = [];
            for (const subComponent of reprocessedComponent.components) {
                const processed = await this.processIndividualComponent(subComponent, ctx);
                newComponents.push(processed);
            }
            reprocessedComponent.components = newComponents;
        } else {
            // Se não é ActionRow, processa como componente individual
            reprocessedComponent = await this.processIndividualComponent(reprocessedComponent, ctx);
        }
        
        return reprocessedComponent;
        
    } catch (error) {
        structures_1.Logger.warn('Error reprocessing component:', error);
        return component; // Retorna original em caso de erro
    }
}

static async processIndividualComponent(component, ctx) {
    if (!component || typeof component !== 'object') return component;
    
    let processedComponent = { ...component };
    
    // Lista de propriedades de texto que podem conter variáveis e funções
    const textProperties = ['label', 'placeholder', 'custom_id', 'url', 'value'];
    
    // Processa propriedades de texto do componente
    for (const prop of textProperties) {
        if (processedComponent[prop] && typeof processedComponent[prop] === 'string') {
            try {
                processedComponent[prop] = await this.processTextProperty(processedComponent[prop], ctx, prop);
            } catch (error) {
                structures_1.Logger.warn(`Error processing component property ${prop}:`, error);
                // Mantém o valor original em caso de erro
            }
        }
    }
    
    // Para select menus, processa as opções
    if (processedComponent.options && Array.isArray(processedComponent.options)) {
        const newOptions = [];
        for (const option of processedComponent.options) {
            if (!option || typeof option !== 'object') {
                newOptions.push(option);
                continue;
            }
            
            const newOption = { ...option };
            const optionProps = ['label', 'description', 'value'];
            
            for (const prop of optionProps) {
                if (newOption[prop] && typeof newOption[prop] === 'string') {
                    try {
                        newOption[prop] = await this.processTextProperty(newOption[prop], ctx, `option.${prop}`);
                    } catch (error) {
                        structures_1.Logger.warn(`Error processing option property ${prop}:`, error);
                    }
                }
            }
            newOptions.push(newOption);
        }
        processedComponent.options = newOptions;
    }
    
    return processedComponent;
}

static async processTextProperty(text, ctx, propertyName) {
    let processed = text;
    
    // Processa $get primeiro
    processed = processed.replace(/\$get\[(.+?)\]/g, (match, key) => {
        const value = ctx.keywords()[key];
        if (value !== undefined) {
            structures_1.Logger.debug(`Replaced $get[${key}] with: ${value} in ${propertyName}`);
            return String(value);
        }
        structures_1.Logger.warn(`Variable ${key} not found for $get in ${propertyName}`);
        return match;
    });
    
    // Processa funções se existirem
    if (this.containsFunctionPatterns(processed)) {
        structures_1.Logger.debug(`Processing functions in ${propertyName}: ${processed}`);
        processed = await this.handleReprocessing(processed, ctx);
        structures_1.Logger.debug(`Result after processing ${propertyName}: ${processed}`);
    }
    
    return processed;
}

/**
 * Reprocessa um arquivo - VERSÃO CORRIGIDA
 */
static async reprocessFile(file, ctx) {
    try {
        if (!file || typeof file !== 'object') return file;
        
        const reprocessedFile = { ...file };
        
        // Processa apenas propriedades de string seguras
        const textProperties = ['name', 'description'];
        
        for (const prop of textProperties) {
            if (file[prop] && typeof file[prop] === 'string') {
                try {
                    // Processa $get primeiro
                    let processed = file[prop].replace(/\$get\[(.+?)\]/g, (match, key) => {
                        const value = ctx.keywords()[key];
                        return value !== undefined ? String(value) : match;
                    });
                    
                    // Reprocessa apenas se não for muito complexo
                    if (this.containsFunctionPatterns(processed) && processed.length < 500) {
                        processed = await this.handleReprocessing(processed, ctx);
                    }
                    
                    reprocessedFile[prop] = processed;
                } catch (error) {
                    structures_1.Logger.warn(`Error processing file property ${prop}:`, error);
                    reprocessedFile[prop] = file[prop];
                }
            }
        }
        
        return reprocessedFile;
    } catch (error) {
        structures_1.Logger.debug('Error reprocessing file:', error);
        return file;
    }
}

/**
 * Reprocessa um modal - VERSÃO CORRIGIDA
 */
static async reprocessModal(modal, ctx) {
    try {
        if (!modal || typeof modal !== 'object') return modal;
        
        const reprocessedModal = { ...modal };
        
        // Processa propriedades de texto básicas
        if (modal.title && typeof modal.title === 'string') {
            try {
                let processed = modal.title.replace(/\$get\[(.+?)\]/g, (match, key) => {
                    const value = ctx.keywords()[key];
                    return value !== undefined ? String(value) : match;
                });
                
                if (this.containsFunctionPatterns(processed) && processed.length < 500) {
                    processed = await this.handleReprocessing(processed, ctx);
                }
                
                reprocessedModal.title = processed;
            } catch (error) {
                structures_1.Logger.debug('Error processing modal title:', error);
                reprocessedModal.title = modal.title;
            }
        }
        
        if (modal.custom_id && typeof modal.custom_id === 'string') {
            try {
                let processed = modal.custom_id.replace(/\$get\[(.+?)\]/g, (match, key) => {
                    const value = ctx.keywords()[key];
                    return value !== undefined ? String(value) : match;
                });
                
                reprocessedModal.custom_id = processed;
            } catch (error) {
                structures_1.Logger.debug('Error processing modal custom_id:', error);
                reprocessedModal.custom_id = modal.custom_id;
            }
        }
        
        // Reprocessa componentes do modal de forma mais segura
        if (modal.components[0].data && Array.isArray(modal.components[0].data)) {
            const newComponents = [];
            for (const component of modal.components[0].data) {
                try {
                    const processed = await this.reprocessComponent(component, ctx);
                    newComponents.push(processed);
                } catch (error) {
                    structures_1.Logger.debug('Error processing modal component:', error);
                    newComponents.push(component); // Mantém original em caso de erro
                }
            }
            reprocessedModal.components[0].data = newComponents;
        }
        
        return reprocessedModal;
    } catch (error) {
        structures_1.Logger.debug('Error reprocessing modal:', error);
        return modal;
    }
}

/**
 * Reprocessa uma poll - VERSÃO CORRIGIDA
 */
static async reprocessPoll(poll, ctx) {
    try {
        if (!poll || typeof poll !== 'object') return poll;
        
        const reprocessedPoll = { ...poll };
        
        // Processa a pergunta da poll
        if (poll.question && typeof poll.question === 'object' && poll.question.text) {
            try {
                let processed = poll.question.text.replace(/\$get\[(.+?)\]/g, (match, key) => {
                    const value = ctx.keywords()[key];
                    return value !== undefined ? String(value) : match;
                });
                
                if (this.containsFunctionPatterns(processed) && processed.length < 500) {
                    processed = await this.handleReprocessing(processed, ctx);
                }
                
                reprocessedPoll.question = {
                    ...poll.question,
                    text: processed
                };
            } catch (error) {
                structures_1.Logger.debug('Error processing poll question:', error);
                reprocessedPoll.question = poll.question;
            }
        }
        
        // Processa as respostas da poll
        if (poll.answers && Array.isArray(poll.answers)) {
            const newAnswers = [];
            for (const answer of poll.answers) {
                if (!answer || typeof answer !== 'object') {
                    newAnswers.push(answer);
                    continue;
                }
                
                const newAnswer = { ...answer };
                if (answer.text && typeof answer.text === 'string') {
                    try {
                        let processed = answer.text.replace(/\$get\[(.+?)\]/g, (match, key) => {
                            const value = ctx.keywords()[key];
                            return value !== undefined ? String(value) : match;
                        });
                        
                        if (this.containsFunctionPatterns(processed) && processed.length < 500) {
                            processed = await this.handleReprocessing(processed, ctx);
                        }
                        
                        newAnswer.text = processed;
                    } catch (error) {
                        structures_1.Logger.debug('Error processing poll answer:', error);
                        newAnswer.text = answer.text;
                    }
                }
                newAnswers.push(newAnswer);
            }
            reprocessedPoll.answers = newAnswers;
        }
        
        return reprocessedPoll;
    } catch (error) {
        structures_1.Logger.debug('Error reprocessing poll:', error);
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
            structures_1.Logger.debug('Error in executeFullCodeForFailedFunction:', error);
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
            structures_1.Logger.debug('Error in runFullExecutionForFailure:', error);
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
        if (!this.needsReprocessing(value)) {
            return value;
        }

        // Debug das variáveis no início do reprocessamento
        structures_1.Logger.debug(`Reprocessing ${typeof value} - variables available:`, ctx.keywords());

        // Se é string simples com apenas $get, processa diretamente
        if (typeof value === 'string' && /^\$get\[.+\]$/.test(value.trim())) {
            const match = value.match(/\$get\[(.+?)\]/);
            if (match) {
                const varValue = ctx.keywords()[match[1]];
                if (varValue !== undefined) {
                    structures_1.Logger.debug(`Direct $get replacement: ${match[1]} = ${varValue}`);
                    return String(varValue);
                }
            }
        }

        const reprocessingInfo = this.getReprocessingInfo(value, sourceFunction, isFinalContent);
        
        if (reprocessingInfo.shouldReprocess) {
            structures_1.Logger.debug(`Reprocessing ${reprocessingInfo.type} from ${sourceFunction?.name || 'final content'}`);
            
            const reprocessed = await this.reprocessValue(value, ctx, reprocessingInfo);
            
            if (reprocessed !== value) {
                structures_1.Logger.debug(`Reprocessing successful for ${reprocessingInfo.type}`);
                
                // Debug das variáveis após reprocessamento
                structures_1.Logger.debug(`After reprocessing - variables:`, ctx.keywords());
                
                return reprocessed;
            }
        }

        
        return value;
    }
    catch (error) {
        structures_1.Logger.debug('Error during reprocessing:', error);
        return value;
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


    
    static isJsonString(str) {
    if (typeof str !== 'string') return false;
    const trimmed = str.trim();
    if (!((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
          (trimmed.startsWith('[') && trimmed.endsWith(']')))) {
        return false;
    }
    try {
        JSON.parse(trimmed);
        return true;
    } catch {
        return false;
    }
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
        // Debug inicial
        structures_1.Logger.debug('reprocessString - initial variables:', ctx.keywords());
        
        // Primeiro processa $get diretamente
        let processed = str.replace(/\$get\[(.+?)\]/g, (match, key) => {
            const value = ctx.keywords()[key];
            if (value !== undefined) {
                structures_1.Logger.debug(`Replaced $get[${key}] with: ${value}`);
                return String(value);
            }
            structures_1.Logger.debug(`Variable ${key} not found for $get`);
            return match;
        });

        // Debug após $get
        structures_1.Logger.debug('reprocessString - after $get processing:', processed);

        // Se ainda há funções para processar E não é JSON
        if (this.containsFunctionPatterns(processed) && !this.isJsonString(processed)) {
            // Usa execução completa apenas se realmente necessário
            processed = await this.executeFromBeginning(processed, ctx);
        }

        // Debug final
        structures_1.Logger.debug('reprocessString - final result:', processed);
        structures_1.Logger.debug('reprocessString - final variables:', ctx.keywords());

        return processed;
    }
    catch (error) {
        structures_1.Logger.debug('Error reprocessing string:', error);
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
            structures_1.Logger.debug('Error in executeFromBeginning:', error);
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
                structures_1.Logger.debug('Error in full execution:', err);
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
    // ❌ ERRO ORIGINAL: Tentava fazer replace em objeto
    // ✅ CORREÇÃO: Verifica tipo antes de processar
    
    if (Array.isArray(obj)) {
        const results = [];
        for (const item of obj) {
            if (typeof item === 'string') {
                // Processa $get apenas em strings
                const processed = item.replace(/\$get\[(.+?)\]/g, (_, key) => {
                    const value = ctx.keywords()[key];
                    return value !== undefined ? String(value) : `$get[${key}]`;
                });
                results.push(await this.handleReprocessing(processed, ctx));
            } else {
                results.push(await this.handleReprocessing(item, ctx));
            }
        }
        return results;
    }
    
    if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                // Processa $get apenas em strings
                const processed = value.replace(/\$get\[(.+?)\]/g, (_, key) => {
                    const varValue = ctx.keywords()[key];
                    return varValue !== undefined ? String(varValue) : `$get[${key}]`;
                });
                result[key] = await this.handleReprocessing(processed, ctx);
            } else {
                result[key] = await this.handleReprocessing(value, ctx);
            }
        }
        return result;
    }
    
    return obj;
}

  
    /**
     * Cria um contexto completo para execução desde o início
     */
    static createFullExecutionContext(originalCtx) {
    // ❌ ERRO ORIGINAL: Estava criando contexto novo perdendo as variáveis
    // ✅ CORREÇÃO: Cria contexto que preserva TODAS as variáveis
    
    const newCtx = originalCtx
    
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
        structures_1.Logger.debug('Error retrieving $let variables:', error);
        return {};
    }
}

static getLetVariablesAsJsonString(ctx) {
    try {
        const variables = this.getLetVariablesAsJson(ctx);
        return JSON.stringify(variables, null, 2);
    }
    catch (error) {
        structures_1.Logger.debug('Error converting variables to JSON string:', error);
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
        structures_1.Logger.warn(`Error retrieving variable '${varName}':`, error);
        return undefined;
    }
}

static getCtx() {
    return ctx
}
}

exports.Interpreter = Interpreter;
