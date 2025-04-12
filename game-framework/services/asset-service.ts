import { Asset, AssetManager, Component, Node, Prefab, Sprite, SpriteAtlas, SpriteFrame, _decorator, assert, assetManager, instantiate, js, murmurhash2_32_gc } from "cc";
import { DEBUG } from "cc/env";
import { AsyncTask, Container, logger } from "db://game-core/game-framework";
import { TaskService } from "./task-service";

const { ccclass } = _decorator;

/**
 * 目录资源
 *
 * @export
 * @class DirAsset
 * @extends {Asset}
 */
@ccclass("DirAsset")
export class DirAsset extends Asset { }

/**
 * 资源信息
 * 
 * 资源信息句柄不允许在外部创建实例，只允许通过asset-service的getOrCreateAssetHandle方法创建
 *
 * @export
 * @class AssetHandle
 */
class AssetHandle<T extends IGameFramework.Constructor<Asset>> {
    /**
     * 资源引用计数
     */
    private _ref: number = 0;
    private _loadP: IGameFramework.Nullable<Promise<Asset>>;
    private readonly _hash: number | string = 0;

    /**
     * 不允许在外部创建AssetHandle
     */
    constructor(

        /**
         * 资源所在的Bundle
         */
        public bundle: string,

        /**
         * 资源类型
         */
        public type: T,

        /**
         * 资源路径
         */
        public path: string = "",

        /**
         * 资源hash
         * 
         * 如果传入，则不会重新计算hash
         */
        hash: number | string
    ) {
        this._hash = hash;
    }

    /**
     * 是否是目录资源
     *
     * @return {*}  {boolean}
     * @memberof AssetHandle
     */
    public isDir(): boolean {
        return js.getClassName(this.type) == "DirAsset";
    }

    /**
     * 是不是正在加载
     *
     * @readonly
     * @memberof AssetHandle
     */
    public get loading() {
        return !!this._loadP;
    }

    /**
     * 获取正在加载的任务
     *
     * @readonly
     * @type {IGameFramework.Nullable<Promise<Asset>>}
     * @memberof AssetHandle
     */
    public get load(): IGameFramework.Nullable<Promise<Asset>> {
        return this._loadP;
    }

    public set load(p: IGameFramework.Nullable<Promise<Asset>>) {
        this._loadP = p;
    }

    /**
     * 引用计数
     *
     * @readonly
     * @memberof AssetHandle
     */
    public get ref() {
        return this._ref;
    }

    /**
     * 增加引用计数
     *
     * @memberof AssetHandle
     */
    public addRef(): void {
        this._ref++;
    }

    /**
     * 减少引用计数
     *
     * @memberof AssetHandle
     */
    public remRef(): void {
        if (this._ref > 0) {
            this._ref--;
        }
    }

    /**
     * 比较两个AssetHandle是否相等
     *
     * @param {AssetHandle} other
     * @return {*}  {boolean}
     * @memberof AssetHandle
     */
    public equals(other: AssetHandle<T>): boolean {
        return this.bundle == other.bundle && this.path == other.path;
    }

    /**
     * 获取AssetHandle的字符串形式
     *
     * @return {*}  {string}
     * @memberof AssetHandle
     */
    public toString(): string {
        return `[${this.bundle} ${this.path} ${js.getClassName(this.type)}]`;
    }

    /**
     * 获取hashCode 
     *
     * @return {*}  {number}
     * @memberof AssetHandle
     */
    public hashCode(): number | string {
        return this._hash;
    }

    /**
     * 释放资源
     *
     * @param {boolean} doDestroy 如果ref为0，是否销毁资源
     * @memberof AssetHandle
     */
    public releaseAsset(doDestroy: boolean): void {
        const assetSvr = Container.get(AssetService)!;
        assetSvr.releaseAsset(this as AssetHandle<IGameFramework.Constructor<Asset>>, doDestroy);
    }

