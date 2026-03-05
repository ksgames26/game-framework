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
async function generatorMembers(filePath, types, scope) {
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
                    scope: scope
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
            prop.setScope(scope);
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
                            arguments: [`{type: ${typeName}}`],
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
                                    generatorMembers(assetInfo.file, types !== null && types !== void 0 ? types : [], ts_morph_1.Scope.Private);
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
        {
            label: 'i18n:game-framework.hierarchy.menu.publicMenu',
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
                                    generatorMembers(assetInfo.file, types !== null && types !== void 0 ? types : [], ts_morph_1.Scope.Public);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGllcmFyY2h5LW1lbnUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvaGllcmFyY2h5L2hpZXJhcmNoeS1tZW51LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUNBLHFDQUFnQztBQUNoQywyQkFBa0M7QUFDbEMsZ0RBQXdCO0FBQ3hCLHVDQUFxRDtBQUNyRCw4Q0FBMkM7QUFFM0Msc0JBQXNCO0FBQ3RCLElBQUksbUJBQW1CLEdBQWlELElBQUksQ0FBQztBQUU3RTs7R0FFRztBQUNILFNBQVMsaUJBQWlCO0lBQ3RCLElBQUksbUJBQW1CLEtBQUssSUFBSSxFQUFFO1FBQzlCLE9BQU8sbUJBQW1CLENBQUM7S0FDOUI7SUFFRCxtQkFBbUIsR0FBRyxFQUFFLENBQUM7SUFFekIsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsc0JBQXNCLENBQUM7SUFFcEUsSUFBSTtRQUNBLG1CQUFtQjtRQUNuQixNQUFNLGVBQWUsR0FBRyxJQUFBLGlCQUFZLEVBQUMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzVELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUM7UUFFN0MsZ0JBQWdCO1FBQ2hCLElBQUksZUFBZSxHQUFHLFFBQVEsQ0FBQyxlQUFlLElBQUksRUFBRSxDQUFDO1FBQ3JELElBQUksUUFBUSxDQUFDLE9BQU8sRUFBRTtZQUNsQixNQUFNLFVBQVUsR0FBRyxjQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUM7Z0JBQ2hELENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTztnQkFDbEIsQ0FBQyxDQUFDLGNBQUksQ0FBQyxJQUFJLENBQUMsY0FBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsRUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7WUFFOUQsSUFBSTtnQkFDQSxNQUFNLGFBQWEsR0FBRyxJQUFBLGlCQUFZ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QVUsRUFBRSxrQkFBa0IsRUFBRSxJQUFJLENBQUMsQ0FBQztnQ0FFckYsSUFBSSxTQUFTLElBQUksU0FBUyxDQUFDLElBQUksRUFBRTtvQ0FDN0IsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxLQUFLLGFBQUwsS0FBSyxjQUFMLEtBQUssR0FBSSxFQUFFLEVBQUUsZ0JBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztvQ0FFNUQsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7aUNBQ2xDOzZCQUNKO3lCQUNKO3FCQUNKO29CQUVELElBQUksQ0FBQyxXQUFXLEVBQUU7d0JBQ2QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsMkNBQTJDLENBQUMsQ0FBQyxDQUFDO3FCQUNuRjtpQkFDSjtZQUNMLENBQUM7U0FDSjtLQUNKLENBQUM7QUFDTixDQUFDO0FBcEdELGdDQW9HQztBQUFBLENBQUM7QUFFRixTQUFnQixVQUFVLENBQUMsSUFBZTtJQUN0QyxPQUFPO1FBQ0g7WUFDSSxLQUFLLEVBQUUsNkNBQTZDO1lBQ3BELEtBQUssQ0FBQyxLQUFLO2dCQUVQLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssU0FBUyxFQUFFO29CQUNoRCxPQUFPO2lCQUNWO2dCQUVELE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM1RCxDQUFDO1NBQ0o7S0FDSixDQUFDO0FBQ04sQ0FBQztBQWRELGdDQWNDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXNzZXRJbmZvIH0gZnJvbSBcIkBjb2Nvcy9jcmVhdG9yLXR5cGVzL2VkaXRvci9wYWNrYWdlcy9hc3NldC1kYi9AdHlwZXMvcHVibGljXCI7XG5pbXBvcnQgeyBlcnJvciB9IGZyb20gXCJjb25zb2xlXCI7XG5pbXBvcnQgeyByZWFkRmlsZVN5bmMgfSBmcm9tIFwiZnNcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgeyBEZWNvcmF0b3IsIFByb2plY3QsIFNjb3BlIH0gZnJvbSBcInRzLW1vcnBoXCI7XG5pbXBvcnQgeyBzaG9ydE5hbWVzIH0gZnJvbSBcIi4uL3Nob3J0LW5hbWVcIjtcblxuLy8gdHNjb25maWcgcGF0aHMg6Kej5p6Q57yT5a2YXG5sZXQgX3RzY29uZmlnUGF0aHNDYWNoZTogeyBhbGlhczogc3RyaW5nOyBiYXNlUGF0aDogc3RyaW5nIH1bXSB8IG51bGwgPSBudWxsO1xuXG4vKipcbiAqIOWKoOi9vSB0c2NvbmZpZy5qc29uIOS4reeahCBwYXRocyDphY3nva5cbiAqL1xuZnVuY3Rpb24gbG9hZFRzY29uZmlnUGF0aHMoKTogeyBhbGlhczogc3RyaW5nOyBiYXNlUGF0aDogc3RyaW5nIH1bXSB7XG4gICAgaWYgKF90c2NvbmZpZ1BhdGhzQ2FjaGUgIT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIF90c2NvbmZpZ1BhdGhzQ2FjaGU7XG4gICAgfVxuXG4gICAgX3RzY29uZmlnUGF0aHNDYWNoZSA9IFtdO1xuXG4gICAgY29uc3QgdHNjb25maWdQYXRoID0gRWRpdG9yLlByb2plY3QudG1wRGlyICsgXCIvdHNjb25maWcuY29jb3MuanNvblwiO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgLy8g6K+75Y+WIHRzY29uZmlnLmpzb25cbiAgICAgICAgY29uc3QgdHNjb25maWdDb250ZW50ID0gcmVhZEZpbGVTeW5jKHRzY29uZmlnUGF0aCwgJ3V0Zi04Jyk7XG4gICAgICAgIGNvbnN0IHRzY29uZmlnID0gSlNPTi5wYXJzZSh0c2NvbmZpZ0NvbnRlbnQpO1xuXG4gICAgICAgIC8vIOWkhOeQhiBleHRlbmRzIOe7p+aJv1xuICAgICAgICBsZXQgY29tcGlsZXJPcHRpb25zID0gdHNjb25maWcuY29tcGlsZXJPcHRpb25zIHx8IHt9O1xuICAgICAgICBpZiAodHNjb25maWcuZXh0ZW5kcykge1xuICAgICAgICAgICAgY29uc3QgZXh0ZW5kUGF0aCA9IHBhdGguaXNBYnNvbHV0ZSh0c2NvbmZpZy5leHRlbmRzKVxuICAgICAgICAgICAgICAgID8gdHNjb25maWcuZXh0ZW5kc1xuICAgICAgICAgICAgICAgIDogcGF0aC5qb2luKHBhdGguZGlybmFtZSh0c2NvbmZpZ1BhdGgpLCB0c2NvbmZpZy5leHRlbmRzKTtcblxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBleHRlbmRDb250ZW50ID0gcmVhZEZpbGVTeW5jKGV4dGVuZFBhdGgsICd1dGYtOCcpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGV4dGVuZENvbmZpZyA9IEpTT04ucGFyc2UoZXh0ZW5kQ29udGVudCk7XG4gICAgICAgICAgICAgICAgY29tcGlsZXJPcHRpb25zID0ge1xuICAgICAgICAgICAgICAgICAgICAuLi5leHRlbmRDb25maWcuY29tcGlsZXJPcHRpb25zLFxuICAgICAgICAgICAgICAgICAgICAuLi5jb21waWxlck9wdGlvbnNcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2Fybihg5peg5rOV5Yqg6L2957un5om/55qE6YWN572u5paH5Lu2OiAke2V4dGVuZFBhdGh9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwYXRocyA9IGNvbXBpbGVyT3B0aW9ucy5wYXRocztcbiAgICAgICAgaWYgKHBhdGhzKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFthbGlhcywgcGF0aEFycmF5XSBvZiBPYmplY3QuZW50cmllcyhwYXRocykpIHtcbiAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShwYXRoQXJyYXkpICYmIHBhdGhBcnJheS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOWPluesrOS4gOS4qui3r+W+hOaYoOWwhO+8jOWOu+aOieacq+WwvueahCAqXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhc2VQYXRoID0gcGF0aEFycmF5WzBdLnJlcGxhY2UoL1xcKiQvLCAnJykucmVwbGFjZSgvXFxcXC9nLCAnLycpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhbGlhc1ByZWZpeCA9IGFsaWFzLnJlcGxhY2UoL1xcKiQvLCAnJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgX3RzY29uZmlnUGF0aHNDYWNoZS5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFsaWFzOiBhbGlhc1ByZWZpeCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhc2VQYXRoOiBiYXNlUGF0aFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUud2Fybign5Yqg6L29IHRzY29uZmlnIHBhdGhzIOWksei0pTonLCBlKTtcbiAgICB9XG5cbiAgICByZXR1cm4gX3RzY29uZmlnUGF0aHNDYWNoZTtcbn1cblxuLyoqXG4gKiDlsJ3or5XlsIbnu53lr7not6/lvoTovazmjaLkuLogdHNjb25maWcgcGF0aHMg5Yir5ZCNXG4gKi9cbmZ1bmN0aW9uIHRyeVJlc29sdmVQYXRoc0FsaWFzKHRhcmdldEZpbGVQYXRoOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgICBjb25zdCBwYXRoTWFwcGluZ3MgPSBsb2FkVHNjb25maWdQYXRocygpO1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRUYXJnZXQgPSB0YXJnZXRGaWxlUGF0aC5yZXBsYWNlKC9cXFxcL2csICcvJyk7XG5cbiAgICBmb3IgKGNvbnN0IG1hcHBpbmcgb2YgcGF0aE1hcHBpbmdzKSB7XG4gICAgICAgIC8vIOaOkumZpCBkYjovL2Fzc2V0cy8qIOeahOWMuemFje+8jOi/meS4quS9v+eUqOebuOWvuei3r+W+hFxuICAgICAgICBpZiAobWFwcGluZy5hbGlhcyA9PT0gJ2RiOi8vYXNzZXRzLycpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG5vcm1hbGl6ZWRUYXJnZXQuaW5jbHVkZXMobWFwcGluZy5iYXNlUGF0aCkpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlbGF0aXZlUGFydCA9IG5vcm1hbGl6ZWRUYXJnZXQuc3Vic3RyaW5nKFxuICAgICAgICAgICAgICAgIG5vcm1hbGl6ZWRUYXJnZXQuaW5kZXhPZihtYXBwaW5nLmJhc2VQYXRoKSArIG1hcHBpbmcuYmFzZVBhdGgubGVuZ3RoXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgLy8gY29uc3QgY2xlYW5SZWxhdGl2ZVBhcnQgPSByZWxhdGl2ZVBhcnQucmVwbGFjZSgvXlxcLy8sICcnKS5yZXBsYWNlKC9cXC5bXi5dKiQvLCAnJyk7XG4gICAgICAgICAgICByZXR1cm4gYCR7bWFwcGluZy5hbGlhc31nYW1lLWZyYW1ld29ya2A7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuLyoqXG4gKiDojrflj5bmqKHlnZflr7zlhaXot6/lvoTvvIzkvJjlhYjkvb/nlKggcGF0aHMg5Yir5ZCN77yM5ZCm5YiZ5L2/55So55u45a+56Lev5b6EXG4gKi9cbmZ1bmN0aW9uIGdldE1vZHVsZVNwZWNpZmllcihmcm9tRmlsZVBhdGg6IHN0cmluZywgdGFyZ2V0RmlsZVBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgLy8g5bCd6K+V5L2/55SoIHRzY29uZmlnIHBhdGhzIOWIq+WQjVxuICAgIGNvbnN0IGFsaWFzUGF0aCA9IHRyeVJlc29sdmVQYXRoc0FsaWFzKHRhcmdldEZpbGVQYXRoKTtcbiAgICBpZiAoYWxpYXNQYXRoKSB7XG4gICAgICAgIHJldHVybiBhbGlhc1BhdGg7XG4gICAgfVxuXG4gICAgLy8g5Zue6YCA5Yiw55u45a+56Lev5b6EXG4gICAgY29uc3QgZmlsZURpciA9IHBhdGguZGlybmFtZShmcm9tRmlsZVBhdGgpO1xuICAgIGNvbnN0IHJlbGF0aXZlUGF0aCA9IHBhdGgucmVsYXRpdmUoZmlsZURpciwgcGF0aC5kaXJuYW1lKHRhcmdldEZpbGVQYXRoKSk7XG4gICAgY29uc3QgZmlsZU5hbWVXaXRob3V0RXh0ID0gcGF0aC5iYXNlbmFtZSh0YXJnZXRGaWxlUGF0aCwgcGF0aC5leHRuYW1lKHRhcmdldEZpbGVQYXRoKSk7XG5cbiAgICBsZXQgbW9kdWxlUGF0aDogc3RyaW5nO1xuICAgIGlmIChyZWxhdGl2ZVBhdGggPT09ICcnKSB7XG4gICAgICAgIG1vZHVsZVBhdGggPSBgLi8ke2ZpbGVOYW1lV2l0aG91dEV4dH1gO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIG1vZHVsZVBhdGggPSBgJHtyZWxhdGl2ZVBhdGgucmVwbGFjZSgvXFxcXC9nLCAnLycpfS8ke2ZpbGVOYW1lV2l0aG91dEV4dH1gO1xuICAgIH1cblxuICAgIC8vIOWmguaenOi3r+W+hOS4jeaYr+S7pS4v5oiWLi4v5byA5aS077yM5re75YqgLi9cbiAgICBpZiAoIS9eXFwuXFwuP1xcLy8udGVzdChtb2R1bGVQYXRoKSkge1xuICAgICAgICBtb2R1bGVQYXRoID0gYC4vJHttb2R1bGVQYXRofWA7XG4gICAgfVxuXG4gICAgcmV0dXJuIG1vZHVsZVBhdGg7XG59XG5cblxuZnVuY3Rpb24gaXNTYW1lVHlwZSh0eXBlczogeyBuYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZyB9W10sIG5hbWU6IHN0cmluZykge1xuICAgIC8vIOajgOafpeaYr+WQpuW3sue7j+WtmOWcqOWQjOWQjeiKgueCuVxuICAgIGNvbnN0IGV4aXN0aW5nVHlwZSA9IHR5cGVzLmZpbmQodCA9PiB0Lm5hbWUgPT09IG5hbWUpO1xuICAgIGlmIChleGlzdGluZ1R5cGUpIHtcbiAgICAgICAgRWRpdG9yLkRpYWxvZy5lcnJvcihg6K2m5ZGKOiDlj5HnjrDph43lpI3nmoToioLngrnlkI3np7AgXCIke25hbWV9XCJgKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDorablkYo6IOWPkeeOsOmHjeWkjeeahOiKgueCueWQjeensCBcIiR7bmFtZX1cImApO1xuICAgIH1cbn1cblxuLyoqXG4gKiBAcGFyYW0gbm9kZSDlvZPliY3oioLngrlcbiAqIEBwYXJhbSBwcmVmYWIg6aKE5Yi25L2T5pWw5o2uXG4gKiBAcGFyYW0gdHlwZXMg5pS26ZuG55qE57G75Z6L5pWw57uEXG4gKiBAcGFyYW0gdHlwZXMubmFtZSDmiJDlkZjlj5jph4/lkI3np7BcbiAqIEBwYXJhbSB0eXBlcy50eXBlIOaIkOWRmOWPmOmHj+exu+Wei+aYr+e7hOS7tueahFVVSURcbiAqL1xuYXN5bmMgZnVuY3Rpb24gdHJhdmVyc2VQcmVmYWJOb2RlKG5vZGU6IGFueSwgcHJlZmFiOiBhbnksIHR5cGVzOiB7IG5hbWU6IHN0cmluZywgdHlwZTogc3RyaW5nIH1bXSwgYWxsQ29tcG9uZW50czogYW55W10gPSBbXSkge1xuXG4gICAgLy8g6ZyA6KaB5YWI5qOA5rWL6L+Z5Liqbm9kZeaYr+WQpuaYr+mihOWItuS9k1xuICAgIC8vIOWmguaenOaYr+mihOWItuS9k++8jOWImemcgOimgemBjeWOhumihOWItuS9k1xuICAgIGNvbnN0IHByZWZhYklkID0gbm9kZS5fcHJlZmFiLl9faWRfXztcbiAgICBjb25zdCBwcmVmYWJJbmZvID0gcHJlZmFiW3ByZWZhYklkXTtcbiAgICBjb25zdCBpc1ByZWZhYiA9IHByZWZhYkluZm8uYXNzZXQgJiYgcHJlZmFiSW5mby5hc3NldC5fX3V1aWRfXztcblxuICAgIC8vIOajgOafpeaYr+S4jeaYr+S4gOS4qumihOWItuS9k+aUvuWIsOS6huS4u+mihOWItuS9k+mHjOmdolxuICAgIC8vIOW5tuS4lOS/ruaUueS6huWQjeensFxuICAgIC8vIOaIluiAheaYr+S4jeaYr+WcqOS4gOS4quiKgueCuemihOWItuS9k+mHjOmdou+8jOacieS4gOS6m+WtkOiKgueCuemihOWItuS9k+S4iuaMgui9veS6hiBCYXNlVmlld+aIluiAhUJhc2VWaWV3Q29tcG9uZW50XG4gICAgLy8g5aaC5p6c5piv6L+Z57G75oOF5Ya177yM5YiZ5LiN5Y+C5LiO55Sf5Lqn5oiQ5ZGY5Y+Y6YePXG4gICAgLy8g5Zug5Li66L+Z56eN5oOF5Ya177yM5oiQ5ZGY5Y+Y6YeP6ZyA6KaB5pS+5YiwIOivpeiKgueCuSDmiYDlnKggQmFzZVZpZXcg5oiW6ICFIEJhc2VWaWV3Q29tcG9uZW50IOeahOiEmuacrOmHjOmdou+8jOiAjOS4jeaYr+W9k+WJjSBCYXNlVmlldyDmiJbogIUgQmFzZVZpZXdDb21wb25lbnQg55qE6ISa5pys6YeM6Z2iXG4gICAgY29uc3QgY2hlY2sgPSBmdW5jdGlvbiAoY2xhc3NfdXVpZDogc3RyaW5nLCBub2RlOiBhbnkpOiBib29sZWFuIHtcbiAgICAgICAgaWYgKG5vZGUuX25hbWUuc3RhcnRzV2l0aChcIl9ub2RcIikpIHtcbiAgICAgICAgICAgIHR5cGVzLnB1c2goe1xuICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUuX25hbWUsXG4gICAgICAgICAgICAgICAgdHlwZTogXCJjYy5Ob2RlXCJcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOWmguaenOmBjeWOhuWujOS6hu+8jOeci+eci+mihOWItuS9k+eahOWxnuaAp+mHjei9vVxuICAgICAgICBjb25zdCBpbnN0YW5jZUlEID0gcHJlZmFiSW5mby5pbnN0YW5jZSAmJiBwcmVmYWJJbmZvLmluc3RhbmNlLl9faWRfXztcbiAgICAgICAgY29uc3QgaW5zdGFuY2UgPSBwcmVmYWJbaW5zdGFuY2VJRF07XG5cbiAgICAgICAgaWYgKGluc3RhbmNlKSB7XG4gICAgICAgICAgICAvLyDph43ovb3lsZ7mgKdcbiAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5T3ZlcnJpZGVzID0gaW5zdGFuY2UucHJvcGVydHlPdmVycmlkZXM7XG4gICAgICAgICAgICBpZiAocHJvcGVydHlPdmVycmlkZXMgJiYgQXJyYXkuaXNBcnJheShwcm9wZXJ0eU92ZXJyaWRlcykgJiYgcHJvcGVydHlPdmVycmlkZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcHJvcGVydHlPdmVycmlkZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvcGVydHlPdmVycmlkZSA9IHByb3BlcnR5T3ZlcnJpZGVzW2ldO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBvdmVycmlkZSA9IHByZWZhYltwcm9wZXJ0eU92ZXJyaWRlLl9faWRfX107XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKG92ZXJyaWRlICYmIG92ZXJyaWRlLl9fdHlwZV9fID09IFwiQ0NQcm9wZXJ0eU92ZXJyaWRlSW5mb1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9wZXJ0eVBhdGggPSBvdmVycmlkZS5wcm9wZXJ0eVBhdGggYXMgc3RyaW5nW107XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB2YWx1ZSA9IG92ZXJyaWRlLnZhbHVlO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJvcGVydHlQYXRoICYmIHByb3BlcnR5UGF0aC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5kZXggPSBwcm9wZXJ0eVBhdGguZmluZEluZGV4KGUgPT4gZSA9PSBcIl9uYW1lXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbmRleCAhPSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuYW1lID0gdmFsdWU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNTYW1lVHlwZSh0eXBlcywgbmFtZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBuYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogY2xhc3NfdXVpZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjb21wb25lbnRzID0gbm9kZS5fY29tcG9uZW50cyA/PyBbXTtcbiAgICAgICAgZm9yIChjb25zdCBjb21wIG9mIGNvbXBvbmVudHMpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbXBJbmZvID0gcHJlZmFiW2NvbXAuX19pZF9fXTtcblxuICAgICAgICAgICAgLy8g6buY6K6k5LiN5Y+WVUlUcmFuc2Zvcm3lkoxXaWRnZXRcbiAgICAgICAgICAgIGlmIChjb21wSW5mby5fX3R5cGVfXyAhPSBcImNjLlVJVHJhbnNmb3JtXCIgJiYgY29tcEluZm8uX190eXBlX18gIT0gXCJjYy5XaWRnZXRcIikge1xuICAgICAgICAgICAgICAgIGlzU2FtZVR5cGUodHlwZXMsIG5vZGUuX25hbWUpO1xuXG4gICAgICAgICAgICAgICAgdHlwZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUuX25hbWUsXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IGNvbXBJbmZvLl9fdHlwZV9fXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAvLyDlj6rlj5bnrKzkuIDkuKpcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBpZiAoaXNQcmVmYWIpIHtcbiAgICAgICAgY29uc3Qgbm9kZUluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgaXNQcmVmYWIpO1xuXG4gICAgICAgIGlmIChub2RlSW5mbyAmJiBub2RlSW5mby5maWxlKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmYWJDb250ZW50ID0gcmVhZEZpbGVTeW5jKG5vZGVJbmZvIS5maWxlLCAndXRmLTgnKTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcHJlZmFiMSA9IEpTT04ucGFyc2UocHJlZmFiQ29udGVudCk7XG4gICAgICAgICAgICAgICAgY29uc3QgZGF0YUlkID0gcHJlZmFiMVswXSAmJiBwcmVmYWIxWzBdPy5kYXRhPy5fX2lkX187XG4gICAgICAgICAgICAgICAgY29uc3QgaXNOb2RlID0gcHJlZmFiMVtkYXRhSWRdICYmIHByZWZhYjFbZGF0YUlkXT8uX190eXBlX18gPT0gXCJjYy5Ob2RlXCI7XG5cbiAgICAgICAgICAgICAgICBpZiAoaXNOb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOivtOaYjuaYr0Jhc2VWaWV35oiW6ICFQmFzZVZpZXdDb21wb25lbnRcbiAgICAgICAgICAgICAgICAgICAgLy8g5LuW5Lus5Lya5Zyo6Ieq5bex55qE57G76YeM6Z2i5re75Yqg5oiQ5ZGY5Y+Y6YePXG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xhc3NfbmFtZSA9IGF3YWl0IGhhc0NoaWxkT2ZCYXNlVmlld09yQmFzZVZpZXdDb21wb25lbnQocHJlZmFiMVtkYXRhSWRdLCBwcmVmYWIxLCBhbGxDb21wb25lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNsYXNzX25hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoZWNrKGNsYXNzX25hbWUsIHByZWZhYjFbZGF0YUlkXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0cmF2ZXJzZVByZWZhYk5vZGUocHJlZmFiMVtkYXRhSWRdLCBwcmVmYWIxLCB0eXBlcywgYWxsQ29tcG9uZW50cyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gcGFyc2UgcHJlZmFiIGNvbnRlbnQ6JywgZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8g5aaC5p6c6YGN5Y6G5a6M5LqG77yM55yL55yL6aKE5Yi25L2T55qE5bGe5oCn6YeN6L29XG4gICAgICAgIGNvbnN0IGluc3RhbmNlSUQgPSBwcmVmYWJJbmZvLmluc3RhbmNlICYmIHByZWZhYkluZm8uaW5zdGFuY2UuX19pZF9fO1xuICAgICAgICBjb25zdCBpbnN0YW5jZSA9IHByZWZhYltpbnN0YW5jZUlEXTtcblxuICAgICAgICBpZiAoaW5zdGFuY2UpIHtcblxuICAgICAgICAgICAgLy8g6YeN6L295bGe5oCnXG4gICAgICAgICAgICBjb25zdCBwcm9wZXJ0eU92ZXJyaWRlcyA9IGluc3RhbmNlLnByb3BlcnR5T3ZlcnJpZGVzO1xuICAgICAgICAgICAgaWYgKHByb3BlcnR5T3ZlcnJpZGVzICYmIEFycmF5LmlzQXJyYXkocHJvcGVydHlPdmVycmlkZXMpICYmIHByb3BlcnR5T3ZlcnJpZGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHByb3BlcnR5T3ZlcnJpZGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5T3ZlcnJpZGUgPSBwcm9wZXJ0eU92ZXJyaWRlc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgb3ZlcnJpZGUgPSBwcmVmYWJbcHJvcGVydHlPdmVycmlkZS5fX2lkX19dO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChvdmVycmlkZSAmJiBvdmVycmlkZS5fX3R5cGVfXyA9PSBcIkNDUHJvcGVydHlPdmVycmlkZUluZm9cIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvcGVydHlQYXRoID0gb3ZlcnJpZGUucHJvcGVydHlQYXRoIGFzIHN0cmluZ1tdO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBvdmVycmlkZS52YWx1ZTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByb3BlcnR5UGF0aCAmJiBwcm9wZXJ0eVBhdGgubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGluZGV4ID0gcHJvcGVydHlQYXRoLmZpbmRJbmRleChlID0+IGUgPT0gXCJfbmFtZVwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggIT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmFtZSA9IHZhbHVlO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgbyBpbiBzaG9ydE5hbWVzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobmFtZS5zdGFydHNXaXRoKFwiX1wiICsgbykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc1NhbWVUeXBlKHR5cGVzLCBuYW1lKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBuYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBzaG9ydE5hbWVzW29dXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIOaJqeWxleiKgueCuVxuICAgICAgICAgICAgY29uc3QgbW91bnRlZENoaWxkcmVuID0gaW5zdGFuY2UubW91bnRlZENoaWxkcmVuO1xuICAgICAgICAgICAgaWYgKG1vdW50ZWRDaGlsZHJlbiAmJiBBcnJheS5pc0FycmF5KG1vdW50ZWRDaGlsZHJlbikgJiYgbW91bnRlZENoaWxkcmVuLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vdW50ZWRDaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjaGlsZCA9IG1vdW50ZWRDaGlsZHJlbltpXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2hpbGRJbmZvID0gcHJlZmFiW2NoaWxkLl9faWRfX107XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVzID0gY2hpbGRJbmZvLm5vZGVzO1xuICAgICAgICAgICAgICAgICAgICBpZiAobm9kZXMgJiYgQXJyYXkuaXNBcnJheShub2RlcykgJiYgbm9kZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBub2Rlcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBub2Rlc1tqXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBub2RlSW5mbyA9IHByZWZhYltub2RlLl9faWRfX107XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG5vZGVJbmZvLl9fdHlwZV9fID09IFwiY2MuTm9kZVwiKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g6K+05piO5pivQmFzZVZpZXfmiJbogIVCYXNlVmlld0NvbXBvbmVudFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDku5bku6zkvJrlnKjoh6rlt7HnmoTnsbvph4zpnaLmt7vliqDmiJDlkZjlj5jph49cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xhc3NfbmFtZSA9IGF3YWl0IGhhc0NoaWxkT2ZCYXNlVmlld09yQmFzZVZpZXdDb21wb25lbnQobm9kZUluZm8sIHByZWZhYiwgYWxsQ29tcG9uZW50cyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjbGFzc19uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGVjayhjbGFzc19uYW1lLCBub2RlSW5mbyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRyYXZlcnNlUHJlZmFiTm9kZShub2RlSW5mbywgcHJlZmFiLCB0eXBlcywgYWxsQ29tcG9uZW50cyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoIW5vZGUuX25hbWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIOWmguaenOaYr+iKgueCue+8jOWImemcgOimgemBjeWOhuiKgueCuVxuICAgIGlmIChub2RlLl9uYW1lLnN0YXJ0c1dpdGgoJ18nKSkge1xuICAgICAgICBjb25zdCBjb21wb25lbnRzID0gbm9kZS5fY29tcG9uZW50cztcbiAgICAgICAgY29uc3QgbmFtZSA9IG5vZGUuX25hbWUgPz8gXCJcIjtcbiAgICAgICAgbGV0IGZpbmQgPSBmYWxzZTtcblxuICAgICAgICBpZiAobm9kZS5fbmFtZS5zdGFydHNXaXRoKFwiX25vZFwiKSkge1xuICAgICAgICAgICAgdHlwZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgbmFtZTogbm9kZS5fbmFtZSxcbiAgICAgICAgICAgICAgICB0eXBlOiBcImNjLk5vZGVcIlxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGZpbmQgPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFmaW5kKSB7XG4gICAgICAgICAgICAvLyDlpoLmnpzmmK/nlKjnn63lkI3np7DlvIDlpLTvvIzliJnor7TmmI7miJDlkZjlj5jph4/opoHnlKjlr7nlupTnmoTnu4Tku7bnsbvlnotcbiAgICAgICAgICAgIGZvciAoY29uc3QgbyBpbiBzaG9ydE5hbWVzKSB7XG4gICAgICAgICAgICAgICAgaWYgKG5hbWUuc3RhcnRzV2l0aChcIl9cIiArIG8pKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBJbmZvSUQgPSBjb21wb25lbnRzLmZpbmQoKGNvbXA6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcEluZm8gPSBwcmVmYWJbY29tcC5fX2lkX19dO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNvbXBJbmZvLl9fdHlwZV9fID09IHNob3J0TmFtZXNbb107XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChjb21wSW5mb0lEKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wSW5mbyA9IHByZWZhYltjb21wSW5mb0lELl9faWRfX107XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29tcEluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc1NhbWVUeXBlKHR5cGVzLCBub2RlLl9uYW1lKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLl9uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb21wSW5mby5fX3R5cGVfX1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFmaW5kKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGNvbXAgb2YgY29tcG9uZW50cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBJbmZvID0gcHJlZmFiW2NvbXAuX19pZF9fXTtcblxuICAgICAgICAgICAgICAgIC8vIOm7mOiupOS4jeWPllVJVHJhbnNmb3Jt5ZKMV2lkZ2V0XG4gICAgICAgICAgICAgICAgaWYgKGNvbXBJbmZvLl9fdHlwZV9fICE9IFwiY2MuVUlUcmFuc2Zvcm1cIiAmJiBjb21wSW5mby5fX3R5cGVfXyAhPSBcImNjLldpZGdldFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGlzU2FtZVR5cGUodHlwZXMsIG5vZGUuX25hbWUpO1xuXG4gICAgICAgICAgICAgICAgICAgIHR5cGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogbm9kZS5fbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IGNvbXBJbmZvLl9fdHlwZV9fXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIGZpbmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAvLyDlj6rlj5bnrKzkuIDkuKpcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKG5vZGUuX2NoaWxkcmVuICYmIEFycmF5LmlzQXJyYXkobm9kZS5fY2hpbGRyZW4pICYmIG5vZGUuX2NoaWxkcmVuLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBub2RlLl9jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgY2hpbGQgPSBub2RlLl9jaGlsZHJlbltpXTtcblxuICAgICAgICAgICAgY29uc3QgY2hpbGRJbmZvID0gcHJlZmFiW2NoaWxkLl9faWRfX107XG4gICAgICAgICAgICBpZiAoY2hpbGRJbmZvLl9fdHlwZV9fID09IFwiY2MuTm9kZVwiKSB7XG5cbiAgICAgICAgICAgICAgICAvLyDor7TmmI7mmK9CYXNlVmlld+aIluiAhUJhc2VWaWV3Q29tcG9uZW50XG4gICAgICAgICAgICAgICAgLy8g5LuW5Lus5Lya5Zyo6Ieq5bex55qE57G76YeM6Z2i5re75Yqg5oiQ5ZGY5Y+Y6YePXG4gICAgICAgICAgICAgICAgY29uc3QgY2xhc3NfbmFtZSA9IGF3YWl0IGhhc0NoaWxkT2ZCYXNlVmlld09yQmFzZVZpZXdDb21wb25lbnQoY2hpbGRJbmZvLCBwcmVmYWIsIGFsbENvbXBvbmVudHMpO1xuICAgICAgICAgICAgICAgIGlmIChjbGFzc19uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIGNoZWNrKGNsYXNzX25hbWUsIGNoaWxkSW5mbyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGF3YWl0IHRyYXZlcnNlUHJlZmFiTm9kZShjaGlsZEluZm8sIHByZWZhYiwgdHlwZXMsIGFsbENvbXBvbmVudHMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBoYXNDaGlsZE9mQmFzZVZpZXdPckJhc2VWaWV3Q29tcG9uZW50KG5vZGU6IGFueSwgcHJlZmFiOiBhbnksIGFsbENvbXBvbmVudHM6IGFueVtdKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBpZiAoIW5vZGUpIHJldHVybiBcIlwiO1xuICAgIGNvbnN0IGNvbXBvbmVudHMgPSBub2RlLl9jb21wb25lbnRzO1xuXG4gICAgaWYgKCFjb21wb25lbnRzIHx8IGNvbXBvbmVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cblxuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBjb21wb25lbnRzLmxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICBjb25zdCBjb21wID0gY29tcG9uZW50c1tpbmRleF07XG4gICAgICAgIGNvbnN0IGNvbXBJbmZvID0gcHJlZmFiW2NvbXAuX19pZF9fXTtcblxuICAgICAgICBpZiAoY29tcEluZm8gJiYgKGNvbXBJbmZvLl9fdHlwZV9fID09PSBcIkJhc2VWaWV3XCIgfHwgY29tcEluZm8uX190eXBlX18gPT09IFwiQmFzZVZpZXdDb21wb25lbnRcIikpIHtcbiAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8g5aaC5p6c5pivVVVJRO+8jOWImemcgOimgeWkhOeQhlxuICAgICAgICBpZiAoRWRpdG9yLlV0aWxzLlVVSUQuaXNVVUlEKGNvbXBJbmZvLl9fdHlwZV9fKSkge1xuICAgICAgICAgICAgY29uc3QgY29tcG9uZW50SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWNvbXBvbmVudCcsXG4gICAgICAgICAgICAgICAgRWRpdG9yLlV0aWxzLlVVSUQuZGVjb21wcmVzc1VVSUQoY29tcEluZm8uX190eXBlX18pXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICBpZiAoIWNvbXBvbmVudEluZm8pIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmaW5kID0gYWxsQ29tcG9uZW50cy5maW5kKGUgPT4gZS5jaWQgPT0gY29tcEluZm8uX190eXBlX18pO1xuICAgICAgICAgICAgICAgIGlmICghZmluZCkgY29udGludWU7XG4gICAgICAgICAgICAgICAgY29uc3QgaGFzQXNzZXRJZCA9IGZpbmQgJiYgZmluZC5hc3NldFV1aWQ7XG4gICAgICAgICAgICAgICAgaWYgKCFoYXNBc3NldElkKSBjb250aW51ZTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBoYXNBc3NldElkKTtcblxuICAgICAgICAgICAgICAgIGlmIChhc3NldEluZm8/LmZpbGUgJiYgYXNzZXRJbmZvLmZpbGUuZW5kc1dpdGgoJy50cycpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOWIm+W7uumhueebrlxuICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9qZWN0ID0gbmV3IFByb2plY3QoKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyDmt7vliqDmupDmlofku7ZcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc291cmNlRmlsZSA9IHByb2plY3QuYWRkU291cmNlRmlsZUF0UGF0aChhc3NldEluZm8uZmlsZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xhc3NzID0gc291cmNlRmlsZS5nZXRDbGFzc2VzKCk7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2xhc3NzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjbGFzc0RlY2xhcmF0aW9uID0gY2xhc3NzW2ldO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNsYXNzRGVjbGFyYXRpb24uZ2V0TmFtZSgpICE9PSBmaW5kLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXh0ZW5kc05vZGUgPSBjbGFzc0RlY2xhcmF0aW9uLmdldEV4dGVuZHMoKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGV4dGVuZHNOb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXh0ZW5kTmFtZSA9IGV4dGVuZHNOb2RlLmdldFRleHQoKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWIm+W7uuS4gOS4quaWsOeahOajgOafpVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWboOS4uuWvueS6jumihOWItuS9k+adpeivtO+8jOavj+S4gOS4qumihOWItuS9k+WGhemDqOmDveaYr+S4gOS4qiBCYXNlVmlld0NvbXBvbmVudOaIluiAhSBCYXNlVmlld1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOmHjOmdoueahOWtkOiKgueCueWQjeWtl+mDveaYr+S4gOaooeS4gOagt1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOW/hemhu+inhOmBv+i/meS4qumXrumimFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWcqFJ1bnRpbWUg5LiL77yM6K+l6Zeu6aKY5LiN5Lya5Ye6546wXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGV4dGVuZE5hbWUuc3RhcnRzV2l0aChcIkJhc2VWaWV3XCIpIHx8IGV4dGVuZE5hbWUuc3RhcnRzV2l0aChcIkJhc2VWaWV3Q29tcG9uZW50XCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBoYXNBc3NldElkO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGNvbXBvbmVudEluZm8pIHtcblxuICAgICAgICAgICAgICAgIC8vIOS4jeW6lOivpei1sOWIsOi/memHjOadpVxuICAgICAgICAgICAgICAgIGVycm9yKFwi5LiN5bqU6K+l6LWw5Yiw6L+Z6YeM5p2lIGNvbXBvbmVudEluZm9cIiwgY29tcG9uZW50SW5mbyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gXCJcIjtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZmluZE5vZGVzV2l0aFVuZGVyc2NvcmVQcmVmaXgoYXNzZXRJbmZvOiBBc3NldEluZm8gJiB7IHByZWZhYjogeyBhc3NldFV1aWQ6IHN0cmluZyB9IH0pIHtcbiAgICB0cnkge1xuXG4gICAgICAgIGNvbnN0IHR5cGVzOiB7IG5hbWU6IHN0cmluZywgdHlwZTogc3RyaW5nIH1bXSA9IFtdO1xuICAgICAgICBjb25zdCBhbGxDb21wb25lbnRzID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktY29tcG9uZW50cycpO1xuICAgICAgICBjb25zdCBub2RlSW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCBhc3NldEluZm8ucHJlZmFiLmFzc2V0VXVpZCk7XG5cbiAgICAgICAgaWYgKG5vZGVJbmZvICYmIG5vZGVJbmZvLmZpbGUpIHtcbiAgICAgICAgICAgIGNvbnN0IHByZWZhYkNvbnRlbnQgPSByZWFkRmlsZVN5bmMobm9kZUluZm8hLmZpbGUsICd1dGYtOCcpO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBwcmVmYWIgPSBKU09OLnBhcnNlKHByZWZhYkNvbnRlbnQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBwcmVmYWIuZmluZCgoaXRlbTogYW55KSA9PiBpdGVtLl9uYW1lID09IGFzc2V0SW5mby5uYW1lICYmIGl0ZW0uX190eXBlX18gPT0gXCJjYy5Ob2RlXCIpO1xuICAgICAgICAgICAgICAgIGlmIChub2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRyYXZlcnNlUHJlZmFiTm9kZShub2RlLCBwcmVmYWIsIHR5cGVzLCBhbGxDb21wb25lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHR5cGVzO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHBhcnNlIHByZWZhYiBjb250ZW50OicsIGVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHRyYXZlcnNlIG5vZGVzOicsIGVycm9yKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRvck1lbWJlcnMoZmlsZVBhdGg6IHN0cmluZywgdHlwZXM6IHsgbmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcgfVtdLCBzY29wZTogU2NvcGUpIHtcbiAgICAvLyDliJvlu7rpobnnm65cbiAgICBjb25zdCBwcm9qZWN0ID0gbmV3IFByb2plY3QoKTtcblxuICAgIC8vIOa3u+WKoOa6kOaWh+S7tlxuICAgIGNvbnN0IHNvdXJjZUZpbGUgPSBwcm9qZWN0LmFkZFNvdXJjZUZpbGVBdFBhdGgoZmlsZVBhdGgpO1xuXG4gICAgLy8g6I635Y+W5omA5pyJ57G75aOw5piOXG4gICAgY29uc3QgY2xhc3NlcyA9IHNvdXJjZUZpbGUuZ2V0Q2xhc3NlcygpO1xuXG4gICAgLy8g6YGN5Y6G5q+P5Liq57G7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjbGFzc2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGNsYXNzRGVjbGFyYXRpb24gPSBjbGFzc2VzW2ldO1xuXG4gICAgICAgIC8vIOWFiOa3u+WKoOaWsOeahOWxnuaAp1xuICAgICAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgdHlwZXMubGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgICAgICBjb25zdCB0eXBlRGVmID0gdHlwZXNbaW5kZXhdO1xuICAgICAgICAgICAgaWYgKCFjbGFzc0RlY2xhcmF0aW9uLmdldFByb3BlcnR5KHR5cGVEZWYubmFtZSkpIHtcbiAgICAgICAgICAgICAgICAvLyDmo4Dmn6XmmK/lkKbmmK/oh6rlrprkuYnnu4Tku7bvvIjpnZ5jY+W8gOWktO+8iVxuICAgICAgICAgICAgICAgIGNvbnN0IGlzQ3VzdG9tQ29tcG9uZW50ID0gIXR5cGVEZWYudHlwZS5zdGFydHNXaXRoKCdjYy4nKTtcbiAgICAgICAgICAgICAgICBsZXQgdHlwZU5hbWUgPSB0eXBlRGVmLnR5cGU7XG4gICAgICAgICAgICAgICAgbGV0IG1vZHVsZVBhdGggPSAnY2MnO1xuXG4gICAgICAgICAgICAgICAgaWYgKGlzQ3VzdG9tQ29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHV1aWQgPSBFZGl0b3IuVXRpbHMuVVVJRC5kZWNvbXByZXNzVVVJRCh0eXBlRGVmLnR5cGUpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhc3NldEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgdXVpZCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGFzc2V0SW5mbyAmJiBhc3NldEluZm8uZmlsZSkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDor7vlj5bnsbvmib7liLDlr7zlh7pcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1c3RvbUNvbXBvbmVudFByb2plY3QgPSBuZXcgUHJvamVjdCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VzdG9tQ29tcG9uZW50RmlsZSA9IGN1c3RvbUNvbXBvbmVudFByb2plY3QuYWRkU291cmNlRmlsZUF0UGF0aChhc3NldEluZm8uZmlsZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOiOt+WPluaWh+S7tuS4reaJgOacieWvvOWHuueahOexu1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhwb3J0ZWRDbGFzc2VzID0gY3VzdG9tQ29tcG9uZW50RmlsZS5nZXRDbGFzc2VzKCkuZmlsdGVyKGMgPT4gYy5pc0V4cG9ydGVkKCkpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDlpoLmnpzmnInlr7zlh7rnmoTnsbvvvIzkvb/nlKjnrKzkuIDkuKrnsbvnmoTlkI3np7BcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChleHBvcnRlZENsYXNzZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVOYW1lID0gZXhwb3J0ZWRDbGFzc2VzWzBdLmdldE5hbWUoKSB8fCBhc3NldEluZm8ubmFtZTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOS8mOWFiOS9v+eUqCB0c2NvbmZpZyBwYXRocyDliKvlkI3vvIzlkKbliJnkvb/nlKjnm7jlr7not6/lvoRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVQYXRoID0gZ2V0TW9kdWxlU3BlY2lmaWVyKGZpbGVQYXRoLCBhc3NldEluZm8uZmlsZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c5rKh5pyJ5om+5Yiw5a+85Ye655qE57G777yM5L2/55So5paH5Lu25ZCNXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBObyBleHBvcnRlZCBjbGFzcyBmb3VuZCBpbiAke2Fzc2V0SW5mby5maWxlfSwgdXNpbmcgYXNzZXQgbmFtZSBpbnN0ZWFkYCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZU5hbWUgPSBhc3NldEluZm8ubmFtZTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOS8mOWFiOS9v+eUqCB0c2NvbmZpZyBwYXRocyDliKvlkI3vvIzlkKbliJnkvb/nlKjnm7jlr7not6/lvoRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVQYXRoID0gZ2V0TW9kdWxlU3BlY2lmaWVyKGZpbGVQYXRoLCBhc3NldEluZm8uZmlsZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBjY+e7hOS7tuWPqumcgOimgee7hOS7tuWQjVxuICAgICAgICAgICAgICAgICAgICB0eXBlTmFtZSA9IHR5cGVEZWYudHlwZS5zcGxpdCgnLicpLnBvcCgpIHx8ICcnO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNsYXNzRGVjbGFyYXRpb24uaW5zZXJ0UHJvcGVydHkoMCwge1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiB0eXBlRGVmLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHR5cGVOYW1lLFxuICAgICAgICAgICAgICAgICAgICBpbml0aWFsaXplcjogXCJudWxsIVwiLFxuICAgICAgICAgICAgICAgICAgICBkZWNvcmF0b3JzOiBbe1xuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogJ3Byb3BlcnR5JyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFyZ3VtZW50czogW2B7dHlwZTogJHt0eXBlTmFtZX19YF1cbiAgICAgICAgICAgICAgICAgICAgfV0sXG4gICAgICAgICAgICAgICAgICAgIGlzUmVhZG9ubHk6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlOiBzY29wZVxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgLy8g5re75Yqg5a+85YWlXG4gICAgICAgICAgICAgICAgaWYgKGlzQ3VzdG9tQ29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOa3u+WKoOiHquWumuS5iee7hOS7tueahOWvvOWFpVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBleGlzdGluZ0ltcG9ydCA9IHNvdXJjZUZpbGUuZ2V0SW1wb3J0RGVjbGFyYXRpb24oaSA9PlxuICAgICAgICAgICAgICAgICAgICAgICAgaS5nZXRNb2R1bGVTcGVjaWZpZXJWYWx1ZSgpID09PSBtb2R1bGVQYXRoXG4gICAgICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGV4aXN0aW5nSW1wb3J0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuYW1lZEltcG9ydHMgPSBleGlzdGluZ0ltcG9ydC5nZXROYW1lZEltcG9ydHMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbmFtZWRJbXBvcnRzLnNvbWUoaW1wID0+IGltcC5nZXROYW1lKCkgPT09IHR5cGVOYW1lKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nSW1wb3J0LmFkZE5hbWVkSW1wb3J0KHR5cGVOYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZUZpbGUuYWRkSW1wb3J0RGVjbGFyYXRpb24oe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVkSW1wb3J0czogW3R5cGVOYW1lXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVTcGVjaWZpZXI6IG1vZHVsZVBhdGhcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g5re75YqgIGNjIOe7hOS7tuWvvOWFpVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjY0ltcG9ydCA9IHNvdXJjZUZpbGUuZ2V0SW1wb3J0RGVjbGFyYXRpb24oaSA9PlxuICAgICAgICAgICAgICAgICAgICAgICAgaS5nZXRNb2R1bGVTcGVjaWZpZXJWYWx1ZSgpID09PSAnY2MnXG4gICAgICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGNjSW1wb3J0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuYW1lZEltcG9ydHMgPSBjY0ltcG9ydC5nZXROYW1lZEltcG9ydHMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbmFtZWRJbXBvcnRzLnNvbWUoaW1wID0+IGltcC5nZXROYW1lKCkgPT09IHR5cGVOYW1lKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNjSW1wb3J0LmFkZE5hbWVkSW1wb3J0KHR5cGVOYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZUZpbGUuYWRkSW1wb3J0RGVjbGFyYXRpb24oe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVkSW1wb3J0czogW3R5cGVOYW1lXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVTcGVjaWZpZXI6ICdjYydcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8g6I635Y+W5omA5pyJ56eB5pyJ5bGe5oCnXG4gICAgICAgIGNvbnN0IHByaXZhdGVQcm9wcyA9IGNsYXNzRGVjbGFyYXRpb24uZ2V0UHJvcGVydGllcygpLmZpbHRlcihwcm9wID0+XG4gICAgICAgICAgICBwcm9wLmdldE5hbWUoKS5zdGFydHNXaXRoKCdfJylcbiAgICAgICAgKTtcblxuICAgICAgICAvLyDlpITnkIbnjrDmnInlsZ7mgKdcbiAgICAgICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHByaXZhdGVQcm9wcy5sZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgICAgIGNvbnN0IHByb3AgPSBwcml2YXRlUHJvcHNbaW5kZXhdO1xuXG4gICAgICAgICAgICBjb25zdCBuYW1lID0gcHJvcC5nZXROYW1lKCk7XG4gICAgICAgICAgICBjb25zdCB0eXBlID0gcHJvcC5nZXRUeXBlKCkuZ2V0VGV4dCgpO1xuICAgICAgICAgICAgcHJvcC5zZXRTY29wZShzY29wZSk7XG4gICAgICAgICAgICBjb25zdCB0eXBlRGVmID0gdHlwZXMuZmluZChpdGVtID0+IGl0ZW0ubmFtZSA9PT0gbmFtZSk7XG5cbiAgICAgICAgICAgIGlmICh0eXBlRGVmKSB7XG4gICAgICAgICAgICAgICAgLy8g5pu05paw57G75Z6L5ZKM6KOF6aWw5ZmoXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVEZWYudHlwZSAhPT0gdHlwZSkge1xuICAgICAgICAgICAgICAgICAgICAvLyDmo4Dmn6XmmK/lkKbmmK/oh6rlrprkuYnnu4Tku7ZcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNDdXN0b21Db21wb25lbnQgPSAhdHlwZURlZi50eXBlLnN0YXJ0c1dpdGgoJ2NjLicpO1xuICAgICAgICAgICAgICAgICAgICBsZXQgdHlwZU5hbWUgPSB0eXBlRGVmLnR5cGU7XG4gICAgICAgICAgICAgICAgICAgIGxldCBtb2R1bGVQYXRoID0gJ2NjJztcblxuICAgICAgICAgICAgICAgICAgICBpZiAoaXNDdXN0b21Db21wb25lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHV1aWQgPSBFZGl0b3IuVXRpbHMuVVVJRC5kZWNvbXByZXNzVVVJRCh0eXBlRGVmLnR5cGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIHV1aWQpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXNzZXRJbmZvICYmIGFzc2V0SW5mby5maWxlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g6K+75Y+W57G75om+5Yiw5a+85Ye6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VzdG9tQ29tcG9uZW50UHJvamVjdCA9IG5ldyBQcm9qZWN0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VzdG9tQ29tcG9uZW50RmlsZSA9IGN1c3RvbUNvbXBvbmVudFByb2plY3QuYWRkU291cmNlRmlsZUF0UGF0aChhc3NldEluZm8uZmlsZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDojrflj5bmlofku7bkuK3miYDmnInlr7zlh7rnmoTnsbtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBleHBvcnRlZENsYXNzZXMgPSBjdXN0b21Db21wb25lbnRGaWxlLmdldENsYXNzZXMoKS5maWx0ZXIoYyA9PiBjLmlzRXhwb3J0ZWQoKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlpoLmnpzmnInlr7zlh7rnmoTnsbvvvIzkvb/nlKjnrKzkuIDkuKrnsbvnmoTlkI3np7BcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXhwb3J0ZWRDbGFzc2VzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZU5hbWUgPSBleHBvcnRlZENsYXNzZXNbMF0uZ2V0TmFtZSgpIHx8IGFzc2V0SW5mby5uYW1lO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOS8mOWFiOS9v+eUqCB0c2NvbmZpZyBwYXRocyDliKvlkI3vvIzlkKbliJnkvb/nlKjnm7jlr7not6/lvoRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlUGF0aCA9IGdldE1vZHVsZVNwZWNpZmllcihmaWxlUGF0aCwgYXNzZXRJbmZvLmZpbGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOayoeacieaJvuWIsOWvvOWHuueahOexu++8jOS9v+eUqOaWh+S7tuWQjVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlTmFtZSA9IGFzc2V0SW5mby5uYW1lO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOS8mOWFiOS9v+eUqCB0c2NvbmZpZyBwYXRocyDliKvlkI3vvIzlkKbliJnkvb/nlKjnm7jlr7not6/lvoRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlUGF0aCA9IGdldE1vZHVsZVNwZWNpZmllcihmaWxlUGF0aCwgYXNzZXRJbmZvLmZpbGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNj57uE5Lu25Y+q6ZyA6KaB57uE5Lu25ZCNXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlTmFtZSA9IHR5cGVEZWYudHlwZS5zcGxpdCgnLicpLnBvcCgpIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGVjb3JhdG9ycyA9IHByb3AuZ2V0RGVjb3JhdG9ycygpO1xuICAgICAgICAgICAgICAgICAgICBsZXQgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvcjogRGVjb3JhdG9yIHwgbnVsbCA9IG51bGw7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8g5p+l5om+546w5pyJ55qEIHByb3BlcnR5IOijhemlsOWZqFxuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGRlY29yYXRvciBvZiBkZWNvcmF0b3JzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGVjb3JhdG9yLmdldE5hbWUoKSA9PT0gJ3Byb3BlcnR5Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nUHJvcGVydHlEZWNvcmF0b3IgPSBkZWNvcmF0b3I7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyDmm7TmlrDnsbvlnotcbiAgICAgICAgICAgICAgICAgICAgcHJvcC5zZXRUeXBlKHR5cGVOYW1lKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8g6I635Y+W546w5pyJ6KOF6aWw5Zmo55qE5Y+C5pWw5paH5pysXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhcmdzID0gZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5nZXRBcmd1bWVudHMoKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWwneivleino+aekOeOsOacieWPguaVsFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFyZ1RleHQgPSBhcmdzWzBdLmdldFRleHQoKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOWmguaenOaYr+WvueixoeW9ouW8j+eahOWPguaVsFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhcmdUZXh0LnN0YXJ0c1dpdGgoJ3snKSAmJiBhcmdUZXh0LmVuZHNXaXRoKCd9JykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5o+Q5Y+W5a+56LGh5YaF5a6577yM56e76Zmk5YmN5ZCO55qE6Iqx5ous5Y+3XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG9iamVjdENvbnRlbnRzID0gYXJnVGV4dC5zdWJzdHJpbmcoMSwgYXJnVGV4dC5sZW5ndGggLSAxKS50cmltKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5qOA5p+l5piv5ZCm5pyJ5YW25LuW5bGe5oCnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChvYmplY3RDb250ZW50cy5pbmNsdWRlcygnLCcpIHx8ICFvYmplY3RDb250ZW50cy5pbmNsdWRlcygndHlwZTonKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5p6E5bu65paw55qE5a+56LGh5Y+C5pWw77yM5YyF5ZCr5Y6f5pyJ5bGe5oCn5ZKM5paw55qE57G75Z6LXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgbmV3QXJnID0gJ3snO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlpITnkIblt7LmnInlsZ7mgKdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb3BlcnRpZXMgPSBvYmplY3RDb250ZW50cy5zcGxpdCgnLCcpLm1hcChwID0+IHAudHJpbSgpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHR5cGVJbmRleCA9IHByb3BlcnRpZXMuZmluZEluZGV4KHAgPT4gcC5zdGFydHNXaXRoKCd0eXBlOicpKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVJbmRleCA+PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5pu/5o2i57G75Z6L5bGe5oCnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydGllc1t0eXBlSW5kZXhdID0gYHR5cGU6ICR7dHlwZU5hbWV9YDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5re75Yqg57G75Z6L5bGe5oCnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydGllcy5wdXNoKGB0eXBlOiAke3R5cGVOYW1lfWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXdBcmcgKz0gcHJvcGVydGllcy5qb2luKCcsICcpICsgJ30nO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDmm7TmlrDoo4XppbDlmahcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nUHJvcGVydHlEZWNvcmF0b3IucmVtb3ZlQXJndW1lbnQoMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLmFkZEFyZ3VtZW50KG5ld0FyZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDku4XljIXlkKvnsbvlnovlrprkuYnvvIzmm7TmlrDnsbvlnotcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nUHJvcGVydHlEZWNvcmF0b3IucmVtb3ZlQXJndW1lbnQoMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yLmFkZEFyZ3VtZW50KGB7dHlwZTogJHt0eXBlTmFtZX19YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDpnZ7lr7nosaHlvaLlvI/lj4LmlbDvvIzmm7/mjaLkuLrmlrDlj4LmlbBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5yZW1vdmVBcmd1bWVudCgwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5hZGRBcmd1bWVudChge3R5cGU6ICR7dHlwZU5hbWV9fWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5rKh5pyJ5Y+C5pWw77yM5re75Yqg5Y+C5pWwXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvci5hZGRBcmd1bWVudChge3R5cGU6ICR7dHlwZU5hbWV9fWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5rKh5pyJ5om+5YiwIHByb3BlcnR5IOijhemlsOWZqO+8jOa3u+WKoOaWsOijhemlsOWZqFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvcC5hZGREZWNvcmF0b3Ioe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6ICdwcm9wZXJ0eScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXJndW1lbnRzOiBbYHt0eXBlOiAke3R5cGVOYW1lfX1gXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFwcm9wLmdldEluaXRpYWxpemVyKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3Auc2V0SW5pdGlhbGl6ZXIoJ251bGwnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIOa3u+WKoOWvvOWFpVxuICAgICAgICAgICAgICAgICAgICBpZiAoaXNDdXN0b21Db21wb25lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOa3u+WKoOiHquWumuS5iee7hOS7tueahOWvvOWFpVxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhpc3RpbmdJbXBvcnQgPSBzb3VyY2VGaWxlLmdldEltcG9ydERlY2xhcmF0aW9uKGkgPT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpLmdldE1vZHVsZVNwZWNpZmllclZhbHVlKCkgPT09IG1vZHVsZVBhdGhcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ0ltcG9ydCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5hbWVkSW1wb3J0cyA9IGV4aXN0aW5nSW1wb3J0LmdldE5hbWVkSW1wb3J0cygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbmFtZWRJbXBvcnRzLnNvbWUoaW1wID0+IGltcC5nZXROYW1lKCkgPT09IHR5cGVOYW1lKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ0ltcG9ydC5hZGROYW1lZEltcG9ydCh0eXBlTmFtZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzb3VyY2VGaWxlLmFkZEltcG9ydERlY2xhcmF0aW9uKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZWRJbXBvcnRzOiBbdHlwZU5hbWVdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2R1bGVTcGVjaWZpZXI6IG1vZHVsZVBhdGhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOa3u+WKoCBjYyDnu4Tku7blr7zlhaVcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNjSW1wb3J0ID0gc291cmNlRmlsZS5nZXRJbXBvcnREZWNsYXJhdGlvbihpID0+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaS5nZXRNb2R1bGVTcGVjaWZpZXJWYWx1ZSgpID09PSAnY2MnXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2NJbXBvcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuYW1lZEltcG9ydHMgPSBjY0ltcG9ydC5nZXROYW1lZEltcG9ydHMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW5hbWVkSW1wb3J0cy5zb21lKGltcCA9PiBpbXAuZ2V0TmFtZSgpID09PSB0eXBlTmFtZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2NJbXBvcnQuYWRkTmFtZWRJbXBvcnQodHlwZU5hbWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlRmlsZS5hZGRJbXBvcnREZWNsYXJhdGlvbih7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWVkSW1wb3J0czogW3R5cGVOYW1lXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kdWxlU3BlY2lmaWVyOiAnY2MnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyDlhYjnnIvnnIvmmK/kuI3mmK9wcm9wZXJ0eeijhemlsOWZqFxuICAgICAgICAgICAgICAgIGNvbnN0IGRlY29yYXRvcnMgPSBwcm9wLmdldERlY29yYXRvcnMoKTtcbiAgICAgICAgICAgICAgICBsZXQgZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvcjogRGVjb3JhdG9yIHwgbnVsbCA9IG51bGw7XG5cbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGRlY29yYXRvciBvZiBkZWNvcmF0b3JzKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkZWNvcmF0b3IuZ2V0TmFtZSgpID09PSAncHJvcGVydHknKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Byb3BlcnR5RGVjb3JhdG9yID0gZGVjb3JhdG9yO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoZXhpc3RpbmdQcm9wZXJ0eURlY29yYXRvcikge1xuICAgICAgICAgICAgICAgICAgICAvLyDmo4Dmn6Xoo4XppbDlmajlj4LmlbDkuK3mmK/lkKbljIXlkKsgdXNlckRhdGFcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYXJncyA9IGV4aXN0aW5nUHJvcGVydHlEZWNvcmF0b3IuZ2V0QXJndW1lbnRzKCk7XG4gICAgICAgICAgICAgICAgICAgIGxldCBoYXNVc2VyRGF0YSA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFyZ1RleHQgPSBhcmdzWzBdLmdldFRleHQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOajgOafpeaYr+WQpuWMheWQqyB1c2VyRGF0YSDlj4LmlbBcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhcmdUZXh0LmluY2x1ZGVzKCd1c2VyRGF0YScpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFzVXNlckRhdGEgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c5rKh5pyJIHVzZXJEYXRhIOWPguaVsO+8jOaJjeenu+mZpOWxnuaAp1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWhhc1VzZXJEYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wLnJlbW92ZSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIC8vIOS/neWtmOS/ruaUuVxuICAgIHByb2plY3Quc2F2ZVN5bmMoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG9uUm9vdE1lbnUoYXNzZXRJbmZvOiBBc3NldEluZm8gJiB7IGNvbXBvbmVudHM6IGFueVtdLCBwcmVmYWI6IHsgYXNzZXRVdWlkOiBzdHJpbmcgfSB9KSB7XG4gICAgcmV0dXJuIFtcbiAgICAgICAge1xuICAgICAgICAgICAgbGFiZWw6ICdpMThuOmdhbWUtZnJhbWV3b3JrLmhpZXJhcmNoeS5tZW51LnJvb3RNZW51JyxcbiAgICAgICAgICAgIGFzeW5jIGNsaWNrKCkge1xuICAgICAgICAgICAgICAgIGlmICghYXNzZXRJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgIEVkaXRvci5EaWFsb2cuaW5mbygnaTE4bjpnYW1lLWZyYW1ld29yay5oaWVyYXJjaHkuZXJyb3Iubm9Bc3NldEluZm8nKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIOmBjeWOhuiKgueCueagkeafpeaJvuW4puS4i+WIkue6v+eahOiKgueCueWSjOWxnuaAp1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0eXBlcyA9IGF3YWl0IGZpbmROb2Rlc1dpdGhVbmRlcnNjb3JlUHJlZml4KGFzc2V0SW5mbyk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8g5aSE55CG57uE5Lu25L+h5oGvXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBhc3NldEluZm8uY29tcG9uZW50cztcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjb21wb25lbnRzIHx8IGNvbXBvbmVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBsZXQgaGFzQmFzZVZpZXcgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGNvbXBvbmVudHMubGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wb25lbnQgPSBjb21wb25lbnRzW2luZGV4XTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8g6I635Y+W57uE5Lu26K+m57uG5L+h5oGvXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wb25lbnRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktY29tcG9uZW50JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnQudmFsdWUgIC8vIOi/memHjOeahCB2YWx1ZSDlsLHmmK/nu4Tku7bnmoQgVVVJRFxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBvbmVudEluZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBiYXNlVmlldyA9IGNvbXBvbmVudEluZm8uZXh0ZW5kcz8uZmluZChpdGVtID0+IGl0ZW0uc3RhcnRzV2l0aChcIkJhc2VWaWV3XCIpIHx8IGl0ZW0uc3RhcnRzV2l0aChcIkJhc2VWaWV3Q29tcG9uZW50XCIpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYmFzZVZpZXcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFzQmFzZVZpZXcgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDojrflj5botYTmupDkv6Hmga9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdXVpZCA9IEVkaXRvci5VdGlscy5VVUlELmRlY29tcHJlc3NVVUlEKGNvbXBvbmVudEluZm8uY2lkISk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LWluZm8nLCB1dWlkKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXNzZXRJbmZvICYmIGFzc2V0SW5mby5maWxlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnZW5lcmF0b3JNZW1iZXJzKGFzc2V0SW5mby5maWxlLCB0eXBlcyA/PyBbXSwgU2NvcGUuUHJpdmF0ZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIEVkaXRvci5EaWFsb2cuaW5mbygn5p6E6YCg5oiQ5ZGY5Ye95pWw5oiQ5YqfJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoIWhhc0Jhc2VWaWV3KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBFZGl0b3IuRGlhbG9nLmVycm9yKEVkaXRvci5JMThuLnQoJ2dhbWUtZnJhbWV3b3JrLmhpZXJhcmNoeS5lcnJvci5ub0Jhc2VWaWV3JykpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcblxuICAgICAgICB7XG4gICAgICAgICAgICBsYWJlbDogJ2kxOG46Z2FtZS1mcmFtZXdvcmsuaGllcmFyY2h5Lm1lbnUucHVibGljTWVudScsXG4gICAgICAgICAgICBhc3luYyBjbGljaygpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgICAgICBFZGl0b3IuRGlhbG9nLmluZm8oJ2kxOG46Z2FtZS1mcmFtZXdvcmsuaGllcmFyY2h5LmVycm9yLm5vQXNzZXRJbmZvJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgICAgICAvLyDpgY3ljoboioLngrnmoJHmn6Xmib7luKbkuIvliJLnur/nmoToioLngrnlkozlsZ7mgKdcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHlwZXMgPSBhd2FpdCBmaW5kTm9kZXNXaXRoVW5kZXJzY29yZVByZWZpeChhc3NldEluZm8pO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIOWkhOeQhue7hOS7tuS/oeaBr1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21wb25lbnRzID0gYXNzZXRJbmZvLmNvbXBvbmVudHM7XG4gICAgICAgICAgICAgICAgICAgIGlmICghY29tcG9uZW50cyB8fCBjb21wb25lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgbGV0IGhhc0Jhc2VWaWV3ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBjb21wb25lbnRzLmxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gY29tcG9uZW50c1tpbmRleF07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOiOt+WPlue7hOS7tuivpue7huS/oeaBr1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcG9uZW50SW5mbyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LWNvbXBvbmVudCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50LnZhbHVlICAvLyDov5nph4znmoQgdmFsdWUg5bCx5piv57uE5Lu255qEIFVVSURcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wb25lbnRJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYmFzZVZpZXcgPSBjb21wb25lbnRJbmZvLmV4dGVuZHM/LmZpbmQoaXRlbSA9PiBpdGVtLnN0YXJ0c1dpdGgoXCJCYXNlVmlld1wiKSB8fCBpdGVtLnN0YXJ0c1dpdGgoXCJCYXNlVmlld0NvbXBvbmVudFwiKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGJhc2VWaWV3KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhc0Jhc2VWaWV3ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g6I635Y+W6LWE5rqQ5L+h5oGvXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHV1aWQgPSBFZGl0b3IuVXRpbHMuVVVJRC5kZWNvbXByZXNzVVVJRChjb21wb25lbnRJbmZvLmNpZCEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhc3NldEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgdXVpZCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFzc2V0SW5mbyAmJiBhc3NldEluZm8uZmlsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2VuZXJhdG9yTWVtYmVycyhhc3NldEluZm8uZmlsZSwgdHlwZXMgPz8gW10sIFNjb3BlLlB1YmxpYyk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIEVkaXRvci5EaWFsb2cuaW5mbygn5p6E6YCg5oiQ5ZGY5Ye95pWw5oiQ5YqfJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoIWhhc0Jhc2VWaWV3KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBFZGl0b3IuRGlhbG9nLmVycm9yKEVkaXRvci5JMThuLnQoJ2dhbWUtZnJhbWV3b3JrLmhpZXJhcmNoeS5lcnJvci5ub0Jhc2VWaWV3JykpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICBdO1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIG9uTm9kZU1lbnUobm9kZTogQXNzZXRJbmZvKSB7XG4gICAgcmV0dXJuIFtcbiAgICAgICAge1xuICAgICAgICAgICAgbGFiZWw6ICdpMThuOmdhbWUtZnJhbWV3b3JrLmhpZXJhcmNoeS5tZW51Lm5vZGVNZW51JyxcbiAgICAgICAgICAgIGFzeW5jIGNsaWNrKCkge1xuXG4gICAgICAgICAgICAgICAgaWYgKCFub2RlIHx8ICFub2RlLnV1aWQgfHwgbm9kZS50eXBlICE9PSBcImNjLk5vZGVcIikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgRWRpdG9yLlBhbmVsLm9wZW4oJ2dhbWUtZnJhbWV3b3JrLnNldC1uYW1lJywgbm9kZS51dWlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICBdO1xufSJdfQ==