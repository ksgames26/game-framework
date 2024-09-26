import { Component, Renderer, UITransform, Widget, _decorator, easing, js, lerp } from "cc";
import { DEBUG } from "cc/env";
import { Container, isDestroyed, logger, secFrame } from "db://game-core/game-framework";
import { getEventListeners } from "../core/decorators";
import { AssetService } from "../services/asset-service";
import { TaskService } from "../services/task-service";
import { UIAnimaOpenMode, UIService, type OpenViewOptions } from "../services/ui-service";
import { type BaseService } from "./base-service";
import { BaseViewComponent } from "./base-view-component";
import { bindingAndFixSpecialShapedScreen } from "./binding-and-fix-special-shaped-screen";

const { ccclass, property } = _decorator;

enum PushPopState {
    None, Push, Pop
}

@ccclass("BaseView")
export abstract class BaseView<T extends BaseService> extends Component implements IGameFramework.IDisposable {

    /**
     * 打开面板时候的参数
     *
     * @protected
     * @type {OpenViewOptions}
     * @memberof BaseView
     */
    protected _options: OpenViewOptions = null!;

    /**
     * 当前面板主要的服务
     *
     * @protected
     * @type {T}
     * @memberof BaseView
     */
    protected _service: T = null!;
    protected _canBindingFix: boolean = true;
    protected _pushPopState: PushPopState = PushPopState.None;
    protected _viewComponents: BaseViewComponent<T, BaseView<T>>[] = [];
    protected _fixSpecialShapedScreenHasCache = true;
    private _disposed: boolean = false;
    private _viewCloseAfterPromise: IGameFramework.Nullable<Promise<IGameFramework.Nullable<ReturnType<this["onClose"]>>>>;
    private _viewCloseAfterResolve: IGameFramework.Nullable<(r: IGameFramework.Nullable<any>) => void>;

    public get service() {
        return this._service;
    }

    public get isDisposed(): boolean {
        return this._disposed || isDestroyed(this.node);
    }

    public get viewComponents() {
        return this._viewComponents;
    }

    /**
     * 面板名称
     * 
     * 请不要重载这个属性，很多地方依赖了js.getClassName来获取面板名称
     * 
     * 所以无论是js.getClassName(inst) 还是 js.getClassName(inst.constructor) 获取的名称都应该一至
     *
     *
     * @readonly
     * @memberof BaseView
     */
    public get viewName() {
        return js.getClassName(this);
    }

    /**
     * 如果面板不是push pop面板，退出的时候走的是close
     *
     * @abstract
     * @memberof BaseView
     */
    public abstract onClose(): unknown;

    /**
     * 当打开面板的方式是UIShowType.BlackBaseView
     * 
     * 是否可以点击黑色背景关闭面板
     *
     * @return {*}  {boolean}
     * @memberof BaseView
     */
    public canClickClose(): boolean {
        return true;
    }

    /**
    * 获取界面本身的点击背景
    *
    * @private
    * @return {*}  {Promise<IGameFramework.Nullable<Node>>}
    * @memberof BaseView
    */
    public async getClickBg(): Promise<IGameFramework.Nullable<Node>> {
        return Promise.resolve(null);
    }

    /**
     * 面板关闭后通知
     *
     * @template R
     * @param {IGameFramework.Nullable<R>} r
     * @return {*}  {void}
     * @memberof BaseView
     */
    public applyViewCloseAfter<R extends ReturnType<this["onClose"]>>(r: IGameFramework.Nullable<R>): void {
        if (!this._viewCloseAfterResolve) {
            return;
        }

        this._viewCloseAfterResolve!(r);
        this._viewCloseAfterResolve = null;
        this._viewCloseAfterPromise = null;
    }

    /**
     * 等待面板关闭后处理
     *
     * @return {*}  {Promise<IGameFramework.Nullable<ReturnType<this["onClose"]>>>}
     * @memberof BaseView
     */
    public async viewCloseAfter(): Promise<IGameFramework.Nullable<ReturnType<this["onClose"]>>> {
        // 如果在面板销毁后还调用了viewCloseAfter,则直接返回
        if (this.isDisposed) {
            logger.warn(`${this.viewName} 已销毁, 无法在调用viewCloseAfter`);
            return Promise.resolve(null);
        }

        if (this._viewCloseAfterPromise) return this._viewCloseAfterPromise;
        return this._viewCloseAfterPromise = new Promise<IGameFramework.Nullable<ReturnType<this["onClose"]>>>(resolve => {
            this._viewCloseAfterResolve = resolve;
        });
    }

    /**
     * 关闭自己
     *
     * @memberof BaseView
     */
    public async close() {
        const uiService = Container.get(UIService)!;
        await uiService.closeOrPopViewInstance(this);
    }

    /**
     * 销毁面板
     *
     * @memberof BaseView
     */
    public dispose(): void {
        if (this._disposed) return;
        this._disposed = true;

        this.remRef();
        this.node.destroy();
        this._service = null!;

        DEBUG && logger.log(`dispose view : ${this.viewName}`);
    }

    /**
     * 是否是push pop面板
     *
     * @return {*}  {boolean}
     * @memberof BaseView
     */
    public isPushPopView(): boolean {
        return this._options.pushPopView;
    }

    /**
     * 是否是push状态
     *
     * @return {*}  {boolean}
     * @memberof BaseView
     */
    public isPush(): boolean {
        if (!this.isPushPopView()) return false;
        return this._pushPopState == PushPopState.Push;
    }

    /**
     * 是否是pop状态
     *
     * @return {*}  {boolean}
     * @memberof BaseView
     */
    public isPop(): boolean {
        if (!this.isPushPopView()) return false;
        return this._pushPopState == PushPopState.Pop;
    }

    /**
     * 显示面板
     *
     * @param {OpenViewOptions} options
     * @return {*}  {Promise<void>}
     * @memberof BaseView
     */
    public async applyShow(options: OpenViewOptions, service: T): Promise<void> {
        this._options = options;
        this._service = service;

        this.showBefore();

        if (this._options.playAnimation == UIAnimaOpenMode.OPEN_SHOW_BEFORE || this._options.playAnimation == UIAnimaOpenMode.OPEN_ALL) {
            // 如果不强制刷新一下根节点的widget会导致适配失效,最终播放动画的时候，大小会是设计分辨率而不是当前终端窗口分辨率
            const widget = this.node.getComponent(Widget);
            if (widget) {
                widget.updateAlignment();
            }

            await this.showBeforeAnimate();

            if (this.isDisposed) {
                return;
            }
        }

        // 注册事件  
        getEventListeners(this).forEach((v, k) => {
            if (v.global) {
                const dispatcher = Container.getInterface("IGameFramework.IEventDispatcher")!;
                dispatcher.addListener(v.event, v.value, this, v.count);
            } else {
                this.service.addListener(v.event, v.value, this, v.count);
            }
        });

        DEBUG && logger.log(`open view : ${this.viewName}`);

        // 等待一帧，让afterAddChild的里面Widget更新完毕
        await Container.get(TaskService)!.waitNextFrame();
        // 要不然在afterAddChild里面调用onShow，如果此时使用某些API，比如UITransform.convertToWorldSpaceAR，会导致Widget没有更新完毕，导致位置错乱
        await this.onShow();

        // 这里判断了当前面板还没有销毁
        if (!this.isDisposed) {
            this._viewComponents.forEach(viewComponents => {

                // 如果实现了预加载函数
                // 就先执行预加载函数完毕后再调用onShow
                if (viewComponents.preloadAssets) {
                    viewComponents.preloadAssets().then(() => {
                        // 防止在预加载完毕后，面板已经销毁。此时onShow已经无任何意义
                        // 对于有异步资源预加载的子组件，需要再次判断一下面板是不是销毁了，因为这里是异步执行。有足够的时机导致当前面板被销毁
                        if (!this.isDisposed) {
                            viewComponents.onShow?.()
                        }
                    });
                } else {
                    // 如果没有实现预加载函数，直接调用onShow
                    // 对于没有异步资源预加载的子组件，就不需要再次判断当前面板是不是销毁了。因为这里是同步执行。
                    viewComponents.onShow?.();
                }
            });
        }
    }

    /**
     * 关闭面板
     *
     * @memberof BaseView
     */
    public async applyClose(): Promise<ReturnType<this["onClose"]>> {
        if (this._options.playAnimation == UIAnimaOpenMode.OPEN_CLOSE_BEFORE || this._options.playAnimation == UIAnimaOpenMode.OPEN_ALL) {
            await this.closeBeforeAnimate();
        }

        this._viewComponents.forEach(c => c.onClose?.());
        this._viewComponents.length = 0;

        // 注销事件
        getEventListeners(this).forEach((v, k) => {
            if (v.global) {
                const dispatcher = Container.getInterface("IGameFramework.IEventDispatcher")!;
                dispatcher.removeListener(v.event, v.value, this);
            } else {
                this.service.removeListener(v.event, v.value, this);
            }
        });

        // 然后关闭自身
        return this.onClose() as ReturnType<this["onClose"]>;
    }

    /**
     * 如果面板是push pop面板，进入的时候走onPush
     *
     * @memberof BaseView
     */
    public async push() {
        this._pushPopState = PushPopState.Push;
        await this.showBeforePushAnimate();
        if (this._options.activeOrEnableRender) this.node.active = true;
        else {
            const renderer = this.node.getComponentsInChildren(Renderer);
            renderer.forEach(r => r.enabled = true);
        }
    }

    /**
     * 如果面板是push pop面板，退出的时候走onPop
     * 
     * 走onPop的时候，面板不会销毁，只是隐藏
     *
     * @memberof BaseView
     */
    public async pop() {
        this._pushPopState = PushPopState.Pop;
        await this.showBeforePopAnimate();
        if (this._options.activeOrEnableRender) this.node.active = false;
        else {
            const renderer = this.node.getComponentsInChildren(Renderer);
            renderer.forEach(r => r.enabled = false);
        }
    }

    /**
     * 子节点添加完毕后，初始化一些属性
     * 
     * 这里也会做一些特殊处理，比如处理特殊的屏幕适配
     *
     * @memberof BaseView
     */
    public afterAddChild() {
        if (!this._canBindingFix) return;
        this._canBindingFix = false;

        const safeArea = Container.get(UIService)!.getSafeArea();
        bindingAndFixSpecialShapedScreen(this, safeArea, this, this._fixSpecialShapedScreenHasCache ? new Map() : void 0);
    }

    /**
     * 移除资源的引用
     *
     * @protected
     * @memberof BaseView
     */
    protected remRef(): void {
        if (!this._options) {
            return;
        }

        const assetSvr = Container.get(AssetService)!;

        // 默认不销毁面板所依赖的预制体资源
        assetSvr.releaseAsset(this._options.prefab, false);
    }

    /**
     * 面板展示前
     * 
     * 有些逻辑在onShow里面调用可能晚了，就可以在这里写
     *
     * @protected
     * @memberof BaseView
     */
    protected showBefore(): void {

    }

    /**
     * 显示面板之前的动画效果
     *
     * @protected
     * @return {*}  
     * @memberof BaseView
     */
    protected async showBeforeAnimate(): Promise<void> {
        await this.defaultAnimate(0, 1.2, 1, 0.1, easing.quadOut)
    }

    /**
     * 关闭面板之前的动画效果
     *
     * @protected
     * @return {*}  {Promise<void>}
     * @memberof BaseView
     */
    protected async closeBeforeAnimate(): Promise<void> {
        await this.defaultAnimate(1, 1.2, 0, 0.1, easing.quadIn)
    }

    /**
     * 显示面板之前的push动画效果
     *
     * @protected
     * @return {*}  
     * @memberof BaseView
     */
    protected async showBeforePushAnimate(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * 显示面板之前的pop动画效果
     *
     * @protected
     * @return {*}  
     * @memberof BaseView
     */
    protected async showBeforePopAnimate(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * 显示面板之后的处理
     *
     * @protected
     * @return {*}  
     * @memberof BaseView
     */
    protected async onShow(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * 一个放大缩小的默认动画
     *
     * @private
     * @param {number} start
     * @param {number} center
     * @param {number} end
     * @return {*}  {Promise<void>}
     * @memberof BaseView
     */
    private async defaultAnimate(
        start: number,
        center: number,
        end: number,
        time: number,
        easing: (v: number) => number
    ): Promise<void> {
        const trans = this.node.getComponent(UITransform)!;

        // 因为默认动画是一个先放大在缩小的动画
        // 我们总是把锚点先设置为中点
        let anchorX = trans.anchorX;
        let anchorY = trans.anchorY;
        if (trans.anchorX != 0.5 || trans.anchorY != 0.5) {
            trans.setAnchorPoint(0.5, 0.5);
        }

        const task = Container.get(TaskService)!;
        const count = secFrame(time);
        this.node.setScale(start, start);
        // 先放大
        for await (const t of task.loopFrameAsyncIter(count)) {
            let scale = lerp(start, center, easing(t / count));
            this.node.setScale(scale, scale);
        }

        // 再缩放
        for await (const t of task.loopFrameAsyncIter(count)) {
            let scale = lerp(center, end, easing(t / count));
            this.node.setScale(scale, scale);
        }

        // 最后还原锚点
        trans.setAnchorPoint(anchorX, anchorY);
    }
}