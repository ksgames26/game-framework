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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGllcmFyY2h5LW1lbnUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvaGllcmFyY2h5L2hpZXJhcmNoeS1tZW51LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUNBLDJCQUFrQztBQUNsQyxnREFBd0I7QUFDeEIsdUNBQXFEO0FBQ3JELDhDQUEyQztBQUUzQyxTQUFTLFVBQVUsQ0FBQyxLQUF1QyxFQUFFLElBQVk7SUFDckUsZUFBZTtJQUNmLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFDO0lBQ3RELElBQUksWUFBWSxFQUFFO1FBQ2QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsa0JBQWtCLElBQUksR0FBRyxDQUFDLENBQUM7UUFDL0MsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQkFBa0IsSUFBSSxHQUFHLENBQUMsQ0FBQztLQUM5QztBQUNMLENBQUM7QUFFRCxLQUFLLFVBQVUsa0JBQWtCLENBQUMsSUFBUyxFQUFFLE1BQVcsRUFBRSxLQUFZOztJQUVsRSxvQkFBb0I7SUFDcEIsa0JBQWtCO0lBQ2xCLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDO0lBQ3JDLE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNwQyxNQUFNLFFBQVEsR0FBRyxVQUFVLENBQUMsS0FBSyxJQUFJLFVBQVUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDO0lBQy9ELElBQUksUUFBUSxFQUFFO1FBQ1YsTUFBTSxRQUFRLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsa0JBQWtCLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFFeEYsSUFBSSxRQUFRLElBQUksUUFBUSxDQUFDLElBQUksRUFBRTtZQUMzQixNQUFNLGFB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Q0FBQyxXQUFXLEVBQUU7d0JBQ2QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsMkNBQTJDLENBQUMsQ0FBQyxDQUFDO3FCQUNuRjtpQkFDSjtZQUNMLENBQUM7U0FDSjtLQUNKLENBQUM7QUFDTixDQUFDO0FBbkRELGdDQW1EQztBQUFBLENBQUM7QUFFRixTQUFnQixVQUFVLENBQUMsSUFBZTtJQUN0QyxPQUFPO1FBQ0g7WUFDSSxLQUFLLEVBQUUsNkNBQTZDO1lBQ3BELEtBQUssQ0FBQyxLQUFLO2dCQUVQLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssU0FBUyxFQUFFO29CQUNoRCxPQUFPO2lCQUNWO2dCQUVELE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM1RCxDQUFDO1NBQ0o7S0FDSixDQUFDO0FBQ04sQ0FBQztBQWRELGdDQWNDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXNzZXRJbmZvIH0gZnJvbSBcIkBjb2Nvcy9jcmVhdG9yLXR5cGVzL2VkaXRvci9wYWNrYWdlcy9hc3NldC1kYi9AdHlwZXMvcHVibGljXCI7XHJcbmltcG9ydCB7IHJlYWRGaWxlU3luYyB9IGZyb20gXCJmc1wiO1xyXG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xyXG5pbXBvcnQgeyBEZWNvcmF0b3IsIFByb2plY3QsIFNjb3BlIH0gZnJvbSBcInRzLW1vcnBoXCI7XHJcbmltcG9ydCB7IHNob3J0TmFtZXMgfSBmcm9tIFwiLi4vc2hvcnQtbmFtZVwiO1xyXG5cclxuZnVuY3Rpb24gaXNTYW1lVHlwZSh0eXBlczogeyBuYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZyB9W10sIG5hbWU6IHN0cmluZykge1xyXG4gICAgLy8g5qOA5p+l5piv5ZCm5bey57uP5a2Y5Zyo5ZCM5ZCN6IqC54K5XHJcbiAgICBjb25zdCBleGlzdGluZ1R5cGUgPSB0eXBlcy5maW5kKHQgPT4gdC5uYW1lID09PSBuYW1lKTtcclxuICAgIGlmIChleGlzdGluZ1R5cGUpIHtcclxuICAgICAgICBFZGl0b3IuRGlhbG9nLmVycm9yKGDorablkYo6IOWPkeeOsOmHjeWkjeeahOiKgueCueWQjeensCBcIiR7bmFtZX1cImApO1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihg6K2m5ZGKOiDlj5HnjrDph43lpI3nmoToioLngrnlkI3np7AgXCIke25hbWV9XCJgKTtcclxuICAgIH1cclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gdHJhdmVyc2VQcmVmYWJOb2RlKG5vZGU6IGFueSwgcHJlZmFiOiBhbnksIHR5cGVzOiBhbnlbXSkge1xyXG5cclxuICAgIC8vIOmcgOimgeWFiOajgOa1i+i/meS4qm5vZGXmmK/lkKbmmK/pooTliLbkvZNcclxuICAgIC8vIOWmguaenOaYr+mihOWItuS9k++8jOWImemcgOimgemBjeWOhumihOWItuS9k1xyXG4gICAgY29uc3QgcHJlZmFiSWQgPSBub2RlLl9wcmVmYWIuX19pZF9fO1xyXG4gICAgY29uc3QgcHJlZmFiSW5mbyA9IHByZWZhYltwcmVmYWJJZF07XHJcbiAgICBjb25zdCBpc1ByZWZhYiA9IHByZWZhYkluZm8uYXNzZXQgJiYgcHJlZmFiSW5mby5hc3NldC5fX3V1aWRfXztcclxuICAgIGlmIChpc1ByZWZhYikge1xyXG4gICAgICAgIGNvbnN0IG5vZGVJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGlzUHJlZmFiKTtcclxuXHJcbiAgICAgICAgaWYgKG5vZGVJbmZvICYmIG5vZGVJbmZvLmZpbGUpIHtcclxuICAgICAgICAgICAgY29uc3QgcHJlZmFiQ29udGVudCA9IHJlYWRGaWxlU3luYyhub2RlSW5mbyEuZmlsZSwgJ3V0Zi04Jyk7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwcmVmYWIxID0gSlNPTi5wYXJzZShwcmVmYWJDb250ZW50KTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGFJZCA9IHByZWZhYjFbMF0gJiYgcHJlZmFiMVswXT8uZGF0YT8uX19pZF9fO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaXNOb2RlID0gcHJlZmFiMVtkYXRhSWRdICYmIHByZWZhYjFbZGF0YUlkXT8uX190eXBlX18gPT0gXCJjYy5Ob2RlXCI7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGlzTm9kZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRyYXZlcnNlUHJlZmFiTm9kZShwcmVmYWIxW2RhdGFJZF0sIHByZWZhYjEsIHR5cGVzKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBwYXJzZSBwcmVmYWIgY29udGVudDonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIOWmguaenOmBjeWOhuWujOS6hu+8jOeci+eci+mihOWItuS9k+eahOWxnuaAp+mHjei9vVxyXG4gICAgICAgIGNvbnN0IGluc3RhbmNlSUQgPSBwcmVmYWJJbmZvLmluc3RhbmNlICYmIHByZWZhYkluZm8uaW5zdGFuY2UuX19pZF9fO1xyXG4gICAgICAgIGNvbnN0IGluc3RhbmNlID0gcHJlZmFiW2luc3RhbmNlSURdO1xyXG5cclxuICAgICAgICBpZiAoaW5zdGFuY2UpIHtcclxuXHJcbiAgICAgICAgICAgIC8vIOmHjei9veWxnuaAp1xyXG4gICAgICAgICAgICBjb25zdCBwcm9wZXJ0eU92ZXJyaWRlcyA9IGluc3RhbmNlLnByb3BlcnR5T3ZlcnJpZGVzO1xyXG4gICAgICAgICAgICBpZiAocHJvcGVydHlPdmVycmlkZXMgJiYgQXJyYXkuaXNBcnJheShwcm9wZXJ0eU92ZXJyaWRlcykgJiYgcHJvcGVydHlPdmVycmlkZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwcm9wZXJ0eU92ZXJyaWRlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5T3ZlcnJpZGUgPSBwcm9wZXJ0eU92ZXJyaWRlc1tpXTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBvdmVycmlkZSA9IHByZWZhYltwcm9wZXJ0eU92ZXJyaWRlLl9faWRfX107XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChvdmVycmlkZSAmJiBvdmVycmlkZS5fX3R5cGVfXyA9PSBcIkNDUHJvcGVydHlPdmVycmlkZUluZm9cIikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9wZXJ0eVBhdGggPSBvdmVycmlkZS5wcm9wZXJ0eVBhdGggYXMgc3RyaW5nW107XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3ZlcnJpZGUudmFsdWU7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJvcGVydHlQYXRoICYmIHByb3BlcnR5UGF0aC5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpbmRleCA9IHByb3BlcnR5UGF0aC5maW5kSW5kZXgoZSA9PiBlID09IFwiX25hbWVcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggIT0gLTEpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuYW1lID0gdmFsdWU7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgbyBpbiBzaG9ydE5hbWVzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuYW1lLnN0YXJ0c1dpdGgoXCJfXCIgKyBvKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNTYW1lVHlwZSh0eXBlcywgbmFtZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZXMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogbmFtZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBzaG9ydE5hbWVzW29dXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyDmianlsZXoioLngrlcclxuICAgICAgICAgICAgY29uc3QgbW91bnRlZENoaWxkcmVuID0gaW5zdGFuY2UubW91bnRlZENoaWxkcmVuO1xyXG4gICAgICAgICAgICBpZiAobW91bnRlZENoaWxkcmVuICYmIEFycmF5LmlzQXJyYXkobW91bnRlZENoaWxkcmVuKSAmJiBtb3VudGVkQ2hpbGRyZW4ubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb3VudGVkQ2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjaGlsZCA9IG1vdW50ZWRDaGlsZHJlbltpXTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjaGlsZEluZm8gPSBwcmVmYWJbY2hpbGQuX19pZF9fXTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBub2RlcyA9IGNoaWxkSW5mby5ub2RlcztcclxuICAgICAgICAgICAgICAgICAgICBpZiAobm9kZXMgJiYgQXJyYXkuaXNBcnJheShub2RlcykgJiYgbm9kZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IG5vZGVzLmxlbmd0aDsgaisrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBub2RlID0gbm9kZXNbal07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBub2RlSW5mbyA9IHByZWZhYltub2RlLl9faWRfX107XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobm9kZUluZm8uX190eXBlX18gPT0gXCJjYy5Ob2RlXCIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0cmF2ZXJzZVByZWZhYk5vZGUobm9kZUluZm8sIHByZWZhYiwgdHlwZXMpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIW5vZGUuX25hbWUpIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgLy8g5aaC5p6c5piv6IqC54K577yM5YiZ6ZyA6KaB6YGN5Y6G6IqC54K5XHJcbiAgICBpZiAobm9kZS5fbmFtZS5zdGFydHNXaXRoKCdfJykpIHtcclxuICAgICAgICBjb25zdCBjb21wb25lbnRzID0gbm9kZS5fY29tcG9uZW50cztcclxuICAgICAgICBjb25zdCBuYW1lID0gbm9kZS5fbmFtZSA/PyBcIlwiO1xyXG4gICAgICAgIGxldCBmaW5kID0gZmFsc2U7XHJcblxyXG4gICAgICAgIC8vIOWmguaenOaYr+eUqOefreWQjeensOW8gOWktO+8jOWImeivtOaYjuaIkOWRmOWPmOmHj+imgeeUqOWvueW6lOeahOe7hOS7tuexu+Wei1xyXG4gICAgICAgIGZvciAoY29uc3QgbyBpbiBzaG9ydE5hbWVzKSB7XHJcbiAgICAgICAgICAgIGlmIChuYW1lLnN0YXJ0c1dpdGgoXCJfXCIgKyBvKSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgY29tcEluZm9JRCA9IGNvbXBvbmVudHMuZmluZCgoY29tcDogYW55KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcEluZm8gPSBwcmVmYWJbY29tcC5fX2lkX19dO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjb21wSW5mby5fX3R5cGVfXyA9PSBzaG9ydE5hbWVzW29dO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGNvbXBJbmZvSUQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wSW5mbyA9IHByZWZhYltjb21wSW5mb0lELl9faWRfX107XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBJbmZvKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzU2FtZVR5cGUodHlwZXMsIG5vZGUuX25hbWUpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZXMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLl9uYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogY29tcEluZm8uX190eXBlX19cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpbmQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCFmaW5kKSB7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgY29tcCBvZiBjb21wb25lbnRzKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjb21wSW5mbyA9IHByZWZhYltjb21wLl9faWRfX107XHJcblxyXG4gICAgICAgICAgICAgICAgLy8g6buY6K6k5LiN5Y+WVUlUcmFuc2Zvcm3lkoxXaWRnZXRcclxuICAgICAgICAgICAgICAgIGlmIChjb21wSW5mby5fX3R5cGVfXyAhPSBcImNjLlVJVHJhbnNmb3JtXCIgJiYgY29tcEluZm8uX190eXBlX18gIT0gXCJjYy5XaWRnZXRcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIGlzU2FtZVR5cGUodHlwZXMsIG5vZGUuX25hbWUpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICB0eXBlcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZS5fbmFtZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogY29tcEluZm8uX190eXBlX19cclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgLy8g5Y+q5Y+W56ys5LiA5LiqXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKG5vZGUuX2NoaWxkcmVuICYmIEFycmF5LmlzQXJyYXkobm9kZS5fY2hpbGRyZW4pICYmIG5vZGUuX2NoaWxkcmVuLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG5vZGUuX2NoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNoaWxkID0gbm9kZS5fY2hpbGRyZW5baV07XHJcblxyXG4gICAgICAgICAgICBjb25zdCBjaGlsZEluZm8gPSBwcmVmYWJbY2hpbGQuX19pZF9fXTtcclxuICAgICAgICAgICAgaWYgKGNoaWxkSW5mby5fX3R5cGVfXyA9PSBcImNjLk5vZGVcIikge1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgdHJhdmVyc2VQcmVmYWJOb2RlKGNoaWxkSW5mbywgcHJlZmFiLCB0eXBlcyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGZpbmROb2Rlc1dpdGhVbmRlcnNjb3JlUHJlZml4KGFzc2V0SW5mbzogQXNzZXRJbmZvICYgeyBwcmVmYWI6IHsgYXNzZXRVdWlkOiBzdHJpbmcgfSB9KSB7XHJcbiAgICB0cnkge1xyXG5cclxuICAgICAgICBjb25zdCB0eXBlczogeyBuYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZyB9W10gPSBbXTtcclxuICAgICAgICBjb25zdCBub2RlSW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBhc3NldEluZm8ucHJlZmFiLmFzc2V0VXVpZCk7XHJcblxyXG4gICAgICAgIGlmIChub2RlSW5mbyAmJiBub2RlSW5mby5maWxlKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHByZWZhYkNvbnRlbnQgPSByZWFkRmlsZVN5bmMobm9kZUluZm8hLmZpbGUsICd1dGYtOCcpO1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcHJlZmFiID0gSlNPTi5wYXJzZShwcmVmYWJDb250ZW50KTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBwcmVmYWIuZmluZCgoaXRlbTogYW55KSA9PiBpdGVtLl9uYW1lID09IGFzc2V0SW5mby5uYW1lICYmIGl0ZW0uX190eXBlX18gPT0gXCJjYy5Ob2RlXCIpO1xyXG4gICAgICAgICAgICAgICAgaWYgKG5vZGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0cmF2ZXJzZVByZWZhYk5vZGUobm9kZSwgcHJlZmFiLCB0eXBlcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHR5cGVzO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHBhcnNlIHByZWZhYiBjb250ZW50OicsIGVycm9yKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byB0cmF2ZXJzZSBub2RlczonLCBlcnJvcik7XHJcbiAgICB9XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRvck1lbWJlcnMoZmlsZVBhdGg6IHN0cmluZywgdHlwZXM6IHsgbmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcgfVtdKSB7XHJcbiAgICAvLyDliJvlu7rpobnnm65cclxuICAgIGNvbnN0IHByb2plY3QgPSBuZXcgUHJvamVjdCgpO1xyXG5cclxuICAgIC8vIOa3u+WKoOa6kOaWh+S7tlxyXG4gICAgY29uc3Qgc291cmNlRmlsZSA9IHByb2plY3QuYWRkU291cmNlRmlsZUF0UGF0aChmaWxlUGF0aCk7XHJcblxyXG4gICAgLy8g6I635Y+W5omA5pyJ57G75aOw5piOXHJcbiAgICBjb25zdCBjbGFzc2VzID0gc291cmNlRmlsZS5nZXRDbGFzc2VzKCk7XHJcblxyXG4gICAgLy8g6YGN5Y6G5q+P5Liq57G7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNsYXNzZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjb25zdCBjbGFzc0RlY2xhcmF0aW9uID0gY2xhc3Nlc1tpXTtcclxuXHJcbiAgICAgICAgLy8g6I635Y+W57G75ZCNXHJcbiAgICAgICAgY29uc3QgY2xhc3NOYW1lID0gY2xhc3NEZWNsYXJhdGlvbi5nZXROYW1lKCk7XHJcblxyXG4gICAgICAgIC8vIOWFiOa3u+WKoOaWsOeahOWxnuaAp1xyXG4gICAgICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCB0eXBlcy5sZW5ndGg7IGluZGV4KyspIHtcclxuICAgICAgICAgICAgY29uc3QgdHlwZURlZiA9IHR5cGVzW2luZGV4XTtcclxuICAgICAgICAgICAgaWYgKCFjbGFzc0RlY2xhcmF0aW9uLmdldFByb3BlcnR5KHR5cGVEZWYubmFtZSkpIHtcclxuICAgICAgICAgICAgICAgIC8vIOajgOafpeaYr+WQpuaYr+iHquWumuS5iee7hOS7tu+8iOmdnmNj5byA5aS077yJXHJcbiAgICAgICAgICAgICAgICBjb25zdCBpc0N1c3RvbUNvbXBvbmVudCA9ICF0eXBlRGVmLnR5cGUuc3RhcnRzV2l0aCgnY2MuJyk7XHJcbiAgICAgICAgICAgICAgICBsZXQgdHlwZU5hbWUgPSB0eXBlRGVmLnR5cGU7XHJcbiAgICAgICAgICAgICAgICBsZXQgbW9kdWxlUGF0aCA9ICdjYyc7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGlzQ3VzdG9tQ29tcG9uZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdXVpZCA9IEVkaXRvci5VdGlscy5VVUlELmRlY29tcHJlc3NVVUlEKHR5cGVEZWYudHlwZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIHV1aWQpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoYXNzZXRJbmZvICYmIGFzc2V0SW5mby5maWxlKSB7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDor7vlj5bnsbvmib7liLDlr7zlh7pcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VzdG9tQ29tcG9uZW50UHJvamVjdCA9IG5ldyBQcm9qZWN0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1c3RvbUNvbXBvbmVudEZpbGUgPSBjdXN0b21Db21wb25lbnRQcm9qZWN0LmFkZFNvdXJjZUZpbGVBdFBhdGgoYXNzZXRJbmZvLmZpbGUpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g6I635Y+W5paH5Lu25Lit5omA5pyJ5a+85Ye655qE57G7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4cG9ydGVkQ2xhc3NlcyA9IGN1c3RvbUNvbXBvbmVudEZpbGUuZ2V0Q2xhc3NlcygpLmZpbHRlcihjID0+IGMuaXNFeHBvcnRlZCgpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOacieWvvOWHuueahOexu++8jOS9v+eUqOesrOS4gOS4quexu+eahOWQjeensFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXhwb3J0ZWRDbGFzc2VzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVOYW1lID0gZXhwb3J0ZWRDbGFzc2VzWzBdLmdldE5hbWUoKSB8fCBhc3NldEluZm8ubmFtZTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlj6rkvb/nlKjmlofku7blkI3kvZzkuLrmqKHlnZfot6/lvoTvvIjkuI3lkKvmianlsZXlkI3vvIlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVEaXIgPSBwYXRoLmRpcm5hbWUoZmlsZVBhdGgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVsYXRpdmVQYXRoID0gcGF0aC5yZWxhdGl2ZShmaWxlRGlyLCBwYXRoLmRpcm5hbWUoYXNzZXRJbmZvLmZpbGUpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVOYW1lV2l0aG91dEV4dCA9IHBhdGguYmFzZW5hbWUoYXNzZXRJbmZvLmZpbGUsIHBhdGguZXh0bmFtZShhc3NldEluZm8uZmlsZSkpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOaehOW7uuWQiOmAgueahOWvvOWFpei3r+W+hFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlbGF0aXZlUGF0aCA9PT0gJycpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVQYXRoID0gYC4vJHtmaWxlTmFtZVdpdGhvdXRFeHR9YDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlUGF0aCA9IGAke3JlbGF0aXZlUGF0aC5yZXBsYWNlKC9cXFxcL2csICcvJyl9LyR7ZmlsZU5hbWVXaXRob3V0RXh0fWA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c6Lev5b6E5LiN5piv5LulLi/miJYuLi/lvIDlpLTvvIzmt7vliqAuL1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCEvXlxcLlxcLj9cXC8vLnRlc3QobW9kdWxlUGF0aCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVQYXRoID0gYC4vJHttb2R1bGVQYXRofWA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c5rKh5pyJ5om+5Yiw5a+85Ye655qE57G777yM5L2/55So5paH5Lu25ZCNXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYE5vIGV4cG9ydGVkIGNsYXNzIGZvdW5kIGluICR7YXNzZXRJbmZvLmZpbGV9LCB1c2luZyBhc3NldCBuYW1lIGluc3RlYWRgKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVOYW1lID0gYXNzZXRJbmZvLm5hbWU7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g6K6h566X55u45a+56Lev5b6E5ZCM5LiKXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWxlRGlyID0gcGF0aC5kaXJuYW1lKGZpbGVQYXRoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlbGF0aXZlUGF0aCA9IHBhdGgucmVsYXRpdmUoZmlsZURpciwgcGF0aC5kaXJuYW1lKGFzc2V0SW5mby5maWxlKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWxlTmFtZVdpdGhvdXRFeHQgPSBwYXRoLmJhc2VuYW1lKGFzc2V0SW5mby5maWxlLCBwYXRoLmV4dG5hbWUoYXNzZXRJbmZvLmZpbGUpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVsYXRpdmVQYXRoID09PSAnJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVBhdGggPSBgLi8ke2ZpbGVOYW1lV2l0aG91dEV4dH1gO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVQYXRoID0gYCR7cmVsYXRpdmVQYXRoLnJlcGxhY2UoL1xcXFwvZywgJy8nKX0vJHtmaWxlTmFtZVdpdGhvdXRFeHR9YDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIS9eXFwuXFwuP1xcLy8udGVzdChtb2R1bGVQYXRoKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVBhdGggPSBgLi8ke21vZHVsZVBhdGh9YDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gY2Pnu4Tku7blj6rpnIDopoHnu4Tku7blkI1cclxuICAgICAgICAgICAgICAgICAgICB0eXBlTmFtZSA9IHR5cGVEZWYudHlwZS5zcGxpdCgnLicpLnBvcCgpIHx8ICcnO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGNsYXNzRGVjbGFyYXRpb24uaW5zZXJ0UHJvcGVydHkoMCwge1xyXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IHR5cGVEZWYubmFtZSxcclxuICAgICAgICAgICAgICAgICAgICB0eXBlOiB0eXBlTmFtZSxcclxuICAgICAgICAgICAgICAgICAgICBpbml0aWFsaXplcjogXCJudWxsIVwiLFxyXG4gICAgICAgICAgICAgICAgICAgIGRlY29yYXRvcnM6IFt7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6ICdwcm9wZXJ0eScsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGFyZ3VtZW50czogW2B7dHlwZTogJHt0eXBlTmFtZX19YF1cclxuICAgICAgICAgICAgICAgICAgICB9XSxcclxuICAgICAgICAgICAgICAgICAgICBpc1JlYWRvbmx5OiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlOiBTY29wZS5Qcml2YXRlXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyDmt7vliqDlr7zlhaVcclxuICAgICAgICAgICAgICAgIGlmIChpc0N1c3RvbUNvbXBvbmVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIOa3u+WKoOiHquWumuS5iee7hOS7tueahOWvvOWFpVxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nSW1wb3J0ID0gc291cmNlRmlsZS5nZXRJbXBvcnREZWNsYXJhdGlvbihpID0+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGkuZ2V0TW9kdWxlU3BlY2lmaWVyVmFsdWUoKSA9PT0gbW9kdWxlUGF0aFxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ0ltcG9ydCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuYW1lZEltcG9ydHMgPSBleGlzdGluZ0ltcG9ydC5nZXROYW1lZEltcG9ydHMoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFuYW1lZEltcG9ydHMuc29tZShpbXAgPT4gaW1wLmdldE5hbWUoKSA9PT0gdHlwZU5hbWUpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ0ltcG9ydC5hZGROYW1lZEltcG9ydCh0eXBlTmFtZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzb3VyY2VGaWxlLmFkZEltcG9ydERlY2xhcmF0aW9uKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVkSW1wb3J0czogW3R5cGVOYW1lXSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVNwZWNpZmllcjogbW9kdWxlUGF0aFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIOa3u+WKoCBjYyDnu4Tku7blr7zlhaVcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjY0ltcG9ydCA9IHNvdXJjZUZpbGUuZ2V0SW1wb3J0RGVjbGFyYXRpb24oaSA9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpLmdldE1vZHVsZVNwZWNpZmllclZhbHVlKCkgPT09ICdjYydcclxuICAgICAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoY2NJbXBvcnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmFtZWRJbXBvcnRzID0gY2NJbXBvcnQuZ2V0TmFtZWRJbXBvcnRzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbmFtZWRJbXBvcnRzLnNvbWUoaW1wID0+IGltcC5nZXROYW1lKCkgPT09IHR5cGVOYW1lKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2NJbXBvcnQuYWRkTmFtZWRJbXBvcnQodHlwZU5hbWUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlRmlsZS5hZGRJbXBvcnREZWNsYXJhdGlvbih7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lZEltcG9ydHM6IFt0eXBlTmFtZV0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVTcGVjaWZpZXI6ICdjYydcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyDojrflj5bmiYDmnInnp4HmnInlsZ7mgKdcclxuICAgICAgICBjb25zdCBwcml2YXRlUHJvcHMgPSBjbGFzc0RlY2xhcmF0aW9uLmdldFByb3BlcnRpZXMoKS5maWx0ZXIocHJvcCA9PlxyXG4gICAgICAgICAgICBwcm9wLmdldE5hbWUoKS5zdGFydHNXaXRoKCdfJylcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICAvLyDlpITnkIbnjrDmnInlsZ7mgKdcclxuICAgICAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgcHJpdmF0ZVByb3BzLmxlbmd0aDsgaW5kZXgrKykge1xyXG4gICAgICAgICAgICBjb25zdCBwcm9wID0gcHJpdmF0ZVByb3BzW2luZGV4XTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IG5hbWUgPSBwcm9wLmdldE5hbWUoKTtcclxuICAgICAgICAgICAgY29uc3QgdHlwZSA9IHByb3AuZ2V0VHlwZSgpLmdldFRleHQoKTtcclxuICAgICAgICAgICAgY29uc3QgdHlwZURlZiA9IHR5cGVzLmZpbmQoaXRlbSA9PiBpdGVtLm5hbWUgPT09IG5hbWUpO1xyXG5cclxuICAgICAgICAgICAgaWYgKHR5cGVEZWYpIHtcclxuICAgICAgICAgICAgICAgIC8vIOabtOaWsOexu+Wei+WSjOijhemlsOWZqFxyXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVEZWYudHlwZSAhPT0gdHlwZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIOajgOafpeaYr+WQpuaYr+iHquWumuS5iee7hOS7tlxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzQ3VzdG9tQ29tcG9uZW50ID0gIXR5cGVEZWYudHlwZS5zdGFydHNXaXRoKCdjYy4nKTtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgdHlwZU5hbWUgPSB0eXBlRGVmLnR5cGU7XHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IG1vZHVsZVBhdGggPSAnY2MnO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoaXNDdXN0b21Db21wb25lbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdXVpZCA9IEVkaXRvci5VdGlscy5VVUlELmRlY29tcHJlc3NVVUlEKHR5cGVEZWYudHlwZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCB1dWlkKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhc3NldEluZm8gJiYgYXNzZXRJbmZvLmZpbGUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOivu+WPluexu+aJvuWIsOWvvOWHulxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VzdG9tQ29tcG9uZW50UHJvamVjdCA9IG5ldyBQcm9qZWN0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXN0b21Db21wb25lbnRGaWxlID0gY3VzdG9tQ29tcG9uZW50UHJvamVjdC5hZGRTb3VyY2VGaWxlQXRQYXRoKGFzc2V0SW5mby5maWxlKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDojrflj5bmlofku7bkuK3miYDmnInlr7zlh7rnmoTnsbtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4cG9ydGVkQ2xhc3NlcyA9IGN1c3RvbUNvbXBvbmVudEZpbGUuZ2V0Q2xhc3NlcygpLmZpbHRlcihjID0+IGMuaXNFeHBvcnRlZCgpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlpoLmnpzmnInlr7zlh7rnmoTnsbvvvIzkvb/nlKjnrKzkuIDkuKrnsbvnmoTlkI3np7BcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChleHBvcnRlZENsYXNzZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVOYW1lID0gZXhwb3J0ZWRDbGFzc2VzWzBdLmdldE5hbWUoKSB8fCBhc3NldEluZm8ubmFtZTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5Y+q5L2/55So5paH5Lu25ZCN5L2c5Li65qih5Z2X6Lev5b6E77yI5LiN5ZCr5omp5bGV5ZCN77yJXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlsZURpciA9IHBhdGguZGlybmFtZShmaWxlUGF0aCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVsYXRpdmVQYXRoID0gcGF0aC5yZWxhdGl2ZShmaWxlRGlyLCBwYXRoLmRpcm5hbWUoYXNzZXRJbmZvLmZpbGUpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWxlTmFtZVdpdGhvdXRFeHQgPSBwYXRoLmJhc2VuYW1lKGFzc2V0SW5mby5maWxlLCBwYXRoLmV4dG5hbWUoYXNzZXRJbmZvLmZpbGUpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5p6E5bu65ZCI6YCC55qE5a+85YWl6Lev5b6EXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlbGF0aXZlUGF0aCA9PT0gJycpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlUGF0aCA9IGAuLyR7ZmlsZU5hbWVXaXRob3V0RXh0fWA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlUGF0aCA9IGAke3JlbGF0aXZlUGF0aC5yZXBsYWNlKC9cXFxcL2csICcvJyl9LyR7ZmlsZU5hbWVXaXRob3V0RXh0fWA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlpoLmnpzot6/lvoTkuI3mmK/ku6UuL+aIli4uL+W8gOWktO+8jOa3u+WKoC4vXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCEvXlxcLlxcLj9cXC8vLnRlc3QobW9kdWxlUGF0aCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlUGF0aCA9IGAuLyR7bW9kdWxlUGF0aH1gO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c5rKh5pyJ5om+5Yiw5a+85Ye655qE57G777yM5L2/55So5paH5Lu25ZCNXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZU5hbWUgPSBhc3NldEluZm8ubmFtZTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g6K6h566X55u45a+56Lev5b6E5ZCM5LiKXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlsZURpciA9IHBhdGguZGlybmFtZShmaWxlUGF0aCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVsYXRpdmVQYXRoID0gcGF0aC5yZWxhdGl2ZShmaWxlRGlyLCBwYXRoLmRpcm5hbWUoYXNzZXRJbmZvLmZpbGUpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWxlTmFtZVdpdGhvdXRFeHQgPSBwYXRoLmJhc2VuYW1lKGFzc2V0SW5mby5maWxlLCBwYXRoLmV4dG5hbWUoYXNzZXRJbmZvLmZpbGUpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlbGF0aXZlUGF0aCA9PT0gJycpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlUGF0aCA9IGAuLyR7ZmlsZU5hbWVXaXRob3V0RXh0fWA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlUGF0aCA9IGAke3JlbGF0aXZlUGF0aC5yZXBsYWNlKC9cXFxcL2csICcvJyl9LyR7ZmlsZU5hbWVXaXRob3V0RXh0fWA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIS9eXFwuXFwuP1xcLy8udGVzdChtb2R1bGVQYXRoKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVQYXRoID0gYC4vJHttb2R1bGVQYXRofWA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gY2Pnu4Tku7blj6rpnIDopoHnu4Tku7blkI1cclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZU5hbWUgPSB0eXBlRGVmLnR5cGUuc3BsaXQoJy4nKS5wb3AoKSB8fCAnJztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRlY29yYXRvcnMgPSBwcm9wLmdldERlY29yYXRvcnMoKTtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvcjogRGVjb3JhdG9yIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIOafpeaJvueOsOacieeahCBwcm9wZXJ0eSDoo4XppbDlmahcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGRlY29yYXRvciBvZiBkZWNvcmF0b3JzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkZWNvcmF0b3IuZ2V0TmFtZSgpID09PSAncHJvcGVydHknKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yID0gZGVjb3JhdG9yO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIOabtOaWsOexu+Wei1xyXG4gICAgICAgICAgICAgICAgICAgIHByb3Auc2V0VHlwZSh0eXBlTmFtZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOiOt+WPlueOsOacieijhemlsOWZqOeahOWPguaVsOaWh+acrFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhcmdzID0gZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5nZXRBcmd1bWVudHMoKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWwneivleino+aekOeOsOacieWPguaVsFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYXJnVGV4dCA9IGFyZ3NbMF0uZ2V0VGV4dCgpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOaYr+WvueixoeW9ouW8j+eahOWPguaVsFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFyZ1RleHQuc3RhcnRzV2l0aCgneycpICYmIGFyZ1RleHQuZW5kc1dpdGgoJ30nKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOaPkOWPluWvueixoeWGheWuue+8jOenu+mZpOWJjeWQjueahOiKseaLrOWPt1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG9iamVjdENvbnRlbnRzID0gYXJnVGV4dC5zdWJzdHJpbmcoMSwgYXJnVGV4dC5sZW5ndGggLSAxKS50cmltKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOajgOafpeaYr+WQpuacieWFtuS7luWxnuaAp1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChvYmplY3RDb250ZW50cy5pbmNsdWRlcygnLCcpIHx8ICFvYmplY3RDb250ZW50cy5pbmNsdWRlcygndHlwZTonKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmnoTlu7rmlrDnmoTlr7nosaHlj4LmlbDvvIzljIXlkKvljp/mnInlsZ7mgKflkozmlrDnmoTnsbvlnotcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG5ld0FyZyA9ICd7JztcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWkhOeQhuW3suacieWxnuaAp1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9wZXJ0aWVzID0gb2JqZWN0Q29udGVudHMuc3BsaXQoJywnKS5tYXAocCA9PiBwLnRyaW0oKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHR5cGVJbmRleCA9IHByb3BlcnRpZXMuZmluZEluZGV4KHAgPT4gcC5zdGFydHNXaXRoKCd0eXBlOicpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlSW5kZXggPj0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5pu/5o2i57G75Z6L5bGe5oCnXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzW3R5cGVJbmRleF0gPSBgdHlwZTogJHt0eXBlTmFtZX1gO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5re75Yqg57G75Z6L5bGe5oCnXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzLnB1c2goYHR5cGU6ICR7dHlwZU5hbWV9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ld0FyZyArPSBwcm9wZXJ0aWVzLmpvaW4oJywgJykgKyAnfSc7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmm7TmlrDoo4XppbDlmahcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5yZW1vdmVBcmd1bWVudCgwKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5hZGRBcmd1bWVudChuZXdBcmcpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOS7heWMheWQq+exu+Wei+WumuS5ie+8jOabtOaWsOexu+Wei1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLnJlbW92ZUFyZ3VtZW50KDApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLmFkZEFyZ3VtZW50KGB7dHlwZTogJHt0eXBlTmFtZX19YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDpnZ7lr7nosaHlvaLlvI/lj4LmlbDvvIzmm7/mjaLkuLrmlrDlj4LmlbBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLnJlbW92ZUFyZ3VtZW50KDApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nUHJvcGVydHlEZWNvcmF0b3IuYWRkQXJndW1lbnQoYHt0eXBlOiAke3R5cGVOYW1lfX1gKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOayoeacieWPguaVsO+8jOa3u+WKoOWPguaVsFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5hZGRBcmd1bWVudChge3R5cGU6ICR7dHlwZU5hbWV9fWApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5rKh5pyJ5om+5YiwIHByb3BlcnR5IOijhemlsOWZqO+8jOa3u+WKoOaWsOijhemlsOWZqFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wLmFkZERlY29yYXRvcih7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiAncHJvcGVydHknLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXJndW1lbnRzOiBbYHt0eXBlOiAke3R5cGVOYW1lfX1gXVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmICghcHJvcC5nZXRJbml0aWFsaXplcigpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3Auc2V0SW5pdGlhbGl6ZXIoJ251bGwnKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIOa3u+WKoOWvvOWFpVxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChpc0N1c3RvbUNvbXBvbmVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDmt7vliqDoh6rlrprkuYnnu4Tku7bnmoTlr7zlhaVcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhpc3RpbmdJbXBvcnQgPSBzb3VyY2VGaWxlLmdldEltcG9ydERlY2xhcmF0aW9uKGkgPT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGkuZ2V0TW9kdWxlU3BlY2lmaWVyVmFsdWUoKSA9PT0gbW9kdWxlUGF0aFxyXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGV4aXN0aW5nSW1wb3J0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuYW1lZEltcG9ydHMgPSBleGlzdGluZ0ltcG9ydC5nZXROYW1lZEltcG9ydHMoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbmFtZWRJbXBvcnRzLnNvbWUoaW1wID0+IGltcC5nZXROYW1lKCkgPT09IHR5cGVOYW1lKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nSW1wb3J0LmFkZE5hbWVkSW1wb3J0KHR5cGVOYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZUZpbGUuYWRkSW1wb3J0RGVjbGFyYXRpb24oe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVkSW1wb3J0czogW3R5cGVOYW1lXSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVTcGVjaWZpZXI6IG1vZHVsZVBhdGhcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5re75YqgIGNjIOe7hOS7tuWvvOWFpVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjY0ltcG9ydCA9IHNvdXJjZUZpbGUuZ2V0SW1wb3J0RGVjbGFyYXRpb24oaSA9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaS5nZXRNb2R1bGVTcGVjaWZpZXJWYWx1ZSgpID09PSAnY2MnXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2NJbXBvcnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5hbWVkSW1wb3J0cyA9IGNjSW1wb3J0LmdldE5hbWVkSW1wb3J0cygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFuYW1lZEltcG9ydHMuc29tZShpbXAgPT4gaW1wLmdldE5hbWUoKSA9PT0gdHlwZU5hbWUpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2NJbXBvcnQuYWRkTmFtZWRJbXBvcnQodHlwZU5hbWUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlRmlsZS5hZGRJbXBvcnREZWNsYXJhdGlvbih7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZWRJbXBvcnRzOiBbdHlwZU5hbWVdLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVNwZWNpZmllcjogJ2NjJ1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyDlhYjnnIvnnIvmmK/kuI3mmK9wcm9wZXJ0eeijhemlsOWZqFxyXG4gICAgICAgICAgICAgICAgY29uc3QgZGVjb3JhdG9ycyA9IHByb3AuZ2V0RGVjb3JhdG9ycygpO1xyXG4gICAgICAgICAgICAgICAgbGV0IGV4aXN0aW5nUHJvcGVydHlEZWNvcmF0b3I6IERlY29yYXRvciB8IG51bGwgPSBudWxsO1xyXG5cclxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZGVjb3JhdG9yIG9mIGRlY29yYXRvcnMpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZGVjb3JhdG9yLmdldE5hbWUoKSA9PT0gJ3Byb3BlcnR5Jykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yID0gZGVjb3JhdG9yO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGV4aXN0aW5nUHJvcGVydHlEZWNvcmF0b3IpIHtcclxuICAgICAgICAgICAgICAgICAgICBwcm9wLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgLy8g5L+d5a2Y5L+u5pS5XHJcbiAgICBwcm9qZWN0LnNhdmVTeW5jKCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBvblJvb3RNZW51KGFzc2V0SW5mbzogQXNzZXRJbmZvICYgeyBjb21wb25lbnRzOiBhbnlbXSwgcHJlZmFiOiB7IGFzc2V0VXVpZDogc3RyaW5nIH0gfSkge1xyXG4gICAgcmV0dXJuIFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxhYmVsOiAnaTE4bjpnYW1lLWZyYW1ld29yay5oaWVyYXJjaHkubWVudS5yb290TWVudScsXHJcbiAgICAgICAgICAgIGFzeW5jIGNsaWNrKCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKCFhc3NldEluZm8pIHtcclxuICAgICAgICAgICAgICAgICAgICBFZGl0b3IuRGlhbG9nLmluZm8oJ2kxOG46Z2FtZS1mcmFtZXdvcmsuaGllcmFyY2h5LmVycm9yLm5vQXNzZXRJbmZvJyk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyDpgY3ljoboioLngrnmoJHmn6Xmib7luKbkuIvliJLnur/nmoToioLngrnlkozlsZ7mgKdcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0eXBlcyA9IGF3YWl0IGZpbmROb2Rlc1dpdGhVbmRlcnNjb3JlUHJlZml4KGFzc2V0SW5mbyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIOWkhOeQhue7hOS7tuS/oeaBr1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBhc3NldEluZm8uY29tcG9uZW50cztcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIWNvbXBvbmVudHMgfHwgY29tcG9uZW50cy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IGhhc0Jhc2VWaWV3ID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGNvbXBvbmVudHMubGVuZ3RoOyBpbmRleCsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IGNvbXBvbmVudHNbaW5kZXhdO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g6I635Y+W57uE5Lu26K+m57uG5L+h5oGvXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1jb21wb25lbnQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50LnZhbHVlICAvLyDov5nph4znmoQgdmFsdWUg5bCx5piv57uE5Lu255qEIFVVSURcclxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wb25lbnRJbmZvKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBiYXNlVmlldyA9IGNvbXBvbmVudEluZm8uZXh0ZW5kcz8uZmluZChpdGVtID0+IGl0ZW0gPT09IFwiQmFzZVZpZXdcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYmFzZVZpZXcpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBoYXNCYXNlVmlldyA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g6I635Y+W6LWE5rqQ5L+h5oGvXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdXVpZCA9IEVkaXRvci5VdGlscy5VVUlELmRlY29tcHJlc3NVVUlEKGNvbXBvbmVudEluZm8uY2lkISk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIHV1aWQpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXNzZXRJbmZvICYmIGFzc2V0SW5mby5maWxlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdlbmVyYXRvck1lbWJlcnMoYXNzZXRJbmZvLmZpbGUsIHR5cGVzID8/IFtdKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIEVkaXRvci5EaWFsb2cuaW5mbygn5p6E6YCg5oiQ5ZGY5Ye95pWw5oiQ5YqfJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoIWhhc0Jhc2VWaWV3KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIEVkaXRvci5EaWFsb2cuZXJyb3IoRWRpdG9yLkkxOG4udCgnZ2FtZS1mcmFtZXdvcmsuaGllcmFyY2h5LmVycm9yLm5vQmFzZVZpZXcnKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICBdO1xyXG59O1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG9uTm9kZU1lbnUobm9kZTogQXNzZXRJbmZvKSB7XHJcbiAgICByZXR1cm4gW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGFiZWw6ICdpMThuOmdhbWUtZnJhbWV3b3JrLmhpZXJhcmNoeS5tZW51Lm5vZGVNZW51JyxcclxuICAgICAgICAgICAgYXN5bmMgY2xpY2soKSB7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKCFub2RlIHx8ICFub2RlLnV1aWQgfHwgbm9kZS50eXBlICE9PSBcImNjLk5vZGVcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBFZGl0b3IuUGFuZWwub3BlbignZ2FtZS1mcmFtZXdvcmsuc2V0LW5hbWUnLCBub2RlLnV1aWQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuICAgIF07XHJcbn0iXX0=