import React, { useEffect, useRef, useContext, Fragment } from 'react';
import { useIntl } from 'react-intl';
import cx from 'classnames';
import PropTypes from 'prop-types';
import CustomSections from './common/custom-sections';
import { ReaderContext } from '../reader';
import { IconColor20 } from './common/icons';

import {
	PanelLeft,
	ZoomIn,
	ZoomOut,
	Maximize,
	Type,
	ChevronLeft,
	ChevronUp,
	ChevronDown,
	Highlighter,
	Underline,
	StickyNote,
	Text,
	Image,
	Pen,
	Eraser,
	Search,
	ChevronDown as ChevronDown8,
	PanelBottom
} from 'lucide-react';

function Toolbar(props) {
	const intl = useIntl();
	const pageInputRef = useRef();
	const { platform } = useContext(ReaderContext);

	useEffect(() => {
		if (['pdf', 'epub'].includes(props.type)) {
			pageInputRef.current.value = props.pageLabel ?? (props.pageIndex + 1);
		}
	}, [props.pageLabel, props.pageIndex]);

	function handleSidebarButtonClick(_event) {
		props.onToggleSidebar(!props.sidebarOpen);
	}

	function handleToolColorClick(event) {
		let br = event.currentTarget.getBoundingClientRect();
		props.onOpenColorContextMenu({ x: br.left, y: br.bottom });
	}

	function handleFindClick(_event) {
		props.onToggleFind();
	}

	function handleToolClick(type) {
		if (props.tool.type === type) {
			type = 'pointer';
		}
		if (type === 'ink' && ['ink', 'eraser'].includes(props.tool.type)) {
			type = 'pointer';
		}
		props.onChangeTool({ type });
	}

	function handlePageNumberKeydown(event) {
		if (event.key === 'Enter') {
			props.onChangePageNumber(event.target.value);
		}
	}

	function handlePageNumberBlur(event) {
		if (event.target.value != (props.pageLabel ?? (props.pageIndex + 1))) {
			props.onChangePageNumber(event.target.value);
		}
	}

	const iconStyle = { size: 20, strokeWidth: 1.5 };

	return (
		<div className="toolbar" data-tabstop={1} role="application">
			<div className="start">
				<button
					id="sidebarToggle"
					className="toolbar-button sidebar-toggle"
					title={intl.formatMessage({ id: 'pdfReader.toggleSidebar' })}
					tabIndex={-1}
					onClick={handleSidebarButtonClick}
				><PanelLeft {...iconStyle} /></button>
				<div className="divider"/>
				<button
					id="zoomOut"
					className="toolbar-button zoomOut"
					title={intl.formatMessage({ id: 'pdfReader.zoomOut' })}
					tabIndex={-1}
					disabled={!props.enableZoomOut}
					onClick={props.onZoomOut}
				><ZoomOut {...iconStyle} /></button>
				<button
					id="zoomIn"
					className="toolbar-button zoomIn"
					title={intl.formatMessage({ id: 'pdfReader.zoomIn' })}
					tabIndex={-1}
					disabled={!props.enableZoomIn}
					onClick={props.onZoomIn}
				><ZoomIn {...iconStyle} /></button>
				<button
					id="zoomAuto"
					className="toolbar-button zoomAuto"
					title={intl.formatMessage({ id: 'pdfReader.zoomReset' })}
					tabIndex={-1}
					disabled={!props.enableZoomReset}
					onClick={props.onZoomReset}
				><Maximize {...iconStyle} /></button>
				<button
					id="appearance"
					className={cx('toolbar-button', { active: props.appearancePopup })}
					title={intl.formatMessage({ id: 'pdfReader.appearance' })}
					tabIndex={-1}
					onClick={props.onToggleAppearancePopup}
				><Type {...iconStyle} /></button>
				<div className="divider"/>
				<button
					id="navigateBack"
					className="toolbar-button navigateBack"
					title={intl.formatMessage({ id: 'general.back' })}
					tabIndex={-1}
					disabled={!props.enableNavigateBack}
					onClick={props.onNavigateBack}
				><ChevronLeft {...iconStyle} /></button>
				<div className="divider"/>
				{['pdf', 'epub'].includes(props.type) && (
					<React.Fragment>
						<button
							className="toolbar-button pageUp"
							title={intl.formatMessage({ id: 'pdfReader.previousPage' })}
							id="previous"
							tabIndex={-1}
							disabled={!props.enableNavigateToPreviousPage}
							onClick={props.onNavigateToPreviousPage}
							aria-describedby="numPages"
						><ChevronUp {...iconStyle} /></button>
						<button
							className="toolbar-button pageDown"
							title={intl.formatMessage({ id: 'pdfReader.nextPage' })}
							id="next"
							tabIndex={-1}
							disabled={!props.enableNavigateToNextPage}
							onClick={props.onNavigateToNextPage}
							aria-describedby="numPages"
						><ChevronDown {...iconStyle} /></button>
					</React.Fragment>
				)}
				{['pdf', 'epub'].includes(props.type) && (
					<input
						ref={pageInputRef}
						type="input"
						id="pageNumber"
						className="toolbar-text-input"
						title={intl.formatMessage({
							id: props.type === 'pdf' || props.usePhysicalPageNumbers
								? 'pdfReader.page'
								: 'pdfReader.location'
						})}
						defaultValue=""
						size="4"
						min="1"
						tabIndex={-1}
						autoComplete="off"
						onKeyDown={handlePageNumberKeydown}
						onBlur={handlePageNumberBlur}
					/>)}
				{props.pageLabel && (
					<span id="numPages">&nbsp;<div>{!(props.type === 'pdf' && props.pageIndex + 1 == props.pageLabel)
						&& (props.pageIndex + 1)} / {props.pagesCount}</div></span>
				)}
			</div>
			<div className="center tools">
				<button
					tabIndex={-1}
					className={cx('toolbar-button highlight', { active: props.tool.type === 'highlight' })}
					title={intl.formatMessage({ id: 'pdfReader.highlightText' })}
					disabled={props.readOnly}
					onClick={() => handleToolClick('highlight')}
					data-l10n-id="pdfReader-toolbar-highlight"
				><Highlighter {...iconStyle} /></button>
				<button
					tabIndex={-1}
					className={cx('toolbar-button underline', { active: props.tool.type === 'underline' })}
					title={intl.formatMessage({ id: 'pdfReader.underlineText' })}
					disabled={props.readOnly}
					onClick={() => handleToolClick('underline')}
					data-l10n-id="pdfReader-toolbar-underline"
				><Underline {...iconStyle} /></button>
				<button
					tabIndex={-1}
					className={cx('toolbar-button note', {
						active: props.tool.type === 'note'
					})}
					title={intl.formatMessage({ id: 'pdfReader.addNote' })}
					disabled={props.readOnly}
					onClick={() => handleToolClick('note')}
					data-l10n-id="pdfReader-toolbar-note"
				><StickyNote {...iconStyle} /></button>
				{props.type === 'pdf' && (
					<button
						tabIndex={-1}
						className={cx('toolbar-button text', { active: props.tool.type === 'text' })}
						title={intl.formatMessage({ id: 'pdfReader.addText' })}
						disabled={props.readOnly}
						onClick={() => handleToolClick('text')}
						data-l10n-id="pdfReader-toolbar-text"
					><Text {...iconStyle} /></button>
				)}
				{props.type === 'pdf' && (
					<button
						tabIndex={-1}
						className={cx('toolbar-button area', { active: props.tool.type === 'image' })}
						title={intl.formatMessage({ id: 'pdfReader.selectArea' })}
						disabled={props.readOnly}
						onClick={() => handleToolClick('image')}
						data-l10n-id="pdfReader-toolbar-area"
					><Image {...iconStyle} /></button>
				)}
				{props.type === 'pdf' && (
					<button
						tabIndex={-1}
						className={cx('toolbar-button ink', { active: ['ink', 'eraser'].includes(props.tool.type) })}
						title={intl.formatMessage({ id: 'pdfReader.draw' })}
						disabled={props.readOnly}
						onClick={() => handleToolClick('ink')}
						data-l10n-id="pdfReader-toolbar-draw"
					><Pen {...iconStyle} /></button>
				)}
				<div className="divider"/>
				<button
					tabIndex={-1}
					className="toolbar-button toolbar-dropdown-button"
					disabled={props.readOnly || ['pointer', 'hand'].includes(props.tool.type)}
					title={intl.formatMessage({ id: 'pdfReader.pickColor' })}
					onClick={handleToolColorClick}
				>
					{
						props.tool.type === 'eraser'
							? <Eraser {...iconStyle} />
							: <IconColor20 color={props.tool.color || ['pointer', 'hand'].includes(props.tool.type) && 'transparent'}/>
					}
					<ChevronDown8 size={8} strokeWidth={1.5} />
				</button>
			</div>
			<div className="end">
				<CustomSections type="Toolbar"/>
				<button
					className={cx('toolbar-button find', { active: props.findPopupOpen })}
					title={intl.formatMessage({ id: 'pdfReader.findInDocument' })}
					tabIndex={-1}
					onClick={handleFindClick}
				><Search {...iconStyle} /></button>
				{platform === 'zotero' && props.showContextPaneToggle && (
					<Fragment>
						<div className="divider"/>
						<button
							className="toolbar-button context-pane-toggle"
							title={intl.formatMessage({ id: 'pdfReader.toggleContextPane' })}
							tabIndex={-1}
							onClick={props.onToggleContextPane}
						>{props.stackedView ? <PanelBottom {...iconStyle} /> : <PanelLeft {...iconStyle} className="standard-view"/>}</button>
					</Fragment>
				)}
			</div>
		</div>
	);
}

