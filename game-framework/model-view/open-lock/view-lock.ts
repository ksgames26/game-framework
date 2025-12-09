import { js, Node, Prefab } from "cc";
import { Container, logger } from "db://game-core/game-framework";
import { AssetHandle } from "../../services/asset-service";
import { OpenViewOptions, UIService } from "../../services/ui-service";
import { BaseService } from "../base-service";
import { BaseView } from "../base-view";
import { BaseViewComponent } from "../base-view-component";

/**
 * ViewComponentLock 是一个管理视图组件锁定状态的类。
 *
 * @export
 * @class ViewComponentLock
 * @template T
 * @template S
 */
export class ViewComponentLock<T extends BaseView<BaseService>, S extends BaseViewComponent<BaseService, T>> {
    private _canOpen: boolean = true;
    private _component: S;
    private _prefab: AssetHandle<typeof Prefab>;
    private _parent: Node;
    private _view: T;

    public constructor(prefab: AssetHandle<typeof Prefab>, parent?: Node, view?: T) {
        this._prefab = prefab;
        this._parent = parent!;
        this._view = view!;
    }

    public get componentCanOpen() {
        return this._canOpen;
    }

    public get component() {
        return this._component;
    }

    public async openComponent(view?: T, parent?: Node): Promise<IGameFramework.Nullable<S>> {
        if (!this._canOpen) {
            logger.warn("Component is locking, cannot open component");
            return;
        }

        this._canOpen = false;

        const uiSvr = Container.get(UIService)!;
        if (!uiSvr) {
            logger.error("UIService instance is null");

            this._canOpen = true;
            return;
        }

        const p = parent ?? this._parent;
        const v = view ?? this._view;

        if (!p || !v) {
            logger.error("Parent node or view is null");

            this._canOpen = true;
            return;
        }

        const isLoad = this._prefab.getAsset();
        if (!isLoad) {
            await this._prefab.safeGetAsset();
        }

        this._component = await uiSvr.asyncAppendComponent<BaseView<BaseService>, BaseService, S>(v, this._prefab, p);
        if (this._component) {
            this._component.node.on(Node.EventType.NODE_DESTROYED, () => {
                this._canOpen = true;
            }, this);
        } else {
            this._canOpen = true;
        }

        return this._component;
    }

    public async closeComponent(): Promise<void> {
        if (this._component) {
            await this._component.close();
            this._component = null!;
        }
    }

    public clear(): void {
        this._component = null!;
    }
}


/**
 * ViewLock 是一个管理视图锁定状态的类。
 *
 * @export
 * @class ViewLock
 */
export class ViewLock<S extends BaseService, StreamTaskReturn> {
    private _canOpen: boolean = true;
    private _options: OpenViewOptions;
    private _isOpening: boolean = false;
    private _service: S;
    private _nodeDestroyClear: Node;
    private _view: BaseView<S, StreamTaskReturn> | null = null;

    private _beforeTask: (args?: unknown) => Promise<unknown> = null!;
    public set beforeTask(task: (args?: unknown) => Promise<unknown>) {
        this._beforeTask = task;
    }

    public constructor(service: S, options?: OpenViewOptions, nodeDestroyClear?: Node) {
        this._service = service;
        this._options = options ?? service.viewOptions();
        this._nodeDestroyClear = nodeDestroyClear;

        if (this._nodeDestroyClear) {
            this._nodeDestroyClear.on(Node.EventType.NODE_DESTROYED, this.clear, this);
        }
    }

    public get viewCanOpen() {
        return this._canOpen;
    }

    public get view() {
        return this._view;
    }

    public get hasView() {
        return this._view !== null;
    }

    public get isOpening() {
        return this._isOpening;
    }

    public async openView(args?: unknown): Promise<IGameFramework.Nullable<BaseView<S, StreamTaskReturn>>> {
        if (!this._canOpen) {
            logger.warn("View is locking, cannot open view");
            return;
        }

        this._canOpen = false;
        const uiSvr = Container.get(UIService)!;
        if (!uiSvr) {
            logger.error("UIService instance is null");

            this._canOpen = true;
            return;
        }
        this._isOpening = true;
        this._options.args = undefined;
        if (this._beforeTask) {
            const result = await this._beforeTask(args);
            if (result) {
                this._options.args = result;
            }
        } else {
            if (args) {
                this._options.args = args;
            }
        }
        const view = this._view = await uiSvr.openView(this._options, this._service);
        this._isOpening = false;
        if (view) {

            // 打开成功，等待关闭
            view.viewCloseAfter().then(() => {

                // 视图关闭后，清空引用
                this._view = null;

                // 可以继续打开
                this._canOpen = true;
            });
        } else {

            // 打开失败。可以继续打开
            this._canOpen = true;
        }
        return view;
    }

