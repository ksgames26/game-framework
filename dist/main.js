"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unload = exports.load = exports.methods = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const createTemplete_1 = require("./createTemplete");
const parse_i18n_1 = require("./misc/parse_i18n");
let conf = null;
let confKeys = [];
let defaultLan = "zh";
let watchingConfFile = false;
let watchedFilePath = null;
let enableWatchFile = false;
/** bundle 名称到 URL 的缓存 */
let bundleUrlCache = new Map();
/**
 * 解析 i18n sprite 信息字符串，并获取完整 URL 和 uuid
 * @param value i18n 配置值
 *   - plist 格式: bundleName/relativePath.plist/spriteFrame
 *   - 普通格式: bundleName/relativePath
 * @returns 解析后的 sprite 信息（包含 fullUrl 和 uuid）
 */
async function parseI18NSpriteInfo(value) {
    if (!value) {
        return null;
    }
    const isPlist = value.includes('.plist/');
    let bundleName;
    let relativePath;
    let spriteFrame = '';
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
    }
    else {
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
    let fullUrl;
    if (isPlist) {
        fullUrl = `${bundleUrl}/${relativePath}/${spriteFrame}`;
    }
    else {
        fullUrl = `${bundleUrl}/${relativePath}`;
    }
    // 查询 uuid
    let uuid = '';
    try {
        const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', fullUrl);
        if (assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.uuid) {
            uuid = assetInfo.uuid;
        }
    }
    catch (error) {
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
function fsPathToDbUrl(fsPath, assetsPath) {
    // 获取相对于 assets 目录的路径
    const relativePath = fsPath.replace(assetsPath, '').replace(/\\/g, '/');
    return `db://assets${relativePath}`;
}
/**
 * 使用 Node.js 文件系统 API 遍历目录，查找所有 bundle 并缓存
 * @param dirPath 目录的文件系统绝对路径
 * @param assetsPath assets 目录的绝对路径
 */
async function scanBundlesInDirectory(dirPath, assetsPath) {
    try {
        if (!(0, node_fs_1.existsSync)(dirPath)) {
            return;
        }
        const stat = (0, node_fs_1.statSync)(dirPath);
        if (!stat.isDirectory()) {
            return;
        }
        // 将文件系统路径转换为 db:// URL
        const dbUrl = fsPathToDbUrl(dirPath, assetsPath);
        // 检查当前目录是否是 bundle
        try {
            const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', dbUrl);
            if (assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.isBundle) {
                bundleUrlCache.set(assetInfo.name, assetInfo.url);
            }
        }
        catch (error) {
            // 忽略查询失败的目录
        }
        // 获取子目录列表
        const children = (0, node_fs_1.readdirSync)(dirPath);
        for (const child of children) {
            const childPath = (0, node_path_1.join)(dirPath, child);
            const childStat = (0, node_fs_1.statSync)(childPath);
            if (childStat.isDirectory()) {
                // 递归扫描子目录
                await scanBundlesInDirectory(childPath, assetsPath);
            }
        }
    }
    catch (error) {
        console.error(`Failed to scan bundles in ${dirPath}:`, error);
    }
}
/**
 * 初始化 bundle 缓存，扫描 assets 目录下所有 bundle
 */
async function initBundleCache() {
    bundleUrlCache.clear();
    const projectPath = Editor.Project.path;
    const assetsPath = (0, node_path_1.join)(projectPath, 'assets');
    if (!(0, node_fs_1.existsSync)(assetsPath)) {
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
function getBundleUrl(bundleName) {
    var _a;
    return (_a = bundleUrlCache.get(bundleName)) !== null && _a !== void 0 ? _a : null;
}
function watchFile(filePath) {
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
    (0, node_fs_1.watchFile)(filePath, { interval: 1000, persistent: true }, (curr, prev) => {
        // 检查文件是否被修改（mtime 变化）
        if (curr.mtime.getTime() !== prev.mtime.getTime()) {
            console.log(`[I18N] Config file changed: ${filePath}`);
            // 重新加载配置
            exports.methods.onI18NConfPathChanged("").catch((error) => {
                console.error("[I18N] Failed to reload config after file change:", error);
            });
        }
    });
    console.log(`[I18N] Started watching config file: ${filePath}`);
}
function unwatchFile() {
    if (!enableWatchFile) {
        return;
    }
    if (watchedFilePath) {
        (0, node_fs_1.unwatchFile)(watchedFilePath);
        console.log(`[I18N] Stopped watching config file: ${watchedFilePath}`);
        watchedFilePath = null;
        watchingConfFile = false;
    }
}
/*
 * @en Registration method for the main process of Extension
 * @zh 为扩展的主进程的注册方法
 */
exports.methods = {
    async createTemplate() {
        await (0, createTemplete_1.createTemplate)();
    },
    /**
     * 刷新 bundle 缓存
     */
    async refreshBundleCache() {
        await initBundleCache();
    },
    async onI18NConfPathChanged(key) {
        console.log("load i18n conf");
        // 在这里处理配置路径变化的逻辑
        const path = await Editor.Profile.getProject("game-framework", "i18n:game-framework.i18n_conf_path", "project");
        const startRowCol = await Editor.Profile.getProject("game-framework", "i18n:game-framework.i18n_conf_parse_start_row_col", "project");
        const endRowCol = await Editor.Profile.getProject("game-framework", "i18n:game-framework.i18n_conf_parse_end_row_col", "project");
        defaultLan = await Editor.Profile.getProject("game-framework", "i18n:game-framework.i18n_conf_default_lan", "project");
        if (startRowCol == "0-0") {
            return;
        }
        const project = Editor.Project.path;
        const conf_path = (0, node_path_1.join)(project, path);
        const fileType = (0, node_path_1.extname)(conf_path);
        if (fileType !== ".xlsx" && fileType !== ".xls" && fileType !== ".csv") {
            console.error("i18n configuration file must be xlsx, xls or csv format.");
            return;
        }
        if (!(0, node_fs_1.existsSync)(conf_path)) {
            console.error("i18n configuration file does not exist at path:", conf_path);
            conf = null;
            confKeys = [];
            return;
        }
        try {
            // 解析配置文件
            conf = await (0, parse_i18n_1.parseI18NConfig)(conf_path, startRowCol, endRowCol);
            confKeys = Object.keys(conf);
            console.log("i18n configuration loaded successfully:", Object.keys(conf));
            await exports.methods.onI18NConfDefaultLanChanged("");
            if (!watchingConfFile) {
                // 监听配置文件变化
                watchingConfFile = true;
                watchFile(conf_path);
            }
        }
        catch (error) {
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
    async getInfoOfI18NConf(key, type) {
        if (!key) {
            return "";
        }
        if (!conf) {
            return "";
        }
        const lans = conf[defaultLan];
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
    async onI18NConfParseStartRowColChanged(key) {
        console.log("i18n_conf_parse_start_row_col changed:", key);
        // 在这里处理起始行列变化的逻辑
        await exports.methods.onI18NConfPathChanged("");
    },
    async onI18NConfParseEndRowColChanged(key) {
        console.log("i18n_conf_parse_end_row_col changed:", key);
        // 在这里处理结束行列变化的逻辑
        await exports.methods.onI18NConfPathChanged("");
        await exports.methods.onI18NConfDefaultLanChanged("");
    },
    async onI18NConfDefaultLanChanged(key) {
        defaultLan = await Editor.Profile.getProject("game-framework", "i18n:game-framework.i18n_conf_default_lan", "project");
        const options = {
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
        await exports.methods.onI18NConfDefaultLanChanged("");
    },
    async onI18NConfRefreshAfterSaveChanged() {
        await exports.methods.onI18NConfPathChanged("");
    }
};
/**
 * @en Method Triggered on Extension Startup
 * @zh 扩展启动时触发的方法
 */
async function load() {
    console.log("Game Framework extension loaded.");
    await exports.methods.onI18NConfPathChanged("");
}
exports.load = load;
/**
 * @en Method triggered when uninstalling the extension
 * @zh 卸载扩展时触发的方法
 */
async function unload() {
    console.log("Game Framework extension unloaded.");
    conf = null;
    bundleUrlCache.clear();
    if (watchedFilePath) {
        unwatchFile();
    }
}
exports.unload = unload;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NvdXJjZS9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLHFDQUEySDtBQUMzSCx5Q0FBMEM7QUFDMUMscURBQWtEO0FBQ2xELGtEQUE4RDtBQUU5RCxJQUFJLElBQUksR0FBb0IsSUFBSSxDQUFDO0FBQ2pDLElBQUksUUFBUSxHQUFhLEVBQUUsQ0FBQztBQUM1QixJQUFJLFVBQVUsR0FBVyxJQUFJLENBQUM7QUFDOUIsSUFBSSxnQkFBZ0IsR0FBWSxLQUFLLENBQUM7QUFDdEMsSUFBSSxlQUFlLEdBQWtCLElBQUksQ0FBQztBQUMxQyxJQUFJLGVBQWUsR0FBWSxLQUFLLENBQUM7QUFFckMseUJBQXlCO0FBQ3pCLElBQUksY0FBYyxHQUF3QixJQUFJLEdBQUcsRUFBRSxDQUFDO0FBb0JwRDs7Ozs7O0dBTUc7QUFDSCxLQUFLLFVBQVUsbUJBQW1CLENBQUMsS0FBYTtJQUM1QyxJQUFJLENBQUMsS0FBSyxFQUFFO1FBQ1IsT0FBTyxJQUFJLENBQUM7S0FDZjtJQUVELE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUM7SUFFMUMsSUFBSSxVQUFrQixDQUFDO0lBQ3ZCLElBQUksWUFBb0IsQ0FBQztJQUN6QixJQUFJLFdBQVcsR0FBVyxFQUFFLENBQUM7SUFFN0IsSUFBSSxPQUFPLEVBQUU7UUFDVCxzREFBc0Q7UUFDdEQsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM1QyxNQUFNLFdBQVcsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUNuRCxXQUFXLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyx1QkFBdUI7UUFFdEUsTUFBTSxVQUFVLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxH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QUFFRDs7O0dBR0c7QUFDSSxLQUFLLFVBQVUsTUFBTTtJQUN4QixPQUFPLENBQUMsR0FBRyxDQUFDLG9DQUFvQyxDQUFDLENBQUM7SUFDbEQsSUFBSSxHQUFHLElBQUksQ0FBQztJQUNaLGNBQWMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUV2QixJQUFJLGVBQWUsRUFBRTtRQUNqQixXQUFXLEVBQUUsQ0FBQztLQUNqQjtBQUNMLENBQUM7QUFSRCx3QkFRQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEV4ZWN1dGVTY2VuZVNjcmlwdE1ldGhvZE9wdGlvbnMgfSBmcm9tIFwiQGNvY29zL2NyZWF0b3ItdHlwZXMvZWRpdG9yL3BhY2thZ2VzL3NjZW5lL0B0eXBlcy9wdWJsaWNcIjtcbmltcG9ydCB7IGV4aXN0c1N5bmMsIHVud2F0Y2hGaWxlIGFzIGZzVW53YXRjaEZpbGUsIHdhdGNoRmlsZSBhcyBmc1dhdGNoRmlsZSwgcmVhZGRpclN5bmMsIFN0YXRzLCBzdGF0U3luYyB9IGZyb20gXCJub2RlOmZzXCI7XG5pbXBvcnQgeyBleHRuYW1lLCBqb2luIH0gZnJvbSBcIm5vZGU6cGF0aFwiO1xuaW1wb3J0IHsgY3JlYXRlVGVtcGxhdGUgfSBmcm9tIFwiLi9jcmVhdGVUZW1wbGV0ZVwiO1xuaW1wb3J0IHsgSTE4TkRhdGEsIHBhcnNlSTE4TkNvbmZpZyB9IGZyb20gXCIuL21pc2MvcGFyc2VfaTE4blwiO1xuXG5sZXQgY29uZjogSTE4TkRhdGEgfCBudWxsID0gbnVsbDtcbmxldCBjb25mS2V5czogc3RyaW5nW10gPSBbXTtcbmxldCBkZWZhdWx0TGFuOiBzdHJpbmcgPSBcInpoXCI7XG5sZXQgd2F0Y2hpbmdDb25mRmlsZTogYm9vbGVhbiA9IGZhbHNlO1xubGV0IHdhdGNoZWRGaWxlUGF0aDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5sZXQgZW5hYmxlV2F0Y2hGaWxlOiBib29sZWFuID0gZmFsc2U7XG5cbi8qKiBidW5kbGUg5ZCN56ew5YiwIFVSTCDnmoTnvJPlrZggKi9cbmxldCBidW5kbGVVcmxDYWNoZTogTWFwPHN0cmluZywgc3RyaW5nPiA9IG5ldyBNYXAoKTtcblxuLyoqXG4gKiBpMThuIFNwcml0ZSDkv6Hmga9cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJMThOU3ByaXRlSW5mbyB7XG4gICAgLyoqIGJ1bmRsZSDlkI3np7AgKi9cbiAgICBidW5kbGVOYW1lOiBzdHJpbmc7XG4gICAgLyoqIOebuOWvuei3r+W+hO+8iOS4jeWQq+WQjue8gO+8iSAqL1xuICAgIHJlbGF0aXZlUGF0aDogc3RyaW5nO1xuICAgIC8qKiDmmK/lkKbmmK8gcGxpc3Qg5Zu+6ZuGICovXG4gICAgaXNQbGlzdDogYm9vbGVhbjtcbiAgICAvKiogcGxpc3Qg5Lit55qEIHNwcml0ZUZyYW1lIOWQjeensCAqL1xuICAgIHNwcml0ZUZyYW1lOiBzdHJpbmc7XG4gICAgLyoqIOWujOaVtOeahOi1hOa6kCBVUkwgKi9cbiAgICBmdWxsVXJsOiBzdHJpbmc7XG4gICAgLyoqIOi1hOa6kOeahCB1dWlkICovXG4gICAgdXVpZDogc3RyaW5nO1xufVxuXG4vKipcbiAqIOino+aekCBpMThuIHNwcml0ZSDkv6Hmga/lrZfnrKbkuLLvvIzlubbojrflj5blrozmlbQgVVJMIOWSjCB1dWlkXG4gKiBAcGFyYW0gdmFsdWUgaTE4biDphY3nva7lgLxcbiAqICAgLSBwbGlzdCDmoLzlvI86IGJ1bmRsZU5hbWUvcmVsYXRpdmVQYXRoLnBsaXN0L3Nwcml0ZUZyYW1lXG4gKiAgIC0g5pmu6YCa5qC85byPOiBidW5kbGVOYW1lL3JlbGF0aXZlUGF0aFxuICogQHJldHVybnMg6Kej5p6Q5ZCO55qEIHNwcml0ZSDkv6Hmga/vvIjljIXlkKsgZnVsbFVybCDlkowgdXVpZO+8iVxuICovXG5hc3luYyBmdW5jdGlvbiBwYXJzZUkxOE5TcHJpdGVJbmZvKHZhbHVlOiBzdHJpbmcpOiBQcm9taXNlPEkxOE5TcHJpdGVJbmZvIHwgbnVsbD4ge1xuICAgIGlmICghdmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgaXNQbGlzdCA9IHZhbHVlLmluY2x1ZGVzKCcucGxpc3QvJyk7XG5cbiAgICBsZXQgYnVuZGxlTmFtZTogc3RyaW5nO1xuICAgIGxldCByZWxhdGl2ZVBhdGg6IHN0cmluZztcbiAgICBsZXQgc3ByaXRlRnJhbWU6IHN0cmluZyA9ICcnO1xuXG4gICAgaWYgKGlzUGxpc3QpIHtcbiAgICAgICAgLy8gcGxpc3Qg5qC85byPOiBidW5kbGVOYW1lL3JlbGF0aXZlUGF0aC5wbGlzdC9zcHJpdGVGcmFtZVxuICAgICAgICBjb25zdCBwbGlzdEluZGV4ID0gdmFsdWUuaW5kZXhPZignLnBsaXN0LycpO1xuICAgICAgICBjb25zdCBiZWZvcmVQbGlzdCA9IHZhbHVlLnN1YnN0cmluZygwLCBwbGlzdEluZGV4KTtcbiAgICAgICAgc3ByaXRlRnJhbWUgPSB2YWx1ZS5zdWJzdHJpbmcocGxpc3RJbmRleCArIDcpOyAvLyA3ID0gJy5wbGlzdC8nLmxlbmd0aFxuXG4gICAgICAgIGNvbnN0IGZpcnN0U2xhc2ggPSBiZWZvcmVQbGlzdC5pbmRleE9mKCcvJyk7XG4gICAgICAgIGlmIChmaXJzdFNsYXNoID09PSAtMSkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBidW5kbGVOYW1lID0gYmVmb3JlUGxpc3Quc3Vic3RyaW5nKDAsIGZpcnN0U2xhc2gpO1xuICAgICAgICByZWxhdGl2ZVBhdGggPSBiZWZvcmVQbGlzdC5zdWJzdHJpbmcoZmlyc3RTbGFzaCArIDEpICsgJy5wbGlzdCc7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8g5pmu6YCa5qC85byPOiBidW5kbGVOYW1lL3JlbGF0aXZlUGF0aFxuICAgICAgICBjb25zdCBmaXJzdFNsYXNoID0gdmFsdWUuaW5kZXhPZignLycpO1xuICAgICAgICBpZiAoZmlyc3RTbGFzaCA9PT0gLTEpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgYnVuZGxlTmFtZSA9IHZhbHVlLnN1YnN0cmluZygwLCBmaXJzdFNsYXNoKTtcbiAgICAgICAgcmVsYXRpdmVQYXRoID0gdmFsdWUuc3Vic3RyaW5nKGZpcnN0U2xhc2ggKyAxKTtcbiAgICB9XG5cbiAgICAvLyDojrflj5YgYnVuZGxlIFVSTFxuICAgIGNvbnN0IGJ1bmRsZVVybCA9IGdldEJ1bmRsZVVybChidW5kbGVOYW1lKTtcbiAgICBpZiAoIWJ1bmRsZVVybCkge1xuICAgICAgICBjb25zb2xlLndhcm4oYFtJMThOXSBCdW5kbGUgbm90IGZvdW5kOiAke2J1bmRsZU5hbWV9YCk7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8vIOaLvOaOpeWujOaVtCBVUkxcbiAgICBsZXQgZnVsbFVybDogc3RyaW5nO1xuICAgIGlmIChpc1BsaXN0KSB7XG4gICAgICAgIGZ1bGxVcmwgPSBgJHtidW5kbGVVcmx9LyR7cmVsYXRpdmVQYXRofS8ke3Nwcml0ZUZyYW1lfWA7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZnVsbFVybCA9IGAke2J1bmRsZVVybH0vJHtyZWxhdGl2ZVBhdGh9YDtcbiAgICB9XG5cbiAgICAvLyDmn6Xor6IgdXVpZFxuICAgIGxldCB1dWlkID0gJyc7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGZ1bGxVcmwpO1xuICAgICAgICBpZiAoYXNzZXRJbmZvPy51dWlkKSB7XG4gICAgICAgICAgICB1dWlkID0gYXNzZXRJbmZvLnV1aWQ7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oYFtJMThOXSBGYWlsZWQgdG8gcXVlcnkgdXVpZCBmb3IgJHtmdWxsVXJsfTpgLCBlcnJvcik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgYnVuZGxlTmFtZSxcbiAgICAgICAgcmVsYXRpdmVQYXRoLFxuICAgICAgICBpc1BsaXN0LFxuICAgICAgICBzcHJpdGVGcmFtZSxcbiAgICAgICAgZnVsbFVybCxcbiAgICAgICAgdXVpZCxcbiAgICB9O1xufVxuXG4vKipcbiAqIOWwhuaWh+S7tuezu+e7n+i3r+W+hOi9rOaNouS4uiBkYjovLyBVUkxcbiAqIEBwYXJhbSBmc1BhdGgg5paH5Lu257O757uf57ud5a+56Lev5b6EXG4gKiBAcGFyYW0gYXNzZXRzUGF0aCBhc3NldHMg55uu5b2V55qE57ud5a+56Lev5b6EXG4gKiBAcmV0dXJucyBkYjovLyDmoLzlvI/nmoQgVVJMXG4gKi9cbmZ1bmN0aW9uIGZzUGF0aFRvRGJVcmwoZnNQYXRoOiBzdHJpbmcsIGFzc2V0c1BhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgLy8g6I635Y+W55u45a+55LqOIGFzc2V0cyDnm67lvZXnmoTot6/lvoRcbiAgICBjb25zdCByZWxhdGl2ZVBhdGggPSBmc1BhdGgucmVwbGFjZShhc3NldHNQYXRoLCAnJykucmVwbGFjZSgvXFxcXC9nLCAnLycpO1xuICAgIHJldHVybiBgZGI6Ly9hc3NldHMke3JlbGF0aXZlUGF0aH1gO1xufVxuXG4vKipcbiAqIOS9v+eUqCBOb2RlLmpzIOaWh+S7tuezu+e7nyBBUEkg6YGN5Y6G55uu5b2V77yM5p+l5om+5omA5pyJIGJ1bmRsZSDlubbnvJPlrZhcbiAqIEBwYXJhbSBkaXJQYXRoIOebruW9leeahOaWh+S7tuezu+e7n+e7neWvuei3r+W+hFxuICogQHBhcmFtIGFzc2V0c1BhdGggYXNzZXRzIOebruW9leeahOe7neWvuei3r+W+hFxuICovXG5hc3luYyBmdW5jdGlvbiBzY2FuQnVuZGxlc0luRGlyZWN0b3J5KGRpclBhdGg6IHN0cmluZywgYXNzZXRzUGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgICAgaWYgKCFleGlzdHNTeW5jKGRpclBhdGgpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzdGF0ID0gc3RhdFN5bmMoZGlyUGF0aCk7XG4gICAgICAgIGlmICghc3RhdC5pc0RpcmVjdG9yeSgpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyDlsIbmlofku7bns7vnu5/ot6/lvoTovazmjaLkuLogZGI6Ly8gVVJMXG4gICAgICAgIGNvbnN0IGRiVXJsID0gZnNQYXRoVG9EYlVybChkaXJQYXRoLCBhc3NldHNQYXRoKTtcblxuICAgICAgICAvLyDmo4Dmn6XlvZPliY3nm67lvZXmmK/lkKbmmK8gYnVuZGxlXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBhc3NldEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgZGJVcmwpO1xuICAgICAgICAgICAgaWYgKGFzc2V0SW5mbz8uaXNCdW5kbGUpIHtcbiAgICAgICAgICAgICAgICBidW5kbGVVcmxDYWNoZS5zZXQoYXNzZXRJbmZvLm5hbWUsIGFzc2V0SW5mby51cmwpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgLy8g5b+955Wl5p+l6K+i5aSx6LSl55qE55uu5b2VXG4gICAgICAgIH1cblxuICAgICAgICAvLyDojrflj5blrZDnm67lvZXliJfooahcbiAgICAgICAgY29uc3QgY2hpbGRyZW4gPSByZWFkZGlyU3luYyhkaXJQYXRoKTtcblxuICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG4gICAgICAgICAgICBjb25zdCBjaGlsZFBhdGggPSBqb2luKGRpclBhdGgsIGNoaWxkKTtcbiAgICAgICAgICAgIGNvbnN0IGNoaWxkU3RhdCA9IHN0YXRTeW5jKGNoaWxkUGF0aCk7XG5cbiAgICAgICAgICAgIGlmIChjaGlsZFN0YXQuaXNEaXJlY3RvcnkoKSkge1xuICAgICAgICAgICAgICAgIC8vIOmAkuW9kuaJq+aPj+WtkOebruW9lVxuICAgICAgICAgICAgICAgIGF3YWl0IHNjYW5CdW5kbGVzSW5EaXJlY3RvcnkoY2hpbGRQYXRoLCBhc3NldHNQYXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBzY2FuIGJ1bmRsZXMgaW4gJHtkaXJQYXRofTpgLCBlcnJvcik7XG4gICAgfVxufVxuXG4vKipcbiAqIOWIneWni+WMliBidW5kbGUg57yT5a2Y77yM5omr5o+PIGFzc2V0cyDnm67lvZXkuIvmiYDmnIkgYnVuZGxlXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGluaXRCdW5kbGVDYWNoZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBidW5kbGVVcmxDYWNoZS5jbGVhcigpO1xuXG4gICAgY29uc3QgcHJvamVjdFBhdGggPSBFZGl0b3IuUHJvamVjdC5wYXRoO1xuICAgIGNvbnN0IGFzc2V0c1BhdGggPSBqb2luKHByb2plY3RQYXRoLCAnYXNzZXRzJyk7XG5cbiAgICBpZiAoIWV4aXN0c1N5bmMoYXNzZXRzUGF0aCkpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCdbSTE4Tl0gQXNzZXRzIGRpcmVjdG9yeSBub3QgZm91bmQnKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGF3YWl0IHNjYW5CdW5kbGVzSW5EaXJlY3RvcnkoYXNzZXRzUGF0aCwgYXNzZXRzUGF0aCk7XG4gICAgY29uc29sZS5sb2coYFtJMThOXSBCdW5kbGUgY2FjaGUgaW5pdGlhbGl6ZWQsIGZvdW5kICR7YnVuZGxlVXJsQ2FjaGUuc2l6ZX0gYnVuZGxlczpgLCBBcnJheS5mcm9tKGJ1bmRsZVVybENhY2hlLmtleXMoKSkpO1xufVxuXG4vKipcbiAqIOagueaNriBidW5kbGUg5ZCN56ew6I635Y+WIGJ1bmRsZSDnmoQgVVJMIOi3r+W+hFxuICogQHBhcmFtIGJ1bmRsZU5hbWUgYnVuZGxlIOWQjeensFxuICogQHJldHVybnMgYnVuZGxlIOeahCBVUkwg6Lev5b6E77yM5aaCIGRiOi8vYXNzZXRzL2J1bmRsZXMvY29tbW9uLXJlc1xuICovXG5mdW5jdGlvbiBnZXRCdW5kbGVVcmwoYnVuZGxlTmFtZTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgcmV0dXJuIGJ1bmRsZVVybENhY2hlLmdldChidW5kbGVOYW1lKSA/PyBudWxsO1xufVxuXG5mdW5jdGlvbiB3YXRjaEZpbGUoZmlsZVBhdGg6IHN0cmluZyk6IHZvaWQge1xuICAgIGlmICghZW5hYmxlV2F0Y2hGaWxlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyDlpoLmnpzlt7Lnu4/lnKjnm5HlkKzlhbbku5bmlofku7bvvIzlhYjlgZzmraJcbiAgICBpZiAod2F0Y2hlZEZpbGVQYXRoICYmIHdhdGNoZWRGaWxlUGF0aCAhPT0gZmlsZVBhdGgpIHtcbiAgICAgICAgdW53YXRjaEZpbGUoKTtcbiAgICB9XG5cbiAgICB3YXRjaGVkRmlsZVBhdGggPSBmaWxlUGF0aDtcblxuICAgIC8vIOS9v+eUqCBmcy53YXRjaEZpbGUg55uR5ZCs5paH5Lu25Y+Y5YyWXG4gICAgLy8gaW50ZXJ2YWw6IOajgOafpemXtOmalO+8iOavq+enku+8ie+8jHBlcnNpc3RlbnQ6IOi/m+eoi+aYr+WQpuS/neaMgei/kOihjFxuICAgIGZzV2F0Y2hGaWxlKGZpbGVQYXRoLCB7IGludGVydmFsOiAxMDAwLCBwZXJzaXN0ZW50OiB0cnVlIH0sIChjdXJyOiBTdGF0cywgcHJldjogU3RhdHMpID0+IHtcbiAgICAgICAgLy8g5qOA5p+l5paH5Lu25piv5ZCm6KKr5L+u5pS577yIbXRpbWUg5Y+Y5YyW77yJXG4gICAgICAgIGlmIChjdXJyLm10aW1lLmdldFRpbWUoKSAhPT0gcHJldi5tdGltZS5nZXRUaW1lKCkpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbSTE4Tl0gQ29uZmlnIGZpbGUgY2hhbmdlZDogJHtmaWxlUGF0aH1gKTtcbiAgICAgICAgICAgIC8vIOmHjeaWsOWKoOi9vemFjee9rlxuICAgICAgICAgICAgbWV0aG9kcy5vbkkxOE5Db25mUGF0aENoYW5nZWQoXCJcIikuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIltJMThOXSBGYWlsZWQgdG8gcmVsb2FkIGNvbmZpZyBhZnRlciBmaWxlIGNoYW5nZTpcIiwgZXJyb3IpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnNvbGUubG9nKGBbSTE4Tl0gU3RhcnRlZCB3YXRjaGluZyBjb25maWcgZmlsZTogJHtmaWxlUGF0aH1gKTtcbn1cblxuZnVuY3Rpb24gdW53YXRjaEZpbGUoKTogdm9pZCB7XG4gICAgaWYgKCFlbmFibGVXYXRjaEZpbGUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICh3YXRjaGVkRmlsZVBhdGgpIHtcbiAgICAgICAgZnNVbndhdGNoRmlsZSh3YXRjaGVkRmlsZVBhdGgpO1xuICAgICAgICBjb25zb2xlLmxvZyhgW0kxOE5dIFN0b3BwZWQgd2F0Y2hpbmcgY29uZmlnIGZpbGU6ICR7d2F0Y2hlZEZpbGVQYXRofWApO1xuICAgICAgICB3YXRjaGVkRmlsZVBhdGggPSBudWxsO1xuICAgICAgICB3YXRjaGluZ0NvbmZGaWxlID0gZmFsc2U7XG4gICAgfVxufVxuXG4vKlxuICogQGVuIFJlZ2lzdHJhdGlvbiBtZXRob2QgZm9yIHRoZSBtYWluIHByb2Nlc3Mgb2YgRXh0ZW5zaW9uXG4gKiBAemgg5Li65omp5bGV55qE5Li76L+b56iL55qE5rOo5YaM5pa55rOVXG4gKi9cbmV4cG9ydCBjb25zdCBtZXRob2RzID0ge1xuXG4gICAgYXN5bmMgY3JlYXRlVGVtcGxhdGUoKSB7XG4gICAgICAgIGF3YWl0IGNyZWF0ZVRlbXBsYXRlKCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIOWIt+aWsCBidW5kbGUg57yT5a2YXG4gICAgICovXG4gICAgYXN5bmMgcmVmcmVzaEJ1bmRsZUNhY2hlKCkge1xuICAgICAgICBhd2FpdCBpbml0QnVuZGxlQ2FjaGUoKTtcbiAgICB9LFxuXG4gICAgYXN5bmMgb25JMThOQ29uZlBhdGhDaGFuZ2VkKGtleTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwibG9hZCBpMThuIGNvbmZcIik7XG4gICAgICAgIC8vIOWcqOi/memHjOWkhOeQhumFjee9rui3r+W+hOWPmOWMlueahOmAu+i+kVxuXG4gICAgICAgIGNvbnN0IHBhdGggPSBhd2FpdCBFZGl0b3IuUHJvZmlsZS5nZXRQcm9qZWN0KFwiZ2FtZS1mcmFtZXdvcmtcIiwgXCJpMThuOmdhbWUtZnJhbWV3b3JrLmkxOG5fY29uZl9wYXRoXCIsIFwicHJvamVjdFwiKTtcbiAgICAgICAgY29uc3Qgc3RhcnRSb3dDb2wgPSBhd2FpdCBFZGl0b3IuUHJvZmlsZS5nZXRQcm9qZWN0KFwiZ2FtZS1mcmFtZXdvcmtcIiwgXCJpMThuOmdhbWUtZnJhbWV3b3JrLmkxOG5fY29uZl9wYXJzZV9zdGFydF9yb3dfY29sXCIsIFwicHJvamVjdFwiKTtcbiAgICAgICAgY29uc3QgZW5kUm93Q29sID0gYXdhaXQgRWRpdG9yLlByb2ZpbGUuZ2V0UHJvamVjdChcImdhbWUtZnJhbWV3b3JrXCIsIFwiaTE4bjpnYW1lLWZyYW1ld29yay5pMThuX2NvbmZfcGFyc2VfZW5kX3Jvd19jb2xcIiwgXCJwcm9qZWN0XCIpO1xuICAgICAgICBkZWZhdWx0TGFuID0gYXdhaXQgRWRpdG9yLlByb2ZpbGUuZ2V0UHJvamVjdChcImdhbWUtZnJhbWV3b3JrXCIsIFwiaTE4bjpnYW1lLWZyYW1ld29yay5pMThuX2NvbmZfZGVmYXVsdF9sYW5cIiwgXCJwcm9qZWN0XCIpO1xuXG4gICAgICAgIGlmIChzdGFydFJvd0NvbCA9PSBcIjAtMFwiKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwcm9qZWN0ID0gRWRpdG9yLlByb2plY3QucGF0aDtcbiAgICAgICAgY29uc3QgY29uZl9wYXRoID0gam9pbihwcm9qZWN0LCBwYXRoKTtcblxuICAgICAgICBjb25zdCBmaWxlVHlwZSA9IGV4dG5hbWUoY29uZl9wYXRoKTtcbiAgICAgICAgaWYgKGZpbGVUeXBlICE9PSBcIi54bHN4XCIgJiYgZmlsZVR5cGUgIT09IFwiLnhsc1wiICYmIGZpbGVUeXBlICE9PSBcIi5jc3ZcIikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcImkxOG4gY29uZmlndXJhdGlvbiBmaWxlIG11c3QgYmUgeGxzeCwgeGxzIG9yIGNzdiBmb3JtYXQuXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFleGlzdHNTeW5jKGNvbmZfcGF0aCkpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJpMThuIGNvbmZpZ3VyYXRpb24gZmlsZSBkb2VzIG5vdCBleGlzdCBhdCBwYXRoOlwiLCBjb25mX3BhdGgpO1xuXG4gICAgICAgICAgICBjb25mID0gbnVsbDtcbiAgICAgICAgICAgIGNvbmZLZXlzID0gW107XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8g6Kej5p6Q6YWN572u5paH5Lu2XG4gICAgICAgICAgICBjb25mID0gYXdhaXQgcGFyc2VJMThOQ29uZmlnKGNvbmZfcGF0aCwgc3RhcnRSb3dDb2wgYXMgc3RyaW5nLCBlbmRSb3dDb2wgYXMgc3RyaW5nKTtcbiAgICAgICAgICAgIGNvbmZLZXlzID0gT2JqZWN0LmtleXMoY29uZik7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcImkxOG4gY29uZmlndXJhdGlvbiBsb2FkZWQgc3VjY2Vzc2Z1bGx5OlwiLCBPYmplY3Qua2V5cyhjb25mKSk7XG5cbiAgICAgICAgICAgIGF3YWl0IG1ldGhvZHMub25JMThOQ29uZkRlZmF1bHRMYW5DaGFuZ2VkKFwiXCIpO1xuXG4gICAgICAgICAgICBpZiAoIXdhdGNoaW5nQ29uZkZpbGUpIHtcbiAgICAgICAgICAgICAgICAvLyDnm5HlkKzphY3nva7mlofku7blj5jljJZcbiAgICAgICAgICAgICAgICB3YXRjaGluZ0NvbmZGaWxlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB3YXRjaEZpbGUoY29uZl9wYXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcGFyc2UgaTE4biBjb25maWd1cmF0aW9uOlwiLCBlcnJvcik7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICog6I635Y+W5aSa6K+t6KiA55qE5p+Q5Liqa2V555qEdmFsdWVcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBrZXkg5aSa6K+t6KiA6ZSuIFxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlIOexu+WeizogXCJsYWJlbFwiIHwgXCJyaWNodGV4dFwiIHwgXCJzcHJpdGVcIlxuICAgICAqIEByZXR1cm5zIOWvueS6jiBsYWJlbC9yaWNodGV4dCDov5Tlm57lrZfnrKbkuLLvvIzlr7nkuo4gc3ByaXRlIOi/lOWbniB7IGJ1bmRsZU5hbWUsIHJlbGF0aXZlUGF0aCwgaXNQbGlzdCwgc3ByaXRlRnJhbWUgfSDmiJblrZfnrKbkuLJcbiAgICAgKi9cbiAgICBhc3luYyBnZXRJbmZvT2ZJMThOQ29uZihrZXk6IHN0cmluZywgdHlwZTogc3RyaW5nKSB7XG4gICAgICAgIGlmICgha2V5KSB7XG4gICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghY29uZikge1xuICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBsYW5zID0gY29uZiFbZGVmYXVsdExhbl07XG4gICAgICAgIGlmICghbGFucykge1xuICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB2YWx1ZSA9IGxhbnNba2V5XTtcbiAgICAgICAgaWYgKCF2YWx1ZSkge1xuICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZSA9PT0gXCJzcHJpdGVcIikge1xuICAgICAgICAgICAgLy8g5ouG6KejIGkxOG4g5L+h5oGv5bm26I635Y+W5a6M5pW0IFVSTCDlkowgdXVpZFxuICAgICAgICAgICAgLy8gcGxpc3Qg5qC85byPOiBidW5kbGVOYW1lL3JlbGF0aXZlUGF0aC5wbGlzdC9zcHJpdGVGcmFtZVxuICAgICAgICAgICAgLy8g5pmu6YCa5qC85byPOiBidW5kbGVOYW1lL3JlbGF0aXZlUGF0aFxuICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHBhcnNlSTE4TlNwcml0ZUluZm8odmFsdWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH0sXG5cbiAgICBhc3luYyBvbkkxOE5Db25mUGFyc2VTdGFydFJvd0NvbENoYW5nZWQoa2V5OiBzdHJpbmcpIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJpMThuX2NvbmZfcGFyc2Vfc3RhcnRfcm93X2NvbCBjaGFuZ2VkOlwiLCBrZXkpO1xuICAgICAgICAvLyDlnKjov5nph4zlpITnkIbotbflp4vooYzliJflj5jljJbnmoTpgLvovpFcblxuICAgICAgICBhd2FpdCBtZXRob2RzLm9uSTE4TkNvbmZQYXRoQ2hhbmdlZChcIlwiKTtcbiAgICB9LFxuXG4gICAgYXN5bmMgb25JMThOQ29uZlBhcnNlRW5kUm93Q29sQ2hhbmdlZChrZXk6IHN0cmluZykge1xuICAgICAgICBjb25zb2xlLmxvZyhcImkxOG5fY29uZl9wYXJzZV9lbmRfcm93X2NvbCBjaGFuZ2VkOlwiLCBrZXkpO1xuICAgICAgICAvLyDlnKjov5nph4zlpITnkIbnu5PmnZ/ooYzliJflj5jljJbnmoTpgLvovpFcblxuICAgICAgICBhd2FpdCBtZXRob2RzLm9uSTE4TkNvbmZQYXRoQ2hhbmdlZChcIlwiKTtcbiAgICAgICAgYXdhaXQgbWV0aG9kcy5vbkkxOE5Db25mRGVmYXVsdExhbkNoYW5nZWQoXCJcIik7XG4gICAgfSxcblxuICAgIGFzeW5jIG9uSTE4TkNvbmZEZWZhdWx0TGFuQ2hhbmdlZChrZXk6IHN0cmluZykge1xuICAgICAgICBkZWZhdWx0TGFuID0gYXdhaXQgRWRpdG9yLlByb2ZpbGUuZ2V0UHJvamVjdChcImdhbWUtZnJhbWV3b3JrXCIsIFwiaTE4bjpnYW1lLWZyYW1ld29yay5pMThuX2NvbmZfZGVmYXVsdF9sYW5cIiwgXCJwcm9qZWN0XCIpO1xuICAgICAgICBjb25zdCBvcHRpb25zOiBFeGVjdXRlU2NlbmVTY3JpcHRNZXRob2RPcHRpb25zID0ge1xuICAgICAgICAgICAgbmFtZTogXCJnYW1lLWZyYW1ld29ya1wiLFxuICAgICAgICAgICAgbWV0aG9kOiAnY2hhbmdlRGVmYXVsdExhbicsXG4gICAgICAgICAgICBhcmdzOiBbZGVmYXVsdExhbl0sXG4gICAgICAgIH07XG4gICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2V4ZWN1dGUtc2NlbmUtc2NyaXB0Jywgb3B0aW9ucyk7XG4gICAgfSxcblxuICAgIGFzeW5jIG9uQXNzZXREQlJlYWR5KCkge1xuICAgICAgICBjb25zb2xlLmxvZyhcIkFzc2V0IERCIGlzIHJlYWR5LCBpbml0aWFsaXppbmcgYnVuZGxlIGNhY2hlLlwiKTtcbiAgICAgICAgYXdhaXQgaW5pdEJ1bmRsZUNhY2hlKCk7XG4gICAgfSxcblxuICAgIGFzeW5jIG9uU2NlbmVSZWFkeSgpIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJTY2VuZSBpcyByZWFkeSwgYXBwbHlpbmcgZGVmYXVsdCBsYW5ndWFnZTpcIiwgZGVmYXVsdExhbik7XG5cbiAgICAgICAgYXdhaXQgbWV0aG9kcy5vbkkxOE5Db25mRGVmYXVsdExhbkNoYW5nZWQoXCJcIik7XG4gICAgfSxcblxuICAgIGFzeW5jIG9uSTE4TkNvbmZSZWZyZXNoQWZ0ZXJTYXZlQ2hhbmdlZCgpIHtcblxuICAgICAgICBhd2FpdCBtZXRob2RzLm9uSTE4TkNvbmZQYXRoQ2hhbmdlZChcIlwiKTtcbiAgICB9XG59O1xuXG4vKipcbiAqIEBlbiBNZXRob2QgVHJpZ2dlcmVkIG9uIEV4dGVuc2lvbiBTdGFydHVwXG4gKiBAemgg5omp5bGV5ZCv5Yqo5pe26Kem5Y+R55qE5pa55rOVXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsb2FkKCkge1xuICAgIGNvbnNvbGUubG9nKFwiR2FtZSBGcmFtZXdvcmsgZXh0ZW5zaW9uIGxvYWRlZC5cIik7XG4gICAgYXdhaXQgbWV0aG9kcy5vbkkxOE5Db25mUGF0aENoYW5nZWQoXCJcIik7XG59XG5cbi8qKlxuICogQGVuIE1ldGhvZCB0cmlnZ2VyZWQgd2hlbiB1bmluc3RhbGxpbmcgdGhlIGV4dGVuc2lvblxuICogQHpoIOWNuOi9veaJqeWxleaXtuinpuWPkeeahOaWueazlVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdW5sb2FkKCkge1xuICAgIGNvbnNvbGUubG9nKFwiR2FtZSBGcmFtZXdvcmsgZXh0ZW5zaW9uIHVubG9hZGVkLlwiKTtcbiAgICBjb25mID0gbnVsbDtcbiAgICBidW5kbGVVcmxDYWNoZS5jbGVhcigpO1xuXG4gICAgaWYgKHdhdGNoZWRGaWxlUGF0aCkge1xuICAgICAgICB1bndhdGNoRmlsZSgpO1xuICAgIH1cbn1cbiJdfQ==