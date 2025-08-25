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

        // Simple debug without causing loops
        structures_1.Logger.debug('=== RUN START ===', {
            totalVars: Object.keys(ctx.keywords()).length
        });

        // Set up basic container processing without complex interceptors
        this.setupBasicContainerProcessing(ctx);
        
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
                    
                    structures_1.Logger.debug(`Executing function ${i}: ${fn.name}`);
                    
                    const rt = await fn.execute(ctx);
                    let processedValue = (!rt.success && !ctx.handleNotSuccess(fn, rt)) ? ctx["error"]() : rt.value;
                    
                    // Simple reprocessing - only if needed and with safety checks
                    if (rt.success && processedValue != null && typeof processedValue === 'string') {
                        processedValue = await this.safeReprocessString(processedValue, ctx, 1); // Max 1 level deep
                    }
                    
                    args[i] = processedValue;
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
            
            // Final simple reprocessing
            if (content != null && typeof content === 'string') {
                content = await this.safeReprocessString(content, ctx, 1);
            }
        }

        if (!runtime.doNotSend) {
            // Final $get processing before sending
            if (content && typeof content === 'string') {
                content = this.processGetVariables(content, ctx);
            }
            
            ctx.container.content = content;
            await this.processContainerBeforeSend(ctx);
            await ctx.container.send(runtime.obj);
        }
        
        return content;
    }

    /**
     * Safe reprocessing with depth limit to prevent infinite loops
     */
    static async safeReprocessString(str, ctx, maxDepth = 1) {
        if (maxDepth <= 0 || !str || typeof str !== 'string') {
            return str;
        }

        try {
            // First process $get variables
            let processed = this.processGetVariables(str, ctx);
            
            // Only reprocess if it contains function patterns and hasn't been processed too many times
            if (this.containsBasicFunctionPatterns(processed) && processed !== str) {
                // Simple recompilation and execution - no recursive calls
                try {
                    const compiled = Compiler_1.Compiler.compile(processed, ctx.runtime.path);
                    if (compiled.functions.length > 0 && compiled.functions.length < 10) { // Limit function count
                        const tempRuntime = { ...ctx.runtime, data: compiled, doNotSend: true };
                        const tempCtx = { ...ctx, runtime: tempRuntime };
                        
                        const args = [];
                        for (let i = 0; i < compiled.functions.length; i++) {
                            const fn = compiled.functions[i];
                            const rt = await fn.execute(tempCtx);
                            args[i] = rt.success ? rt.value : '';
                        }
                        
                        const result = compiled.resolve(args);
                        return result || processed;
                    }
                } catch (error) {
                    structures_1.Logger.debug('Error in safe reprocessing:', error);
                    return processed;
                }
            }
            
            return processed;
        } catch (error) {
            structures_1.Logger.debug('Error in safeReprocessString:', error);
            return str;
        }
    }

    /**
     * Process $get variables safely
     */
    static processGetVariables(str, ctx) {
        if (!str || typeof str !== 'string') return str;
        
        try {
            return str.replace(/\$get\[(.+?)\]/g, (match, key) => {
                try {
                    const keywords = ctx.keywords();
                    const value = keywords[key];
                    if (value !== undefined && value !== null) {
                        return String(value);
                    }
                } catch (error) {
                    structures_1.Logger.debug(`Error getting variable ${key}:`, error);
                }
                return match;
            });
        } catch (error) {
            structures_1.Logger.debug('Error processing $get variables:', error);
            return str;
        }
    }

    /**
     * Check for basic function patterns (simplified)
     */
    static containsBasicFunctionPatterns(str) {
        if (typeof str !== 'string') return false;
        return /\$[a-zA-Z_][a-zA-Z0-9_]*(?:\[.*?\])?/.test(str);
    }

    /**
     * Basic container processing without complex interceptors
     */
    static setupBasicContainerProcessing(ctx) {
        if (!ctx.container || ctx.container._basicProcessingSetup) return;
        
        ctx.container._basicProcessingSetup = true;
        
        // Store original send method
        const originalSend = ctx.container.send.bind(ctx.container);
        
        ctx.container.send = async function(obj, content, messageID) {
            try {
                // Process container content
                if (this.content && typeof this.content === 'string') {
                    this.content = Interpreter.processGetVariables(this.content, ctx);
                }
                
                // Process parameter content
                if (content && typeof content === 'string') {
                    content = Interpreter.processGetVariables(content, ctx);
                }
                
                return await originalSend(obj, content, messageID);
            } catch (error) {
                structures_1.Logger.debug('Error in container send:', error);
                return await originalSend(obj, content, messageID);
            }
        };
    }

    /**
     * Process container elements before sending
     */
    static async processContainerBeforeSend(ctx) {
        if (!ctx.container) return;
        
        try {
            // Process embeds
            if (ctx.container.embeds && Array.isArray(ctx.container.embeds)) {
                for (let i = 0; i < ctx.container.embeds.length; i++) {
                    ctx.container.embeds[i] = this.processEmbed(ctx.container.embeds[i], ctx);
                }
            }
            
            // Process components
            if (ctx.container.components && Array.isArray(ctx.container.components)) {
                for (let i = 0; i < ctx.container.components.length; i++) {
                    ctx.container.components[i] = this.processComponent(ctx.container.components[i], ctx);
                }
            }
            
            // Process simple text fields
            const textFields = ['username', 'threadName'];
            for (const field of textFields) {
                if (ctx.container[field] && typeof ctx.container[field] === 'string') {
                    ctx.container[field] = this.processGetVariables(ctx.container[field], ctx);
                }
            }
            
        } catch (error) {
            structures_1.Logger.debug('Error processing container before send:', error);
        }
    }

    /**
     * Simple embed processing
     */
    static processEmbed(embed, ctx) {
        if (!embed || typeof embed.toJSON !== 'function') return embed;
        
        try {
            const embedData = embed.toJSON();
            const processedData = this.processEmbedData(embedData, ctx);
            return this.buildEmbedFromData(processedData);
        } catch (error) {
            structures_1.Logger.debug('Error processing embed:', error);
            return embed;
        }
    }

    /**
     * Process embed data recursively but safely
     */
    static processEmbedData(data, ctx) {
        if (typeof data === 'string') {
            return this.processGetVariables(data, ctx);
        }
        
        if (Array.isArray(data)) {
            return data.map(item => this.processEmbedData(item, ctx));
        }
        
        if (data && typeof data === 'object') {
            const result = {};
            for (const [key, value] of Object.entries(data)) {
                result[key] = this.processEmbedData(value, ctx);
            }
            return result;
        }
        
        return data;
    }

    /**
     * Build embed from processed data
     */
    static buildEmbedFromData(data) {
        const newEmbed = new (require('discord.js').EmbedBuilder)();
        
        if (data.title) newEmbed.setTitle(data.title);
        if (data.description) newEmbed.setDescription(data.description);
        if (data.url) newEmbed.setURL(data.url);
        if (data.color !== undefined) newEmbed.setColor(data.color);
        if (data.footer) newEmbed.setFooter(data.footer);
        if (data.image) newEmbed.setImage(data.image.url);
        if (data.thumbnail) newEmbed.setThumbnail(data.thumbnail.url);
        if (data.author) newEmbed.setAuthor(data.author);
        if (data.fields && data.fields.length > 0) {
            newEmbed.addFields(data.fields);
        }
        if (data.timestamp) {
            newEmbed.setTimestamp(data.timestamp === true ? new Date() : data.timestamp);
        }
        
        return newEmbed;
    }

    /**
     * Component processing with v2 support
     */
    static processComponent(component, ctx) {
        if (!component || typeof component !== 'object') return component;
        
        try {
            let processed = { ...component };
            
            // Handle v2 components structure (with data property)
            if (processed.data && typeof processed.data === 'object') {
                // Process the data property and flatten it
                const processedData = this.processComponentData(processed.data, ctx);
                processed = { ...processed, ...processedData };
                
                // Keep data property for v2 compatibility if it exists
                processed.data = processedData;
            } else {
                // Process v1 components directly
                processed = this.processComponentData(processed, ctx);
            }
            
            // Ensure ActionRow components are processed recursively
            if (processed.components && Array.isArray(processed.components)) {
                processed.components = processed.components.map(comp => this.processComponent(comp, ctx));
            }
            
            // Handle v2 ActionRow structure
            if (processed.data && processed.data.components && Array.isArray(processed.data.components)) {
                processed.data.components = processed.data.components.map(comp => this.processComponent(comp, ctx));
            }
            
            return processed;
        } catch (error) {
            structures_1.Logger.debug('Error processing component:', error);
            return component;
        }
    }

    /**
     * Process component data (works for both v1 and v2)
     */
    static processComponentData(data, ctx) {
        if (!data || typeof data !== 'object') return data;
        
        const processed = { ...data };
        
        // Process text properties common to most components
        const textProps = [
            'label', 'placeholder', 'custom_id', 'url', 'value', 
            'title', 'description', 'emoji', 'content'
        ];
        
        for (const prop of textProps) {
            if (processed[prop] && typeof processed[prop] === 'string') {
                processed[prop] = this.processGetVariables(processed[prop], ctx);
            }
        }
        
        // Process select menu options
        if (processed.options && Array.isArray(processed.options)) {
            processed.options = processed.options.map(option => {
                if (!option || typeof option !== 'object') return option;
                
                const newOption = { ...option };
                const optionProps = ['label', 'description', 'value'];
                for (const prop of optionProps) {
                    if (newOption[prop] && typeof newOption[prop] === 'string') {
                        newOption[prop] = this.processGetVariables(newOption[prop], ctx);
                    }
                }
                
                // Process emoji if it's a string
                if (newOption.emoji && typeof newOption.emoji === 'string') {
                    newOption.emoji = this.processGetVariables(newOption.emoji, ctx);
                }
                
                return newOption;
            });
        }
        
        // Process modal text inputs
        if (processed.components && Array.isArray(processed.components)) {
            processed.components = processed.components.map(comp => this.processComponentData(comp, ctx));
        }
        
        // Process button styles and other numeric properties safely
        if (processed.style !== undefined && typeof processed.style === 'string') {
            const styleValue = this.processGetVariables(processed.style, ctx);
            // Try to convert to number if it looks like a numeric string
            const numericValue = parseInt(styleValue);
            if (!isNaN(numericValue)) {
                processed.style = numericValue;
            } else {
                processed.style = styleValue;
            }
        }
        
        // Process disabled state
        if (processed.disabled !== undefined && typeof processed.disabled === 'string') {
            const disabledValue = this.processGetVariables(processed.disabled, ctx);
            processed.disabled = disabledValue === 'true' || disabledValue === true;
        }
        
        // Process required state for text inputs
        if (processed.required !== undefined && typeof processed.required === 'string') {
            const requiredValue = this.processGetVariables(processed.required, ctx);
            processed.required = requiredValue === 'true' || requiredValue === true;
        }
        
        // Process min/max values for text inputs
        const numericProps = ['min_length', 'max_length', 'min_values', 'max_values'];
        for (const prop of numericProps) {
            if (processed[prop] !== undefined && typeof processed[prop] === 'string') {
                const value = this.processGetVariables(processed[prop], ctx);
                const numericValue = parseInt(value);
                if (!isNaN(numericValue)) {
                    processed[prop] = numericValue;
                }
            }
        }
        
        return processed;
    }

    /**
     * Utility methods for backward compatibility
     */
    static getLetVariablesAsJson(ctx) {
        try {
            return ctx.keywords() || {};
        } catch (error) {
            structures_1.Logger.debug('Error getting variables:', error);
            return {};
        }
    }

    static getLetVariablesAsJsonString(ctx) {
        try {
            const variables = this.getLetVariablesAsJson(ctx);
            return JSON.stringify(variables, null, 2);
        } catch (error) {
            structures_1.Logger.debug('Error converting variables to JSON:', error);
            return '{}';
        }
    }

    static getLetVariable(ctx, varName) {
        try {
            const keywords = ctx.keywords();
            return keywords && keywords[varName];
        } catch (error) {
            structures_1.Logger.debug(`Error getting variable ${varName}:`, error);
            return undefined;
        }
    }
}

exports.Interpreter = Interpreter;
