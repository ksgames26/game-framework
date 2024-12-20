import { Component, _decorator } from "cc";
import { Container, isDestroyed } from "db://game-core/game-framework";
import { UIService } from "../services/ui-service";
import { BaseService } from "./base-service";
import { type BaseView } from "./base-view";
import { bindingAndFixSpecialShapedScreen } from "./binding-and-fix-special-shaped-screen";
import { EventKeyboard } from "cc";
const { ccclass, property, menu } = _decorator;

/**
 * 视图组件基类
 * 
 * bindingAndFixSpecialShapedScreen的时候会逐级向下扫描所有的集成了BaseViewComponent的组件，并把祖试图也就是BaseView的实例注入进来
 *
 * @export
 * @abstract
 * @class BaseViewComponent
 * @extends {Component}
 */
@ccclass("BaseViewComponent")
@menu("GameFramework/ViewState/BaseViewComponent")
export abstract class BaseViewComponent<U extends BaseService, T extends BaseView<U>> extends Component {
    /**
     * 组件所在的祖视图
     *
     * @private
     * @type {T}
     * @memberof BaseViewComponent
     */
    protected _view: T = null!;
    protected _canBindingFix: boolean = true;
    protected _canCloseSelf: boolean = false;

    /**
     * 如果你的组件是单独的prefab组件,那么你可以设置这个属性为true
     * 
     * 单独的prefab一般是实例化后动态添加到view中，在view实例化的时候，这个组件并没有实例化，所以view无法自动绑定该prefab上的component
     *
     * @readonly
     * @memberof BaseViewComponent
     */
    @property
    public get asyncBinding() {
        return this._asyncBinging;
    }

    public set asyncBinding(asyncBinding: boolean) {
        this._asyncBinging = asyncBinding;
    }

    public get isDisposed(): boolean {
        return isDestroyed(this.node);
    }

    @property protected _asyncBinging: boolean = false;


    @property
    public get fixSpecialShapedScreenHasCache() {
        return this._fixSpecialShapedScreenHasCache;
    }

    public set fixSpecialShapedScreenHasCache(value: boolean) {
        this._fixSpecialShapedScreenHasCache = value;
    }

    protected _fixSpecialShapedScreenHasCache = true;

    public enableKeyboard() {
        const uiService = Container.get(UIService)!;
        uiService.enableKeyboard(this);
    }

    public disableKeyboard() {
        const uiService = Container.get(UIService)!;
        uiService.disableKeyboard(this);
    }

    public set view(view: T) {
        this._view = view;
    }

    /**
     * 组件所在的视图服务
     *
     * @readonly
     * @protected
     * @memberof BaseViewComponent
     */
    protected get service() {
        return this._view.service;
    }

    /**
     * 关闭视图而不是自身
     * 
     * 关闭自身请使用close方法
     *
     * @protected
     * @memberof BaseViewComponent
     */
    protected async closeView() {
        await this._view.close();
    }

    protected async close() {
        if (this._canCloseSelf) {
            await this.onClose?.();
        }
    }

    public afterAddChild() {
        if (!this._asyncBinging || !this._view || !this._canBindingFix) return;

        // 不允许二次绑定
        this._canBindingFix = false;

        const safeArea = Container.get(UIService)!.getSafeArea();
        bindingAndFixSpecialShapedScreen(this, safeArea, this._view, this._fixSpecialShapedScreenHasCache ? new Map() : void 0);

        // 对于直接在view所在的prefab上的组件，是不会被调用afterAddChild的。在view中会自动调用所有实现了onShow函数的组件
        // 但是对于动态prefab实例化出来的组件，是会调用组件的afterAddChild的，所以这里需要手动调用onShow
        if (this.onShow) {
            this.onShow();
        }
    }

     /**
     * 键盘按下事件，总是从顶部面板往下传递
     * 
     * @example
     * 
     * ---root        4
     *   ---panel1    3
     *    ---panel2   2
     *   ---panel3    1
     *
     * @protected
     * @param {EventKeyboard} event
     * @memberof BaseView
     */
     public onKeyDown(event: EventKeyboard): void {
      
     }
 
     /**
      * 键盘抬起事件，总是从顶部面板往下传递
      *
      * @public
      * @param {EventKeyboard} event
      * @memberof BaseView
      */
     public onKeyUp(event: EventKeyboard): void {
 
     }
 
     /**
      * 键盘长按事件，总是从顶部面板往下传递
      *
      * @public
      * @param {EventKeyboard} event
      * @memberof BaseView
      */
     public onKeyPressing(event: EventKeyboard): void {
 
     }

    /**
     * 预加载资源
     *
     * @memberof BaseViewComponent
     */
    public async preloadAssets?(): Promise<void>;

    /**
     * 视图组件的初始化
     *
     * @memberof BaseViewComponent
     */
    public onShow?(): void;

    /**
     * 视图组件的销毁
     *
     * @memberof BaseViewComponent
     */
    public async onClose?(): Promise<void>;
}