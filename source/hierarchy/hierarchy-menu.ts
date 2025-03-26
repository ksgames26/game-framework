import { AssetInfo } from "@cocos/creator-types/editor/packages/asset-db/@types/public";
import { readFileSync } from "fs";
import path from "path";
import { Decorator, Project, Scope } from "ts-morph";

const shortNames: Record<string, string> = {
    // UI 组件
    'lab': 'cc.Label',                // 文本
    'btn': 'cc.Button',               // 按钮
    'spr': 'cc.Sprite',               // 精灵
    'scr': 'cc.ScrollView',           // 滚动视图
    'lay': 'cc.Layout',               // 布局
    'tog': 'cc.Toggle',               // 开关
    'edt': 'cc.EditBox',              // 输入框
    'rtx': 'cc.RichText',             // 富文本
    'pgv': 'cc.PageView',             // 页面视图
    'prg': 'cc.ProgressBar',          // 进度条
    'sld': 'cc.Slider',               // 滑动器
    'msk': 'cc.Mask',                 // 遮罩
    'wgt': 'cc.Widget',               // 适配组件
    'uit': 'cc.UITransform',          // UI变换

    // 多媒体组件
    'ani': 'cc.Animation',            // 动画
    'aud': 'cc.AudioSource',          // 音频
    'vid': 'cc.VideoPlayer',          // 视频
    'wbv': 'cc.WebView',              // 网页视图

    // 渲染相关
    'cam': 'cc.Camera',               // 相机
    'gfx': 'cc.Graphics',             // 图形
    'pts': 'cc.ParticleSystem',       // 粒子系统
    'lit': 'cc.LightComponent',       // 灯光
    'mdl': 'cc.ModelComponent',       // 模型

    // 动画相关
    'skl': 'cc.Skeleton',             // 骨骼
    'ast': 'cc.AnimationState',       // 动画状态
    'acl': 'cc.AnimationClip',        // 动画片段
    'anc': 'cc.AnimationController',  // 动画控制器

    // 其他
    'cvs': 'cc.Canvas',               // 画布
    'sfa': 'cc.SafeArea',             // 安全区域
    'bie': 'cc.BlockInputEvents'      // 输入阻挡
};

function isSameType(types: { name: string, type: string }[], name: string) {
    // 检查是否已经存在同名节点
    const existingType = types.find(t => t.name === name);
    if (existingType) {
        Editor.Dialog.error(`警告: 发现重复的节点名称 "${name}"`);
        throw new Error(`警告: 发现重复的节点名称 "${name}"`);
    }
}

