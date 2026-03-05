"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTemplate = void 0;
const fs_1 = require("fs");
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const https = __importStar(require("https"));
const child_process_1 = require("child_process");
async function createTemplate() {
    console.log("开始创建模板");
    console.log("创建调试面板自定义宏");
    let macroCustom = await Editor.Profile.getProject("engine", "macroCustom", "project");
    if (!macroCustom) {
        macroCustom = [
            {
                key: "OPEN_DEBUG_PANEL",
                value: true
            }
        ];
    }
    if (!Array.isArray(macroCustom)) {
        console.error("macroCustom is not an array, resetting to default.");
        return;
    }
    const openDebugPanel = macroCustom.find(item => item.key === "OPEN_DEBUG_PANEL");
    if (openDebugPanel) {
        openDebugPanel.value = true;
    }
    Editor.Profile.setProject("engine", "macroCustom", macroCustom, "project");
    const editorPath = Editor.Project.path;
    const assetsPath = `${editorPath}/assets`;
    const scriptsPath = `${assetsPath}/scripts`;
    // 判断有没有launch.ts文件
    const launchFilePath = `${scriptsPath}/launch.ts`;
    if ((0, fs_1.existsSync)(launchFilePath)) {
        console.error("检查已存在launch.ts文件, 不需要创建模板");
        return;
    }
    // 去github下载模版项目
    const templateUrl = "https://github.com/ksgames26/project-templete";
    // 实现在这里
    try {
        console.log(`开始从 ${templateUrl} 下载模板项目`);
        const urlParts = templateUrl.split('/');
        if (urlParts.length < 5 || urlParts[2] !== 'github.com') {
            console.error(`无效的 GitHub URL 格式: ${templateUrl}`);
            return;
        }
        const owner = urlParts[3];
        const repoName = urlParts[4].replace(/\.git$/, ''); // 移除可能的 .git 后缀
        const targetDirInAssets = path.join(assetsPath, repoName);
        console.log(`模板项目将下载到: ${targetDirInAssets}`);
        // 如果目标目录已存在，则先删除 (实现覆盖逻辑)
        if (fs.existsSync(targetDirInAssets)) {
            console.log(`目标目录 ${targetDirInAssets} 已存在，将执行覆盖操作。正在删除旧目录...`);
            await fs.remove(targetDirInAssets);
            console.log(`旧目录 ${targetDirInAssets} 已删除。`);
        }
        await fs.ensureDir(targetDirInAssets);
        const zipUrl = `https://github.com/${owner}/${repoName}/archive/refs/heads/main.zip`;
        const tempZipFileName = `${repoName}-main.zip`; // 临时ZIP文件名
        const zipFilePath = path.join(assetsPath, tempZipFileName); // 将ZIP文件临时存放在assets目录下
        console.log(`正在从 ${zipUrl} 下载 ZIP 文件到 ${zipFilePath}`);
        await new Promise((resolve, reject) => {
            const fileStream = fs.createWriteStream(zipFilePath);
            const requestOptions = {
                headers: {
                    'User-Agent': 'Cocos-Creator-Template-Downloader'
                }
            };
            https.get(zipUrl, requestOptions, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    if (!response.headers.location) {
                        fs.unlink(zipFilePath, () => { }); // 清理不完整的zip
                        reject(new Error('下载重定向时未找到 location header'));
                        return;
                    }
                    console.log(`请求被重定向到: ${response.headers.location}`);
                    https.get(response.headers.location, requestOptions, (redirectResponse) => {
                        if (redirectResponse.statusCode !== 200) {
                            fs.unlink(zipFilePath, () => { });
                            reject(new Error(`下载 ZIP 文件失败，状态码: ${redirectResponse.statusCode}`));
                            return;
                        }
                        redirectResponse.pipe(fileStream);
                        fileStream.on('finish', () => {
                            fileStream.close();
                            console.log('ZIP 文件下载完成。');
                            resolve();
                        });
                    }).on('error', (err) => {
                        fs.unlink(zipFilePath, () => { });
                        reject(new Error(`下载重定向的 ZIP 文件时发生错误: ${err.message}`));
                    });
                    return;
                }
                if (response.statusCode !== 200) {
                    fs.unlink(zipFilePath, () => { });
                    reject(new Error(`下载 ZIP 文件失败，状态码: ${response.statusCode}`));
                    return;
                }
                response.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close();
                    console.log('ZIP 文件下载完成。');
                    resolve();
                });
            }).on('error', (err) => {
                fs.unlink(zipFilePath, () => { }); // 清理
                reject(new Error(`下载 ZIP 文件时发生错误: ${err.message}`));
            });
        });
        console.log('开始解压 ZIP 文件...');
        // 创建一个唯一的临时解压目录，以避免冲突，并放在 assetsPath 外层，如项目根目录的 .temp
        const projectRoot = Editor.Project.path;
        const tempExtractDir = path.join(projectRoot, `.temp_extract_${repoName}_${Date.now()}`);
        await fs.ensureDir(tempExtractDir);
        const isWindows = process.platform === 'win32';
        let unzipCommand;
        if (isWindows) {
            // PowerShell 命令需要确保路径正确处理，特别是包含空格或特殊字符时
            const psZipFilePath = zipFilePath.replace(/'/g, "''");
            const psTempExtractDir = tempExtractDir.replace(/'/g, "''");
            unzipCommand = `powershell -command "Expand-Archive -Path '${psZipFilePath}' -DestinationPath '${psTempExtractDir}' -Force"`;
        }
        else {
            unzipCommand = `unzip -o "${zipFilePath}" -d "${tempExtractDir}"`; // -o 表示覆盖已存在文件而不询问
        }
        console.log(`执行解压命令: ${unzipCommand}`);
        await new Promise((resolve, reject) => {
            (0, child_process_1.exec)(unzipCommand, (error, stdout, stderr) => {
                if (error) {
                    console.error(`解压 ZIP 文件失败: ${error.message}`);
                    console.error(`Stderr: ${stderr}`);
                    reject(error);
                    return;
                }
                console.log(`解压输出: ${stdout}`);
                resolve();
            });
        });
        console.log('ZIP 文件解压完成。正在移动文件...');
        // GitHub ZIP 包通常会包含一个与仓库名和分支名相关的根目录，例如 'project-temlete-main'
        const extractedItems = await fs.readdir(tempExtractDir);
        let sourceDirToMove = tempExtractDir;
        if (extractedItems.length === 1) {
            const firstItemPath = path.join(tempExtractDir, extractedItems[0]);
            if ((await fs.stat(firstItemPath)).isDirectory()) {
                // 假设这个单目录就是包含所有内容的目录
                sourceDirToMove = firstItemPath;
                console.log(`内容在子目录 ${extractedItems[0]} 中，将从此处移动。`);
            }
        }
        const filesToMove = await fs.readdir(sourceDirToMove);
        for (const file of filesToMove) {
            const srcPath = path.join(sourceDirToMove, file);
            const destPath = path.join(targetDirInAssets, file);
            await fs.move(srcPath, destPath, { overwrite: true });
        }
        console.log(`文件已移动到 ${targetDirInAssets}`);
        console.log('清理临时文件...');
        await fs.remove(zipFilePath);
        await fs.remove(tempExtractDir);
        console.log('临时文件清理完成。');
        // 将模板项目中的 assets 文件夹内容移动到项目根 assets 目录，并删除模板项目原目录
        console.log(`准备处理模板项目 ${repoName} 的内部 assets 文件夹...`);
        const templateInnerAssetsPath = path.join(targetDirInAssets, 'assets');
        if (fs.existsSync(templateInnerAssetsPath) && (await fs.stat(templateInnerAssetsPath)).isDirectory()) {
            console.log(`发现模板内部 assets 文件夹: ${templateInnerAssetsPath}`);
            console.log(`将其内容移动到项目主 assets 目录: ${assetsPath}`);
            const itemsInTemplateAssets = await fs.readdir(templateInnerAssetsPath);
            for (const item of itemsInTemplateAssets) {
                const sourceItemPath = path.join(templateInnerAssetsPath, item);
                const destinationItemPath = path.join(assetsPath, item); // assetsPath 是项目的主 assets 目录
                // 如果目标已存在，先尝试删除，确保 move 操作对于文件夹能正确覆盖
                if (fs.existsSync(destinationItemPath)) {
                    console.log(`目标路径 ${destinationItemPath} 已存在，将先删除以进行覆盖。`);
                    await fs.remove(destinationItemPath);
                }
                await fs.move(sourceItemPath, destinationItemPath, { overwrite: true }); // overwrite 适用于文件，对于目录，先删除再移动更可靠
                console.log(`已移动 ${item} 到 ${destinationItemPath}`);
            }
            console.log('模板内部 assets 内容移动完成。');
        }
        else {
            console.log(`模板项目 ${repoName} 中未找到内部 assets 文件夹，或其不是一个目录。跳过移动内部 assets 步骤。`);
        }
        console.log(`删除模板项目原始根目录: ${targetDirInAssets}`);
        await fs.remove(targetDirInAssets);
        console.log(`模板项目原始根目录 ${targetDirInAssets} 已删除。`);
        console.log('刷新 Cocos Creator 资源数据库...');
        Editor.Message.send('asset-db', 'refresh');
        console.log('资源数据库刷新请求已发送。');
        console.log(`模板项目 ${repoName} 已成功下载并解压到 ${targetDirInAssets}`);
    }
    catch (error) {
        console.error(`创建模板过程中发生错误: ${error.message}`);
        if (error.stack) {
            console.error(error.stack);
        }
    }
}
exports.createTemplate = createTemplate;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvY3JlYXRlVGVtcGxldGUvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwyQkFBZ0M7QUFDaEMsNkNBQStCO0FBQy9CLDJDQUE2QjtBQUM3Qiw2Q0FBK0I7QUFDL0IsaURBQXFDO0FBRTlCLEtBQUssVUFBVSxjQUFjO0lBQ2hDLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7SUFFdEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUMxQixJQUFJLFdBQVcsR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLFFBQVEsRUFBRSxhQUFhLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFFdEYsSUFBSSxDQUFDLFdBQVcsRUFBRTtRQUNkLFdBQVcsR0FBRztZQUNWO2dCQUNJLEdBQUcsRUFBRSxrQkFBa0I7Z0JBQ3ZCLEtBQUssRUFBRSxJQUFJO2FBQ2Q7U0FDSixDQUFDO0tBQ0w7SUFFRCxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsRUFBRTtRQUM3QixPQUFPLENBQUMsS0FBSyxDQUFDLG9EQUFvRCxDQUFDLENBQUM7UUFDcEUsT0FBTztLQUNWO0lBRUQsTUFBTSxjQUFjLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLEtBQUssa0JBQWtCLENBQUMsQ0FBQztJQUNqRixJQUFJLGNBQWMsRUFBRTtRQUNoQixjQUFjLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztLQUMvQjtJQUVELE1BQU0sQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLFFBQVEsRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBRTNFLE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxPQUFP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QUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLGlDQUFpQztnQkFDMUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPLElBQUksTUFBTSxtQkFBbUIsRUFBRSxDQUFDLENBQUM7YUFDdkQ7WUFDRCxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7U0FDdEM7YUFBTTtZQUNILE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxRQUFRLCtDQUErQyxDQUFDLENBQUM7U0FDaEY7UUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixpQkFBaUIsRUFBRSxDQUFDLENBQUM7UUFDakQsTUFBTSxFQUFFLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDbkMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLGlCQUFpQixPQUFPLENBQUMsQ0FBQztRQUVuRCxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDLENBQUM7UUFDekMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzNDLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7UUFFN0IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLFFBQVEsY0FBYyxpQkFBaUIsRUFBRSxDQUFDLENBQUM7S0FFbEU7SUFBQyxPQUFPLEtBQVUsRUFBRTtRQUNqQixPQUFPLENBQUMsS0FBSyxDQUFDLGdCQUFnQixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUMvQyxJQUFJLEtBQUssQ0FBQyxLQUFLLEVBQUU7WUFDYixPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztTQUM5QjtLQUNKO0FBQ0wsQ0FBQztBQTVORCx3Q0E0TkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBleGlzdHNTeW5jIH0gZnJvbSBcImZzXCI7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcy1leHRyYSc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0ICogYXMgaHR0cHMgZnJvbSAnaHR0cHMnO1xuaW1wb3J0IHsgZXhlYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY3JlYXRlVGVtcGxhdGUoKSB7XG4gICAgY29uc29sZS5sb2coXCLlvIDlp4vliJvlu7rmqKHmnb9cIik7XG5cbiAgICBjb25zb2xlLmxvZyhcIuWIm+W7uuiwg+ivlemdouadv+iHquWumuS5ieWuj1wiKTtcbiAgICBsZXQgbWFjcm9DdXN0b20gPSBhd2FpdCBFZGl0b3IuUHJvZmlsZS5nZXRQcm9qZWN0KFwiZW5naW5lXCIsIFwibWFjcm9DdXN0b21cIiwgXCJwcm9qZWN0XCIpO1xuXG4gICAgaWYgKCFtYWNyb0N1c3RvbSkge1xuICAgICAgICBtYWNyb0N1c3RvbSA9IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBrZXk6IFwiT1BFTl9ERUJVR19QQU5FTFwiLFxuICAgICAgICAgICAgICAgIHZhbHVlOiB0cnVlXG4gICAgICAgICAgICB9XG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KG1hY3JvQ3VzdG9tKSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwibWFjcm9DdXN0b20gaXMgbm90IGFuIGFycmF5LCByZXNldHRpbmcgdG8gZGVmYXVsdC5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBvcGVuRGVidWdQYW5lbCA9IG1hY3JvQ3VzdG9tLmZpbmQoaXRlbSA9PiBpdGVtLmtleSA9PT0gXCJPUEVOX0RFQlVHX1BBTkVMXCIpO1xuICAgIGlmIChvcGVuRGVidWdQYW5lbCkge1xuICAgICAgICBvcGVuRGVidWdQYW5lbC52YWx1ZSA9IHRydWU7XG4gICAgfVxuXG4gICAgRWRpdG9yLlByb2ZpbGUuc2V0UHJvamVjdChcImVuZ2luZVwiLCBcIm1hY3JvQ3VzdG9tXCIsIG1hY3JvQ3VzdG9tLCBcInByb2plY3RcIik7XG5cbiAgICBjb25zdCBlZGl0b3JQYXRoID0gRWRpdG9yLlByb2plY3QucGF0aDtcbiAgICBjb25zdCBhc3NldHNQYXRoID0gYCR7ZWRpdG9yUGF0aH0vYXNzZXRzYDtcbiAgICBjb25zdCBzY3JpcHRzUGF0aCA9IGAke2Fzc2V0c1BhdGh9L3NjcmlwdHNgO1xuXG4gICAgLy8g5Yik5pat5pyJ5rKh5pyJbGF1bmNoLnRz5paH5Lu2XG4gICAgY29uc3QgbGF1bmNoRmlsZVBhdGggPSBgJHtzY3JpcHRzUGF0aH0vbGF1bmNoLnRzYDtcbiAgICBpZiAoZXhpc3RzU3luYyhsYXVuY2hGaWxlUGF0aCkpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIuajgOafpeW3suWtmOWcqGxhdW5jaC50c+aWh+S7tiwg5LiN6ZyA6KaB5Yib5bu65qih5p2/XCIpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8g5Y67Z2l0aHVi5LiL6L295qih54mI6aG555uuXG4gICAgY29uc3QgdGVtcGxhdGVVcmwgPSBcImh0dHBzOi8vZ2l0aHViLmNvbS9rc2dhbWVzMjYvcHJvamVjdC10ZW1wbGV0ZVwiO1xuXG4gICAgLy8g5a6e546w5Zyo6L+Z6YeMXG4gICAgdHJ5IHtcbiAgICAgICAgY29uc29sZS5sb2coYOW8gOWni+S7jiAke3RlbXBsYXRlVXJsfSDkuIvovb3mqKHmnb/pobnnm65gKTtcblxuICAgICAgICBjb25zdCB1cmxQYXJ0cyA9IHRlbXBsYXRlVXJsLnNwbGl0KCcvJyk7XG4gICAgICAgIGlmICh1cmxQYXJ0cy5sZW5ndGggPCA1IHx8IHVybFBhcnRzWzJdICE9PSAnZ2l0aHViLmNvbScpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYOaXoOaViOeahCBHaXRIdWIgVVJMIOagvOW8jzogJHt0ZW1wbGF0ZVVybH1gKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBvd25lciA9IHVybFBhcnRzWzNdO1xuICAgICAgICBjb25zdCByZXBvTmFtZSA9IHVybFBhcnRzWzRdLnJlcGxhY2UoL1xcLmdpdCQvLCAnJyk7IC8vIOenu+mZpOWPr+iDveeahCAuZ2l0IOWQjue8gFxuXG4gICAgICAgIGNvbnN0IHRhcmdldERpckluQXNzZXRzID0gcGF0aC5qb2luKGFzc2V0c1BhdGgsIHJlcG9OYW1lKTtcbiAgICAgICAgY29uc29sZS5sb2coYOaooeadv+mhueebruWwhuS4i+i9veWIsDogJHt0YXJnZXREaXJJbkFzc2V0c31gKTtcblxuICAgICAgICAvLyDlpoLmnpznm67moIfnm67lvZXlt7LlrZjlnKjvvIzliJnlhYjliKDpmaQgKOWunueOsOimhueblumAu+i+kSlcbiAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmModGFyZ2V0RGlySW5Bc3NldHMpKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhg55uu5qCH55uu5b2VICR7dGFyZ2V0RGlySW5Bc3NldHN9IOW3suWtmOWcqO+8jOWwhuaJp+ihjOimhuebluaTjeS9nOOAguato+WcqOWIoOmZpOaXp+ebruW9lS4uLmApO1xuICAgICAgICAgICAgYXdhaXQgZnMucmVtb3ZlKHRhcmdldERpckluQXNzZXRzKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDml6fnm67lvZUgJHt0YXJnZXREaXJJbkFzc2V0c30g5bey5Yig6Zmk44CCYCk7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgZnMuZW5zdXJlRGlyKHRhcmdldERpckluQXNzZXRzKTtcblxuICAgICAgICBjb25zdCB6aXBVcmwgPSBgaHR0cHM6Ly9naXRodWIuY29tLyR7b3duZXJ9LyR7cmVwb05hbWV9L2FyY2hpdmUvcmVmcy9oZWFkcy9tYWluLnppcGA7XG4gICAgICAgIGNvbnN0IHRlbXBaaXBGaWxlTmFtZSA9IGAke3JlcG9OYW1lfS1tYWluLnppcGA7IC8vIOS4tOaXtlpJUOaWh+S7tuWQjVxuICAgICAgICBjb25zdCB6aXBGaWxlUGF0aCA9IHBhdGguam9pbihhc3NldHNQYXRoLCB0ZW1wWmlwRmlsZU5hbWUpOyAvLyDlsIZaSVDmlofku7bkuLTml7blrZjmlL7lnKhhc3NldHPnm67lvZXkuItcblxuICAgICAgICBjb25zb2xlLmxvZyhg5q2j5Zyo5LuOICR7emlwVXJsfSDkuIvovb0gWklQIOaWh+S7tuWIsCAke3ppcEZpbGVQYXRofWApO1xuXG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGZpbGVTdHJlYW0gPSBmcy5jcmVhdGVXcml0ZVN0cmVhbSh6aXBGaWxlUGF0aCk7XG4gICAgICAgICAgICBjb25zdCByZXF1ZXN0T3B0aW9ucyA9IHtcbiAgICAgICAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAgICAgICAgICdVc2VyLUFnZW50JzogJ0NvY29zLUNyZWF0b3ItVGVtcGxhdGUtRG93bmxvYWRlcidcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaHR0cHMuZ2V0KHppcFVybCwgcmVxdWVzdE9wdGlvbnMsIChyZXNwb25zZSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5zdGF0dXNDb2RlID09PSAzMDEgfHwgcmVzcG9uc2Uuc3RhdHVzQ29kZSA9PT0gMzAyKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghcmVzcG9uc2UuaGVhZGVycy5sb2NhdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZnMudW5saW5rKHppcEZpbGVQYXRoLCAoKSA9PiB7fSk7IC8vIOa4heeQhuS4jeWujOaVtOeahHppcFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcign5LiL6L296YeN5a6a5ZCR5pe25pyq5om+5YiwIGxvY2F0aW9uIGhlYWRlcicpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg6K+35rGC6KKr6YeN5a6a5ZCR5YiwOiAke3Jlc3BvbnNlLmhlYWRlcnMubG9jYXRpb259YCk7XG4gICAgICAgICAgICAgICAgICAgIGh0dHBzLmdldChyZXNwb25zZS5oZWFkZXJzLmxvY2F0aW9uLCByZXF1ZXN0T3B0aW9ucywgKHJlZGlyZWN0UmVzcG9uc2UpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZWRpcmVjdFJlc3BvbnNlLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZzLnVubGluayh6aXBGaWxlUGF0aCwgKCkgPT4ge30pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYOS4i+i9vSBaSVAg5paH5Lu25aSx6LSl77yM54q25oCB56CBOiAke3JlZGlyZWN0UmVzcG9uc2Uuc3RhdHVzQ29kZX1gKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmVkaXJlY3RSZXNwb25zZS5waXBlKGZpbGVTdHJlYW0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgZmlsZVN0cmVhbS5vbignZmluaXNoJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbGVTdHJlYW0uY2xvc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnWklQIOaWh+S7tuS4i+i9veWujOaIkOOAgicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9KS5vbignZXJyb3InLCAoZXJyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmcy51bmxpbmsoemlwRmlsZVBhdGgsICgpID0+IHt9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYOS4i+i9vemHjeWumuWQkeeahCBaSVAg5paH5Lu25pe25Y+R55Sf6ZSZ6K+vOiAke2Vyci5tZXNzYWdlfWApKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzQ29kZSAhPT0gMjAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGZzLnVubGluayh6aXBGaWxlUGF0aCwgKCkgPT4ge30pO1xuICAgICAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGDkuIvovb0gWklQIOaWh+S7tuWksei0pe+8jOeKtuaAgeeggTogJHtyZXNwb25zZS5zdGF0dXNDb2RlfWApKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXNwb25zZS5waXBlKGZpbGVTdHJlYW0pO1xuICAgICAgICAgICAgICAgIGZpbGVTdHJlYW0ub24oJ2ZpbmlzaCcsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgZmlsZVN0cmVhbS5jbG9zZSgpO1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnWklQIOaWh+S7tuS4i+i9veWujOaIkOOAgicpO1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KS5vbignZXJyb3InLCAoZXJyKSA9PiB7XG4gICAgICAgICAgICAgICAgZnMudW5saW5rKHppcEZpbGVQYXRoLCAoKSA9PiB7fSk7IC8vIOa4heeQhlxuICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYOS4i+i9vSBaSVAg5paH5Lu25pe25Y+R55Sf6ZSZ6K+vOiAke2Vyci5tZXNzYWdlfWApKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zb2xlLmxvZygn5byA5aeL6Kej5Y6LIFpJUCDmlofku7YuLi4nKTtcbiAgICAgICAgLy8g5Yib5bu65LiA5Liq5ZSv5LiA55qE5Li05pe26Kej5Y6L55uu5b2V77yM5Lul6YG/5YWN5Yay56qB77yM5bm25pS+5ZyoIGFzc2V0c1BhdGgg5aSW5bGC77yM5aaC6aG555uu5qC555uu5b2V55qEIC50ZW1wXG4gICAgICAgIGNvbnN0IHByb2plY3RSb290ID0gRWRpdG9yLlByb2plY3QucGF0aDtcbiAgICAgICAgY29uc3QgdGVtcEV4dHJhY3REaXIgPSBwYXRoLmpvaW4ocHJvamVjdFJvb3QsIGAudGVtcF9leHRyYWN0XyR7cmVwb05hbWV9XyR7RGF0ZS5ub3coKX1gKTtcbiAgICAgICAgYXdhaXQgZnMuZW5zdXJlRGlyKHRlbXBFeHRyYWN0RGlyKTtcblxuICAgICAgICBjb25zdCBpc1dpbmRvd3MgPSBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInO1xuICAgICAgICBsZXQgdW56aXBDb21tYW5kOiBzdHJpbmc7XG4gICAgICAgIGlmIChpc1dpbmRvd3MpIHtcbiAgICAgICAgICAgIC8vIFBvd2VyU2hlbGwg5ZG95Luk6ZyA6KaB56Gu5L+d6Lev5b6E5q2j56Gu5aSE55CG77yM54m55Yir5piv5YyF5ZCr56m65qC85oiW54m55q6K5a2X56ym5pe2XG4gICAgICAgICAgICBjb25zdCBwc1ppcEZpbGVQYXRoID0gemlwRmlsZVBhdGgucmVwbGFjZSgvJy9nLCBcIicnXCIpO1xuICAgICAgICAgICAgY29uc3QgcHNUZW1wRXh0cmFjdERpciA9IHRlbXBFeHRyYWN0RGlyLnJlcGxhY2UoLycvZywgXCInJ1wiKTtcbiAgICAgICAgICAgIHVuemlwQ29tbWFuZCA9IGBwb3dlcnNoZWxsIC1jb21tYW5kIFwiRXhwYW5kLUFyY2hpdmUgLVBhdGggJyR7cHNaaXBGaWxlUGF0aH0nIC1EZXN0aW5hdGlvblBhdGggJyR7cHNUZW1wRXh0cmFjdERpcn0nIC1Gb3JjZVwiYDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVuemlwQ29tbWFuZCA9IGB1bnppcCAtbyBcIiR7emlwRmlsZVBhdGh9XCIgLWQgXCIke3RlbXBFeHRyYWN0RGlyfVwiYDsgLy8gLW8g6KGo56S66KaG55uW5bey5a2Y5Zyo5paH5Lu26ICM5LiN6K+i6ZeuXG4gICAgICAgIH1cblxuICAgICAgICBjb25zb2xlLmxvZyhg5omn6KGM6Kej5Y6L5ZG95LukOiAke3VuemlwQ29tbWFuZH1gKTtcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgZXhlYyh1bnppcENvbW1hbmQsIChlcnJvciwgc3Rkb3V0LCBzdGRlcnIpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihg6Kej5Y6LIFpJUCDmlofku7blpLHotKU6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgU3RkZXJyOiAke3N0ZGVycn1gKTtcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg6Kej5Y6L6L6T5Ye6OiAke3N0ZG91dH1gKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc29sZS5sb2coJ1pJUCDmlofku7bop6PljovlrozmiJDjgILmraPlnKjnp7vliqjmlofku7YuLi4nKTtcbiAgICAgICAgLy8gR2l0SHViIFpJUCDljIXpgJrluLjkvJrljIXlkKvkuIDkuKrkuI7ku5PlupPlkI3lkozliIbmlK/lkI3nm7jlhbPnmoTmoLnnm67lvZXvvIzkvovlpoIgJ3Byb2plY3QtdGVtbGV0ZS1tYWluJ1xuICAgICAgICBjb25zdCBleHRyYWN0ZWRJdGVtcyA9IGF3YWl0IGZzLnJlYWRkaXIodGVtcEV4dHJhY3REaXIpO1xuICAgICAgICBsZXQgc291cmNlRGlyVG9Nb3ZlID0gdGVtcEV4dHJhY3REaXI7XG4gICAgICAgIGlmIChleHRyYWN0ZWRJdGVtcy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIGNvbnN0IGZpcnN0SXRlbVBhdGggPSBwYXRoLmpvaW4odGVtcEV4dHJhY3REaXIsIGV4dHJhY3RlZEl0ZW1zWzBdKTtcbiAgICAgICAgICAgIGlmICgoYXdhaXQgZnMuc3RhdChmaXJzdEl0ZW1QYXRoKSkuaXNEaXJlY3RvcnkoKSkge1xuICAgICAgICAgICAgICAgIC8vIOWBh+iuvui/meS4quWNleebruW9leWwseaYr+WMheWQq+aJgOacieWGheWuueeahOebruW9lVxuICAgICAgICAgICAgICAgIHNvdXJjZURpclRvTW92ZSA9IGZpcnN0SXRlbVBhdGg7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYOWGheWuueWcqOWtkOebruW9lSAke2V4dHJhY3RlZEl0ZW1zWzBdfSDkuK3vvIzlsIbku47mraTlpITnp7vliqjjgIJgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGZpbGVzVG9Nb3ZlID0gYXdhaXQgZnMucmVhZGRpcihzb3VyY2VEaXJUb01vdmUpO1xuICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXNUb01vdmUpIHtcbiAgICAgICAgICAgIGNvbnN0IHNyY1BhdGggPSBwYXRoLmpvaW4oc291cmNlRGlyVG9Nb3ZlLCBmaWxlKTtcbiAgICAgICAgICAgIGNvbnN0IGRlc3RQYXRoID0gcGF0aC5qb2luKHRhcmdldERpckluQXNzZXRzLCBmaWxlKTtcbiAgICAgICAgICAgIGF3YWl0IGZzLm1vdmUoc3JjUGF0aCwgZGVzdFBhdGgsIHsgb3ZlcndyaXRlOiB0cnVlIH0pO1xuICAgICAgICB9XG4gICAgICAgIGNvbnNvbGUubG9nKGDmlofku7blt7Lnp7vliqjliLAgJHt0YXJnZXREaXJJbkFzc2V0c31gKTtcblxuICAgICAgICBjb25zb2xlLmxvZygn5riF55CG5Li05pe25paH5Lu2Li4uJyk7XG4gICAgICAgIGF3YWl0IGZzLnJlbW92ZSh6aXBGaWxlUGF0aCk7XG4gICAgICAgIGF3YWl0IGZzLnJlbW92ZSh0ZW1wRXh0cmFjdERpcik7XG4gICAgICAgIGNvbnNvbGUubG9nKCfkuLTml7bmlofku7bmuIXnkIblrozmiJDjgIInKTtcblxuICAgICAgICAvLyDlsIbmqKHmnb/pobnnm67kuK3nmoQgYXNzZXRzIOaWh+S7tuWkueWGheWuueenu+WKqOWIsOmhueebruaguSBhc3NldHMg55uu5b2V77yM5bm25Yig6Zmk5qih5p2/6aG555uu5Y6f55uu5b2VXG4gICAgICAgIGNvbnNvbGUubG9nKGDlh4blpIflpITnkIbmqKHmnb/pobnnm64gJHtyZXBvTmFtZX0g55qE5YaF6YOoIGFzc2V0cyDmlofku7blpLkuLi5gKTtcbiAgICAgICAgY29uc3QgdGVtcGxhdGVJbm5lckFzc2V0c1BhdGggPSBwYXRoLmpvaW4odGFyZ2V0RGlySW5Bc3NldHMsICdhc3NldHMnKTtcblxuICAgICAgICBpZiAoZnMuZXhpc3RzU3luYyh0ZW1wbGF0ZUlubmVyQXNzZXRzUGF0aCkgJiYgKGF3YWl0IGZzLnN0YXQodGVtcGxhdGVJbm5lckFzc2V0c1BhdGgpKS5pc0RpcmVjdG9yeSgpKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhg5Y+R546w5qih5p2/5YaF6YOoIGFzc2V0cyDmlofku7blpLk6ICR7dGVtcGxhdGVJbm5lckFzc2V0c1BhdGh9YCk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhg5bCG5YW25YaF5a6556e75Yqo5Yiw6aG555uu5Li7IGFzc2V0cyDnm67lvZU6ICR7YXNzZXRzUGF0aH1gKTtcblxuICAgICAgICAgICAgY29uc3QgaXRlbXNJblRlbXBsYXRlQXNzZXRzID0gYXdhaXQgZnMucmVhZGRpcih0ZW1wbGF0ZUlubmVyQXNzZXRzUGF0aCk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXNJblRlbXBsYXRlQXNzZXRzKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc291cmNlSXRlbVBhdGggPSBwYXRoLmpvaW4odGVtcGxhdGVJbm5lckFzc2V0c1BhdGgsIGl0ZW0pO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRlc3RpbmF0aW9uSXRlbVBhdGggPSBwYXRoLmpvaW4oYXNzZXRzUGF0aCwgaXRlbSk7IC8vIGFzc2V0c1BhdGgg5piv6aG555uu55qE5Li7IGFzc2V0cyDnm67lvZVcblxuICAgICAgICAgICAgICAgIC8vIOWmguaenOebruagh+W3suWtmOWcqO+8jOWFiOWwneivleWIoOmZpO+8jOehruS/nSBtb3ZlIOaTjeS9nOWvueS6juaWh+S7tuWkueiDveato+ehruimhuebllxuICAgICAgICAgICAgICAgIGlmIChmcy5leGlzdHNTeW5jKGRlc3RpbmF0aW9uSXRlbVBhdGgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDnm67moIfot6/lvoQgJHtkZXN0aW5hdGlvbkl0ZW1QYXRofSDlt7LlrZjlnKjvvIzlsIblhYjliKDpmaTku6Xov5vooYzopobnm5bjgIJgKTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgZnMucmVtb3ZlKGRlc3RpbmF0aW9uSXRlbVBhdGgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBhd2FpdCBmcy5tb3ZlKHNvdXJjZUl0ZW1QYXRoLCBkZXN0aW5hdGlvbkl0ZW1QYXRoLCB7IG92ZXJ3cml0ZTogdHJ1ZSB9KTsgLy8gb3ZlcndyaXRlIOmAgueUqOS6juaWh+S7tu+8jOWvueS6juebruW9le+8jOWFiOWIoOmZpOWGjeenu+WKqOabtOWPr+mdoFxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDlt7Lnp7vliqggJHtpdGVtfSDliLAgJHtkZXN0aW5hdGlvbkl0ZW1QYXRofWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc29sZS5sb2coJ+aooeadv+WGhemDqCBhc3NldHMg5YaF5a6556e75Yqo5a6M5oiQ44CCJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhg5qih5p2/6aG555uuICR7cmVwb05hbWV9IOS4reacquaJvuWIsOWGhemDqCBhc3NldHMg5paH5Lu25aS577yM5oiW5YW25LiN5piv5LiA5Liq55uu5b2V44CC6Lez6L+H56e75Yqo5YaF6YOoIGFzc2V0cyDmraXpqqTjgIJgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnNvbGUubG9nKGDliKDpmaTmqKHmnb/pobnnm67ljp/lp4vmoLnnm67lvZU6ICR7dGFyZ2V0RGlySW5Bc3NldHN9YCk7XG4gICAgICAgIGF3YWl0IGZzLnJlbW92ZSh0YXJnZXREaXJJbkFzc2V0cyk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDmqKHmnb/pobnnm67ljp/lp4vmoLnnm67lvZUgJHt0YXJnZXREaXJJbkFzc2V0c30g5bey5Yig6Zmk44CCYCk7XG5cbiAgICAgICAgY29uc29sZS5sb2coJ+WIt+aWsCBDb2NvcyBDcmVhdG9yIOi1hOa6kOaVsOaNruW6ky4uLicpO1xuICAgICAgICBFZGl0b3IuTWVzc2FnZS5zZW5kKCdhc3NldC1kYicsICdyZWZyZXNoJyk7IFxuICAgICAgICBjb25zb2xlLmxvZygn6LWE5rqQ5pWw5o2u5bqT5Yi35paw6K+35rGC5bey5Y+R6YCB44CCJyk7XG5cbiAgICAgICAgY29uc29sZS5sb2coYOaooeadv+mhueebriAke3JlcG9OYW1lfSDlt7LmiJDlip/kuIvovb3lubbop6PljovliLAgJHt0YXJnZXREaXJJbkFzc2V0c31gKTtcblxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg5Yib5bu65qih5p2/6L+H56iL5Lit5Y+R55Sf6ZSZ6K+vOiAke2Vycm9yLm1lc3NhZ2V9YCk7XG4gICAgICAgIGlmIChlcnJvci5zdGFjaykge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlcnJvci5zdGFjayk7XG4gICAgICAgIH1cbiAgICB9XG59Il19