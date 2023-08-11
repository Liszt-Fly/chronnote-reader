import {
	applyInverseTransform,
	applyTransform,
	getPositionBoundingRect,
	getRotationTransform,
	transform,
	scaleShape
} from './lib/utilities';
import { SELECTION_COLOR } from '../common/defines';
import { getRectRotationOnText } from './selection';

export default class Page {
	constructor(layer, originalPage) {
		this.layer = layer;
		this.originalPage = originalPage;
		this.pageIndex = originalPage.id - 1;
		this.overlays = [];
		this.chars = [];
		this.selectionColor = '#bad6fb';
		this.previouslyAffected = false;

		let canvas = document.createElement('canvas');
		canvas.width = this.originalPage.canvas.width;
		canvas.height = this.originalPage.canvas.height;
		this.originalCanvas = canvas;
		this.originalContext = canvas.getContext('2d');
		this.originalContext.drawImage(this.originalPage.canvas, 0, 0);
		this.actualContext = this.originalPage.canvas.getContext('2d');
	}

	getSortedObjects() {
		let annotations = this.layer._getPageAnnotations(this.pageIndex);
		let objects = [...annotations, ...this.overlays];
		objects.sort((a, b) => a.sortIndex < b.sortIndex);
		return objects;
	}

	async redrawOriginalPage() {
		const { viewport, outputScale, pdfPage } = this.originalPage;
		pdfPage.pendingCleanup = true;
		pdfPage._tryCleanup();
		const transform = outputScale.scaled ? [outputScale.sx, 0, 0, outputScale.sy, 0, 0] : null;
		const renderTask = this.originalPage.pdfPage.render({
			canvasContext: this.originalContext,
			transform,
			viewport
		});
		await renderTask.promise;
		this.previouslyAffected = true;
	}

	// PDF to Canvas transform
	get transform() {
		let scale = parseFloat(this.originalCanvas.width) / this.originalPage.viewport.width;
		let scaleTransform = [scale, 0, 0, scale, 0, 0];
		return transform(scaleTransform, this.originalPage.viewport.transform);
	}

	getViewPoint(p, transform = this.transform) {
		return applyTransform(p, transform);
	}

	getPdfPoint(p) {
		return applyInverseTransform(p, this.transform);
	}

	getViewRect(rect, transform = this.transform) {
		let p1 = applyTransform(rect, transform);
		let p2 = applyTransform(rect.slice(2, 4), transform);
		let [x1, y1] = p1;
		let [x2, y2] = p2;
		return [
			Math.min(x1, x2),
			Math.min(y1, y2),
			Math.max(x1, x2),
			Math.max(y1, y2)
		];
	}

	p2v(position, transform = this.transform) {
		if (position.rects) {
			if (position.nextPageRects && position.pageIndex + 1 === this.pageIndex) {
				return {
					pageIndex: position.pageIndex,
					nextPageRects: position.nextPageRects.map((rect) => {
						let [x1, y2] = applyTransform(rect, transform);
						let [x2, y1] = applyTransform(rect.slice(2, 4), transform);
						return [
							Math.min(x1, x2),
							Math.min(y1, y2),
							Math.max(x1, x2),
							Math.max(y1, y2)
						];
					})
				};
			}
			else {
				let position2 = {
					pageIndex: position.pageIndex,
					rects: position.rects.map((rect) => {
						let [x1, y2] = applyTransform(rect, transform);
						let [x2, y1] = applyTransform(rect.slice(2, 4), transform);
						return [
							Math.min(x1, x2),
							Math.min(y1, y2),
							Math.max(x1, x2),
							Math.max(y1, y2)
						];
					})
				};
				// For text annotations
				if (position.fontSize) {
					position2.fontSize = applyTransform([position.fontSize, 0], transform)[0];
				}
				if (position.rotation) {
					position2.rotation = position.rotation;
				}
				return position2;
			}
		}
		else if (position.paths) {
			return {
				pageIndex: position.pageIndex,
				width: applyTransform([position.width, 0], transform)[0],
				paths: position.paths.map((path) => {
					let vpath = [];
					for (let i = 0; i < path.length - 1; i += 2) {
						let x = path[i];
						let y = path[i + 1];
						vpath.push(...applyTransform([x, y], transform));
					}
					return vpath;
				})
			};
		}
	}

