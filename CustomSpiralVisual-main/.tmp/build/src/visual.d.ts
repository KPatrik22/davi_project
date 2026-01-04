import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
export declare class Visual implements IVisual {
    private svg;
    private gStars;
    private gMain;
    private tooltip;
    private controlsDiv;
    private yearCheckbox;
    private moviesCheckbox;
    private host;
    private selectionManager;
    constructor(options: VisualConstructorOptions);
    update(options: VisualUpdateOptions): void;
    private drawMessage;
}
