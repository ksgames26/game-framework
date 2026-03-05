import { ExecuteSceneScriptMethodOptions } from "@cocos/creator-types/editor/packages/scene/@types/public";
import { existsSync, unwatchFile as fsUnwatchFile, watchFile as fsWatchFile, readdirSync, Stats, statSync } from "node:fs";
import { extname, join } from "node:path";
import { createTemplate } from "./createTemplete";
import { I18NData, parseI18NConfig } from "./misc/parse_i18n";

let conf: I18NData | null = null;
let confKeys: string[] = [];
let defaultLan: string = "zh";
let watchingConfFile: boolean = false;
let watchedFilePath: string | null = null;
let enableWatchFile: boolean = false;

/** bundle 名称到 URL 的缓存 */
let bundleUrlCache: Map<string, string> = new Map();

/**
 * i18n Sprite 信息
 */
export interface I18NSpriteInfo {
    /** bundle 名称 */
    bundleName: string;
    /** 相对路径（不含后缀） */
    relativePath: string;
    /** 是否是 plist 图集 */
    isPlist: boolean;
    /** plist 中的 spriteFrame 名称 */
    spriteFrame: string;
    /** 完整的资源 URL */
    fullUrl: string;
    /** 资源的 uuid */
    uuid: string;
}

/**
 * 解析 i18n sprite 信息字符串，并获取完整 URL 和 uuid
 * @param value i18n 配置值
 *   - plist 格式: bundleName/relativePath.plist/spriteFrame
 *   - 普通格式: bundleName/relativePath
 * @returns 解析后的 sprite 信息（包含 fullUrl 和 uuid）
 */
async function parseI18NSpriteInfo(value: string): Promise<I18NSpriteInfo | null> {
    if (!value) {
        return null;
    }

    const isPlist = value.includes('.plist/');

    let bundleName: string;
    let relativePath: string;
    let spriteFrame: string = '';

    if (isPlist) {
        // plist 格式: bundleName/relativePath.plist/spriteFrame
        const plistIndex = value.indexOf('.plist/');
        const beforePlist = value.substring(0, plistIndex);
        spriteFrame = value.substring(plistIndex + 7); // 7 = '.plist/'.length

        const firstSlash = beforePlist.indexOf('/');
        if (firstSlash === -1) {
            return null;
        }

        bundleName = beforePlist.substring(0, firstSlash);
        relativePath = beforePlist.substring(firstSlash + 1) + '.plist';
    } else {
        // 普通格式: bundleName/relativePath
        const firstSlash = value.indexOf('/');
        if (firstSlash === -1) {
            return null;
        }

        bundleName = value.substring(0, firstSlash);
        relativePath = value.substring(firstSlash + 1);
    }

    // 获取 bundle URL
    const bundleUrl = getBundleUrl(bundleName);
    if (!bundleUrl) {
        console.warn(`[I18N] Bundle not found: ${bundleName}`);
        return null;
    }

    // 拼接完整 URL
    let fullUrl: string;
    if (isPlist) {
        fullUrl = `${bundleUrl}/${relativePath}/${spriteFrame}`;
    } else {
        fullUrl = `${bundleUrl}/${relativePath}`;
    }

    // 查询 uuid
    let uuid = '';
    try {
        const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', fullUrl);
        if (assetInfo?.uuid) {
            uuid = assetInfo.uuid;
        }
    } catch (error) {
        console.warn(`[I18N] Failed to query uuid for ${fullUrl}:`, error);
    }

    return {
        bundleName,
        relativePath,
        isPlist,
        spriteFrame,
        fullUrl,
        uuid,
    };
}

/**
 * 将文件系统路径转换为 db:// URL
 * @param fsPath 文件系统绝对路径
 * @param assetsPath assets 目录的绝对路径
 * @returns db:// 格式的 URL
 */
function fsPathToDbUrl(fsPath: string, assetsPath: string): string {
    // 获取相对于 assets 目录的路径
    const relativePath = fsPath.replace(assetsPath, '').replace(/\\/g, '/');
    return `db://assets${relativePath}`;
}

