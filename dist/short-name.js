"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shortNames = void 0;
exports.shortNames = {
    // UI 组件
    'lab': 'cc.Label',
    'btn': 'cc.Button',
    'spr': 'cc.Sprite',
    'scr': 'cc.ScrollView',
    'lay': 'cc.Layout',
    'tog': 'cc.Toggle',
    'tgc': 'cc.ToggleContainer',
    'edt': 'cc.EditBox',
    'rtx': 'cc.RichText',
    'pgv': 'cc.PageView',
    'prg': 'cc.ProgressBar',
    'sld': 'cc.Slider',
    'msk': 'cc.Mask',
    'wgt': 'cc.Widget',
    'uit': 'cc.UITransform',
    // 多媒体组件
    'ani': 'cc.Animation',
    'aud': 'cc.AudioSource',
    'vid': 'cc.VideoPlayer',
    'wbv': 'cc.WebView',
    // 渲染相关
    'cam': 'cc.Camera',
    'gfx': 'cc.Graphics',
    'pts': 'cc.ParticleSystem',
    'lit': 'cc.LightComponent',
    'mdl': 'cc.ModelComponent',
    // 动画相关
    'skl': 'cc.Skeleton',
    'ast': 'cc.AnimationState',
    'acl': 'cc.AnimationClip',
    'anc': 'cc.AnimationController',
    // 其他
    'cvs': 'cc.Canvas',
    'sfa': 'cc.SafeArea',
    'bie': 'cc.BlockInputEvents',
    'nod': 'cc.Node', // 节点
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hvcnQtbmFtZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NvdXJjZS9zaG9ydC1uYW1lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNhLFFBQUEsVUFBVSxHQUEyQjtJQUM5QyxRQUFRO0lBQ1IsS0FBSyxFQUFFLFVBQVU7SUFDakIsS0FBSyxFQUFFLFdBQVc7SUFDbEIsS0FBSyxFQUFFLFdBQVc7SUFDbEIsS0FBSyxFQUFFLGVBQWU7SUFDdEIsS0FBSyxFQUFFLFdBQVc7SUFDbEIsS0FBSyxFQUFFLFdBQVc7SUFDbEIsS0FBSyxFQUFFLG9CQUFvQjtJQUMzQixLQUFLLEVBQUUsWUFBWTtJQUNuQixLQUFLLEVBQUUsYUFBYTtJQUNwQixLQUFLLEVBQUUsYUFBYTtJQUNwQixLQUFLLEVBQUUsZ0JBQWdCO0lBQ3ZCLEtBQUssRUFBRSxXQUFXO0lBQ2xCLEtBQUssRUFBRSxTQUFTO0lBQ2hCLEtBQUssRUFBRSxXQUFXO0lBQ2xCLEtBQUssRUFBRSxnQkFBZ0I7SUFFdkIsUUFBUTtJQUNSLEtBQUssRUFBRSxjQUFjO0lBQ3JCLEtBQUssRUFBRSxnQkFBZ0I7SUFDdkIsS0FBSyxFQUFFLGdCQUFnQjtJQUN2QixLQUFLLEVBQUUsWUFBWTtJQUVuQixPQUFPO0lBQ1AsS0FBSyxFQUFFLFdBQVc7SUFDbEIsS0FBSyxFQUFFLGFBQWE7SUFDcEIsS0FBSyxFQUFFLG1CQUFtQjtJQUMxQixLQUFLLEVBQUUsbUJBQW1CO0lBQzFCLEtBQUssRUFBRSxtQkFBbUI7SUFFMUIsT0FBTztJQUNQLEtBQUssRUFBRSxhQUFhO0lBQ3BCLEtBQUssRUFBRSxtQkFBbUI7SUFDMUIsS0FBSyxFQUFFLGtCQUFrQjtJQUN6QixLQUFLLEVBQUUsd0JBQXdCO0lBRS9CLEtBQUs7SUFDTCxLQUFLLEVBQUUsV0FBVztJQUNsQixLQUFLLEVBQUUsYUFBYTtJQUNwQixLQUFLLEVBQUUscUJBQXFCO0lBQzVCLEtBQUssRUFBRSxTQUFTLEVBQWtCLEtBQUs7Q0FDMUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIlxuZXhwb3J0IGNvbnN0IHNob3J0TmFtZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgLy8gVUkg57uE5Lu2XG4gICAgJ2xhYic6ICdjYy5MYWJlbCcsICAgICAgICAgICAgICAgIC8vIOaWh+acrFxuICAgICdidG4nOiAnY2MuQnV0dG9uJywgICAgICAgICAgICAgICAvLyDmjInpkq5cbiAgICAnc3ByJzogJ2NjLlNwcml0ZScsICAgICAgICAgICAgICAgLy8g57K+54G1XG4gICAgJ3Njcic6ICdjYy5TY3JvbGxWaWV3JywgICAgICAgICAgIC8vIOa7muWKqOinhuWbvlxuICAgICdsYXknOiAnY2MuTGF5b3V0JywgICAgICAgICAgICAgICAvLyDluIPlsYBcbiAgICAndG9nJzogJ2NjLlRvZ2dsZScsICAgICAgICAgICAgICAgLy8g5byA5YWzXG4gICAgJ3RnYyc6ICdjYy5Ub2dnbGVDb250YWluZXInLCAgICAgIC8vIOW8gOWFs+WuueWZqFxuICAgICdlZHQnOiAnY2MuRWRpdEJveCcsICAgICAgICAgICAgICAvLyDovpPlhaXmoYZcbiAgICAncnR4JzogJ2NjLlJpY2hUZXh0JywgICAgICAgICAgICAgLy8g5a+M5paH5pysXG4gICAgJ3Bndic6ICdjYy5QYWdlVmlldycsICAgICAgICAgICAgIC8vIOmhtemdouinhuWbvlxuICAgICdwcmcnOiAnY2MuUHJvZ3Jlc3NCYXInLCAgICAgICAgICAvLyDov5vluqbmnaFcbiAgICAnc2xkJzogJ2NjLlNsaWRlcicsICAgICAgICAgICAgICAgLy8g5ruR5Yqo5ZmoXG4gICAgJ21zayc6ICdjYy5NYXNrJywgICAgICAgICAgICAgICAgIC8vIOmBrue9qVxuICAgICd3Z3QnOiAnY2MuV2lkZ2V0JywgICAgICAgICAgICAgICAvLyDpgILphY3nu4Tku7ZcbiAgICAndWl0JzogJ2NjLlVJVHJhbnNmb3JtJywgICAgICAgICAgLy8gVUnlj5jmjaJcblxuICAgIC8vIOWkmuWqkuS9k+e7hOS7tlxuICAgICdhbmknOiAnY2MuQW5pbWF0aW9uJywgICAgICAgICAgICAvLyDliqjnlLtcbiAgICAnYXVkJzogJ2NjLkF1ZGlvU291cmNlJywgICAgICAgICAgLy8g6Z+z6aKRXG4gICAgJ3ZpZCc6ICdjYy5WaWRlb1BsYXllcicsICAgICAgICAgIC8vIOinhumikVxuICAgICd3YnYnOiAnY2MuV2ViVmlldycsICAgICAgICAgICAgICAvLyDnvZHpobXop4blm75cblxuICAgIC8vIOa4suafk+ebuOWFs1xuICAgICdjYW0nOiAnY2MuQ2FtZXJhJywgICAgICAgICAgICAgICAvLyDnm7jmnLpcbiAgICAnZ2Z4JzogJ2NjLkdyYXBoaWNzJywgICAgICAgICAgICAgLy8g5Zu+5b2iXG4gICAgJ3B0cyc6ICdjYy5QYXJ0aWNsZVN5c3RlbScsICAgICAgIC8vIOeykuWtkOezu+e7n1xuICAgICdsaXQnOiAnY2MuTGlnaHRDb21wb25lbnQnLCAgICAgICAvLyDnga/lhYlcbiAgICAnbWRsJzogJ2NjLk1vZGVsQ29tcG9uZW50JywgICAgICAgLy8g5qih5Z6LXG5cbiAgICAvLyDliqjnlLvnm7jlhbNcbiAgICAnc2tsJzogJ2NjLlNrZWxldG9uJywgICAgICAgICAgICAgLy8g6aqo6aq8XG4gICAgJ2FzdCc6ICdjYy5BbmltYXRpb25TdGF0ZScsICAgICAgIC8vIOWKqOeUu+eKtuaAgVxuICAgICdhY2wnOiAnY2MuQW5pbWF0aW9uQ2xpcCcsICAgICAgICAvLyDliqjnlLvniYfmrrVcbiAgICAnYW5jJzogJ2NjLkFuaW1hdGlvbkNvbnRyb2xsZXInLCAgLy8g5Yqo55S75o6n5Yi25ZmoXG5cbiAgICAvLyDlhbbku5ZcbiAgICAnY3ZzJzogJ2NjLkNhbnZhcycsICAgICAgICAgICAgICAgLy8g55S75biDXG4gICAgJ3NmYSc6ICdjYy5TYWZlQXJlYScsICAgICAgICAgICAgIC8vIOWuieWFqOWMuuWfn1xuICAgICdiaWUnOiAnY2MuQmxvY2tJbnB1dEV2ZW50cycsICAgICAvLyDovpPlhaXpmLvmjKFcbiAgICAnbm9kJzogJ2NjLk5vZGUnLCAgICAgICAgICAgICAgICAgLy8g6IqC54K5XG59OyJdfQ==