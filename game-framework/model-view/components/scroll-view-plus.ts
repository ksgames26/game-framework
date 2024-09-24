import { EventTouch } from "cc";
import { _decorator, Node, Event, ScrollView } from "cc";
const { ccclass } = _decorator;

@ccclass("ScrollViewPlus")
export class ScrollViewPlus extends ScrollView {

    protected _hasNestedViewGroup(event: Event, captureListeners?: Node[]): boolean {
        return false;
    }
}