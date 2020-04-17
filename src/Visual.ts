/*
 *  Power BI Visual CLI
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ''Software''), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

module powerbi.extensibility.visual {
    import ISelectionId = powerbi.visuals.ISelectionId;
    import valueFormatter = powerbi.extensibility.utils.formatting.valueFormatter;
    import IValueFormatter = powerbi.extensibility.utils.formatting.IValueFormatter;
    import textMeasurementService = powerbi.extensibility.utils.formatting.textMeasurementService;
    import TextProperties = powerbi.extensibility.utils.formatting.TextProperties;
    import IVisual = powerbi.extensibility.visual.IVisual;
    import IVisualHost = powerbi.extensibility.visual.IVisualHost;
    import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
    import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
    import ISelectionManager = powerbi.extensibility.ISelectionManager;
    import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
    import IColorPalette = powerbi.extensibility.IColorPalette;
    import tooltip = powerbi.extensibility.utils.tooltip;
    import ITooltipServiceWrapper = powerbi.extensibility.utils.tooltip.ITooltipServiceWrapper;
    import createTooltipServiceWrapper = powerbi.extensibility.utils.tooltip.createTooltipServiceWrapper;

    export interface ITooltipEventArgs<TData> {
        data: TData;
        coordinates: number[];
        elementCoordinates: number[];
        context: HTMLElement;
        isTouchEvent: boolean;
    }

    function subCategoryVis(dataView: DataView, dicVar: any) {
        for (const dataViewColumn of dataView.metadata.columns) {
            if (dataViewColumn.roles.hasOwnProperty('subCategory')) {
                dicVar.scExists = true;
                dicVar.subCategorySource = dataViewColumn.displayName;
                dicVar.subCategoryFormatter = dataViewColumn.format;
            } else {
                if (dataViewColumn.groupName) {
                    dicVar.groupNum = dicVar.groupNum + 1;
                    if (dicVar.groupNum > 1) {
                        dicVar.scExists = true;
                    }
                }
            }
            if (dataViewColumn.roles.hasOwnProperty('primaryMeasure')) {
                dicVar.isPMExists = true;
            }
            if (dataViewColumn.roles.hasOwnProperty('secondaryMeasure')) {
                dicVar.isSMExists = true;
            }

        }
    }
    function printWholeVis(group, dicVar, uniqueSubCategories, dataViews, dataView, legendDataPoints, hfDataPoints) {
        if (!!group && group.values && group.values[0] && group.values[0].values) {
            let catFormatter: utils.formatting.IValueFormatter;

            for (let i: number = 0; i < group.values[0].values.length; i++) {
                if (group.name instanceof Date) {
                    catFormatter = valueFormatter.create({
                        format: 'dddd MMMM %d yyyy'
                    });
                } else {
                    catFormatter = valueFormatter.create({
                        format: dicVar.subCategoryFormatter
                    });
                }
                if (group.values[0].values[i] !== null && group.values[0].values[i] >= 0) {
                    const hfDataPoint: IHFDataPoint = {
                        primaryVal: 0,
                        secondaryVal: 0,
                        category: '',
                        subCategory: '',
                        color: '',
                        selectionId: null,
                        tooltipData: []
                    };
                    hfDataPoint.subCategory = group.name ? catFormatter.format(group.name) : '';
                    if (!!hfDataPoint.subCategory
                        && hfDataPoint.subCategory !== ''
                        && uniqueSubCategories.indexOf(hfDataPoint.subCategory) < 0) {
                        uniqueSubCategories.push(hfDataPoint.subCategory);
                    }
                    // ignoring the category for tooltips
                    let tooltipDataPoint: ITooltipDataPoints = {
                        formatter: '',
                        name: dicVar.subCategorySource,
                        value: hfDataPoint.subCategory
                    };
                    hfDataPoint.tooltipData.push(tooltipDataPoint);
                    const catlength: number = (dataViews[0].categorical && dataViews[0].categorical.categories) ?
                        dataViews[0].categorical.categories.length : 0;
                    for (let cat1: number = 0; cat1 < catlength; cat1++) {
                        if (dataView.categorical.categories[cat1].source.roles.hasOwnProperty('category')) {
                            const catData: DataViewCategoryColumn = dataView.categorical.categories[cat1];
                            dicVar.categoryFormatter = catData.source.format;
                            catFormatter = valueFormatter.create({
                                format: dicVar.categoryFormatter
                            });
                            hfDataPoint.category = catData.values[i] ?
                                catFormatter.format(catData.values[i]) : '';
                            dicVar.categoryExists = true;
                        }
                    }
                    for (let k: number = 0; k < group.values.length; k++) {
                        if (group.values[k].source.roles.hasOwnProperty('primaryMeasure')) {
                            dicVar.primaryMeasureName = group.values[k].source.displayName;
                            dicVar.primaryFormatter = group.values[k].source.format ?
                                group.values[k].source.format : valueFormatter.DefaultNumericFormat;
                            hfDataPoint.primaryVal = (Number(group.values[k].values[i]));
                            if (!dicVar.categoryExists) {
                                dicVar.primaryValMax = dicVar.primaryValMax < hfDataPoint.primaryVal ? hfDataPoint.primaryVal : dicVar.primaryValMax;
                            }
                        } else if (group.values[k].source.roles.hasOwnProperty('secondaryMeasure')) {
                            dicVar.secondaryMeasureName = group.values[k].source.displayName;
                            dicVar.secondaryFormatter = group.values[k].source.format ?
                                group.values[k].source.format : valueFormatter.DefaultNumericFormat;
                            hfDataPoint.secondaryVal = (Number(group.values[k].values[i]));
                            if (!dicVar.categoryExists) {
                                dicVar.secondaryValMax = dicVar.secondaryValMax < hfDataPoint.secondaryVal ?
                                    hfDataPoint.secondaryVal : dicVar.secondaryValMax;
                            }
                        }
                        tooltipDataPoint = {
                            formatter: !!group.values[k].source.format ?
                                group.values[k].source.format : valueFormatter.DefaultNumericFormat,
                            name: group.values[k].source.displayName,
                            value: group.values[k].values[i] ? (group.values[k].values[i].toString()) : ''
                        };
                        hfDataPoint.tooltipData.push(tooltipDataPoint);
                    }
                    hfDataPoint.color = getColor(legendDataPoints, hfDataPoint.subCategory);
                    hfDataPoint.selectionId = getSelectionId(legendDataPoints, hfDataPoint.subCategory);
                    hfDataPoints.push(hfDataPoint);
                }
            }
        }
    }
    function printData(hfDataPoints, hfData, varl, uniqueSubCategories, i) {
        for (let j: number = 0; j < hfDataPoints.length; j++) {
            if (uniqueSubCategories[i] === hfDataPoints[j].subCategory) {
                varl.primarySum += hfDataPoints[j].primaryVal;
                varl.secondarySum += hfDataPoints[j].secondaryVal;
                hfData.subCategory = hfDataPoints[j].subCategory;
                hfData.color = hfDataPoints[j].color;
                hfData.selectionId = hfDataPoints[j].selectionId;
                // handling tooltip aggregated values
                if (hfDataPoints[j].tooltipData && hfDataPoints[j].tooltipData[1] && hfDataPoints[j].tooltipData[1].value) {
                    hfDataPoints[j].tooltipData[1].value = varl.primarySum.toString();
                }
                if (hfDataPoints[j].tooltipData && hfDataPoints[j].tooltipData[2] && hfDataPoints[j].tooltipData[2].value) {
                    hfDataPoints[j].tooltipData[2].value = varl.secondarySum.toString();
                }
                hfData.tooltipData = hfDataPoints[j].tooltipData;
            }
        }
    }
    function printBow(hfDataPoints, uniqueCategories, uniqueCategoriesValues, arrCategory, bowtieDataPoints) {
        for (let i: number = 0; i < hfDataPoints.length; i++) {
            const bowtieDataPoint: IBowtieDataPoint = { source: '', destination: '', value: 0, SourceArcWidth: 0 };
            if (!!hfDataPoints[i].category && hfDataPoints[i].subCategory !== '' && hfDataPoints[i].category !== '' && arrCategory.indexOf(hfDataPoints[i].category) < 0) {
                uniqueCategories.push(hfDataPoints[i].category);
                uniqueCategoriesValues[hfDataPoints[i].category] = 0;
                arrCategory.push(hfDataPoints[i].category);
                bowtieDataPoint.source = hfDataPoints[i].category;
                bowtieDataPoint.destination = hfDataPoints[i].subCategory;
                bowtieDataPoint.value = hfDataPoints[i].primaryVal;
                bowtieDataPoints.push(bowtieDataPoint);
            }
        }
    }
    function visualTransform(options: VisualUpdateOptions, host: IVisualHost): IHFViewModel {
        const dataViews: DataView[] = options.dataViews;
        const viewModel: IHFViewModel = {
            hfDataPoints: [], bowtieDataPoint: [], primaryValMax: 0, secondaryValMax: 0, primaryMeasureName: '', secondaryMeasureName: '', primaryExists: false, secondaryExists: false,
            categoryExists: false, subCategoryExists: false, primaryFormatter: '', secondaryFormatter: '', categoryFormatter: '', subCategoryFormatter: '', hfTotalDataPoints: []
        };
        if (!dataViews || !dataViews[0] || !dataViews[0].categorical || !dataViews[0].categorical.values) return viewModel;
        let dicVar = {
            scExists: false, subCategorySource: '', subCategoryFormatter: '', primaryValMax: 0, secondaryValMax: 0, primaryMeasureName: '', isPMExists: false, secondaryMeasureName: '',
            isSMExists: false, primaryFormatter: '', secondaryFormatter: '', categoryFormatter: '', groupNum: 0, categoryExists: false
        };
        const dataView: DataView = dataViews[0];
        const groups: DataViewValueColumnGroup[] = dataView.categorical.values.grouped();
        const hfDataPoints: IHFDataPoint[] = [];
        const colorPalette: IColorPalette = host.colorPalette;
        const uniqueSubCategories: string[] = [];
        const grouped: DataViewValueColumnGroup[] = dataView.categorical.values.grouped();
        if (grouped.length > 0) {
            subCategoryVis(dataView, dicVar);
            const legendDataPoints: ILegendDataPoints[] = grouped.map((group: DataViewValueColumnGroup, index: number) => {
                const defaultColor: Fill = {
                    solid: {
                        color: colorPalette.getColor(group.name ? <any>group.name : '').value
                    }
                };
                let catFormatter: utils.formatting.IValueFormatter;
                if (group.name instanceof Date) {
                    catFormatter = valueFormatter.create({
                        format: 'dddd MMMM %d yyyy'
                    });
                } else {
                    catFormatter = valueFormatter.create({
                        format: dicVar.subCategoryFormatter
                    });
                }
                return {
                    category: group.name ? catFormatter.format(group.name) : '',
                    color: enumSettings.DataViewObjects.getValueOverload<Fill>(group.objects, 'dataPoint', 'fill', defaultColor).solid.color,
                    identity: host.createSelectionIdBuilder().withSeries(dataView.categorical.values, group).createSelectionId()
                };
            });
            groups.forEach((group: DataViewValueColumnGroup) => {
                printWholeVis(group, dicVar, uniqueSubCategories, dataViews, dataView, legendDataPoints, hfDataPoints);
            });
        }
        // Aggregate the primary and secondary values based on sub category
        let hfDataPointFinal: IHFDataPoint[] = [];
        if (dicVar.categoryExists) {
            for (let i: number = 0; i < uniqueSubCategories.length; i++) {
                let varl = { primarySum: 0, secondarySum: 0 };
                const hfData: IHFDataPoint = {
                    primaryVal: 0, secondaryVal: 0, subCategory: '', category: '', color: '', selectionId: null, tooltipData: []
                };
                printData(hfDataPoints, hfData, varl, uniqueSubCategories, i);
                dicVar.primaryValMax = dicVar.primaryValMax < varl.primarySum ? varl.primarySum : dicVar.primaryValMax;
                dicVar.secondaryValMax = dicVar.secondaryValMax < varl.secondarySum ? varl.secondarySum : dicVar.secondaryValMax;
                hfData.primaryVal = varl.primarySum;
                hfData.secondaryVal = varl.secondarySum;
                hfDataPointFinal.push(hfData);
            }
        } else {
            // Remove if sub category is empty
            hfDataPointFinal = hfDataPoints.filter((ele: IHFDataPoint): boolean => {
                return ele.subCategory !== '';
            });
        }
        const bowtieDataPoints: IBowtieDataPoint[] = [];
        let uniqueCategories: string[] = [];
        let uniqueCategoriesValues: number[] = [];
        if (dicVar.categoryExists) {
            const arrCategory: string[] = [];
            printBow(hfDataPoints, uniqueCategories, uniqueCategoriesValues, arrCategory, bowtieDataPoints)
            for (let i: number = 0; i < hfDataPoints.length; i++) {
                uniqueCategoriesValues[hfDataPoints[i].category] += hfDataPoints[i].primaryVal;
            }
            for (let i: number = 0; i < bowtieDataPoints.length; i++) {
                bowtieDataPoints[i].value = uniqueCategoriesValues[bowtieDataPoints[i].source];
            }
        }
        viewModel.hfDataPoints = hfDataPointFinal;
        viewModel.hfTotalDataPoints = hfDataPoints;
        viewModel.bowtieDataPoint = bowtieDataPoints;
        viewModel.primaryValMax = dicVar.primaryValMax;
        viewModel.secondaryValMax = dicVar.secondaryValMax;
        viewModel.primaryExists = dicVar.isPMExists;
        viewModel.secondaryExists = dicVar.isSMExists;
        viewModel.categoryExists = dicVar.categoryExists;
        viewModel.subCategoryExists = dicVar.scExists;
        viewModel.primaryMeasureName = dicVar.primaryMeasureName;
        viewModel.secondaryMeasureName = dicVar.secondaryMeasureName;
        viewModel.primaryFormatter = dicVar.primaryFormatter;
        viewModel.secondaryFormatter = dicVar.secondaryFormatter;
        viewModel.categoryFormatter = dicVar.categoryFormatter;
        viewModel.subCategoryFormatter = dicVar.subCategoryFormatter;
        return viewModel;
    }

    function getColor(legendDataPoints: ILegendDataPoints[], name: string): string {
        let color: string = '';
        legendDataPoints.forEach((element: ILegendDataPoints) => {
            if (element.category === name) {
                color = element.color;
            }
        });
        return color;
    }

    function getSelectionId(legendDataPoints: ILegendDataPoints[], name: string): powerbi.visuals.ISelectionId {
        let selectionId: visuals.ISelectionId = null;
        legendDataPoints.forEach((element: ILegendDataPoints) => {
            if (element.category === name) {
                selectionId = element.identity;
            }

        });

        return selectionId;
    }

    export class HorizontalFunnelSource implements IVisual {
        public host: IVisualHost;
        private tooltipServiceWrapper: ITooltipServiceWrapper;
        private root: d3.Selection<SVGElement>;
        private rootDiv: d3.Selection<SVGElement>;
        private dataView: DataView;
        private events: IVisualEventService;
        private style: CSSStyleDeclaration;
        private selectionManager: ISelectionManager;
        private dataViewModel: IHFViewModel;
        private filterName: string;
        private filterID: string;
        private labelSettings: ILabelSettings;
        private gradientColors: IGradientColors;
        private secondaryLabelSettings: ILabelSettings;
        private connectorSettings: IConnectorSettings;
        // object to handle selections
        private barSelection: any;
        private ymax: number;
        private index: number = 0;
        private percentageVal: number[] = [];
        private dimension: string;
        private color: string;
        private fontsize: number;
        private viewport: IViewport;
        private catLength: number;
        private parentWidth: number;
        private parentHeight: number;
        private width: number;
        private height: number;
        private element: d3.Selection<SVGElement>;
        private classname: string;
        private oddsvg: d3.Selection<SVGElement>;
        private y: number;
        private val: number = 1;
        private evensvg: d3.Selection<SVGElement>;
        private nextyheight: number;
        private prevyheight: number;
        private areafillheight: number[] = [];
        private visualHeight: number;

        constructor(options: VisualConstructorOptions) {
            this.host = options.host;
            this.root = d3.select(options.element);
            this.events = options.host.eventService;
            this.rootDiv = this.root.append('div')
                .classed('rootDiv', true);
            this.style = options.element.style;
            const cPalette: IColorPalette = options.host.colorPalette;
            this.tooltipServiceWrapper = createTooltipServiceWrapper(this.host.tooltipService, options.element);
            this.selectionManager = options.host.createSelectionManager();
            // function call to handle selections on bookmarks
            this.selectionManager.registerOnSelectCallback(() => {
                this.barSelection = this.root.selectAll('.hf_datapoint');
                this.syncSelectionState(
                    this.barSelection,
                    <ISelectionId[]>this.selectionManager.getSelectionIds()
                );
            });

            this.filterName = '';
            this.filterID = '';
        }

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
            const enumeration: VisualObjectInstance[] = [];

            const labelSettings: ILabelSettings = this.labelSettings;
            const gradientColors: IGradientColors = this.gradientColors;
            const secondaryLabelSettings: ILabelSettings = this.secondaryLabelSettings;
            const connectorSettings: IConnectorSettings = this.connectorSettings;

            switch (options.objectName) {
                case 'dataPoint':
                    for (const hfDataPoint of this.dataViewModel.hfDataPoints) {
                        enumeration.push({
                            objectName: 'dataPoint',
                            displayName: hfDataPoint.subCategory,
                            properties: {
                                fill: {
                                    solid: {
                                        color: hfDataPoint.color
                                    }
                                }
                            },
                            selector: hfDataPoint.selectionId.getSelector()
                        });
                    }
                    break;
                case 'labels':
                    enumeration.push({
                        objectName: 'labels',
                        properties: {
                            fontColor: labelSettings.color,
                            labelDisplayUnits: labelSettings.displayUnits,
                            labelPrecision: labelSettings.decimalPlaces
                        },
                        selector: null
                    });
                    break;

                case 'secondaryLabels':
                    if (this.dataViewModel && this.dataViewModel.secondaryExists) {
                        enumeration.push({
                            objectName: 'secondaryLabels',
                            properties: {
                                fontColor: secondaryLabelSettings.color,
                                labelDisplayUnits: secondaryLabelSettings.displayUnits,
                                labelPrecision: secondaryLabelSettings.decimalPlaces
                            },
                            selector: null
                        });
                    }
                    break;
                case 'gradientColors':
                    enumeration.push({
                        objectName: 'gradientColors',
                        properties: {
                            minColor: gradientColors.minColor,
                            maxColor: gradientColors.maxColor
                        },
                        selector: null
                    });
                    break;
                case 'connector':
                    enumeration.push({
                        objectName: 'connector',
                        properties: {
                            show: connectorSettings.show,
                            color: connectorSettings.color
                        },
                        selector: null
                    });
                    break;
                default:
                    break;
            }

            return enumeration;
        }
        public renderBowtieLoop(numberOfCategories, bowTieData, bowTieWidth, divisionHeight) {
            for (let i: number = 0; i < numberOfCategories; i++) {
                if (bowTieData[i] && bowTieData[i].source) {
                    const sourceVal: string = bowTieData[i].source;
                    const textProps: TextProperties = {
                        text: sourceVal,
                        fontFamily: 'SEGOE UI',
                        fontSize: '12px'
                    };
                    const maxWidth: number = (bowTieWidth / 2) * 0.7;
                    const trimmedText: string = textMeasurementService.getTailoredTextOrDefault(textProps, maxWidth);
                    const labelItem: d3.Selection<SVGElement> = this.root.select('.hfb_bowtie .bowtie_labels')
                        .append('div')
                        .style({
                            height: `${divisionHeight}px`,
                            width: `${bowTieWidth / 2}px`
                        });

                    // adding the circles of the labels
                    labelItem
                        .append('span')
                        .style({
                            height: `${divisionHeight}px`,
                            width: '15px'
                        })
                        .attr('title', sourceVal)
                        .classed('hfbowtie_labelItem', true)
                        .attr('id', `hfb_label_${i}$$circle`)
                        .append('svg')
                        .classed('hfb_circle', true)
                        .style({
                            height: `${divisionHeight}px`,
                            width: '15px'
                        })
                        .append('circle')
                        .attr('id', `hfb_label_${i}_circle`)
                        .classed('hfb_circle', true)
                        .attr({
                            r: 5,
                            stroke: 'rgb(1, 184, 170)',
                            fill: '#FFF',
                            cy: divisionHeight / 2,
                            cx: 5.5
                        });

                    // adding the labels
                    labelItem.append('span')
                        .text(trimmedText)
                        .attr('title', sourceVal)
                        .style({
                            position: 'absolute',
                            'line-height': `${divisionHeight}px`,
                            'margin-right': '15px',
                            'font-size': '12px',
                            'text-align': 'end',
                            width: `${(bowTieWidth / 2) - 20}px`
                        })
                        .classed('hfbowtie_labelItem', true)
                        .attr('id', `hfb_label_${i}$$label`);
                }
            }
        }
        public renderBowtie(viewport: IViewport): void {
            const bowTieHeight: number = viewport.height;
            const bowTieWidth: number = viewport.width * 0.2;
            // code to create bow tie chart
            const bowTieData: IBowtieDataPoint[] = this.dataViewModel &&
                this.dataViewModel.bowtieDataPoint ? this.dataViewModel.bowtieDataPoint : [];
            if (bowTieData.length) {
                this.rootDiv.append('div')
                    .classed('hfb_bowtie', true).style({
                        height: `${bowTieHeight}px`, width: `${bowTieWidth}px`
                    });
                let availableHeight: number = viewport.height;
                const numberOfValues: number = this.dataViewModel.bowtieDataPoint.length;
                const textPropertiesForLabel: TextProperties = {
                    text: 'X', fontFamily: 'Segoe UI', fontSize: '12px'
                };
                const numberOfValuesHeight: number = textMeasurementService.measureSvgTextHeight(textPropertiesForLabel) * numberOfValues;
                if (numberOfValuesHeight > availableHeight) {
                    availableHeight = numberOfValuesHeight;
                    this.root.select('.rootDiv').style('overflow-y', 'auto');
                    this.root.select('.hfb_bowtie').style('height', `${availableHeight}px`);
                } else {
                    this.root.select('.rootDiv').style('overflow-y', 'hidden');
                }
                this.root.select('.rootDiv').style('overflow-x', 'hidden');
                const bowtieDiv: d3.Selection<SVGElement> = this.root.select('.hfb_bowtie');
                bowtieDiv.append('div').classed('bowtie_labels', true).style({ width: `${bowTieWidth / 2}px`, height: `${availableHeight}px` });
                const bowtieSVG: d3.Selection<SVGElement> = bowtieDiv.append('div').classed('bowtie_arcs', true).style({ width: `${bowTieWidth / 2}px`, height: `${availableHeight}px` });
                const numberOfCategories: number = bowTieData.length;
                const divisionHeight: number = availableHeight / numberOfCategories;
                this.renderBowtieLoop(numberOfCategories, bowTieData, bowTieWidth, divisionHeight);
                const fStartX: number = 0;
                let fStartY: number = 0;
                const fBranchHeight: number = 50;
                const fEndX: number = bowTieWidth / 2;
                let fEndY: number = availableHeight / 2 - fBranchHeight / 2;
                const fCurveFactor: number = 0.25;
                const sum: number = 0;
                let aggregatedSum: number = 0;
                bowTieData.forEach((value: IBowtieDataPoint): void => {
                    aggregatedSum += value.value;
                });
                bowTieData.forEach((value: IBowtieDataPoint): void => {
                    value.SourceArcWidth = value.value / aggregatedSum;
                });
                // Creating SVG
                const svg: d3.Selection<SVGElement> = bowtieSVG.append('svg')
                    .style({ width: `${bowTieWidth / 2}px`, height: `${availableHeight}px` })
                    .classed('bowtie_arcs_svg', true);
                // Code for SVG Path
                for (let iDiv: number = 0; iDiv < numberOfCategories; iDiv++) {
                    const percentage: number = bowTieData[iDiv].value / aggregatedSum;
                    let height1: number = (bowTieData[iDiv].SourceArcWidth * fBranchHeight);
                    fStartY = ((iDiv) * divisionHeight) + divisionHeight / 2;
                    const fPipeArea: number = Math.abs(fStartX - fEndX);
                    height1 = height1 > 1 ? height1 : 1;
                    fEndY += (height1 / 2);
                    if (iDiv > 0) {
                        if ((bowTieData[iDiv - 1].SourceArcWidth * fBranchHeight) > 1) {
                            fEndY += ((bowTieData[iDiv - 1].SourceArcWidth * fBranchHeight) / 2);
                        } else {
                            fEndY += 0.5;
                        }
                    }
                    const d: string = `M ${fStartX} ${fStartY} C ${fEndX - (fPipeArea * fCurveFactor)} ${fStartY} ` +
                        `${fStartX + (fPipeArea * fCurveFactor)} ${fEndY} ${fEndX} ${fEndY}`;
                    // Gradient colors
                    let minGradientValue: number = 9999999999999;
                    let maxGradientValue: number = 0;
                    bowTieData.forEach((element: IBowtieDataPoint) => {
                        if (!!element && !!element.value) {
                            const eleValue: string = element.value.toString();
                            if (parseFloat(eleValue) < minGradientValue) {
                                minGradientValue = parseFloat(eleValue);
                            }
                            if (parseFloat(eleValue) > maxGradientValue) {
                                maxGradientValue = parseFloat(eleValue);
                            }
                        }
                    });
                    const colorScale: d3.scale.Linear<number, number> = d3.scale.linear()
                        .domain([minGradientValue, maxGradientValue]).range([0, 1]);
                    const colors: any = d3.interpolateRgb(this.gradientColors.minColor, this.gradientColors.maxColor);
                    const arcColor: string = colors(colorScale(bowTieData[iDiv].value));
                    svg.append('path')
                        .attr('d', d).attr('title', bowTieData[iDiv].source).classed('hfbowtie_labelItem', true)
                        .attr('id', `hfb_label_${iDiv}$$arc`).attr('stroke', arcColor).attr('fill', 'none')
                        .attr('stroke-width', height1).append('title').text(bowTieData[iDiv].source);
                    // adding gradient color to the label circles
                    const labelCircle: JQuery = $(`.hfbowtie_labelItem #hfb_label_${iDiv}_circle`);
                    if (labelCircle && labelCircle.length) {
                        labelCircle.attr('stroke', arcColor);
                    }
                }
            }
        }
        public onSelect(THIS: any, options: VisualUpdateOptions, filterName: string, originalMaxValue: number) {
            if (filterName.length) {
                const filteredData: IHFDataPoint[] = THIS.dataViewModel.hfTotalDataPoints
                    .filter((obj: IHFDataPoint): boolean => {
                        return obj.category.toLowerCase() === filterName;
                    });

                const arrUpdated: number[] = [];
                THIS.dataViewModel.hfDataPoints.forEach((obj: IHFDataPoint, arrIndex: number): void => {
                    for (let k: number = 0; k < filteredData.length; k++) {
                        if (obj.subCategory === filteredData[k].subCategory) {
                            obj.primaryVal = filteredData[k].primaryVal;
                            obj.secondaryVal = filteredData[k].secondaryVal;
                            if (!!obj.tooltipData[1]
                                && obj.tooltipData[1].value) {
                                obj.tooltipData[1].value = filteredData[k].primaryVal.toString();
                            }
                            if (!!obj.tooltipData[2]
                                && obj.tooltipData[2].value) {
                                obj.tooltipData[2].value = filteredData[k].secondaryVal.toString();
                            }
                            arrUpdated.push(arrIndex);
                        }
                    }
                });
                const primaryValues: number[] = [];

                THIS.dataViewModel.hfDataPoints.forEach((obj: IHFDataPoint, arrIndex: number): void => {
                    if (arrUpdated.indexOf(arrIndex) < 0) {
                        obj.primaryVal = 0;
                        obj.secondaryVal = 0;
                    }
                    primaryValues.push(obj.primaryVal);
                });
                THIS.dataViewModel.primaryValMax = Math.max.apply(null, primaryValues);
            } else {
                // Update this section
                THIS.dataViewModel.hfDataPoints = visualTransform(options, THIS.host).hfDataPoints;
                THIS.dataViewModel.primaryValMax = originalMaxValue;
            }
        }

        public renderCheck(THIS: any, textHeight: number) {
            if (THIS.dataViewModel.secondaryExists) {
                THIS.height = THIS.parentHeight * 0.99 - 5 * textHeight > 0 ? THIS.parentHeight * 0.99 - 5 * textHeight : 0;
            } else {
                THIS.height = THIS.parentHeight * 0.99 - 3 * textHeight > 0 ? THIS.parentHeight * 0.99 - 3 * textHeight : 0;
            }

            THIS.ymax = THIS.dataViewModel.primaryValMax;
            if (THIS.dataViewModel.categoryExists) {
                let bowtieWidth: string = '0px';

                if (!!THIS.dataViewModel.bowtieDataPoint
                    && !!THIS.dataViewModel.bowtieDataPoint.length) {
                    bowtieWidth = THIS.root.select('.hfb_bowtie').style('width');
                }
                THIS.rootDiv.append('div')
                    .style({
                        width: `${THIS.parentWidth}px`,
                        height: `${THIS.parentHeight}px`
                    })
                    .style('margin-left', bowtieWidth)
                    .classed('hf_parentdiv', true);
            } else {
                THIS.rootDiv.append('div')
                    .style({
                        width: `${THIS.parentWidth}px`,
                        height: `${THIS.parentHeight}px`
                    })
                    .style('margin-left', `${5}px`)
                    .classed('hf_parentdiv', true);
            }
            for (let j: number = 0; j < THIS.dataViewModel.hfDataPoints.length; j++) {
                if (THIS.dataViewModel.hfDataPoints[j].primaryVal === 0) {
                    THIS.percentageVal.push(-1);
                } else {
                    if (THIS.ymax - THIS.dataViewModel.hfDataPoints[j].primaryVal > 0) {
                        THIS.ymax = THIS.ymax === 0 ? 1 : THIS.ymax;
                        THIS.percentageVal.push(((THIS.dataViewModel.hfDataPoints[j].primaryVal * 100) / THIS.ymax));
                    } else {
                        THIS.percentageVal.push(0);
                    }
                }
            }

            THIS.fontsize = 12;
            THIS.color = THIS.labelSettings.color;
        }
        public connector(THIS: any) {
            for (let i: number = 0; i < THIS.percentageVal.length; i++) {
                let polygonColor: string;
                if (THIS.connectorSettings.show && THIS.connectorSettings.color !== '') {
                    polygonColor = THIS.connectorSettings.color;
                } else {
                    polygonColor = THIS.colorLuminance(THIS.dataViewModel.hfDataPoints[i].color);
                }

                THIS.classname = `.hf_even${THIS.val}`;
                THIS.evensvg = THIS.root.select(THIS.classname);
                if (THIS.percentageVal[i] === 0 && THIS.percentageVal[i + 1] === 0) {
                    THIS.evensvg.append('rect')
                        .attr({
                            x: 10,
                            y: 0,
                            height: THIS.height,
                            width: THIS.width / 4,
                            fill: polygonColor
                        });
                } else {
                    THIS.nextyheight = (THIS.height - THIS.areafillheight[i + 1]) / 2;
                    THIS.prevyheight = (THIS.height - THIS.areafillheight[i]) / 2;
                    const disp: number = 10;
                    const prevFill: number = THIS.areafillheight[i] > 1 ? THIS.areafillheight[i] : 1;
                    const nextFill: number = THIS.areafillheight[i + 1] > 1 ? THIS.areafillheight[i + 1] : 1;
                    if (THIS.percentageVal[i] && THIS.percentageVal[i + 1]) {
                        THIS.dimension = `${disp},${THIS.prevyheight} ${disp},${prevFill + THIS.prevyheight} ` +
                            `${THIS.width / 4},${nextFill + THIS.nextyheight} ${THIS.width / 4},${THIS.nextyheight}`;
                    } else if (THIS.percentageVal[i] && !(THIS.percentageVal[i + 1])) {
                        THIS.dimension = `${disp},${THIS.prevyheight} ${disp},${prevFill + THIS.prevyheight} ` +
                            `${THIS.width / 4},${THIS.height} ${THIS.width / 4},0`;
                    } else if (!(THIS.percentageVal[i]) && THIS.percentageVal[i + 1]) {
                        THIS.dimension = `${disp},0 ${disp},${THIS.height} ${THIS.width / 4},${nextFill + THIS.nextyheight} ` +
                            `${THIS.width / 4},${THIS.nextyheight}`;
                    }

                    THIS.evensvg.append('polygon')
                        .attr('points', THIS.dimension)
                        .attr({
                            fill: polygonColor
                        });
                }
                THIS.val += 2;
            }
        }
        public colorBar(THIS: this, options: VisualUpdateOptions, originalMaxValue: number) {
            THIS.root.selectAll('.hf_dataColor')
                .style('fill', (d: IHFDataPoint, colorIndex: number) => THIS.dataViewModel.hfDataPoints[colorIndex].color);
            // adding tooltip to the bars
            const rectBars: d3.selection.Update<IHFDataPoint> = THIS.root
                .selectAll('.hf_datapoint').data(THIS.dataViewModel.hfDataPoints);
            THIS.tooltipServiceWrapper
                .addTooltip(
                    THIS.root.selectAll('.hf_datapoint'),
                    (tooltipEvent: ITooltipEventArgs<number>) => THIS.getTooltipData(tooltipEvent.data),
                    (tooltipEvent: ITooltipEventArgs<number>) => null
                );
            // adding selection manager feature on click of the bars
            const selectionManager: ISelectionManager = THIS.selectionManager;

            rectBars.on('click', (d: IHFDataPoint): void => {
                selectionManager.select(d.selectionId).then((ids: any[]) => {
                    rectBars.attr({
                        'fill-opacity': ids.length > 0 ? 0.5 : 1
                    });
                    d3.select(event.currentTarget).attr({
                        'fill-opacity': 1
                    });
                });
                (<Event>d3.event).stopPropagation();
            });

            THIS.root.on('click', () => {
                THIS.selectionManager.clear();
                THIS.root.selectAll('.hf_datapoint').attr('fill-opacity', 1);
            });
            if (THIS.dataViewModel.categoryExists) {
                if (THIS.filterID !== '') {
                    const selectedCircleString: string[] = THIS.filterID.split('$$');
                    let selectedCircle: string;
                    if (selectedCircleString.length) {
                        selectedCircle = selectedCircleString[0];
                    }
                    $(`.hfb_circle#${selectedCircle}_circle`).addClass('hfb_selectedCircle');
                }
                const bowtieLabelItems: d3.Selection<SVGElement> = THIS.root.selectAll('.hfbowtie_labelItem');
                bowtieLabelItems.on('click', function (): void {
                    // logic for hightlighting the selected category
                    $('circle.hfb_circle').removeClass('hfb_selectedCircle');
                    THIS.filterID = $(this).attr('id');
                    const currentEle: string = THIS.filterID;
                    let id: string[];
                    let circleId: JQuery;
                    if (currentEle.length) {
                        id = currentEle.split('$$');
                    }
                    if (id.length) {
                        circleId = $(`.hfb_circle#${id[0]}_circle`);
                    }
                    if (circleId) {
                        $(circleId).addClass('hfb_selectedCircle');
                    }
                    if (THIS.filterName === $(this)[0].getAttribute('title').toLowerCase()) {
                        THIS.filterName = '';
                        THIS.filterID = '';
                        $(circleId).removeClass('hfb_selectedCircle');
                    } else {
                        THIS.filterName = $(this)[0].getAttribute('title').toLowerCase();
                    }

                    THIS.renderVisual(THIS.filterName, THIS.filterID, THIS, options, originalMaxValue);
                    event.stopPropagation();
                });
            }
            // if too many source, adjust funnel at middle of source
            const firstArc: any = d3.selectAll('.bowtie_arcs_svg path:first-of-type').node();
            const lastArc: any = d3.selectAll('.bowtie_arcs_svg path:last-of-type').node();
            if (firstArc != null && lastArc != null && firstArc.getBBox != null && lastArc.getBBox != null) {
                const firstArcHeight: number = firstArc.getBBox().height;
                const lastArcHeight: number = lastArc.getBBox().height;
                const hfHeight: number = $('.hf_parentdiv').height() / 2;
                const topMarginForHF: number = firstArcHeight + ((firstArcHeight - lastArcHeight) / 2) - hfHeight + 20;
                if (topMarginForHF > 0) {
                    $('.hf_parentdiv').css('margin-top', topMarginForHF);
                    $('.rootDiv').animate({ scrollTop: topMarginForHF }, 100);
                }
            }
        }
        public printVis(THIS: this, filterName: string, options: VisualUpdateOptions, originalMaxValue: number) {
            THIS.root.selectAll('div.hf_parentdiv').remove();
            THIS.index = 0;
            THIS.percentageVal = [];
            THIS.areafillheight = [];
            THIS.val = 1;


            if (THIS.dataViewModel.categoryExists) THIS.onSelect(THIS, options, filterName, originalMaxValue);

            THIS.catLength = THIS.dataViewModel.hfDataPoints.length === 0 ? 1 : THIS.dataViewModel.hfDataPoints.length;
            THIS.parentWidth = THIS.viewport.width * 0.99;

            if (THIS.dataViewModel.categoryExists && !!THIS.dataViewModel.bowtieDataPoint && !!THIS.dataViewModel.bowtieDataPoint.length) {
                THIS.parentWidth = THIS.viewport.width * 0.79; // leaving 20% width for Bowtie
            }
            THIS.parentHeight = THIS.viewport.height;
            THIS.width = THIS.parentWidth / (1.4 * THIS.catLength);
            if (THIS.parentHeight >= 65) {
                THIS.visualHeight = THIS.parentHeight - 65;
            } else {
                THIS.visualHeight = 65 - THIS.parentHeight;
            }
        }
        public printBar(THIS: this, trimmedText, formattedTooltipVal, i) {
            THIS.element.append('div')
                .style({
                    color: THIS.color,
                    'font-size': `${THIS.fontsize}px`,
                    width: THIS.width
                })
                .classed(`hf_legend_value1${i}`, true)
                .classed('hf_legend', true)
                .text(trimmedText)
                .attr('title', formattedTooltipVal);

            THIS.element
                .append('svg')
                .attr({
                    id: i,
                    height: THIS.height,
                    width: THIS.width,
                    fill: '#FAFAFA'
                }).classed(THIS.classname, true)
                .append('rect')
                .attr({
                    x: 10,
                    y: 0,
                    height: THIS.height,
                    width: THIS.width
                });
        }
        public colorArrow(THIS: this, textHeight, trimmedText, i) {
            THIS.element.append('div')
                .style({
                    color: THIS.color,
                    'font-size': `${THIS.fontsize}px`,
                    width: `${0.92 * THIS.width}px`,
                    height: `${textHeight}px`
                })
                .classed(`hf_legend_item${i} hf_xAxisLabels`, true)
                .classed('hf_legend', true)
                .text(trimmedText)
                .attr('title', THIS.dataViewModel.hfDataPoints[THIS.index].subCategory);

            THIS.element.append('div')
                .style({
                    color: THIS.color,
                    'font-size': `${THIS.fontsize}px`,
                    width: `${0.92 * THIS.width}px`
                })
                .classed(`hf_legend_item${i} hf_xAxisMeasure`, true)
                .classed('hf_legend', true)
                .text(trimmedText)
                .attr('title', THIS.dataViewModel.primaryMeasureName);
        }
        public wholeBar(THIS, textHeight, i, labelDecimalPlaces, smColor, smDisplayUnits, smDecimalPlaces) {
            THIS.classname = `hf_odd${i}`;
            let textProps: TextProperties = {
                text: THIS.dataViewModel.hfDataPoints[THIS.index].subCategory, fontFamily: 'segoe ui', fontSize: `${THIS.fontsize}px`
            };
            let trimmedText: string = textMeasurementService.getTailoredTextOrDefault(textProps, THIS.width - 10);
            THIS.element.append('div')
                .style({
                    color: THIS.color, 'font-size': `${THIS.fontsize}px`, width: `${0.92 * THIS.width}px`, height: `${textHeight}px`
                })
                .classed(`hf_legend_item${i} hf_xAxisLabels`, true).classed('hf_legend', true).text(trimmedText)
                .attr('title', THIS.dataViewModel.hfDataPoints[THIS.index].subCategory);
            //code to add Primary Measure column name
            textProps = {
                text: THIS.dataViewModel.primaryMeasureName, fontFamily: 'segoe ui', fontSize: `${THIS.fontsize}px`
            };
            trimmedText = textMeasurementService.getTailoredTextOrDefault(textProps, THIS.width - 10);
            THIS.element.append('div')
                .style({
                    color: THIS.color, 'font-size': `${THIS.fontsize}px`, width: `${0.92 * THIS.width}px`
                })
                .classed(`hf_legend_item${i} hf_xAxisMeasure`, true).classed('hf_legend', true).text(trimmedText)
                .attr('title', THIS.dataViewModel.primaryMeasureName);
            //code to add Primary Measure column name
            trimmedText = textMeasurementService.getTailoredTextOrDefault(textProps, THIS.width - 10);
            //code to add Primary Measure value
            let formattedValue: string = VisualUtils.getFormattedData(
                THIS.dataViewModel.hfDataPoints[THIS.index].primaryVal, THIS.dataViewModel.primaryFormatter, THIS.labelSettings.displayUnits, labelDecimalPlaces, THIS.ymax);
            textProps = {
                text: formattedValue, fontFamily: 'segoe ui', fontSize: `${THIS.fontsize}px`
            };
            trimmedText = textMeasurementService.getTailoredTextOrDefault(textProps, THIS.width - 10);
            let formattedTooltipVal: string = valueFormatter.create({
                format: THIS.dataViewModel.primaryFormatter
            }).format(THIS.dataViewModel.hfDataPoints[THIS.index].primaryVal);
            THIS.printBar(THIS, trimmedText, formattedTooltipVal, i);
            const displacement: number = i === 0 ? 0 : 10;
            // code to create inner rectangle
            THIS.oddsvg = THIS.root.select(`.${THIS.classname}`);
            if (THIS.percentageVal[THIS.index] !== 0 && THIS.percentageVal[THIS.index] !== -1) {
                THIS.percentageVal[THIS.index] = parseFloat(THIS.percentageVal[THIS.index].toString());
                THIS.y = 0;
                THIS.y = ((THIS.height - (THIS.percentageVal[THIS.index] * THIS.height / 100)) / 2);
                THIS.areafillheight.push(THIS.percentageVal[THIS.index] * THIS.height / 100);
                const disp: number = 10;
                THIS.oddsvg.append('rect')
                    .attr({
                        x: disp, y: THIS.y, height: THIS.areafillheight[THIS.index] > 1 ? THIS.areafillheight[THIS.index] : 1, width: THIS.width
                    }).classed('hf_datapoint hf_dataColor', true);
            } else {
                const disp: number = 10;
                if (THIS.percentageVal[THIS.index] === 0) {
                    THIS.oddsvg.append('rect')
                        .attr({
                            x: disp, y: 0, height: THIS.height, width: THIS.width
                        }).classed('hf_datapoint hf_dataColor', true);
                } else if (THIS.percentageVal[THIS.index] === -1) {
                    // showing dotted line if there is no data
                    THIS.y = ((THIS.height - (THIS.percentageVal[THIS.index] * THIS.height / 100)) / 2); // -10
                    THIS.oddsvg.append('line')
                        .attr({
                            x1: disp, y1: THIS.y, x2: THIS.width, y2: THIS.y, 'stroke-width': 1
                        }).classed('hf_datapoint hf_dataColor', true).style({ 'stroke-dasharray': '1,2', stroke: '#000' });
                }
                THIS.areafillheight.push(0);
            }
            // code to add secondary measure value
            if (THIS.dataViewModel.secondaryExists) {
                const smMaxVal: number = THIS.dataViewModel.secondaryValMax;
                // secondary measure name
                textProps = {
                    text: THIS.dataViewModel.secondaryMeasureName, fontFamily: 'segoe ui', fontSize: `${THIS.fontsize}px`
                };
                trimmedText = textMeasurementService.getTailoredTextOrDefault(textProps, THIS.width - 10);
                THIS.element.append('div')
                    .style({
                        color: smColor, 'font-size': `${THIS.fontsize}px`, width: `${0.92 * THIS.width}px`
                    })
                    .classed(`hf_legend_item${i} hf_xAxisSMName`, true).classed('hf_legend', true)
                    .text(trimmedText).attr('title', THIS.dataViewModel.secondaryMeasureName);
                // secondary measure value
                formattedValue = VisualUtils.getFormattedData(
                    THIS.dataViewModel.hfDataPoints[THIS.index].secondaryVal,
                    THIS.dataViewModel.secondaryFormatter, smDisplayUnits, smDecimalPlaces, smMaxVal);
                textProps = {
                    text: formattedValue, fontFamily: 'segoe ui', fontSize: `${THIS.fontsize}px`
                };
                trimmedText = textMeasurementService.getTailoredTextOrDefault(textProps, THIS.width - 10);
                formattedTooltipVal = valueFormatter.create({
                    format: THIS.dataViewModel.secondaryFormatter
                }).format(THIS.dataViewModel.hfDataPoints[THIS.index].secondaryVal);
                THIS.element.append('div')
                    .style({
                        color: smColor, 'font-size': `${THIS.fontsize}px`, width: `${0.92 * THIS.width}px`
                    })
                    .classed(`hf_legend_item${i} hf_xAxisSMName`, true).classed('hf_legend', true).text(trimmedText).attr('title', formattedTooltipVal);
            }
            THIS.index++;
        }
        public renderVisual(filterName: string, filterID: string, THIS: this, options: VisualUpdateOptions, originalMaxValue: number): void {
            THIS.printVis(THIS, filterName, options, originalMaxValue);
            const textProperties: TextProperties = {
                text: 'A', fontFamily: 'SEGOE UI', fontSize: '12px'
            };
            const showConnectors: boolean = THIS.connectorSettings.show;
            const textHeight: number = textMeasurementService.measureSvgTextHeight(textProperties);
            THIS.renderCheck(THIS, textHeight);
            const labelDisplayUnits: number = THIS.labelSettings.displayUnits;
            let labelDecimalPlaces: number = 0;
            if (THIS.labelSettings.decimalPlaces || THIS.labelSettings.decimalPlaces === 0) {
                if (THIS.labelSettings.decimalPlaces > 4) {
                    THIS.labelSettings.decimalPlaces = 4;
                    labelDecimalPlaces = 4;
                } else if (THIS.labelSettings.decimalPlaces < 0) {
                    THIS.labelSettings.decimalPlaces = null;
                } else {
                    labelDecimalPlaces = THIS.labelSettings.decimalPlaces;
                }
            }

            const smColor: string = THIS.secondaryLabelSettings.color;
            const smDisplayUnits: number = THIS.secondaryLabelSettings.displayUnits;
            let smDecimalPlaces: number = 0;
            if (THIS.secondaryLabelSettings.decimalPlaces || THIS.secondaryLabelSettings.decimalPlaces === 0) {
                if (THIS.secondaryLabelSettings.decimalPlaces > 4) {
                    THIS.secondaryLabelSettings.decimalPlaces = 4;
                    smDecimalPlaces = 4;
                } else if (THIS.secondaryLabelSettings.decimalPlaces < 0) {
                    THIS.secondaryLabelSettings.decimalPlaces = null;
                } else {
                    smDecimalPlaces = THIS.secondaryLabelSettings.decimalPlaces;
                }
            }

            for (let i: number = 0; i < (2 * THIS.catLength - 1); i++) {
                THIS.element = THIS.root.select('.hf_parentdiv')
                    .append('div')
                    .style({ height: `${THIS.parentHeight}px` })
                    .classed('hf_svg hf_parentElement', true);
                let constantMultiplier: number = 1;
                if (THIS.catLength > 0) {
                    if (showConnectors) {
                        constantMultiplier = 4 / (5 * THIS.catLength - 1); // dividing the available space into equal parts
                    } else {
                        constantMultiplier = 1 / THIS.catLength; // dividing the available space into equal parts
                    }
                }
                THIS.width = (THIS.parentWidth - 20) * constantMultiplier; // remove 10 from total width as 10 is x displacement

                if (i % 2 === 0) {
                    THIS.wholeBar(THIS, textHeight, i, labelDecimalPlaces, smColor, smDisplayUnits, smDecimalPlaces);
                } else {
                    // creating elements for connectors
                    if (showConnectors) {
                        THIS.element
                            .append('div')
                            .classed('hf_connectors', true)
                            .style('height', `${3 * textHeight}px`);

                        THIS.classname = `hf_even${i}`;
                        const disp: number = 10;
                        THIS.element
                            .append('svg')
                            .attr({
                                id: i,
                                height: THIS.height,
                                width: THIS.width / 4,
                                fill: '#FFF'
                            })
                            .classed(THIS.classname, true)
                            .append('rect')
                            .attr({
                                x: disp,
                                y: 0,
                                height: THIS.height,
                                width: THIS.width / 4
                            });
                    }
                }
            }
            // code to draw connectors
            if (showConnectors) {
                THIS.connector(THIS);
            }
            THIS.colorBar(THIS, options, originalMaxValue);
        }
        public update(options: VisualUpdateOptions): void {
            try {
                this.events.renderingStarted(options);
                if (!options.dataViews
                    || (options.dataViews.length < 1)
                    || !options.dataViews[0]
                    || !options.dataViews[0].categorical) {
                    return;
                }
                this.dataView = options.dataViews[0];
                this.gradientColors = enumSettings.getGradientColors(this.dataView);
                this.labelSettings = enumSettings.getDataLabelSettings(this.dataView);
                this.secondaryLabelSettings = enumSettings.getSMLabelSettings(this.dataView);
                this.connectorSettings = enumSettings.getConnectorSettings(this.dataView);

                this.dataViewModel = visualTransform(options, this.host);
                this.root.selectAll('.hfb_bowtie, .bowtie_arcs, .hf_parentdiv, .errorMessage').remove();
                if (!this.dataViewModel.subCategoryExists && !this.dataViewModel.primaryExists) {
                    this.root.append('div')
                        .classed('errorMessage', true)
                        .style('font-size', '16px')
                        .text('Please select Sub category and Primary measure Values.');
                    return;
                }
                else if (!this.dataViewModel.subCategoryExists) {
                    this.root.append('div')
                        .classed('errorMessage', true)
                        .style('font-size', '16px')
                        .text('Please select Sub category.');
                    return;
                }
                else if (!this.dataViewModel.primaryExists) {
                    this.root.append('div')
                        .classed('errorMessage', true)
                        .style('font-size', '16px')
                        .text('Please select Primary measure Value.');
                    return;
                }
                else if (this.dataViewModel.primaryValMax <= 0) {
                    this.root.append('div')
                        .classed('errorMessage', true)
                        .style('font-size', '16px')
                        .text('No data to display');
                    return;
                }

                this.rootDiv.style('width', `${options.viewport.width}px`);
                this.rootDiv.style('height', `${options.viewport.height}px`);

                const THIS: this = this;
                this.viewport = options.viewport;

                let originalValues: IHFDataPoint[] = [];
                originalValues = jQuery.extend([{}], THIS.dataViewModel.hfDataPoints);

                const originalMaxValue: number = this.dataViewModel.primaryValMax;

                // Render the bowtie chart only if Category exists
                if (this.dataViewModel.categoryExists) {
                    this.renderBowtie(this.viewport);
                }

                this.renderVisual(this.filterName, this.filterID, THIS, options, originalMaxValue);

                $(document).on('click', () => {
                    this.renderVisual('', '', THIS, options, originalMaxValue);
                    $('circle.hfb_circle').removeClass('hfb_selectedCircle');
                    event.stopPropagation();
                });
                this.barSelection = this.root.selectAll('.hf_datapoint');
                this.syncSelectionState(
                    this.barSelection,
                    <ISelectionId[]>this.selectionManager.getSelectionIds()
                );
                this.events.renderingFinished(options);
            } catch (exception) { this.events.renderingFailed(options, exception); }
        }

        // method to render visual based on selection state
        private syncSelectionState(
            selection: d3.Selection<IHFDataPoint>,
            selectionIds: ISelectionId[]
        ): void {
            if (!selection || !selectionIds) {
                return;
            }

            if (!selectionIds.length) {
                selection.attr('fill-opacity', 1);

                return;
            }

            const self: this = this;

            selection.each(function (barDataPoint: IHFDataPoint): void {
                const isSelected: boolean = self.isSelectionIdInArray(selectionIds, barDataPoint.selectionId);

                d3.select(this).attr(
                    'fill-opacity',
                    isSelected
                        ? 1
                        : 0.5
                );
            });
        }

        // method to return boolean based on presence of value in array
        private isSelectionIdInArray(selectionIds: ISelectionId[], selectionId: ISelectionId): boolean {
            if (!selectionIds || !selectionId) {
                return false;
            }

            return selectionIds.some((currentSelectionId: ISelectionId) => {
                return currentSelectionId.includes(selectionId);
            });
        }

        private getTooltipData(value: any): VisualTooltipDataItem[] {
            const tooltipDataPointsFinal: VisualTooltipDataItem[] = [];
            const tooltipData: ITooltipDataPoints[] = value.tooltipData;
            const dataLen: number = tooltipData.length;
            for (let i: number = 0; i < dataLen; i++) {
                const tooltipDataItem: VisualTooltipDataItem = {
                    displayName: '',
                    value: ''
                };
                tooltipDataItem.displayName = tooltipData[i].name;

                if (isNaN(parseFloat(tooltipData[i].value))) {
                    tooltipDataItem.value = tooltipData[i].value;
                } else {
                    tooltipData[i].value = tooltipData[i].value === '' ? '0' : tooltipData[i].value;
                    const formattingString: string = tooltipData[i].formatter
                        ? tooltipData[i].formatter : valueFormatter.DefaultNumericFormat;
                    const formatter: IValueFormatter = valueFormatter.create({
                        format: formattingString
                    });
                    tooltipDataItem.value = formatter.format(parseFloat(tooltipData[i].value));
                }
                tooltipDataPointsFinal.push(tooltipDataItem);
            }

            return tooltipDataPointsFinal;
        }

        private colorLuminance(hex: string): string {
            let lum: number = 0.50;
            // validate hex string
            hex = hex.replace(/[^0-9a-f]/gi, '');
            if (hex.length < 6) {
                hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
            }
            lum = lum || 0;
            let rgb: string = '#';
            let c: any;
            let i: number;
            for (i = 0; i < 3; i++) {
                c = parseInt(hex.substr(i * 2, 2), 16);
                c = Math.round(Math.min(Math.max(0, c + (c * lum)), 255)).toString(16);
                rgb += (`00${c}`).substr(c.length);
            }

            return rgb;
        }
    }
}
