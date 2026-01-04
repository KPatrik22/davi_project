"use strict";

import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import DataView = powerbi.DataView;
import ISelectionId = powerbi.visuals.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import * as d3 from "d3";

// or: import deathstarImg from "../assets/deathstar.png";

interface SpiralDatum {
    subtheme: string;
    date: Date;
    value: number;
    selectionId: ISelectionId;
}

export class Visual implements IVisual {
    private svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, any>;
    private gStars: d3.Selection<SVGGElement, unknown, HTMLElement, any>;
    private gMain: d3.Selection<SVGGElement, unknown, HTMLElement, any>;
    private tooltip: d3.Selection<HTMLDivElement, unknown, HTMLElement, any>;
    private controlsDiv: d3.Selection<HTMLDivElement, unknown, HTMLElement, any>;
    private yearCheckbox: d3.Selection<HTMLInputElement, unknown, HTMLElement, any>;
    private moviesCheckbox: d3.Selection<HTMLInputElement, unknown, HTMLElement, any>;
    private host: IVisualHost;
    private selectionManager: ISelectionManager;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.selectionManager = this.host.createSelectionManager();
        
        this.svg = d3.select(options.element)
            .append("svg")
            .classed("legoSpiral", true);
        this.svg.style('background', 'black');

        this.gStars = this.svg.append("g").classed("stars-container", true);

        this.gMain = this.svg.append("g");

        // In Constructor or Update
        this.svg.on('click', () => {
            // Clear selection manager
            this.selectionManager.clear().then(() => {
                // Reset visual opacity
                this.gMain.selectAll('.segments path').attr('opacity', 1.0);
            });
        });

        // create a lightweight tooltip DIV attached to the visual container
        this.tooltip = d3.select(options.element)
            .append('div')
            .classed('legoSpiralTooltip', true)
            .style('position', 'absolute')
            .style('pointer-events', 'none')
            .style('background', '#111')
            .style('color', '#ffffffff')
            .style('border', '1px solid rgba(255,255,255,0.06)')
            .style('padding', '6px 8px')
            .style('font-size', '11px')
            .style('box-shadow', '0 2px 6px rgba(0,0,0,0.4)')
            .style('display', 'none');

        // Controls (top-right): toggles for Years and Movies (releases)
        this.controlsDiv = d3.select(options.element)
            .append('div')
            .classed('legoSpiralControls', true)
            .style('position', 'absolute')
            .style('top', '8px')
            .style('right', '8px')
            .style('background', 'rgba(255,255,255,0.92)')
            .style('padding', '6px 8px')
            .style('border-radius', '6px')
            .style('box-shadow', '0 2px 6px rgba(0,0,0,0.08)')
            .style('font-size', '12px')
            .style('color', '#111')
            .style('z-index', '10');

        // Year toggle
        const yLabel = this.controlsDiv.append('label').style('display', 'block').style('cursor', 'pointer');
        this.yearCheckbox = yLabel.append('input') as any;
        this.yearCheckbox
            .attr('type', 'checkbox')
            .property('checked', true)
            .style('margin-right', '6px');
        yLabel.append('span').text('Years');

        // Movies / Releases toggle
        const mLabel = this.controlsDiv.append('label').style('display', 'block').style('cursor', 'pointer').style('margin-top', '4px');
        this.moviesCheckbox = mLabel.append('input') as any;
        this.moviesCheckbox
            .attr('type', 'checkbox')
            .property('checked', true)
            .style('margin-right', '6px');
        mLabel.append('span').text('Movies');