	v2p(position) {
		let transform = this.transform;
		return {
			pageIndex: position.pageIndex,
			rects: position.rects.map((rect) => {
				let [x1, y2] = applyInverseTransform(rect, transform);
				let [x2, y1] = applyInverseTransform(rect.slice(2, 4), transform);
				return [
					Math.min(x1, x2),
					Math.min(y1, y2),
					Math.max(x1, x2),
					Math.max(y1, y2)
				];
			})
		};
	}

	drawNote(ctx, color) {
		ctx.beginPath();
		ctx.fillStyle = color;
		let poly = [0.5, 0.5, 23.5, 0.5, 23.5, 23.5, 11.5, 23.5, 0.5, 12.5, 0.5, 0.5];
		ctx.moveTo(poly[0], poly[1]);
		for (let item = 2; item < poly.length - 1; item += 2) {
			ctx.lineTo(poly[item], poly[item + 1]);
		}
		ctx.closePath();
		ctx.fill();

		ctx.beginPath();
		ctx.fillStyle = 'rgba(255, 255, 255,0.4)';
		poly = [0.5, 12.5, 11.5, 12.5, 11.5, 23.5, 0.5, 12.5];
		ctx.moveTo(poly[0], poly[1]);
		for (let item = 2; item < poly.length - 1; item += 2) {
			ctx.lineTo(poly[item], poly[item + 1]);
		}
		ctx.closePath();
		ctx.fill();
		ctx.fillStyle = '#000';

		let p = new Path2D('M0,0V12.707L11.293,24H24V0ZM11,22.293,1.707,13H11ZM23,23H12V12H1V1H23Z');
		ctx.fill(p);
	}

	drawCommentIndicators(annotations) {

		function quickIntersectRect(r1, r2) {
			return !(r2[0] > r1[2]
				|| r2[2] < r1[0]
				|| r2[1] > r1[3]
				|| r2[3] < r1[1]);
		}


		let notes = [];

		let width = 7;
		let height = 7;
		for (let annotation of annotations) {
			if (!['highlight', 'underline', 'image'].includes(annotation.type) || !annotation.comment) {
				continue;
			}
			let position = annotation.position;
			let left = position.rects[0][0] - width / 2;
			let top = position.rects[0][3] - height / 3;
			notes.push({
				annotation,
				rect: [
					left,
					top,
					left + width,
					top + height
				]
			});
		}

		notes.reverse();

		notes.sort((a, b) => a.rect[0] - b.rect[0]);
		for (let note of notes) {
			for (let note2 of notes) {
				if (note2 === note) break;

				if (quickIntersectRect(note.rect, note2.rect)) {
					let shift = (note2.rect[2] - note2.rect[0]) / 3 * 2;
					note.rect[0] = note2.rect[0] + shift;
					note.rect[2] = note2.rect[2] + shift;
				}
			}
		}

		for (let note of notes) {
			this.actualContext.save();
			let scale = this.getViewPoint([1 / (24 / width), 0])[0];
			let rect = this.getViewRect(note.rect);
			this.actualContext.transform(scale, 0, 0, scale, rect[0], rect[1]);
			this.drawNote(this.actualContext, note.annotation.color);
			this.actualContext.restore();
		}
	}

	_renderHighlight(annotation) {
		let position = this.p2v(annotation.position);
		this.actualContext.save();
		this.actualContext.globalAlpha = 0.4;
		this.actualContext.globalCompositeOperation = 'multiply';
		this.actualContext.fillStyle = annotation.color;

		let rects = position.rects;
		if (position.nextPageRects && position.pageIndex + 1 === this.pageIndex) {
			rects = position.nextPageRects;
		}

		for (let rect of rects) {
			this.actualContext.fillRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
		}
		this.actualContext.restore();
	}