/**
 * 使用 Node.js 文件系统 API 遍历目录，查找所有 bundle 并缓存
 * @param dirPath 目录的文件系统绝对路径
 * @param assetsPath assets 目录的绝对路径
 */
async function scanBundlesInDirectory(dirPath: string, assetsPath: string): Promise<void> {
    try {
        if (!existsSync(dirPath)) {
            return;
        }

        const stat = statSync(dirPath);
        if (!stat.isDirectory()) {
            return;
        }

        // 将文件系统路径转换为 db:// URL
        const dbUrl = fsPathToDbUrl(dirPath, assetsPath);

        // 检查当前目录是否是 bundle
        try {
            const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', dbUrl);
            if (assetInfo?.isBundle) {
                bundleUrlCache.set(assetInfo.name, assetInfo.url);
            }
        } catch (error) {
            // 忽略查询失败的目录
        }

        // 获取子目录列表
        const children = readdirSync(dirPath);

        for (const child of children) {
            const childPath = join(dirPath, child);
            const childStat = statSync(childPath);

            if (childStat.isDirectory()) {
                // 递归扫描子目录
                await scanBundlesInDirectory(childPath, assetsPath);
            }
        }
    } catch (error) {
        console.error(`Failed to scan bundles in ${dirPath}:`, error);
    }
}

/**
 * 初始化 bundle 缓存，扫描 assets 目录下所有 bundle
 */
async function initBundleCache(): Promise<void> {
    bundleUrlCache.clear();

    const projectPath = Editor.Project.path;
    const assetsPath = join(projectPath, 'assets');

    if (!existsSync(assetsPath)) {
        console.warn('[I18N] Assets directory not found');
        return;
    }

    await scanBundlesInDirectory(assetsPath, assetsPath);
    console.log(`[I18N] Bundle cache initialized, found ${bundleUrlCache.size} bundles:`, Array.from(bundleUrlCache.keys()));
}

/**
 * 根据 bundle 名称获取 bundle 的 URL 路径
 * @param bundleName bundle 名称
 * @returns bundle 的 URL 路径，如 db://assets/bundles/common-res
 */
function getBundleUrl(bundleName: string): string | null {
    return bundleUrlCache.get(bundleName) ?? null;
}

function watchFile(filePath: string): void {
    if (!enableWatchFile) {
        return;
    }

    // 如果已经在监听其他文件，先停止
    if (watchedFilePath && watchedFilePath !== filePath) {
        unwatchFile();
    }

    watchedFilePath = filePath;

    // 使用 fs.watchFile 监听文件变化
    // interval: 检查间隔（毫秒），persistent: 进程是否保持运行
    fsWatchFile(filePath, { interval: 1000, persistent: true }, (curr: Stats, prev: Stats) => {
        // 检查文件是否被修改（mtime 变化）
        if (curr.mtime.getTime() !== prev.mtime.getTime()) {
            console.log(`[I18N] Config file changed: ${filePath}`);
            // 重新加载配置
            methods.onI18NConfPathChanged("").catch((error) => {
                console.error("[I18N] Failed to reload config after file change:", error);
            });
        }
    });

    console.log(`[I18N] Started watching config file: ${filePath}`);
}

function unwatchFile(): void {
    if (!enableWatchFile) {
        return;
    }

    if (watchedFilePath) {
        fsUnwatchFile(watchedFilePath);
        console.log(`[I18N] Stopped watching config file: ${watchedFilePath}`);
        watchedFilePath = null;
        watchingConfFile = false;
    }
}

/*
 * @en Registration method for the main process of Extension
 * @zh 为扩展的主进程的注册方法
 */
