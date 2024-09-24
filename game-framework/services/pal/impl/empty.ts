import { IPal } from "../ipal";

export class EmptyPal implements IPal {
    public async login<T>(username?: string, password?: string): Promise<T> {
        return Promise.resolve(1 as T);
    }

    public async logout(): Promise<void> {

    }
}