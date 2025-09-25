"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onNodeMenu = exports.onRootMenu = void 0;
const console_1 = require("console");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const ts_morph_1 = require("ts-morph");
const short_name_1 = require("../short-name");
// tsconfig paths 解析缓存
let _tsconfigPathsCache = null;
/**
 * 加载 tsconfig.json 中的 paths 配置
 */
function loadTsconfigPaths() {
    if (_tsconfigPathsCache !== null) {
        return _tsconfigPathsCache;
    }
    _tsconfigPathsCache = [];
    const tsconfigPath = Editor.Project.tmpDir + "/tsconfig.cocos.json";
    try {
        // 读取 tsconfig.json
        const tsconfigContent = (0, fs_1.readFileSync)(tsconfigPath, 'utf-8');
        const tsconfig = JSON.parse(tsconfigContent);
        // 处理 extends 继承
        let compilerOptions = tsconfig.compilerOptions || {};
        if (tsconfig.extends) {
            const extendPath = path_1.default.isAbsolute(tsconfig.extends)
                ? tsconfig.extends
                : path_1.default.join(path_1.default.dirname(tsconfigPath), tsconfig.extends);
            try {
                const extendContent = (0, fs_1.readFileSync)(extendPath, 'utf-8');
                const extendConfig = JSON.parse(extendContent);
                compilerOptions = Object.assign(Object.assign({}, extendConfig.compilerOptions), compilerOptions);
            }
            catch (e) {
                console.warn(`无法加载继承的配置文件: ${extendPath}`);
            }
        }
        const paths = compilerOptions.paths;
        if (paths) {
            for (const [alias, pathArray] of Object.entries(paths)) {
                if (Array.isArray(pathArray) && pathArray.length > 0) {
                    // 取第一个路径映射，去掉末尾的 *
                    const basePath = pathArray[0].replace(/\*$/, '').replace(/\\/g, '/');
                    const aliasPrefix = alias.replace(/\*$/, '');
                    _tsconfigPathsCache.push({
                        alias: aliasPrefix,
                        basePath: basePath
                    });
                }
            }
        }
    }
    catch (e) {
        console.warn('加载 tsconfig paths 失败:', e);
    }
    return _tsconfigPathsCache;
}
/**
 * 尝试将绝对路径转换为 tsconfig paths 别名
 */
function tryResolvePathsAlias(targetFilePath) {
    const pathMappings = loadTsconfigPaths();
    const normalizedTarget = targetFilePath.replace(/\\/g, '/');
    for (const mapping of pathMappings) {
        // 排除 db://assets/* 的匹配，这个使用相对路径
        if (mapping.alias === 'db://assets/') {
            continue;
        }
        if (normalizedTarget.includes(mapping.basePath)) {
            const relativePart = normalizedTarget.substring(normalizedTarget.indexOf(mapping.basePath) + mapping.basePath.length);
            // const cleanRelativePart = relativePart.replace(/^\//, '').replace(/\.[^.]*$/, '');
            return `${mapping.alias}game-framework`;
        }
    }
    return null;
}
/**
 * 获取模块导入路径，优先使用 paths 别名，否则使用相对路径
 */
function getModuleSpecifier(fromFilePath, targetFilePath) {
    // 尝试使用 tsconfig paths 别名
    const aliasPath = tryResolvePathsAlias(targetFilePath);
    if (aliasPath) {
        return aliasPath;
    }
    // 回退到相对路径
    const fileDir = path_1.default.dirname(fromFilePath);
    const relativePath = path_1.default.relative(fileDir, path_1.default.dirname(targetFilePath));
    const fileNameWithoutExt = path_1.default.basename(targetFilePath, path_1.default.extname(targetFilePath));
    let modulePath;
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
    return modulePath;
}
function isSameType(types, name) {
    // 检查是否已经存在同名节点
    const existingType = types.find(t => t.name === name);
    if (existingType) {
        Editor.Dialog.error(`警告: 发现重复的节点名称 "${name}"`);
        throw new Error(`警告: 发现重复的节点名称 "${name}"`);
    }
}
/**
 * @param node 当前节点
 * @param prefab 预制体数据
 * @param types 收集的类型数组
 * @param types.name 成员变量名称
 * @param types.type 成员变量类型是组件的UUID
 */