    /**
     * 获取资源
     *
     * @return {*}  {IGameFramework.Nullable<T>}
     * @memberof AssetHandle
     */
    public getAsset(): IGameFramework.Nullable<InstanceType<T>> {
        const assetSvr = Container.get(AssetService)!;
        return assetSvr.getAsset(this as AssetHandle<IGameFramework.Constructor<Asset>>) as IGameFramework.Nullable<InstanceType<T>>;
    }

    /**
     * 安全获取资源
     * 
     * 如果资源正在加载，则等待加载完成
     * 
     * 如果资源没有加载，则开始加载
     *
     * @return {*}  {Promise<IGameFramework.Nullable<InstanceType<T>>>}
     * @memberof AssetHandle
     */
    public async safeGetAsset(): Promise<IGameFramework.Nullable<InstanceType<T>>> {
        let asset = this.getAsset();

        // 没有获取到资源
        if (!asset) {

            // 有正在加载的任务
            if (this.load) {

                // 等待加载完成
                await this.load;
            } else {

                // 没有正在加载的任务
                // 则开始加载
                await this.asyncLoad();
            }

            // 获取资源
            asset = this.getAsset();
        }

        // else 获取到了资源，直接返回
        return asset;
    }

    /**
     * 异步加载当前资源
     *
     * @return {*}  {Promise<IGameFramework.Nullable<InstanceType<T>>>}
     * @memberof AssetHandle
     */
    public async asyncLoad(): Promise<IGameFramework.Nullable<InstanceType<T>>> {
        const assetSvr = Container.get(AssetService)!;
        const asset = await assetSvr.loadAssetAsync(this as AssetHandle<IGameFramework.Constructor<Asset>>) as IGameFramework.Nullable<InstanceType<T>>;
        return asset;
    }

    /**
     * 增加引用计数并获取资源
     *
     * @return {*}  {IGameFramework.Nullable<InstanceType<T>>}
     * @memberof AssetHandle
     */
    public addRefAndGetAsset(): IGameFramework.Nullable<InstanceType<T>> {
        this._ref++;
        return this.getAsset();
    }

    /**
     * 增加引用计数并安全获取资源
     *
     * @return {*}  {Promise<IGameFramework.Nullable<InstanceType<T>>>}
     * @memberof AssetHandle
     */
    public async addRefAndSafeGetAsset(): Promise<IGameFramework.Nullable<InstanceType<T>>> {
        this._ref++;
        const asset = await this.safeGetAsset();
        return asset;
    }

    /**
     * 实例化资源
     *
     * @param {boolean} doDestroy 当引用为0的时候，是否销毁资源
     * @param {boolean} auto 是否在node销毁的时候，减少引用计数
     * @return {*}  {Node}
     * @memberof AssetHandle
     */
    public instantiate(doDestroy: boolean = false, auto: boolean = true): Node {
        const assetSvr = Container.get(AssetService)!;
        return assetSvr.instantiateAsset(this as unknown as AssetHandle<typeof Prefab>, auto, doDestroy);
    }

    /**
     * 设置SpriteFrame
     *
     * @param {Sprite} spr
     * @param {boolean} doDestroy
     * @memberof AssetHandle
     */
    public setFrame(spr: Sprite, doDestroy: boolean): void {
        if (js.getClassName(this.type) != js.getClassName(SpriteFrame)) {
            throw new Error("AssetHandle.setFrame only support SpriteFrame");
        }

        const assetSvr = Container.get(AssetService)!;
        assetSvr.setSpriteFrame(spr, this as unknown as AssetHandle<typeof SpriteFrame>, doDestroy);
    }
}

/**
 * 导出类型给外部使用
 * 
 * 一般是用来做参数给asset-service的相关方式使用
 */
export { type AssetHandle };

/**
 * 一个帮助函数
 * 
 * 用来自动去重
 *
 * @static
 * @template T
 * @param {AssetHandle<T>} asset
 * @param {AssetHandle<T>[]} array
 * @return {void}  
 * @memberof AssetHandle
 */
