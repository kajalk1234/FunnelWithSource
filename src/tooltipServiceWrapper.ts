module powerbi.extensibility.visual {

    export interface ITooltipEventArgs<TData> {
        data: TData;
        coordinates: number[];
        elementCoordinates: number[];
        context: HTMLElement;
        isTouchEvent: boolean;
    }

    export interface ITooltipServiceWrapper {
        addTooltip<T>(
            selection: d3.Selection<Element>,
            getTooltipInfoDelegate: (args: ITooltipEventArgs<T>) => VisualTooltipDataItem[],
            getDataPointIdentity: (args: ITooltipEventArgs<T>) => ISelectionId,
            reloadTooltipDataOnMouseMove?: boolean): void;
        hide(): void;
    }

    const defaulthandletouchdelay: number = 1000;

    export function createTooltipServiceWrapper(
        tooltipService: ITooltipService,
        rootElement: Element,
        handleTouchDelay: number = defaulthandletouchdelay): ITooltipServiceWrapper {

        return new TooltipServiceWrapper(tooltipService, rootElement, handleTouchDelay);
    }

    class TooltipServiceWrapper implements ITooltipServiceWrapper {
        private handleTouchTimeoutId: number;
        private visualHostTooltipService: ITooltipService;
        private rootElement: Element;
        private handleTouchDelay: number;

        constructor(tooltipService: ITooltipService, rootElement: Element, handleTouchDelay: number) {
            this.visualHostTooltipService = tooltipService;
            this.handleTouchDelay = handleTouchDelay;
            this.rootElement = rootElement;
        }

        public addTooltip<T>(
            selection: d3.Selection<Element>,
            getTooltipInfoDelegate: (args: ITooltipEventArgs<T>) => VisualTooltipDataItem[],
            getDataPointIdentity: (args: ITooltipEventArgs<T>) => ISelectionId,
            reloadTooltipDataOnMouseMove?: boolean): void {

            if (!selection || !this.visualHostTooltipService.enabled()) {
                return;
            }

            const rootNode: Element = this.rootElement;

            // Mouse events
            selection.on('mouseover.tooltip', () => {
                // Ignore mouseover while handling touch events
                if (!this.canDisplayTooltip(d3.event)) {
                    return;
                }

                // tslint:disable-next-line:no-any
                const tooltipEventArgs: any = this.makeTooltipEventArgs<T>(rootNode, true, false);
                if (!tooltipEventArgs) {
                    return;
                }

                const tooltipInfo: VisualTooltipDataItem[] = getTooltipInfoDelegate(tooltipEventArgs);
                if (tooltipInfo == null) {
                    return;
                }

                const selectionId: ISelectionId = getDataPointIdentity(tooltipEventArgs);

                this.visualHostTooltipService.show({
                    coordinates: tooltipEventArgs.coordinates,
                    isTouchEvent: false,
                    dataItems: tooltipInfo,
                    identities: selectionId ? [selectionId] : []
                });
            });

            selection.on('mouseout.tooltip', () => {
                this.visualHostTooltipService.hide({
                    isTouchEvent: false,
                    immediately: false
                });
            });

            selection.on('mousemove.tooltip', () => {
                // Ignore mousemove while handling touch events
                if (!this.canDisplayTooltip(d3.event)) {
                    return;
                }

                // tslint:disable-next-line:no-any
                const tooltipEventArgs: any = this.makeTooltipEventArgs<T>(rootNode, true, false);
                if (!tooltipEventArgs) {
                    return;
                }

                let tooltipInfo: VisualTooltipDataItem[];
                if (reloadTooltipDataOnMouseMove) {
                    tooltipInfo = getTooltipInfoDelegate(tooltipEventArgs);
                    if (tooltipInfo == null) {
                        return;
                    }
                }

                const selectionId: ISelectionId = getDataPointIdentity(tooltipEventArgs);

                this.visualHostTooltipService.move({
                    coordinates: tooltipEventArgs.coordinates,
                    isTouchEvent: false,
                    dataItems: tooltipInfo,
                    identities: selectionId ? [selectionId] : []
                });
            });

            // --- Touch events ---

            const touchStartEventName: string = TooltipServiceWrapper.touchStartEventName();
            const touchEndEventName: string = TooltipServiceWrapper.touchEndEventName();
            const isPointerEvent: boolean = TooltipServiceWrapper.usePointerEvents();

            selection.on(`${touchStartEventName} + .tooltip`, () => {
                this.visualHostTooltipService.hide({
                    isTouchEvent: true,
                    immediately: true
                });

                // tslint:disable-next-line:no-any
                const tooltipEventArgs: any = this.makeTooltipEventArgs<T>(rootNode, isPointerEvent, true);
                if (!tooltipEventArgs) {
                    return;
                }

                const tooltipInfo: VisualTooltipDataItem[] = getTooltipInfoDelegate(tooltipEventArgs);
                const selectionId: ISelectionId = getDataPointIdentity(tooltipEventArgs);

                this.visualHostTooltipService.show({
                    coordinates: tooltipEventArgs.coordinates,
                    isTouchEvent: true,
                    dataItems: tooltipInfo,
                    identities: selectionId ? [selectionId] : []
                });
            });

            selection.on(`${touchEndEventName} + .tooltip`, () => {
                this.visualHostTooltipService.hide({
                    isTouchEvent: true,
                    immediately: false
                });

                if (this.handleTouchTimeoutId) {
                    clearTimeout(this.handleTouchTimeoutId);
                }

                // At the end of touch action, set a timeout that will let us ignore the incoming mouse events for a small amount of time
                // TODO: any better way to do this?
                this.handleTouchTimeoutId = setTimeout(
                    () => {
                        this.handleTouchTimeoutId = undefined;
                    },
                    this.handleTouchDelay);
            });
        }

        public hide(): void {
            this.visualHostTooltipService.hide({ immediately: true, isTouchEvent: false });
        }

        private makeTooltipEventArgs<T>(rootNode: Element, isPointerEvent: boolean, isTouchEvent: boolean): ITooltipEventArgs<T> {
            const target: HTMLElement = <HTMLElement>(<Event>d3.event).target;
            const data: T = d3.select(target).datum();

            const mouseCoordinates: number[] = this.getCoordinates(rootNode, isPointerEvent);
            const elementCoordinates: number[] = this.getCoordinates(target, isPointerEvent);
            const tooltipEventArgs: ITooltipEventArgs<T> = {
                data: data,
                coordinates: mouseCoordinates,
                elementCoordinates: elementCoordinates,
                context: target,
                isTouchEvent: isTouchEvent
            };

            return tooltipEventArgs;
        }

        // tslint:disable-next-line:no-any
        private canDisplayTooltip(d3Event: any): boolean {
            let canDisplay: boolean = true;
            const mouseEvent: MouseEvent = <MouseEvent>d3Event;
            if (mouseEvent.buttons !== undefined) {
                // Check mouse buttons state
                // tslint:disable-next-line:no-any
                const hasMouseButtonPressed: any = mouseEvent.buttons !== 0;
                canDisplay = !hasMouseButtonPressed;
            }

            // Make sure we are not ignoring mouse events immediately after touch end.
            canDisplay = canDisplay && (this.handleTouchTimeoutId == null);

            return canDisplay;
        }

        private getCoordinates(rootNode: Element, isPointerEvent: boolean): number[] {
            let coordinates: number[];

            if (isPointerEvent) {
                // DO NOT USE - WebKit bug in getScreenCTM with nested SVG results in slight negative coordinate shift
                // Also, IE will incorporate transform scale but WebKit does not, forcing us to detect browser and adjust appropriately.
                // Just use non-scaled coordinates for all browsers, and adjust for the transform scale later (see lineChart.findIndex)
                //coordinates = d3.mouse(rootNode);

                // copied from d3_eventSource (which is not exposed)
                // tslint:disable-next-line:no-any
                let e: any = <any>d3.event;
                // tslint:disable-next-line:no-any
                const s: any = e.sourceEvent;
                while (s) { e = s; }
                const rect: ClientRect = rootNode.getBoundingClientRect();
                coordinates = [e.clientX - rect.left - rootNode.clientLeft, e.clientY - rect.top - rootNode.clientTop];
            } else {
                const touchCoordinates: [number, number][] = d3.touches(rootNode);
                if (touchCoordinates && touchCoordinates.length > 0) {
                    coordinates = touchCoordinates[0];
                }
            }

            return coordinates;
        }

        private static touchStartEventName(): string {
            let eventName: string = 'touchstart';
            const pointerEvent: string = 'PointerEvent';

            if (window[pointerEvent]) {
                // IE11
                eventName = 'pointerdown';
            }

            return eventName;
        }

        private static touchMoveEventName(): string {
            let eventName: string = 'touchmove';
            const pointerEvent: string = 'PointerEvent';

            if (window[pointerEvent]) {
                // IE11
                eventName = 'pointermove';
            }

            return eventName;
        }

        private static touchEndEventName(): string {
            let eventName: string = 'touchend';
            const pointerEvent: string = 'PointerEvent';

            if (window[pointerEvent]) {
                // IE11
                eventName = 'pointerup';
            }

            return eventName;
        }

        private static usePointerEvents(): boolean {
            const eventName: string = TooltipServiceWrapper.touchStartEventName();

            return eventName === 'pointerdown' || eventName === 'MSPointerDown';
        }
    }
}
