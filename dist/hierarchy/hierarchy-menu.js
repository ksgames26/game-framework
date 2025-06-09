"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onNodeMenu = exports.onRootMenu = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const ts_morph_1 = require("ts-morph");
const short_name_1 = require("../short-name");
function isSameType(types, name) {
    // 检查是否已经存在同名节点
    const existingType = types.find(t => t.name === name);
    if (existingType) {
        Editor.Dialog.error(`警告: 发现重复的节点名称 "${name}"`);
        throw new Error(`警告: 发现重复的节点名称 "${name}"`);
    }
}
async function traversePrefabNode(node, prefab, types) {
    var _a, _b, _c, _d;
    // 需要先检测这个node是否是预制体
    // 如果是预制体，则需要遍历预制体
    const prefabId = node._prefab.__id__;
    const prefabInfo = prefab[prefabId];
    const isPrefab = prefabInfo.asset && prefabInfo.asset.__uuid__;
    if (isPrefab) {
        const nodeInfo = await Editor.Message.request('asset-db', 'query-asset-info', isPrefab);
        if (nodeInfo && nodeInfo.file) {
            const prefabContent = (0, fs_1.readFileSync)(nodeInfo.file, 'utf-8');
            try {
                const prefab1 = JSON.parse(prefabContent);
                const dataId = prefab1[0] && ((_b = (_a = prefab1[0]) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.__id__);
                const isNode = prefab1[dataId] && ((_c = prefab1[dataId]) === null || _c === void 0 ? void 0 : _c.__type__) == "cc.Node";
                if (isNode) {
                    await traversePrefabNode(prefab1[dataId], prefab1, types);
                }
            }
            catch (error) {
                console.error('Failed to parse prefab content:', error);
            }
        }
        // 如果遍历完了，看看预制体的属性重载
        const instanceID = prefabInfo.instance && prefabInfo.instance.__id__;
        const instance = prefab[instanceID];
        if (instance) {
            // 重载属性
            const propertyOverrides = instance.propertyOverrides;
            if (propertyOverrides && Array.isArray(propertyOverrides) && propertyOverrides.length > 0) {
                for (let i = 0; i < propertyOverrides.length; i++) {
                    const propertyOverride = propertyOverrides[i];
                    const override = prefab[propertyOverride.__id__];
                    if (override && override.__type__ == "CCPropertyOverrideInfo") {
                        const propertyPath = override.propertyPath;
                        const value = override.value;
                        if (propertyPath && propertyPath.length > 0) {
                            const index = propertyPath.findIndex(e => e == "_name");
                            if (index != -1) {
                                const name = value;
                                for (const o in short_name_1.shortNames) {
                                    if (name.startsWith("_" + o)) {
                                        isSameType(types, name);
                                        types.push({
                                            name: name,
                                            type: short_name_1.shortNames[o]
                                        });
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // 扩展节点
            const mountedChildren = instance.mountedChildren;
            if (mountedChildren && Array.isArray(mountedChildren) && mountedChildren.length > 0) {
                for (let i = 0; i < mountedChildren.length; i++) {
                    const child = mountedChildren[i];
                    const childInfo = prefab[child.__id__];
                    const nodes = childInfo.nodes;
                    if (nodes && Array.isArray(nodes) && nodes.length > 0) {
                        for (let j = 0; j < nodes.length; j++) {
                            const node = nodes[j];
                            const nodeInfo = prefab[node.__id__];
                            if (nodeInfo.__type__ == "cc.Node") {
                                await traversePrefabNode(nodeInfo, prefab, types);
                            }
                        }
                    }
                }
            }
        }
        return;
    }
    if (!node._name) {
        return;
    }
    // 如果是节点，则需要遍历节点
    if (node._name.startsWith('_')) {
        const components = node._components;
        const name = (_d = node._name) !== null && _d !== void 0 ? _d : "";
        let find = false;
        // 如果是用短名称开头，则说明成员变量要用对应的组件类型
        for (const o in short_name_1.shortNames) {
            if (name.startsWith("_" + o)) {
                const compInfoID = components.find((comp) => {
                    const compInfo = prefab[comp.__id__];
                    return compInfo.__type__ == short_name_1.shortNames[o];
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
        for (let i = 0; i < node._children.length; i++) {
            const child = node._children[i];
            const childInfo = prefab[child.__id__];
            if (childInfo.__type__ == "cc.Node") {
                await traversePrefabNode(childInfo, prefab, types);
            }
        }
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
                    await traversePrefabNode(node, prefab, types);
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
                    initializer: "null!",
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
                // 先看看是不是property装饰器
                const decorators = prop.getDecorators();
                let existingPropertyDecorator = null;
                for (const decorator of decorators) {
                    if (decorator.getName() === 'property') {
                        existingPropertyDecorator = decorator;
                        break;
                    }
                }
                if (existingPropertyDecorator) {
                    prop.remove();
                }
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
function onNodeMenu(node) {
    return [
        {
            label: 'i18n:game-framework.hierarchy.menu.nodeMenu',
            async click() {
                if (!node || !node.uuid || node.type !== "cc.Node") {
                    return;
                }
                Editor.Panel.open('game-framework.set-name', node.uuid);
            }
        },
    ];
}
exports.onNodeMenu = onNodeMenu;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGllcmFyY2h5LW1lbnUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvaGllcmFyY2h5L2hpZXJhcmNoeS1tZW51LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUNBLDJCQUFrQztBQUNsQyxnREFBd0I7QUFDeEIsdUNBQXFEO0FBQ3JELDhDQUEyQztBQUUzQyxTQUFTLFVBQVUsQ0FBQyxLQUF1QyxFQUFFLElBQVk7SUFDckUsZUFBZTtJQUNmLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFDO0lBQ3RELElBQUksWUFBWSxFQUFFO1FBQ2QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsa0JBQWtCLElBQUksR0FBRyxDQUFDLENBQUM7UUFDL0MsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQkFBa0IsSUFBSSxHQUFHLENBQUMsQ0FBQztLQUM5QztBQUNMLENBQUM7QUFFRCxLQUFLLFVBQVUsa0JBQWtCLENBQUMsSUFBUyxFQUFFLE1BQVcsRUFBRSxLQUFZOztJQUVsRSxvQkFBb0I7SUFDcEIsa0JBQWtCO0lBQ2xCLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDO0lBQ3JDLE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNwQyxNQUFNLFFBQVEsR0FBRyxVQUFVLENBQUMsS0FBSyxJQUFJLFVBQVUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDO0lBQy9ELElBQUksUUFBUSxFQUFFO1FBQ1YsTUFBTSxRQUFRLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsa0JBQWtCLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFFeEYsSUFBSSxRQUFRLElBQUksUUFBUSxDQUFDLElBQUksRUFBRTtZQUMzQixNQUFNLGFB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Q0FBQyxXQUFXLEVBQUU7d0JBQ2QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsMkNBQTJDLENBQUMsQ0FBQyxDQUFDO3FCQUNuRjtpQkFDSjtZQUNMLENBQUM7U0FDSjtLQUNKLENBQUM7QUFDTixDQUFDO0FBbkRELGdDQW1EQztBQUFBLENBQUM7QUFFRixTQUFnQixVQUFVLENBQUMsSUFBZTtJQUN0QyxPQUFPO1FBQ0g7WUFDSSxLQUFLLEVBQUUsNkNBQTZDO1lBQ3BELEtBQUssQ0FBQyxLQUFLO2dCQUVQLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssU0FBUyxFQUFFO29CQUNoRCxPQUFPO2lCQUNWO2dCQUVELE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM1RCxDQUFDO1NBQ0o7S0FDSixDQUFDO0FBQ04sQ0FBQztBQWRELGdDQWNDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXNzZXRJbmZvIH0gZnJvbSBcIkBjb2Nvcy9jcmVhdG9yLXR5cGVzL2VkaXRvci9wYWNrYWdlcy9hc3NldC1kYi9AdHlwZXMvcHVibGljXCI7XG5pbXBvcnQgeyByZWFkRmlsZVN5bmMgfSBmcm9tIFwiZnNcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgeyBEZWNvcmF0b3IsIFByb2plY3QsIFNjb3BlIH0gZnJvbSBcInRzLW1vcnBoXCI7XG5pbXBvcnQgeyBzaG9ydE5hbWVzIH0gZnJvbSBcIi4uL3Nob3J0LW5hbWVcIjtcblxuZnVuY3Rpb24gaXNTYW1lVHlwZSh0eXBlczogeyBuYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZyB9W10sIG5hbWU6IHN0cmluZykge1xuICAgIC8vIOajgOafpeaYr+WQpuW3sue7j+WtmOWcqOWQjOWQjeiKgueCuVxuICAgIGNvbnN0IGV4aXN0aW5nVHlwZSA9IHR5cGVzLmZpbmQodCA9PiB0Lm5hbWUgPT09IG5hbWUpO1xuICAgIGlmIChleGlzdGluZ1R5cGUpIHtcbiAgICAgICAgRWRpdG9yLkRpYWxvZy5lcnJvcihg6K2m5ZGKOiDlj5HnjrDph43lpI3nmoToioLngrnlkI3np7AgXCIke25hbWV9XCJgKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDorablkYo6IOWPkeeOsOmHjeWkjeeahOiKgueCueWQjeensCBcIiR7bmFtZX1cImApO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gdHJhdmVyc2VQcmVmYWJOb2RlKG5vZGU6IGFueSwgcHJlZmFiOiBhbnksIHR5cGVzOiBhbnlbXSkge1xuXG4gICAgLy8g6ZyA6KaB5YWI5qOA5rWL6L+Z5Liqbm9kZeaYr+WQpuaYr+mihOWItuS9k1xuICAgIC8vIOWmguaenOaYr+mihOWItuS9k++8jOWImemcgOimgemBjeWOhumihOWItuS9k1xuICAgIGNvbnN0IHByZWZhYklkID0gbm9kZS5fcHJlZmFiLl9faWRfXztcbiAgICBjb25zdCBwcmVmYWJJbmZvID0gcHJlZmFiW3ByZWZhYklkXTtcbiAgICBjb25zdCBpc1ByZWZhYiA9IHByZWZhYkluZm8uYXNzZXQgJiYgcHJlZmFiSW5mby5hc3NldC5fX3V1aWRfXztcbiAgICBpZiAoaXNQcmVmYWIpIHtcbiAgICAgICAgY29uc3Qgbm9kZUluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgaXNQcmVmYWIpO1xuXG4gICAgICAgIGlmIChub2RlSW5mbyAmJiBub2RlSW5mby5maWxlKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmYWJDb250ZW50ID0gcmVhZEZpbGVTeW5jKG5vZGVJbmZvIS5maWxlLCAndXRmLTgnKTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcHJlZmFiMSA9IEpTT04ucGFyc2UocHJlZmFiQ29udGVudCk7XG4gICAgICAgICAgICAgICAgY29uc3QgZGF0YUlkID0gcHJlZmFiMVswXSAmJiBwcmVmYWIxWzBdPy5kYXRhPy5fX2lkX187XG4gICAgICAgICAgICAgICAgY29uc3QgaXNOb2RlID0gcHJlZmFiMVtkYXRhSWRdICYmIHByZWZhYjFbZGF0YUlkXT8uX190eXBlX18gPT0gXCJjYy5Ob2RlXCI7XG5cbiAgICAgICAgICAgICAgICBpZiAoaXNOb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRyYXZlcnNlUHJlZmFiTm9kZShwcmVmYWIxW2RhdGFJZF0sIHByZWZhYjEsIHR5cGVzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBwYXJzZSBwcmVmYWIgY29udGVudDonLCBlcnJvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyDlpoLmnpzpgY3ljoblrozkuobvvIznnIvnnIvpooTliLbkvZPnmoTlsZ7mgKfph43ovb1cbiAgICAgICAgY29uc3QgaW5zdGFuY2VJRCA9IHByZWZhYkluZm8uaW5zdGFuY2UgJiYgcHJlZmFiSW5mby5pbnN0YW5jZS5fX2lkX187XG4gICAgICAgIGNvbnN0IGluc3RhbmNlID0gcHJlZmFiW2luc3RhbmNlSURdO1xuXG4gICAgICAgIGlmIChpbnN0YW5jZSkge1xuXG4gICAgICAgICAgICAvLyDph43ovb3lsZ7mgKdcbiAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5T3ZlcnJpZGVzID0gaW5zdGFuY2UucHJvcGVydHlPdmVycmlkZXM7XG4gICAgICAgICAgICBpZiAocHJvcGVydHlPdmVycmlkZXMgJiYgQXJyYXkuaXNBcnJheShwcm9wZXJ0eU92ZXJyaWRlcykgJiYgcHJvcGVydHlPdmVycmlkZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcHJvcGVydHlPdmVycmlkZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvcGVydHlPdmVycmlkZSA9IHByb3BlcnR5T3ZlcnJpZGVzW2ldO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBvdmVycmlkZSA9IHByZWZhYltwcm9wZXJ0eU92ZXJyaWRlLl9faWRfX107XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKG92ZXJyaWRlICYmIG92ZXJyaWRlLl9fdHlwZV9fID09IFwiQ0NQcm9wZXJ0eU92ZXJyaWRlSW5mb1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9wZXJ0eVBhdGggPSBvdmVycmlkZS5wcm9wZXJ0eVBhdGggYXMgc3RyaW5nW107XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB2YWx1ZSA9IG92ZXJyaWRlLnZhbHVlO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJvcGVydHlQYXRoICYmIHByb3BlcnR5UGF0aC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5kZXggPSBwcm9wZXJ0eVBhdGguZmluZEluZGV4KGUgPT4gZSA9PSBcIl9uYW1lXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbmRleCAhPSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuYW1lID0gdmFsdWU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBvIGluIHNob3J0TmFtZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuYW1lLnN0YXJ0c1dpdGgoXCJfXCIgKyBvKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzU2FtZVR5cGUodHlwZXMsIG5hbWUpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IG5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IHNob3J0TmFtZXNbb11cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8g5omp5bGV6IqC54K5XG4gICAgICAgICAgICBjb25zdCBtb3VudGVkQ2hpbGRyZW4gPSBpbnN0YW5jZS5tb3VudGVkQ2hpbGRyZW47XG4gICAgICAgICAgICBpZiAobW91bnRlZENoaWxkcmVuICYmIEFycmF5LmlzQXJyYXkobW91bnRlZENoaWxkcmVuKSAmJiBtb3VudGVkQ2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW91bnRlZENoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNoaWxkID0gbW91bnRlZENoaWxkcmVuW2ldO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjaGlsZEluZm8gPSBwcmVmYWJbY2hpbGQuX19pZF9fXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgbm9kZXMgPSBjaGlsZEluZm8ubm9kZXM7XG4gICAgICAgICAgICAgICAgICAgIGlmIChub2RlcyAmJiBBcnJheS5pc0FycmF5KG5vZGVzKSAmJiBub2Rlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IG5vZGVzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgbm9kZSA9IG5vZGVzW2pdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVJbmZvID0gcHJlZmFiW25vZGUuX19pZF9fXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobm9kZUluZm8uX190eXBlX18gPT0gXCJjYy5Ob2RlXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdHJhdmVyc2VQcmVmYWJOb2RlKG5vZGVJbmZvLCBwcmVmYWIsIHR5cGVzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghbm9kZS5fbmFtZSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8g5aaC5p6c5piv6IqC54K577yM5YiZ6ZyA6KaB6YGN5Y6G6IqC54K5XG4gICAgaWYgKG5vZGUuX25hbWUuc3RhcnRzV2l0aCgnXycpKSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBub2RlLl9jb21wb25lbnRzO1xuICAgICAgICBjb25zdCBuYW1lID0gbm9kZS5fbmFtZSA/PyBcIlwiO1xuICAgICAgICBsZXQgZmluZCA9IGZhbHNlO1xuXG4gICAgICAgIC8vIOWmguaenOaYr+eUqOefreWQjeensOW8gOWktO+8jOWImeivtOaYjuaIkOWRmOWPmOmHj+imgeeUqOWvueW6lOeahOe7hOS7tuexu+Wei1xuICAgICAgICBmb3IgKGNvbnN0IG8gaW4gc2hvcnROYW1lcykge1xuICAgICAgICAgICAgaWYgKG5hbWUuc3RhcnRzV2l0aChcIl9cIiArIG8pKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29tcEluZm9JRCA9IGNvbXBvbmVudHMuZmluZCgoY29tcDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBJbmZvID0gcHJlZmFiW2NvbXAuX19pZF9fXTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNvbXBJbmZvLl9fdHlwZV9fID09IHNob3J0TmFtZXNbb107XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBpZiAoY29tcEluZm9JRCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wSW5mbyA9IHByZWZhYltjb21wSW5mb0lELl9faWRfX107XG4gICAgICAgICAgICAgICAgICAgIGlmIChjb21wSW5mbykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaXNTYW1lVHlwZSh0eXBlcywgbm9kZS5fbmFtZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUuX25hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogY29tcEluZm8uX190eXBlX19cbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgZmluZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWZpbmQpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgY29tcCBvZiBjb21wb25lbnRzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29tcEluZm8gPSBwcmVmYWJbY29tcC5fX2lkX19dO1xuXG4gICAgICAgICAgICAgICAgLy8g6buY6K6k5LiN5Y+WVUlUcmFuc2Zvcm3lkoxXaWRnZXRcbiAgICAgICAgICAgICAgICBpZiAoY29tcEluZm8uX190eXBlX18gIT0gXCJjYy5VSVRyYW5zZm9ybVwiICYmIGNvbXBJbmZvLl9fdHlwZV9fICE9IFwiY2MuV2lkZ2V0XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgaXNTYW1lVHlwZSh0eXBlcywgbm9kZS5fbmFtZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgdHlwZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLl9uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogY29tcEluZm8uX190eXBlX19cbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8g5Y+q5Y+W56ys5LiA5LiqXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChub2RlLl9jaGlsZHJlbiAmJiBBcnJheS5pc0FycmF5KG5vZGUuX2NoaWxkcmVuKSAmJiBub2RlLl9jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbm9kZS5fY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGNoaWxkID0gbm9kZS5fY2hpbGRyZW5baV07XG5cbiAgICAgICAgICAgIGNvbnN0IGNoaWxkSW5mbyA9IHByZWZhYltjaGlsZC5fX2lkX19dO1xuICAgICAgICAgICAgaWYgKGNoaWxkSW5mby5fX3R5cGVfXyA9PSBcImNjLk5vZGVcIikge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRyYXZlcnNlUHJlZmFiTm9kZShjaGlsZEluZm8sIHByZWZhYiwgdHlwZXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBmaW5kTm9kZXNXaXRoVW5kZXJzY29yZVByZWZpeChhc3NldEluZm86IEFzc2V0SW5mbyAmIHsgcHJlZmFiOiB7IGFzc2V0VXVpZDogc3RyaW5nIH0gfSkge1xuICAgIHRyeSB7XG5cbiAgICAgICAgY29uc3QgdHlwZXM6IHsgbmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcgfVtdID0gW107XG4gICAgICAgIGNvbnN0IG5vZGVJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGFzc2V0SW5mby5wcmVmYWIuYXNzZXRVdWlkKTtcblxuICAgICAgICBpZiAobm9kZUluZm8gJiYgbm9kZUluZm8uZmlsZSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZmFiQ29udGVudCA9IHJlYWRGaWxlU3luYyhub2RlSW5mbyEuZmlsZSwgJ3V0Zi04Jyk7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHByZWZhYiA9IEpTT04ucGFyc2UocHJlZmFiQ29udGVudCk7XG4gICAgICAgICAgICAgICAgY29uc3Qgbm9kZSA9IHByZWZhYi5maW5kKChpdGVtOiBhbnkpID0+IGl0ZW0uX25hbWUgPT0gYXNzZXRJbmZvLm5hbWUgJiYgaXRlbS5fX3R5cGVfXyA9PSBcImNjLk5vZGVcIik7XG4gICAgICAgICAgICAgICAgaWYgKG5vZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdHJhdmVyc2VQcmVmYWJOb2RlKG5vZGUsIHByZWZhYiwgdHlwZXMpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHlwZXM7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gcGFyc2UgcHJlZmFiIGNvbnRlbnQ6JywgZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gdHJhdmVyc2Ugbm9kZXM6JywgZXJyb3IpO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdG9yTWVtYmVycyhmaWxlUGF0aDogc3RyaW5nLCB0eXBlczogeyBuYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZyB9W10pIHtcbiAgICAvLyDliJvlu7rpobnnm65cbiAgICBjb25zdCBwcm9qZWN0ID0gbmV3IFByb2plY3QoKTtcblxuICAgIC8vIOa3u+WKoOa6kOaWh+S7tlxuICAgIGNvbnN0IHNvdXJjZUZpbGUgPSBwcm9qZWN0LmFkZFNvdXJjZUZpbGVBdFBhdGgoZmlsZVBhdGgpO1xuXG4gICAgLy8g6I635Y+W5omA5pyJ57G75aOw5piOXG4gICAgY29uc3QgY2xhc3NlcyA9IHNvdXJjZUZpbGUuZ2V0Q2xhc3NlcygpO1xuXG4gICAgLy8g6YGN5Y6G5q+P5Liq57G7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjbGFzc2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGNsYXNzRGVjbGFyYXRpb24gPSBjbGFzc2VzW2ldO1xuXG4gICAgICAgIC8vIOiOt+WPluexu+WQjVxuICAgICAgICBjb25zdCBjbGFzc05hbWUgPSBjbGFzc0RlY2xhcmF0aW9uLmdldE5hbWUoKTtcblxuICAgICAgICAvLyDlhYjmt7vliqDmlrDnmoTlsZ7mgKdcbiAgICAgICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHR5cGVzLmxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICAgICAgY29uc3QgdHlwZURlZiA9IHR5cGVzW2luZGV4XTtcbiAgICAgICAgICAgIGlmICghY2xhc3NEZWNsYXJhdGlvbi5nZXRQcm9wZXJ0eSh0eXBlRGVmLm5hbWUpKSB7XG4gICAgICAgICAgICAgICAgLy8g5qOA5p+l5piv5ZCm5piv6Ieq5a6a5LmJ57uE5Lu277yI6Z2eY2PlvIDlpLTvvIlcbiAgICAgICAgICAgICAgICBjb25zdCBpc0N1c3RvbUNvbXBvbmVudCA9ICF0eXBlRGVmLnR5cGUuc3RhcnRzV2l0aCgnY2MuJyk7XG4gICAgICAgICAgICAgICAgbGV0IHR5cGVOYW1lID0gdHlwZURlZi50eXBlO1xuICAgICAgICAgICAgICAgIGxldCBtb2R1bGVQYXRoID0gJ2NjJztcblxuICAgICAgICAgICAgICAgIGlmIChpc0N1c3RvbUNvbXBvbmVudCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB1dWlkID0gRWRpdG9yLlV0aWxzLlVVSUQuZGVjb21wcmVzc1VVSUQodHlwZURlZi50eXBlKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIHV1aWQpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChhc3NldEluZm8gJiYgYXNzZXRJbmZvLmZpbGUpIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g6K+75Y+W57G75om+5Yiw5a+85Ye6XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXN0b21Db21wb25lbnRQcm9qZWN0ID0gbmV3IFByb2plY3QoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1c3RvbUNvbXBvbmVudEZpbGUgPSBjdXN0b21Db21wb25lbnRQcm9qZWN0LmFkZFNvdXJjZUZpbGVBdFBhdGgoYXNzZXRJbmZvLmZpbGUpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDojrflj5bmlofku7bkuK3miYDmnInlr7zlh7rnmoTnsbtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4cG9ydGVkQ2xhc3NlcyA9IGN1c3RvbUNvbXBvbmVudEZpbGUuZ2V0Q2xhc3NlcygpLmZpbHRlcihjID0+IGMuaXNFeHBvcnRlZCgpKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c5pyJ5a+85Ye655qE57G777yM5L2/55So56ys5LiA5Liq57G755qE5ZCN56ewXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXhwb3J0ZWRDbGFzc2VzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlTmFtZSA9IGV4cG9ydGVkQ2xhc3Nlc1swXS5nZXROYW1lKCkgfHwgYXNzZXRJbmZvLm5hbWU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlj6rkvb/nlKjmlofku7blkI3kvZzkuLrmqKHlnZfot6/lvoTvvIjkuI3lkKvmianlsZXlkI3vvIlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWxlRGlyID0gcGF0aC5kaXJuYW1lKGZpbGVQYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZWxhdGl2ZVBhdGggPSBwYXRoLnJlbGF0aXZlKGZpbGVEaXIsIHBhdGguZGlybmFtZShhc3NldEluZm8uZmlsZSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVOYW1lV2l0aG91dEV4dCA9IHBhdGguYmFzZW5hbWUoYXNzZXRJbmZvLmZpbGUsIHBhdGguZXh0bmFtZShhc3NldEluZm8uZmlsZSkpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5p6E5bu65ZCI6YCC55qE5a+85YWl6Lev5b6EXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlbGF0aXZlUGF0aCA9PT0gJycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlUGF0aCA9IGAuLyR7ZmlsZU5hbWVXaXRob3V0RXh0fWA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlUGF0aCA9IGAke3JlbGF0aXZlUGF0aC5yZXBsYWNlKC9cXFxcL2csICcvJyl9LyR7ZmlsZU5hbWVXaXRob3V0RXh0fWA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c6Lev5b6E5LiN5piv5LulLi/miJYuLi/lvIDlpLTvvIzmt7vliqAuL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghL15cXC5cXC4/XFwvLy50ZXN0KG1vZHVsZVBhdGgpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVBhdGggPSBgLi8ke21vZHVsZVBhdGh9YDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c5rKh5pyJ5om+5Yiw5a+85Ye655qE57G777yM5L2/55So5paH5Lu25ZCNXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBObyBleHBvcnRlZCBjbGFzcyBmb3VuZCBpbiAke2Fzc2V0SW5mby5maWxlfSwgdXNpbmcgYXNzZXQgbmFtZSBpbnN0ZWFkYCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZU5hbWUgPSBhc3NldEluZm8ubmFtZTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOiuoeeul+ebuOWvuei3r+W+hOWQjOS4ilxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVEaXIgPSBwYXRoLmRpcm5hbWUoZmlsZVBhdGgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlbGF0aXZlUGF0aCA9IHBhdGgucmVsYXRpdmUoZmlsZURpciwgcGF0aC5kaXJuYW1lKGFzc2V0SW5mby5maWxlKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlsZU5hbWVXaXRob3V0RXh0ID0gcGF0aC5iYXNlbmFtZShhc3NldEluZm8uZmlsZSwgcGF0aC5leHRuYW1lKGFzc2V0SW5mby5maWxlKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVsYXRpdmVQYXRoID09PSAnJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVQYXRoID0gYC4vJHtmaWxlTmFtZVdpdGhvdXRFeHR9YDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVQYXRoID0gYCR7cmVsYXRpdmVQYXRoLnJlcGxhY2UoL1xcXFwvZywgJy8nKX0vJHtmaWxlTmFtZVdpdGhvdXRFeHR9YDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIS9eXFwuXFwuP1xcLy8udGVzdChtb2R1bGVQYXRoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVQYXRoID0gYC4vJHttb2R1bGVQYXRofWA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gY2Pnu4Tku7blj6rpnIDopoHnu4Tku7blkI1cbiAgICAgICAgICAgICAgICAgICAgdHlwZU5hbWUgPSB0eXBlRGVmLnR5cGUuc3BsaXQoJy4nKS5wb3AoKSB8fCAnJztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjbGFzc0RlY2xhcmF0aW9uLmluc2VydFByb3BlcnR5KDAsIHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogdHlwZURlZi5uYW1lLFxuICAgICAgICAgICAgICAgICAgICB0eXBlOiB0eXBlTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgaW5pdGlhbGl6ZXI6IFwibnVsbCFcIixcbiAgICAgICAgICAgICAgICAgICAgZGVjb3JhdG9yczogW3tcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6ICdwcm9wZXJ0eScsXG4gICAgICAgICAgICAgICAgICAgICAgICBhcmd1bWVudHM6IFtge3R5cGU6ICR7dHlwZU5hbWV9fWBdXG4gICAgICAgICAgICAgICAgICAgIH1dLFxuICAgICAgICAgICAgICAgICAgICBpc1JlYWRvbmx5OiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBzY29wZTogU2NvcGUuUHJpdmF0ZVxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgLy8g5re75Yqg5a+85YWlXG4gICAgICAgICAgICAgICAgaWYgKGlzQ3VzdG9tQ29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOa3u+WKoOiHquWumuS5iee7hOS7tueahOWvvOWFpVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBleGlzdGluZ0ltcG9ydCA9IHNvdXJjZUZpbGUuZ2V0SW1wb3J0RGVjbGFyYXRpb24oaSA9PlxuICAgICAgICAgICAgICAgICAgICAgICAgaS5nZXRNb2R1bGVTcGVjaWZpZXJWYWx1ZSgpID09PSBtb2R1bGVQYXRoXG4gICAgICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGV4aXN0aW5nSW1wb3J0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuYW1lZEltcG9ydHMgPSBleGlzdGluZ0ltcG9ydC5nZXROYW1lZEltcG9ydHMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbmFtZWRJbXBvcnRzLnNvbWUoaW1wID0+IGltcC5nZXROYW1lKCkgPT09IHR5cGVOYW1lKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nSW1wb3J0LmFkZE5hbWVkSW1wb3J0KHR5cGVOYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZUZpbGUuYWRkSW1wb3J0RGVjbGFyYXRpb24oe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVkSW1wb3J0czogW3R5cGVOYW1lXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVTcGVjaWZpZXI6IG1vZHVsZVBhdGhcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g5re75YqgIGNjIOe7hOS7tuWvvOWFpVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjY0ltcG9ydCA9IHNvdXJjZUZpbGUuZ2V0SW1wb3J0RGVjbGFyYXRpb24oaSA9PlxuICAgICAgICAgICAgICAgICAgICAgICAgaS5nZXRNb2R1bGVTcGVjaWZpZXJWYWx1ZSgpID09PSAnY2MnXG4gICAgICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGNjSW1wb3J0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuYW1lZEltcG9ydHMgPSBjY0ltcG9ydC5nZXROYW1lZEltcG9ydHMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbmFtZWRJbXBvcnRzLnNvbWUoaW1wID0+IGltcC5nZXROYW1lKCkgPT09IHR5cGVOYW1lKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNjSW1wb3J0LmFkZE5hbWVkSW1wb3J0KHR5cGVOYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZUZpbGUuYWRkSW1wb3J0RGVjbGFyYXRpb24oe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVkSW1wb3J0czogW3R5cGVOYW1lXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVTcGVjaWZpZXI6ICdjYydcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8g6I635Y+W5omA5pyJ56eB5pyJ5bGe5oCnXG4gICAgICAgIGNvbnN0IHByaXZhdGVQcm9wcyA9IGNsYXNzRGVjbGFyYXRpb24uZ2V0UHJvcGVydGllcygpLmZpbHRlcihwcm9wID0+XG4gICAgICAgICAgICBwcm9wLmdldE5hbWUoKS5zdGFydHNXaXRoKCdfJylcbiAgICAgICAgKTtcblxuICAgICAgICAvLyDlpITnkIbnjrDmnInlsZ7mgKdcbiAgICAgICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHByaXZhdGVQcm9wcy5sZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgICAgIGNvbnN0IHByb3AgPSBwcml2YXRlUHJvcHNbaW5kZXhdO1xuXG4gICAgICAgICAgICBjb25zdCBuYW1lID0gcHJvcC5nZXROYW1lKCk7XG4gICAgICAgICAgICBjb25zdCB0eXBlID0gcHJvcC5nZXRUeXBlKCkuZ2V0VGV4dCgpO1xuICAgICAgICAgICAgY29uc3QgdHlwZURlZiA9IHR5cGVzLmZpbmQoaXRlbSA9PiBpdGVtLm5hbWUgPT09IG5hbWUpO1xuXG4gICAgICAgICAgICBpZiAodHlwZURlZikge1xuICAgICAgICAgICAgICAgIC8vIOabtOaWsOexu+Wei+WSjOijhemlsOWZqFxuICAgICAgICAgICAgICAgIGlmICh0eXBlRGVmLnR5cGUgIT09IHR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g5qOA5p+l5piv5ZCm5piv6Ieq5a6a5LmJ57uE5Lu2XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzQ3VzdG9tQ29tcG9uZW50ID0gIXR5cGVEZWYudHlwZS5zdGFydHNXaXRoKCdjYy4nKTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHR5cGVOYW1lID0gdHlwZURlZi50eXBlO1xuICAgICAgICAgICAgICAgICAgICBsZXQgbW9kdWxlUGF0aCA9ICdjYyc7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzQ3VzdG9tQ29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB1dWlkID0gRWRpdG9yLlV0aWxzLlVVSUQuZGVjb21wcmVzc1VVSUQodHlwZURlZi50eXBlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCB1dWlkKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFzc2V0SW5mbyAmJiBhc3NldEluZm8uZmlsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOivu+WPluexu+aJvuWIsOWvvOWHulxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1c3RvbUNvbXBvbmVudFByb2plY3QgPSBuZXcgUHJvamVjdCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1c3RvbUNvbXBvbmVudEZpbGUgPSBjdXN0b21Db21wb25lbnRQcm9qZWN0LmFkZFNvdXJjZUZpbGVBdFBhdGgoYXNzZXRJbmZvLmZpbGUpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g6I635Y+W5paH5Lu25Lit5omA5pyJ5a+85Ye655qE57G7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhwb3J0ZWRDbGFzc2VzID0gY3VzdG9tQ29tcG9uZW50RmlsZS5nZXRDbGFzc2VzKCkuZmlsdGVyKGMgPT4gYy5pc0V4cG9ydGVkKCkpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c5pyJ5a+85Ye655qE57G777yM5L2/55So56ys5LiA5Liq57G755qE5ZCN56ewXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGV4cG9ydGVkQ2xhc3Nlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVOYW1lID0gZXhwb3J0ZWRDbGFzc2VzWzBdLmdldE5hbWUoKSB8fCBhc3NldEluZm8ubmFtZTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlj6rkvb/nlKjmlofku7blkI3kvZzkuLrmqKHlnZfot6/lvoTvvIjkuI3lkKvmianlsZXlkI3vvIlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlsZURpciA9IHBhdGguZGlybmFtZShmaWxlUGF0aCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlbGF0aXZlUGF0aCA9IHBhdGgucmVsYXRpdmUoZmlsZURpciwgcGF0aC5kaXJuYW1lKGFzc2V0SW5mby5maWxlKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVOYW1lV2l0aG91dEV4dCA9IHBhdGguYmFzZW5hbWUoYXNzZXRJbmZvLmZpbGUsIHBhdGguZXh0bmFtZShhc3NldEluZm8uZmlsZSkpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOaehOW7uuWQiOmAgueahOWvvOWFpei3r+W+hFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVsYXRpdmVQYXRoID09PSAnJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlUGF0aCA9IGAuLyR7ZmlsZU5hbWVXaXRob3V0RXh0fWA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVQYXRoID0gYCR7cmVsYXRpdmVQYXRoLnJlcGxhY2UoL1xcXFwvZywgJy8nKX0vJHtmaWxlTmFtZVdpdGhvdXRFeHR9YDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOi3r+W+hOS4jeaYr+S7pS4v5oiWLi4v5byA5aS077yM5re75YqgLi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCEvXlxcLlxcLj9cXC8vLnRlc3QobW9kdWxlUGF0aCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVBhdGggPSBgLi8ke21vZHVsZVBhdGh9YDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOayoeacieaJvuWIsOWvvOWHuueahOexu++8jOS9v+eUqOaWh+S7tuWQjVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlTmFtZSA9IGFzc2V0SW5mby5uYW1lO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOiuoeeul+ebuOWvuei3r+W+hOWQjOS4ilxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWxlRGlyID0gcGF0aC5kaXJuYW1lKGZpbGVQYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVsYXRpdmVQYXRoID0gcGF0aC5yZWxhdGl2ZShmaWxlRGlyLCBwYXRoLmRpcm5hbWUoYXNzZXRJbmZvLmZpbGUpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlsZU5hbWVXaXRob3V0RXh0ID0gcGF0aC5iYXNlbmFtZShhc3NldEluZm8uZmlsZSwgcGF0aC5leHRuYW1lKGFzc2V0SW5mby5maWxlKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlbGF0aXZlUGF0aCA9PT0gJycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVBhdGggPSBgLi8ke2ZpbGVOYW1lV2l0aG91dEV4dH1gO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlUGF0aCA9IGAke3JlbGF0aXZlUGF0aC5yZXBsYWNlKC9cXFxcL2csICcvJyl9LyR7ZmlsZU5hbWVXaXRob3V0RXh0fWA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIS9eXFwuXFwuP1xcLy8udGVzdChtb2R1bGVQYXRoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlUGF0aCA9IGAuLyR7bW9kdWxlUGF0aH1gO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gY2Pnu4Tku7blj6rpnIDopoHnu4Tku7blkI1cbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVOYW1lID0gdHlwZURlZi50eXBlLnNwbGl0KCcuJykucG9wKCkgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBjb25zdCBkZWNvcmF0b3JzID0gcHJvcC5nZXREZWNvcmF0b3JzKCk7XG4gICAgICAgICAgICAgICAgICAgIGxldCBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yOiBEZWNvcmF0b3IgfCBudWxsID0gbnVsbDtcblxuICAgICAgICAgICAgICAgICAgICAvLyDmn6Xmib7njrDmnInnmoQgcHJvcGVydHkg6KOF6aWw5ZmoXG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZGVjb3JhdG9yIG9mIGRlY29yYXRvcnMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkZWNvcmF0b3IuZ2V0TmFtZSgpID09PSAncHJvcGVydHknKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvciA9IGRlY29yYXRvcjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIOabtOaWsOexu+Wei1xuICAgICAgICAgICAgICAgICAgICBwcm9wLnNldFR5cGUodHlwZU5hbWUpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDojrflj5bnjrDmnInoo4XppbDlmajnmoTlj4LmlbDmlofmnKxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFyZ3MgPSBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLmdldEFyZ3VtZW50cygpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5bCd6K+V6Kej5p6Q546w5pyJ5Y+C5pWwXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYXJnVGV4dCA9IGFyZ3NbMF0uZ2V0VGV4dCgpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c5piv5a+56LGh5b2i5byP55qE5Y+C5pWwXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFyZ1RleHQuc3RhcnRzV2l0aCgneycpICYmIGFyZ1RleHQuZW5kc1dpdGgoJ30nKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmj5Dlj5blr7nosaHlhoXlrrnvvIznp7vpmaTliY3lkI7nmoToirHmi6zlj7dcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgb2JqZWN0Q29udGVudHMgPSBhcmdUZXh0LnN1YnN0cmluZygxLCBhcmdUZXh0Lmxlbmd0aCAtIDEpLnRyaW0oKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmo4Dmn6XmmK/lkKbmnInlhbbku5blsZ7mgKdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG9iamVjdENvbnRlbnRzLmluY2x1ZGVzKCcsJykgfHwgIW9iamVjdENvbnRlbnRzLmluY2x1ZGVzKCd0eXBlOicpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmnoTlu7rmlrDnmoTlr7nosaHlj4LmlbDvvIzljIXlkKvljp/mnInlsZ7mgKflkozmlrDnmoTnsbvlnotcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBuZXdBcmcgPSAneyc7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWkhOeQhuW3suacieWxnuaAp1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvcGVydGllcyA9IG9iamVjdENvbnRlbnRzLnNwbGl0KCcsJykubWFwKHAgPT4gcC50cmltKCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdHlwZUluZGV4ID0gcHJvcGVydGllcy5maW5kSW5kZXgocCA9PiBwLnN0YXJ0c1dpdGgoJ3R5cGU6JykpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZUluZGV4ID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmm7/mjaLnsbvlnovlsZ7mgKdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzW3R5cGVJbmRleF0gPSBgdHlwZTogJHt0eXBlTmFtZX1gO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmt7vliqDnsbvlnovlsZ7mgKdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzLnB1c2goYHR5cGU6ICR7dHlwZU5hbWV9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ld0FyZyArPSBwcm9wZXJ0aWVzLmpvaW4oJywgJykgKyAnfSc7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOabtOaWsOijhemlsOWZqFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5yZW1vdmVBcmd1bWVudCgwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nUHJvcGVydHlEZWNvcmF0b3IuYWRkQXJndW1lbnQobmV3QXJnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOS7heWMheWQq+exu+Wei+WumuS5ie+8jOabtOaWsOexu+Wei1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5yZW1vdmVBcmd1bWVudCgwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nUHJvcGVydHlEZWNvcmF0b3IuYWRkQXJndW1lbnQoYHt0eXBlOiAke3R5cGVOYW1lfX1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOmdnuWvueixoeW9ouW8j+WPguaVsO+8jOabv+aNouS4uuaWsOWPguaVsFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLnJlbW92ZUFyZ3VtZW50KDApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLmFkZEFyZ3VtZW50KGB7dHlwZTogJHt0eXBlTmFtZX19YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmsqHmnInlj4LmlbDvvIzmt7vliqDlj4LmlbBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLmFkZEFyZ3VtZW50KGB7dHlwZTogJHt0eXBlTmFtZX19YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDmsqHmnInmib7liLAgcHJvcGVydHkg6KOF6aWw5Zmo77yM5re75Yqg5paw6KOF6aWw5ZmoXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wLmFkZERlY29yYXRvcih7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogJ3Byb3BlcnR5JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhcmd1bWVudHM6IFtge3R5cGU6ICR7dHlwZU5hbWV9fWBdXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICghcHJvcC5nZXRJbml0aWFsaXplcigpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wLnNldEluaXRpYWxpemVyKCdudWxsJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyDmt7vliqDlr7zlhaVcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzQ3VzdG9tQ29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDmt7vliqDoh6rlrprkuYnnu4Tku7bnmoTlr7zlhaVcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nSW1wb3J0ID0gc291cmNlRmlsZS5nZXRJbXBvcnREZWNsYXJhdGlvbihpID0+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaS5nZXRNb2R1bGVTcGVjaWZpZXJWYWx1ZSgpID09PSBtb2R1bGVQYXRoXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXhpc3RpbmdJbXBvcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuYW1lZEltcG9ydHMgPSBleGlzdGluZ0ltcG9ydC5nZXROYW1lZEltcG9ydHMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW5hbWVkSW1wb3J0cy5zb21lKGltcCA9PiBpbXAuZ2V0TmFtZSgpID09PSB0eXBlTmFtZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdJbXBvcnQuYWRkTmFtZWRJbXBvcnQodHlwZU5hbWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlRmlsZS5hZGRJbXBvcnREZWNsYXJhdGlvbih7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVkSW1wb3J0czogW3R5cGVOYW1lXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlU3BlY2lmaWVyOiBtb2R1bGVQYXRoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDmt7vliqAgY2Mg57uE5Lu25a+85YWlXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjY0ltcG9ydCA9IHNvdXJjZUZpbGUuZ2V0SW1wb3J0RGVjbGFyYXRpb24oaSA9PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGkuZ2V0TW9kdWxlU3BlY2lmaWVyVmFsdWUoKSA9PT0gJ2NjJ1xuICAgICAgICAgICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNjSW1wb3J0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmFtZWRJbXBvcnRzID0gY2NJbXBvcnQuZ2V0TmFtZWRJbXBvcnRzKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFuYW1lZEltcG9ydHMuc29tZShpbXAgPT4gaW1wLmdldE5hbWUoKSA9PT0gdHlwZU5hbWUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNjSW1wb3J0LmFkZE5hbWVkSW1wb3J0KHR5cGVOYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZUZpbGUuYWRkSW1wb3J0RGVjbGFyYXRpb24oe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lZEltcG9ydHM6IFt0eXBlTmFtZV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVNwZWNpZmllcjogJ2NjJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8g5YWI55yL55yL5piv5LiN5pivcHJvcGVydHnoo4XppbDlmahcbiAgICAgICAgICAgICAgICBjb25zdCBkZWNvcmF0b3JzID0gcHJvcC5nZXREZWNvcmF0b3JzKCk7XG4gICAgICAgICAgICAgICAgbGV0IGV4aXN0aW5nUHJvcGVydHlEZWNvcmF0b3I6IERlY29yYXRvciB8IG51bGwgPSBudWxsO1xuXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBkZWNvcmF0b3Igb2YgZGVjb3JhdG9ycykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZGVjb3JhdG9yLmdldE5hbWUoKSA9PT0gJ3Byb3BlcnR5Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvciA9IGRlY29yYXRvcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGV4aXN0aW5nUHJvcGVydHlEZWNvcmF0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJvcC5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgLy8g5L+d5a2Y5L+u5pS5XG4gICAgcHJvamVjdC5zYXZlU3luYygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gb25Sb290TWVudShhc3NldEluZm86IEFzc2V0SW5mbyAmIHsgY29tcG9uZW50czogYW55W10sIHByZWZhYjogeyBhc3NldFV1aWQ6IHN0cmluZyB9IH0pIHtcbiAgICByZXR1cm4gW1xuICAgICAgICB7XG4gICAgICAgICAgICBsYWJlbDogJ2kxOG46Z2FtZS1mcmFtZXdvcmsuaGllcmFyY2h5Lm1lbnUucm9vdE1lbnUnLFxuICAgICAgICAgICAgYXN5bmMgY2xpY2soKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFhc3NldEluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgRWRpdG9yLkRpYWxvZy5pbmZvKCdpMThuOmdhbWUtZnJhbWV3b3JrLmhpZXJhcmNoeS5lcnJvci5ub0Fzc2V0SW5mbycpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8g6YGN5Y6G6IqC54K55qCR5p+l5om+5bim5LiL5YiS57q/55qE6IqC54K55ZKM5bGe5oCnXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHR5cGVzID0gYXdhaXQgZmluZE5vZGVzV2l0aFVuZGVyc2NvcmVQcmVmaXgoYXNzZXRJbmZvKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyDlpITnkIbnu4Tku7bkv6Hmga9cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcG9uZW50cyA9IGFzc2V0SW5mby5jb21wb25lbnRzO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWNvbXBvbmVudHMgfHwgY29tcG9uZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGxldCBoYXNCYXNlVmlldyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgY29tcG9uZW50cy5sZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGNvbXBvbmVudHNbaW5kZXhdO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDojrflj5bnu4Tku7bor6bnu4bkv6Hmga9cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1jb21wb25lbnQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudC52YWx1ZSAgLy8g6L+Z6YeM55qEIHZhbHVlIOWwseaYr+e7hOS7tueahCBVVUlEXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29tcG9uZW50SW5mbykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhc2VWaWV3ID0gY29tcG9uZW50SW5mby5leHRlbmRzPy5maW5kKGl0ZW0gPT4gaXRlbSA9PT0gXCJCYXNlVmlld1wiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYmFzZVZpZXcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFzQmFzZVZpZXcgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDojrflj5botYTmupDkv6Hmga9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdXVpZCA9IEVkaXRvci5VdGlscy5VVUlELmRlY29tcHJlc3NVVUlEKGNvbXBvbmVudEluZm8uY2lkISk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCB1dWlkKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXNzZXRJbmZvICYmIGFzc2V0SW5mby5maWxlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnZW5lcmF0b3JNZW1iZXJzKGFzc2V0SW5mby5maWxlLCB0eXBlcyA/PyBbXSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIEVkaXRvci5EaWFsb2cuaW5mbygn5p6E6YCg5oiQ5ZGY5Ye95pWw5oiQ5YqfJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoIWhhc0Jhc2VWaWV3KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBFZGl0b3IuRGlhbG9nLmVycm9yKEVkaXRvci5JMThuLnQoJ2dhbWUtZnJhbWV3b3JrLmhpZXJhcmNoeS5lcnJvci5ub0Jhc2VWaWV3JykpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICBdO1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIG9uTm9kZU1lbnUobm9kZTogQXNzZXRJbmZvKSB7XG4gICAgcmV0dXJuIFtcbiAgICAgICAge1xuICAgICAgICAgICAgbGFiZWw6ICdpMThuOmdhbWUtZnJhbWV3b3JrLmhpZXJhcmNoeS5tZW51Lm5vZGVNZW51JyxcbiAgICAgICAgICAgIGFzeW5jIGNsaWNrKCkge1xuXG4gICAgICAgICAgICAgICAgaWYgKCFub2RlIHx8ICFub2RlLnV1aWQgfHwgbm9kZS50eXBlICE9PSBcImNjLk5vZGVcIikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgRWRpdG9yLlBhbmVsLm9wZW4oJ2dhbWUtZnJhbWV3b3JrLnNldC1uYW1lJywgbm9kZS51dWlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICBdO1xufSJdfQ==