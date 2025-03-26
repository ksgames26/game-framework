import { AssetInfo } from "@cocos/creator-types/editor/packages/asset-db/@types/public";
import { readFileSync } from "fs";
import { Project, Scope } from "ts-morph";

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
                            type: compInfo.__type__ && compInfo.__type__.startsWith('cc.') ?
                                compInfo.__type__.split('.').pop() :
                                compInfo.__type__
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
                        type: compInfo.__type__ && compInfo.__type__.startsWith('cc.') ?
                            compInfo.__type__.split('.').pop() :
                            compInfo.__type__,
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
    classes.forEach(classDeclaration => {
        // 获取类名
        const className = classDeclaration.getName();
        // 获取所有属性声明
        const properties = classDeclaration.getProperties();

        // 过滤出以_开头的属性
        const privateProps = properties.filter(prop => {
            const name = prop.getName();
            return name.startsWith('_');
        });

        // 处理现有的属性
        privateProps.forEach(prop => {
            const name = prop.getName();
            const type = prop.getType().getText();
            const typeDef = types.find(item => item.name == name);

            if (typeDef) {
                // 如果类型定义和属性定义一致，则不输出
                if (typeDef.name == name && typeDef.type == type) {
                    return;
                }

                // 移除所有现有的 property 装饰器
                const decorators = prop.getDecorators();
                decorators.forEach(decorator => {
                    if (decorator.getName() === 'property') {
                        decorator.remove();
                    }
                });

                // 添加新的装饰器和类型
                prop.setType(typeDef.type);
                prop.addDecorator({
                    name: 'property',
                    arguments: [`(${typeDef.type})`]
                });

                // 确保有初始值
                if (!prop.getInitializer()) {
                    prop.setInitializer('null');
                }
            }
        });

        // 检查是否有需要新增的属性
        types.forEach(typeDef => {
            // 如果属性不存在，则新增
            if (!privateProps.some(prop => prop.getName() === typeDef.name)) {

                // 添加新属性
                classDeclaration.insertProperty(0, {
                    name: typeDef.name,
                    type: typeDef.type,
                    initializer: "null",
                    decorators: [{
                        name: 'property',
                        arguments: [`(${typeDef.type})`]
                    }],
                    isReadonly: true,
                    scope: Scope.Private
                });
            }
        });

        // 检查并添加所需的导入
        const neededImports = new Set<string>();
        types.forEach(typeDef => {
            if (typeDef.type !== 'string' &&
                typeDef.type !== 'number' &&
                typeDef.type !== 'boolean') {
                neededImports.add(typeDef.type);
            }
        });

        // 添加缺失的导入
        if (neededImports.size > 0) {
            const existingImport = sourceFile.getImportDeclaration(i =>
                i.getModuleSpecifierValue() === 'cc'
            );

            if (existingImport) {
                // 添加到现有的导入声明中
                const namedImports = existingImport.getNamedImports();
                neededImports.forEach(type => {
                    if (!namedImports.some(imp => imp.getName() === type)) {
                        existingImport.addNamedImport(type);
                    }
                });
            } else {
                // 创建新的导入声明
                sourceFile.addImportDeclaration({
                    namedImports: Array.from(neededImports),
                    moduleSpecifier: 'cc'
                });
            }
        }

        // 保存修改
        project.saveSync();
    });
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
