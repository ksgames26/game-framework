import { Sprite, SpriteFrame } from "cc";
import { isDestroyed } from "db://game-core/game-framework";
import { AssetHandle } from "../services/asset-service";


/**
 * 
 * 设置SpriteFrame
 * 
 * @param spr 
 * @param handle 
 */
export const setSpriteFrame = function (spr: Sprite, handle: AssetHandle<typeof SpriteFrame>, vaild: (old: AssetHandle<typeof SpriteFrame>) => boolean) {
    if (!handle.getAsset()) {
        if (handle.load) {
            handle.load.then(e => {
                if (isDestroyed(spr.node) || !vaild(handle)) {
                    return;
                }

                handle.setFrame(spr, false);
            });
        } else {
            handle.asyncLoad().then(e => {
                if (isDestroyed(spr.node) || !vaild(handle)) {
                    return;
                }

                handle.setFrame(spr, false);
            });
        }
    } else {
        handle.setFrame(spr, false);
    }
}