export const handleAppend = <T extends IGameFramework.Constructor<Asset>>(asset: AssetHandle<T>, array: AssetHandle<T>[]): void => {
    if (array.find(value => value.equals(asset))) {
        // 不需要添加重复的asset
        return;
    }

    array.push(asset);
}

/**
 * 多资源信息
 * 
 * 和Array<AssetInfo>没什么本质区别，唯一的区别就是不需要先遍历一次Array<AssetInfo>来获取bundleUrl，而是直接在loadAssets时根据MultiAssetsInfo.bundle获取bundleUrl。
 *
 * @export
 * @class MultiAssetsInfo
 */
export class MultiAssetsHandle {
    public constructor(
        public bundle: string[],
        public handles: AssetHandle<typeof Asset>[],
    ) { }

    public add(asset: AssetHandle<typeof Asset>): void {
        if (this.handles.find(value => value.bundle == asset.bundle && value.path == asset.path && value.type == asset.type)) {
            return;
        }

        this.handles.push(asset);
    }
}

/**
 * 异步加载委托
 *
 * @class AsyncLoadDelegate
 */
export class AsyncLoadDelegate<T extends { name: string, progress: number }> extends AsyncTask<T> implements IGameFramework.IAsyncTask<T> {
    private _bundleUrls: Set<string> = new Set<string>();
    private _assets: AssetHandle<typeof Asset>[] = [];

    public constructor(assets: AssetHandle<typeof Asset>[], bundleUrls?: Set<string>) {
        super(Container.get(TaskService)!);

        if (!bundleUrls) {
            assets.forEach(assetInfo => this._bundleUrls!.add(assetInfo.bundle));
        } else {
            this._bundleUrls = bundleUrls;
        }
        this._assets = assets;
    }
    /**
     * 加载资源
     *
     * @memberof AsyncLoadDelegate
     */
    public async *load(): AsyncGenerator<T> {
        for await (const task of this.loadBundle()) {
            yield task;
        }
        if (this._assets.length == 1 && this._assets[0].isDir()) {
            for await (const task of this.loadDir()) {
                yield task;
            }
        } else {
            for await (const task of this.loadAssets()) {
                yield task;
            }
        }
    }

    /**
     * 加载目录资源
     *
     * @private
     * @template T
     * @return {*}  {AsyncGenerator<T>}
     * @memberof AsyncLoadDelegate
     */
    private async *loadDir(): AsyncGenerator<T> {
        const assetInfo = this._assets[0];
        const bundleUrl = assetInfo.bundle;
        const bundle = assetManager.getBundle(bundleUrl) as AssetManager.Bundle;

        let progress = 0;
        let count = 0.1;
        let doFlag = true;
        let completeOrError = false;

        let info = `正在加载${assetInfo.path}目录`;

        bundle.loadDir(assetInfo.path, (finished: number, total: number, item: AssetManager.RequestItem) => {
            count = total;
            progress = finished;

            info = `正在加载${this.getInfoName(item)}`;
        }, (err, data) => {
            completeOrError = true;
            if (err) {
                logger.log("load dir failed", err);
            }
        });

        const tasks = Container.get(TaskService)!;
        while (doFlag) {
            let handle = tasks.waitNextFrame<T>();
            let value = { name: info, progress: 0 } as T;
            if (count != 0) {
                value = { name: info, progress: progress / count } as T;
            }
            if (progress >= count && completeOrError) {
                doFlag = false;
            }

            await handle;
            yield value as T;
        }
    }