export const methods = {

    async createTemplate() {
        await createTemplate();
    },

    /**
     * 刷新 bundle 缓存
     */
    async refreshBundleCache() {
        await initBundleCache();
    },

    async onI18NConfPathChanged(key: string) {
        console.log("load i18n conf");
        // 在这里处理配置路径变化的逻辑

        const path = await Editor.Profile.getProject("game-framework", "i18n:game-framework.i18n_conf_path", "project");
        const startRowCol = await Editor.Profile.getProject("game-framework", "i18n:game-framework.i18n_conf_parse_start_row_col", "project");
        const endRowCol = await Editor.Profile.getProject("game-framework", "i18n:game-framework.i18n_conf_parse_end_row_col", "project");
        defaultLan = await Editor.Profile.getProject("game-framework", "i18n:game-framework.i18n_conf_default_lan", "project");

        if (!path || !startRowCol || !endRowCol) {
            console.error("i18n configuration path or row and column not set.");
            return;
        }

        if (startRowCol == "0-0") {
            return;
        }

        const project = Editor.Project.path;
        const conf_path = join(project, path);

        const fileType = extname(conf_path);
        if (fileType !== ".xlsx" && fileType !== ".xls" && fileType !== ".csv") {
            console.error("i18n configuration file must be xlsx, xls or csv format.");
            return;
        }

        if (!existsSync(conf_path)) {
            console.error("i18n configuration file does not exist at path:", conf_path);

            conf = null;
            confKeys = [];
            return;
        }

        try {
            // 解析配置文件
            conf = await parseI18NConfig(conf_path, startRowCol as string, endRowCol as string);
            confKeys = Object.keys(conf);
            console.log("i18n configuration loaded successfully:", Object.keys(conf));

            await methods.onI18NConfDefaultLanChanged("");

            if (!watchingConfFile) {
                // 监听配置文件变化
                watchingConfFile = true;
                watchFile(conf_path);
            }
        } catch (error) {
            console.error("Failed to parse i18n configuration:", error);
        }
    },

    /**
     * 获取多语言的某个key的value
     *
     * @param {string} key 多语言键 
     * @param {string} type 类型: "label" | "richtext" | "sprite"
     * @returns 对于 label/richtext 返回字符串，对于 sprite 返回 { bundleName, relativePath, isPlist, spriteFrame } 或字符串
     */
    async getInfoOfI18NConf(key: string, type: string) {
        if (!key) {
            return "";
        }

        if (!conf) {
            return "";
        }

        const lans = conf![defaultLan];
        if (!lans) {
            return "";
        }

        const value = lans[key];
        if (!value) {
            return "";
        }

        if (type === "sprite") {
            // 拆解 i18n 信息并获取完整 URL 和 uuid
            // plist 格式: bundleName/relativePath.plist/spriteFrame
            // 普通格式: bundleName/relativePath
            return await parseI18NSpriteInfo(value);
        }

        return value;
    },

    async onI18NConfParseStartRowColChanged(key: string) {
        console.log("i18n_conf_parse_start_row_col changed:", key);
        // 在这里处理起始行列变化的逻辑

        await methods.onI18NConfPathChanged("");
    },

    async onI18NConfParseEndRowColChanged(key: string) {
        console.log("i18n_conf_parse_end_row_col changed:", key);
        // 在这里处理结束行列变化的逻辑

        await methods.onI18NConfPathChanged("");
        await methods.onI18NConfDefaultLanChanged("");
    },

    async onI18NConfDefaultLanChanged(key: string) {
        defaultLan = await Editor.Profile.getProject("game-framework", "i18n:game-framework.i18n_conf_default_lan", "project");
        const options: ExecuteSceneScriptMethodOptions = {
            name: "game-framework",
            method: 'changeDefaultLan',
            args: [defaultLan],
        };
        await Editor.Message.request('scene', 'execute-scene-script', options);
    },

    async onAssetDBReady() {
        console.log("Asset DB is ready, initializing bundle cache.");
        await initBundleCache();
    },

    async onSceneReady() {
        console.log("Scene is ready, applying default language:", defaultLan);

        await methods.onI18NConfDefaultLanChanged("");
    },

    async onI18NConfRefreshAfterSaveChanged() {

        await methods.onI18NConfPathChanged("");
    }
};

/**
 * @en Method Triggered on Extension Startup
 * @zh 扩展启动时触发的方法
 */
export async function load() {
    console.log("Game Framework extension loaded.");
    await methods.onI18NConfPathChanged("");
}

/**
 * @en Method triggered when uninstalling the extension
 * @zh 卸载扩展时触发的方法
 */
export async function unload() {
    console.log("Game Framework extension unloaded.");
    conf = null;
    bundleUrlCache.clear();

    if (watchedFilePath) {
        unwatchFile();
    }
}
