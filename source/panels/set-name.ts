'use strict';
import { join } from 'path';
import { readFileSync } from 'fs';
import { createApp } from 'vue';
import { shortNames } from '../short-name';

// 定义组件类型接口
interface ShortNameMap {
    [key: string]: string;
}

// 分类后的组件接口
interface CategoryComponents {
    uiComponents: ShortNameMap;
    mediaComponents: ShortNameMap;
    renderComponents: ShortNameMap;
    animationComponents: ShortNameMap;
    otherComponents: ShortNameMap;
}

// 根据分类拆分shortNames
function categorizeShortNames(shortNames: ShortNameMap): CategoryComponents {
    const categories: CategoryComponents = {
        uiComponents: {},
        mediaComponents: {},
        renderComponents: {},
        animationComponents: {},
        otherComponents: {}
    };

    // UI组件 (index 0-13)
    const keys = Object.keys(shortNames);
    keys.slice(0, 14).forEach(key => {
        categories.uiComponents[key] = shortNames[key];
    });

    // 多媒体组件 (index 14-17)
    keys.slice(14, 18).forEach(key => {
        categories.mediaComponents[key] = shortNames[key];
    });

    // 渲染相关 (index 18-22)
    keys.slice(18, 23).forEach(key => {
        categories.renderComponents[key] = shortNames[key];
    });

    // 动画相关 (index 23-26)
    keys.slice(23, 27).forEach(key => {
        categories.animationComponents[key] = shortNames[key];
    });

    // 其他 (index 27+)
    keys.slice(27).forEach(key => {
        categories.otherComponents[key] = shortNames[key];
    });

    return categories;
}

let uuidSelected = "";
const options = {
    listeners: {},
    style: readFileSync(join(__dirname, '../../static/style/set-name/style.css'), 'utf-8'),
    template: readFileSync(join(__dirname, '../../static/template/set-name/index.html'), 'utf-8'),
    $: {
       app: "#app" // 指定一个ID选择器，确保HTML模板中有对应的元素
    },
    methods: {
        
    },
    async ready() {

        const uuid = arguments[0];
        if (!uuid) {
            await Editor.Panel.close('game-framework.set-name');
            Editor.Dialog.error('请选择一个节点');
            return;
        }

        uuidSelected = uuid;

        // 获取组件分类
        const categories = categorizeShortNames(shortNames);
        
        // 创建Vue应用
        const app = createApp({
            // 使用内联模板
            data() {
                return {
                    selectedType: '',
                    customName: '',
                    uiComponents: categories.uiComponents,
                    mediaComponents: categories.mediaComponents,
                    renderComponents: categories.renderComponents,
                    animationComponents: categories.animationComponents,
                    otherComponents: categories.otherComponents,
                    allComponents: shortNames
                };
            },
            methods: {
                updateType(event: { target: { value: string } }) {
                    this.selectedType = event.target.value;
                },
                updateName(event: { target: { value: string } }) {
                    this.customName = event.target.value;
                },
                confirm() {
                    if (this.selectedType) {
                        // 组合名称
                        const fullName = `_${this.selectedType}${this.customName}`;
                        // 发送事件
                        Editor.Message.request("scene", "set-property", {
                            uuid: uuidSelected,
                            path: "name",
                            dump: {
                                type: "string",
                                value: fullName
                            }
                        });
                        // 关闭面板
                        Editor.Panel.close('game-framework.set-name');
                    } else {
                        Editor.Dialog.warn('请选择一个组件类型');
                    }
                },
                cancel() {
                    Editor.Panel.close('game-framework.set-name');
                }
            },
            created() {
                // 默认选中第一个UI组件
                if (Object.keys(this.uiComponents).length > 0) {
                    this.selectedType = Object.keys(this.uiComponents)[0];
                }
            }
        });
        
        app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('ui-');
        
        // 挂载Vue应用到DOM
        app.mount(this.$.app);
    },
    async beforeClose() {
        // 面板关闭前的处理
    },
    close() {
        // 面板关闭后的处理
    },
};

module.exports = Editor.Panel.define(options);