    /**
     * 加载Bundle资源
     *
     * @private
     * @template T
     * @return {*}  {AsyncGenerator<T>}
     * @memberof AsyncLoadDelegate
     */
    private async *loadBundle(): AsyncGenerator<T> {
        let progress = 0;
        let count = 0;
        let doFlag = true;

        let info = "正在加载[bundle]: ";

        for (const bundleUrl of this._bundleUrls) {

            info = `正在加载[bundle]: ${bundleUrl}`;
            let bundle = assetManager.getBundle(bundleUrl) as IGameFramework.Nullable<AssetManager.Bundle>;
            if (!bundle) {
                count++;
                assetManager.loadBundle(bundleUrl, null, (error, data) => {
                    progress++;
                    if (error) {
                        logger.log("load bundle failed", error);
                    }
                });
            }
        }

        const tasks = Container.get(TaskService)!;
        while (doFlag) {
            let handle = tasks.waitNextFrame<T>();

            let value = { name: info, progress: 0 } as T;
            if (count != 0) {
                value = { name: info, progress: progress / count } as T;
            }

            if (progress >= count) {
                doFlag = false;
            }

            await handle;
            yield value as T;
        }
    }

    /**
     * 加载资源
     *
     * @private
     * @template T
     * @return {*}  {AsyncGenerator<Awaited<T>>}
     * @memberof AsyncLoadDelegate
     */
    private async *loadAssets(): AsyncGenerator<T> {
        let progress = 0;
        let count = 0;
        let allComplete = false;
        let assets = new Map<string, { finished: number, total: number, done: boolean }>();

        let info = "正在加载[assets]: ";
        const _assets = this._assets;
        for (let i = 0; i < _assets.length; i++) {
            const asset = _assets[i];
            let bundle = assetManager.getBundle(asset.bundle) as AssetManager.Bundle;

            // 加载文件夹
            if (asset.isDir()) {
                assets.set(asset.bundle, { finished: 0, total: 0, done: false });

                DEBUG && assert(!asset.path, "load dir must not have path");

                bundle.loadDir(asset.path, (finished: number, total: number, item: AssetManager.RequestItem) => {

                    // 这里的finished和total并不是一开始就是确定的
                    // 每次回调都会不断地更新
                    const itemInfo = assets.get(asset.bundle)!;
                    itemInfo.finished = finished;
                    itemInfo.total = total;

                    info = `正在加载 ${this.getInfoName(item)}`;
                }, (err, data) => {
                    const itemInfo = assets.get(asset.bundle)!;
                    itemInfo.done = true;

                    if (err) {
                        logger.log("load dir failed", err);
                    }
                });
            } else {
                assets.set(asset.path, { finished: 0, total: 0, done: false });
                // 加载零零散散的资源
                bundle.load(asset.path, asset.type, (finished: number, total: number, item: AssetManager.RequestItem) => {
                    const itemInfo = assets.get(asset.path)!;
                    itemInfo.finished = finished;
                    itemInfo.total = total;

                    info = `正在加载 ${this.getInfoName(item)}`;
                }, (error, data) => {
                    const itemInfo = assets.get(asset.path)!;
                    itemInfo.done = true;

                    if (error) {
                        logger.log("load bundle failed", error);
                    }
                });
            }
        }

        const tasks = Container.get(TaskService)!;
        while (!allComplete) {
            let handle = tasks.waitNextFrame<T>();

            count = 0;
            progress = 0;
            allComplete = true;

            // 由于进度和总值总是不断更新的，所以这里每次等待后需要重新计算
            assets.forEach((value, key) => {
                count += value.total;
                progress += value.finished;

                if (!value.done) {
                    allComplete = value.done;
                }
            });

            let value = { name: info, progress: 0 } as T;
            if (count != 0) {
                value = { name: info, progress: progress / count } as T;
            }

            await handle;
            yield value as T;
        }
    }

    private getInfoName(item: AssetManager.RequestItem): string {
        if (item.info && item.info.ctor) {
            return `${item.info?.path ?? "游戏资源"}: [${js.getClassName(item.info.ctor)}]`;
        }

        return "游戏资源";
    }

    public override async *task(): AsyncGenerator<T> {
        for await (const handle of this) {
            yield handle;
        }
    }


