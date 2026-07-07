/**
 * ProductCustomizer wraps a Fabric.js canvas so the product page only has
 * to call a handful of methods. It shows the product mockup with a dashed
 * "print area" guide, and knows how to export ONLY that region — cropped,
 * with the mockup hidden — as the print-ready file that gets uploaded to
 * R2 and sent to Gelato/Montink.
 *
 * This is intentionally simple (no undo stack, no multi-layer reordering
 * UI, no server-side proxying of user images). Treat it as a starting
 * point, not a finished design tool.
 */
class ProductCustomizer {
  /**
   * @param {string} canvasElementId
   * @param {{mockupUrl: string, printArea: {x:number,y:number,width:number,height:number}, displaySize?: number,
   *          printPhysicalSize?: {widthMm:number, heightMm:number}, minDpi?: number, onQualityChange?: () => void}} config
   */
  constructor(canvasElementId, config) {
    this.printArea = config.printArea;
    this.displaySize = config.displaySize ?? 520;
    this.printPhysicalSize = config.printPhysicalSize ?? null;
    this.minDpi = config.minDpi ?? 300;
    this._onQualityChange = config.onQualityChange ?? null;
    this._canvasPxPerInch = null;

    this.canvas = new fabric.Canvas(canvasElementId, {
      preserveObjectStacking: true,
    });
    this.canvas.on("object:scaling", () => this._onQualityChange?.());
    this.canvas.on("object:modified", () => this._onQualityChange?.());
    this.canvas.on("object:added", () => this._onQualityChange?.());
    this.canvas.on("object:removed", () => this._onQualityChange?.());

    this.guideRect = null;
    this.mockupImage = null;

    this._loadMockup(config.mockupUrl);
  }

  _loadMockup(mockupUrl) {
    fabric.Image.fromURL(
      mockupUrl,
      (img) => {
        const scale = this.displaySize / img.width;
        this.canvas.setWidth(img.width * scale);
        this.canvas.setHeight(img.height * scale);

        img.set({ left: 0, top: 0, scaleX: scale, scaleY: scale, selectable: false, evented: false });
        this.mockupImage = img;
        this.canvas.add(img);
        this.canvas.sendToBack(img);

        this._drawPrintAreaGuide(scale);

        // canvas px per inch, anchored on the print area: printArea.width
        // (mockup px) is defined to correspond to printPhysicalSize.widthMm
        // in the real, physical product — so canvas px/inch = (printArea
        // width in on-screen canvas px) / (physical width in inches).
        if (this.printPhysicalSize?.widthMm) {
          const printAreaCanvasPx = this.printArea.width * scale;
          const widthInches = this.printPhysicalSize.widthMm / 25.4;
          this._canvasPxPerInch = printAreaCanvasPx / widthInches;
        }
      },
      { crossOrigin: "anonymous" }
    );
  }

  /** Dashed rectangle + corner brackets showing what area actually prints. */
  _drawPrintAreaGuide(scale) {
    const { x, y, width, height } = this.printArea;
    const rect = new fabric.Rect({
      left: x * scale,
      top: y * scale,
      width: width * scale,
      height: height * scale,
      fill: "transparent",
      stroke: "#2451ff",
      strokeDashArray: [6, 5],
      strokeWidth: 1.5,
      selectable: false,
      evented: false,
    });
    this.guideRect = rect;
    this.canvas.add(rect);
    this.canvas.requestRenderAll();

    // Keep newly added objects roughly centred on the print area rather
    // than the whole canvas — a nice-to-have, not a hard constraint.
    this._defaultPosition = {
      left: (x + width / 2) * scale,
      top: (y + height / 2) * scale,
    };
  }

  addImageFromFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      fabric.Image.fromURL(event.target.result, (img) => {
        const maxDim = Math.min(this.printArea.width, this.printArea.height) * 0.9;
        const scale = maxDim / Math.max(img.width, img.height);
        img.set({
          left: this._defaultPosition?.left ?? this.canvas.getWidth() / 2,
          top: this._defaultPosition?.top ?? this.canvas.getHeight() / 2,
          originX: "center",
          originY: "center",
          scaleX: scale,
          scaleY: scale,
        });
        this.canvas.add(img);
        this.canvas.setActiveObject(img);
        this.canvas.requestRenderAll();
      });
    };
    reader.readAsDataURL(file);
  }

  addText(text = "Seu texto aqui", color = "#1b1d1b") {
    const textbox = new fabric.IText(text, {
      left: this._defaultPosition?.left ?? this.canvas.getWidth() / 2,
      top: this._defaultPosition?.top ?? this.canvas.getHeight() / 2,
      originX: "center",
      originY: "center",
      fill: color,
      fontFamily: "sans-serif",
      fontSize: 32,
    });
    this.canvas.add(textbox);
    this.canvas.setActiveObject(textbox);
    this.canvas.requestRenderAll();
    return textbox;
  }

  setSelectedTextColor(color) {
    const active = this.canvas.getActiveObject();
    if (active && active.type === "i-text") {
      active.set({ fill: color });
      this.canvas.requestRenderAll();
    }
  }

  /**
   * DPI of every user-uploaded image currently on the canvas (text is
   * vector, always fine, so it's skipped). DPI only depends on how much
   * the object is scaled relative to canvas px/inch — not on the object's
   * raw pixel count — because scaling down a large source image raises
   * its effective print density, and stretching a small one lowers it.
   * Returns [] if there's no printPhysicalSize configured for this
   * product (can't compute a real-world DPI without it).
   */
  getImageQualityIssues() {
    if (!this._canvasPxPerInch) return [];
    return this.canvas
      .getObjects("image")
      .filter((obj) => obj !== this.mockupImage)
      .map((obj) => {
        const dpi = Math.min(
          this._canvasPxPerInch / obj.scaleX,
          this._canvasPxPerInch / obj.scaleY
        );
        return { object: obj, dpi: Math.round(dpi) };
      })
      .filter((issue) => issue.dpi < this.minDpi);
  }

  removeSelected() {
    const active = this.canvas.getActiveObject();
    if (active && active !== this.mockupImage && active !== this.guideRect) {
      this.canvas.remove(active);
      this.canvas.requestRenderAll();
    }
  }

  /**
   * Returns { dataUrl, canvasJson } cropped to the print area only, with
   * the mockup and guide rectangle hidden — this is the print-ready file.
   * multiplier=2 renders at 2x the on-screen size for better print
   * resolution; for real production files, consider defining printArea
   * in real print-DPI pixels instead of on-screen pixels.
   */
  exportPrintFile() {
    const scale = this.canvas.getWidth() / (this.mockupImage?.width ?? this.canvas.getWidth());
    const canvasJson = this.canvas.toJSON();

    this.mockupImage?.set({ visible: false });
    this.guideRect?.set({ visible: false });
    this.canvas.requestRenderAll();

    const dataUrl = this.canvas.toDataURL({
      format: "png",
      left: this.printArea.x * scale,
      top: this.printArea.y * scale,
      width: this.printArea.width * scale,
      height: this.printArea.height * scale,
      multiplier: 2,
    });

    this.mockupImage?.set({ visible: true });
    this.guideRect?.set({ visible: true });
    this.canvas.requestRenderAll();

    return { dataUrl, canvasJson };
  }
}