        // Wire up change handlers to toggle groups when checkboxes change
        try {
            this.yearCheckbox.on('change', () => {
                const checked = (this.yearCheckbox.node() as HTMLInputElement).checked;
                try { this.gMain.select('.guides').style('display', checked ? null : 'none'); } catch (e) {}
            });
            this.moviesCheckbox.on('change', () => {
                const checked = (this.moviesCheckbox.node() as HTMLInputElement).checked;
                try { this.gMain.select('.releases').style('display', checked ? null : 'none'); } catch (e) {}
            });
        } catch (e) {
            // ignore if handler wiring fails in older browsers
        }
    }

    public update(options: VisualUpdateOptions) {
        const dataView: DataView = options.dataViews && options.dataViews[0];
        const width = options.viewport.width;
        const height = options.viewport.height;

    this.gStars.selectAll("*").remove(); // Clear previous stars

        const starCount = Math.min(600, Math.round(width * height / 2000)); // Adjust density based on screen size

        for (let i = 0; i < starCount; i++) {
            // Randomize position, size, and opacity for realism
            const posX = Math.random() * width;
            const posY = Math.random() * height;
            // Size between 0.5px and 2px
            const size = Math.random() * 1.5 + 0.5; 
            // Opacity between 0.3 and 0.9 for "twinkling" effect
            const opacity = Math.random() * 0.6 + 0.3;

            this.gStars.append('circle')
                .attr('cx', posX)
                .attr('cy', posY)
                .attr('r', size)
                .attr('fill', 'white')
                .attr('opacity', opacity)
                // Optional: slight blur for distant stars
                .style('filter', size > 1.2 ? 'blur(0.5px)' : 'none');
        }

        this.svg
            .attr("width", width)
            .attr("height", height);

        this.gMain
            .attr("transform", `translate(${width / 2}, ${height / 2})`);
        this.gMain.selectAll("*").remove();

        try {

        // remove any existing background element; we'll draw a circular background later
        this.svg.selectAll('.bg').remove();

        if (!dataView || !dataView.categorical) {
            this.drawMessage("No dataView / categorical data");
            return;
        }

        const categorical = dataView.categorical;
        // (debug overlay removed for production-style visual)
        const categories = categorical.categories || [];
        const values = categorical.values || [];

        // --- Find columns by role name ---
        // find role-backed columns
        let subthemeCat = (categories as any[]).find(c => c && c.source && c.source.roles && (c.source.roles as any)["subtheme"]);

        // collect all category columns that have role 'date' (hierarchies like Year / Month)
        const dateCats = (categories as any[]).filter(c => c && c.source && c.source.roles && (c.source.roles as any)["date"]);

        let valueCol = (values as any[]).find(v => v && v.source && v.source.roles && (v.source.roles as any)["value"]);
        // identify grouping column early: prefer explicit subtheme role, else first non-date category
        let groupCat = subthemeCat;
        if (!groupCat) {
            groupCat = (categories as any[]).find(c => c && !(c.source && c.source.roles && (c.source.roles as any)["date"]));
        }
        if (!groupCat && !subthemeCat) groupCat = null;

        // helper: month name -> index (0-11) for loose textual months
        function monthNameToIndex(v: any): number | null {
            if (v == null) return null;
            const s = String(v).toLowerCase();
            const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
            for (let i = 0; i < months.length; i++) {
                if (s.startsWith(months[i]) || s.includes(months[i])) return i;
            }
            const n = Number(s);
            if (!isNaN(n) && n >= 1 && n <= 12) return n - 1;
            return null;
        }

        // format date as `YYYY MM` (month as two-digit number)
        function formatDateYearMonth(d: Date): string {
            if (!d) return '';
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            return `${y} ${m}`;
        }

        // format numeric value as integer with grouping and EUR suffix
        function formatCurrencyNoDecimals(n: number): string {
            if (n == null || isNaN(n)) return '';
            const v = Math.round(n);
            return v.toLocaleString() + ' EUR';
        }

        // prepare arrays
        const groupArr = groupCat && groupCat.values ? groupCat.values as any[] : [];
        const valArr = valueCol && valueCol.values ? valueCol.values as any[] : [];

        // for dates: if there is exactly one dateCat and its values look like JS Date or ISO strings,
        // use directly; else if multiple dateCats (e.g., Year + Month), reconstruct.
        let singleDateArr: any[] | null = null;
        if (dateCats && dateCats.length === 1) {
            singleDateArr = dateCats[0].values as any[];
        }

        const dateArrParts: any[] = (dateCats && dateCats.length > 1) ? dateCats.map((c: any) => c.values as any[]) : [];

        // number of rows is max of group/val and date parts
        const rows = Math.max(groupArr.length || 0, valArr.length || 0, singleDateArr ? singleDateArr.length : 0, ...dateArrParts.map(a => a.length));

        const data: SpiralDatum[] = [];

        for (let i = 0; i < rows; i++) {
            const st = groupArr && i < groupArr.length ? groupArr[i] : null;
            const v = valArr && i < valArr.length ? valArr[i] : null;
            let dateVal: Date | null = null;

            if (singleDateArr) {
                const dv = singleDateArr[i];
                if (dv instanceof Date) {
                    dateVal = dv;
                } else if (dv != null) {
                    const parsed = Date.parse(String(dv));
                    if (!isNaN(parsed)) dateVal = new Date(parsed);
                }
            } else if (dateArrParts && dateArrParts.length >= 1) {
                // try to find year and month from the parts
                let year: number | null = null;
                let month: number | null = null;
                for (const partArr of dateArrParts) {
                    const pv = partArr && i < partArr.length ? partArr[i] : null;
                    if (pv == null) continue;
                    const maybeNum = Number(pv);
                    if (!isNaN(maybeNum) && maybeNum > 31) {
                        year = Math.floor(maybeNum);
                        continue;
                    }
                    // month names or numbers
                    const mIdx = monthNameToIndex(pv);
                    if (mIdx != null) month = mIdx;
                }
                if (year == null && dateArrParts.length === 1) {
                    // maybe single numeric year as date
                    const pv = dateArrParts[0][i];
                    const pnum = Number(pv);
                    if (!isNaN(pnum)) year = Math.floor(pnum);
                }
                if (year != null) {
                    if (month == null) month = 0;
                    dateVal = new Date(year, month, 1);
                }
            }

            if (st == null || v == null || dateVal == null) continue;

            const numVal = Number(v);
            if (isNaN(numVal)) continue;

            const selectionId = this.host.createSelectionIdBuilder()
                .withCategory(groupCat, i) // 'groupCat' is the column defined around line 144
                .createSelectionId();

            data.push({ 
                subtheme: String(st), 
                date: dateVal, 
                value: numVal, 
                selectionId: selectionId // <--- Add this
            });
        }

        if (!data.length) {
            this.drawMessage("No valid rows (check Date and Value types)");
            return;
        }

        // ---- Enhanced segmented two-tone spiral layout ----
        const innerRadius = Math.min(width, height) * 0.08;
        const outerRadius = Math.min(width, height) * 0.45;

        // Define the zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([1, 8]) // Min zoom 1x, Max zoom 8x
            .on("zoom", (event) => {
        // This targets the group that holds Background, Rings, and Data
        this.gMain.attr("transform", event.transform);
    });

        // Attach zoom to the SVG (the canvas captures the mouse events)
        this.svg.call(zoom as any)
        // Initialize the position to the center of the screen
        .call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2));

        // draw a circular background centered in gMain (only the circle area)
        // define background color before creating the circle
        const bgColor = '#e1e1e1ff';
        const darkerThanBg = '#afafafff';

        // remove any prior circle bg and add a new one as the first child of gMain
        this.gMain.selectAll('.bg-circle').remove();
        this.gMain.insert('circle', ':first-child')
            .classed('bg-circle', true)
            .attr('cx', 0)
            .attr('cy', 0)
            .attr('r', outerRadius)
            .attr('fill', bgColor)
            .attr('stroke', 'none');

        const minDate = d3.min(data, d => d.date)!;
        const maxDate = d3.max(data, d => d.date)!;

        const msPerDay = 24 * 3600 * 1000;
        const daysPerTurn = 365; // keep 1 year per revolution (approx)

        data.forEach(d => {
            const tDays = (d.date.getTime() - minDate.getTime()) / msPerDay;
            (d as any).tDays = tDays;
            (d as any).turn = Math.floor(tDays / daysPerTurn);
            (d as any).withinTurn = tDays % daysPerTurn;
        });

        const maxTurn = d3.max(data, (d: any) => d.turn) || 0;
        const turns = maxTurn + 1;

        const spiralThickness = outerRadius - innerRadius;
        const turnSpacing = spiralThickness / (turns + 1);

        // value domain
        const valueExtent = d3.extent(data, d => d.value) as [number, number];
        if (!valueExtent[0] || !valueExtent[1]) {
            valueExtent[0] = valueExtent[0] || 0;
            valueExtent[1] = valueExtent[1] || 1;
        }

        // Color scale
        const colorScale = d3.scaleLinear<string>()
            .domain([valueExtent[0], valueExtent[1]])
            .range([darkerThanBg, '#000']);

        // parameters for the segments
        const barAngle = 2 * Math.PI / daysPerTurn; // angular width per day
        const segThickness = Math.max(1, turnSpacing * 0.75); // radial thickness of each segment

        // arc generator (we'll use object parameters per call)
        const arcGen = d3.arc();

        // New layout: each subtheme gets an angular slice; time moves outward (earliest inside).
        // Value determines radial extension (size) of each time segment within the slice.
        const segmentsGroup = this.gMain.append("g").classed("segments", true);

        // unique sorted time primitives (use date day precision)
        const uniqueDates = Array.from(new Set(data.map(d => d.date.getTime()))).sort((a, b) => a - b).map(t => new Date(t));
        const timeCount = uniqueDates.length || 1;
        const radialStep = (outerRadius - innerRadius) / timeCount;

        // Yearly guide rings: compute first index per year and draw faint concentric rings
        const yearsMap = new Map<number, number>();
        uniqueDates.forEach((d, idx) => {
            const y = d.getFullYear();
            if (!yearsMap.has(y)) yearsMap.set(y, idx);
        });

       // --- NEW RADAR AXIS & ORBITS ---
        const guides = this.gMain.append('g').classed('guides', true);

        guides.style('pointer-events', 'none');
        
        // 1. Draw the vertical "Time Spine" (The Axis)
        // Goes from the inner spiral edge to the outer edge
        guides.append('line')
            .attr('x1', 0)
            .attr('y1', -innerRadius)
            .attr('x2', 0)
            .attr('y2', -outerRadius - 20) // Stick out a bit
            .attr('stroke', '#555') // Dark grey spine
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '2, 2'); // Dotted spine

        // --- 1. DEFINE COLORS ---
        
        // Colors for the background tracks/bands
        const bandColors = d3.scaleOrdinal<string>()
            .domain(["2023", "2024", "2025"]) 
            .range(["#e1e1e1ff", "#a3a3a3ff", "#e1e1e1ff"])
            .unknown("#e1e1e1ff");

        // Colors for the text labels
        const textColors = d3.scaleOrdinal<string>()
            .domain(["2023", "2024", "2025"]) 
            .range(["#e1e1e1ff", "#e1e1e1ff", "#e1e1e1ff"]) 
            .unknown("#e1e1e1ff");

        // --- 2. DRAW BANDS & LABELS ---

        // Convert map to sorted array to calculate start/end indices
        const sortedYears = Array.from(yearsMap.entries())
            .map(([year, index]) => ({ year, index }))
            .sort((a, b) => a.year - b.year);

        const bandGen = d3.arc(); 

        sortedYears.forEach((item, i) => {
            const year = item.year;
            const startIndex = item.index;
            
            // Determine end index
            const nextItem = sortedYears[i + 1];
            const endIndex = nextItem ? nextItem.index : uniqueDates.length;

            const rInner = innerRadius + startIndex * radialStep;
            const rOuter = innerRadius + endIndex * radialStep;

            // Get the distinct colors
            const bColor = bandColors(String(year));
            const tColor = textColors(String(year));

            // A. Draw the Filled Band using 'bandColors'
            guides.append('path')
                .attr('d', bandGen({
                    innerRadius: rInner,
                    outerRadius: rOuter - (radialStep * 0.1), 
                    startAngle: 0,
                    endAngle: 2 * Math.PI
                } as any))
                .attr('fill', bColor)
                .attr('opacity', 0.3) 
                .attr('stroke', 'none');

            // B. Draw the Separator Line
            guides.append('circle')
                .attr('r', rInner)
                .attr('fill', 'none')
                .attr('stroke', tColor)
                .attr('stroke-width', 0.5)
                .attr('opacity', 0.5) 
                .attr('stroke-dasharray', '4, 4'); 

            // C. Draw the Label
            const labelY = -rInner; 
            const labelGroup = guides.append('g')
                .attr('transform', `translate(0, ${labelY})`);

            // Text Halo
            labelGroup.append('text')
                .attr('x', 0)
                .attr('y', 3) 
                .attr('text-anchor', 'middle')
                .attr('stroke', 'black') 
                .attr('stroke-width', 3) 
                .attr('stroke-opacity', 0.9)
                .style('font-size', '10px')
                .style('font-weight', 'bold')
                .style('font-family', 'monospace')
                .text(String(year));

            // Actual Text using 'textColors'
            labelGroup.append('text')
                .attr('x', 0)
                .attr('y', 3) 
                .attr('text-anchor', 'middle')
                .attr('fill', tColor) // <--- Use Text Color
                .style('font-size', '10px')
                .style('font-weight', 'bold')
                .style('font-family', 'monospace')
                .text(String(year));
        });

        // Apply initial visibility for year guides from the controls (if present)
        try {
            const showYears = this.yearCheckbox && this.yearCheckbox.node() ? (this.yearCheckbox.node() as HTMLInputElement).checked : true;
            guides.style('display', showYears ? null : 'none');
        } catch (e) {}

        // group data by subtheme
        const dataBySub = d3.group(data, d => d.subtheme);
        const subthemesList = Array.from(dataBySub.keys());
        const subCount = subthemesList.length || 1;

        const anglePerSub = 2 * Math.PI / subCount;
        const anglePadding = Math.min(0.02, anglePerSub * 0.08);

        const valExtent = d3.extent(data, d => d.value) as [number, number];
        const valScale = d3.scaleLinear()
            .domain([valExtent[0], valExtent[1]])
            .range([0, radialStep * 0.9]);

        // --- DATA CORE (Center KPI) ---

        // 1. Calculate the Grand Total for the "Idle" state
        const grandTotal = d3.sum(data, d => d.value);

        // 2. Create the group in the center (0,0)
        // We ensure pointer-events are 'none' so the text doesn't block mouse movements
        const centerGroup = this.gMain.append('g')
            .attr('class', 'center-kpi')
            .style('pointer-events', 'none'); 

        // 3. The "Value" Text (Big, Top)
        const centerValueText = centerGroup.append('text')
            .attr('x', 0)
            .attr('y', 0) // Centered vertically
            .attr('text-anchor', 'middle')
            .attr('fill', '#888888')
            .style('font-family', '"Segoe UI", sans-serif')
            .style('font-weight', 'bold')
            .style('font-size', Math.max(12, innerRadius * 0.25) + 'px') // Scale font based on hole size
            .text(formatCurrencyNoDecimals(grandTotal));

        // 4. The "Label" Text (Small, Bottom)
        const centerLabelText = centerGroup.append('text')
            .attr('x', 0)
            .attr('y', Math.max(12, innerRadius * 0.25) + 4)
            .attr('text-anchor', 'middle')
            .attr('fill', '#888888') // Grey text
            .style('font-family', 'monospace')
            .style('font-size', Math.max(9, innerRadius * 0.12) + 'px')
            .style('text-transform', 'uppercase')
            .style('letter-spacing', '1px')
            .text("GRAND TOTAL");
        
            // draw arcs per datum: for each subtheme, for each time index
        for (let si = 0; si < subthemesList.length; si++) {
            const sub = subthemesList[si];
            const arr = dataBySub.get(sub) || [];

            // map by date (time index)
            const mapByTime = new Map<number, SpiralDatum[]>();
            for (const d of arr) {
                const t = d.date.getTime();
                if (!mapByTime.has(t)) mapByTime.set(t, []);
                mapByTime.get(t)!.push(d);
            }

            const startAngle = si * anglePerSub + anglePadding - Math.PI / 2;
            const endAngle = (si + 1) * anglePerSub - anglePadding - Math.PI / 2;

            

            // for each time index, draw an arc representing aggregated value for that subtheme at that time
            for (let ti = 0; ti < uniqueDates.length; ti++) {
                const tMillis = uniqueDates[ti].getTime();
                const items = mapByTime.get(tMillis) || [];
                if (!items.length) continue;

                // aggregate if multiple rows (sum)
                const agg = d3.sum(items, d => d.value);

                const baseR = innerRadius + ti * radialStep;
                const ext = valScale(agg);
                const outerR = baseR + ext;

                // ensure a minimum visual thickness so thin values are still visible
                const minThickness = Math.max(2, Math.round(radialStep * 0.12));
                let extClamped = Math.max(minThickness, Math.round(ext));
                if (extClamped > radialStep - 1) extClamped = Math.max(radialStep - 1, minThickness);
                const outerRclamped = baseR + extClamped;

                const arcPath = arcGen({
                    startAngle: startAngle,
                    endAngle: endAngle,
                    innerRadius: baseR,
                    outerRadius: outerRclamped
                } as any) as string;

                const color = colorScale(agg);

                if (arcPath) {
                    const p = segmentsGroup.append("path")
                        .attr("d", arcPath)
                        .attr("fill", color)
                        .attr("stroke", "rgba(0,0,0,0.06)")
                        .attr("stroke-width", 0.6)
                        .style('cursor','default');


                    p.on("click", (event) => {
                        // 1. Get the SelectionId. 
                        // Since all items in this arc belong to the same Subtheme, 
                        // the first ID is sufficient to filter by that Subtheme.
                        const sid = items[0].selectionId;

                        // 2. Tell Power BI to select this ID
                        // The 'shiftKey' allows multi-selection (Standard PBI behavior)
                        this.selectionManager.select(sid, event.shiftKey).then((ids: ISelectionId[]) => {
                            
                            // 3. Visual Feedback: Dim items that are NOT selected
                            if (ids.length > 0) {
                                // Dim all paths
                                segmentsGroup.selectAll('path').attr('opacity', 0.2);
                                // Highlight the one we just clicked (and any others in the selection)
                                // standard trick: render the clicked one at full opacity
                                d3.select(event.currentTarget).attr('opacity', 1.0);
                            } else {
                                // If nothing is selected (ids.length === 0), reset everything
                                segmentsGroup.selectAll('path').attr('opacity', 1.0);
                            }
                        });

                        // Stop the click from bubbling up to the SVG (which might clear selection)
                        event.stopPropagation();
                    });

                    // --- UPDATED INTERACTIVITY ---
                    p.on('mousemove', (event: any) => {
                        // 1. Existing Tooltip Logic
                        const dateStr = formatDateYearMonth(new Date(tMillis));
                        const html = `<strong>${sub}</strong><br/>${dateStr}<br/><b>${formatCurrencyNoDecimals(agg)}</b>`;
                        this.tooltip
                            .style('left', (event.clientX + 12) + 'px')
                            .style('top', (event.clientY + 12) + 'px')
                            .style('display', 'block')
                            .html(html);

                        // 2. DATA CORE UPDATE (The new part)
                        
                        // Update the Big Number
                        centerValueText
                            .text(formatCurrencyNoDecimals(agg))
                            .attr('fill', '#888888')

                        // Update the Label
                        centerLabelText
                            .text(dateStr)
                            .attr('fill', '#888888');
                    })
                    
                    .on('mouseout', () => {
                        // 1. Hide Tooltip
                        this.tooltip.style('display', 'none');

                        // 2. RESET DATA CORE (Back to Grand Total)
                        
                        centerValueText
                            .text(formatCurrencyNoDecimals(grandTotal))
                            .attr('fill', '#888888')
                            //.style('text-shadow', '0 0 10px #888888');

                        centerLabelText
                            .text("GRAND TOTAL")
                            .attr('fill', '#888888');
                    });
                }
            }
        }

        // ensure guides (year rings and labels) are above the data by raising their group
        try { guides.raise(); } catch (e) { /* ignore if not supported */ }

        // --- Event markers (movie/game releases or other events) ---
        try {
            // find any category columns that declare the `eventDate` role (or legacy `releaseDate`)
            const eventDateCats = (categories as any[]).filter(c => c && c.source && c.source.roles && ((c.source.roles as any)["eventDate"] || (c.source.roles as any)["releaseDate"]));
            // event name/title column (optional)
            const eventNameCat = (categories as any[]).find(c => c && c.source && c.source.roles && ((c.source.roles as any)["eventName"] || (c.source.roles as any)["releaseName"]));

            if (eventDateCats && eventDateCats.length) {
                const eventGroupArr: any[] = eventNameCat && eventNameCat.values ? (eventNameCat.values as any[]) : [];
                let singleEventDateArr: any[] | null = null;
                if (eventDateCats.length === 1) singleEventDateArr = eventDateCats[0].values as any[];
                const eventDateParts = eventDateCats.length > 1 ? eventDateCats.map((c: any) => c.values as any[]) : [];
                const eventRows = Math.max(singleEventDateArr ? singleEventDateArr.length : 0, ...eventDateParts.map(a => a.length), eventGroupArr.length || 0);

                const releasesGroup = this.gMain.append('g').classed('releases', true);

                // Apply initial visibility for releases (movies) from the controls
                try {
                    const showMovies = this.moviesCheckbox && this.moviesCheckbox.node() ? (this.moviesCheckbox.node() as HTMLInputElement).checked : true;
                    releasesGroup.style('display', showMovies ? null : 'none');
                } catch (e) {}

                // collect events and group them by day (date-only key). Prefer table rows when available
                const eventsByDay = new Map<number, string[]>();

                // helper to add an event
                const pushEvent = (dval: Date, title: string) => {
                    if (!dval) return;
                    const dayKey = new Date(dval.getFullYear(), dval.getMonth(), dval.getDate()).getTime();
                    const arr = eventsByDay.get(dayKey) || [];
                    arr.push(title || 'Event');
                    eventsByDay.set(dayKey, arr);
                };

                // If a table representation exists and contains eventDate/eventName roles, use it first
                try {
                    const tbl: any = (dataView as any).table;
                    if (tbl && tbl.rows && tbl.columns) {
                        const colDefs = tbl.columns || [];
                        let dateColIdx: number | null = null;
                        let nameColIdx: number | null = null;
                        for (let ci = 0; ci < colDefs.length; ci++) {
                            const src = colDefs[ci].source || colDefs[ci];
                            if (!src || !src.roles) continue;
                            if ((src.roles as any)["eventDate"] || (src.roles as any)["releaseDate"]) dateColIdx = ci;
                            if ((src.roles as any)["eventName"] || (src.roles as any)["releaseName"]) nameColIdx = ci;
                        }
                        if (dateColIdx != null) {
                            for (const row of tbl.rows) {
                                const raw = row[dateColIdx];
                                let dval: Date | null = null;
                                if (raw instanceof Date) dval = raw;
                                else if (raw != null) {
                                    const p = Date.parse(String(raw));
                                    if (!isNaN(p)) dval = new Date(p);
                                }
                                if (!dval) continue;
                                const title = nameColIdx != null ? String(row[nameColIdx] || '') : '';
                                pushEvent(dval, title);
                            }
                        }
                    }
                } catch (e) {
                    // ignore table parse failures and fall back to categorical parsing below
                }

                // If table fallback didn't yield anything, parse categorical arrays
                if (eventsByDay.size === 0) {
                    for (let i = 0; i < eventRows; i++) {
                        let dateVal: Date | null = null;
                        if (singleEventDateArr) {
                            const dv = singleEventDateArr[i];
                            if (dv instanceof Date) dateVal = dv;
                            else if (dv != null) {
                                const parsed = Date.parse(String(dv));
                                if (!isNaN(parsed)) dateVal = new Date(parsed);
                            }
                        } else if (eventDateParts && eventDateParts.length) {
                            let year: number | null = null;
                            let month: number | null = null;
                            for (const partArr of eventDateParts) {
                                const pv = partArr && i < partArr.length ? partArr[i] : null;
                                if (pv == null) continue;
                                const pnum = Number(pv);
                                if (!isNaN(pnum) && pnum > 31) year = Math.floor(pnum);
                                else {
                                    const mIdx = monthNameToIndex(pv);
                                    if (mIdx != null) month = mIdx;
                                }
                            }
                            if (year != null) {
                                if (month == null) month = 0;
                                dateVal = new Date(year, month, 1);
                            }
                        }
                        if (!dateVal) continue;
                        const nameVal = eventGroupArr && i < eventGroupArr.length ? String(eventGroupArr[i]) : '';
                        pushEvent(dateVal, nameVal);
                    }
                }

                // If no events were found via categorical parsing, try a table-based fallback
                if (eventsByDay.size === 0 && (dataView as any).table && (dataView as any).table.rows && (dataView as any).table.columns) {
                    try {
                        const tbl: any = (dataView as any).table;
                        const colDefs = tbl.columns || [];
                        let dateColIdx: number | null = null;
                        let nameColIdx: number | null = null;
                        for (let ci = 0; ci < colDefs.length; ci++) {
                            const src = colDefs[ci].source || colDefs[ci];
                            if (!src || !src.roles) continue;
                            if ((src.roles as any)["eventDate"] || (src.roles as any)["releaseDate"]) dateColIdx = ci;
                            if ((src.roles as any)["eventName"] || (src.roles as any)["releaseName"]) nameColIdx = ci;
                        }

                        if (dateColIdx != null) {
                            for (const row of tbl.rows) {
                                const raw = row[dateColIdx];
                                let dval: Date | null = null;
                                if (raw instanceof Date) dval = raw;
                                else if (raw != null) {
                                    const p = Date.parse(String(raw));
                                    if (!isNaN(p)) dval = new Date(p);
                                }
                                if (!dval) continue;
                                const title = nameColIdx != null ? String(row[nameColIdx] || '') : '';
                                const dayKey = new Date(dval.getFullYear(), dval.getMonth(), dval.getDate()).getTime();
                                const arr = eventsByDay.get(dayKey) || [];
                                arr.push(title || 'Event');
                                eventsByDay.set(dayKey, arr);
                            }
                        }
                    } catch (e) {
                        // ignore fallback failures
                    }
                }

                // add small drop shadow filter if needed
                let defsSel = this.svg.select('defs');
                if (defsSel.empty()) defsSel = this.svg.append('defs');
                if (defsSel.select('#evtDrop').empty()) {
                    const f = defsSel.append('filter').attr('id', 'evtDrop');
                    f.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 2).attr('result', 'blur');
                    f.append('feOffset').attr('in', 'blur').attr('dx', 0).attr('dy', 1).attr('result', 'off');
                    const feMerge = f.append('feMerge');
                    feMerge.append('feMergeNode').attr('in', 'off');
                    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');
                }

                

                // Normalize events: trim, remove empty strings and duplicates so
                // tooltips and counts reflect unique releases only.
                for (const [k, arr] of Array.from(eventsByDay.entries())) {
                    const cleaned = Array.from(new Set((arr || [])
                        .map((s: any) => String(s || '').trim())
                        .filter((s: string) => s.length > 0)));
                    eventsByDay.set(k, cleaned);
                }

                // render one marker per date; compute radial position relative to full date range (minDate..maxDate)
                const fullDays = Math.max(1, Math.round((maxDate.getTime() - minDate.getTime()) / msPerDay));
                for (const [dayKey, titles] of Array.from(eventsByDay.entries()).sort((a, b) => a[0] - b[0])) {
                    const dateVal = new Date(dayKey);
                    const tDays = (dateVal.getTime() - minDate.getTime()) / msPerDay;
                    const frac = Math.max(0, Math.min(1, tDays / fullDays));
                    const rPos = innerRadius + frac * (outerRadius - innerRadius);

                    const yearStart = new Date(dateVal.getFullYear(), 0, 1).getTime();
                    const withinDays = (dateVal.getTime() - yearStart) / msPerDay;
                    // Position date markers with a 240° offset (moved from previous 90°).
                    const angle = 2 * Math.PI * (withinDays / daysPerTurn) + (240 * Math.PI / 180);

                    const cx = rPos * Math.cos(angle);
                    const cy = rPos * Math.sin(angle);

                    // Render event as a full circular ring at the computed radial position
                    // (a full circle centered at 0,0 with radius=rPos). This matches the year guide rings.
                    const eventRing = releasesGroup.append('circle')
                        .attr('cx', 0)
                        .attr('cy', 0)
                        .attr('r', rPos)
                        .attr('fill', 'none')
                        .attr('stroke', '#4b4b4bff')
                        .attr('stroke-width', 1.6)
                        .attr('stroke-linecap', 'round')
                        .attr('opacity', 0.55)
                        .style('pointer-events', 'stroke');

                    // make the entire ring interactive: hovering anywhere on the stroke shows the tooltip
                    eventRing.on('mousemove', (event: any) => {
                        const dateStr = formatDateYearMonth(dateVal);
                        const html = `<strong>${titles.length} event${titles.length > 1 ? 's' : ''}</strong><br/>${dateStr}<br/>${titles.map((t: any) => `• ${t}`).join('<br/>')}`;
                        this.tooltip
                            .style('left', (event.clientX + 12) + 'px')
                            .style('top', (event.clientY + 12) + 'px')
                            .style('display', 'block')
                            .html(html);
                    }).on('mouseout', () => this.tooltip.style('display', 'none'));

                    // For tooltip on demand, add a small invisible hit area at the event point
                    const hit = releasesGroup.append('circle')
                        .attr('cx', cx)
                        .attr('cy', cy)
                        .attr('r', Math.max(6, Math.min(14, radialStep * 0.6)))
                        .attr('fill', 'transparent')
                        .style('cursor', 'pointer');

                    hit.on('mousemove', (event: any) => {
                        const dateStr = formatDateYearMonth(dateVal);
                        const html = `<strong>${titles.length} event${titles.length > 1 ? 's' : ''}</strong><br/>${dateStr}<br/>${titles.map(t => `• ${t}`).join('<br/>')}`;
                        this.tooltip
                            .style('left', (event.clientX + 12) + 'px')
                            .style('top', (event.clientY + 12) + 'px')
                            .style('display', 'block')
                            .html(html);
                    });
                    hit.on('mouseout', () => this.tooltip.style('display', 'none'));

                    const labelRadius = outerRadius + 18;
                    const lx = labelRadius * Math.cos(angle);
                    const ly = labelRadius * Math.sin(angle);
                }

                try { releasesGroup.raise(); } catch (e) { }
            }
        } catch (e) {
            // ignore event rendering errors
        }

        // Add a small color legend (horizontal bar) to the right
        const legendWidth = Math.min(200, width * 0.4);
        const legendHeight = 12;
        const legendX = outerRadius + 20;
        const legendY = outerRadius - legendHeight;

        // defs for gradient
        const defs = this.svg.append("defs");
        const gradId = "spiralGradient";
        const gradient = defs.append("linearGradient")
            .attr("id", gradId)
            .attr("x1", "0%")
            .attr("x2", "100%")
            .attr("y1", "0%")
            .attr("y2", "0%");

        // sample stops
        const stops = 10;
        for (let i = 0; i <= stops; i++) {
            const t = i / stops;
            gradient.append("stop")
                .attr("offset", `${t * 100}%`)
                .attr("stop-color", colorScale(valueExtent[0] + (valueExtent[1] - valueExtent[0]) * t));
        }

        this.gMain.append("rect")
            .attr("x", legendX)
            .attr("y", legendY)
            .attr("width", legendWidth)
            .attr("height", legendHeight)
            .attr("fill", `url(#${gradId})`)
            .attr("stroke", "#555")
            .attr("stroke-width", 0.5)
            .attr('opacity', 0.95);

        this.gMain.append("text")
            .attr("x", legendX + legendWidth / 2)
            .attr("y", legendY + legendHeight + 14)
            .attr("text-anchor", "middle")
            .attr("fill", "#ccc")
            .style("font-size", "10px")
            .text(`${valueExtent[0].toFixed(1)} — ${valueExtent[1].toFixed(1)}`);

        // Title removed per user request
        } catch (err) {
            // render error fallback: show a message on the visual and log to console
            try {
                const msg = (err && (err as any).message) ? (err as any).message : String(err);
                this.gMain.selectAll('*').remove();
                this.drawMessage('Render error: ' + msg);
            } catch (e) {
                // swallow
            }
            // also log to the browser console if available
            try { console.error(err); } catch (e) {}
            return;
        }
    }

    private drawMessage(msg: string) {
        this.gMain.append("text")
            .attr("x", 0)
            .attr("y", 0)
            .attr("text-anchor", "middle")
            .attr("fill", "#ccc")
            .style("font-size", "11px")
            .text(msg);
    }
}