    public async closeView(): Promise<void> {
        if (this._view) {
            await this._view.close();
            this._view = null;
        }
    }

    public clear(): void {
        this._view = null!;
        this._options = null!;
        this._service = null!;
        this._nodeDestroyClear = null!;
        this._beforeTask = null!;
    }
}

/**
 * 检查是否有任何视图当前正在打开
 * 
 * 只要有一个正在打开的面板，就返回true，表示有面板正在打开
 * 
 * @param viewLocks 
 * @returns
 */
export const hasOpeningView = <S extends BaseService>(viewLocks: ViewLock<S, any>[]) => {
    return viewLocks.some(lock => !lock.viewCanOpen);
};

/**
 * 检查是否有任何视图当前正在打开
 * 
 * 只要有一个正在打开的组件，就返回true，表示有视图组件正在打开
 * 
 * @param viewLocks 
 * @returns 
 */
export const hasOpeningComponent = <T extends BaseView<BaseService>, S extends BaseViewComponent<BaseService, T>>(viewLocks: ViewComponentLock<T, S>[]) => {
    return viewLocks.some(lock => !lock.componentCanOpen);
};

/**
 * 
 * 是否可以打开某个面板
 * 
 * 假设有AB三个面板互斥
 * 
 * 1. 当前打开A，点击打开B，则关闭A，打开B
 * 2. 当前打开A，点击打开A，则不操作
 * 3. 当前没有打开任何面板，点击打开A，则打开A
 * 4. 当前打开A，A正在打开但还未打开，则不操作 （防止重复点击）
 * 5. 当前打开A，B正在打开但还未打开，则不操作
 * 
 * @param openLock 
 * @param viewLocks 
 * @param view 
 * @param viewName 
 * @param args 
 * @returns 
 */
export const canOpenView = async <S extends BaseService>(
    openLock: ViewLock<S, any>,
    viewLocks: ViewLock<S, any>[],
    view: BaseView<BaseService<{}, { [key: string]: any; }>, any>,
    viewName: string,
    args?: unknown
): Promise<boolean | BaseView<S, any>> => {
    // 我是否可以打开
    if (!openLock.viewCanOpen) {
        return false;
    }

    if (view && view.viewName === viewName) {
        return false;
    }

    const filter = viewLocks.filter(lock => lock !== openLock);
    const hasOpening = hasOpeningView(filter);
    if (hasOpening) {
        if (view) {
            // 异步打开面板，要先打开新面板，再关闭需要关闭的面板。这样可以避免首次加载时间差造成的问题
            const nView = await openLock.openView(args);
            await view.close();
            return nView;
        }
        return false;
    }

    if (view) {
        await view.close();
    }

    return true;
};


/**
 * 
 * 是否可以打开某个视图组件
 * 
 * 假设有AB三个视图组件互斥
 * 
 * 1. 当前打开A，点击打开B，则关闭A，打开B
 * 2. 当前打开A，点击打开A，则不操作
 * 3. 当前没有打开任何视图组件，点击打开A，则打开A
 * 4. 当前打开A，A正在打开但还未打开，则不操作 （防止重复点击）
 * 5. 当前打开A，B正在打开但还未打开，则不操作
 * 
 * @param openLock 
 * @param componentLocks 
 * @param component 
 * @param componentName 
 * @returns 
 */
export const canOpenComponent = async <T extends BaseView<BaseService>, S extends BaseViewComponent<BaseService, T>>(
    openLock: ViewComponentLock<T, S>,
    componentLocks: ViewComponentLock<T, S>[],
    component: S,
    componentName: string
): Promise<boolean | S> => {
    // 我是否可以打开
    if (!openLock.componentCanOpen) {
        return false;
    }

    if (component && js.getClassName(component) === componentName) {
        return false;
    }

    const filter = componentLocks.filter(lock => lock !== openLock);
    const hasOpening = hasOpeningComponent(filter);
    if (hasOpening) {
        if (component) {

            // 异步打开组件，要先打开新组件，再关闭需要关闭的组件。这样可以避免首次加载时间差造成的问题
            const nComponent = await openLock.openComponent();
            await component.close();
            return nComponent;
        }
        return false;
    }

    if (component) {
        await component.close();
    }

    return true;
};