	_renderUnderline(annotation) {
		let pageData = this.layer._pdfPages[this.pageIndex];
		if (!pageData) {
			return;
		}
		let structuredText = pageData.structuredText;
		let position = this.p2v(annotation.position);
		this.actualContext.save();
		// this.actualContext.globalAlpha = 0;
		this.actualContext.globalCompositeOperation = 'multiply';
		this.actualContext.fillStyle = annotation.color;
		let rects;
		let pdfRect;
		if (position.nextPageRects && position.pageIndex + 1 === this.pageIndex) {
			rects = position.nextPageRects;
			pdfRect = annotation.position.nextPageRects[0];
		}
		else {
			rects = position.rects;
			pdfRect = annotation.position.rects[0];
		}
		let viewRect = rects[0];
		let width = 1;
		width *= (viewRect[2] - viewRect[0]) / (pdfRect[2] - pdfRect[0]);
		for (let rect of rects) {
			// Get the actual line rect taking into account text rotation
			let rotation = getRectRotationOnText(structuredText, annotation.position.rects[0]);
			let [x1, y1, x2, y2] = rect;
			let rect2 = (
				rotation === 0 && [x1, y2 - width, x2, y2]
				|| rotation === 90 && [x2 - width, y2, x2, y1]
				|| rotation === 180 && [x1, y1, x2, y1 - width]
				|| rotation === 270 && [x1, y2, x1 - width, y1]
			);
			this.actualContext.fillRect(rect2[0], rect2[1], rect2[2] - rect2[0], rect2[3] - rect2[1]);
		}
		this.actualContext.restore();
	}

	_renderNote(annotation) {
		let position = this.p2v(annotation.position);
		this.actualContext.save();
		let pdfRect = annotation.position.rects[0];
		let viewRect = position.rects[0];
		let scale = (viewRect[2] - viewRect[0]) / (pdfRect[2] - pdfRect[0]) * (22 / 24);
		this.actualContext.transform(scale, 0, 0, scale, viewRect[0], viewRect[1]);
		this.drawNote(this.actualContext, annotation.color);
		this.actualContext.restore();
	}

	_renderImage(annotation) {
		let position = this.p2v(annotation.position);
		this.actualContext.save();
		this.actualContext.strokeStyle = annotation.color;
		this.actualContext.lineWidth = 3 * devicePixelRatio;
		let rect = position.rects[0];
		this.actualContext.strokeRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
		this.actualContext.restore();
	}

	_renderInk(annotation) {
		let position = this.p2v(annotation.position);
		this.actualContext.save();
		this.actualContext.beginPath();
		this.actualContext.strokeStyle = annotation.color;
		this.actualContext.lineWidth = position.width;
		this.actualContext.lineCap = 'round';
		this.actualContext.lineJoin = 'round';

		for (let path of position.paths) {
			this.actualContext.moveTo(...path.slice(0, 2));
			for (let i = 0; i < path.length - 1; i += 2) {
				let x = path[i];
				let y = path[i + 1];
				if (i === 0) {
					this.actualContext.moveTo(x, y);
				}
				this.actualContext.lineTo(x, y);
			}
		}
		this.actualContext.stroke();
		this.actualContext.restore();
	}



