"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAssetMenu = void 0;
async function findLastBundleDirectory(assetUrl) {
    var _a;
    if (!assetUrl) {
        return null;
    }
    const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', assetUrl);
    const type = (assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.type) || '';
    const importer = (assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.importer) || '';
    const url = (assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.url) || '';
    const isPlist = url.includes('.plist');
    // "db://assets/bundles/common-res/common.plist/data"
    let plistPath = "";
    let spriteFrame = "";
    if (isPlist) {
        plistPath = url.split('.plist/')[0];
        spriteFrame = (_a = assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.name) !== null && _a !== void 0 ? _a : "";
    }
    // 如果是文件夹类型，直接返回null
    if (importer == "directory") {
        return null;
    }
    let realType = type;
    if (type && type.startsWith('cc')) {
        // 删除cc.前缀，获取真实类型
        realType = type.slice(3);
    }
    // 统一路径分隔符
    const normalized = assetUrl.replace(/\\/g, '/');
    // 分离协议前缀(如 db://)和路径主体
    const match = normalized.match(/^(db:\/\/)(.*)$/);
    if (!match) {
        return null;
    }
    const prefix = match[1]; // db://
    const pathBody = match[2].replace(/\/$/, ''); // 移除尾部斜杠
    const segments = pathBody.split('/');
    // 从完整路径开始，逐个减少尾部段，从后往前查找 bundle
    for (let i = segments.length; i > 0; i--) {
        const candidatePath = segments.slice(0, i).join('/');
        const candidate = prefix + candidatePath;
        try {
            const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', candidate);
            if (assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.isBundle) {
                // 从bundle目录到原始文件的相对路径(移除文件后缀)
                const remainingSegments = segments.slice(i);
                let relativePath = remainingSegments.join('/');
                // 移除文件后缀
                relativePath = relativePath.replace(/\.[^/.]+$/, '');
                return {
                    url: candidate,
                    name: assetInfo.name || segments[i - 1] || '',
                    realType,
                    relativePath: relativePath,
                    isPlist,
                    spriteFrame,
                };
            }
        }
        catch (error) {
            console.warn(`[assets-db] Failed to inspect directory ${candidate}`, error);
        }
    }
    return null;
}
function onAssetMenu(info) {
    return [
        {
            label: 'i18n:game-framework.hierarchy.menu.assetMenu.createAssetHandlerTitle',
            submenu: [
                {
                    label: 'i18n:game-framework.hierarchy.menu.assetMenu.createAssetHandler.hasAssetService',
                    async click() {
                        if (!info || !info.uuid) {
                            return;
                        }
                        const path = await Editor.Message.request('asset-db', 'query-url', info.uuid);
                        if (!path) {
                            Editor.Dialog.error('无法获取资源路径');
                            return;
                        }
                        const bundleInfo = await findLastBundleDirectory(path);
                        if (!bundleInfo) {
                            Editor.Dialog.error('未找到包含 Asset Bundle 的目录, 请确认资源位于某个 Bundle 下');
                            return;
                        }
                        let ctrlC = `
                            const handle = assSvr.getOrCreateAssetHandle('${bundleInfo.name}',${bundleInfo.isPlist ? "SpriteAtlas" : bundleInfo.realType},'${bundleInfo.relativePath}');`;
                        if (bundleInfo.isPlist) {
                            ctrlC += `
                            const spriteFrame = handle.getAsset()!.getSpriteFrame('${bundleInfo.spriteFrame}');`;
                        }
                        Editor.Clipboard.write("text", ctrlC.trim());
                        Editor.Dialog.info(`代码已复制到剪贴板`, { title: '复制成功' });
                    }
                },
                {
                    label: 'i18n:game-framework.hierarchy.menu.assetMenu.createAssetHandler.noAssetService',
                    async click() {
                        if (!info || !info.uuid) {
                            return;
                        }
                        const path = await Editor.Message.request('asset-db', 'query-url', info.uuid);
                        if (!path) {
                            Editor.Dialog.error('无法获取资源路径');
                            return;
                        }
                        const bundleInfo = await findLastBundleDirectory(path);
                        if (!bundleInfo) {
                            Editor.Dialog.error('未找到包含 Asset Bundle 的目录, 请确认资源位于某个 Bundle 下');
                            return;
                        }
                        let ctrlC = `
                            const assSvr = Container.get(AssetService)!;
                            const handle = assSvr.getOrCreateAssetHandle('${bundleInfo.name}',${bundleInfo.isPlist ? "SpriteAtlas" : bundleInfo.realType},'${bundleInfo.relativePath}');`;
                        if (bundleInfo.isPlist) {
                            ctrlC += `
                        const spriteFrame = handle.getAsset()!.getSpriteFrame('${bundleInfo.spriteFrame}');`;
                        }
                        Editor.Clipboard.write("text", ctrlC.trim());
                        Editor.Dialog.info(`代码已复制到剪贴板`, { title: '复制成功' });
                    }
                },
                {
                    label: 'i18n:game-framework.hierarchy.menu.assetMenu.createAssetHandler.copyI18nfo',
                    async click() {
                        if (!info || !info.uuid) {
                            return;
                        }
                        const path = await Editor.Message.request('asset-db', 'query-url', info.uuid);
                        if (!path) {
                            Editor.Dialog.error('无法获取资源路径');
                            return;
                        }
                        const bundleInfo = await findLastBundleDirectory(path);
                        if (!bundleInfo) {
                            Editor.Dialog.error('未找到包含 Asset Bundle 的目录, 请确认资源位于某个 Bundle 下');
                            return;
                        }
                        let text = "";
                        if (bundleInfo.isPlist) {
                            text = bundleInfo.name + "/" + bundleInfo.relativePath + ".plist" + "/" + bundleInfo.spriteFrame;
                        }
                        else {
                            text = bundleInfo.name + "/" + bundleInfo.relativePath;
                        }
                        Editor.Clipboard.write("text", text);
                        Editor.Dialog.info(`i18n信息已复制到剪贴板`, { title: '复制成功' });
                    }
                }
            ]
        }
    ];
}
exports.onAssetMenu = onAssetMenu;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzZXRzLWRiLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL2Fzc2V0cy9hc3NldHMtZGIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBVUEsS0FBSyxVQUFVLHVCQUF1QixDQUFDLFFBQWdCOztJQUNuRCxJQUFJLENBQUMsUUFBUSxFQUFFO1FBQ1gsT0FBTyxJQUFJLENBQUM7S0FDZjtJQUVELE1BQU0sU0FBUyxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLGtCQUFrQixFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ3pGLE1BQU0sSUFBSSxHQUFHLENBQUEsU0FBUyxhQUFULFNBQVMsdUJBQVQsU0FBUyxDQUFFLElBQUksS0FBSSxFQUFFLENBQUM7SUFDbkMsTUFBTSxRQUFRLEdBQUcsQ0FBQSxTQUFTLGFBQVQsU0FBUyx1QkFBVCxTQUFTLENBQUUsUUFBUSxLQUFJLEVBQUUsQ0FBQztJQUMzQyxNQUFNLEdBQUcsR0FBRyxDQUFBLFNBQVMsYUFBVCxTQUFTLHVCQUFULFNBQVMsQ0FBRSxHQUFHLEtBQUksRUFBRSxDQUFDO0lBRWpDLE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDdkMscURBQXFEO0lBRXJELElBQUksU0FBUyxHQUFHLEVBQUUsQ0FBQztJQUNuQixJQUFJLFdBQVcsR0FBRyxFQUFFLENBQUM7SUFDckIsSUFBSSxPQUFPLEVBQUU7UUFDVCxTQUFTLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwQyxXQUFXLEdBQUcsTUFBQSxTQUFTLGFBQVQsU0FBUyx1QkFBVCxTQUFTLENBQUUsSUFBSSxtQ0FBSSxFQUFFLENBQUM7S0FDdkM7SUFFRCxvQkFBb0I7SUFDcEIsSUFBSSxRQUFRLElBQUksV0FBVyxFQUFFO1FBQ3pCLE9BQU8sSUFBSSxDQUFDO0tBQ2Y7SUFF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RCxNQUFNLFVBQVUsR0FBRyxNQUFNLHVCQUF1QixDQUFDLElBQUksQ0FBQyxDQUFDO3dCQUN2RCxJQUFJLENBQUMsVUFBVSxFQUFFOzRCQUNiLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLDRDQUE0QyxDQUFDLENBQUM7NEJBQ2xFLE9BQU87eUJBQ1Y7d0JBRUQsSUFBSSxJQUFJLEdBQUcsRUFBRSxDQUFDO3dCQUNkLElBQUksVUFBVSxDQUFDLE9BQU8sRUFBRTs0QkFDcEIsSUFBSSxHQUFHLFVBQVUsQ0FBQyxJQUFJLEdBQUcsR0FBRyxHQUFHLFVBQVUsQ0FBQyxZQUFZLEdBQUcsUUFBUSxHQUFHLEdBQUcsR0FBRyxVQUFVLENBQUMsV0FBVyxDQUFDO3lCQUNwRzs2QkFBTTs0QkFDSCxJQUFJLEdBQUcsVUFBVSxDQUFDLElBQUksR0FBRyxHQUFHLEdBQUcsVUFBVSxDQUFDLFlBQVksQ0FBQzt5QkFDMUQ7d0JBRUQsTUFBTSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO3dCQUNyQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztvQkFDM0QsQ0FBQztpQkFDSjthQUNKO1NBQ0o7S0FDSixDQUFDO0FBQ04sQ0FBQztBQXZHRCxrQ0F1R0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBc3NldEluZm8gfSBmcm9tIFwiQGNvY29zL2NyZWF0b3ItdHlwZXMvZWRpdG9yL3BhY2thZ2VzL2Fzc2V0LWRiL0B0eXBlcy9wdWJsaWNcIjtcbnR5cGUgQnVuZGxlRGlyZWN0b3J5SW5mbyA9IHtcbiAgICB1cmw6IHN0cmluZztcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgcmVhbFR5cGU6IHN0cmluZztcbiAgICByZWxhdGl2ZVBhdGg6IHN0cmluZzsgLy8g5LuOYnVuZGxl5Yiw5paH5Lu255qE55u45a+56Lev5b6EKOS4jeWQq+WQjue8gClcbiAgICBpc1BsaXN0OiBib29sZWFuO1xuICAgIHNwcml0ZUZyYW1lOiBzdHJpbmc7XG59O1xuXG5hc3luYyBmdW5jdGlvbiBmaW5kTGFzdEJ1bmRsZURpcmVjdG9yeShhc3NldFVybDogc3RyaW5nKTogUHJvbWlzZTxCdW5kbGVEaXJlY3RvcnlJbmZvIHwgbnVsbD4ge1xuICAgIGlmICghYXNzZXRVcmwpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGFzc2V0VXJsKTtcbiAgICBjb25zdCB0eXBlID0gYXNzZXRJbmZvPy50eXBlIHx8ICcnO1xuICAgIGNvbnN0IGltcG9ydGVyID0gYXNzZXRJbmZvPy5pbXBvcnRlciB8fCAnJztcbiAgICBjb25zdCB1cmwgPSBhc3NldEluZm8/LnVybCB8fCAnJztcblxuICAgIGNvbnN0IGlzUGxpc3QgPSB1cmwuaW5jbHVkZXMoJy5wbGlzdCcpO1xuICAgIC8vIFwiZGI6Ly9hc3NldHMvYnVuZGxlcy9jb21tb24tcmVzL2NvbW1vbi5wbGlzdC9kYXRhXCJcblxuICAgIGxldCBwbGlzdFBhdGggPSBcIlwiO1xuICAgIGxldCBzcHJpdGVGcmFtZSA9IFwiXCI7XG4gICAgaWYgKGlzUGxpc3QpIHtcbiAgICAgICAgcGxpc3RQYXRoID0gdXJsLnNwbGl0KCcucGxpc3QvJylbMF07XG4gICAgICAgIHNwcml0ZUZyYW1lID0gYXNzZXRJbmZvPy5uYW1lID8/IFwiXCI7XG4gICAgfVxuXG4gICAgLy8g5aaC5p6c5piv5paH5Lu25aS557G75Z6L77yM55u05o6l6L+U5ZuebnVsbFxuICAgIGlmIChpbXBvcnRlciA9PSBcImRpcmVjdG9yeVwiKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGxldCByZWFsVHlwZSA9IHR5cGU7XG4gICAgaWYgKHR5cGUgJiYgdHlwZS5zdGFydHNXaXRoKCdjYycpKSB7XG4gICAgICAgIC8vIOWIoOmZpGNjLuWJjee8gO+8jOiOt+WPluecn+Wunuexu+Wei1xuICAgICAgICByZWFsVHlwZSA9IHR5cGUuc2xpY2UoMyk7XG4gICAgfVxuXG4gICAgLy8g57uf5LiA6Lev5b6E5YiG6ZqU56ymXG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IGFzc2V0VXJsLnJlcGxhY2UoL1xcXFwvZywgJy8nKTtcblxuICAgIC8vIOWIhuemu+WNj+iuruWJjee8gCjlpoIgZGI6Ly8p5ZKM6Lev5b6E5Li75L2TXG4gICAgY29uc3QgbWF0Y2ggPSBub3JtYWxpemVkLm1hdGNoKC9eKGRiOlxcL1xcLykoLiopJC8pO1xuICAgIGlmICghbWF0Y2gpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgcHJlZml4ID0gbWF0Y2hbMV07ICAvLyBkYjovL1xuICAgIGNvbnN0IHBhdGhCb2R5ID0gbWF0Y2hbMl0ucmVwbGFjZSgvXFwvJC8sICcnKTsgIC8vIOenu+mZpOWwvumDqOaWnOadoFxuICAgIGNvbnN0IHNlZ21lbnRzID0gcGF0aEJvZHkuc3BsaXQoJy8nKTtcblxuICAgIC8vIOS7juWujOaVtOi3r+W+hOW8gOWni++8jOmAkOS4quWHj+WwkeWwvumDqOaute+8jOS7juWQjuW+gOWJjeafpeaJviBidW5kbGVcbiAgICBmb3IgKGxldCBpID0gc2VnbWVudHMubGVuZ3RoOyBpID4gMDsgaS0tKSB7XG4gICAgICAgIGNvbnN0IGNhbmRpZGF0ZVBhdGggPSBzZWdtZW50cy5zbGljZSgwLCBpKS5qb2luKCcvJyk7XG4gICAgICAgIGNvbnN0IGNhbmRpZGF0ZSA9IHByZWZpeCArIGNhbmRpZGF0ZVBhdGg7XG5cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGNhbmRpZGF0ZSk7XG5cbiAgICAgICAgICAgIGlmIChhc3NldEluZm8/LmlzQnVuZGxlKSB7XG4gICAgICAgICAgICAgICAgLy8g5LuOYnVuZGxl55uu5b2V5Yiw5Y6f5aeL5paH5Lu255qE55u45a+56Lev5b6EKOenu+mZpOaWh+S7tuWQjue8gClcbiAgICAgICAgICAgICAgICBjb25zdCByZW1haW5pbmdTZWdtZW50cyA9IHNlZ21lbnRzLnNsaWNlKGkpO1xuICAgICAgICAgICAgICAgIGxldCByZWxhdGl2ZVBhdGggPSByZW1haW5pbmdTZWdtZW50cy5qb2luKCcvJyk7XG4gICAgICAgICAgICAgICAgLy8g56e76Zmk5paH5Lu25ZCO57yAXG4gICAgICAgICAgICAgICAgcmVsYXRpdmVQYXRoID0gcmVsYXRpdmVQYXRoLnJlcGxhY2UoL1xcLlteLy5dKyQvLCAnJyk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICB1cmw6IGNhbmRpZGF0ZSxcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogYXNzZXRJbmZvLm5hbWUgfHwgc2VnbWVudHNbaSAtIDFdIHx8ICcnLFxuICAgICAgICAgICAgICAgICAgICByZWFsVHlwZSxcbiAgICAgICAgICAgICAgICAgICAgcmVsYXRpdmVQYXRoOiByZWxhdGl2ZVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIGlzUGxpc3QsXG4gICAgICAgICAgICAgICAgICAgIHNwcml0ZUZyYW1lLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFthc3NldHMtZGJdIEZhaWxlZCB0byBpbnNwZWN0IGRpcmVjdG9yeSAke2NhbmRpZGF0ZX1gLCBlcnJvcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG9uQXNzZXRNZW51KGluZm86IEFzc2V0SW5mbykge1xuICAgIHJldHVybiBbXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxhYmVsOiAnaTE4bjpnYW1lLWZyYW1ld29yay5oaWVyYXJjaHkubWVudS5hc3NldE1lbnUuY3JlYXRlQXNzZXRIYW5kbGVyVGl0bGUnLFxuICAgICAgICAgICAgc3VibWVudTogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgbGFiZWw6ICdpMThuOmdhbWUtZnJhbWV3b3JrLmhpZXJhcmNoeS5tZW51LmFzc2V0TWVudS5jcmVhdGVBc3NldEhhbmRsZXIuaGFzQXNzZXRTZXJ2aWNlJyxcbiAgICAgICAgICAgICAgICAgICAgYXN5bmMgY2xpY2soKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghaW5mbyB8fCAhaW5mby51dWlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXRoID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktdXJsJywgaW5mby51dWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcGF0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEVkaXRvci5EaWFsb2cuZXJyb3IoJ+aXoOazleiOt+WPlui1hOa6kOi3r+W+hCcpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYnVuZGxlSW5mbyA9IGF3YWl0IGZpbmRMYXN0QnVuZGxlRGlyZWN0b3J5KHBhdGgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFidW5kbGVJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgRWRpdG9yLkRpYWxvZy5lcnJvcign5pyq5om+5Yiw5YyF5ZCrIEFzc2V0IEJ1bmRsZSDnmoTnm67lvZUsIOivt+ehruiupOi1hOa6kOS9jeS6juafkOS4qiBCdW5kbGUg5LiLJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgY3RybEMgPSBgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFuZGxlID0gYXNzU3ZyLmdldE9yQ3JlYXRlQXNzZXRIYW5kbGUoJyR7YnVuZGxlSW5mby5uYW1lfScsJHtidW5kbGVJbmZvLmlzUGxpc3QgPyBcIlNwcml0ZUF0bGFzXCIgOiBidW5kbGVJbmZvLnJlYWxUeXBlfSwnJHtidW5kbGVJbmZvLnJlbGF0aXZlUGF0aH0nKTtgO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYnVuZGxlSW5mby5pc1BsaXN0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3RybEMgKz0gYFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHNwcml0ZUZyYW1lID0gaGFuZGxlLmdldEFzc2V0KCkhLmdldFNwcml0ZUZyYW1lKCcke2J1bmRsZUluZm8uc3ByaXRlRnJhbWV9Jyk7YDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgRWRpdG9yLkNsaXBib2FyZC53cml0ZShcInRleHRcIiwgY3RybEMudHJpbSgpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIEVkaXRvci5EaWFsb2cuaW5mbyhg5Luj56CB5bey5aSN5Yi25Yiw5Ymq6LS05p2/YCwgeyB0aXRsZTogJ+WkjeWItuaIkOWKnycgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgbGFiZWw6ICdpMThuOmdhbWUtZnJhbWV3b3JrLmhpZXJhcmNoeS5tZW51LmFzc2V0TWVudS5jcmVhdGVBc3NldEhhbmRsZXIubm9Bc3NldFNlcnZpY2UnLFxuICAgICAgICAgICAgICAgICAgICBhc3luYyBjbGljaygpIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFpbmZvIHx8ICFpbmZvLnV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhdGggPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS11cmwnLCBpbmZvLnV1aWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFwYXRoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgRWRpdG9yLkRpYWxvZy5lcnJvcign5peg5rOV6I635Y+W6LWE5rqQ6Lev5b6EJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBidW5kbGVJbmZvID0gYXdhaXQgZmluZExhc3RCdW5kbGVEaXJlY3RvcnkocGF0aCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWJ1bmRsZUluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBFZGl0b3IuRGlhbG9nLmVycm9yKCfmnKrmib7liLDljIXlkKsgQXNzZXQgQnVuZGxlIOeahOebruW9lSwg6K+356Gu6K6k6LWE5rqQ5L2N5LqO5p+Q5LiqIEJ1bmRsZSDkuIsnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBjdHJsQyA9IGBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhc3NTdnIgPSBDb250YWluZXIuZ2V0KEFzc2V0U2VydmljZSkhO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhbmRsZSA9IGFzc1N2ci5nZXRPckNyZWF0ZUFzc2V0SGFuZGxlKCcke2J1bmRsZUluZm8ubmFtZX0nLCR7YnVuZGxlSW5mby5pc1BsaXN0ID8gXCJTcHJpdGVBdGxhc1wiIDogYnVuZGxlSW5mby5yZWFsVHlwZX0sJyR7YnVuZGxlSW5mby5yZWxhdGl2ZVBhdGh9Jyk7YDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGJ1bmRsZUluZm8uaXNQbGlzdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN0cmxDICs9IGBcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHNwcml0ZUZyYW1lID0gaGFuZGxlLmdldEFzc2V0KCkhLmdldFNwcml0ZUZyYW1lKCcke2J1bmRsZUluZm8uc3ByaXRlRnJhbWV9Jyk7YDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgRWRpdG9yLkNsaXBib2FyZC53cml0ZShcInRleHRcIiwgY3RybEMudHJpbSgpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIEVkaXRvci5EaWFsb2cuaW5mbyhg5Luj56CB5bey5aSN5Yi25Yiw5Ymq6LS05p2/YCwgeyB0aXRsZTogJ+WkjeWItuaIkOWKnycgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgbGFiZWw6ICdpMThuOmdhbWUtZnJhbWV3b3JrLmhpZXJhcmNoeS5tZW51LmFzc2V0TWVudS5jcmVhdGVBc3NldEhhbmRsZXIuY29weUkxOG5mbycsXG4gICAgICAgICAgICAgICAgICAgIGFzeW5jIGNsaWNrKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFpbmZvIHx8ICFpbmZvLnV1aWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhdGggPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS11cmwnLCBpbmZvLnV1aWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFwYXRoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgRWRpdG9yLkRpYWxvZy5lcnJvcign5peg5rOV6I635Y+W6LWE5rqQ6Lev5b6EJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBidW5kbGVJbmZvID0gYXdhaXQgZmluZExhc3RCdW5kbGVEaXJlY3RvcnkocGF0aCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWJ1bmRsZUluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBFZGl0b3IuRGlhbG9nLmVycm9yKCfmnKrmib7liLDljIXlkKsgQXNzZXQgQnVuZGxlIOeahOebruW9lSwg6K+356Gu6K6k6LWE5rqQ5L2N5LqO5p+Q5LiqIEJ1bmRsZSDkuIsnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCB0ZXh0ID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChidW5kbGVJbmZvLmlzUGxpc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZXh0ID0gYnVuZGxlSW5mby5uYW1lICsgXCIvXCIgKyBidW5kbGVJbmZvLnJlbGF0aXZlUGF0aCArIFwiLnBsaXN0XCIgKyBcIi9cIiArIGJ1bmRsZUluZm8uc3ByaXRlRnJhbWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRleHQgPSBidW5kbGVJbmZvLm5hbWUgKyBcIi9cIiArIGJ1bmRsZUluZm8ucmVsYXRpdmVQYXRoO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBFZGl0b3IuQ2xpcGJvYXJkLndyaXRlKFwidGV4dFwiLCB0ZXh0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIEVkaXRvci5EaWFsb2cuaW5mbyhgaTE4buS/oeaBr+W3suWkjeWItuWIsOWJqui0tOadv2AsIHsgdGl0bGU6ICflpI3liLbmiJDlip8nIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICB9XG4gICAgXTtcbn1cbiJdfQ==