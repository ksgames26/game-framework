"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onRootMenu = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const ts_morph_1 = require("ts-morph");
const shortNames = {
    // UI 组件
    'lab': 'cc.Label',
    'btn': 'cc.Button',
    'spr': 'cc.Sprite',
    'scr': 'cc.ScrollView',
    'lay': 'cc.Layout',
    'tog': 'cc.Toggle',
    'edt': 'cc.EditBox',
    'rtx': 'cc.RichText',
    'pgv': 'cc.PageView',
    'prg': 'cc.ProgressBar',
    'sld': 'cc.Slider',
    'msk': 'cc.Mask',
    'wgt': 'cc.Widget',
    'uit': 'cc.UITransform',
    // 多媒体组件
    'ani': 'cc.Animation',
    'aud': 'cc.AudioSource',
    'vid': 'cc.VideoPlayer',
    'wbv': 'cc.WebView',
    // 渲染相关
    'cam': 'cc.Camera',
    'gfx': 'cc.Graphics',
    'pts': 'cc.ParticleSystem',
    'lit': 'cc.LightComponent',
    'mdl': 'cc.ModelComponent',
    // 动画相关
    'skl': 'cc.Skeleton',
    'ast': 'cc.AnimationState',
    'acl': 'cc.AnimationClip',
    'anc': 'cc.AnimationController',
    // 其他
    'cvs': 'cc.Canvas',
    'sfa': 'cc.SafeArea',
    'bie': 'cc.BlockInputEvents' // 输入阻挡
};
function isSameType(types, name) {
    // 检查是否已经存在同名节点
    const existingType = types.find(t => t.name === name);
    if (existingType) {
        Editor.Dialog.error(`警告: 发现重复的节点名称 "${name}"`);
        throw new Error(`警告: 发现重复的节点名称 "${name}"`);
    }
}
function traversePrefabNode(node, prefab, types) {
    var _a;
    if (node._name.startsWith('_')) {
        const components = node._components;
        const name = (_a = node._name) !== null && _a !== void 0 ? _a : "";
        let find = false;
        // 如果是用短名称开头，则说明成员变量要用对应的组件类型
        for (const o in shortNames) {
            if (name.startsWith("_" + o)) {
                const compInfoID = components.find((comp) => {
                    const compInfo = prefab[comp.__id__];
                    return compInfo.__type__ == shortNames[o];
                });
                if (compInfoID) {
                    const compInfo = prefab[compInfoID.__id__];
                    if (compInfo) {
                        isSameType(types, node._name);
                        types.push({
                            name: node._name,
                            type: compInfo.__type__
                        });
                        find = true;
                    }
                }
            }
        }
        if (!find) {
            for (const comp of components) {
                const compInfo = prefab[comp.__id__];
                // 默认不取UITransform和Widget
                if (compInfo.__type__ != "cc.UITransform" && compInfo.__type__ != "cc.Widget") {
                    isSameType(types, node._name);
                    types.push({
                        name: node._name,
                        type: compInfo.__type__
                    });
                    // 只取第一个
                    break;
                }
            }
        }
    }
    if (node._children && Array.isArray(node._children) && node._children.length > 0) {
        node._children.forEach((child) => {
            const childInfo = prefab[child.__id__];
            if (childInfo.__type__ == "cc.Node") {
                traversePrefabNode(childInfo, prefab, types);
            }
        });
    }
}
async function findNodesWithUnderscorePrefix(assetInfo) {
    try {
        const types = [];
        const nodeInfo = await Editor.Message.request('asset-db', 'query-asset-info', assetInfo.prefab.assetUuid);
        if (nodeInfo && nodeInfo.file) {
            const prefabContent = (0, fs_1.readFileSync)(nodeInfo.file, 'utf-8');
            try {
                const prefab = JSON.parse(prefabContent);
                const node = prefab.find((item) => item._name == assetInfo.name && item.__type__ == "cc.Node");
                if (node) {
                    traversePrefabNode(node, prefab, types);
                    return types;
                }
            }
            catch (error) {
                console.error('Failed to parse prefab content:', error);
            }
        }
    }
    catch (error) {
        console.error('Failed to traverse nodes:', error);
    }
}
async function generatorMembers(filePath, types) {
    // 创建项目
    const project = new ts_morph_1.Project();
    // 添加源文件
    const sourceFile = project.addSourceFileAtPath(filePath);
    // 获取所有类声明
    const classes = sourceFile.getClasses();
    // 遍历每个类
    for (let i = 0; i < classes.length; i++) {
        const classDeclaration = classes[i];
        // 获取类名
        const className = classDeclaration.getName();
        // 先添加新的属性
        for (let index = 0; index < types.length; index++) {
            const typeDef = types[index];
            if (!classDeclaration.getProperty(typeDef.name)) {
                // 检查是否是自定义组件（非cc开头）
                const isCustomComponent = !typeDef.type.startsWith('cc.');
                let typeName = typeDef.type;
                let modulePath = 'cc';
                if (isCustomComponent) {
                    const uuid = Editor.Utils.UUID.decompressUUID(typeDef.type);
                    const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', uuid);
                    if (assetInfo && assetInfo.file) {
                        // 读取类找到导出
                        const customComponentProject = new ts_morph_1.Project();
                        const customComponentFile = customComponentProject.addSourceFileAtPath(assetInfo.file);
                        // 获取文件中所有导出的类
                        const exportedClasses = customComponentFile.getClasses().filter(c => c.isExported());
                        // 如果有导出的类，使用第一个类的名称
                        if (exportedClasses.length > 0) {
                            typeName = exportedClasses[0].getName() || assetInfo.name;
                            // 只使用文件名作为模块路径（不含扩展名）
                            const fileDir = path_1.default.dirname(filePath);
                            const relativePath = path_1.default.relative(fileDir, path_1.default.dirname(assetInfo.file));
                            const fileNameWithoutExt = path_1.default.basename(assetInfo.file, path_1.default.extname(assetInfo.file));
                            // 构建合适的导入路径
                            if (relativePath === '') {
                                modulePath = `./${fileNameWithoutExt}`;
                            }
                            else {
                                modulePath = `${relativePath.replace(/\\/g, '/')}/${fileNameWithoutExt}`;
                            }
                            // 如果路径不是以./或../开头，添加./
                            if (!/^\.\.?\//.test(modulePath)) {
                                modulePath = `./${modulePath}`;
                            }
                        }
                        else {
                            // 如果没有找到导出的类，使用文件名
                            console.warn(`No exported class found in ${assetInfo.file}, using asset name instead`);
                            typeName = assetInfo.name;
                            // 计算相对路径同上
                            const fileDir = path_1.default.dirname(filePath);
                            const relativePath = path_1.default.relative(fileDir, path_1.default.dirname(assetInfo.file));
                            const fileNameWithoutExt = path_1.default.basename(assetInfo.file, path_1.default.extname(assetInfo.file));
                            if (relativePath === '') {
                                modulePath = `./${fileNameWithoutExt}`;
                            }
                            else {
                                modulePath = `${relativePath.replace(/\\/g, '/')}/${fileNameWithoutExt}`;
                            }
                            if (!/^\.\.?\//.test(modulePath)) {
                                modulePath = `./${modulePath}`;
                            }
                        }
                    }
                }
                else {
                    // cc组件只需要组件名
                    typeName = typeDef.type.split('.').pop() || '';
                }
                classDeclaration.insertProperty(0, {
                    name: typeDef.name,
                    type: typeName,
                    initializer: "null",
                    decorators: [{
                            name: 'property',
                            arguments: [`{type: ${typeName}}`]
                        }],
                    isReadonly: true,
                    scope: ts_morph_1.Scope.Private
                });
                // 添加导入
                if (isCustomComponent) {
                    // 添加自定义组件的导入
                    const existingImport = sourceFile.getImportDeclaration(i => i.getModuleSpecifierValue() === modulePath);
                    if (existingImport) {
                        const namedImports = existingImport.getNamedImports();
                        if (!namedImports.some(imp => imp.getName() === typeName)) {
                            existingImport.addNamedImport(typeName);
                        }
                    }
                    else {
                        sourceFile.addImportDeclaration({
                            namedImports: [typeName],
                            moduleSpecifier: modulePath
                        });
                    }
                }
                else {
                    // 添加 cc 组件导入
                    const ccImport = sourceFile.getImportDeclaration(i => i.getModuleSpecifierValue() === 'cc');
                    if (ccImport) {
                        const namedImports = ccImport.getNamedImports();
                        if (!namedImports.some(imp => imp.getName() === typeName)) {
                            ccImport.addNamedImport(typeName);
                        }
                    }
                    else {
                        sourceFile.addImportDeclaration({
                            namedImports: [typeName],
                            moduleSpecifier: 'cc'
                        });
                    }
                }
            }
        }
        // 获取所有私有属性
        const privateProps = classDeclaration.getProperties().filter(prop => prop.getName().startsWith('_'));
        // 处理现有属性
        for (let index = 0; index < privateProps.length; index++) {
            const prop = privateProps[index];
            const name = prop.getName();
            const type = prop.getType().getText();
            const typeDef = types.find(item => item.name === name);
            if (typeDef) {
                // 更新类型和装饰器
                if (typeDef.type !== type) {
                    // 检查是否是自定义组件
                    const isCustomComponent = !typeDef.type.startsWith('cc.');
                    let typeName = typeDef.type;
                    let modulePath = 'cc';
                    if (isCustomComponent) {
                        const uuid = Editor.Utils.UUID.decompressUUID(typeDef.type);
                        const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', uuid);
                        if (assetInfo && assetInfo.file) {
                            // 读取类找到导出
                            const customComponentProject = new ts_morph_1.Project();
                            const customComponentFile = customComponentProject.addSourceFileAtPath(assetInfo.file);
                            // 获取文件中所有导出的类
                            const exportedClasses = customComponentFile.getClasses().filter(c => c.isExported());
                            // 如果有导出的类，使用第一个类的名称
                            if (exportedClasses.length > 0) {
                                typeName = exportedClasses[0].getName() || assetInfo.name;
                                // 只使用文件名作为模块路径（不含扩展名）
                                const fileDir = path_1.default.dirname(filePath);
                                const relativePath = path_1.default.relative(fileDir, path_1.default.dirname(assetInfo.file));
                                const fileNameWithoutExt = path_1.default.basename(assetInfo.file, path_1.default.extname(assetInfo.file));
                                // 构建合适的导入路径
                                if (relativePath === '') {
                                    modulePath = `./${fileNameWithoutExt}`;
                                }
                                else {
                                    modulePath = `${relativePath.replace(/\\/g, '/')}/${fileNameWithoutExt}`;
                                }
                                // 如果路径不是以./或../开头，添加./
                                if (!/^\.\.?\//.test(modulePath)) {
                                    modulePath = `./${modulePath}`;
                                }
                            }
                            else {
                                // 如果没有找到导出的类，使用文件名
                                typeName = assetInfo.name;
                                // 计算相对路径同上
                                const fileDir = path_1.default.dirname(filePath);
                                const relativePath = path_1.default.relative(fileDir, path_1.default.dirname(assetInfo.file));
                                const fileNameWithoutExt = path_1.default.basename(assetInfo.file, path_1.default.extname(assetInfo.file));
                                if (relativePath === '') {
                                    modulePath = `./${fileNameWithoutExt}`;
                                }
                                else {
                                    modulePath = `${relativePath.replace(/\\/g, '/')}/${fileNameWithoutExt}`;
                                }
                                if (!/^\.\.?\//.test(modulePath)) {
                                    modulePath = `./${modulePath}`;
                                }
                            }
                        }
                    }
                    else {
                        // cc组件只需要组件名
                        typeName = typeDef.type.split('.').pop() || '';
                    }
                    const decorators = prop.getDecorators();
                    let existingPropertyDecorator = null;
                    // 查找现有的 property 装饰器
                    for (const decorator of decorators) {
                        if (decorator.getName() === 'property') {
                            existingPropertyDecorator = decorator;
                            break;
                        }
                    }
                    // 更新类型
                    prop.setType(typeName);
                    if (existingPropertyDecorator) {
                        // 获取现有装饰器的参数文本
                        const args = existingPropertyDecorator.getArguments();
                        if (args.length > 0) {
                            // 尝试解析现有参数
                            const argText = args[0].getText();
                            // 如果是对象形式的参数
                            if (argText.startsWith('{') && argText.endsWith('}')) {
                                // 提取对象内容，移除前后的花括号
                                const objectContents = argText.substring(1, argText.length - 1).trim();
                                // 检查是否有其他属性
                                if (objectContents.includes(',') || !objectContents.includes('type:')) {
                                    // 构建新的对象参数，包含原有属性和新的类型
                                    let newArg = '{';
                                    // 处理已有属性
                                    const properties = objectContents.split(',').map(p => p.trim());
                                    const typeIndex = properties.findIndex(p => p.startsWith('type:'));
                                    if (typeIndex >= 0) {
                                        // 替换类型属性
                                        properties[typeIndex] = `type: ${typeName}`;
                                    }
                                    else {
                                        // 添加类型属性
                                        properties.push(`type: ${typeName}`);
                                    }
                                    newArg += properties.join(', ') + '}';
                                    // 更新装饰器
                                    existingPropertyDecorator.removeArgument(0);
                                    existingPropertyDecorator.addArgument(newArg);
                                }
                                else {
                                    // 仅包含类型定义，更新类型
                                    existingPropertyDecorator.removeArgument(0);
                                    existingPropertyDecorator.addArgument(`{type: ${typeName}}`);
                                }
                            }
                            else {
                                // 非对象形式参数，替换为新参数
                                existingPropertyDecorator.removeArgument(0);
                                existingPropertyDecorator.addArgument(`{type: ${typeName}}`);
                            }
                        }
                        else {
                            // 没有参数，添加参数
                            existingPropertyDecorator.addArgument(`{type: ${typeName}}`);
                        }
                    }
                    else {
                        // 没有找到 property 装饰器，添加新装饰器
                        prop.addDecorator({
                            name: 'property',
                            arguments: [`{type: ${typeName}}`]
                        });
                    }
                    if (!prop.getInitializer()) {
                        prop.setInitializer('null');
                    }
                    // 添加导入
                    if (isCustomComponent) {
                        // 添加自定义组件的导入
                        const existingImport = sourceFile.getImportDeclaration(i => i.getModuleSpecifierValue() === modulePath);
                        if (existingImport) {
                            const namedImports = existingImport.getNamedImports();
                            if (!namedImports.some(imp => imp.getName() === typeName)) {
                                existingImport.addNamedImport(typeName);
                            }
                        }
                        else {
                            sourceFile.addImportDeclaration({
                                namedImports: [typeName],
                                moduleSpecifier: modulePath
                            });
                        }
                    }
                    else {
                        // 添加 cc 组件导入
                        const ccImport = sourceFile.getImportDeclaration(i => i.getModuleSpecifierValue() === 'cc');
                        if (ccImport) {
                            const namedImports = ccImport.getNamedImports();
                            if (!namedImports.some(imp => imp.getName() === typeName)) {
                                ccImport.addNamedImport(typeName);
                            }
                        }
                        else {
                            sourceFile.addImportDeclaration({
                                namedImports: [typeName],
                                moduleSpecifier: 'cc'
                            });
                        }
                    }
                }
            }
            else {
                // 如果在 types 中找不到对应的属性定义，则移除该属性
                prop.remove();
            }
        }
    }
    // 保存修改
    project.saveSync();
}
function onRootMenu(assetInfo) {
    return [
        {
            label: 'i18n:game-framework.hierarchy.menu.rootMenu',
            async click() {
                var _a;
                if (!assetInfo) {
                    Editor.Dialog.info('i18n:game-framework.hierarchy.error.noAssetInfo');
                }
                else {
                    // 遍历节点树查找带下划线的节点和属性
                    const types = await findNodesWithUnderscorePrefix(assetInfo);
                    // 处理组件信息
                    const components = assetInfo.components;
                    if (!components || components.length === 0) {
                        return;
                    }
                    let hasBaseView = false;
                    for (let index = 0; index < components.length; index++) {
                        const component = components[index];
                        // 获取组件详细信息
                        const componentInfo = await Editor.Message.request('scene', 'query-component', component.value // 这里的 value 就是组件的 UUID
                        );
                        if (componentInfo) {
                            const baseView = (_a = componentInfo.extends) === null || _a === void 0 ? void 0 : _a.find(item => item === "BaseView");
                            if (baseView) {
                                hasBaseView = true;
                                // 获取资源信息
                                const uuid = Editor.Utils.UUID.decompressUUID(componentInfo.cid);
                                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', uuid);
                                if (assetInfo && assetInfo.file) {
                                    generatorMembers(assetInfo.file, types !== null && types !== void 0 ? types : []);
                                    Editor.Dialog.info('构造成员函数成功');
                                }
                            }
                        }
                    }
                    if (!hasBaseView) {
                        Editor.Dialog.error(Editor.I18n.t('game-framework.hierarchy.error.noBaseView'));
                    }
                }
            },
        },
    ];
}
exports.onRootMenu = onRootMenu;
;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGllcmFyY2h5LW1lbnUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvaGllcmFyY2h5L2hpZXJhcmNoeS1tZW51LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUNBLDJCQUFrQztBQUNsQyxnREFBd0I7QUFDeEIsdUNBQXFEO0FBRXJELE1BQU0sVUFBVSxHQUEyQjtJQUN2QyxRQUFRO0lBQ1IsS0FBSyxFQUFFLFVBQVU7SUFDakIsS0FBSyxFQUFFLFdBQVc7SUFDbEIsS0FBSyxFQUFFLFdBQVc7SUFDbEIsS0FBSyxFQUFFLGVBQWU7SUFDdEIsS0FBSyxFQUFFLFdBQVc7SUFDbEIsS0FBSyxFQUFFLFdBQVc7SUFDbEIsS0FBSyxFQUFFLFlBQVk7SUFDbkIsS0FBSyxFQUFFLGFBQWE7SUFDcEIsS0FBSyxFQUFFLGFBQWE7SUFDcEIsS0FBSyxFQUFFLGdCQUFnQjtJQUN2QixLQUFLLEVBQUUsV0FBVztJQUNsQixLQUFLLEVBQUUsU0FBUztJQUNoQixLQUFLLEVBQUUsV0FBVztJQUNsQixLQUFLLEVBQUUsZ0JBQWdCO0lBRXZCLFFBQVE7SUFDUixLQUFLLEVBQUUsY0FBYztJQUNyQixLQUFLLEVBQUUsZ0JBQWdCO0lBQ3ZCLEtBQUssRUFBRSxnQkFBZ0I7SUFDdkIsS0FBSyxFQUFFLFlBQVk7SUFFbkIsT0FBTztJQUNQLEtBQUssRUFBRSxXQUFXO0lBQ2xCLEtBQUssRUFBRSxhQUFhO0lBQ3BCLEtBQUssRUFBRSxtQkFBbUI7SUFDMUIsS0FBSyxFQUFFLG1CQUFtQjtJQUMxQixLQUFLLEVBQUUsbUJBQW1CO0lBRTFCLE9BQU87SUFDUCxLQUFLLEVBQUUsYUFBYTtJQUNwQixLQUFLLEVBQUUsbUJBQW1CO0lBQzFCLEtBQUssRUFBRSxrQkFBa0I7SUFDekIsS0FBSyxFQUFFLHdCQUF3QjtJQUUvQixLQUFLO0lBQ0wsS0FBSyxFQUFFLFdBQVc7SUFDbEIsS0FBSyxFQUFFLGFBQWE7SUFDcEIsS0FBSyxFQUFFLHFCQUFx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QUFDLENBQUM7Z0NBRXJGLElBQUksU0FBUyxJQUFJLFNBQVMsQ0FBQyxJQUFJLEVBQUU7b0NBQzdCLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsS0FBSyxhQUFMLEtBQUssY0FBTCxLQUFLLEdBQUksRUFBRSxDQUFDLENBQUM7b0NBRTlDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO2lDQUNsQzs2QkFDSjt5QkFDSjtxQkFDSjtvQkFFRCxJQUFJLENBQUMsV0FBVyxFQUFFO3dCQUNkLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLDJDQUEyQyxDQUFDLENBQUMsQ0FBQztxQkFDbkY7aUJBQ0o7WUFDTCxDQUFDO1NBQ0o7S0FDSixDQUFDO0FBQ04sQ0FBQztBQW5ERCxnQ0FtREM7QUFBQSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXNzZXRJbmZvIH0gZnJvbSBcIkBjb2Nvcy9jcmVhdG9yLXR5cGVzL2VkaXRvci9wYWNrYWdlcy9hc3NldC1kYi9AdHlwZXMvcHVibGljXCI7XHJcbmltcG9ydCB7IHJlYWRGaWxlU3luYyB9IGZyb20gXCJmc1wiO1xyXG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xyXG5pbXBvcnQgeyBEZWNvcmF0b3IsIFByb2plY3QsIFNjb3BlIH0gZnJvbSBcInRzLW1vcnBoXCI7XHJcblxyXG5jb25zdCBzaG9ydE5hbWVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xyXG4gICAgLy8gVUkg57uE5Lu2XHJcbiAgICAnbGFiJzogJ2NjLkxhYmVsJywgICAgICAgICAgICAgICAgLy8g5paH5pysXHJcbiAgICAnYnRuJzogJ2NjLkJ1dHRvbicsICAgICAgICAgICAgICAgLy8g5oyJ6ZKuXHJcbiAgICAnc3ByJzogJ2NjLlNwcml0ZScsICAgICAgICAgICAgICAgLy8g57K+54G1XHJcbiAgICAnc2NyJzogJ2NjLlNjcm9sbFZpZXcnLCAgICAgICAgICAgLy8g5rua5Yqo6KeG5Zu+XHJcbiAgICAnbGF5JzogJ2NjLkxheW91dCcsICAgICAgICAgICAgICAgLy8g5biD5bGAXHJcbiAgICAndG9nJzogJ2NjLlRvZ2dsZScsICAgICAgICAgICAgICAgLy8g5byA5YWzXHJcbiAgICAnZWR0JzogJ2NjLkVkaXRCb3gnLCAgICAgICAgICAgICAgLy8g6L6T5YWl5qGGXHJcbiAgICAncnR4JzogJ2NjLlJpY2hUZXh0JywgICAgICAgICAgICAgLy8g5a+M5paH5pysXHJcbiAgICAncGd2JzogJ2NjLlBhZ2VWaWV3JywgICAgICAgICAgICAgLy8g6aG16Z2i6KeG5Zu+XHJcbiAgICAncHJnJzogJ2NjLlByb2dyZXNzQmFyJywgICAgICAgICAgLy8g6L+b5bqm5p2hXHJcbiAgICAnc2xkJzogJ2NjLlNsaWRlcicsICAgICAgICAgICAgICAgLy8g5ruR5Yqo5ZmoXHJcbiAgICAnbXNrJzogJ2NjLk1hc2snLCAgICAgICAgICAgICAgICAgLy8g6YGu572pXHJcbiAgICAnd2d0JzogJ2NjLldpZGdldCcsICAgICAgICAgICAgICAgLy8g6YCC6YWN57uE5Lu2XHJcbiAgICAndWl0JzogJ2NjLlVJVHJhbnNmb3JtJywgICAgICAgICAgLy8gVUnlj5jmjaJcclxuXHJcbiAgICAvLyDlpJrlqpLkvZPnu4Tku7ZcclxuICAgICdhbmknOiAnY2MuQW5pbWF0aW9uJywgICAgICAgICAgICAvLyDliqjnlLtcclxuICAgICdhdWQnOiAnY2MuQXVkaW9Tb3VyY2UnLCAgICAgICAgICAvLyDpn7PpopFcclxuICAgICd2aWQnOiAnY2MuVmlkZW9QbGF5ZXInLCAgICAgICAgICAvLyDop4bpopFcclxuICAgICd3YnYnOiAnY2MuV2ViVmlldycsICAgICAgICAgICAgICAvLyDnvZHpobXop4blm75cclxuXHJcbiAgICAvLyDmuLLmn5Pnm7jlhbNcclxuICAgICdjYW0nOiAnY2MuQ2FtZXJhJywgICAgICAgICAgICAgICAvLyDnm7jmnLpcclxuICAgICdnZngnOiAnY2MuR3JhcGhpY3MnLCAgICAgICAgICAgICAvLyDlm77lvaJcclxuICAgICdwdHMnOiAnY2MuUGFydGljbGVTeXN0ZW0nLCAgICAgICAvLyDnspLlrZDns7vnu59cclxuICAgICdsaXQnOiAnY2MuTGlnaHRDb21wb25lbnQnLCAgICAgICAvLyDnga/lhYlcclxuICAgICdtZGwnOiAnY2MuTW9kZWxDb21wb25lbnQnLCAgICAgICAvLyDmqKHlnotcclxuXHJcbiAgICAvLyDliqjnlLvnm7jlhbNcclxuICAgICdza2wnOiAnY2MuU2tlbGV0b24nLCAgICAgICAgICAgICAvLyDpqqjpqrxcclxuICAgICdhc3QnOiAnY2MuQW5pbWF0aW9uU3RhdGUnLCAgICAgICAvLyDliqjnlLvnirbmgIFcclxuICAgICdhY2wnOiAnY2MuQW5pbWF0aW9uQ2xpcCcsICAgICAgICAvLyDliqjnlLvniYfmrrVcclxuICAgICdhbmMnOiAnY2MuQW5pbWF0aW9uQ29udHJvbGxlcicsICAvLyDliqjnlLvmjqfliLblmahcclxuXHJcbiAgICAvLyDlhbbku5ZcclxuICAgICdjdnMnOiAnY2MuQ2FudmFzJywgICAgICAgICAgICAgICAvLyDnlLvluINcclxuICAgICdzZmEnOiAnY2MuU2FmZUFyZWEnLCAgICAgICAgICAgICAvLyDlronlhajljLrln59cclxuICAgICdiaWUnOiAnY2MuQmxvY2tJbnB1dEV2ZW50cycgICAgICAvLyDovpPlhaXpmLvmjKFcclxufTtcclxuXHJcbmZ1bmN0aW9uIGlzU2FtZVR5cGUodHlwZXM6IHsgbmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcgfVtdLCBuYW1lOiBzdHJpbmcpIHtcclxuICAgIC8vIOajgOafpeaYr+WQpuW3sue7j+WtmOWcqOWQjOWQjeiKgueCuVxyXG4gICAgY29uc3QgZXhpc3RpbmdUeXBlID0gdHlwZXMuZmluZCh0ID0+IHQubmFtZSA9PT0gbmFtZSk7XHJcbiAgICBpZiAoZXhpc3RpbmdUeXBlKSB7XHJcbiAgICAgICAgRWRpdG9yLkRpYWxvZy5lcnJvcihg6K2m5ZGKOiDlj5HnjrDph43lpI3nmoToioLngrnlkI3np7AgXCIke25hbWV9XCJgKTtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOitpuWRijog5Y+R546w6YeN5aSN55qE6IqC54K55ZCN56ewIFwiJHtuYW1lfVwiYCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHRyYXZlcnNlUHJlZmFiTm9kZShub2RlOiBhbnksIHByZWZhYjogYW55LCB0eXBlczogYW55W10pIHtcclxuICAgIGlmIChub2RlLl9uYW1lLnN0YXJ0c1dpdGgoJ18nKSkge1xyXG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBub2RlLl9jb21wb25lbnRzO1xyXG4gICAgICAgIGNvbnN0IG5hbWUgPSBub2RlLl9uYW1lID8/IFwiXCI7XHJcbiAgICAgICAgbGV0IGZpbmQgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgLy8g5aaC5p6c5piv55So55+t5ZCN56ew5byA5aS077yM5YiZ6K+05piO5oiQ5ZGY5Y+Y6YeP6KaB55So5a+55bqU55qE57uE5Lu257G75Z6LXHJcbiAgICAgICAgZm9yIChjb25zdCBvIGluIHNob3J0TmFtZXMpIHtcclxuICAgICAgICAgICAgaWYgKG5hbWUuc3RhcnRzV2l0aChcIl9cIiArIG8pKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjb21wSW5mb0lEID0gY29tcG9uZW50cy5maW5kKChjb21wOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wSW5mbyA9IHByZWZhYltjb21wLl9faWRfX107XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNvbXBJbmZvLl9fdHlwZV9fID09IHNob3J0TmFtZXNbb107XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoY29tcEluZm9JRCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBJbmZvID0gcHJlZmFiW2NvbXBJbmZvSUQuX19pZF9fXTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoY29tcEluZm8pIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXNTYW1lVHlwZSh0eXBlcywgbm9kZS5fbmFtZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUuX25hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb21wSW5mby5fX3R5cGVfX1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmluZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoIWZpbmQpIHtcclxuICAgICAgICAgICAgZm9yIChjb25zdCBjb21wIG9mIGNvbXBvbmVudHMpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBJbmZvID0gcHJlZmFiW2NvbXAuX19pZF9fXTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyDpu5jorqTkuI3lj5ZVSVRyYW5zZm9ybeWSjFdpZGdldFxyXG4gICAgICAgICAgICAgICAgaWYgKGNvbXBJbmZvLl9fdHlwZV9fICE9IFwiY2MuVUlUcmFuc2Zvcm1cIiAmJiBjb21wSW5mby5fX3R5cGVfXyAhPSBcImNjLldpZGdldFwiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaXNTYW1lVHlwZSh0eXBlcywgbm9kZS5fbmFtZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIHR5cGVzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLl9uYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb21wSW5mby5fX3R5cGVfX1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyDlj6rlj5bnrKzkuIDkuKpcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAobm9kZS5fY2hpbGRyZW4gJiYgQXJyYXkuaXNBcnJheShub2RlLl9jaGlsZHJlbikgJiYgbm9kZS5fY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIG5vZGUuX2NoaWxkcmVuLmZvckVhY2goKGNoaWxkOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY2hpbGRJbmZvID0gcHJlZmFiW2NoaWxkLl9faWRfX107XHJcbiAgICAgICAgICAgIGlmIChjaGlsZEluZm8uX190eXBlX18gPT0gXCJjYy5Ob2RlXCIpIHtcclxuICAgICAgICAgICAgICAgIHRyYXZlcnNlUHJlZmFiTm9kZShjaGlsZEluZm8sIHByZWZhYiwgdHlwZXMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGZpbmROb2Rlc1dpdGhVbmRlcnNjb3JlUHJlZml4KGFzc2V0SW5mbzogQXNzZXRJbmZvICYgeyBwcmVmYWI6IHsgYXNzZXRVdWlkOiBzdHJpbmcgfSB9KSB7XHJcbiAgICB0cnkge1xyXG5cclxuICAgICAgICBjb25zdCB0eXBlczogeyBuYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZyB9W10gPSBbXTtcclxuICAgICAgICBjb25zdCBub2RlSW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBhc3NldEluZm8ucHJlZmFiLmFzc2V0VXVpZCk7XHJcblxyXG4gICAgICAgIGlmIChub2RlSW5mbyAmJiBub2RlSW5mby5maWxlKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHByZWZhYkNvbnRlbnQgPSByZWFkRmlsZVN5bmMobm9kZUluZm8hLmZpbGUsICd1dGYtOCcpO1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcHJlZmFiID0gSlNPTi5wYXJzZShwcmVmYWJDb250ZW50KTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBwcmVmYWIuZmluZCgoaXRlbTogYW55KSA9PiBpdGVtLl9uYW1lID09IGFzc2V0SW5mby5uYW1lICYmIGl0ZW0uX190eXBlX18gPT0gXCJjYy5Ob2RlXCIpO1xyXG4gICAgICAgICAgICAgICAgaWYgKG5vZGUpIHtcclxuICAgICAgICAgICAgICAgICAgICB0cmF2ZXJzZVByZWZhYk5vZGUobm9kZSwgcHJlZmFiLCB0eXBlcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHR5cGVzO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHBhcnNlIHByZWZhYiBjb250ZW50OicsIGVycm9yKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byB0cmF2ZXJzZSBub2RlczonLCBlcnJvcik7XHJcbiAgICB9XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRvck1lbWJlcnMoZmlsZVBhdGg6IHN0cmluZywgdHlwZXM6IHsgbmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcgfVtdKSB7XHJcbiAgICAvLyDliJvlu7rpobnnm65cclxuICAgIGNvbnN0IHByb2plY3QgPSBuZXcgUHJvamVjdCgpO1xyXG5cclxuICAgIC8vIOa3u+WKoOa6kOaWh+S7tlxyXG4gICAgY29uc3Qgc291cmNlRmlsZSA9IHByb2plY3QuYWRkU291cmNlRmlsZUF0UGF0aChmaWxlUGF0aCk7XHJcblxyXG4gICAgLy8g6I635Y+W5omA5pyJ57G75aOw5piOXHJcbiAgICBjb25zdCBjbGFzc2VzID0gc291cmNlRmlsZS5nZXRDbGFzc2VzKCk7XHJcblxyXG4gICAgLy8g6YGN5Y6G5q+P5Liq57G7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNsYXNzZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjb25zdCBjbGFzc0RlY2xhcmF0aW9uID0gY2xhc3Nlc1tpXTtcclxuXHJcbiAgICAgICAgLy8g6I635Y+W57G75ZCNXHJcbiAgICAgICAgY29uc3QgY2xhc3NOYW1lID0gY2xhc3NEZWNsYXJhdGlvbi5nZXROYW1lKCk7XHJcblxyXG4gICAgICAgIC8vIOWFiOa3u+WKoOaWsOeahOWxnuaAp1xyXG4gICAgICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCB0eXBlcy5sZW5ndGg7IGluZGV4KyspIHtcclxuICAgICAgICAgICAgY29uc3QgdHlwZURlZiA9IHR5cGVzW2luZGV4XTtcclxuICAgICAgICAgICAgaWYgKCFjbGFzc0RlY2xhcmF0aW9uLmdldFByb3BlcnR5KHR5cGVEZWYubmFtZSkpIHtcclxuICAgICAgICAgICAgICAgIC8vIOajgOafpeaYr+WQpuaYr+iHquWumuS5iee7hOS7tu+8iOmdnmNj5byA5aS077yJXHJcbiAgICAgICAgICAgICAgICBjb25zdCBpc0N1c3RvbUNvbXBvbmVudCA9ICF0eXBlRGVmLnR5cGUuc3RhcnRzV2l0aCgnY2MuJyk7XHJcbiAgICAgICAgICAgICAgICBsZXQgdHlwZU5hbWUgPSB0eXBlRGVmLnR5cGU7XHJcbiAgICAgICAgICAgICAgICBsZXQgbW9kdWxlUGF0aCA9ICdjYyc7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGlzQ3VzdG9tQ29tcG9uZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdXVpZCA9IEVkaXRvci5VdGlscy5VVUlELmRlY29tcHJlc3NVVUlEKHR5cGVEZWYudHlwZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIHV1aWQpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoYXNzZXRJbmZvICYmIGFzc2V0SW5mby5maWxlKSB7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDor7vlj5bnsbvmib7liLDlr7zlh7pcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VzdG9tQ29tcG9uZW50UHJvamVjdCA9IG5ldyBQcm9qZWN0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1c3RvbUNvbXBvbmVudEZpbGUgPSBjdXN0b21Db21wb25lbnRQcm9qZWN0LmFkZFNvdXJjZUZpbGVBdFBhdGgoYXNzZXRJbmZvLmZpbGUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g6I635Y+W5paH5Lu25Lit5omA5pyJ5a+85Ye655qE57G7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4cG9ydGVkQ2xhc3NlcyA9IGN1c3RvbUNvbXBvbmVudEZpbGUuZ2V0Q2xhc3NlcygpLmZpbHRlcihjID0+IGMuaXNFeHBvcnRlZCgpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOacieWvvOWHuueahOexu++8jOS9v+eUqOesrOS4gOS4quexu+eahOWQjeensFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXhwb3J0ZWRDbGFzc2VzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVOYW1lID0gZXhwb3J0ZWRDbGFzc2VzWzBdLmdldE5hbWUoKSB8fCBhc3NldEluZm8ubmFtZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5Y+q5L2/55So5paH5Lu25ZCN5L2c5Li65qih5Z2X6Lev5b6E77yI5LiN5ZCr5omp5bGV5ZCN77yJXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWxlRGlyID0gcGF0aC5kaXJuYW1lKGZpbGVQYXRoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlbGF0aXZlUGF0aCA9IHBhdGgucmVsYXRpdmUoZmlsZURpciwgcGF0aC5kaXJuYW1lKGFzc2V0SW5mby5maWxlKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWxlTmFtZVdpdGhvdXRFeHQgPSBwYXRoLmJhc2VuYW1lKGFzc2V0SW5mby5maWxlLCBwYXRoLmV4dG5hbWUoYXNzZXRJbmZvLmZpbGUpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5p6E5bu65ZCI6YCC55qE5a+85YWl6Lev5b6EXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVsYXRpdmVQYXRoID09PSAnJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVBhdGggPSBgLi8ke2ZpbGVOYW1lV2l0aG91dEV4dH1gO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVQYXRoID0gYCR7cmVsYXRpdmVQYXRoLnJlcGxhY2UoL1xcXFwvZywgJy8nKX0vJHtmaWxlTmFtZVdpdGhvdXRFeHR9YDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c6Lev5b6E5LiN5piv5LulLi/miJYuLi/lvIDlpLTvvIzmt7vliqAuL1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCEvXlxcLlxcLj9cXC8vLnRlc3QobW9kdWxlUGF0aCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVQYXRoID0gYC4vJHttb2R1bGVQYXRofWA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOayoeacieaJvuWIsOWvvOWHuueahOexu++8jOS9v+eUqOaWh+S7tuWQjVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBObyBleHBvcnRlZCBjbGFzcyBmb3VuZCBpbiAke2Fzc2V0SW5mby5maWxlfSwgdXNpbmcgYXNzZXQgbmFtZSBpbnN0ZWFkYCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlTmFtZSA9IGFzc2V0SW5mby5uYW1lO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDorqHnrpfnm7jlr7not6/lvoTlkIzkuIpcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVEaXIgPSBwYXRoLmRpcm5hbWUoZmlsZVBhdGgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVsYXRpdmVQYXRoID0gcGF0aC5yZWxhdGl2ZShmaWxlRGlyLCBwYXRoLmRpcm5hbWUoYXNzZXRJbmZvLmZpbGUpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVOYW1lV2l0aG91dEV4dCA9IHBhdGguYmFzZW5hbWUoYXNzZXRJbmZvLmZpbGUsIHBhdGguZXh0bmFtZShhc3NldEluZm8uZmlsZSkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVsYXRpdmVQYXRoID09PSAnJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVBhdGggPSBgLi8ke2ZpbGVOYW1lV2l0aG91dEV4dH1gO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVQYXRoID0gYCR7cmVsYXRpdmVQYXRoLnJlcGxhY2UoL1xcXFwvZywgJy8nKX0vJHtmaWxlTmFtZVdpdGhvdXRFeHR9YDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCEvXlxcLlxcLj9cXC8vLnRlc3QobW9kdWxlUGF0aCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVQYXRoID0gYC4vJHttb2R1bGVQYXRofWA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIGNj57uE5Lu25Y+q6ZyA6KaB57uE5Lu25ZCNXHJcbiAgICAgICAgICAgICAgICAgICAgdHlwZU5hbWUgPSB0eXBlRGVmLnR5cGUuc3BsaXQoJy4nKS5wb3AoKSB8fCAnJztcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBjbGFzc0RlY2xhcmF0aW9uLmluc2VydFByb3BlcnR5KDAsIHtcclxuICAgICAgICAgICAgICAgICAgICBuYW1lOiB0eXBlRGVmLm5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogdHlwZU5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgaW5pdGlhbGl6ZXI6IFwibnVsbFwiLFxyXG4gICAgICAgICAgICAgICAgICAgIGRlY29yYXRvcnM6IFt7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6ICdwcm9wZXJ0eScsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGFyZ3VtZW50czogW2B7dHlwZTogJHt0eXBlTmFtZX19YF1cclxuICAgICAgICAgICAgICAgICAgICB9XSxcclxuICAgICAgICAgICAgICAgICAgICBpc1JlYWRvbmx5OiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlOiBTY29wZS5Qcml2YXRlXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyDmt7vliqDlr7zlhaVcclxuICAgICAgICAgICAgICAgIGlmIChpc0N1c3RvbUNvbXBvbmVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIOa3u+WKoOiHquWumuS5iee7hOS7tueahOWvvOWFpVxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nSW1wb3J0ID0gc291cmNlRmlsZS5nZXRJbXBvcnREZWNsYXJhdGlvbihpID0+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGkuZ2V0TW9kdWxlU3BlY2lmaWVyVmFsdWUoKSA9PT0gbW9kdWxlUGF0aFxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ0ltcG9ydCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuYW1lZEltcG9ydHMgPSBleGlzdGluZ0ltcG9ydC5nZXROYW1lZEltcG9ydHMoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFuYW1lZEltcG9ydHMuc29tZShpbXAgPT4gaW1wLmdldE5hbWUoKSA9PT0gdHlwZU5hbWUpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ0ltcG9ydC5hZGROYW1lZEltcG9ydCh0eXBlTmFtZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzb3VyY2VGaWxlLmFkZEltcG9ydERlY2xhcmF0aW9uKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVkSW1wb3J0czogW3R5cGVOYW1lXSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVNwZWNpZmllcjogbW9kdWxlUGF0aFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIOa3u+WKoCBjYyDnu4Tku7blr7zlhaVcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjY0ltcG9ydCA9IHNvdXJjZUZpbGUuZ2V0SW1wb3J0RGVjbGFyYXRpb24oaSA9PiBcclxuICAgICAgICAgICAgICAgICAgICAgICAgaS5nZXRNb2R1bGVTcGVjaWZpZXJWYWx1ZSgpID09PSAnY2MnXHJcbiAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBpZiAoY2NJbXBvcnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmFtZWRJbXBvcnRzID0gY2NJbXBvcnQuZ2V0TmFtZWRJbXBvcnRzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbmFtZWRJbXBvcnRzLnNvbWUoaW1wID0+IGltcC5nZXROYW1lKCkgPT09IHR5cGVOYW1lKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2NJbXBvcnQuYWRkTmFtZWRJbXBvcnQodHlwZU5hbWUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlRmlsZS5hZGRJbXBvcnREZWNsYXJhdGlvbih7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lZEltcG9ydHM6IFt0eXBlTmFtZV0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVTcGVjaWZpZXI6ICdjYydcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyDojrflj5bmiYDmnInnp4HmnInlsZ7mgKdcclxuICAgICAgICBjb25zdCBwcml2YXRlUHJvcHMgPSBjbGFzc0RlY2xhcmF0aW9uLmdldFByb3BlcnRpZXMoKS5maWx0ZXIocHJvcCA9PlxyXG4gICAgICAgICAgICBwcm9wLmdldE5hbWUoKS5zdGFydHNXaXRoKCdfJylcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICAvLyDlpITnkIbnjrDmnInlsZ7mgKdcclxuICAgICAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgcHJpdmF0ZVByb3BzLmxlbmd0aDsgaW5kZXgrKykge1xyXG4gICAgICAgICAgICBjb25zdCBwcm9wID0gcHJpdmF0ZVByb3BzW2luZGV4XTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IG5hbWUgPSBwcm9wLmdldE5hbWUoKTtcclxuICAgICAgICAgICAgY29uc3QgdHlwZSA9IHByb3AuZ2V0VHlwZSgpLmdldFRleHQoKTtcclxuICAgICAgICAgICAgY29uc3QgdHlwZURlZiA9IHR5cGVzLmZpbmQoaXRlbSA9PiBpdGVtLm5hbWUgPT09IG5hbWUpO1xyXG5cclxuICAgICAgICAgICAgaWYgKHR5cGVEZWYpIHtcclxuICAgICAgICAgICAgICAgIC8vIOabtOaWsOexu+Wei+WSjOijhemlsOWZqFxyXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVEZWYudHlwZSAhPT0gdHlwZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIOajgOafpeaYr+WQpuaYr+iHquWumuS5iee7hOS7tlxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzQ3VzdG9tQ29tcG9uZW50ID0gIXR5cGVEZWYudHlwZS5zdGFydHNXaXRoKCdjYy4nKTtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgdHlwZU5hbWUgPSB0eXBlRGVmLnR5cGU7XHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IG1vZHVsZVBhdGggPSAnY2MnO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoaXNDdXN0b21Db21wb25lbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdXVpZCA9IEVkaXRvci5VdGlscy5VVUlELmRlY29tcHJlc3NVVUlEKHR5cGVEZWYudHlwZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCB1dWlkKTtcclxuICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXNzZXRJbmZvICYmIGFzc2V0SW5mby5maWxlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDor7vlj5bnsbvmib7liLDlr7zlh7pcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1c3RvbUNvbXBvbmVudFByb2plY3QgPSBuZXcgUHJvamVjdCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VzdG9tQ29tcG9uZW50RmlsZSA9IGN1c3RvbUNvbXBvbmVudFByb2plY3QuYWRkU291cmNlRmlsZUF0UGF0aChhc3NldEluZm8uZmlsZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOiOt+WPluaWh+S7tuS4reaJgOacieWvvOWHuueahOexu1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhwb3J0ZWRDbGFzc2VzID0gY3VzdG9tQ29tcG9uZW50RmlsZS5nZXRDbGFzc2VzKCkuZmlsdGVyKGMgPT4gYy5pc0V4cG9ydGVkKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlpoLmnpzmnInlr7zlh7rnmoTnsbvvvIzkvb/nlKjnrKzkuIDkuKrnsbvnmoTlkI3np7BcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChleHBvcnRlZENsYXNzZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVOYW1lID0gZXhwb3J0ZWRDbGFzc2VzWzBdLmdldE5hbWUoKSB8fCBhc3NldEluZm8ubmFtZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlj6rkvb/nlKjmlofku7blkI3kvZzkuLrmqKHlnZfot6/lvoTvvIjkuI3lkKvmianlsZXlkI3vvIlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWxlRGlyID0gcGF0aC5kaXJuYW1lKGZpbGVQYXRoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZWxhdGl2ZVBhdGggPSBwYXRoLnJlbGF0aXZlKGZpbGVEaXIsIHBhdGguZGlybmFtZShhc3NldEluZm8uZmlsZSkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVOYW1lV2l0aG91dEV4dCA9IHBhdGguYmFzZW5hbWUoYXNzZXRJbmZvLmZpbGUsIHBhdGguZXh0bmFtZShhc3NldEluZm8uZmlsZSkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOaehOW7uuWQiOmAgueahOWvvOWFpei3r+W+hFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZWxhdGl2ZVBhdGggPT09ICcnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVBhdGggPSBgLi8ke2ZpbGVOYW1lV2l0aG91dEV4dH1gO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVBhdGggPSBgJHtyZWxhdGl2ZVBhdGgucmVwbGFjZSgvXFxcXC9nLCAnLycpfS8ke2ZpbGVOYW1lV2l0aG91dEV4dH1gO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlpoLmnpzot6/lvoTkuI3mmK/ku6UuL+aIli4uL+W8gOWktO+8jOa3u+WKoC4vXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCEvXlxcLlxcLj9cXC8vLnRlc3QobW9kdWxlUGF0aCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlUGF0aCA9IGAuLyR7bW9kdWxlUGF0aH1gO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c5rKh5pyJ5om+5Yiw5a+85Ye655qE57G777yM5L2/55So5paH5Lu25ZCNXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZU5hbWUgPSBhc3NldEluZm8ubmFtZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDorqHnrpfnm7jlr7not6/lvoTlkIzkuIpcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWxlRGlyID0gcGF0aC5kaXJuYW1lKGZpbGVQYXRoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZWxhdGl2ZVBhdGggPSBwYXRoLnJlbGF0aXZlKGZpbGVEaXIsIHBhdGguZGlybmFtZShhc3NldEluZm8uZmlsZSkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVOYW1lV2l0aG91dEV4dCA9IHBhdGguYmFzZW5hbWUoYXNzZXRJbmZvLmZpbGUsIHBhdGguZXh0bmFtZShhc3NldEluZm8uZmlsZSkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZWxhdGl2ZVBhdGggPT09ICcnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVBhdGggPSBgLi8ke2ZpbGVOYW1lV2l0aG91dEV4dH1gO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVBhdGggPSBgJHtyZWxhdGl2ZVBhdGgucmVwbGFjZSgvXFxcXC9nLCAnLycpfS8ke2ZpbGVOYW1lV2l0aG91dEV4dH1gO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIS9eXFwuXFwuP1xcLy8udGVzdChtb2R1bGVQYXRoKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVQYXRoID0gYC4vJHttb2R1bGVQYXRofWA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gY2Pnu4Tku7blj6rpnIDopoHnu4Tku7blkI1cclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZU5hbWUgPSB0eXBlRGVmLnR5cGUuc3BsaXQoJy4nKS5wb3AoKSB8fCAnJztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRlY29yYXRvcnMgPSBwcm9wLmdldERlY29yYXRvcnMoKTtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvcjogRGVjb3JhdG9yIHwgbnVsbCA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgLy8g5p+l5om+546w5pyJ55qEIHByb3BlcnR5IOijhemlsOWZqFxyXG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZGVjb3JhdG9yIG9mIGRlY29yYXRvcnMpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRlY29yYXRvci5nZXROYW1lKCkgPT09ICdwcm9wZXJ0eScpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nUHJvcGVydHlEZWNvcmF0b3IgPSBkZWNvcmF0b3I7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAvLyDmm7TmlrDnsbvlnotcclxuICAgICAgICAgICAgICAgICAgICBwcm9wLnNldFR5cGUodHlwZU5hbWUpO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOiOt+WPlueOsOacieijhemlsOWZqOeahOWPguaVsOaWh+acrFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhcmdzID0gZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5nZXRBcmd1bWVudHMoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWwneivleino+aekOeOsOacieWPguaVsFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYXJnVGV4dCA9IGFyZ3NbMF0uZ2V0VGV4dCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlpoLmnpzmmK/lr7nosaHlvaLlvI/nmoTlj4LmlbBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhcmdUZXh0LnN0YXJ0c1dpdGgoJ3snKSAmJiBhcmdUZXh0LmVuZHNXaXRoKCd9JykpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmj5Dlj5blr7nosaHlhoXlrrnvvIznp7vpmaTliY3lkI7nmoToirHmi6zlj7dcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBvYmplY3RDb250ZW50cyA9IGFyZ1RleHQuc3Vic3RyaW5nKDEsIGFyZ1RleHQubGVuZ3RoIC0gMSkudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOajgOafpeaYr+WQpuacieWFtuS7luWxnuaAp1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChvYmplY3RDb250ZW50cy5pbmNsdWRlcygnLCcpIHx8ICFvYmplY3RDb250ZW50cy5pbmNsdWRlcygndHlwZTonKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmnoTlu7rmlrDnmoTlr7nosaHlj4LmlbDvvIzljIXlkKvljp/mnInlsZ7mgKflkozmlrDnmoTnsbvlnotcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG5ld0FyZyA9ICd7JztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWkhOeQhuW3suacieWxnuaAp1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9wZXJ0aWVzID0gb2JqZWN0Q29udGVudHMuc3BsaXQoJywnKS5tYXAocCA9PiBwLnRyaW0oKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHR5cGVJbmRleCA9IHByb3BlcnRpZXMuZmluZEluZGV4KHAgPT4gcC5zdGFydHNXaXRoKCd0eXBlOicpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlSW5kZXggPj0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5pu/5o2i57G75Z6L5bGe5oCnXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzW3R5cGVJbmRleF0gPSBgdHlwZTogJHt0eXBlTmFtZX1gO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5re75Yqg57G75Z6L5bGe5oCnXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzLnB1c2goYHR5cGU6ICR7dHlwZU5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ld0FyZyArPSBwcm9wZXJ0aWVzLmpvaW4oJywgJykgKyAnfSc7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmm7TmlrDoo4XppbDlmahcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5yZW1vdmVBcmd1bWVudCgwKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5hZGRBcmd1bWVudChuZXdBcmcpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOS7heWMheWQq+exu+Wei+WumuS5ie+8jOabtOaWsOexu+Wei1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLnJlbW92ZUFyZ3VtZW50KDApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLmFkZEFyZ3VtZW50KGB7dHlwZTogJHt0eXBlTmFtZX19YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDpnZ7lr7nosaHlvaLlvI/lj4LmlbDvvIzmm7/mjaLkuLrmlrDlj4LmlbBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLnJlbW92ZUFyZ3VtZW50KDApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nUHJvcGVydHlEZWNvcmF0b3IuYWRkQXJndW1lbnQoYHt0eXBlOiAke3R5cGVOYW1lfX1gKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOayoeacieWPguaVsO+8jOa3u+WKoOWPguaVsFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5hZGRBcmd1bWVudChge3R5cGU6ICR7dHlwZU5hbWV9fWApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5rKh5pyJ5om+5YiwIHByb3BlcnR5IOijhemlsOWZqO+8jOa3u+WKoOaWsOijhemlsOWZqFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wLmFkZERlY29yYXRvcih7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiAncHJvcGVydHknLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXJndW1lbnRzOiBbYHt0eXBlOiAke3R5cGVOYW1lfX1gXVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmICghcHJvcC5nZXRJbml0aWFsaXplcigpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3Auc2V0SW5pdGlhbGl6ZXIoJ251bGwnKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgLy8g5re75Yqg5a+85YWlXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzQ3VzdG9tQ29tcG9uZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOa3u+WKoOiHquWumuS5iee7hOS7tueahOWvvOWFpVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBleGlzdGluZ0ltcG9ydCA9IHNvdXJjZUZpbGUuZ2V0SW1wb3J0RGVjbGFyYXRpb24oaSA9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaS5nZXRNb2R1bGVTcGVjaWZpZXJWYWx1ZSgpID09PSBtb2R1bGVQYXRoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXhpc3RpbmdJbXBvcnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5hbWVkSW1wb3J0cyA9IGV4aXN0aW5nSW1wb3J0LmdldE5hbWVkSW1wb3J0cygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFuYW1lZEltcG9ydHMuc29tZShpbXAgPT4gaW1wLmdldE5hbWUoKSA9PT0gdHlwZU5hbWUpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdJbXBvcnQuYWRkTmFtZWRJbXBvcnQodHlwZU5hbWUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlRmlsZS5hZGRJbXBvcnREZWNsYXJhdGlvbih7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZWRJbXBvcnRzOiBbdHlwZU5hbWVdLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVNwZWNpZmllcjogbW9kdWxlUGF0aFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDmt7vliqAgY2Mg57uE5Lu25a+85YWlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNjSW1wb3J0ID0gc291cmNlRmlsZS5nZXRJbXBvcnREZWNsYXJhdGlvbihpID0+IFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaS5nZXRNb2R1bGVTcGVjaWZpZXJWYWx1ZSgpID09PSAnY2MnXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2NJbXBvcnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5hbWVkSW1wb3J0cyA9IGNjSW1wb3J0LmdldE5hbWVkSW1wb3J0cygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFuYW1lZEltcG9ydHMuc29tZShpbXAgPT4gaW1wLmdldE5hbWUoKSA9PT0gdHlwZU5hbWUpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2NJbXBvcnQuYWRkTmFtZWRJbXBvcnQodHlwZU5hbWUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlRmlsZS5hZGRJbXBvcnREZWNsYXJhdGlvbih7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZWRJbXBvcnRzOiBbdHlwZU5hbWVdLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVNwZWNpZmllcjogJ2NjJ1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyDlpoLmnpzlnKggdHlwZXMg5Lit5om+5LiN5Yiw5a+55bqU55qE5bGe5oCn5a6a5LmJ77yM5YiZ56e76Zmk6K+l5bGe5oCnXHJcbiAgICAgICAgICAgICAgICBwcm9wLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIOS/neWtmOS/ruaUuVxyXG4gICAgcHJvamVjdC5zYXZlU3luYygpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gb25Sb290TWVudShhc3NldEluZm86IEFzc2V0SW5mbyAmIHsgY29tcG9uZW50czogYW55W10sIHByZWZhYjogeyBhc3NldFV1aWQ6IHN0cmluZyB9IH0pIHtcclxuICAgIHJldHVybiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsYWJlbDogJ2kxOG46Z2FtZS1mcmFtZXdvcmsuaGllcmFyY2h5Lm1lbnUucm9vdE1lbnUnLFxyXG4gICAgICAgICAgICBhc3luYyBjbGljaygpIHtcclxuICAgICAgICAgICAgICAgIGlmICghYXNzZXRJbmZvKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgRWRpdG9yLkRpYWxvZy5pbmZvKCdpMThuOmdhbWUtZnJhbWV3b3JrLmhpZXJhcmNoeS5lcnJvci5ub0Fzc2V0SW5mbycpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgLy8g6YGN5Y6G6IqC54K55qCR5p+l5om+5bim5LiL5YiS57q/55qE6IqC54K55ZKM5bGe5oCnXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHlwZXMgPSBhd2FpdCBmaW5kTm9kZXNXaXRoVW5kZXJzY29yZVByZWZpeChhc3NldEluZm8pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyDlpITnkIbnu4Tku7bkv6Hmga9cclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wb25lbnRzID0gYXNzZXRJbmZvLmNvbXBvbmVudHM7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjb21wb25lbnRzIHx8IGNvbXBvbmVudHMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGxldCBoYXNCYXNlVmlldyA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBjb21wb25lbnRzLmxlbmd0aDsgaW5kZXgrKykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wb25lbnQgPSBjb21wb25lbnRzW2luZGV4XTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOiOt+WPlue7hOS7tuivpue7huS/oeaBr1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wb25lbnRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktY29tcG9uZW50JyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudC52YWx1ZSAgLy8g6L+Z6YeM55qEIHZhbHVlIOWwseaYr+e7hOS7tueahCBVVUlEXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29tcG9uZW50SW5mbykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYmFzZVZpZXcgPSBjb21wb25lbnRJbmZvLmV4dGVuZHM/LmZpbmQoaXRlbSA9PiBpdGVtID09PSBcIkJhc2VWaWV3XCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGJhc2VWaWV3KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFzQmFzZVZpZXcgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOiOt+WPlui1hOa6kOS/oeaBr1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHV1aWQgPSBFZGl0b3IuVXRpbHMuVVVJRC5kZWNvbXByZXNzVVVJRChjb21wb25lbnRJbmZvLmNpZCEpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCB1dWlkKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFzc2V0SW5mbyAmJiBhc3NldEluZm8uZmlsZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnZW5lcmF0b3JNZW1iZXJzKGFzc2V0SW5mby5maWxlLCB0eXBlcyA/PyBbXSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBFZGl0b3IuRGlhbG9nLmluZm8oJ+aehOmAoOaIkOWRmOWHveaVsOaIkOWKnycpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFoYXNCYXNlVmlldykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBFZGl0b3IuRGlhbG9nLmVycm9yKEVkaXRvci5JMThuLnQoJ2dhbWUtZnJhbWV3b3JrLmhpZXJhcmNoeS5lcnJvci5ub0Jhc2VWaWV3JykpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgXTtcclxufTtcclxuIl19