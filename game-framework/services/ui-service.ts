import { Asset, EventKeyboard, EventTouch, Input, Layers, Node, Prefab, Rect, UITransform, Widget, _decorator, assert, find, input, js, sys } from "cc";
import { DEBUG } from "cc/env";
import { Container, isChildClassOf, isEmptyStr, logger, utils } from "db://game-core/game-framework";
import { EventDispatcher } from "../core/event-dispatcher";
import { type BaseService } from "../model-view/base-service";
import { type BaseView } from "../model-view/base-view";
import { type BaseViewComponent } from "../model-view/base-view-component";
import { SortedSet } from "db://game-core/game-framework";
import { AssetHandle, AssetService } from "./asset-service";

type OnCloseReturn<T extends BaseView<U>, U extends BaseService> = IGameFramework.Nullable<ReturnType<T["onClose"]>>;

const { ccclass } = _decorator;

export const enum UILayer {

    /**
     * 全局事件点击层
     * 
     * 不一定有，可能为空
     */
    Touch,

    /**
     *顶部
     */
    Top,

    /**
    / 中间
    */
    Mid,

    /**
    / 底部
    */
    Bottom,

    /**
    / 弹出窗口
    */
    PopUp,

    /**
    / 其他窗口
    */
    Other,

    /**
     * 根节点
     */
    Root,
}

export const enum UIShowType {
    /*
    / 本身就是全屏界面
    / 打开的时候不做任何处理
    */
    FullScreenView,

    /*
    / 黑底界面,可以点击黑底关闭界面
    */
    BlackBaseView,

    /*
    / 透明底界面,没有黑底
    */
    TransparentBaseView,
}

/**
 * 打开面板和关闭面板前的动画模式
 *
 * @export
 * @enum {number}
 */
export const enum UIAnimaOpenMode {
    /**
     * 面板打开和关闭前都不播放动画
     */
    NONE,

    /**
     * 面板打开前的动画播放，但是不播放面板关闭前的动画
     */
    OPEN_SHOW_BEFORE,

    /**
     * 面板关闭前的动画播放，但是不播放面板打开前的动画
     */
    OPEN_CLOSE_BEFORE,

    /**
     * 面板打开和关闭前都播放动画
     */
    OPEN_ALL
}

/**
 * 打开面板的参数
 *
 * @export
 * @class OpenViewOptions
 */
export class OpenViewOptions {
    public constructor(

        /**
         * view的prefab资源路径
         */
        public prefab: AssetHandle<typeof Prefab>,

        /**
         * 打开面板的时候是否会显示默认动画
         * 
         * 默认动画在BaseView中实现，如果需要自定义动画，可以重写showBeforeAnimate方法
         * 
         * ```
         * 播放动画的时机总是在view的onShow之前也在所有的子BaseViewComponent的onShow之前
         * ```
         */
        public playAnimation: UIAnimaOpenMode = UIAnimaOpenMode.OPEN_ALL,

        /**
         * 面板的显示类型 全屏/黑底/透明底
         */
        public showType: UIShowType = UIShowType.FullScreenView,

        /**
         * 面板自身的类型参数
         * 
         * 这里是任意类型，具体类型由面板自身决定。
         */
        public args: IGameFramework.Nullable<Readonly<any>> = void 0,

        /**
         * 面板的层级
         */
        public layer: UILayer = UILayer.Mid,

        /**
         * 是否是pushPopView。pushPopView和非pushPopView在界面管理上无任何关系
         * 
         * 第一个pushPopView类型的view打开的时候会作为历史记录, 后续的pushPopView类型的view会被压入栈顶, 只有栈顶的view可以被pop。当整个历史记录都没有了pushPopView类型的view时, 才会关闭销毁所有的pushPopView类型的view。
         * 
         * pop顶部的pushPopView类型的view的时候，会重新push上一个view，反之同理。
         * 
         * 如果在一个面板关闭的时候会打开上一个进入的面板，建议采用pushPopView的方式打开。否则建议采用非pushPopView的方式打开。
         */
        public pushPopView: boolean = false,

        /**
         * pushPopView为true时生效, activeOrEnableRender为false时, 采用禁用render组件的方式隐藏node。否则采用view node的active属性隐藏node。
         */
        public activeOrEnableRender: boolean = true,
    ) { }
}

interface EventOverview {
    "touch-start": EventTouch;
    "touch-end": EventTouch;
    "touch-move": EventTouch;
}

type V = BaseView<BaseService> | BaseViewComponent<BaseService, BaseView<BaseService>>;

@ccclass("UIService")
export class UIService extends EventDispatcher<EventOverview> implements IGameFramework.ISingleton {
    private _loadService: AssetService = Container.get(AssetService)!;
    private _openingViews: Map<string, { view: BaseView<BaseService>, clickBg: IGameFramework.Nullable<Node> }> = new Map();
    private _history: Array<BaseView<BaseService>> = new Array();
    private _touch: Node = null!;
    private _top: Node = null!;
    private _mid: Node = null!;
    private _bottom: Node = null!;
    private _popUp: Node = null!;
    private _other: Node = null!;
    private _root: Node = null!;

    public get enableUpdate() {
        return false;
    }

    public get updateOrder() {
        return 0;
    }

    private _viewKeyboards: SortedSet<{ root: number, v: V }> = new SortedSet((a, b) => {
        if (a.root == b.root) {
            return b.v.node.getSiblingIndex() - a.v.node.getSiblingIndex();
        } else {
            return b.root - a.root;
        }
    });

    private _clickBgHandle: IGameFramework.Nullable<AssetHandle<typeof Prefab>> = null!;

    //#region IGameFramework.ISingleton
    public onStart(args: IGameFramework.Nullable<{
        clickBgHandle: AssetHandle<typeof Prefab>,
        createTouchLayer: boolean
    }>): void {
        DEBUG && assert(!!(args && args.clickBgHandle), "clickBgHandle is null");
        this._clickBgHandle = args!.clickBgHandle;
        this._root = find("Canvas/Root")!;
        DEBUG && assert(!!this._root, "Canvas/Root not found");

        this._other = this.createLayer("Other");
        this._bottom = this.createLayer("Bottom");
        this._mid = this.createLayer("Mid");
        this._top = this.createLayer("Top");
        this._popUp = this.createLayer("PopUp");

        if (args && args.createTouchLayer) {
            this._touch = this.createLayer("Touch");
            this._touch.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
            this._touch.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
            this._touch.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
            this._touch.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        }

        if (utils.isPc) {
            input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
            input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
            input.on(Input.EventType.KEY_PRESSING, this.onKeyPressing, this);
        }
    }

    public onDestroy(): void {

    }

    public onUpdate(): void {

    }
    //#endregion

    private onKeyDown(event: EventKeyboard): void {
        for (let v of this._viewKeyboards) {
            v.v.onKeyDown(event);
            if (event.isStopped()) {
                break;
            }
        }
    }

    private onKeyUp(event: EventKeyboard): void {
        for (let v of this._viewKeyboards) {
            v.v.onKeyUp(event);
            if (event.isStopped()) {
                break;
            }
        }
    }

    private onKeyPressing(event: EventKeyboard): void {
        for (let v of this._viewKeyboards) {
            v.v.onKeyPressing(event);
            if (event.isStopped()) {
                break;
            }
        }
    }

    public enableKeyboard(v: V): void {
        let view: BaseView<BaseService> = v as BaseView<BaseService>;
        if (isChildClassOf(v.constructor, "BaseViewComponent")) {
            const comp = v as BaseViewComponent<BaseService, BaseView<BaseService>>;
            view = comp.view;
        }

        const parent = view.node.parent;
        if (!parent) return;
        this._viewKeyboards.add({ root: utils.getDistanceToRoot(v.node), v });

        v.node.on(Node.EventType.NODE_DESTROYED, () => {
            this.disableKeyboard(v);
        }, this);
    }

    public disableKeyboard(v: V): void {
        const has = this._viewKeyboards.findIndex(e => e.v == v);
        if (has > -1) {
            this._viewKeyboards.delete(has);
        }
    }

    /**
     * 获取安全区域
     *
     * @return {*}  {Rect}
     * @memberof UIService
     */
    public getSafeArea(): Rect {
        // iphone12-13
        // height: 1442.3076923076922
        // width: 750
        // x: 0
        // y: 90.38461538461539
        return sys.getSafeAreaRect();
    }

    /**
     * 有没有已经打开的VIEW
     *
     * @param {string} n
     * @return {*}  {boolean}
     * @memberof UIService
     */
    public hasOpenView(n: string): boolean {
        if (this._openingViews.get(n)) return true;
        return false
    }


    /**
     * 异步实例化一个新组件，并添加到指定节点
     *
     * @template T 继承自 BaseView 的视图类型
     * @template U 继承自 BaseService 的服务类型
     * @template C 继承自 BaseViewComponent 的组件类型
     * @param view 视图实例
     * @param prefab 预制件资源信息
     * @param parent 父节点
     * @returns 返回附加的组件或undefined
     */
    public async asyncAppendComponent<T extends BaseView<U>, U extends BaseService, C extends BaseViewComponent<U, T>>(view: T, prefab: AssetHandle<typeof Prefab>, parent: Node): Promise<IGameFramework.Nullable<C>> {
        DEBUG && assert(!!prefab, "prefab is null");
        DEBUG && assert(!!view, "view is null");

        await this._loadService.loadAssetAsync(prefab);
        return this.appendComponent<T, U, C>(view, prefab, parent);
    }

    /**
     * 同步实例化一个新组件，并添加到指定节点
     *
     * @template T
     * @template U
     * @template C
     * @param {T} view
     * @param {AssetHandle} prefab
     * @param {Node} parent
     * @return {*}  {IGameFramework.Nullable<C>}
     * @memberof UIService
     */
    public appendComponent<T extends BaseView<U>, U extends BaseService, C extends BaseViewComponent<U, T>>(view: T, prefab: AssetHandle<typeof Prefab>, parent: Node): IGameFramework.Nullable<C> {
        DEBUG && assert(!!prefab, "prefab is null");
        DEBUG && assert(!!view, "view is null");

        const asset = this._loadService.getAsset(prefab);
        if (!asset || view.isDisposed) return;

        if (asset instanceof Prefab) {
            const assetMgr = Container.get(AssetService)!;
            const comp = assetMgr.instantiateAsset(prefab as AssetHandle<typeof Prefab>, true);

            DEBUG && assert(!!comp, "instantiate failed");
            const viewComponent = comp.getComponent("BaseViewComponent") as C;
            viewComponent.view = view;
            parent.addChild(comp);
            viewComponent.afterAddChild();

            return viewComponent;
        }

        return null!;
    }

    /**
     * 异步实例化一个新组件，并添加到指定节点
     * 
     * 节点view不需要传入实例，只需要传入view名称，会自动向上查找
     *
     * @template T
     * @template U
     * @template C
     * @param {string} view
     * @param {AssetHandle} prefab
     * @param {Node} parent
     * @return {*}  {(Promise<C | undefined>)}
     * @memberof UIService
     */
    public async asyncAppendComponentFindView<T extends BaseView<U>, U extends BaseService, C extends BaseViewComponent<U, T>>(view: string, prefab: AssetHandle<typeof Prefab>, parent: Node): Promise<IGameFramework.Nullable<C>> {
        DEBUG && assert(!!prefab, "prefab is null");

        const asset = await this._loadService.loadAssetAsync(prefab);
        if (!asset) return;
        return this.appendComponentFindView<T, U, C>(view, prefab, parent);
    }

    /**
     * 同步实例化一个新组件，并添加到指定节点
     *
     * @template T
     * @template U
     * @template C
     * @param {string} view
     * @param {AssetHandle} prefab
     * @param {Node} parent
     * @return {*}  {IGameFramework.Nullable<C>}
     * @memberof UIService
     */
    public appendComponentFindView<T extends BaseView<U>, U extends BaseService, C extends BaseViewComponent<U, T>>(view: string, prefab: AssetHandle<typeof Prefab>, parent: Node): IGameFramework.Nullable<C> {
        DEBUG && assert(!!prefab, "prefab is null");

        const asset = this._loadService.getAsset(prefab);
        if (!asset) return;

        if (asset instanceof Prefab) {
            const assetMgr = Container.get(AssetService)!;
            const comp = assetMgr.instantiateAsset(prefab as AssetHandle<typeof Prefab>, true);

            DEBUG && assert(!!comp, "instantiate failed");
            const viewComponent = comp.getComponent("BaseViewComponent") as C;

            let find = parent.getComponent(view);
            if (!find) {
                let par = parent.parent;
                while (par) {
                    find = par.getComponent(view);
                    if (find) break;
                    par = par.parent;
                }
            }

            if (!find || (find as T).isDisposed) return;

            viewComponent.view = find as T;
            parent.addChild(comp);
            viewComponent.afterAddChild();

            return viewComponent;
        }

        return null!;
    }

    /**
     * 打开界面
     *
     * @template T 
     * @param {OpenViewOptions} options 面板参数
     * @return {*}  {Promise<T>} 异步返回面板实例
     * @memberof UIService
     */
    public async openView<T extends BaseView<U>, U extends BaseService>(options: OpenViewOptions, service: U): Promise<IGameFramework.Nullable<T>> {
        let asset: IGameFramework.Nullable<Asset> = null;
        DEBUG && assert(!options.prefab.isDir(), "prefab should be a file");

        asset = await this._loadService.loadAssetAsync(options.prefab);
        if (!asset) return;
        if (asset instanceof Prefab) {
            const assetMgr = Container.get(AssetService)!;
            const ui = assetMgr.instantiateAsset(options.prefab as AssetHandle<typeof Prefab>, true);

            DEBUG && assert(!!ui, "instantiate failed");

            const view = ui.getComponent("BaseView") as T;
            if (view) {
                const layer = this.getLayer(options.layer);
                if (!layer) return null!;

                DEBUG && assert(!(options.pushPopView && options.showType == UIShowType.BlackBaseView), "暂不支持一个面板是PUSHPOP面板又使用黑色背景打开的方式打开面板")

                let clickBg: Node | null = null;
                if (options.showType == UIShowType.BlackBaseView) {
                    clickBg = await view.getClickBg() ?? await this.getClickBg();
                    layer.addChild(clickBg);
                }

                // addChild 会触发onLoad
                layer.addChild(ui);
                view.afterAddChild(options, service);
                this._openingViews.set(view.viewName, { view, clickBg });

                if (options.pushPopView) {
                    this._history.push(view);
                    view.push();
                }

                // 所以onShow是在onLoad之后
                await view.applyShow();

                if (clickBg && !view.isDisposed && view.canClickClose()) {
                    clickBg.once(Node.EventType.TOUCH_START, (evt: EventTouch) => {
                        if (view.isDisposed) {
                            DEBUG && logger.warn("view is disposed");
                            return;
                        }

                        evt.propagationStopped = true;
                        evt.propagationImmediateStopped = true;

                        this.closeOrPopViewInstance(view);
                    }, this);
                }

                // 假如在show之后返回的面板实例已经销毁了或者父面板不存在了，那么返回这个面板已经没有了意义
                // 反而可能误用导致空指针异常
                return view.isDisposed ? void 0 : view;
            } else {

                logger.error(`${options.prefab} is not a BaseView`);

                // 如果没有在主Prefab上找到BaseView。那么就直接销毁
                ui.destroy();
                return null!;
            }
        }

        return null!;
    }

    /**
     * 关闭或弹出界面
     *
     * @template T
     * @param {IGameFramework.Constructor<T>} ctor
     * @return {*}  {Promise<boolean>}
     * @memberof UIService
     */
    public async closeOrPopView<T extends BaseView<U>, U extends BaseService>(ctor: IGameFramework.Constructor<T>): Promise<boolean> {
        return await this.closeOrPopViewName(js.getClassName(ctor));
    }

    /**
     * 关闭或弹出界面
     *
     * @template T
     * @param {T} view
     * @return {*}  {Promise<boolean>}
     * @memberof UIService
     */
    public async closeOrPopViewInstance<T extends BaseView<U>, U extends BaseService>(view: T): Promise<boolean> {
        return await this.closeOrPopViewName(view.viewName);
    }

    /**
     * 关闭或弹出界面
     *
     * @param {string} name
     * @return {*}  {Promise<boolean>}
     * @memberof UIService
     */
    public async closeOrPopViewName<T extends BaseView<U>, U extends BaseService>(name: string): Promise<boolean> {
        DEBUG && assert(!isEmptyStr(name), "name should not be empty");

        let r: IGameFramework.Nullable<T["onClose"]> = null!;
        const { view, clickBg } = this._openingViews.get(name) ?? {};
        if (view) {
            if (view.isPushPopView()) {
                // 必须先从顶层pop push view开始关闭
                DEBUG && assert(this.isTopPushView(view), "view should be top");

                if (this.isTopPushView(view)) {
                    let prev = this.getPrevView(view);
                    if (prev) {
                        // 关闭当前界面,同时打开上一个界面
                        await Promise.all([view.pop(), prev.push()]);
                    } else {
                        // 关闭当前界面
                        await view.pop();
                        this.closePoshPopView();
                    }
                    return true;
                }
            } else {
                r = await view.applyClose() as IGameFramework.Nullable<T["onClose"]>;
                if (clickBg) {
                    clickBg.removeFromParent();
                    clickBg.destroy(); // reduce resource handle references
                }
                view.dispose();
                this._openingViews.delete(name);
                view.applyViewCloseAfter(r);
                return true;
            }
        }

        return false;
    }

    /**
     * 等待需要等待的view关闭后
     *
     * @template T
     * @template U
     * @param {IGameFramework.Constructor<T>} ctor
     * @return {*}  {Promise<IGameFramework.Nullable<ReturnType<T["onClose"]>>>}
     * @memberof UIService
     */
    public async closeViewAfter<T extends BaseView<U>, U extends BaseService>(ctor: IGameFramework.Constructor<T>): Promise<OnCloseReturn<T, U>> {
        return this.closeViewNameAfter(js.getClassName(ctor));
    }

    /**
     * 等待需要等待的view关闭后
     *
     * @template T
     * @template U
     * @param {T} view
     * @return {*}  {Promise<OnCloseReturn<T,U>>}
     * @memberof UIService
     */
    public async closeViewInstanceAfter<T extends BaseView<U>, U extends BaseService>(view: T): Promise<OnCloseReturn<T, U>> {
        return this.closeViewNameAfter(view.viewName);
    }

    /**
     * 等待需要等待的view关闭后
     *
     * @template T
     * @template U
     * @param {string} name
     * @return {*}  {Promise<OnCloseReturn<T,U>>}
     * @memberof UIService
     */
    public async closeViewNameAfter<T extends BaseView<U>, U extends BaseService>(name: string): Promise<OnCloseReturn<T, U>> {
        const { view, clickBg } = this._openingViews.get(name) ?? {};
        if (!view) {
            throw new Error("view not found");
        }

        if (view.isPushPopView()) {
            throw new Error("view is push pop view");
        }

        return view.viewCloseAfter() as OnCloseReturn<T, U>;
    }

    /**
     * 打开面板
     *
     * @template T 服务类型
     * @template U 面板参数
     * @param {IGameFramework.Constructor<T>} t
     * @param {U} [args=void 0]
     * @return {*}  {Promise<BaseView>}
     * @memberof UIService
     */
    public async open<T extends BaseService, U>(t: IGameFramework.Constructor<T>, args: IGameFramework.Nullable<U> = void 0): Promise<IGameFramework.Nullable<BaseView<T>>> {
        const service = Container.get<T>(t);
        if (!service) {
            logger.warn(`service not found: ${js.getClassName(t)}`);
            return;
        }
        const options = service.viewOptions();
        if (args) options.args = args;
        const view = await this.openView(options, service);
        return view as BaseView<T>;
    }

    /**
     * 获取层
     *
     * @param {UILayer} layer
     * @return {*}  {Node}
     * @memberof UIService
     */
    public getLayer(layer: UILayer): IGameFramework.Nullable<Node> {
        switch (layer) {
            case UILayer.Touch:
                return this._touch;
            case UILayer.Top:
                return this._top;
            case UILayer.Mid:
                return this._mid;
            case UILayer.Bottom:
                return this._bottom;
            case UILayer.PopUp:
                return this._popUp;
            case UILayer.Other:
                return this._other;
            case UILayer.Root:
                return this._root;
            default:
                return null;
        }
    }

    private onTouchMove(evt: EventTouch) {
        evt.preventSwallow = true;

        this.dispatch("touch-move", evt);
    }

    private onTouchStart(evt: EventTouch) {
        evt.preventSwallow = true;

        this.dispatch("touch-start", evt);
    }

    private onTouchEnd(evt: EventTouch) {
        evt.preventSwallow = true;

        this.dispatch("touch-end", evt);
    }

    /**
     * 关闭所有界面
     *
     * @private
     * @memberof UIService
     */
    private closePoshPopView() {
        for (let view of this._history) {
            view.onClose();
            view.dispose();
            this._openingViews.delete(js.getClassName(view));
        }
        this._history.length = 0;
    }

    /**
     * 是不是最上层的PopPush界面
     *
     * @private
     * @param {BaseView} view
     * @return {*}  {boolean}
     * @memberof UIService
     */
    private isTopPushView<U extends BaseService>(view: BaseView<U>): boolean {
        let index = this._history.length - 1;
        if (index < 0) return true;

        let tail = this._history[index];
        if (!tail) return false;
        let forefatherAllPop = false;
        while (tail) {
            if (tail == view) return true;
            forefatherAllPop = tail.isPop();
            if (forefatherAllPop) return false;
            tail = this._history[--index];
        }
        return false;
    }

    /**
     * 获取下一个界面
     *
     * @private
     * @param {BaseView} view
     * @return {*}  {IGameFramework.Nullable<BaseView>}
     * @memberof UIService
     */
    private getNextView<U extends BaseService>(view: BaseView<U>): IGameFramework.Nullable<BaseView<U>> {
        if (view.isPushPopView()) return null!;
        let curr = this._history.indexOf(view);
        if (curr + 1 >= this._history.length) return null!;
        return this._history[curr + 1] as BaseView<U>;
    }

    /**
     * 获取上一个界面
     *
     * @private
     * @param {BaseView} view
     * @return {*}  {IGameFramework.Nullable<BaseView>}
     * @memberof UIService
     */
    private getPrevView<U extends BaseService>(view: BaseView<U>): IGameFramework.Nullable<BaseView<U>> {
        if (view.isPushPopView()) return null!;
        let curr = this._history.indexOf(view);
        if (curr - 1 < 0) return null!;
        return this._history[curr - 1] as BaseView<U>;
    }

    private async getClickBg(): Promise<Node> {
        const assetMgr = Container.get(AssetService)!;
        if (!this._clickBgHandle!.getAsset()) {
            await this._clickBgHandle?.asyncLoad();
        }
        return assetMgr.instantiateAsset(this._clickBgHandle!, true);
    }

    /**
     * 创建UI层
     *
     * @private
     * @param {string} name
     * @return {Node}  
     * @memberof UIService
     */
    private createLayer(name: string): Node {
        const node = new Node(name);
        const trans = node.addComponent(UITransform);
        node.layer = Layers.Enum.UI_2D;
        const widget = node.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.left = 0;
        widget.bottom = 0;
        widget.right = 0;
        widget.top = 0;
        widget.horizontalCenter = 0;
        widget.verticalCenter = 0;
        widget.isAbsoluteHorizontalCenter = true;
        widget.isAbsoluteVerticalCenter = true;

        const rootTrans = this._root.getComponent(UITransform)!;
        trans.width = rootTrans.width;
        trans.height = rootTrans.height;
        widget.alignMode = Widget.AlignMode.ALWAYS;
        this._root.addChild(node);
        widget.updateAlignment();

        DEBUG && assert(widget.isStretchHeight, "UI layer should be stretch height");
        DEBUG && assert(widget.isStretchWidth, "UI layer should be stretch width");

        return node;
    }
}