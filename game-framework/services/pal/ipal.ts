
export interface ILoginAdapter {

    login<T>(openId: string): Promise<T>;

    /**
     * 登出
     *
     * @return {*}  {Promise<void>}
     * @memberof IPal
     */
    logout(): Promise<void>;
}

/**
 * 平台接口
 *
 * @export
 * @interface IPal
 */
export interface IPal extends ILoginAdapter {

    /** 获取用户唯一标识 */
    get openId(): string;

    set adapter(adapter: ILoginAdapter);
    get adapter(): ILoginAdapter;

    /**
     * 登录
     *
     * @template T 登录成功返回的数据类型 各平台可能都不一样
     * @param {string} [username] 很多平台可以无账号密码登录，可以不传入
     * @param {string} [password] 很多平台可以无账号密码登录，可以不传入
     * @return {*}  {Promise<T>}
     * @memberof IPal
     */
    login<T>(username?: string, password?: string): Promise<T>;

    /**
     * 登出
     *
     * @return {*}  {Promise<void>}
     * @memberof IPal
     */
    logout(): Promise<void>;
}