function traversePrefabNode(node: any, prefab: any, types: any[]) {
    if (node._name.startsWith('_')) {
        const components = node._components;
        const name = node._name ?? "";
        let find = false;

        // 如果是用短名称开头，则说明成员变量要用对应的组件类型
        for (const o in shortNames) {
            if (name.startsWith("_" + o)) {
                const compInfoID = components.find((comp: any) => {
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
        node._children.forEach((child: any) => {
            const childInfo = prefab[child.__id__];
            if (childInfo.__type__ == "cc.Node") {
                traversePrefabNode(childInfo, prefab, types);
            }
        });
    }
}

async function findNodesWithUnderscorePrefix(assetInfo: AssetInfo & { prefab: { assetUuid: string } }) {
    try {

        const types: { name: string, type: string }[] = [];
        const nodeInfo = await Editor.Message.request('asset-db', 'query-asset-info', assetInfo.prefab.assetUuid);

        if (nodeInfo && nodeInfo.file) {
            const prefabContent = readFileSync(nodeInfo!.file, 'utf-8');
            try {
                const prefab = JSON.parse(prefabContent);
                const node = prefab.find((item: any) => item._name == assetInfo.name && item.__type__ == "cc.Node");
                if (node) {
                    traversePrefabNode(node, prefab, types);
                    return types;
                }
            } catch (error) {
                console.error('Failed to parse prefab content:', error);
            }
        }

    } catch (error) {
        console.error('Failed to traverse nodes:', error);
    }
}

async function generatorMembers(filePath: string, types: { name: string, type: string }[]) {
    // 创建项目
    const project = new Project();

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
                        const customComponentProject = new Project();
                        const customComponentFile = customComponentProject.addSourceFileAtPath(assetInfo.file);
                        
                        // 获取文件中所有导出的类
                        const exportedClasses = customComponentFile.getClasses().filter(c => c.isExported());
                        
                        // 如果有导出的类，使用第一个类的名称
                        if (exportedClasses.length > 0) {
                            typeName = exportedClasses[0].getName() || assetInfo.name;
                            
                            // 只使用文件名作为模块路径（不含扩展名）
                            const fileDir = path.dirname(filePath);
                            const relativePath = path.relative(fileDir, path.dirname(assetInfo.file));
                            const fileNameWithoutExt = path.basename(assetInfo.file, path.extname(assetInfo.file));
                            
                            // 构建合适的导入路径
                            if (relativePath === '') {
                                modulePath = `./${fileNameWithoutExt}`;
                            } else {
                                modulePath = `${relativePath.replace(/\\/g, '/')}/${fileNameWithoutExt}`;
                            }
                            
                            // 如果路径不是以./或../开头，添加./
                            if (!/^\.\.?\//.test(modulePath)) {
                                modulePath = `./${modulePath}`;
                            }
                            
                        } else {
                            // 如果没有找到导出的类，使用文件名
                            console.warn(`No exported class found in ${assetInfo.file}, using asset name instead`);
                            typeName = assetInfo.name;
                            
                            // 计算相对路径同上
                            const fileDir = path.dirname(filePath);
                            const relativePath = path.relative(fileDir, path.dirname(assetInfo.file));
                            const fileNameWithoutExt = path.basename(assetInfo.file, path.extname(assetInfo.file));
                            
                            if (relativePath === '') {
                                modulePath = `./${fileNameWithoutExt}`;
                            } else {
                                modulePath = `${relativePath.replace(/\\/g, '/')}/${fileNameWithoutExt}`;
                            }
                            
                            if (!/^\.\.?\//.test(modulePath)) {
                                modulePath = `./${modulePath}`;
                            }
                        }
                    }
                } else {
                    // cc组件只需要组件名
                    typeName = typeDef.type.split('.').pop() || '';
                }

                classDeclaration.insertProperty(0, {
                    name: typeDef.name,
                    type: typeName,
                    initializer: "null",
                    decorators: [{
                        name: 'property',
                        arguments: [isCustomComponent ? typeName : `{type: ${typeName}}`]
                    }],
                    isReadonly: true,
                    scope: Scope.Private
                });

                // 添加导入
                if (isCustomComponent) {
                    // 添加自定义组件的导入
                    const existingImport = sourceFile.getImportDeclaration(i =>
                        i.getModuleSpecifierValue() === modulePath
                    );

                    if (existingImport) {
                        const namedImports = existingImport.getNamedImports();
                        if (!namedImports.some(imp => imp.getName() === typeName)) {
                            existingImport.addNamedImport(typeName);
                        }
                    } else {
                        sourceFile.addImportDeclaration({
                            namedImports: [typeName],
                            moduleSpecifier: modulePath
                        });
                    }
                } else {
                    // 添加 cc 组件导入
                    const ccImport = sourceFile.getImportDeclaration(i => 
                        i.getModuleSpecifierValue() === 'cc'
                    );
                    
                    if (ccImport) {
                        const namedImports = ccImport.getNamedImports();
                        if (!namedImports.some(imp => imp.getName() === typeName)) {
                            ccImport.addNamedImport(typeName);
                        }
                    } else {
                        sourceFile.addImportDeclaration({
                            namedImports: [typeName],
                            moduleSpecifier: 'cc'
                        });
                    }
                }
            }
        }

        // 获取所有私有属性
        const privateProps = classDeclaration.getProperties().filter(prop =>
            prop.getName().startsWith('_')
        );

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
                            const customComponentProject = new Project();
                            const customComponentFile = customComponentProject.addSourceFileAtPath(assetInfo.file);
                            
                            // 获取文件中所有导出的类
                            const exportedClasses = customComponentFile.getClasses().filter(c => c.isExported());
                            
                            // 如果有导出的类，使用第一个类的名称
                            if (exportedClasses.length > 0) {
                                typeName = exportedClasses[0].getName() || assetInfo.name;
                                
                                // 只使用文件名作为模块路径（不含扩展名）
                                const fileDir = path.dirname(filePath);
                                const relativePath = path.relative(fileDir, path.dirname(assetInfo.file));
                                const fileNameWithoutExt = path.basename(assetInfo.file, path.extname(assetInfo.file));
                                
                                // 构建合适的导入路径
                                if (relativePath === '') {
                                    modulePath = `./${fileNameWithoutExt}`;
                                } else {
                                    modulePath = `${relativePath.replace(/\\/g, '/')}/${fileNameWithoutExt}`;
                                }
                                
                                // 如果路径不是以./或../开头，添加./
                                if (!/^\.\.?\//.test(modulePath)) {
                                    modulePath = `./${modulePath}`;
                                }
                            } else {
                                // 如果没有找到导出的类，使用文件名
                                typeName = assetInfo.name;
                                
                                // 计算相对路径同上
                                const fileDir = path.dirname(filePath);
                                const relativePath = path.relative(fileDir, path.dirname(assetInfo.file));
                                const fileNameWithoutExt = path.basename(assetInfo.file, path.extname(assetInfo.file));
                                
                                if (relativePath === '') {
                                    modulePath = `./${fileNameWithoutExt}`;
                                } else {
                                    modulePath = `${relativePath.replace(/\\/g, '/')}/${fileNameWithoutExt}`;
                                }
                                
                                if (!/^\.\.?\//.test(modulePath)) {
                                    modulePath = `./${modulePath}`;
                                }
                            }
                        }
                    } else {
                        // cc组件只需要组件名
                        typeName = typeDef.type.split('.').pop() || '';
                    }

                    const decorators = prop.getDecorators();
                    let existingPropertyDecorator: Decorator | null = null;
                    
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
                                    } else {
                                        // 添加类型属性
                                        properties.push(`type: ${typeName}`);
                                    }
                                    
                                    newArg += properties.join(', ') + '}';
                                    
                                    // 更新装饰器
                                    existingPropertyDecorator.removeArgument(0);
                                    existingPropertyDecorator.addArgument(newArg);
                                } else {
                                    // 仅包含类型定义，更新类型
                                    existingPropertyDecorator.removeArgument(0);
                                    existingPropertyDecorator.addArgument(isCustomComponent ? typeName : `{type: ${typeName}}`);
                                }
                            } else {
                                // 非对象形式参数，替换为新参数
                                existingPropertyDecorator.removeArgument(0);
                                existingPropertyDecorator.addArgument(isCustomComponent ? typeName : `{type: ${typeName}}`);
                            }
                        } else {
                            // 没有参数，添加参数
                            existingPropertyDecorator.addArgument(isCustomComponent ? typeName : `{type: ${typeName}}`);
                        }
                    } else {
                        // 没有找到 property 装饰器，添加新装饰器
                        prop.addDecorator({
                            name: 'property',
                            arguments: [isCustomComponent ? typeName : `{type: ${typeName}}`]
                        });
                    }

                    if (!prop.getInitializer()) {
                        prop.setInitializer('null');
                    }
                    
                    // 添加导入
                    if (isCustomComponent) {
                        // 添加自定义组件的导入
                        const existingImport = sourceFile.getImportDeclaration(i =>
                            i.getModuleSpecifierValue() === modulePath
                        );

                        if (existingImport) {
                            const namedImports = existingImport.getNamedImports();
                            if (!namedImports.some(imp => imp.getName() === typeName)) {
                                existingImport.addNamedImport(typeName);
                            }
                        } else {
                            sourceFile.addImportDeclaration({
                                namedImports: [typeName],
                                moduleSpecifier: modulePath
                            });
                        }
                    } else {
                        // 添加 cc 组件导入
                        const ccImport = sourceFile.getImportDeclaration(i => 
                            i.getModuleSpecifierValue() === 'cc'
                        );
                        
                        if (ccImport) {
                            const namedImports = ccImport.getNamedImports();
                            if (!namedImports.some(imp => imp.getName() === typeName)) {
                                ccImport.addNamedImport(typeName);
                            }
                        } else {
                            sourceFile.addImportDeclaration({
                                namedImports: [typeName],
                                moduleSpecifier: 'cc'
                            });
                        }
                    }
                }
            } else {
                // 如果在 types 中找不到对应的属性定义，则移除该属性
                prop.remove();
            }
        }
    }

    // 保存修改
    project.saveSync();
}

export function onRootMenu(assetInfo: AssetInfo & { components: any[], prefab: { assetUuid: string } }) {
    return [
        {
            label: 'i18n:game-framework.hierarchy.menu.rootMenu',
            async click() {
                if (!assetInfo) {
                    Editor.Dialog.info('i18n:game-framework.hierarchy.error.noAssetInfo');
                } else {

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
                        const componentInfo = await Editor.Message.request('scene', 'query-component',
                            component.value  // 这里的 value 就是组件的 UUID
                        );

                        if (componentInfo) {
                            const baseView = componentInfo.extends?.find(item => item === "BaseView");
                            if (baseView) {
                                hasBaseView = true;
                                // 获取资源信息
                                const uuid = Editor.Utils.UUID.decompressUUID(componentInfo.cid!);
                                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', uuid);

                                if (assetInfo && assetInfo.file) {
                                    generatorMembers(assetInfo.file, types ?? []);

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
};
