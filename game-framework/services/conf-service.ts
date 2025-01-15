import { assert, js } from "cc";
import { DEBUG } from "cc/env";
import { Container } from "db://game-core/game-framework";
import { Byte } from "db://game-core/game-framework";

const enum PACKER {
    /**
     *  数组打包
     */
    LIST,

    /**
     *  HashMap打包
     */
    MAP,

    /**
     * 键值对打包
     */
    KV
}

/**
 * 配置表服务
 *
 * @export
 * @class ConfService
 */
export class ConfService<T = IGameFramework.ITableConf> {

    private _resource: T = js.createMap();

    public initliaze(bin: ArrayBuffer) {
        this.parse(bin);
    }

    public conf<U extends keyof T>(key: U): T[U] {
        return this._resource[key];
    }

    /**
     * preload资源加载成功
     *
     * @private
     * @param {ArrayBuffer} buffer
     * @memberof Configure
     */
    private parse(buffer: ArrayBuffer): void {
        const bytes = new Byte(buffer);
        const getData = this.getData;
        const serialization = Container.getInterface("IGameFramework.ISerializable")!;

        DEBUG && assert(serialization != void 0, "serialization is null");

        const resource = this._resource as Record<string, unknown>;

        while (bytes.pos < bytes.length) {
            const count = bytes.getInt16();
            const name = bytes.getUTF8String();
            const proto = bytes.getInt32();
            const type = bytes.getUint8();

            switch (type) {
                case PACKER.KV: {
                    const data = getData.call(this, bytes, proto, serialization);
                    resource[name] = data;
                    break;
                }
                case PACKER.LIST: {
                    const list = (resource[name] = [] as object[]);
                    for (let i = 0; i < count; i++) {
                        const data = getData.call(this, bytes, proto, serialization);
                        list.push(data);
                    }
                    break;
                }
                case PACKER.MAP: {
                    const key = bytes.getUTF8String();
                    const map = (resource[name] = {} as Record<string | number, object>);
                    for (let i = 0; i < count; i++) {
                        const data = getData.call(this, bytes, proto, serialization) as {
                            [key: string]: string | object | number;
                        };
                        map[data[key] as string] = data;
                    }
                    break;
                }
                default:
                    throw new Error('其他类型不支持存在与MAIN SHEET中');
            }
        }
    }

    private getData(
        bytes: Byte,
        id: number | string,
        serialization: IGameFramework.ISerializable
    ): object {
        const length = bytes.getInt32();
        const buffer = bytes.getUint8Array(bytes.pos, length);
        return serialization.decoder(parseInt(id as string), buffer);
    }
}