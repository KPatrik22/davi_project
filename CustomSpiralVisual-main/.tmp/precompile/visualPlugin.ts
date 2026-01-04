import { Visual } from "../../src/visual";
import powerbiVisualsApi from "powerbi-visuals-api";
import IVisualPlugin = powerbiVisualsApi.visuals.plugins.IVisualPlugin;
import VisualConstructorOptions = powerbiVisualsApi.extensibility.visual.VisualConstructorOptions;
import DialogConstructorOptions = powerbiVisualsApi.extensibility.visual.DialogConstructorOptions;
var powerbiKey: any = "powerbi";
var powerbi: any = window[powerbiKey];
var legoSpiral352D1A5418054BD6AFE4A63220CCEB3A_DEBUG: IVisualPlugin = {
    name: 'legoSpiral352D1A5418054BD6AFE4A63220CCEB3A_DEBUG',
    displayName: 'legoSpiral',
    class: 'Visual',
    apiVersion: '5.3.0',
    create: (options?: VisualConstructorOptions) => {
        if (Visual) {
            return new Visual(options);
        }
        throw 'Visual instance not found';
    },
    createModalDialog: (dialogId: string, options: DialogConstructorOptions, initialState: object) => {
        const dialogRegistry = (<any>globalThis).dialogRegistry;
        if (dialogId in dialogRegistry) {
            new dialogRegistry[dialogId](options, initialState);
        }
    },
    custom: true
};
if (typeof powerbi !== "undefined") {
    powerbi.visuals = powerbi.visuals || {};
    powerbi.visuals.plugins = powerbi.visuals.plugins || {};
    powerbi.visuals.plugins["legoSpiral352D1A5418054BD6AFE4A63220CCEB3A_DEBUG"] = legoSpiral352D1A5418054BD6AFE4A63220CCEB3A_DEBUG;
}
export default legoSpiral352D1A5418054BD6AFE4A63220CCEB3A_DEBUG;