    public [Symbol.asyncIterator]() {
        return this.load();
    }
}

/**
 * 资源服务
 * 
 * cocos 的资源策略是静态资源会自动计算引用计数，动态加载的资源不会计算引用计数
 * 这其实很好理解，比如对于一个prefab资源，通过动态load进内存，这个prefab的引用计数并不会增加.这个prefab引用了某个图片。这个图片资源在内存中引用计数为1，因为prefab引用了它。以此类推。
 * 这就好比在编辑器中对于静态资源的引用计数是已知的。谁被谁引用，被应用了多少次。
 *
 * @export
 * @class AssetService
 */
@ccclass("AssetService")
export class AssetService {
    private _handles: Map<number | string, AssetHandle<typeof Asset>> = new Map<number | string, AssetHandle<typeof Asset>>();
    private _hashKey: boolean = true;

    /**
     * 获取是否使用hash key
     * 
     * hash key 默认开启，关闭后将使用 bundle:path:type 组合作为key
     * 
     * 使用hash key可以减少内存占用，但是需要计算hash值
     * 
     * 这个值有且仅可在游戏加载任何资源前设置一次
     *
     * @type {boolean}
     * @memberof AssetService
     */
    public get hashKey(): boolean {
        return this._hashKey;
    }

    public set hashKey(value: boolean) {

        // 如果已经加载了资源，则不允许修改key的计算方法
        // 否则会出现两个不同的key指向一个资源
        // 导致逻辑出错
        if (this._handles.size > 0) return;
        this._hashKey = value;
    }

    /**
     * 获取一个资源句柄
     *
     * @template T
     * @param {string} bundle
     * @param {T} type
     * @param {string} path
     * @return {*}  {AssetInfo}
     * @memberof AssetService
     */
    public getOrCreateAssetHandle<T extends IGameFramework.Constructor<Asset>>(bundle: string, type: T, path: string): AssetHandle<T> {
        // bundle - path - type name
        let key: string | number =
            this._hashKey ?
                murmurhash2_32_gc(`${bundle}:${path}:${js.getClassName(type)}`, 0x234) :
                `${bundle}:${path}:${js.getClassName(type)}`;

        let handle = this._handles.get(key) as unknown as IGameFramework.Nullable<AssetHandle<T>>;

        if (handle) {
            // 检查是否有潜在的hash冲突
            DEBUG && assert(
                handle.type === type &&
                handle.path === path &&
                handle.bundle === bundle,
                `${handle.toString()},${[bundle, path, js.getClassName(type)]} hash conflict`
            );
            return handle;
        }

        handle = new AssetHandle(bundle, type, path, key) as AssetHandle<T>;
        this._handles.set(key, handle as unknown as AssetHandle<typeof Asset>);
        return handle;
    }

    /**
     * 加载单个资源
     * 
     * 加载单个资源，如果资源已经加载，则直接返回
     *
     * @param {AssetHandle} handle
     * @return {*}  {Promise<IGameFramework.Nullable<Asset>>}
     * @memberof AssetService
     */
    public async loadAssetAsync<T extends IGameFramework.Constructor<Asset>>(handle: AssetHandle<T>): Promise<IGameFramework.Nullable<InstanceType<T>>> {
        DEBUG && assert(!!handle, "assetInfo is null");
        DEBUG && assert(!handle.isDir(), "assetInfo is dir");

        const bundle = await this.getAsyncBundleUrl(handle.bundle);
        if (!bundle) {
            return;
        }

        if (handle.load) {
            await handle.load;
        }

        let asset: IGameFramework.Nullable<Asset> = bundle.get(handle.path, handle.type);
        if (asset) {
            return asset as IGameFramework.Nullable<InstanceType<T>>;
        }

        const promise = new Promise<Asset>((resolve, reject) => {
            bundle.load(handle.path, handle.type, (err: IGameFramework.Nullable<Error>, data: Asset) => {
                if (!err) {
                    resolve(data);
                } else {
                    logger.log("load asset failed", err);
                    resolve(null!);
                }
            });
        });

        handle.load = promise;
        asset = await promise;
        handle.load = null;
        return asset as IGameFramework.Nullable<InstanceType<T>>;
    }