	render() {
		if (!this.actualContext) {
			return;
		}

		let annotations = this.layer._getPageAnnotations(this.pageIndex);
		let selectedAnnotationIDs = this.layer._selectedAnnotationIDs;
		let selectionRanges = this.layer._selectionRanges;
		let action = this.layer.action;
		let annotationTextSelectionData = this.layer._annotationTextSelectionData;
		let focusedObject = this.layer._focusedObject;
		let highlightedPosition = this.layer._highlightedPosition;

		let doc = this.originalPage.div.ownerDocument;
		let customAnnotationLayer = this.originalPage.div.querySelector('.customAnnotationLayer');
		if (!customAnnotationLayer) {
			customAnnotationLayer = doc.createElement('div');
			customAnnotationLayer.className = 'customAnnotationLayer';
			this.originalPage.div.append(customAnnotationLayer);
		}
		let customAnnotations = Array.from(customAnnotationLayer.children);

		for (let annotation of annotations) {
			if (annotation.type === 'text' && annotation.position.pageIndex === this.pageIndex) {

				let position = annotation.position;

				if (action && ['resize', 'rotate'].includes(action.type) && action.annotation.id === annotation.id) {
					position = action.position;
				}

				let node = customAnnotations.find(x => x.getAttribute('data-id') === annotation.id);

				let disabled = this.layer._readOnly || annotation.readOnly;

				let top = this.originalPage.viewport.viewBox[3] - position.rects[0][3];
				let left = position.rects[0][0];
				let width = position.rects[0][2] - position.rects[0][0];
				let height = position.rects[0][3] - position.rects[0][1];

				let style = [
					`left: calc(${left}px * var(--scale-factor))`,
					`top: calc(${top}px * var(--scale-factor))`,
					`min-width: calc(${position.fontSize}px * var(--scale-factor))`,
					`min-height: calc(${position.fontSize}px * var(--scale-factor))`,
					`width: calc(${width}px * var(--scale-factor))`,
					`height: calc(${height}px * var(--scale-factor))`,
					`color: ${annotation.color}`,
					`font-size: calc(${position.fontSize}px * var(--scale-factor))`,
					`font-family: ${window.computedFontFamily}`
				];
				if (position.rotation) {
					style.push(`transform: rotate(${-position.rotation}deg)`);
				}

				style = style.join(';');

				if (!node) {
					node = doc.createElement('textarea');
					node.setAttribute('data-id', annotation.id);
					node.dir = 'auto';
					node.className = 'textAnnotation';
					node.disabled = disabled;
					node.addEventListener('blur', (event) => {
						node.classList.remove('focusable');
						// node.contentEditable = false;
					});
					customAnnotationLayer.append(node);
				}

				if (node.getAttribute('style') !== style) {
					node.setAttribute('style', style);
				}
				if (node.getAttribute('data-comment') !== annotation.comment) {
					node.value = annotation.comment;
					node.setAttribute('data-comment', annotation.comment);
				}
				if (node.disabled != disabled) {
					node.disabled = disabled;
				}
			}
		}

		// Remove abandoned (deleted) text annotations
		let textAnnotationNodes = Array.from(this.layer._iframeWindow.document.querySelectorAll(`[data-page-number="${this.pageIndex + 1}"] .textAnnotation`));
		for (let node of textAnnotationNodes) {
			let id = node.getAttribute('data-id');
			if (!annotations.find(x => x.id === id)) {
				node.remove();
			}
		}

		this.actualContext.save();
		this.actualContext.drawImage(this.originalCanvas, 0, 0);

		for (let annotation of annotations) {
			if (annotation.type === 'highlight' && !(action?.type === 'updateAnnotationRange' && action.annotation.id === annotation.id)) {
				this._renderHighlight(annotation);
			}
			if (annotation.type === 'underline' && !(action?.type === 'updateAnnotationRange' && action.annotation.id === annotation.id)) {
				this._renderUnderline(annotation);
			}
			else if (annotation.type === 'note') {
				this._renderNote(annotation);
			}
			else if (annotation.type === 'image') {
				if (!selectedAnnotationIDs.includes(annotation.id)) {
					this._renderImage(annotation);
				}
			}
			else if (annotation.type === 'ink') {
				if (action && action.position && action.type === 'resize' && annotation.id === action.annotation.id) {
					this._renderInk({ ...annotation, position: action.position });
				}
				else if (action && action.triggered && action.type === 'erase' && action.annotations.has(annotation.id)) {
					let { position } = action.annotations.get(annotation.id);
					this._renderInk({ ...annotation, position });
				}
				else {
					this._renderInk(annotation);
				}
			}
		}

		if (action?.type === 'updateAnnotationRange' && (
			action.annotation.position.pageIndex === this.pageIndex
			|| action.annotation.position.nextPageRects && action.annotation.position.pageIndex + 1 === this.pageIndex
		)) {
			if (action.annotation.type === 'highlight') {
				this._renderHighlight(action.annotation);
			}
			else if (action.annotation.type === 'underline') {
				this._renderUnderline(action.annotation);
			}
		}


		this.drawCommentIndicators(annotations);









		if (focusedObject && (
			focusedObject.position.pageIndex === this.pageIndex
			|| focusedObject.position.nextPageRects && focusedObject.position.pageIndex + 1 === this.pageIndex
		)) {
			let position = focusedObject.position;

			this.actualContext.strokeStyle = '#838383';
			this.actualContext.beginPath();
			this.actualContext.setLineDash([5 * devicePixelRatio, 3 * devicePixelRatio]);
			this.actualContext.lineWidth = 2 * devicePixelRatio;


			let padding = 5 * devicePixelRatio;


			let rect = getPositionBoundingRect(position, this.pageIndex);

			rect = this.getViewRect(rect);


			rect = [
				rect[0] - padding,
				rect[1] - padding,
				rect[2] + padding,
				rect[3] + padding,
			];
			this.actualContext.rect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
			this.actualContext.stroke();
		}






		if (action?.type !== 'updateAnnotationRange' || !action?.triggered) {
			this.actualContext.save();
			let selectedAnnotations = annotations.filter(x => selectedAnnotationIDs.includes(x.id));
			for (let annotation of selectedAnnotations) {

				this.actualContext.strokeStyle = '#6d95e0';
				this.actualContext.beginPath();
				this.actualContext.setLineDash([5 * devicePixelRatio, 3 * devicePixelRatio]);
				this.actualContext.lineWidth = 2 * devicePixelRatio;
				let padding = 5 * devicePixelRatio;
				let rect = getPositionBoundingRect(annotation.position, this.pageIndex);
				let rotation = 0;
				if (annotation.type === 'text') {
					rect = annotation.position.rects[0];
				}
				if (['image', 'text', 'ink'].includes(annotation.type)) {
					padding = 0;
					rotation = annotation.position.rotation;
					if (action && ['resize', 'rotate'].includes(action.type) && action.triggered) {
						if (annotation.type === 'text') {
							rect = action.position.rects[0];
						}
						else {
							rect = getPositionBoundingRect(action.position);
						}
						rotation = action.position.rotation;
					}
				}
				if (annotation.type === 'image') {
					this.actualContext.lineWidth = 3 * devicePixelRatio;
				}
				let tm = this.transform;
				if (annotation.type === 'text') {
					tm = getRotationTransform(rect, rotation || 0);
					tm = transform(this.transform, tm);
				}
				let p1 = [rect[0], rect[1]];
				let p2 = [rect[2], rect[1]];
				let p3 = [rect[2], rect[3]];
				let p4 = [rect[0], rect[3]];
				let pml = [rect[0], rect[1] + (rect[3] - rect[1]) / 2];
				let pmr = [rect[2], rect[1] + (rect[3] - rect[1]) / 2];
				let pmt = [rect[0] + (rect[2] - rect[0]) / 2, rect[3]];
				let pmb = [rect[0] + (rect[2] - rect[0]) / 2, rect[1]];
				let ROTATION_BOTTOM = 16;
				let pr = [rect[0] + (rect[2] - rect[0]) / 2, rect[3] + ROTATION_BOTTOM];
				p1 = this.getViewPoint(p1, tm);
				p2 = this.getViewPoint(p2, tm);
				p3 = this.getViewPoint(p3, tm);
				p4 = this.getViewPoint(p4, tm);
				pml = this.getViewPoint(pml, tm);
				pmr = this.getViewPoint(pmr, tm);
				pmt = this.getViewPoint(pmt, tm);
				pmb = this.getViewPoint(pmb, tm);
				pr = this.getViewPoint(pr, tm);
				let BOX_PADDING = 10 * devicePixelRatio;
				if (annotation.type !== 'image') {
					[p1, p2, p3, p4, pml, pmr, pmt, pmb] = scaleShape([p1, p2, p3, p4], [p1, p2, p3, p4, pml, pmr, pmt, pmb], BOX_PADDING);
				}
				// Dashed lines
				this.actualContext.beginPath();
				this.actualContext.moveTo(...p1);
				this.actualContext.lineTo(...p2);
				this.actualContext.lineTo(...p3);
				this.actualContext.lineTo(...p4);
				this.actualContext.closePath();
				if (!(this.layer._readOnly || annotation.readOnly) && annotation.type === 'text') {
					this.actualContext.moveTo(...pmt);
					this.actualContext.lineTo(...pr);
				}
				this.actualContext.stroke();
				const radius = 4 * devicePixelRatio;
				this.actualContext.fillStyle = '#81b3ff';

				// Circles
				if (!(this.layer._readOnly || annotation.readOnly)) {
					if (['image', 'text', 'ink'].includes(annotation.type)) {
						this.actualContext.beginPath();
						this.actualContext.arc(...p1, radius, 0, 2 * Math.PI, false);
						this.actualContext.fill();
					}
					if (['image', 'text', 'ink'].includes(annotation.type)) {
						this.actualContext.beginPath();
						this.actualContext.arc(...p2, radius, 0, 2 * Math.PI, false);
						this.actualContext.fill();
					}
					if (['image', 'text', 'ink'].includes(annotation.type)) {
						this.actualContext.beginPath();
						this.actualContext.arc(...p4, radius, 0, 2 * Math.PI, false);
						this.actualContext.fill();
					}
					if (['image', 'text', 'ink'].includes(annotation.type)) {
						this.actualContext.beginPath();
						this.actualContext.arc(...p3, radius, 0, 2 * Math.PI, false);
						this.actualContext.fill();
					}
					if (['image', 'text'].includes(annotation.type)) {
						this.actualContext.beginPath();
						this.actualContext.arc(...pmr, radius, 0, 2 * Math.PI, false);
						this.actualContext.fill();
					}
					if (['image', 'text'].includes(annotation.type)) {
						this.actualContext.beginPath();
						this.actualContext.arc(...pml, radius, 0, 2 * Math.PI, false);
						this.actualContext.fill();
					}
					if (annotation.type === 'image') {
						this.actualContext.beginPath();
						this.actualContext.arc(...pmt, radius, 0, 2 * Math.PI, false);
						this.actualContext.fill();
					}
					if (annotation.type === 'image') {
						this.actualContext.beginPath();
						this.actualContext.arc(...pmb, radius, 0, 2 * Math.PI, false);
						this.actualContext.fill();
					}
					if (annotation.type === 'text') {
						this.actualContext.beginPath();
						this.actualContext.arc(...pr, radius, 0, 2 * Math.PI, false);
						this.actualContext.fill();
					}
				}
			}
			this.actualContext.restore();
		}

		let annotation = annotations.find(x => x.id === selectedAnnotationIDs[0]);

		if (annotation && ['highlight', 'underline'].includes(annotation.type)) {
			let annotation2 = annotation;
			if (action?.type === 'updateAnnotationRange' && action.annotation) {
				annotation2 = action.annotation;
			}
			if (this.layer._pdfPages[this.pageIndex]
				&& (!annotation2.position.nextPageRects || this.layer._pdfPages[this.pageIndex + 1])) {
				let structuredText = this.layer._pdfPages[this.pageIndex].structuredText;
				let position = this.p2v(annotation2.position);
				this.actualContext.save();
				this.actualContext.globalCompositeOperation = 'multiply';
				this.actualContext.fillStyle = annotation2.color;
				let startRect;
				let endRect;
				let padding = 1 * devicePixelRatio;
				if (annotation2.position.nextPageRects) {
					if (position.pageIndex + 1 === this.pageIndex) {
						let structuredText = this.layer._pdfPages[this.pageIndex + 1].structuredText;
						let rotation = getRectRotationOnText(structuredText, annotation2.position.nextPageRects.at(-1));
						let [x1, y1, x2, y2] = position.nextPageRects.at(-1);
						endRect = (
							rotation === 0 && [x2 - padding, y1, x2 + padding, y2]
							|| rotation === 90 && [x1, y1 - padding, x2, y1 + padding]
							|| rotation === 180 && [x1 - padding, y1, x1 + padding, y2]
							|| rotation === 270 && [x1, y2 - padding, x2, y2 + padding]
						);
					}
					else {
						let rotation = getRectRotationOnText(structuredText, annotation2.position.rects[0]);
						let [x1, y1, x2, y2] = position.rects[0];
						startRect = (
							rotation === 0 && [x1 - padding, y1, x1 + padding, y2]
							|| rotation === 90 && [x1, y2 - padding, x2, y2 + padding]
							|| rotation === 180 && [x2 - padding, y1, x2 + padding, y2]
							|| rotation === 270 && [x1, y1 - padding, x2, y1 + padding]
						);
					}
				}
				else {
					let rotation = getRectRotationOnText(structuredText, annotation2.position.rects[0]);
					let [x1, y1, x2, y2] = position.rects[0];
					startRect = (
						rotation === 0 && [x1 - padding, y1, x1 + padding, y2]
						|| rotation === 90 && [x1, y2 - padding, x2, y2 + padding]
						|| rotation === 180 && [x2 - padding, y1, x2 + padding, y2]
						|| rotation === 270 && [x1, y1 - padding, x2, y1 + padding]
					);
					rotation = getRectRotationOnText(structuredText, annotation2.position.rects.at(-1));
					[x1, y1, x2, y2] = position.rects.at(-1);
					endRect = (
						rotation === 0 && [x2 - padding, y1, x2 + padding, y2]
						|| rotation === 90 && [x1, y1 - padding, x2, y1 + padding]
						|| rotation === 180 && [x1 - padding, y1, x1 + padding, y2]
						|| rotation === 270 && [x1, y2 - padding, x2, y2 + padding]
					);
				}
				if (!(this.layer._readOnly || annotation.readOnly) && startRect) {
					let rect = startRect;
					this.actualContext.fillRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
				}
				if (!(this.layer._readOnly || annotation.readOnly) && endRect) {
					let rect = endRect;
					this.actualContext.fillRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
				}
				this.actualContext.restore();
			}
		}


		this.actualContext.save();
		this.actualContext.globalCompositeOperation = 'multiply';
		if (selectionRanges.length && !selectionRanges[0].collapsed && ['highlight', 'underline'].includes(this.layer._tool.type)) {
			let annotation = this.layer._getAnnotationFromSelectionRanges(selectionRanges, this.layer._tool.type, this.layer._tool.color);
			if (annotation.position.pageIndex === this.pageIndex
				|| annotation.position.nextPageRects && annotation.position.pageIndex + 1 === this.pageIndex) {
				if (annotation.type === 'highlight') {
					this._renderHighlight(annotation);
				}
				else {
					this._renderUnderline(annotation);
				}
			}
		}
		else {
			for (let selectionRange of selectionRanges) {
				let { position } = selectionRange;
				if (position.pageIndex !== this.pageIndex) {
					continue;
				}
				position = this.p2v(position);
				this.actualContext.fillStyle = SELECTION_COLOR;
				for (let rect of position.rects) {
					this.actualContext.fillRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
				}
			}
		}
		this.actualContext.restore();


		if (action) {
			if (action.type === 'moveAndDrag' && action.triggered) {
				if (action.annotation.position.pageIndex === this.pageIndex) {
					this.actualContext.strokeStyle = '#aaaaaa';
					this.actualContext.setLineDash([5 * devicePixelRatio, 3 * devicePixelRatio]);
					this.actualContext.lineWidth = 2 * devicePixelRatio;
					let rect = getPositionBoundingRect(action.position);
					let tm = this.transform;
					if (annotation.type === 'text') {
						rect = action.position.rects[0];
						tm = getRotationTransform(rect, annotation.position.rotation || 0);
						tm = transform(this.transform, tm);
					}
					let p1 = [rect[0], rect[1]];
					let p2 = [rect[2], rect[1]];
					let p3 = [rect[2], rect[3]];
					let p4 = [rect[0], rect[3]];
					p1 = this.getViewPoint(p1, tm);
					p2 = this.getViewPoint(p2, tm);
					p3 = this.getViewPoint(p3, tm);
					p4 = this.getViewPoint(p4, tm);
					let BOX_PADDING = 10 * devicePixelRatio;
					[p1, p2, p3, p4] = scaleShape([p1, p2, p3, p4], [p1, p2, p3, p4], BOX_PADDING);
					this.actualContext.beginPath();
					this.actualContext.moveTo(...p1);
					this.actualContext.lineTo(...p2);
					this.actualContext.lineTo(...p3);
					this.actualContext.lineTo(...p4);
					this.actualContext.closePath();
					this.actualContext.stroke();
				}
			}
			else if (action.type === 'image' && action.annotation) {
				if (action.annotation.position.pageIndex === this.pageIndex) {
					this._renderImage(action.annotation);
				}
			}
			else if (action.type === 'ink' && action.annotation) {
				if (action.annotation.position.pageIndex === this.pageIndex) {
					this._renderInk(action.annotation);
				}
			}
		}

		// Highlight position
		if (highlightedPosition && (
			highlightedPosition.pageIndex === this.pageIndex
			|| highlightedPosition.nextPageRects && highlightedPosition.pageIndex + 1 === this.pageIndex
		)) {
			let position = highlightedPosition;
			let annotation = { position, color: SELECTION_COLOR };
			if (position.rects) {
				this._renderHighlight(annotation);
			}
			else if (position.paths) {
				this._renderInk(annotation);
			}
		}

		this.actualContext.restore();
	}

