/**
 * An abstract implementation of a view that can be dragged by the user. You should not use this view directly; rather,
 * subclass it and create the content you wish to be dragged in createDom.
 *
 * The view will fire DraggableView.Event events on various actions; the event types are defined by DraggableView.EventType.
 *
 * Any view that wishes to have DraggableViews dropped upon it must implement the DraggableView.DropTarget interface.
 *
 * FEATURES STILL NEEDING TO BE IMPLEMENTED:
 *  - Animate drag handle back to element position when drag ends but no drop.
 */

goog.provide('org.riceapps.views.DraggableView');
goog.provide('org.riceapps.views.DraggableView.DropTarget');
goog.provide('org.riceapps.views.DraggableView.Event');
goog.provide('org.riceapps.views.DraggableView.EventType');

goog.require('goog.array');
goog.require('goog.asserts');
goog.require('goog.dom');
goog.require('goog.dom.TagName');
goog.require('goog.dom.classlist');
goog.require('goog.events.BrowserEvent');
goog.require('goog.events.Event');
goog.require('goog.events.EventType');
goog.require('goog.fx.Dragger');  // for goog.fx.Dragger.cloneNode
goog.require('goog.math.Coordinate');
goog.require('goog.math.Size');
goog.require('goog.style');
goog.require('org.riceapps.utils.DomUtils');
goog.require('org.riceapps.views.View');

