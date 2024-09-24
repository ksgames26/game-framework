import { EmptyPal } from "./impl/empty";
import { IPal } from "./ipal";

export class PalService implements IPal {

    private _pal: IPal = new EmptyPal();

    constructor() { }

    /**
     * 自动适配平台
     * 
     * 会根据运行时参数自动适配平台
     *
     * @memberof PalService
     */
    public adaptation(): void {

    }

    /**
     * 强制设置为某个平台
     *
     * @param {IPal} pal
     * @memberof PalService
     */
    public platform(pal: IPal): void {
        this._pal = pal;
    }

    public async login<T>(username?: string, password?: string): Promise<T> {
        const result = await this._pal.login(username, password);
        return result as T;
    }

    public async logout(): Promise<void> {
        await this._pal.logout();
    }
}