    /**
     * 实例化资源
     *
     * @param {AssetHandle<typeof Prefab>} handle
     * @param {boolean} auto 销毁节点自动减少资源句柄引用
     * @param {boolean} doDestroy 实例化后是否立即销毁 默认为false
     * @return {*}  {Node}
     * @memberof AssetService
     */
    public instantiateAsset(handle: AssetHandle<typeof Prefab>, auto: boolean, doDestroy: boolean = false): Node {
        const p = this.getAsset(handle);
        DEBUG && assert(!!p, "asset is null");

        handle.addRef();
        const node = this.instantiateGetNode(p!);
        if (auto) {
            node.on(Node.EventType.NODE_DESTROYED, () => {
                handle.releaseAsset(doDestroy);
            });
        }
        return node;
    }

    /**
     * 设置精灵帧
     *
     * @param {Sprite} sprite
     * @param {AssetHandle<typeof SpriteAtlas>} handle
     * @param {string} frame
     * @param {boolean} doDestroy
     * @memberof AssetService
     */
    public setSpriteFrameByAtlas(sprite: Sprite, handle: AssetHandle<typeof SpriteAtlas>, frame: string, doDestroy: boolean): void {
        const p = this.getAsset(handle);
        DEBUG && assert(!!p, "asset is null");

        handle.addRef();
        sprite.node.on(Node.EventType.NODE_DESTROYED, () => {
            handle.releaseAsset(doDestroy);
        });

        sprite.spriteFrame = p!.getSpriteFrame(frame);
    }

    /**
     * 设置精灵帧
     *
     * @param {Sprite} sprite
     * @param {AssetHandle<typeof SpriteFrame>} handle 精灵帧资源句柄
     * @param {boolean} doDestroy 销毁节点是否销毁资源句柄
     * @memberof AssetService
     */
    public setSpriteFrame(sprite: Sprite, handle: AssetHandle<typeof SpriteFrame>, doDestroy: boolean): void {
        const p = this.getAsset(handle);
        DEBUG && assert(!!p, "asset is null");

        handle.addRef();
        sprite.node.on(Node.EventType.NODE_DESTROYED, () => {
            handle.releaseAsset(doDestroy);
        });

        sprite.spriteFrame = p!;
    }

    /**
     * 实例化资源并获取组件
     *
     * @template T
     * @param {AssetHandle<typeof Prefab>} handle
     * @param {IGameFramework.Constructor<T>} component
     * @param {boolean} auto 销毁节点自动减少资源句柄引用
     * @param {boolean} doDestroy 实例化后是否立即销毁 默认为false
     * @return {*}  {IGameFramework.Nullable<T>}
     * @memberof AssetService
     */
    public instantiateGetComponent<T extends Component>(
        handle: AssetHandle<typeof Prefab>,
        component: IGameFramework.Constructor<T>,
        auto: boolean,
        doDestroy: boolean = false
    ): IGameFramework.Nullable<T> {
        const p = this.getAsset(handle);
        DEBUG && assert(!!p, "asset is null");

        handle.addRef();
        const node = this.instantiateGetNode(p!) as Node;
        if (auto) {
            node.on(Node.EventType.NODE_DESTROYED, () => {
                handle.releaseAsset(doDestroy);
            });
        }
        return node.getComponent(component);
    }