goog.scope(function() {
var DomUtils = org.riceapps.utils.DomUtils;



/**
 * @extends {org.riceapps.views.View}
 * @constructor
 */
org.riceapps.views.DraggableView = function() {
  goog.base(this);

  /** @private {boolean} */
  this.isBeingDragged_ = false;

  /** @private {Element} */
  this.dragTooltip_ = null;

  /** @private {goog.math.Coordinate} */
  this.dragTooltipPosition_ = null;

  /** @private {goog.math.Coordinate} */
  this.pageScroll_ = null;

  /** @private {!Array.<!DraggableView.DropTarget>} */
  this.targets_ = [];

  /** @private {DraggableView.DropTarget} */
  this.lastTarget_ = null;

  /** @private {goog.math.Coordinate} */
  this.dragStartCoordinate_ = null;

  /** @private {!Element} */
  this.dropIndicatorElement_ = goog.dom.createDom(goog.dom.TagName.DIV, 'mouse-pointer-focus');

  /** @private {boolean} */
  this.isDraggable_ = true;

  /** @private {boolean} */
  this.hasListeners_ = false;
};
goog.inherits(org.riceapps.views.DraggableView,
              org.riceapps.views.View);
var DraggableView = org.riceapps.views.DraggableView;



/**
 * Represents an item on which DraggableViews can be dropped.
 * @interface
 */
DraggableView.DropTarget = function() {};


/**
 * Returns the container elements that represent the drop target. The user may drop an item on any of these containers
 * (or on any of the elements contained within them).
 * @return {!Array.<!Element>}
 */
DraggableView.DropTarget.prototype.getDropContainers = function() {};


/**
 * Event handler; called when an item is dropped on the target.
 * @param {!DraggableView} item
 */
DraggableView.DropTarget.prototype.drop = function(item) {};


/**
 * Event handler; called when an item is first dragged over the target.
 * @param {!DraggableView} item
 */
DraggableView.DropTarget.prototype.dragEnter = function(item) {};


/**
 * Event handler; called when an item is no longer being dragged over the target.
 * @param {!DraggableView} item
 */
DraggableView.DropTarget.prototype.dragLeave = function(item) {};


/**
 * Bounding size for generated tooltips; the tooltip will be scaled down to fit within a box of this size.
 * @const {!goog.math.Size}
 */
DraggableView.TOOLTIP_BOUND = new goog.math.Size(250, 250);


/**
 * When the user drags an element within this many pixels of the edge of the screen, a scroll should be triggered.
 * @const {number}
 */
DraggableView.SCROLL_TRIGGER_DISTANCE = 100;


/**
 * Enumerates the types of events dispatched by DraggableView.
 * @enum {string}
 */
DraggableView.EventType = {
  DRAGSTART: 'draggable_view_' + goog.events.EventType.DRAGSTART,
  DRAGEND: 'draggable_view_' + goog.events.EventType.DRAGEND,
  DRAGENTER: 'draggable_view_' + goog.events.EventType.DRAGENTER,
  DRAGLEAVE: 'draggable_view_' + goog.events.EventType.DRAGLEAVE,
  DROP: 'draggable_view_' + goog.events.EventType.DROP,
  CLICK: 'draggable_view_' + goog.events.EventType.CLICK,
  DROPPED: 'draggable_view_dropped'
};


/**
 * Registers a drop target.
 * @param {!DraggableView.DropTarget} target
 */
DraggableView.prototype.addDropTarget = function(target) {
  this.targets_.push(target);
};


/**
 * Unregisters a drop target.
 * @param {!DraggableView.DropTarget} target
 */
DraggableView.prototype.removeDropTarget = function(target) {
  goog.array.remove(this.targets_, target);
};


/**
 * @return {boolean} Whether or not the view is currently draggable.
 */
DraggableView.prototype.isDraggable = function() {
  return this.isDraggable_;
};


/**
 * Sets whether or not the view should be draggable.
 * @param {boolean} isDraggable
 */
DraggableView.prototype.setDraggable = function(isDraggable) {
  if (isDraggable) {
    this.installListeners_();
  } else {
    this.uninstallListeners_();
  }

  this.isDraggable_ = isDraggable;
};


/**
 * Returns the element that will be shown beneath the mouse cursoe when dragging.
 * The returned element should not already be in the DOM tree.
 * The default implementation returns a scaled-down copy of the view's element. Override if neccesary.
 * @return {!Element}
 */
DraggableView.prototype.getDragTooltip = function() {
  return this.makeTooltipFromElement(this.getElementStrict());
};


/**
 * Creates a tooltip from the given (rendered) element by cloning it, scaling it down to fit in the TOOLTIP_BOUNDs,
 * and applying special effects (opacity, shadow, z-index, etc.). The returned element is not in the DOM tree.
 * @param {!Element} originalElement
 * @return {!Element}
 */
DraggableView.prototype.makeTooltipFromElement = function(originalElement) {
  var element = goog.fx.Dragger.cloneNode(originalElement);
  var size = DomUtils.getComputedInnerSize(originalElement);
  var scaleX = DraggableView.TOOLTIP_BOUND.width / size.width;
  var scaleY = DraggableView.TOOLTIP_BOUND.height / size.height;
  var scale = Math.min(Math.min(scaleX, scaleY), 1.0);

  goog.style.setStyle(element, {
    'transform': 'scale(' + scale + ', ' + scale + ')',
    'transform-origin': '0 0',
    'opacity': '0.7',
    'position': 'absolute',
    'top': '0px',
    'left': '0px',
    'box-shadow': '0px 0px 50px #000',
    'z-index': '10',
    'width': size.width + 'px',
    'height': size.height + 'px'
  });

  return element;
};


/**
 * Recursively clones a DOM node.
 * @param {!Element} originalElement To be cloned
 * @return {!Element} Cloned element (not in the DOM tree)
 */
DraggableView.prototype.cloneElement = function(originalElement) {
  return goog.fx.Dragger.cloneNode(originalElement);
};


/**
 * @override
 */
DraggableView.prototype.createDom = function() {
  goog.base(this, 'createDom');

  goog.style.setStyle(this.getElement(), {
    'cursor': '-webkit-grab'
  });
};


/**
 * @override
 */
DraggableView.prototype.enterDocument = function() {
  goog.base(this, 'enterDocument');

  goog.dom.appendChild(document.body, this.dropIndicatorElement_);
  goog.style.setElementShown(this.dropIndicatorElement_, false);

  this.installListeners_();
};


/**
 * @override
 */
DraggableView.prototype.exitDocument = function() {
  goog.base(this, 'exitDocument');

  goog.dom.removeNode(this.dropIndicatorElement_);

  if (this.isBeingDragged_) {
    this.stopDragging_();
  }

  this.uninstallListeners_();
};


/**
 * Adds the event listeners required for the view to be draggable.
 * Has no effect if those event listeners are present already.
 * @private
 */
DraggableView.prototype.installListeners_ = function() {
  if (this.hasListeners_) {
    return;
  }

  this.hasListeners_ = true;
  this.getHandler().
      listen(this.getElement(), goog.events.EventType.MOUSEDOWN, this.handleMouseDown_).
      listen(this.getElement(), goog.events.EventType.CLICK, this.handleMouseClick_).
      listen(this.getElement(), goog.events.EventType.DRAGSTART, this.handleDragStart_).
      listen(this.getElement(), goog.events.EventType.TOUCHSTART, this.handleTouchEvent_).
      listen(this.getElement(), goog.events.EventType.TOUCHEND, this.handleTouchEvent_).
      listen(this.getElement(), goog.events.EventType.TOUCHMOVE, this.handleTouchEvent_).
      listen(this.getElement(), goog.events.EventType.TOUCHCANCEL, this.handleTouchEvent_);
};


/**
 * Removes the event listeners required for the view to be draggable.
 * Has no effect if those event listeners are not present.
 * @private
 */
DraggableView.prototype.uninstallListeners_ = function() {
  if (!this.hasListeners_) {
    return;
  }

  this.hasListeners_ = false;
  this.getHandler().
      unlisten(this.getElement(), goog.events.EventType.MOUSEDOWN, this.handleMouseDown_).
      unlisten(this.getElement(), goog.events.EventType.CLICK, this.handleMouseClick_).
      unlisten(this.getElement(), goog.events.EventType.DRAGSTART, this.handleDragStart_).
      unlisten(this.getElement(), goog.events.EventType.TOUCHSTART, this.handleTouchEvent_).
      unlisten(this.getElement(), goog.events.EventType.TOUCHEND, this.handleTouchEvent_).
      unlisten(this.getElement(), goog.events.EventType.TOUCHMOVE, this.handleTouchEvent_).
      unlisten(this.getElement(), goog.events.EventType.TOUCHCANCEL, this.handleTouchEvent_);
};


/**
 * Event handler; captures touch events and re-dispatches them as mouse events to provide
 * rudimentry support for dragging and dropping on touch screens.
 * @param {!goog.events.BrowserEvent} event Original mouse event.
 * @private
 * @suppress {visibility}
 */
DraggableView.prototype.handleTouchEvent_ = function(event) {
  var touch = event.event_.changedTouches[0];
  var touchTarget = document.elementFromPoint(touch.clientX, touch.clientY);
  var types = {};
  types[goog.events.EventType.TOUCHSTART] = goog.events.EventType.MOUSEDOWN;
  types[goog.events.EventType.TOUCHMOVE] = goog.events.EventType.MOUSEMOVE;
  types[goog.events.EventType.TOUCHEND] = goog.events.EventType.MOUSEUP;
  types[goog.events.EventType.TOUCHCANCEL] = goog.events.EventType.MOUSEUP;

  // Create a simulated mouse event.
  var simulatedEvent = document.createEvent('MouseEvent');
  simulatedEvent.initMouseEvent(
      /* type= */ types[event.type],
      /* canBubble= */ true,
      /* cancelable= */ true,
      /* view= */ window,
      /* detail= */ 1,
      /* screenX = */ touch.screenX,
      /* screenY= */ touch.screenY,
      /* clientX= */ touch.clientX - (this.pageScroll_ ? this.pageScroll_.x : 0),
      /* clientY= */ touch.clientY - (this.pageScroll_ ? this.pageScroll_.y : 0),
      /* ctrlKey= */ false,
      /* altKey= */false,
      /* shiftKey= */false,
      /* metaKey= */false,
      /* button= */ 0,
      /* relatedTarget= */ null);

  if (event.type == goog.events.EventType.TOUCHSTART || touchTarget == null) {
    // TOUCHSTART (MOUSEDOWN) should be dispatched from the triggering element.
    touch.target.dispatchEvent(simulatedEvent);
  } else {
    // All other events should be dispatched from element being hovered over.
    touchTarget.dispatchEvent(simulatedEvent);
  }

  event.preventDefault();
};


/**
 * Event handler; called when user releases mouse button.
 * @param {!goog.events.BrowserEvent} event
 * @private
 */
DraggableView.prototype.handleMouseUp_ = function(event) {
  event.preventDefault();
  this.debugLog_('handleMouseUp_', event);
  this.stopDragging_(event);
};


/**
 * Event handler; called when user clicks on the view.
 * @param {!goog.events.BrowserEvent} event
 * @suppress {invalidCasts}
 * @private
 */
DraggableView.prototype.handleMouseClick_ = function(event) {
  this.debugLog_('handleMouseClick_', event);
  event.preventDefault();

  if (this.isBeingDragged_) {
    this.stopDragging_(event);
  } else if (this.dragStartCoordinate_) {
    this.debugLog_('self.dispatch.click');
    this.stopDragging_(event);
    event.target = /** @type {Node} */ (this);
    event.type = DraggableView.EventType.CLICK;
    this.dispatchEvent(event);
  }
};


/**
 * Event handler; called when user presses mouse button down over view.
 * @param {!goog.events.BrowserEvent} event
 * @private
 */
DraggableView.prototype.handleMouseDown_ = function(event) {
  if (event.button != 0) {
    return;
  }

  this.debugLog_('handleMouseDown_', event);
  event.preventDefault();

  if (this.dragStartCoordinate_ == null) {
    this.debugLog_('initializeMaybeStartDrag_');
    this.dragStartCoordinate_ = new goog.math.Coordinate(event.clientX, event.clientY);
    this.getHandler().listen(window, goog.events.EventType.MOUSEMOVE, this.maybeStartDrag_);
  }
};


/**
 * Called after a mouse down but before entering drag mode; should be called repeatedly during this stage.
 * Triggers entrance into drag mode after the mouse has moved > 15px from original point where button was pressed.
 * @param {!goog.events.BrowserEvent} event
 * @private
 */
DraggableView.prototype.maybeStartDrag_ = function(event) {
  this.debugLog_('maybeStartDrag_', event);
  var position = new goog.math.Coordinate(event.clientX, event.clientY);

  // Cast the coordinate to tell the compiler that it will never be null here.
  if (!this.dragStartCoordinate_)
    throw Error();

  if (goog.math.Coordinate.distance(position, this.dragStartCoordinate_) > 15 &&
      !this.isBeingDragged_) {
    this.startDragging_(position);
  }
};


/**
 * Event handler; called by native DRAGSTART event.
 * @param {!goog.events.BrowserEvent} event
 * @private
 */
DraggableView.prototype.handleDragStart_ = function(event) {
  this.debugLog_('handleDragStart_', event);

  // Eliminate this event.
  event.preventDefault();
  event.stopPropagation();
};


/**
 * Called when in drag mode and the view is being dragged over a drop target.
 * Triggers the dragEnter and dragLeave events on that target.
 * @param {org.riceapps.views.DraggableView.DropTarget} target
 * @private
 */
DraggableView.prototype.dragOver_ = function(target) {
  if (target === this.lastTarget_) {
    return;
  }

  if (this.lastTarget_) {
    this.debugLog_('dispatch.target.dragout', this.lastTarget_);
    this.lastTarget_.dragLeave(this);
  }

  if (target) {
    this.debugLog_('dispatch.target.dragenter', target);
    target.dragEnter(this);
  }

  if (target) {
    this.startMouseInTargetAnimation_();
  } else {
    this.stopMouseInTargetAnimation_();
  }

  this.lastTarget_ = target;
};


/**
 * @param {!org.riceapps.views.DraggableView.DropTarget} target
 * @param {!Element} element
 * @return {boolean} Whether or not the given drop target contains the provided element
 * @private
 */
DraggableView.prototype.targetContainsElement_ = function(target, element) {
  var elements = target.getDropContainers();

  for (var i = 0; i < elements.length; i++) {
    if (goog.dom.contains(elements[i], element)) {
      return true;
    }
  }

  return false;
};


/**
 * Event handler; called when mouse moves while in drag mode.
 * @param {!goog.events.BrowserEvent} event
 * @private
 */
DraggableView.prototype.handleMouseMove_ = function(event) {
  var i;

  // Check for drag enters and drag exits.
  for (i = 0; i < this.targets_.length; i++) {
    if (this.targetContainsElement_(this.targets_[i], /** @type {!Element} */ (event.target))) {
      this.dragOver_(this.targets_[i]);
      break;
    }
  }

  if (i == this.targets_.length) {
    this.dragOver_(null);
  }

  // Reposition the tooltip.
  this.moveDragTooltipTo_(new goog.math.Coordinate(event.clientX, event.clientY));
};


/**
 * @param {!goog.events.BrowserEvent} event
 * @private
 */
DraggableView.prototype.handleMouseOut_ = function(event) {
  if (!event.relatedTarget || event.relatedTarget.tagName == goog.dom.TagName.HTML) {
    this.debugLog_('handleMouseOut_', event);
    this.stopDragging_();
  }
};


/**
 * @param {goog.events.BrowserEvent} event
 * @private
 */
DraggableView.prototype.handleWindowBlur_ = function(event) {
  this.debugLog_('handleWindowBlur_', event);
  this.stopDragging_();
};


/**
 * @param {goog.events.BrowserEvent=} opt_event
 * @private
 */
DraggableView.prototype.handleScroll_ = function(opt_event) {
  this.debugLog_('handleScroll_', opt_event);
  this.pageScroll_ = goog.dom.getDomHelper().getDocumentScroll();

  if (!this.dragTooltipPosition_)
    throw Error();

  this.moveDragTooltipTo_(this.dragTooltipPosition_);
};


/**
 * @param {!goog.math.Coordinate} position
 * @private
 */
DraggableView.prototype.moveDragTooltipTo_ = function(position) {
  var viewport = goog.dom.getViewportSize();

  if (!this.dragTooltip_) // Verify that dragTooltip is non-null for the type checker
    throw new Error();

  var tooltip = goog.style.getTransformedSize(this.dragTooltip_);

  // Calculate the real coordinates (origin of viewpoint + position within viewport).
  var real_x = this.pageScroll_.x + position.x;
  var real_y = this.pageScroll_.y + position.y;

  goog.style.setPosition(this.dropIndicatorElement_, real_x - 5, real_y - 5);

  // Bound within the document.
  if (real_x < 30) {
    real_x = 30;
  } else if (real_x > DomUtils.getDocumentWidth() - 30 - tooltip.width) {
    real_x = DomUtils.getDocumentWidth() - 30 - tooltip.width;
  }

  // Bound within the document.
  if (real_y < 30) {
    real_y = 30;
  } else if (real_y > DomUtils.getDocumentHeight() - 30 - tooltip.height) {
    real_y = DomUtils.getDocumentHeight() - 30 - tooltip.height;
  }

  goog.style.setPosition(this.dragTooltip_, real_x, real_y);
  this.dragTooltipPosition_ = position;

  /*/ Debug text.
  window.console.log('====== EVENT FIRED ======');
  window.console.log('document=', {
    width: DomUtils.getDocumentWidth(),
    height: DomUtils.getDocumentHeight()
  });
  window.console.log('viewport=', viewport);
  window.console.log('scroll=', this.pageScroll_);
  window.console.log('position=', position);
  window.console.log('draw_at=', {x: real_x, y: real_y});*/

  // Determine whether or not the new tooltip position should trigger a page scroll.
  var newScroll = {
    x: this.pageScroll_.x,
    y: this.pageScroll_.y
  };

  // Scroll Horizontally: RIGHT
  if (position.x + tooltip.width + DraggableView.SCROLL_TRIGGER_DISTANCE > this.pageScroll_.x + viewport.width) {
    newScroll.x = this.pageScroll_.x + (DraggableView.SCROLL_TRIGGER_DISTANCE - (viewport.width - position.x));
  }

  // Scroll Horizontally: LEFT
  else if (position.x - DraggableView.SCROLL_TRIGGER_DISTANCE < this.pageScroll_.x) {
    newScroll.x = this.pageScroll_.x - (DraggableView.SCROLL_TRIGGER_DISTANCE - position.x);
  }

  // Scroll Vertically: DOWN
  if (viewport.height - position.y < DraggableView.SCROLL_TRIGGER_DISTANCE) {
    //newScroll.y = this.pageScroll_.y + (DraggableView.SCROLL_TRIGGER_DISTANCE - (viewport.height - position.y));
    newScroll.y = this.pageScroll_.y + 30;
  }

  // Scroll Vertically: UP
  else if (position.y < DraggableView.SCROLL_TRIGGER_DISTANCE) {
    //newScroll.y = this.pageScroll_.y - (DraggableView.SCROLL_TRIGGER_DISTANCE - position.y);
    newScroll.y = this.pageScroll_.y - 30;
  }

  // Apply any changes to scroll location.
  if (newScroll.x != this.pageScroll_.x || newScroll.y != this.pageScroll_.y) {
    DomUtils.setDocumentScrollLocation(newScroll.x, newScroll.y);
  }
};


/**
 * @param {goog.events.BrowserEvent} event
 * @return {DraggableView.DropTarget}
 * @private
 */
DraggableView.prototype.maybeDrop_ = function(event) {
  this.debugLog_('maybeDrop_', event);

  for (var i = 0; i < this.targets_.length; i++) {
    if (this.targetContainsElement_(this.targets_[i], /** @type {!Element} */ (event.target))) {
      return this.targets_[i];
      break;
    }
  }

  return null;
};


/**
 * @param {!org.riceapps.views.DraggableView.DropTarget} target
 * @private
 */
DraggableView.prototype.drop_ = function(target) {
  this.debugLog_('drop_', target);
  target.drop(this);
  var event = new DraggableView.Event(DraggableView.EventType.DROPPED);
  event.dropTarget = target;
  this.dispatchEvent(event);
};


/**
 * @param {goog.events.BrowserEvent} event
 * @private
 */
DraggableView.prototype.onMouseEnterTarget_ = function(event) {
  this.debugLog_('onMouseEnterTarget_', event);
};


/**
 * @param {goog.events.BrowserEvent} event
 * @private
 */
DraggableView.prototype.onMouseLeaveTarget_ = function(event) {
  this.debugLog_('onMouseLeaveTarget_', event);
};


/**
 * @private
 */
DraggableView.prototype.clearMaybeDrag_ = function() {
  this.debugLog_('clearMaybeDrag_');
  this.getHandler().unlisten(window, goog.events.EventType.MOUSEMOVE, this.maybeStartDrag_);
  this.dragStartCoordinate_ = null;
};


/**
 * @private
 */
DraggableView.prototype.startMouseInTargetAnimation_ = function() {
  window.console.log('DraggableView.startMouseInTargetAnimation_');
  goog.style.setElementShown(this.dropIndicatorElement_, true);
};


/**
 * @private
 */
DraggableView.prototype.stopMouseInTargetAnimation_ = function() {
  window.console.log('DraggableView.stopMouseInTargetAnimation_');
  goog.style.setElementShown(this.dropIndicatorElement_, false);
};


/**
 * @param {goog.math.Coordinate} initialPosition
 * @private
 */
DraggableView.prototype.startDragging_ = function(initialPosition) {
  this.debugLog_('startDragging_');
  this.clearMaybeDrag_();

  if (!this.isDraggable_) {
    return;
  }

  this.isBeingDragged_ = true;
  this.dragTooltip_ = this.getDragTooltip();
  this.pageScroll_ = goog.dom.getDomHelper().getDocumentScroll();
  goog.dom.appendChild(document.body, this.dragTooltip_);

  var styles = {
    'cursor': '-webkit-grabbing'
  };
  goog.style.setStyle(document.body, styles);
  goog.style.setStyle(this.dragTooltip_, styles);
  goog.style.setStyle(this.getElement(), styles);

  if (initialPosition) {
    this.moveDragTooltipTo_(initialPosition);
  }

  this.getHandler().
      listen(document, goog.events.EventType.MOUSEUP, this.handleMouseUp_).
      listen(window, goog.events.EventType.MOUSEMOVE, this.handleMouseMove_).
      listen(document, goog.events.EventType.MOUSEOUT, this.handleMouseOut_).
      listen(window, goog.events.EventType.BLUR, this.handleWindowBlur_).
      listen(window, goog.events.EventType.SCROLL, this.handleScroll_);

  this.dispatchEvent(new goog.events.Event(DraggableView.EventType.DRAGSTART));
  this.debugLog_('dispatch.self.dragStart');
};


/**
 * @param {goog.events.BrowserEvent=} opt_event
 * @private
 */
DraggableView.prototype.stopDragging_ = function(opt_event) {
  this.debugLog_('stopDragging_');
  if (!this.isBeingDragged_) {
    this.clearMaybeDrag_();
    return;
  }

  goog.dom.removeNode(this.dragTooltip_);
  this.isBeingDragged_ = false;
  this.dragTooltip_ = null;
  this.dragTooltipPosition_ = null;
  this.pageScroll_ = null;
  this.dragStartCoordinate_ = null;
  this.dragOver_(null);

  goog.style.setStyle(document.body, {
    'cursor': 'auto'
  });

  goog.style.setStyle(this.getElement(), {
    'cursor': '-webkit-grab'
  });

  this.getHandler().
      unlisten(document, goog.events.EventType.MOUSEUP, this.handleMouseUp_).
      unlisten(window, goog.events.EventType.MOUSEMOVE, this.handleMouseMove_).
      unlisten(document, goog.events.EventType.MOUSEOUT, this.handleMouseOut_).
      unlisten(window, goog.events.EventType.BLUR, this.handleWindowBlur_).
      unlisten(window, goog.events.EventType.SCROLL, this.handleScroll_);

  this.debugLog_('dispatch.self.dragEnd');

  var target = null;
  if (opt_event) {
    target = this.maybeDrop_(opt_event);
  }

  this.dispatchEvent(new goog.events.Event(DraggableView.EventType.DRAGEND));

  if (target) {
    this.drop_(target);
  }
};


/**
 * @return {boolean}
 */
DraggableView.prototype.isBeingDragged = function() {
  return this.isBeingDragged_;
};


/**
 * @param {...*} var_args
 * @private
 */
DraggableView.prototype.debugLog_ = function(var_args) {
  //window.console.log('[DraggableView] @' + goog.getUid(this), arguments);
};



/**
 * @param {DraggableView.EventType} type
 * @extends {goog.events.Event}
 * @constructor
 */
DraggableView.Event = function(type) {
  goog.base(this, type);

  /** @type {DraggableView.DropTarget} */
  this.dropTarget = null;
};
goog.inherits(DraggableView.Event,
              goog.events.Event);

}); // goog.scope