async function traversePrefabNode(node, prefab, types, allComponents = []) {
    var _a, _b, _c, _d;
    // 需要先检测这个node是否是预制体
    // 如果是预制体，则需要遍历预制体
    const prefabId = node._prefab.__id__;
    const prefabInfo = prefab[prefabId];
    const isPrefab = prefabInfo.asset && prefabInfo.asset.__uuid__;
    // 检查是不是一个预制体放到了主预制体里面
    // 并且修改了名称
    // 或者是不是在一个节点预制体里面，有一些子节点预制体上挂载了 BaseView或者BaseViewComponent
    // 如果是这类情况，则不参与生产成员变量
    // 因为这种情况，成员变量需要放到 该节点 所在 BaseView 或者 BaseViewComponent 的脚本里面，而不是当前 BaseView 或者 BaseViewComponent 的脚本里面
    const check = function (class_uuid, node) {
        var _a;
        if (node._name.startsWith("_nod")) {
            types.push({
                name: node._name,
                type: "cc.Node"
            });
            return true;
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
                                isSameType(types, name);
                                types.push({
                                    name: name,
                                    type: class_uuid
                                });
                                return true;
                            }
                        }
                    }
                }
            }
        }
        const components = (_a = node._components) !== null && _a !== void 0 ? _a : [];
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
                return true;
            }
        }
        return false;
    };
    if (isPrefab) {
        const nodeInfo = await Editor.Message.request('asset-db', 'query-asset-info', isPrefab);
        if (nodeInfo && nodeInfo.file) {
            const prefabContent = (0, fs_1.readFileSync)(nodeInfo.file, 'utf-8');
            try {
                const prefab1 = JSON.parse(prefabContent);
                const dataId = prefab1[0] && ((_b = (_a = prefab1[0]) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.__id__);
                const isNode = prefab1[dataId] && ((_c = prefab1[dataId]) === null || _c === void 0 ? void 0 : _c.__type__) == "cc.Node";
                if (isNode) {
                    // 说明是BaseView或者BaseViewComponent
                    // 他们会在自己的类里面添加成员变量
                    const class_name = await hasChildOfBaseViewOrBaseViewComponent(prefab1[dataId], prefab1, allComponents);
                    if (class_name) {
                        check(class_name, prefab1[dataId]);
                        return;
                    }
                    await traversePrefabNode(prefab1[dataId], prefab1, types, allComponents);
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
                                // 说明是BaseView或者BaseViewComponent
                                // 他们会在自己的类里面添加成员变量
                                const class_name = await hasChildOfBaseViewOrBaseViewComponent(nodeInfo, prefab, allComponents);
                                if (class_name) {
                                    check(class_name, nodeInfo);
                                    continue;
                                }
                                await traversePrefabNode(nodeInfo, prefab, types, allComponents);
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
        if (node._name.startsWith("_nod")) {
            types.push({
                name: node._name,
                type: "cc.Node"
            });
            find = true;
        }
        if (!find) {
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
                    find = true;
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
                // 说明是BaseView或者BaseViewComponent
                // 他们会在自己的类里面添加成员变量
                const class_name = await hasChildOfBaseViewOrBaseViewComponent(childInfo, prefab, allComponents);
                if (class_name) {
                    check(class_name, childInfo);
                    continue;
                }
                await traversePrefabNode(childInfo, prefab, types, allComponents);
            }
        }
    }
}
async function hasChildOfBaseViewOrBaseViewComponent(node, prefab, allComponents) {
    if (!node)
        return "";
    const components = node._components;
    if (!components || components.length === 0) {
        return "";
    }
    for (let index = 0; index < components.length; index++) {
        const comp = components[index];
        const compInfo = prefab[comp.__id__];
        if (compInfo && (compInfo.__type__ === "BaseView" || compInfo.__type__ === "BaseViewComponent")) {
            return "";
        }
        // 如果是UUID，则需要处理
        if (Editor.Utils.UUID.isUUID(compInfo.__type__)) {
            const componentInfo = await Editor.Message.request('scene', 'query-component', Editor.Utils.UUID.decompressUUID(compInfo.__type__));
            if (!componentInfo) {
                const find = allComponents.find(e => e.cid == compInfo.__type__);
                if (!find)
                    continue;
                const hasAssetId = find && find.assetUuid;
                if (!hasAssetId)
                    continue;
                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', hasAssetId);
                if ((assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.file) && assetInfo.file.endsWith('.ts')) {
                    // 创建项目
                    const project = new ts_morph_1.Project();
                    // 添加源文件
                    const sourceFile = project.addSourceFileAtPath(assetInfo.file);
                    const classs = sourceFile.getClasses();
                    for (let i = 0; i < classs.length; i++) {
                        const classDeclaration = classs[i];
                        if (classDeclaration.getName() !== find.name) {
                            continue;
                        }
                        const extendsNode = classDeclaration.getExtends();
                        if (extendsNode) {
                            const extendName = extendsNode.getText();
                            // 创建一个新的检查
                            // 因为对于预制体来说，每一个预制体内部都是一个 BaseViewComponent或者 BaseView
                            // 里面的子节点名字都是一模一样
                            // 必须规避这个问题
                            // 在Runtime 下，该问题不会出现
                            if (extendName.startsWith("BaseView") || extendName.startsWith("BaseViewComponent")) {
                                return hasAssetId;
                            }
                        }
                    }
                }
            }
            if (componentInfo) {
                // 不应该走到这里来
                (0, console_1.error)("不应该走到这里来 componentInfo", componentInfo);
            }
        }
    }
    return "";
}
async function findNodesWithUnderscorePrefix(assetInfo) {
    try {
        const types = [];
        const allComponents = await Editor.Message.request('scene', 'query-components');
        const nodeInfo = await Editor.Message.request('asset-db', 'query-asset-info', assetInfo.prefab.assetUuid);
        if (nodeInfo && nodeInfo.file) {
            const prefabContent = (0, fs_1.readFileSync)(nodeInfo.file, 'utf-8');
            try {
                const prefab = JSON.parse(prefabContent);
                const node = prefab.find((item) => item._name == assetInfo.name && item.__type__ == "cc.Node");
                if (node) {
                    await traversePrefabNode(node, prefab, types, allComponents);
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
                            // 优先使用 tsconfig paths 别名，否则使用相对路径
                            modulePath = getModuleSpecifier(filePath, assetInfo.file);
                        }
                        else {
                            // 如果没有找到导出的类，使用文件名
                            console.warn(`No exported class found in ${assetInfo.file}, using asset name instead`);
                            typeName = assetInfo.name;
                            // 优先使用 tsconfig paths 别名，否则使用相对路径
                            modulePath = getModuleSpecifier(filePath, assetInfo.file);
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
                                // 优先使用 tsconfig paths 别名，否则使用相对路径
                                modulePath = getModuleSpecifier(filePath, assetInfo.file);
                            }
                            else {
                                // 如果没有找到导出的类，使用文件名
                                typeName = assetInfo.name;
                                // 优先使用 tsconfig paths 别名，否则使用相对路径
                                modulePath = getModuleSpecifier(filePath, assetInfo.file);
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
                    // 检查装饰器参数中是否包含 userData
                    const args = existingPropertyDecorator.getArguments();
                    let hasUserData = false;
                    if (args.length > 0) {
                        const argText = args[0].getText();
                        // 检查是否包含 userData 参数
                        if (argText.includes('userData')) {
                            hasUserData = true;
                        }
                    }
                    // 如果没有 userData 参数，才移除属性
                    if (!hasUserData) {
                        prop.remove();
                    }
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
                            const baseView = (_a = componentInfo.extends) === null || _a === void 0 ? void 0 : _a.find(item => item.startsWith("BaseView") || item.startsWith("BaseViewComponent"));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGllcmFyY2h5LW1lbnUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvaGllcmFyY2h5L2hpZXJhcmNoeS1tZW51LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUNBLHFDQUFnQztBQUNoQywyQkFBa0M7QUFDbEMsZ0RBQXdCO0FBQ3hCLHVDQUFxRDtBQUNyRCw4Q0FBMkM7QUFFM0Msc0JBQXNCO0FBQ3RCLElBQUksbUJBQW1CLEdBQWlELElBQUksQ0FBQztBQUU3RTs7R0FFRztBQUNILFNBQVMsaUJBQWlCO0lBQ3RCLElBQUksbUJBQW1CLEtBQUssSUFBSSxFQUFFO1FBQzlCLE9BQU8sbUJBQW1CLENBQUM7S0FDOUI7SUFFRCxtQkFBbUIsR0FBRyxFQUFFLENBQUM7SUFFekIsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsc0JBQXNCLENBQUM7SUFFcEUsSUFBSTtRQUNBLG1CQUFtQjtRQUNuQixNQUFNLGVBQWUsR0FBRyxJQUFBLGlCQUFZLEVBQUMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzVELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUM7UUFFN0MsZ0JBQWdCO1FBQ2hCLElBQUksZUFBZSxHQUFHLFFBQVEsQ0FBQyxlQUFlLElBQUksRUFBRSxDQUFDO1FBQ3JELElBQUksUUFBUSxDQUFDLE9BQU8sRUFBRTtZQUNsQixNQUFNLFVBQVUsR0FBRyxjQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUM7Z0JBQ2hELENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTztnQkFDbEIsQ0FBQyxDQUFDLGNBQUksQ0FBQyxJQUFJLENBQUMsY0FBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsRUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7WUFFOUQsSUFBSTtnQkFDQSxNQUFNLGFBQWEsR0FBRyxJQUFBLGlCQUFZ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QUMsSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssU0FBUyxFQUFFO29CQUNoRCxPQUFPO2lCQUNWO2dCQUVELE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM1RCxDQUFDO1NBQ0o7S0FDSixDQUFDO0FBQ04sQ0FBQztBQWRELGdDQWNDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXNzZXRJbmZvIH0gZnJvbSBcIkBjb2Nvcy9jcmVhdG9yLXR5cGVzL2VkaXRvci9wYWNrYWdlcy9hc3NldC1kYi9AdHlwZXMvcHVibGljXCI7XG5pbXBvcnQgeyBlcnJvciB9IGZyb20gXCJjb25zb2xlXCI7XG5pbXBvcnQgeyByZWFkRmlsZVN5bmMgfSBmcm9tIFwiZnNcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgeyBEZWNvcmF0b3IsIFByb2plY3QsIFNjb3BlIH0gZnJvbSBcInRzLW1vcnBoXCI7XG5pbXBvcnQgeyBzaG9ydE5hbWVzIH0gZnJvbSBcIi4uL3Nob3J0LW5hbWVcIjtcblxuLy8gdHNjb25maWcgcGF0aHMg6Kej5p6Q57yT5a2YXG5sZXQgX3RzY29uZmlnUGF0aHNDYWNoZTogeyBhbGlhczogc3RyaW5nOyBiYXNlUGF0aDogc3RyaW5nIH1bXSB8IG51bGwgPSBudWxsO1xuXG4vKipcbiAqIOWKoOi9vSB0c2NvbmZpZy5qc29uIOS4reeahCBwYXRocyDphY3nva5cbiAqL1xuZnVuY3Rpb24gbG9hZFRzY29uZmlnUGF0aHMoKTogeyBhbGlhczogc3RyaW5nOyBiYXNlUGF0aDogc3RyaW5nIH1bXSB7XG4gICAgaWYgKF90c2NvbmZpZ1BhdGhzQ2FjaGUgIT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIF90c2NvbmZpZ1BhdGhzQ2FjaGU7XG4gICAgfVxuXG4gICAgX3RzY29uZmlnUGF0aHNDYWNoZSA9IFtdO1xuXG4gICAgY29uc3QgdHNjb25maWdQYXRoID0gRWRpdG9yLlByb2plY3QudG1wRGlyICsgXCIvdHNjb25maWcuY29jb3MuanNvblwiO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgLy8g6K+75Y+WIHRzY29uZmlnLmpzb25cbiAgICAgICAgY29uc3QgdHNjb25maWdDb250ZW50ID0gcmVhZEZpbGVTeW5jKHRzY29uZmlnUGF0aCwgJ3V0Zi04Jyk7XG4gICAgICAgIGNvbnN0IHRzY29uZmlnID0gSlNPTi5wYXJzZSh0c2NvbmZpZ0NvbnRlbnQpO1xuXG4gICAgICAgIC8vIOWkhOeQhiBleHRlbmRzIOe7p+aJv1xuICAgICAgICBsZXQgY29tcGlsZXJPcHRpb25zID0gdHNjb25maWcuY29tcGlsZXJPcHRpb25zIHx8IHt9O1xuICAgICAgICBpZiAodHNjb25maWcuZXh0ZW5kcykge1xuICAgICAgICAgICAgY29uc3QgZXh0ZW5kUGF0aCA9IHBhdGguaXNBYnNvbHV0ZSh0c2NvbmZpZy5leHRlbmRzKVxuICAgICAgICAgICAgICAgID8gdHNjb25maWcuZXh0ZW5kc1xuICAgICAgICAgICAgICAgIDogcGF0aC5qb2luKHBhdGguZGlybmFtZSh0c2NvbmZpZ1BhdGgpLCB0c2NvbmZpZy5leHRlbmRzKTtcblxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBleHRlbmRDb250ZW50ID0gcmVhZEZpbGVTeW5jKGV4dGVuZFBhdGgsICd1dGYtOCcpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGV4dGVuZENvbmZpZyA9IEpTT04ucGFyc2UoZXh0ZW5kQ29udGVudCk7XG4gICAgICAgICAgICAgICAgY29tcGlsZXJPcHRpb25zID0ge1xuICAgICAgICAgICAgICAgICAgICAuLi5leHRlbmRDb25maWcuY29tcGlsZXJPcHRpb25zLFxuICAgICAgICAgICAgICAgICAgICAuLi5jb21waWxlck9wdGlvbnNcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2Fybihg5peg5rOV5Yqg6L2957un5om/55qE6YWN572u5paH5Lu2OiAke2V4dGVuZFBhdGh9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwYXRocyA9IGNvbXBpbGVyT3B0aW9ucy5wYXRocztcbiAgICAgICAgaWYgKHBhdGhzKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFthbGlhcywgcGF0aEFycmF5XSBvZiBPYmplY3QuZW50cmllcyhwYXRocykpIHtcbiAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShwYXRoQXJyYXkpICYmIHBhdGhBcnJheS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOWPluesrOS4gOS4qui3r+W+hOaYoOWwhO+8jOWOu+aOieacq+WwvueahCAqXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhc2VQYXRoID0gcGF0aEFycmF5WzBdLnJlcGxhY2UoL1xcKiQvLCAnJykucmVwbGFjZSgvXFxcXC9nLCAnLycpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhbGlhc1ByZWZpeCA9IGFsaWFzLnJlcGxhY2UoL1xcKiQvLCAnJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgX3RzY29uZmlnUGF0aHNDYWNoZS5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFsaWFzOiBhbGlhc1ByZWZpeCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhc2VQYXRoOiBiYXNlUGF0aFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUud2Fybign5Yqg6L29IHRzY29uZmlnIHBhdGhzIOWksei0pTonLCBlKTtcbiAgICB9XG5cbiAgICByZXR1cm4gX3RzY29uZmlnUGF0aHNDYWNoZTtcbn1cblxuLyoqXG4gKiDlsJ3or5XlsIbnu53lr7not6/lvoTovazmjaLkuLogdHNjb25maWcgcGF0aHMg5Yir5ZCNXG4gKi9cbmZ1bmN0aW9uIHRyeVJlc29sdmVQYXRoc0FsaWFzKHRhcmdldEZpbGVQYXRoOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgICBjb25zdCBwYXRoTWFwcGluZ3MgPSBsb2FkVHNjb25maWdQYXRocygpO1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRUYXJnZXQgPSB0YXJnZXRGaWxlUGF0aC5yZXBsYWNlKC9cXFxcL2csICcvJyk7XG5cbiAgICBmb3IgKGNvbnN0IG1hcHBpbmcgb2YgcGF0aE1hcHBpbmdzKSB7XG4gICAgICAgIC8vIOaOkumZpCBkYjovL2Fzc2V0cy8qIOeahOWMuemFje+8jOi/meS4quS9v+eUqOebuOWvuei3r+W+hFxuICAgICAgICBpZiAobWFwcGluZy5hbGlhcyA9PT0gJ2RiOi8vYXNzZXRzLycpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG5vcm1hbGl6ZWRUYXJnZXQuaW5jbHVkZXMobWFwcGluZy5iYXNlUGF0aCkpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlbGF0aXZlUGFydCA9IG5vcm1hbGl6ZWRUYXJnZXQuc3Vic3RyaW5nKFxuICAgICAgICAgICAgICAgIG5vcm1hbGl6ZWRUYXJnZXQuaW5kZXhPZihtYXBwaW5nLmJhc2VQYXRoKSArIG1hcHBpbmcuYmFzZVBhdGgubGVuZ3RoXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgLy8gY29uc3QgY2xlYW5SZWxhdGl2ZVBhcnQgPSByZWxhdGl2ZVBhcnQucmVwbGFjZSgvXlxcLy8sICcnKS5yZXBsYWNlKC9cXC5bXi5dKiQvLCAnJyk7XG4gICAgICAgICAgICByZXR1cm4gYCR7bWFwcGluZy5hbGlhc31nYW1lLWZyYW1ld29ya2A7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuLyoqXG4gKiDojrflj5bmqKHlnZflr7zlhaXot6/lvoTvvIzkvJjlhYjkvb/nlKggcGF0aHMg5Yir5ZCN77yM5ZCm5YiZ5L2/55So55u45a+56Lev5b6EXG4gKi9cbmZ1bmN0aW9uIGdldE1vZHVsZVNwZWNpZmllcihmcm9tRmlsZVBhdGg6IHN0cmluZywgdGFyZ2V0RmlsZVBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgLy8g5bCd6K+V5L2/55SoIHRzY29uZmlnIHBhdGhzIOWIq+WQjVxuICAgIGNvbnN0IGFsaWFzUGF0aCA9IHRyeVJlc29sdmVQYXRoc0FsaWFzKHRhcmdldEZpbGVQYXRoKTtcbiAgICBpZiAoYWxpYXNQYXRoKSB7XG4gICAgICAgIHJldHVybiBhbGlhc1BhdGg7XG4gICAgfVxuXG4gICAgLy8g5Zue6YCA5Yiw55u45a+56Lev5b6EXG4gICAgY29uc3QgZmlsZURpciA9IHBhdGguZGlybmFtZShmcm9tRmlsZVBhdGgpO1xuICAgIGNvbnN0IHJlbGF0aXZlUGF0aCA9IHBhdGgucmVsYXRpdmUoZmlsZURpciwgcGF0aC5kaXJuYW1lKHRhcmdldEZpbGVQYXRoKSk7XG4gICAgY29uc3QgZmlsZU5hbWVXaXRob3V0RXh0ID0gcGF0aC5iYXNlbmFtZSh0YXJnZXRGaWxlUGF0aCwgcGF0aC5leHRuYW1lKHRhcmdldEZpbGVQYXRoKSk7XG5cbiAgICBsZXQgbW9kdWxlUGF0aDogc3RyaW5nO1xuICAgIGlmIChyZWxhdGl2ZVBhdGggPT09ICcnKSB7XG4gICAgICAgIG1vZHVsZVBhdGggPSBgLi8ke2ZpbGVOYW1lV2l0aG91dEV4dH1gO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIG1vZHVsZVBhdGggPSBgJHtyZWxhdGl2ZVBhdGgucmVwbGFjZSgvXFxcXC9nLCAnLycpfS8ke2ZpbGVOYW1lV2l0aG91dEV4dH1gO1xuICAgIH1cblxuICAgIC8vIOWmguaenOi3r+W+hOS4jeaYr+S7pS4v5oiWLi4v5byA5aS077yM5re75YqgLi9cbiAgICBpZiAoIS9eXFwuXFwuP1xcLy8udGVzdChtb2R1bGVQYXRoKSkge1xuICAgICAgICBtb2R1bGVQYXRoID0gYC4vJHttb2R1bGVQYXRofWA7XG4gICAgfVxuXG4gICAgcmV0dXJuIG1vZHVsZVBhdGg7XG59XG5cbmZ1bmN0aW9uIGlzU2FtZVR5cGUodHlwZXM6IHsgbmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcgfVtdLCBuYW1lOiBzdHJpbmcpIHtcbiAgICAvLyDmo4Dmn6XmmK/lkKblt7Lnu4/lrZjlnKjlkIzlkI3oioLngrlcbiAgICBjb25zdCBleGlzdGluZ1R5cGUgPSB0eXBlcy5maW5kKHQgPT4gdC5uYW1lID09PSBuYW1lKTtcbiAgICBpZiAoZXhpc3RpbmdUeXBlKSB7XG4gICAgICAgIEVkaXRvci5EaWFsb2cuZXJyb3IoYOitpuWRijog5Y+R546w6YeN5aSN55qE6IqC54K55ZCN56ewIFwiJHtuYW1lfVwiYCk7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihg6K2m5ZGKOiDlj5HnjrDph43lpI3nmoToioLngrnlkI3np7AgXCIke25hbWV9XCJgKTtcbiAgICB9XG59XG5cbi8qKlxuICogQHBhcmFtIG5vZGUg5b2T5YmN6IqC54K5XG4gKiBAcGFyYW0gcHJlZmFiIOmihOWItuS9k+aVsOaNrlxuICogQHBhcmFtIHR5cGVzIOaUtumbhueahOexu+Wei+aVsOe7hFxuICogQHBhcmFtIHR5cGVzLm5hbWUg5oiQ5ZGY5Y+Y6YeP5ZCN56ewXG4gKiBAcGFyYW0gdHlwZXMudHlwZSDmiJDlkZjlj5jph4/nsbvlnovmmK/nu4Tku7bnmoRVVUlEXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHRyYXZlcnNlUHJlZmFiTm9kZShub2RlOiBhbnksIHByZWZhYjogYW55LCB0eXBlczogeyBuYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZyB9W10sIGFsbENvbXBvbmVudHM6IGFueVtdID0gW10pIHtcblxuICAgIC8vIOmcgOimgeWFiOajgOa1i+i/meS4qm5vZGXmmK/lkKbmmK/pooTliLbkvZNcbiAgICAvLyDlpoLmnpzmmK/pooTliLbkvZPvvIzliJnpnIDopoHpgY3ljobpooTliLbkvZNcbiAgICBjb25zdCBwcmVmYWJJZCA9IG5vZGUuX3ByZWZhYi5fX2lkX187XG4gICAgY29uc3QgcHJlZmFiSW5mbyA9IHByZWZhYltwcmVmYWJJZF07XG4gICAgY29uc3QgaXNQcmVmYWIgPSBwcmVmYWJJbmZvLmFzc2V0ICYmIHByZWZhYkluZm8uYXNzZXQuX191dWlkX187XG5cbiAgICAvLyDmo4Dmn6XmmK/kuI3mmK/kuIDkuKrpooTliLbkvZPmlL7liLDkuobkuLvpooTliLbkvZPph4zpnaJcbiAgICAvLyDlubbkuJTkv67mlLnkuoblkI3np7BcbiAgICAvLyDmiJbogIXmmK/kuI3mmK/lnKjkuIDkuKroioLngrnpooTliLbkvZPph4zpnaLvvIzmnInkuIDkupvlrZDoioLngrnpooTliLbkvZPkuIrmjILovb3kuoYgQmFzZVZpZXfmiJbogIVCYXNlVmlld0NvbXBvbmVudFxuICAgIC8vIOWmguaenOaYr+i/meexu+aDheWGte+8jOWImeS4jeWPguS4jueUn+S6p+aIkOWRmOWPmOmHj1xuICAgIC8vIOWboOS4uui/meenjeaDheWGte+8jOaIkOWRmOWPmOmHj+mcgOimgeaUvuWIsCDor6XoioLngrkg5omA5ZyoIEJhc2VWaWV3IOaIluiAhSBCYXNlVmlld0NvbXBvbmVudCDnmoTohJrmnKzph4zpnaLvvIzogIzkuI3mmK/lvZPliY0gQmFzZVZpZXcg5oiW6ICFIEJhc2VWaWV3Q29tcG9uZW50IOeahOiEmuacrOmHjOmdolxuICAgIGNvbnN0IGNoZWNrID0gZnVuY3Rpb24gKGNsYXNzX3V1aWQ6IHN0cmluZywgbm9kZTogYW55KTogYm9vbGVhbiB7XG4gICAgICAgIGlmIChub2RlLl9uYW1lLnN0YXJ0c1dpdGgoXCJfbm9kXCIpKSB7XG4gICAgICAgICAgICB0eXBlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICBuYW1lOiBub2RlLl9uYW1lLFxuICAgICAgICAgICAgICAgIHR5cGU6IFwiY2MuTm9kZVwiXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyDlpoLmnpzpgY3ljoblrozkuobvvIznnIvnnIvpooTliLbkvZPnmoTlsZ7mgKfph43ovb1cbiAgICAgICAgY29uc3QgaW5zdGFuY2VJRCA9IHByZWZhYkluZm8uaW5zdGFuY2UgJiYgcHJlZmFiSW5mby5pbnN0YW5jZS5fX2lkX187XG4gICAgICAgIGNvbnN0IGluc3RhbmNlID0gcHJlZmFiW2luc3RhbmNlSURdO1xuXG4gICAgICAgIGlmIChpbnN0YW5jZSkge1xuICAgICAgICAgICAgLy8g6YeN6L295bGe5oCnXG4gICAgICAgICAgICBjb25zdCBwcm9wZXJ0eU92ZXJyaWRlcyA9IGluc3RhbmNlLnByb3BlcnR5T3ZlcnJpZGVzO1xuICAgICAgICAgICAgaWYgKHByb3BlcnR5T3ZlcnJpZGVzICYmIEFycmF5LmlzQXJyYXkocHJvcGVydHlPdmVycmlkZXMpICYmIHByb3BlcnR5T3ZlcnJpZGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHByb3BlcnR5T3ZlcnJpZGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5T3ZlcnJpZGUgPSBwcm9wZXJ0eU92ZXJyaWRlc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgb3ZlcnJpZGUgPSBwcmVmYWJbcHJvcGVydHlPdmVycmlkZS5fX2lkX19dO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChvdmVycmlkZSAmJiBvdmVycmlkZS5fX3R5cGVfXyA9PSBcIkNDUHJvcGVydHlPdmVycmlkZUluZm9cIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvcGVydHlQYXRoID0gb3ZlcnJpZGUucHJvcGVydHlQYXRoIGFzIHN0cmluZ1tdO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBvdmVycmlkZS52YWx1ZTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByb3BlcnR5UGF0aCAmJiBwcm9wZXJ0eVBhdGgubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGluZGV4ID0gcHJvcGVydHlQYXRoLmZpbmRJbmRleChlID0+IGUgPT0gXCJfbmFtZVwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggIT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmFtZSA9IHZhbHVlO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzU2FtZVR5cGUodHlwZXMsIG5hbWUpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IGNsYXNzX3V1aWRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29tcG9uZW50cyA9IG5vZGUuX2NvbXBvbmVudHMgPz8gW107XG4gICAgICAgIGZvciAoY29uc3QgY29tcCBvZiBjb21wb25lbnRzKSB7XG4gICAgICAgICAgICBjb25zdCBjb21wSW5mbyA9IHByZWZhYltjb21wLl9faWRfX107XG5cbiAgICAgICAgICAgIC8vIOm7mOiupOS4jeWPllVJVHJhbnNmb3Jt5ZKMV2lkZ2V0XG4gICAgICAgICAgICBpZiAoY29tcEluZm8uX190eXBlX18gIT0gXCJjYy5VSVRyYW5zZm9ybVwiICYmIGNvbXBJbmZvLl9fdHlwZV9fICE9IFwiY2MuV2lkZ2V0XCIpIHtcbiAgICAgICAgICAgICAgICBpc1NhbWVUeXBlKHR5cGVzLCBub2RlLl9uYW1lKTtcblxuICAgICAgICAgICAgICAgIHR5cGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLl9uYW1lLFxuICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb21wSW5mby5fX3R5cGVfX1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgLy8g5Y+q5Y+W56ys5LiA5LiqXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKGlzUHJlZmFiKSB7XG4gICAgICAgIGNvbnN0IG5vZGVJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGlzUHJlZmFiKTtcblxuICAgICAgICBpZiAobm9kZUluZm8gJiYgbm9kZUluZm8uZmlsZSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZmFiQ29udGVudCA9IHJlYWRGaWxlU3luYyhub2RlSW5mbyEuZmlsZSwgJ3V0Zi04Jyk7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHByZWZhYjEgPSBKU09OLnBhcnNlKHByZWZhYkNvbnRlbnQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGFJZCA9IHByZWZhYjFbMF0gJiYgcHJlZmFiMVswXT8uZGF0YT8uX19pZF9fO1xuICAgICAgICAgICAgICAgIGNvbnN0IGlzTm9kZSA9IHByZWZhYjFbZGF0YUlkXSAmJiBwcmVmYWIxW2RhdGFJZF0/Ll9fdHlwZV9fID09IFwiY2MuTm9kZVwiO1xuXG4gICAgICAgICAgICAgICAgaWYgKGlzTm9kZSkge1xuICAgICAgICAgICAgICAgICAgICAvLyDor7TmmI7mmK9CYXNlVmlld+aIluiAhUJhc2VWaWV3Q29tcG9uZW50XG4gICAgICAgICAgICAgICAgICAgIC8vIOS7luS7rOS8muWcqOiHquW3seeahOexu+mHjOmdoua3u+WKoOaIkOWRmOWPmOmHj1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNsYXNzX25hbWUgPSBhd2FpdCBoYXNDaGlsZE9mQmFzZVZpZXdPckJhc2VWaWV3Q29tcG9uZW50KHByZWZhYjFbZGF0YUlkXSwgcHJlZmFiMSwgYWxsQ29tcG9uZW50cyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjbGFzc19uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjaGVjayhjbGFzc19uYW1lLCBwcmVmYWIxW2RhdGFJZF0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdHJhdmVyc2VQcmVmYWJOb2RlKHByZWZhYjFbZGF0YUlkXSwgcHJlZmFiMSwgdHlwZXMsIGFsbENvbXBvbmVudHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHBhcnNlIHByZWZhYiBjb250ZW50OicsIGVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOWmguaenOmBjeWOhuWujOS6hu+8jOeci+eci+mihOWItuS9k+eahOWxnuaAp+mHjei9vVxuICAgICAgICBjb25zdCBpbnN0YW5jZUlEID0gcHJlZmFiSW5mby5pbnN0YW5jZSAmJiBwcmVmYWJJbmZvLmluc3RhbmNlLl9faWRfXztcbiAgICAgICAgY29uc3QgaW5zdGFuY2UgPSBwcmVmYWJbaW5zdGFuY2VJRF07XG5cbiAgICAgICAgaWYgKGluc3RhbmNlKSB7XG5cbiAgICAgICAgICAgIC8vIOmHjei9veWxnuaAp1xuICAgICAgICAgICAgY29uc3QgcHJvcGVydHlPdmVycmlkZXMgPSBpbnN0YW5jZS5wcm9wZXJ0eU92ZXJyaWRlcztcbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eU92ZXJyaWRlcyAmJiBBcnJheS5pc0FycmF5KHByb3BlcnR5T3ZlcnJpZGVzKSAmJiBwcm9wZXJ0eU92ZXJyaWRlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwcm9wZXJ0eU92ZXJyaWRlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9wZXJ0eU92ZXJyaWRlID0gcHJvcGVydHlPdmVycmlkZXNbaV07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG92ZXJyaWRlID0gcHJlZmFiW3Byb3BlcnR5T3ZlcnJpZGUuX19pZF9fXTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAob3ZlcnJpZGUgJiYgb3ZlcnJpZGUuX190eXBlX18gPT0gXCJDQ1Byb3BlcnR5T3ZlcnJpZGVJbmZvXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5UGF0aCA9IG92ZXJyaWRlLnByb3BlcnR5UGF0aCBhcyBzdHJpbmdbXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3ZlcnJpZGUudmFsdWU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eVBhdGggJiYgcHJvcGVydHlQYXRoLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpbmRleCA9IHByb3BlcnR5UGF0aC5maW5kSW5kZXgoZSA9PiBlID09IFwiX25hbWVcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4ICE9IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5hbWUgPSB2YWx1ZTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IG8gaW4gc2hvcnROYW1lcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG5hbWUuc3RhcnRzV2l0aChcIl9cIiArIG8pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNTYW1lVHlwZSh0eXBlcywgbmFtZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogc2hvcnROYW1lc1tvXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyDmianlsZXoioLngrlcbiAgICAgICAgICAgIGNvbnN0IG1vdW50ZWRDaGlsZHJlbiA9IGluc3RhbmNlLm1vdW50ZWRDaGlsZHJlbjtcbiAgICAgICAgICAgIGlmIChtb3VudGVkQ2hpbGRyZW4gJiYgQXJyYXkuaXNBcnJheShtb3VudGVkQ2hpbGRyZW4pICYmIG1vdW50ZWRDaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb3VudGVkQ2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2hpbGQgPSBtb3VudGVkQ2hpbGRyZW5baV07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNoaWxkSW5mbyA9IHByZWZhYltjaGlsZC5fX2lkX19dO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBub2RlcyA9IGNoaWxkSW5mby5ub2RlcztcbiAgICAgICAgICAgICAgICAgICAgaWYgKG5vZGVzICYmIEFycmF5LmlzQXJyYXkobm9kZXMpICYmIG5vZGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgbm9kZXMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBub2RlID0gbm9kZXNbal07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgbm9kZUluZm8gPSBwcmVmYWJbbm9kZS5fX2lkX19dO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChub2RlSW5mby5fX3R5cGVfXyA9PSBcImNjLk5vZGVcIikge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOivtOaYjuaYr0Jhc2VWaWV35oiW6ICFQmFzZVZpZXdDb21wb25lbnRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5LuW5Lus5Lya5Zyo6Ieq5bex55qE57G76YeM6Z2i5re75Yqg5oiQ5ZGY5Y+Y6YePXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNsYXNzX25hbWUgPSBhd2FpdCBoYXNDaGlsZE9mQmFzZVZpZXdPckJhc2VWaWV3Q29tcG9uZW50KG5vZGVJbmZvLCBwcmVmYWIsIGFsbENvbXBvbmVudHMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2xhc3NfbmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2hlY2soY2xhc3NfbmFtZSwgbm9kZUluZm8pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0cmF2ZXJzZVByZWZhYk5vZGUobm9kZUluZm8sIHByZWZhYiwgdHlwZXMsIGFsbENvbXBvbmVudHMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCFub2RlLl9uYW1lKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyDlpoLmnpzmmK/oioLngrnvvIzliJnpnIDopoHpgY3ljoboioLngrlcbiAgICBpZiAobm9kZS5fbmFtZS5zdGFydHNXaXRoKCdfJykpIHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50cyA9IG5vZGUuX2NvbXBvbmVudHM7XG4gICAgICAgIGNvbnN0IG5hbWUgPSBub2RlLl9uYW1lID8/IFwiXCI7XG4gICAgICAgIGxldCBmaW5kID0gZmFsc2U7XG5cbiAgICAgICAgaWYgKG5vZGUuX25hbWUuc3RhcnRzV2l0aChcIl9ub2RcIikpIHtcbiAgICAgICAgICAgIHR5cGVzLnB1c2goe1xuICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUuX25hbWUsXG4gICAgICAgICAgICAgICAgdHlwZTogXCJjYy5Ob2RlXCJcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBmaW5kID0gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghZmluZCkge1xuICAgICAgICAgICAgLy8g5aaC5p6c5piv55So55+t5ZCN56ew5byA5aS077yM5YiZ6K+05piO5oiQ5ZGY5Y+Y6YeP6KaB55So5a+55bqU55qE57uE5Lu257G75Z6LXG4gICAgICAgICAgICBmb3IgKGNvbnN0IG8gaW4gc2hvcnROYW1lcykge1xuICAgICAgICAgICAgICAgIGlmIChuYW1lLnN0YXJ0c1dpdGgoXCJfXCIgKyBvKSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wSW5mb0lEID0gY29tcG9uZW50cy5maW5kKChjb21wOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBJbmZvID0gcHJlZmFiW2NvbXAuX19pZF9fXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBjb21wSW5mby5fX3R5cGVfXyA9PSBzaG9ydE5hbWVzW29dO1xuICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoY29tcEluZm9JRCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcEluZm8gPSBwcmVmYWJbY29tcEluZm9JRC5fX2lkX19dO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNTYW1lVHlwZSh0eXBlcywgbm9kZS5fbmFtZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZS5fbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogY29tcEluZm8uX190eXBlX19cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghZmluZCkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBjb21wIG9mIGNvbXBvbmVudHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb21wSW5mbyA9IHByZWZhYltjb21wLl9faWRfX107XG5cbiAgICAgICAgICAgICAgICAvLyDpu5jorqTkuI3lj5ZVSVRyYW5zZm9ybeWSjFdpZGdldFxuICAgICAgICAgICAgICAgIGlmIChjb21wSW5mby5fX3R5cGVfXyAhPSBcImNjLlVJVHJhbnNmb3JtXCIgJiYgY29tcEluZm8uX190eXBlX18gIT0gXCJjYy5XaWRnZXRcIikge1xuICAgICAgICAgICAgICAgICAgICBpc1NhbWVUeXBlKHR5cGVzLCBub2RlLl9uYW1lKTtcblxuICAgICAgICAgICAgICAgICAgICB0eXBlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUuX25hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb21wSW5mby5fX3R5cGVfX1xuICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICBmaW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgLy8g5Y+q5Y+W56ys5LiA5LiqXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChub2RlLl9jaGlsZHJlbiAmJiBBcnJheS5pc0FycmF5KG5vZGUuX2NoaWxkcmVuKSAmJiBub2RlLl9jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbm9kZS5fY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGNoaWxkID0gbm9kZS5fY2hpbGRyZW5baV07XG5cbiAgICAgICAgICAgIGNvbnN0IGNoaWxkSW5mbyA9IHByZWZhYltjaGlsZC5fX2lkX19dO1xuICAgICAgICAgICAgaWYgKGNoaWxkSW5mby5fX3R5cGVfXyA9PSBcImNjLk5vZGVcIikge1xuXG4gICAgICAgICAgICAgICAgLy8g6K+05piO5pivQmFzZVZpZXfmiJbogIVCYXNlVmlld0NvbXBvbmVudFxuICAgICAgICAgICAgICAgIC8vIOS7luS7rOS8muWcqOiHquW3seeahOexu+mHjOmdoua3u+WKoOaIkOWRmOWPmOmHj1xuICAgICAgICAgICAgICAgIGNvbnN0IGNsYXNzX25hbWUgPSBhd2FpdCBoYXNDaGlsZE9mQmFzZVZpZXdPckJhc2VWaWV3Q29tcG9uZW50KGNoaWxkSW5mbywgcHJlZmFiLCBhbGxDb21wb25lbnRzKTtcbiAgICAgICAgICAgICAgICBpZiAoY2xhc3NfbmFtZSkge1xuICAgICAgICAgICAgICAgICAgICBjaGVjayhjbGFzc19uYW1lLCBjaGlsZEluZm8pO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBhd2FpdCB0cmF2ZXJzZVByZWZhYk5vZGUoY2hpbGRJbmZvLCBwcmVmYWIsIHR5cGVzLCBhbGxDb21wb25lbnRzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFzQ2hpbGRPZkJhc2VWaWV3T3JCYXNlVmlld0NvbXBvbmVudChub2RlOiBhbnksIHByZWZhYjogYW55LCBhbGxDb21wb25lbnRzOiBhbnlbXSk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgaWYgKCFub2RlKSByZXR1cm4gXCJcIjtcbiAgICBjb25zdCBjb21wb25lbnRzID0gbm9kZS5fY29tcG9uZW50cztcblxuICAgIGlmICghY29tcG9uZW50cyB8fCBjb21wb25lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG5cbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgY29tcG9uZW50cy5sZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgY29uc3QgY29tcCA9IGNvbXBvbmVudHNbaW5kZXhdO1xuICAgICAgICBjb25zdCBjb21wSW5mbyA9IHByZWZhYltjb21wLl9faWRfX107XG5cbiAgICAgICAgaWYgKGNvbXBJbmZvICYmIChjb21wSW5mby5fX3R5cGVfXyA9PT0gXCJCYXNlVmlld1wiIHx8IGNvbXBJbmZvLl9fdHlwZV9fID09PSBcIkJhc2VWaWV3Q29tcG9uZW50XCIpKSB7XG4gICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOWmguaenOaYr1VVSUTvvIzliJnpnIDopoHlpITnkIZcbiAgICAgICAgaWYgKEVkaXRvci5VdGlscy5VVUlELmlzVVVJRChjb21wSW5mby5fX3R5cGVfXykpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1jb21wb25lbnQnLFxuICAgICAgICAgICAgICAgIEVkaXRvci5VdGlscy5VVUlELmRlY29tcHJlc3NVVUlEKGNvbXBJbmZvLl9fdHlwZV9fKVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgaWYgKCFjb21wb25lbnRJbmZvKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZmluZCA9IGFsbENvbXBvbmVudHMuZmluZChlID0+IGUuY2lkID09IGNvbXBJbmZvLl9fdHlwZV9fKTtcbiAgICAgICAgICAgICAgICBpZiAoIWZpbmQpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGNvbnN0IGhhc0Fzc2V0SWQgPSBmaW5kICYmIGZpbmQuYXNzZXRVdWlkO1xuICAgICAgICAgICAgICAgIGlmICghaGFzQXNzZXRJZCkgY29udGludWU7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBhc3NldEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgaGFzQXNzZXRJZCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoYXNzZXRJbmZvPy5maWxlICYmIGFzc2V0SW5mby5maWxlLmVuZHNXaXRoKCcudHMnKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyDliJvlu7rpobnnm65cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvamVjdCA9IG5ldyBQcm9qZWN0KCk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8g5re75Yqg5rqQ5paH5Lu2XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZUZpbGUgPSBwcm9qZWN0LmFkZFNvdXJjZUZpbGVBdFBhdGgoYXNzZXRJbmZvLmZpbGUpO1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNsYXNzcyA9IHNvdXJjZUZpbGUuZ2V0Q2xhc3NlcygpO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNsYXNzcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xhc3NEZWNsYXJhdGlvbiA9IGNsYXNzc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjbGFzc0RlY2xhcmF0aW9uLmdldE5hbWUoKSAhPT0gZmluZC5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4dGVuZHNOb2RlID0gY2xhc3NEZWNsYXJhdGlvbi5nZXRFeHRlbmRzKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChleHRlbmRzTm9kZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4dGVuZE5hbWUgPSBleHRlbmRzTm9kZS5nZXRUZXh0KCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDliJvlu7rkuIDkuKrmlrDnmoTmo4Dmn6VcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlm6DkuLrlr7nkuo7pooTliLbkvZPmnaXor7TvvIzmr4/kuIDkuKrpooTliLbkvZPlhoXpg6jpg73mmK/kuIDkuKogQmFzZVZpZXdDb21wb25lbnTmiJbogIUgQmFzZVZpZXdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDph4zpnaLnmoTlrZDoioLngrnlkI3lrZfpg73mmK/kuIDmqKHkuIDmoLdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlv4Xpobvop4Tpgb/ov5nkuKrpl67pophcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlnKhSdW50aW1lIOS4i++8jOivpemXrumimOS4jeS8muWHuueOsFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChleHRlbmROYW1lLnN0YXJ0c1dpdGgoXCJCYXNlVmlld1wiKSB8fCBleHRlbmROYW1lLnN0YXJ0c1dpdGgoXCJCYXNlVmlld0NvbXBvbmVudFwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gaGFzQXNzZXRJZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChjb21wb25lbnRJbmZvKSB7XG5cbiAgICAgICAgICAgICAgICAvLyDkuI3lupTor6XotbDliLDov5nph4zmnaVcbiAgICAgICAgICAgICAgICBlcnJvcihcIuS4jeW6lOivpei1sOWIsOi/memHjOadpSBjb21wb25lbnRJbmZvXCIsIGNvbXBvbmVudEluZm8pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIFwiXCI7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGZpbmROb2Rlc1dpdGhVbmRlcnNjb3JlUHJlZml4KGFzc2V0SW5mbzogQXNzZXRJbmZvICYgeyBwcmVmYWI6IHsgYXNzZXRVdWlkOiBzdHJpbmcgfSB9KSB7XG4gICAgdHJ5IHtcblxuICAgICAgICBjb25zdCB0eXBlczogeyBuYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZyB9W10gPSBbXTtcbiAgICAgICAgY29uc3QgYWxsQ29tcG9uZW50cyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWNvbXBvbmVudHMnKTtcbiAgICAgICAgY29uc3Qgbm9kZUluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgYXNzZXRJbmZvLnByZWZhYi5hc3NldFV1aWQpO1xuXG4gICAgICAgIGlmIChub2RlSW5mbyAmJiBub2RlSW5mby5maWxlKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmYWJDb250ZW50ID0gcmVhZEZpbGVTeW5jKG5vZGVJbmZvIS5maWxlLCAndXRmLTgnKTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcHJlZmFiID0gSlNPTi5wYXJzZShwcmVmYWJDb250ZW50KTtcbiAgICAgICAgICAgICAgICBjb25zdCBub2RlID0gcHJlZmFiLmZpbmQoKGl0ZW06IGFueSkgPT4gaXRlbS5fbmFtZSA9PSBhc3NldEluZm8ubmFtZSAmJiBpdGVtLl9fdHlwZV9fID09IFwiY2MuTm9kZVwiKTtcbiAgICAgICAgICAgICAgICBpZiAobm9kZSkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0cmF2ZXJzZVByZWZhYk5vZGUobm9kZSwgcHJlZmFiLCB0eXBlcywgYWxsQ29tcG9uZW50cyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0eXBlcztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBwYXJzZSBwcmVmYWIgY29udGVudDonLCBlcnJvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byB0cmF2ZXJzZSBub2RlczonLCBlcnJvcik7XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZW5lcmF0b3JNZW1iZXJzKGZpbGVQYXRoOiBzdHJpbmcsIHR5cGVzOiB7IG5hbWU6IHN0cmluZywgdHlwZTogc3RyaW5nIH1bXSkge1xuICAgIC8vIOWIm+W7uumhueebrlxuICAgIGNvbnN0IHByb2plY3QgPSBuZXcgUHJvamVjdCgpO1xuXG4gICAgLy8g5re75Yqg5rqQ5paH5Lu2XG4gICAgY29uc3Qgc291cmNlRmlsZSA9IHByb2plY3QuYWRkU291cmNlRmlsZUF0UGF0aChmaWxlUGF0aCk7XG5cbiAgICAvLyDojrflj5bmiYDmnInnsbvlo7DmmI5cbiAgICBjb25zdCBjbGFzc2VzID0gc291cmNlRmlsZS5nZXRDbGFzc2VzKCk7XG5cbiAgICAvLyDpgY3ljobmr4/kuKrnsbtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNsYXNzZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgY2xhc3NEZWNsYXJhdGlvbiA9IGNsYXNzZXNbaV07XG5cbiAgICAgICAgLy8g5YWI5re75Yqg5paw55qE5bGe5oCnXG4gICAgICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCB0eXBlcy5sZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgICAgIGNvbnN0IHR5cGVEZWYgPSB0eXBlc1tpbmRleF07XG4gICAgICAgICAgICBpZiAoIWNsYXNzRGVjbGFyYXRpb24uZ2V0UHJvcGVydHkodHlwZURlZi5uYW1lKSkge1xuICAgICAgICAgICAgICAgIC8vIOajgOafpeaYr+WQpuaYr+iHquWumuS5iee7hOS7tu+8iOmdnmNj5byA5aS077yJXG4gICAgICAgICAgICAgICAgY29uc3QgaXNDdXN0b21Db21wb25lbnQgPSAhdHlwZURlZi50eXBlLnN0YXJ0c1dpdGgoJ2NjLicpO1xuICAgICAgICAgICAgICAgIGxldCB0eXBlTmFtZSA9IHR5cGVEZWYudHlwZTtcbiAgICAgICAgICAgICAgICBsZXQgbW9kdWxlUGF0aCA9ICdjYyc7XG5cbiAgICAgICAgICAgICAgICBpZiAoaXNDdXN0b21Db21wb25lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdXVpZCA9IEVkaXRvci5VdGlscy5VVUlELmRlY29tcHJlc3NVVUlEKHR5cGVEZWYudHlwZSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCB1dWlkKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoYXNzZXRJbmZvICYmIGFzc2V0SW5mby5maWxlKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOivu+WPluexu+aJvuWIsOWvvOWHulxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VzdG9tQ29tcG9uZW50UHJvamVjdCA9IG5ldyBQcm9qZWN0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXN0b21Db21wb25lbnRGaWxlID0gY3VzdG9tQ29tcG9uZW50UHJvamVjdC5hZGRTb3VyY2VGaWxlQXRQYXRoKGFzc2V0SW5mby5maWxlKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g6I635Y+W5paH5Lu25Lit5omA5pyJ5a+85Ye655qE57G7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBleHBvcnRlZENsYXNzZXMgPSBjdXN0b21Db21wb25lbnRGaWxlLmdldENsYXNzZXMoKS5maWx0ZXIoYyA9PiBjLmlzRXhwb3J0ZWQoKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOacieWvvOWHuueahOexu++8jOS9v+eUqOesrOS4gOS4quexu+eahOWQjeensFxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGV4cG9ydGVkQ2xhc3Nlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZU5hbWUgPSBleHBvcnRlZENsYXNzZXNbMF0uZ2V0TmFtZSgpIHx8IGFzc2V0SW5mby5uYW1lO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5LyY5YWI5L2/55SoIHRzY29uZmlnIHBhdGhzIOWIq+WQje+8jOWQpuWImeS9v+eUqOebuOWvuei3r+W+hFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVBhdGggPSBnZXRNb2R1bGVTcGVjaWZpZXIoZmlsZVBhdGgsIGFzc2V0SW5mby5maWxlKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlpoLmnpzmsqHmnInmib7liLDlr7zlh7rnmoTnsbvvvIzkvb/nlKjmlofku7blkI1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYE5vIGV4cG9ydGVkIGNsYXNzIGZvdW5kIGluICR7YXNzZXRJbmZvLmZpbGV9LCB1c2luZyBhc3NldCBuYW1lIGluc3RlYWRgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlTmFtZSA9IGFzc2V0SW5mby5uYW1lO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5LyY5YWI5L2/55SoIHRzY29uZmlnIHBhdGhzIOWIq+WQje+8jOWQpuWImeS9v+eUqOebuOWvuei3r+W+hFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVBhdGggPSBnZXRNb2R1bGVTcGVjaWZpZXIoZmlsZVBhdGgsIGFzc2V0SW5mby5maWxlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGNj57uE5Lu25Y+q6ZyA6KaB57uE5Lu25ZCNXG4gICAgICAgICAgICAgICAgICAgIHR5cGVOYW1lID0gdHlwZURlZi50eXBlLnNwbGl0KCcuJykucG9wKCkgfHwgJyc7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY2xhc3NEZWNsYXJhdGlvbi5pbnNlcnRQcm9wZXJ0eSgwLCB7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IHR5cGVEZWYubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogdHlwZU5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGluaXRpYWxpemVyOiBcIm51bGwhXCIsXG4gICAgICAgICAgICAgICAgICAgIGRlY29yYXRvcnM6IFt7XG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiAncHJvcGVydHknLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXJndW1lbnRzOiBbYHt0eXBlOiAke3R5cGVOYW1lfX1gXVxuICAgICAgICAgICAgICAgICAgICB9XSxcbiAgICAgICAgICAgICAgICAgICAgaXNSZWFkb25seTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgc2NvcGU6IFNjb3BlLlByaXZhdGVcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIC8vIOa3u+WKoOWvvOWFpVxuICAgICAgICAgICAgICAgIGlmIChpc0N1c3RvbUNvbXBvbmVudCkge1xuICAgICAgICAgICAgICAgICAgICAvLyDmt7vliqDoh6rlrprkuYnnu4Tku7bnmoTlr7zlhaVcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhpc3RpbmdJbXBvcnQgPSBzb3VyY2VGaWxlLmdldEltcG9ydERlY2xhcmF0aW9uKGkgPT5cbiAgICAgICAgICAgICAgICAgICAgICAgIGkuZ2V0TW9kdWxlU3BlY2lmaWVyVmFsdWUoKSA9PT0gbW9kdWxlUGF0aFxuICAgICAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ0ltcG9ydCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmFtZWRJbXBvcnRzID0gZXhpc3RpbmdJbXBvcnQuZ2V0TmFtZWRJbXBvcnRzKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW5hbWVkSW1wb3J0cy5zb21lKGltcCA9PiBpbXAuZ2V0TmFtZSgpID09PSB0eXBlTmFtZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ0ltcG9ydC5hZGROYW1lZEltcG9ydCh0eXBlTmFtZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzb3VyY2VGaWxlLmFkZEltcG9ydERlY2xhcmF0aW9uKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lZEltcG9ydHM6IFt0eXBlTmFtZV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlU3BlY2lmaWVyOiBtb2R1bGVQYXRoXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOa3u+WKoCBjYyDnu4Tku7blr7zlhaVcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2NJbXBvcnQgPSBzb3VyY2VGaWxlLmdldEltcG9ydERlY2xhcmF0aW9uKGkgPT5cbiAgICAgICAgICAgICAgICAgICAgICAgIGkuZ2V0TW9kdWxlU3BlY2lmaWVyVmFsdWUoKSA9PT0gJ2NjJ1xuICAgICAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChjY0ltcG9ydCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmFtZWRJbXBvcnRzID0gY2NJbXBvcnQuZ2V0TmFtZWRJbXBvcnRzKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW5hbWVkSW1wb3J0cy5zb21lKGltcCA9PiBpbXAuZ2V0TmFtZSgpID09PSB0eXBlTmFtZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjY0ltcG9ydC5hZGROYW1lZEltcG9ydCh0eXBlTmFtZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzb3VyY2VGaWxlLmFkZEltcG9ydERlY2xhcmF0aW9uKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lZEltcG9ydHM6IFt0eXBlTmFtZV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlU3BlY2lmaWVyOiAnY2MnXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOiOt+WPluaJgOacieengeacieWxnuaAp1xuICAgICAgICBjb25zdCBwcml2YXRlUHJvcHMgPSBjbGFzc0RlY2xhcmF0aW9uLmdldFByb3BlcnRpZXMoKS5maWx0ZXIocHJvcCA9PlxuICAgICAgICAgICAgcHJvcC5nZXROYW1lKCkuc3RhcnRzV2l0aCgnXycpXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8g5aSE55CG546w5pyJ5bGe5oCnXG4gICAgICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBwcml2YXRlUHJvcHMubGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgICAgICBjb25zdCBwcm9wID0gcHJpdmF0ZVByb3BzW2luZGV4XTtcblxuICAgICAgICAgICAgY29uc3QgbmFtZSA9IHByb3AuZ2V0TmFtZSgpO1xuICAgICAgICAgICAgY29uc3QgdHlwZSA9IHByb3AuZ2V0VHlwZSgpLmdldFRleHQoKTtcbiAgICAgICAgICAgIGNvbnN0IHR5cGVEZWYgPSB0eXBlcy5maW5kKGl0ZW0gPT4gaXRlbS5uYW1lID09PSBuYW1lKTtcblxuICAgICAgICAgICAgaWYgKHR5cGVEZWYpIHtcbiAgICAgICAgICAgICAgICAvLyDmm7TmlrDnsbvlnovlkozoo4XppbDlmahcbiAgICAgICAgICAgICAgICBpZiAodHlwZURlZi50eXBlICE9PSB0eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOajgOafpeaYr+WQpuaYr+iHquWumuS5iee7hOS7tlxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpc0N1c3RvbUNvbXBvbmVudCA9ICF0eXBlRGVmLnR5cGUuc3RhcnRzV2l0aCgnY2MuJyk7XG4gICAgICAgICAgICAgICAgICAgIGxldCB0eXBlTmFtZSA9IHR5cGVEZWYudHlwZTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IG1vZHVsZVBhdGggPSAnY2MnO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChpc0N1c3RvbUNvbXBvbmVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdXVpZCA9IEVkaXRvci5VdGlscy5VVUlELmRlY29tcHJlc3NVVUlEKHR5cGVEZWYudHlwZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhc3NldEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgdXVpZCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhc3NldEluZm8gJiYgYXNzZXRJbmZvLmZpbGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDor7vlj5bnsbvmib7liLDlr7zlh7pcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXN0b21Db21wb25lbnRQcm9qZWN0ID0gbmV3IFByb2plY3QoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXN0b21Db21wb25lbnRGaWxlID0gY3VzdG9tQ29tcG9uZW50UHJvamVjdC5hZGRTb3VyY2VGaWxlQXRQYXRoKGFzc2V0SW5mby5maWxlKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOiOt+WPluaWh+S7tuS4reaJgOacieWvvOWHuueahOexu1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4cG9ydGVkQ2xhc3NlcyA9IGN1c3RvbUNvbXBvbmVudEZpbGUuZ2V0Q2xhc3NlcygpLmZpbHRlcihjID0+IGMuaXNFeHBvcnRlZCgpKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOacieWvvOWHuueahOexu++8jOS9v+eUqOesrOS4gOS4quexu+eahOWQjeensFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChleHBvcnRlZENsYXNzZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlTmFtZSA9IGV4cG9ydGVkQ2xhc3Nlc1swXS5nZXROYW1lKCkgfHwgYXNzZXRJbmZvLm5hbWU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5LyY5YWI5L2/55SoIHRzY29uZmlnIHBhdGhzIOWIq+WQje+8jOWQpuWImeS9v+eUqOebuOWvuei3r+W+hFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVQYXRoID0gZ2V0TW9kdWxlU3BlY2lmaWVyKGZpbGVQYXRoLCBhc3NldEluZm8uZmlsZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c5rKh5pyJ5om+5Yiw5a+85Ye655qE57G777yM5L2/55So5paH5Lu25ZCNXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVOYW1lID0gYXNzZXRJbmZvLm5hbWU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5LyY5YWI5L2/55SoIHRzY29uZmlnIHBhdGhzIOWIq+WQje+8jOWQpuWImeS9v+eUqOebuOWvuei3r+W+hFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVQYXRoID0gZ2V0TW9kdWxlU3BlY2lmaWVyKGZpbGVQYXRoLCBhc3NldEluZm8uZmlsZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gY2Pnu4Tku7blj6rpnIDopoHnu4Tku7blkI1cbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVOYW1lID0gdHlwZURlZi50eXBlLnNwbGl0KCcuJykucG9wKCkgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBjb25zdCBkZWNvcmF0b3JzID0gcHJvcC5nZXREZWNvcmF0b3JzKCk7XG4gICAgICAgICAgICAgICAgICAgIGxldCBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yOiBEZWNvcmF0b3IgfCBudWxsID0gbnVsbDtcblxuICAgICAgICAgICAgICAgICAgICAvLyDmn6Xmib7njrDmnInnmoQgcHJvcGVydHkg6KOF6aWw5ZmoXG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZGVjb3JhdG9yIG9mIGRlY29yYXRvcnMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkZWNvcmF0b3IuZ2V0TmFtZSgpID09PSAncHJvcGVydHknKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvciA9IGRlY29yYXRvcjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIOabtOaWsOexu+Wei1xuICAgICAgICAgICAgICAgICAgICBwcm9wLnNldFR5cGUodHlwZU5hbWUpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDojrflj5bnjrDmnInoo4XppbDlmajnmoTlj4LmlbDmlofmnKxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFyZ3MgPSBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLmdldEFyZ3VtZW50cygpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5bCd6K+V6Kej5p6Q546w5pyJ5Y+C5pWwXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYXJnVGV4dCA9IGFyZ3NbMF0uZ2V0VGV4dCgpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c5piv5a+56LGh5b2i5byP55qE5Y+C5pWwXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFyZ1RleHQuc3RhcnRzV2l0aCgneycpICYmIGFyZ1RleHQuZW5kc1dpdGgoJ30nKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmj5Dlj5blr7nosaHlhoXlrrnvvIznp7vpmaTliY3lkI7nmoToirHmi6zlj7dcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgb2JqZWN0Q29udGVudHMgPSBhcmdUZXh0LnN1YnN0cmluZygxLCBhcmdUZXh0Lmxlbmd0aCAtIDEpLnRyaW0oKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmo4Dmn6XmmK/lkKbmnInlhbbku5blsZ7mgKdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG9iamVjdENvbnRlbnRzLmluY2x1ZGVzKCcsJykgfHwgIW9iamVjdENvbnRlbnRzLmluY2x1ZGVzKCd0eXBlOicpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmnoTlu7rmlrDnmoTlr7nosaHlj4LmlbDvvIzljIXlkKvljp/mnInlsZ7mgKflkozmlrDnmoTnsbvlnotcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBuZXdBcmcgPSAneyc7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWkhOeQhuW3suacieWxnuaAp1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvcGVydGllcyA9IG9iamVjdENvbnRlbnRzLnNwbGl0KCcsJykubWFwKHAgPT4gcC50cmltKCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdHlwZUluZGV4ID0gcHJvcGVydGllcy5maW5kSW5kZXgocCA9PiBwLnN0YXJ0c1dpdGgoJ3R5cGU6JykpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZUluZGV4ID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmm7/mjaLnsbvlnovlsZ7mgKdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzW3R5cGVJbmRleF0gPSBgdHlwZTogJHt0eXBlTmFtZX1gO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmt7vliqDnsbvlnovlsZ7mgKdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzLnB1c2goYHR5cGU6ICR7dHlwZU5hbWV9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ld0FyZyArPSBwcm9wZXJ0aWVzLmpvaW4oJywgJykgKyAnfSc7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOabtOaWsOijhemlsOWZqFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5yZW1vdmVBcmd1bWVudCgwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nUHJvcGVydHlEZWNvcmF0b3IuYWRkQXJndW1lbnQobmV3QXJnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOS7heWMheWQq+exu+Wei+WumuS5ie+8jOabtOaWsOexu+Wei1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5yZW1vdmVBcmd1bWVudCgwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nUHJvcGVydHlEZWNvcmF0b3IuYWRkQXJndW1lbnQoYHt0eXBlOiAke3R5cGVOYW1lfX1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOmdnuWvueixoeW9ouW8j+WPguaVsO+8jOabv+aNouS4uuaWsOWPguaVsFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLnJlbW92ZUFyZ3VtZW50KDApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLmFkZEFyZ3VtZW50KGB7dHlwZTogJHt0eXBlTmFtZX19YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmsqHmnInlj4LmlbDvvIzmt7vliqDlj4LmlbBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLmFkZEFyZ3VtZW50KGB7dHlwZTogJHt0eXBlTmFtZX19YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDmsqHmnInmib7liLAgcHJvcGVydHkg6KOF6aWw5Zmo77yM5re75Yqg5paw6KOF6aWw5ZmoXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wLmFkZERlY29yYXRvcih7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogJ3Byb3BlcnR5JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhcmd1bWVudHM6IFtge3R5cGU6ICR7dHlwZU5hbWV9fWBdXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICghcHJvcC5nZXRJbml0aWFsaXplcigpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wLnNldEluaXRpYWxpemVyKCdudWxsJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyDmt7vliqDlr7zlhaVcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzQ3VzdG9tQ29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDmt7vliqDoh6rlrprkuYnnu4Tku7bnmoTlr7zlhaVcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nSW1wb3J0ID0gc291cmNlRmlsZS5nZXRJbXBvcnREZWNsYXJhdGlvbihpID0+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaS5nZXRNb2R1bGVTcGVjaWZpZXJWYWx1ZSgpID09PSBtb2R1bGVQYXRoXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXhpc3RpbmdJbXBvcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuYW1lZEltcG9ydHMgPSBleGlzdGluZ0ltcG9ydC5nZXROYW1lZEltcG9ydHMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW5hbWVkSW1wb3J0cy5zb21lKGltcCA9PiBpbXAuZ2V0TmFtZSgpID09PSB0eXBlTmFtZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdJbXBvcnQuYWRkTmFtZWRJbXBvcnQodHlwZU5hbWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlRmlsZS5hZGRJbXBvcnREZWNsYXJhdGlvbih7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVkSW1wb3J0czogW3R5cGVOYW1lXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlU3BlY2lmaWVyOiBtb2R1bGVQYXRoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDmt7vliqAgY2Mg57uE5Lu25a+85YWlXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjY0ltcG9ydCA9IHNvdXJjZUZpbGUuZ2V0SW1wb3J0RGVjbGFyYXRpb24oaSA9PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGkuZ2V0TW9kdWxlU3BlY2lmaWVyVmFsdWUoKSA9PT0gJ2NjJ1xuICAgICAgICAgICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNjSW1wb3J0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmFtZWRJbXBvcnRzID0gY2NJbXBvcnQuZ2V0TmFtZWRJbXBvcnRzKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFuYW1lZEltcG9ydHMuc29tZShpbXAgPT4gaW1wLmdldE5hbWUoKSA9PT0gdHlwZU5hbWUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNjSW1wb3J0LmFkZE5hbWVkSW1wb3J0KHR5cGVOYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZUZpbGUuYWRkSW1wb3J0RGVjbGFyYXRpb24oe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lZEltcG9ydHM6IFt0eXBlTmFtZV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZVNwZWNpZmllcjogJ2NjJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8g5YWI55yL55yL5piv5LiN5pivcHJvcGVydHnoo4XppbDlmahcbiAgICAgICAgICAgICAgICBjb25zdCBkZWNvcmF0b3JzID0gcHJvcC5nZXREZWNvcmF0b3JzKCk7XG4gICAgICAgICAgICAgICAgbGV0IGV4aXN0aW5nUHJvcGVydHlEZWNvcmF0b3I6IERlY29yYXRvciB8IG51bGwgPSBudWxsO1xuXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBkZWNvcmF0b3Igb2YgZGVjb3JhdG9ycykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZGVjb3JhdG9yLmdldE5hbWUoKSA9PT0gJ3Byb3BlcnR5Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvciA9IGRlY29yYXRvcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGV4aXN0aW5nUHJvcGVydHlEZWNvcmF0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g5qOA5p+l6KOF6aWw5Zmo5Y+C5pWw5Lit5piv5ZCm5YyF5ZCrIHVzZXJEYXRhXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFyZ3MgPSBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLmdldEFyZ3VtZW50cygpO1xuICAgICAgICAgICAgICAgICAgICBsZXQgaGFzVXNlckRhdGEgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhcmdUZXh0ID0gYXJnc1swXS5nZXRUZXh0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDmo4Dmn6XmmK/lkKbljIXlkKsgdXNlckRhdGEg5Y+C5pWwXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXJnVGV4dC5pbmNsdWRlcygndXNlckRhdGEnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhc1VzZXJEYXRhID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOayoeaciSB1c2VyRGF0YSDlj4LmlbDvvIzmiY3np7vpmaTlsZ7mgKdcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFoYXNVc2VyRGF0YSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJvcC5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICAvLyDkv53lrZjkv67mlLlcbiAgICBwcm9qZWN0LnNhdmVTeW5jKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvblJvb3RNZW51KGFzc2V0SW5mbzogQXNzZXRJbmZvICYgeyBjb21wb25lbnRzOiBhbnlbXSwgcHJlZmFiOiB7IGFzc2V0VXVpZDogc3RyaW5nIH0gfSkge1xuICAgIHJldHVybiBbXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxhYmVsOiAnaTE4bjpnYW1lLWZyYW1ld29yay5oaWVyYXJjaHkubWVudS5yb290TWVudScsXG4gICAgICAgICAgICBhc3luYyBjbGljaygpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgICAgICBFZGl0b3IuRGlhbG9nLmluZm8oJ2kxOG46Z2FtZS1mcmFtZXdvcmsuaGllcmFyY2h5LmVycm9yLm5vQXNzZXRJbmZvJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgICAgICAvLyDpgY3ljoboioLngrnmoJHmn6Xmib7luKbkuIvliJLnur/nmoToioLngrnlkozlsZ7mgKdcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHlwZXMgPSBhd2FpdCBmaW5kTm9kZXNXaXRoVW5kZXJzY29yZVByZWZpeChhc3NldEluZm8pO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIOWkhOeQhue7hOS7tuS/oeaBr1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wb25lbnRzID0gYXNzZXRJbmZvLmNvbXBvbmVudHM7XG4gICAgICAgICAgICAgICAgICAgIGlmICghY29tcG9uZW50cyB8fCBjb21wb25lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgbGV0IGhhc0Jhc2VWaWV3ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBjb21wb25lbnRzLmxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gY29tcG9uZW50c1tpbmRleF07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOiOt+WPlue7hOS7tuivpue7huS/oeaBr1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcG9uZW50SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWNvbXBvbmVudCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50LnZhbHVlICAvLyDov5nph4znmoQgdmFsdWUg5bCx5piv57uE5Lu255qEIFVVSURcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wb25lbnRJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYmFzZVZpZXcgPSBjb21wb25lbnRJbmZvLmV4dGVuZHM/LmZpbmQoaXRlbSA9PiBpdGVtLnN0YXJ0c1dpdGgoXCJCYXNlVmlld1wiKSB8fCBpdGVtLnN0YXJ0c1dpdGgoXCJCYXNlVmlld0NvbXBvbmVudFwiKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGJhc2VWaWV3KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhc0Jhc2VWaWV3ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g6I635Y+W6LWE5rqQ5L+h5oGvXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHV1aWQgPSBFZGl0b3IuVXRpbHMuVVVJRC5kZWNvbXByZXNzVVVJRChjb21wb25lbnRJbmZvLmNpZCEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhc3NldEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgdXVpZCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFzc2V0SW5mbyAmJiBhc3NldEluZm8uZmlsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2VuZXJhdG9yTWVtYmVycyhhc3NldEluZm8uZmlsZSwgdHlwZXMgPz8gW10pO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBFZGl0b3IuRGlhbG9nLmluZm8oJ+aehOmAoOaIkOWRmOWHveaVsOaIkOWKnycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFoYXNCYXNlVmlldykge1xuICAgICAgICAgICAgICAgICAgICAgICAgRWRpdG9yLkRpYWxvZy5lcnJvcihFZGl0b3IuSTE4bi50KCdnYW1lLWZyYW1ld29yay5oaWVyYXJjaHkuZXJyb3Iubm9CYXNlVmlldycpKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgXTtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBvbk5vZGVNZW51KG5vZGU6IEFzc2V0SW5mbykge1xuICAgIHJldHVybiBbXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxhYmVsOiAnaTE4bjpnYW1lLWZyYW1ld29yay5oaWVyYXJjaHkubWVudS5ub2RlTWVudScsXG4gICAgICAgICAgICBhc3luYyBjbGljaygpIHtcblxuICAgICAgICAgICAgICAgIGlmICghbm9kZSB8fCAhbm9kZS51dWlkIHx8IG5vZGUudHlwZSAhPT0gXCJjYy5Ob2RlXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIEVkaXRvci5QYW5lbC5vcGVuKCdnYW1lLWZyYW1ld29yay5zZXQtbmFtZScsIG5vZGUudXVpZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgXTtcbn0iXX0=