Toolbar.propTypes = {
	type: PropTypes.string,
	pageLabel: PropTypes.string,
	pageIndex: PropTypes.number,
	pagesCount: PropTypes.number,
	sidebarOpen: PropTypes.bool,
	enableZoomOut: PropTypes.bool,
	enableZoomIn: PropTypes.bool,
	enableZoomReset: PropTypes.bool,
	enableNavigateBack: PropTypes.bool,
	enableNavigateToPreviousPage: PropTypes.bool,
	enableNavigateToNextPage: PropTypes.bool,
	appearancePopup: PropTypes.bool,
	findPopupOpen: PropTypes.bool,
	readOnly: PropTypes.bool,
	usePhysicalPageNumbers: PropTypes.bool,
	showContextPaneToggle: PropTypes.bool,
	stackedView: PropTypes.bool,
	tool: PropTypes.shape({
		type: PropTypes.string,
		color: PropTypes.string
	}),
	onToggleSidebar: PropTypes.func,
	onZoomOut: PropTypes.func,
	onZoomIn: PropTypes.func,
	onZoomReset: PropTypes.func,
	onToggleAppearancePopup: PropTypes.func,
	onNavigateBack: PropTypes.func,
	onNavigateToPreviousPage: PropTypes.func,
	onNavigateToNextPage: PropTypes.func,
	onChangePageNumber: PropTypes.func,
	onChangeTool: PropTypes.func,
	onOpenColorContextMenu: PropTypes.func,
	onToggleFind: PropTypes.func,
	onToggleContextPane: PropTypes.func
};

export default Toolbar;
