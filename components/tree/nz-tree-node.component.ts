import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Host,
  HostListener,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Optional,
  Output,
  Renderer2,
  TemplateRef,
  ViewChild
} from '@angular/core';
import { fromEvent, Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { collapseMotion } from '../core/animation/collapse';
import { NzNoAnimationDirective } from '../core/no-animation/nz-no-animation.directive';
import { InputBoolean } from '../core/util/convert';
import { NzFormatBeforeDropEvent, NzFormatEmitEvent } from '../tree/interface';
import { NzTreeBaseService } from './nz-tree-base.service';
import { NzTreeNode } from './nz-tree-node';
import { isCheckDisabled } from './nz-tree-util';

@Component({
  selector           : 'nz-tree-node',
  templateUrl        : './nz-tree-node.component.html',
  changeDetection    : ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: false,
  animations         : [ collapseMotion ]
})

export class NzTreeNodeComponent implements OnInit, OnChanges, OnDestroy {
  @ViewChild('dragElement') dragElement: ElementRef;

  @Input() @InputBoolean() nzShowLine: boolean;
  @Input() @InputBoolean() nzShowExpand: boolean;
  @Input() @InputBoolean() nzMultiple: boolean;
  @Input() @InputBoolean() nzCheckable: boolean;
  @Input() @InputBoolean() nzAsyncData: boolean;
  @Input() @InputBoolean() nzCheckStrictly: boolean;
  @Input() @InputBoolean() nzHideUnMatched = false;
  @Input() @InputBoolean() nzNoAnimation = false;
  @Input() @InputBoolean() nzSelectMode = false;
  @Input() @InputBoolean() nzShowIcon = false;
  @Input() nzTreeTemplate: TemplateRef<void>;
  @Input() nzBeforeDrop: (confirm: NzFormatBeforeDropEvent) => Observable<boolean>;

  @Input()
  set nzTreeNode(value: NzTreeNode) {
    // add to checked list & selected list
    if (value.isChecked) {
      this.nzTreeService.setCheckedNodeList(value);
    }
    // add select list
    if (value.isSelected) {
      value.setSelected(true, this.nzMultiple);
    }
    if (!value.isLeaf) {
      this.nzTreeService.setExpandedNodeList(value);
    }
    this._nzTreeNode = value;
  }

  get nzTreeNode(): NzTreeNode {
    return this._nzTreeNode;
  }

  @Input()
  set nzDraggable(value: boolean) {
    this._nzDraggable = value;
    this.handDragEvent();
  }

  get nzDraggable(): boolean {
    return this._nzDraggable;
  }

  /**
   * @deprecated use
   * nzExpandAll instead
   */
  @Input()
  set nzDefaultExpandAll(value: boolean) {
    this._nzExpandAll = value;
    if (value && this.nzTreeNode && !this.nzTreeNode.isLeaf) {
      this.nzTreeNode.setExpanded(true);
    }
  }

  get nzDefaultExpandAll(): boolean {
    return this._nzExpandAll;
  }

  // default set
  @Input()
  set nzExpandAll(value: boolean) {
    this._nzExpandAll = value;
    if (value && this.nzTreeNode && !this.nzTreeNode.isLeaf) {
      this.nzTreeNode.setExpanded(true);
    }
  }

  get nzExpandAll(): boolean {
    return this._nzExpandAll;
  }

  @Input()
  set nzSearchValue(value: string) {
    this.highlightKeys = [];
    if (value && this.nzTreeNode.title.includes(value)) {
      // match the search value
      const index = this.nzTreeNode.title.indexOf(value);
      this.highlightKeys.push(this.nzTreeNode.title.slice(0, index));
      this.highlightKeys.push(this.nzTreeNode.title.slice(index + value.length, this.nzTreeNode.title.length));
    }
    this._searchValue = value;
  }

  get nzSearchValue(): string {
    return this._searchValue;
  }

  // Output
  @Output() readonly clickNode: EventEmitter<NzFormatEmitEvent> = new EventEmitter();
  @Output() readonly dblClick: EventEmitter<NzFormatEmitEvent> = new EventEmitter();
  @Output() readonly contextMenu: EventEmitter<NzFormatEmitEvent> = new EventEmitter();
  @Output() readonly clickCheckBox: EventEmitter<NzFormatEmitEvent> = new EventEmitter();
  @Output() readonly clickExpand: EventEmitter<NzFormatEmitEvent> = new EventEmitter();
  @Output() readonly nzDragStart: EventEmitter<NzFormatEmitEvent> = new EventEmitter();
  @Output() readonly nzDragEnter: EventEmitter<NzFormatEmitEvent> = new EventEmitter();
  @Output() readonly nzDragOver: EventEmitter<NzFormatEmitEvent> = new EventEmitter();
  @Output() readonly nzDragLeave: EventEmitter<NzFormatEmitEvent> = new EventEmitter();
  @Output() readonly nzDrop: EventEmitter<NzFormatEmitEvent> = new EventEmitter();
  @Output() readonly nzDragEnd: EventEmitter<NzFormatEmitEvent> = new EventEmitter();

  // default var
  prefixCls = 'ant-tree';
  highlightKeys = [];
  nzNodeClass = {};
  nzNodeSwitcherClass = {};
  nzNodeContentClass = {};
  nzNodeCheckboxClass = {};
  nzNodeContentIconClass = {};
  nzNodeContentLoadingClass = {};

  /**
   * drag var
   */
  destroy$ = new Subject();
  dragPos = 2;
  dragPosClass: object = {
    '0' : 'drag-over',
    '1' : 'drag-over-gap-bottom',
    '-1': 'drag-over-gap-top'
  };

  /**
   * default set
   */
  _nzTreeNode: NzTreeNode;
  _searchValue = '';
  _nzExpandAll = false;
  _nzDraggable = false;
  oldAPIIcon = true;

  get nzIcon(): string {
    if (this.nzTreeNode && this.nzTreeNode.origin.icon) {
      this.oldAPIIcon = this.nzTreeNode.origin.icon.indexOf('anticon') > -1;
    }
    return this.nzTreeNode && this.nzTreeNode.origin.icon;
  }

  get canDraggable(): boolean | null {
    return (this.nzDraggable && this.nzTreeNode && !this.nzTreeNode.isDisabled) ? true : null;
  }

  get isShowLineIcon(): boolean {
    return !this.nzTreeNode.isLeaf && this.nzShowLine;
  }

  get isShowSwitchIcon(): boolean {
    return !this.nzTreeNode.isLeaf && !this.nzShowLine;
  }

  get isSwitcherOpen(): boolean {
    return (this.nzTreeNode.isExpanded && !this.nzTreeNode.isLeaf);
  }

  get isSwitcherClose(): boolean {
    return (!this.nzTreeNode.isExpanded && !this.nzTreeNode.isLeaf);
  }

  get displayStyle(): string {
    // to hide unmatched nodes
    return (this.nzSearchValue && this.nzHideUnMatched && !this.nzTreeNode.isMatched && !this.nzTreeNode.isExpanded) ? 'none' : '';
  }

  trackByFn = (_index: number, item: NzTreeNode) => {
    return item.key;
  }

  /**
   * reset node class
   */
  setClassMap(): void {
    this.prefixCls = this.nzSelectMode ? 'ant-select-tree' : 'ant-tree';
    this.nzNodeClass = {
      [ `${this.prefixCls}-treenode-disabled` ]              : this.nzTreeNode.isDisabled,
      [ `${this.prefixCls}-treenode-switcher-open` ]         : this.isSwitcherOpen,
      [ `${this.prefixCls}-treenode-switcher-close` ]        : this.isSwitcherClose,
      [ `${this.prefixCls}-treenode-checkbox-checked` ]      : this.nzTreeNode.isChecked,
      [ `${this.prefixCls}-treenode-checkbox-indeterminate` ]: this.nzTreeNode.isHalfChecked,
      [ `${this.prefixCls}-treenode-selected` ]              : this.nzTreeNode.isSelected,
      [ `${this.prefixCls}-treenode-loading` ]               : this.nzTreeNode.isLoading
    };
    this.nzNodeSwitcherClass = {
      [ `${this.prefixCls}-switcher` ]      : true,
      [ `${this.prefixCls}-switcher-noop` ] : this.nzTreeNode.isLeaf,
      [ `${this.prefixCls}-switcher_open` ] : this.isSwitcherOpen,
      [ `${this.prefixCls}-switcher_close` ]: this.isSwitcherClose
    };

    this.nzNodeCheckboxClass = {
      [ `${this.prefixCls}-checkbox` ]              : true,
      [ `${this.prefixCls}-checkbox-checked` ]      : this.nzTreeNode.isChecked,
      [ `${this.prefixCls}-checkbox-indeterminate` ]: this.nzTreeNode.isHalfChecked,
      [ `${this.prefixCls}-checkbox-disabled` ]     : this.nzTreeNode.isDisabled || this.nzTreeNode.isDisableCheckbox
    };

    this.nzNodeContentClass = {
      [ `${this.prefixCls}-node-content-wrapper` ]      : true,
      [ `${this.prefixCls}-node-content-wrapper-open` ] : this.isSwitcherOpen,
      [ `${this.prefixCls}-node-content-wrapper-close` ]: this.isSwitcherClose,
      [ `${this.prefixCls}-node-selected` ]             : this.nzTreeNode.isSelected
    };
    this.nzNodeContentIconClass = {
      [ `${this.prefixCls}-iconEle` ]        : true,
      [ `${this.prefixCls}-icon__customize` ]: true
    };
    this.nzNodeContentLoadingClass = {
      [ `${this.prefixCls}-iconEle` ]: true
    };
  }

  @HostListener('mousedown', [ '$event' ])
  onMousedown(event: MouseEvent): void {
    if (this.nzSelectMode) {
      event.preventDefault();
    }
  }

  /**
   * click node to select, 200ms to dbl click
   */
  @HostListener('click', [ '$event' ])
  nzClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.nzTreeNode.isSelectable) {
      this.nzTreeNode.setSelected(!this.nzTreeNode.isSelected, this.nzMultiple);
    }
    const clickEvent = this.nzTreeService.formatEvent('click', this.nzTreeNode, event);
    this.clickNode.emit(clickEvent);
    this.nzTreeService.$statusChange.next(clickEvent);
  }

  @HostListener('dblclick', [ '$event' ])
  nzDblClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dblClick.emit(this.nzTreeService.formatEvent('dblclick', this.nzTreeNode, event));
  }

  /**
   * @param event
   */
  @HostListener('contextmenu', [ '$event' ])
  nzContextMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenu.emit(this.nzTreeService.formatEvent('contextmenu', this.nzTreeNode, event));
  }

  /**
   * collapse node
   * @param event
   */
  _clickExpand(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.nzTreeNode.isLoading && !this.nzTreeNode.isLeaf) {
      // set async state
      if (this.nzAsyncData && this.nzTreeNode.getChildren().length === 0 && !this.nzTreeNode.isExpanded) {
        this.nzTreeNode.isLoading = true;
      }
      this.nzTreeNode.setExpanded(!this.nzTreeNode.isExpanded);
      const expandEvent = this.nzTreeService.formatEvent('expand', this.nzTreeNode, event);
      this.clickExpand.emit(expandEvent);
      // just affect self
      this.setClassMap();
    }
  }

  /**
   * check node
   * @param event
   */
  _clickCheckBox(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    // return if node is disabled
    if (isCheckDisabled(this.nzTreeNode)) {
      return;
    }
    this.nzTreeNode.setSyncChecked(!this.nzTreeNode.isChecked);
    const checkBoxChangeEvent = this.nzTreeService.formatEvent('check', this.nzTreeNode, event);
    this.clickCheckBox.emit(checkBoxChangeEvent);
    this.nzTreeService.$statusChange.next(checkBoxChangeEvent);
  }

  /**
   * drag event
   * @param e
   */
  clearDragClass(): void {
    const dragClass = [ 'drag-over-gap-top', 'drag-over-gap-bottom', 'drag-over' ];
    dragClass.forEach(e => {
      this.renderer.removeClass(this.dragElement.nativeElement, e);
    });
  }

  handleDragStart(e: DragEvent): void {
    e.stopPropagation();
    try {
      // ie throw error
      // firefox-need-it
      e.dataTransfer.setData('text/plain', '');
    } catch (error) {
      // empty
    }
    this.nzTreeService.setSelectedNode(this.nzTreeNode);
    this.nzTreeNode.setExpanded(false);
    this.nzDragStart.emit(this.nzTreeService.formatEvent('dragstart', null, e));
  }

  handleDragEnter(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    // reset position
    this.dragPos = 2;
    this.ngZone.run(() => {
      if ((this.nzTreeNode !== this.nzTreeService.getSelectedNode()) && !this.nzTreeNode.isLeaf) {
        this.nzTreeNode.setExpanded(true);
      }
    });
    const dragEnterEvent = this.nzTreeService.formatEvent('dragenter', this.nzTreeNode, e);
    this.nzDragEnter.emit(dragEnterEvent);
    this.nzTreeService.$statusChange.next(dragEnterEvent);
  }

  handleDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const dropPosition = this.nzTreeService.calcDropPosition(e);
    if (this.dragPos !== dropPosition) {
      this.clearDragClass();
      this.dragPos = dropPosition;
      // leaf node will pass
      if (!(this.dragPos === 0 && this.nzTreeNode.isLeaf)) {
        this.renderer.addClass(this.dragElement.nativeElement, this.dragPosClass[ this.dragPos ]);
      }
    }
    this.nzDragOver.emit(this.nzTreeService.formatEvent('dragover', this.nzTreeNode, e));
  }

  handleDragLeave(e: DragEvent): void {
    e.stopPropagation();
    this.ngZone.run(() => {
      this.clearDragClass();
    });
    this.nzDragLeave.emit(this.nzTreeService.formatEvent('dragleave', this.nzTreeNode, e));
  }

  handleDragDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.ngZone.run(() => {
      this.clearDragClass();
      if (this.nzTreeService.getSelectedNode() === this.nzTreeNode) {
        return;
      } else if (this.dragPos === 0 && this.nzTreeNode.isLeaf) {
        return;
      }
      // pass if node is leafNo
      const dropEvent = this.nzTreeService.formatEvent('drop', this.nzTreeNode, e);
      const dragEndEvent = this.nzTreeService.formatEvent('dragend', this.nzTreeNode, e);
      if (this.nzBeforeDrop) {
        this.nzBeforeDrop({
          dragNode: this.nzTreeService.getSelectedNode(),
          node    : this.nzTreeNode,
          pos     : this.dragPos
        }).subscribe((canDrop: boolean) => {
          if (canDrop) {
            this.nzTreeService.dropAndApply(this.nzTreeNode, this.dragPos);
          }
          this.nzDrop.emit(dropEvent);
          this.nzDragEnd.emit(dragEndEvent);
          this.nzTreeService.$statusChange.next(dropEvent);
        });
      } else if (this.nzTreeNode) {
        this.nzTreeService.dropAndApply(this.nzTreeNode, this.dragPos);
        this.nzDrop.emit(dropEvent);
        this.nzTreeService.$statusChange.next(dropEvent);
      }
    });
  }

  handleDragEnd(e: DragEvent): void {
    e.stopPropagation();
    this.ngZone.run(() => {
      // if user do not custom beforeDrop
      if (!this.nzBeforeDrop) {
        this.nzTreeService.setSelectedNode(null);
        const dragEndEvent = this.nzTreeService.formatEvent('dragend', this.nzTreeNode, e);
        this.nzDragEnd.emit(dragEndEvent);
      }
    });
  }

  /**
   * 监听拖拽事件
   */
  handDragEvent(): void {
    this.ngZone.runOutsideAngular(() => {
      if (this.nzDraggable) {
        this.destroy$ = new Subject();
        fromEvent<DragEvent>(this.elRef.nativeElement, 'dragstart').pipe(takeUntil(this.destroy$)).subscribe((e: DragEvent) => this.handleDragStart(e));
        fromEvent<DragEvent>(this.elRef.nativeElement, 'dragenter').pipe(takeUntil(this.destroy$)).subscribe((e: DragEvent) => this.handleDragEnter(e));
        fromEvent<DragEvent>(this.elRef.nativeElement, 'dragover').pipe(takeUntil(this.destroy$)).subscribe((e: DragEvent) => this.handleDragOver(e));
        fromEvent<DragEvent>(this.elRef.nativeElement, 'dragleave').pipe(takeUntil(this.destroy$)).subscribe((e: DragEvent) => this.handleDragLeave(e));
        fromEvent<DragEvent>(this.elRef.nativeElement, 'drop').pipe(takeUntil(this.destroy$)).subscribe((e: DragEvent) => this.handleDragDrop(e));
        fromEvent<DragEvent>(this.elRef.nativeElement, 'dragend').pipe(takeUntil(this.destroy$)).subscribe((e: DragEvent) => this.handleDragEnd(e));
      } else {
        this.destroy$.next();
        this.destroy$.complete();
      }
    });
  }

  markForCheck(): void {
    this.cdr.markForCheck();
  }

  constructor(
    private nzTreeService: NzTreeBaseService,
    private ngZone: NgZone,
    private renderer: Renderer2,
    private elRef: ElementRef,
    private cdr: ChangeDetectorRef,
    @Host() @Optional() public noAnimation?: NzNoAnimationDirective) {
  }

  ngOnInit(): void {
    this.setClassMap();
    // TODO
    this.nzTreeNode.setComponent(this);
    this.nzTreeService.statusChanged().pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.setClassMap();
      this.markForCheck();
    });
  }

  ngOnChanges(): void {
    this.setClassMap();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