    /**
     * 加载多个资源
     * 
     * @example
     * ```ts
     * for await (const progress of loader.loadMultiAssets<number>(...args)) {
     *    // do something with progress
     * }
     * ```
     *
     * @template T
     * @param {MultiAssetsHandle} assetHandles
     * @return {*}  {AsyncGenerator<number>}
     * @memberof AssetService
     */
    public loadMultiAssets<T extends { name: string, progress: number }>(assetHandles: MultiAssetsHandle): AsyncLoadDelegate<T> {
        DEBUG && assert(!!assetHandles, "assetHandles is null");
        DEBUG && assert(Array.isArray(assetHandles.bundle) && assetHandles.bundle.length > 0, "bundle is empty");
        DEBUG && assert(Array.isArray(assetHandles.handles) && assetHandles.handles.length > 0, "handles is empty");

        return new AsyncLoadDelegate<T>(assetHandles.handles, new Set(assetHandles.bundle));
    }

    /**
     * 加载资源
     * 
     * @example
     * ```ts
     * for await (const progress of loader.loadAssets(...args)) {
     *    // do something with progress
     * }
     * ```
     *
     * @template T
     * @param {AssetHandle[]} assetHandles
     * @return {*}  {AsyncGenerator<number>}
     * @memberof AssetService
     */
    public loadAssets<T extends { name: string, progress: number }>(assetHandles: AssetHandle<typeof Asset>[]): AsyncLoadDelegate<T> {
        DEBUG && assert(!!assetHandles, "assetHandles is null");
        DEBUG && assert(Array.isArray(assetHandles) && assetHandles.length > 0, "handles is empty");

        return new AsyncLoadDelegate<T>(assetHandles);
    }

    /**
     * 
     * 加载目录资源
     * 
     * @example
     * ```ts
     * for await (const progress of loader.loadDir(new AssetInfo("your bundle name", DirAsset))) {
     *    // do something with progress
     * }
     * ```
     *
     * @template T
     * @param {AssetHandle} assetHandles
     * @return {*}  {AsyncGenerator<number>}
     * @memberof AssetService
     */
    public loadDir<T extends { name: string, progress: number }>(assetHandles: AssetHandle<typeof Asset>): AsyncLoadDelegate<T> {
        DEBUG && assert(!!assetHandles, "assetHandles is null");
        DEBUG && assert(assetHandles.isDir(), "assetHandles is dir");

        return new AsyncLoadDelegate<T>([assetHandles]);
    }

    /**
     * 异步获取资源
     *
     * 如果bundle没有加载过则会加载bundle
     * 
     * 如果bundle已经加载但是资源未加载则不会加载资源
     * 
     * 如果bundle已经加载并且资源没有加载，请使用loadAsyncAsset方法获取资源
     * 
     * @param {AssetHandle} assetHandle
     * @return {*}  {Promise<Nullable<Asset>>}
     * @memberof AssetService
     */
    public async getAssetAsync<T extends IGameFramework.Constructor<Asset>>(assetHandle: AssetHandle<T>): Promise<IGameFramework.Nullable<InstanceType<T>>> {
        DEBUG && assert(!!assetHandle, "assetInfo is null");

        const bundle = await this.getAsyncBundleUrl(assetHandle.bundle);
        if (!bundle) {
            return null;
        }

        return bundle.get(assetHandle.path, assetHandle.type) as IGameFramework.Nullable<InstanceType<T>>;
    }

    /**
     * 同步获取资源
     * 
     * 如果没有加载过
     * 
     * 则什么也获取不到
     *
     * @param {AssetHandle} assetHandle
     * @return {*}  {IGameFramework.Nullable<Asset>}
     * @memberof AssetService
     */
    public getAsset<T extends IGameFramework.Constructor<Asset>>(assetHandle: AssetHandle<T>): IGameFramework.Nullable<InstanceType<T>> {
        DEBUG && assert(!!assetHandle, "assetInfo is null");
        DEBUG && assert(!assetHandle.isDir(), "assetInfo is dir");

        let bundle = assetManager.getBundle(assetHandle.bundle) as IGameFramework.Nullable<AssetManager.Bundle>;
        if (!bundle) {
            return;
        }

        return bundle.get(assetHandle.path, assetHandle.type) as IGameFramework.Nullable<InstanceType<T>>;
    }