	nextPagePosition(position) {
		return position.nextPageRects && position.pageIndex + 1 === this.pageIndex;
	}

	renderAnnotationOnCanvas(annotation, canvas) {
		let ctx = canvas.getContext('2d');

		let pixelRatio = window.devicePixelRatio;
		let transform = this.originalPage.viewport.transform;

		let pdfBoundingRect = getPositionBoundingRect(annotation.position, this.pageIndex);
		let viewBoundingRect = this.getViewRect(pdfBoundingRect, transform);
		let width = viewBoundingRect[2] - viewBoundingRect[0];
		let height = viewBoundingRect[3] - viewBoundingRect[1];

		let MAX_SIZE = 200;

		if (width > MAX_SIZE) {
			height = height * MAX_SIZE / width;
			width = MAX_SIZE;
		}
		else if (height > MAX_SIZE) {
			width = width * MAX_SIZE / height;
			height = MAX_SIZE;
		}

		canvas.width = width * pixelRatio;
		canvas.height = height * pixelRatio;
		canvas.style.width = width + 'px';
		canvas.style.height = height + 'px';

		let scale = canvas.width / (pdfBoundingRect[2] - pdfBoundingRect[0]);

		ctx.save();
		if (annotation.type === 'highlight') {
			ctx.transform(scale, 0, 0, -scale, 0, height * pixelRatio);
			let position = annotation.position;
			ctx.globalAlpha = 0.5;
			ctx.globalCompositeOperation = 'multiply';
			ctx.fillStyle = annotation.color || SELECTION_COLOR;
			let rects = position.rects;
			if (position.nextPageRects && position.pageIndex + 1 === this.pageIndex) {
				rects = position.nextPageRects;
			}
			ctx.transform(1, 0, 0, 1, -pdfBoundingRect[0], -pdfBoundingRect[1]);
			for (let rect of rects) {
				ctx.fillRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
			}
		}
		else if (annotation.type === 'underline') {
			ctx.transform(scale, 0, 0, -scale, 0, height * pixelRatio);
			let position = annotation.position;
			// ctx.globalAlpha = 0.5;
			ctx.globalCompositeOperation = 'multiply';
			ctx.fillStyle = annotation.color || SELECTION_COLOR;
			let rects = position.rects;
			if (position.nextPageRects && position.pageIndex + 1 === this.pageIndex) {
				rects = position.nextPageRects;
			}
			ctx.transform(1, 0, 0, 1, -pdfBoundingRect[0], -pdfBoundingRect[1]);
			for (let rect of rects) {
				ctx.fillRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
			}
		}
		else if (annotation.type === 'note') {
			let rect = annotation.position.rects[0];
			let width = rect[2] - rect[0];
			scale *= (width / 24);
			ctx.transform(scale, 0, 0, scale, 0, 0);
			this.drawNote(ctx, annotation.color);
		}
		else if (annotation.type === 'image') {
			ctx.globalAlpha = 0.5;
			ctx.globalCompositeOperation = 'multiply';
			ctx.fillStyle = annotation.color;
			// Original canvas to view ratio. Normally it's 1 but once zoomed too much canvas resolution is lover than the view,
			// therefore the ratio goes below 1
			let upscaleRatio = this.originalPage.viewport.width / parseFloat(this.originalCanvas.width) * devicePixelRatio;
			// Drag image to view, because drag canvas image can smaller than what you see in the view
			let dragImageToViewRatio = width / (viewBoundingRect[2] - viewBoundingRect[0]);
			let coordinatesScale = devicePixelRatio * dragImageToViewRatio;
			let scale = dragImageToViewRatio * upscaleRatio;
			ctx.transform(scale, 0, 0, scale, -viewBoundingRect[0] * coordinatesScale, -viewBoundingRect[1] * coordinatesScale);
			ctx.drawImage(this.originalCanvas, 0, 0);
		}
		ctx.restore();
	}
}
