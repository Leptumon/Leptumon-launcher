/**
 * Rule Evaluator
 * 
 * Evaluates OS and feature rules for libraries and arguments.
 * Used to determine which libraries to include and which arguments to apply
 * based on the current platform and enabled features.
 */

import type { Rule, RuleContext, Library, Argument, ArgumentRule } from '../types/version-json';
import { createRuleContext, getMinecraftOsName, getMinecraftArch } from '../types/platform';

// ============================================================================
// Rule Evaluation
// ============================================================================

/**
 * Evaluates a single rule against the given context.
 * 
 * @param rule - The rule to evaluate.
 * @param context - The evaluation context.
 * @returns True if the rule matches, false otherwise.
 */
export function evaluateRule(rule: Rule, context: RuleContext): boolean {
    // Check OS conditions
    if (rule.os) {
        // OS name check
        if (rule.os.name !== undefined) {
            if (rule.os.name !== context.os) {
                return false;
            }
        }

        // Architecture check
        if (rule.os.arch !== undefined) {
            if (rule.os.arch !== context.arch) {
                return false;
            }
        }

        // OS version regex check
        if (rule.os.version !== undefined) {
            const versionRegex = new RegExp(rule.os.version);
            if (!versionRegex.test(context.osVersion)) {
                return false;
            }
        }
    }

    // Check feature conditions
    if (rule.features) {
        for (const [feature, expectedValue] of Object.entries(rule.features)) {
            const actualValue = context.features[feature as keyof typeof context.features];
            if (actualValue !== expectedValue) {
                return false;
            }
        }
    }

    // All conditions passed
    return true;
}

/**
 * Evaluates a list of rules to determine the final action.
 * 
 * Rules are evaluated in order. The default action is 'allow' if no rules exist.
 * If rules exist, the default action is 'disallow' unless an allow rule matches.
 * 
 * @param rules - The rules to evaluate.
 * @param context - The evaluation context.
 * @returns True if the item should be included, false otherwise.
 */
export function evaluateRules(rules: Rule[] | undefined, context?: RuleContext): boolean {
    // No rules = always include
    if (!rules || rules.length === 0) {
        return true;
    }

    // Use provided context or create default
    const ctx = context ?? createRuleContext();

    // Default to disallow when rules exist
    let allowed = false;

    for (const rule of rules) {
        const matches = evaluateRule(rule, ctx);

        if (matches) {
            // Rule matches, apply its action
            allowed = rule.action === 'allow';
        }
    }

    return allowed;
}

// ============================================================================
// Library Filtering
// ============================================================================

/**
 * Filters libraries based on the current platform rules.
 * 
 * @param libraries - All libraries from the version JSON.
 * @param context - Optional evaluation context.
 * @returns Libraries that should be used on the current platform.
 */
export function filterLibraries(libraries: Library[], context?: RuleContext): Library[] {
    const ctx = context ?? createRuleContext();
    return libraries.filter((lib) => evaluateRules(lib.rules, ctx));
}

/**
 * Checks if a library is a native library for the current platform.
 * 
 * @param library - The library to check.
 * @returns True if this is a native library.
 */
export function isNativeLibrary(library: Library): boolean {
    // Check for natives mapping
    if (library.natives) {
        return true;
    }

    // Check for native classifiers in downloads
    if (library.downloads?.classifiers) {
        return true;
    }

    // Some libraries have 'natives' in the name
    if (library.name.includes(':natives-')) {
        return true;
    }

    return false;
}

/**
 * Gets the native classifier for a library on the current platform.
 * 
 * @param library - The library to get the classifier for.
 * @returns The classifier string, or undefined if not a native library for this platform.
 */
export function getNativeClassifierForLibrary(library: Library): string | undefined {
    if (!library.natives) {
        return undefined;
    }

    const osName = getMinecraftOsName();
    const arch = getMinecraftArch();

    // Get the classifier template
    let classifier = library.natives[osName];

    // Some older versions use 'osx' vs 'macos'
    if (!classifier && osName === 'osx') {
        classifier = library.natives['macos'];
    }

    if (!classifier) {
        return undefined;
    }

    // Replace ${arch} placeholder
    return classifier.replace(/\$\{arch\}/g, arch === 'x64' ? '64' : '32');
}

// ============================================================================
// Argument Filtering
// ============================================================================

/**
 * Processes arguments, evaluating rules and flattening to string array.
 * 
 * @param args - Arguments from version JSON (can be strings or rules).
 * @param context - Optional evaluation context.
 * @returns Flat array of argument strings.
 */
export function processArguments(args: Argument[] | undefined, context?: RuleContext): string[] {
    if (!args) {
        return [];
    }

    const ctx = context ?? createRuleContext();
    const result: string[] = [];

    for (const arg of args) {
        if (typeof arg === 'string') {
            // Simple string argument
            result.push(arg);
        } else {
            // Conditional argument with rules
            const argRule = arg as ArgumentRule;
            if (evaluateRules(argRule.rules, ctx)) {
                // Rules passed, include the value(s)
                if (Array.isArray(argRule.value)) {
                    result.push(...argRule.value);
                } else {
                    result.push(argRule.value);
                }
            }
        }
    }

    return result;
}

/**
 * Parses legacy minecraftArguments string into array.
 * Used for Minecraft versions before 1.13.
 * 
 * @param minecraftArguments - Space-separated argument string.
 * @returns Array of arguments.
 */
export function parseLegacyArguments(minecraftArguments: string | undefined): string[] {
    if (!minecraftArguments) {
        return [];
    }

    // Simple split on spaces, preserving quoted strings would be more complex
    // but Minecraft's legacy arguments don't use quotes
    return minecraftArguments.split(/\s+/).filter(Boolean);
}

// ============================================================================
// Default JVM Arguments (Legacy Versions)
// ============================================================================

/**
 * Default JVM arguments for versions that don't specify them.
 * These are based on the launcher's defaults for legacy versions.
 */
export const DEFAULT_JVM_ARGUMENTS: Argument[] = [
    {
        rules: [{ action: 'allow', os: { name: 'osx' } }],
        value: ['-XstartOnFirstThread'],
    },
    {
        rules: [{ action: 'allow', os: { name: 'windows' } }],
        value: [
            '-XX:HeapDumpPath=MojsaeCrash_pid%p.log',
            '-Dos.name=Windows 10',
            '-Dos.version=10.0',
        ],
    },
    {
        rules: [{ action: 'allow', os: { arch: 'x86' } }],
        value: '-Xss1M',
    },
    '-Djava.library.path=${natives_directory}',
    '-Djna.tmpdir=${natives_directory}',
    '-Dorg.lwjgl.system.SharedLibraryExtractPath=${natives_directory}',
    '-Dio.netty.native.workdir=${natives_directory}',
    '-Dminecraft.launcher.brand=${launcher_name}',
    '-Dminecraft.launcher.version=${launcher_version}',
    '-cp',
    '${classpath}',
];
