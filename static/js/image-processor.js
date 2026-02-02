// Image processing utilities for custom head upload

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_BASE64_SIZE = 100 * 1024; // 100KB after encoding
const OUTPUT_SIZE = 60; // 60x60 output

export class ImageProcessor {
  /**
   * Validate and load an image file
   * @param {File} file - The file to validate
   * @returns {Promise<HTMLImageElement>} - The loaded image
   * @throws {Error} - If validation fails
   */
  static async validateAndLoad(file) {
    // Check file type
    if (!file.type.startsWith('image/')) {
      throw new Error('Please select an image file');
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('Image must be less than 2MB');
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Resize an image to fit within maxDimension while maintaining aspect ratio
   * @param {HTMLImageElement} img - The source image
   * @param {number} maxDimension - Maximum width/height
   * @returns {HTMLCanvasElement} - Canvas containing the resized image
   */
  static resizeImage(img, maxDimension) {
    const canvas = document.createElement('canvas');
    let width = img.width;
    let height = img.height;

    // Calculate scale to fit within maxDimension
    const scale = Math.min(maxDimension / width, maxDimension / height, 1);
    width *= scale;
    height *= scale;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    return canvas;
  }

  /**
   * Create a circular crop from a source canvas
   * @param {HTMLCanvasElement} sourceCanvas - The source canvas
   * @param {number} cropX - Center X of crop circle
   * @param {number} cropY - Center Y of crop circle
   * @param {number} cropRadius - Radius of crop circle
   * @param {number} outputSize - Size of output canvas (square)
   * @returns {HTMLCanvasElement} - Canvas with circular crop
   */
  static createCircularCrop(sourceCanvas, cropX, cropY, cropRadius, outputSize) {
    const output = document.createElement('canvas');
    output.width = outputSize;
    output.height = outputSize;
    const ctx = output.getContext('2d');

    // Create circular clipping path
    ctx.beginPath();
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    ctx.clip();

    // Calculate source position to center the crop
    const sourceX = cropX - cropRadius;
    const sourceY = cropY - cropRadius;
    const sourceSize = cropRadius * 2;

    // Draw the cropped portion
    ctx.drawImage(
      sourceCanvas,
      sourceX, sourceY, sourceSize, sourceSize,
      0, 0, outputSize, outputSize
    );

    return output;
  }

  /**
   * Convert canvas to base64 data URL
   * @param {HTMLCanvasElement} canvas - The canvas to convert
   * @returns {string} - Base64 data URL
   */
  static toDataURL(canvas) {
    return canvas.toDataURL('image/png');
  }

  /**
   * Validate base64 data URL size
   * @param {string} dataUrl - Base64 data URL
   * @returns {boolean} - True if size is acceptable
   */
  static validateBase64Size(dataUrl) {
    // Base64 size is approximately the length of the string
    return dataUrl.length <= MAX_BASE64_SIZE;
  }
}

export class CropTool {
  /**
   * Create a new crop tool
   * @param {HTMLCanvasElement} canvas - The canvas to display the image on
   * @param {HTMLElement} overlay - The overlay element for the crop circle
   */
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.ctx = canvas.getContext('2d');
    this.image = null;
    this.cropX = 0;
    this.cropY = 0;
    this.cropRadius = 50;
    this.isDragging = false;
    this.isResizing = false;
    this.lastX = 0;
    this.lastY = 0;
  }

  /**
   * Set the image to crop
   * @param {HTMLImageElement} img - The image to crop
   */
  setImage(img) {
    this.image = img;
    // Set canvas size to match image (max 400px for display)
    const maxSize = 400;
    const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
    this.canvas.width = img.width * scale;
    this.canvas.height = img.height * scale;

    // Initialize crop circle at center
    this.cropX = this.canvas.width / 2;
    this.cropY = this.canvas.height / 2;
    this.cropRadius = Math.min(this.canvas.width, this.canvas.height) * 0.35;

    this.render();
    // Defer overlay update until after modal is visible
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this.updateOverlay());
    });
    this.attachEventListeners();
  }

  /**
   * Render the image on the canvas
   */
  render() {
    if (!this.image) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Update the overlay position and size
   */
  updateOverlay() {
    const canvasRect = this.canvas.getBoundingClientRect();
    const overlayRect = this.overlay.getBoundingClientRect();

    // Position overlay over the crop circle
    this.overlay.style.left = `${canvasRect.left + this.cropX - this.cropRadius}px`;
    this.overlay.style.top = `${canvasRect.top + this.cropY - this.cropRadius}px`;
    this.overlay.style.width = `${this.cropRadius * 2}px`;
    this.overlay.style.height = `${this.cropRadius * 2}px`;
  }

  /**
   * Get the crop parameters (scaled to original image or target size)
   * @param {number} [targetWidth] - If provided, scale params to this target width instead of original
   * @returns {{x: number, y: number, radius: number}} - Crop parameters
   */
  getCropParams(targetWidth) {
    if (!this.image) return null;

    // If targetWidth is specified, scale to that size instead of original
    const referenceWidth = targetWidth !== undefined ? targetWidth : this.image.width;
    const scaleX = referenceWidth / this.canvas.width;
    const scaleY = scaleX; // Maintain square aspect ratio for output

    return {
      x: this.cropX * scaleX,
      y: this.cropY * scaleY,
      radius: this.cropRadius * Math.max(scaleX, scaleY)
    };
  }

  /**
   * Attach event listeners for mouse/touch interaction
   */
  attachEventListeners() {
    const handleStart = (e) => {
      e.preventDefault();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const canvasRect = this.canvas.getBoundingClientRect();
      const x = clientX - canvasRect.left;
      const y = clientY - canvasRect.top;

      // Check if clicking on the edge (for resizing)
      const distFromCenter = Math.sqrt((x - this.cropX) ** 2 + (y - this.cropY) ** 2);
      const edgeThreshold = 10;

      if (Math.abs(distFromCenter - this.cropRadius) < edgeThreshold) {
        this.isResizing = true;
      } else if (distFromCenter < this.cropRadius) {
        this.isDragging = true;
      }

      this.lastX = clientX;
      this.lastY = clientY;
    };

    const handleMove = (e) => {
      e.preventDefault();
      if (!this.isDragging && !this.isResizing) return;

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const dx = clientX - this.lastX;
      const dy = clientY - this.lastY;

      if (this.isDragging) {
        this.cropX += dx;
        this.cropY += dy;
      } else if (this.isResizing) {
        const distFromCenter = Math.sqrt(
          (clientX - this.canvas.getBoundingClientRect().left - this.cropX) ** 2 +
          (clientY - this.canvas.getBoundingClientRect().top - this.cropY) ** 2
        );
        this.cropRadius = Math.max(20, distFromCenter);
      }

      this.lastX = clientX;
      this.lastY = clientY;
      this.updateOverlay();
    };

    const handleEnd = () => {
      this.isDragging = false;
      this.isResizing = false;
    };

    this.canvas.addEventListener('mousedown', handleStart);
    this.canvas.addEventListener('touchstart', handleStart, { passive: false });

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('touchmove', handleMove, { passive: false });

    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchend', handleEnd);
  }

  /**
   * Clean up event listeners
   */
  destroy() {
    // Remove event listeners if needed
    this.overlay.style.left = '';
    this.overlay.style.top = '';
    this.overlay.style.width = '';
    this.overlay.style.height = '';
  }
}