    /**
     * 回收一个资源
     *
     * @template T
     * @param {AssetHandle<T>} assetHandle 资源句柄
     * @param {boolean} doDestroy 如果ref为0，是否销毁资源
     * @return {*}  
     * @memberof AssetService
     */
    public async releaseAsyncAsset<T extends IGameFramework.Constructor<Asset>>(assetHandle: AssetHandle<T>, doDestroy: boolean): Promise<void> {
        DEBUG && assert(!!assetHandle, "assetInfo is null");

        const bundle = await this.getAsyncBundleUrl(assetHandle.bundle);
        this.doReleaseAsset(bundle, assetHandle, doDestroy);
    }

    /**
     * 回收一个资源
     *
     * @template T
     * @param {AssetHandle<T>} assetHandle 资源句柄
     * @param {boolean} doDestroy 如果ref为0，是否销毁资源
     * @memberof AssetService
     */
    public releaseAsset<T extends IGameFramework.Constructor<Asset>>(assetHandle: AssetHandle<T>, doDestroy: boolean): void {
        DEBUG && assert(!!assetHandle, "assetInfo is null");

        const bundle = this.getBundleUrl(assetHandle.bundle);
        this.doReleaseAsset(bundle, assetHandle, doDestroy);
    }

    /**
     * 获取资源Bundle
     *
     * @private
     * @param {string} bundleUrl
     * @return {*}  {Promise<IGameFramework.Nullable<AssetManager.Bundle>>}
     * @memberof AssetService
     */
    private async getAsyncBundleUrl(bundleUrl: string): Promise<IGameFramework.Nullable<AssetManager.Bundle>> {
        let bundle = assetManager.getBundle(bundleUrl) as IGameFramework.Nullable<AssetManager.Bundle>;
        if (!bundle) {
            const promise = new Promise<IGameFramework.Nullable<AssetManager.Bundle>>((resolve, reject) => {
                assetManager.loadBundle(bundleUrl, null, (error, data) => {
                    if (!error) {
                        resolve(data);
                    } else {
                        logger.log("load bundle failed", error);
                        resolve(null!);
                    }
                });
            });

            bundle = await promise;
        }
        return bundle;
    }

    /**
     * 同步获取资源Bundle
     *
     * @private
     * @param {string} bundleUrl
     * @return {*}  {IGameFramework.Nullable<AssetManager.Bundle>}
     * @memberof AssetService
     */
    private getBundleUrl(bundleUrl: string): IGameFramework.Nullable<AssetManager.Bundle> {
        return assetManager.getBundle(bundleUrl) as IGameFramework.Nullable<AssetManager.Bundle>;
    }

    /**
     * 实例化资源
     *
     * @param {Prefab} prefab
     * @return {*}  {Node}
     * @memberof AssetService
     */
    private instantiateGetNode(prefab: Prefab): Node {
        return instantiate(prefab) as Node;
    }

    /**
     * 释放资源
     *
     * @private
     * @template T
     * @param {IGameFramework.Nullable<AssetManager.Bundle>} bundle
     * @param {AssetHandle<T>} assetHandle
     * @param {boolean} doDestroy 
     * @return {*}  {void}
     * @memberof AssetService
     */
    private doReleaseAsset<T extends IGameFramework.Constructor<Asset>>(bundle: IGameFramework.Nullable<AssetManager.Bundle>, assetHandle: AssetHandle<T>, doDestroy: boolean): void {
        if (!bundle) {
            return;
        }

        assetHandle.remRef();
        // bundle - path - type name
        let key: string | number = assetHandle.hashCode();

        let handle = this._handles.get(key) as unknown as IGameFramework.Nullable<AssetHandle<T>>;
        DEBUG && assert(!!handle && handle.equals(assetHandle));

        if (assetHandle.ref <= 0 && doDestroy) {
            bundle.release(assetHandle.path, assetHandle.type);
        }
    }
}